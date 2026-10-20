/*
 * Server-only: (re)builds the RAG embeddings for transactions.
 *
 * Each transaction's embedding text includes its category, so after a
 * category change the chat would otherwise keep quoting the old one.
 * The text format matches scripts/generate-transaction-embeddings.mjs.
 *
 * Always pass the logged-in user's Supabase client: Row Level Security
 * then guarantees we only read and write that user's account.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/embeddings";
const EMBEDDING_MODEL = "nvidia/nemotron-3-embed-1b";
const BATCH_SIZE = 20;
const ID_CHUNK = 200; // keeps PostgREST URLs short

type MerchantJoin = { canonical_name: string; category: string } | null;

type TransactionRow = {
  id: number;
  account_id: string;
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
  const amount = Math.abs(Number(transaction.amount));
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

async function loadTransactions(
  supabase: SupabaseClient,
  column: "id" | "merchant_id",
  ids: number[],
): Promise<TransactionRow[]> {
  const rows: TransactionRow[] = [];
  for (let start = 0; start < ids.length; start += ID_CHUNK) {
    const { data, error } = await supabase
      .from("transactions")
      .select("id, account_id, bank, amount, type, raw_merchant, transaction_date, merchants ( canonical_name, category )")
      .in(column, ids.slice(start, start + ID_CHUNK));

    if (error) throw new Error(`Could not load transactions to embed: ${error.message}`);
    rows.push(...((data ?? []) as unknown as TransactionRow[]));
  }
  return rows;
}

async function embedRows(supabase: SupabaseClient, transactions: TransactionRow[]): Promise<number> {
  if (transactions.length === 0) return 0;

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("Missing NVIDIA_API_KEY");

  for (let start = 0; start < transactions.length; start += BATCH_SIZE) {
    const batch = transactions.slice(start, start + BATCH_SIZE);
    const contents = batch.map(buildTransactionContent);
    const embeddings = await embed(contents, apiKey);

    const { error: upsertError } = await supabase.from("transaction_embeddings").upsert(
      batch.map((transaction, index) => ({
        transaction_id: transaction.id,
        account_id: transaction.account_id,
        content: contents[index],
        embedding: embeddings[index],
      })),
      { onConflict: "transaction_id" },
    );

    if (upsertError) throw new Error(`Could not save embeddings: ${upsertError.message}`);
  }

  return transactions.length;
}

/** Re-embeds every transaction of these merchants. Returns how many. */
export async function refreshEmbeddingsForMerchants(
  supabase: SupabaseClient,
  merchantIds: number[],
): Promise<number> {
  if (merchantIds.length === 0) return 0;
  return embedRows(supabase, await loadTransactions(supabase, "merchant_id", merchantIds));
}

/** (Re-)embeds these transactions. Returns how many. */
export async function embedTransactions(supabase: SupabaseClient, transactionIds: number[]): Promise<number> {
  if (transactionIds.length === 0) return 0;
  return embedRows(supabase, await loadTransactions(supabase, "id", transactionIds));
}
