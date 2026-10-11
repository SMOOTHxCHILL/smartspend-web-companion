/*
 * Server-only: rebuilds the RAG embeddings for a set of merchants.
 *
 * Each transaction's embedding text includes its category, so after a
 * category change the chat would otherwise keep quoting the old one.
 * The text format matches scripts/generate-transaction-embeddings.mjs.
 */
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/embeddings";
const EMBEDDING_MODEL = "nvidia/nemotron-3-embed-1b";
const BATCH_SIZE = 20;

type MerchantJoin = { canonical_name: string; category: string } | null;

type TransactionRow = {
  id: number;
  bank: string;
  amount: number | string;
  type: "debit" | "credit";
  raw_merchant: string;
  transaction_date: string;
  merchants: MerchantJoin | MerchantJoin[];
};

function buildTransactionContent(transaction: TransactionRow) {
  const merchant = Array.isArray(transaction.merchants) ? transaction.merchants[0] : transaction.merchants;
  const merchantName = merchant?.canonical_name || transaction.raw_merchant || "Unknown merchant";
  const category = merchant?.category || "Uncategorized";
  const amount = Number(transaction.amount);
  const action = transaction.type === "credit" ? "Received" : "Spent";

  return [
    `${action} ₹${amount.toFixed(2)} at ${merchantName}.`,
    `Date: ${transaction.transaction_date}.`,
    `Category: ${category}.`,
    `Bank: ${transaction.bank}.`,
    `Type: ${transaction.type}.`,
  ].join(" ");
}

async function embed(texts: string[], apiKey: string): Promise<number[][]> {
  const response = await fetch(NVIDIA_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: texts,
      model: EMBEDDING_MODEL,
      input_type: "passage",
      embedding_type: "float",
      encoding_format: "float",
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`NVIDIA embedding request failed (${response.status}): ${JSON.stringify(data)}`);
  }

  return (data.data as Array<{ index: number; embedding: number[] }>)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

/** Returns how many transactions were re-embedded. */
export async function refreshEmbeddingsForMerchants(merchantIds: number[]): Promise<number> {
  if (merchantIds.length === 0) return 0;

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("Missing NVIDIA_API_KEY");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, bank, amount, type, raw_merchant, transaction_date, merchants ( canonical_name, category )")
    .in("merchant_id", merchantIds);

  if (error) throw new Error(`Could not load transactions to re-embed: ${error.message}`);

  const transactions = (data ?? []) as unknown as TransactionRow[];

  for (let start = 0; start < transactions.length; start += BATCH_SIZE) {
    const batch = transactions.slice(start, start + BATCH_SIZE);
    const contents = batch.map(buildTransactionContent);
    const embeddings = await embed(contents, apiKey);

    const { error: upsertError } = await supabase.from("transaction_embeddings").upsert(
      batch.map((transaction, index) => ({
        transaction_id: transaction.id,
        content: contents[index],
        embedding: embeddings[index],
      })),
      { onConflict: "transaction_id" },
    );

    if (upsertError) throw new Error(`Could not save embeddings: ${upsertError.message}`);
  }

  return transactions.length;
}
