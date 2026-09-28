const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

if (
  !SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY ||
  !NVIDIA_API_KEY
) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or NVIDIA_API_KEY"
  );
}

const EMBEDDING_MODEL = "nvidia/nemotron-3-embed-1b";
const BATCH_SIZE = 20;

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase request failed (${response.status}): ${text}`
    );
  }

  return text ? JSON.parse(text) : null;
}

function buildTransactionContent(transaction) {
  const merchant = transaction.merchants;

  const merchantName =
    merchant?.canonical_name ||
    transaction.raw_merchant ||
    "Unknown merchant";

  const category = merchant?.category || "Uncategorized";

  const amount = Number(transaction.amount);

  const action =
    transaction.type === "credit"
      ? "Received"
      : "Spent";

  return [
    `${action} ₹${amount.toFixed(2)} at ${merchantName}.`,
    `Date: ${transaction.transaction_date}.`,
    `Category: ${category}.`,
    `Bank: ${transaction.bank}.`,
    `Type: ${transaction.type}.`,
  ].join(" ");
}

async function generateEmbeddings(texts) {
  const response = await fetch(
    "https://integrate.api.nvidia.com/v1/embeddings",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: texts,
        model: EMBEDDING_MODEL,
        input_type: "passage",
        embedding_type: "float",
        encoding_format: "float",
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `NVIDIA request failed (${response.status}): ${JSON.stringify(data)}`
    );
  }

  return data.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

async function main() {
  console.log("Fetching transactions...");

  const transactions = await supabaseRequest(
    "/rest/v1/transactions" +
      "?select=id,bank,amount,type,raw_merchant,transaction_date,confidence,merchant_id,merchants(canonical_name,category,category_source)" +
      "&order=transaction_date.asc"
  );

  if (!transactions?.length) {
    console.log("No transactions found.");
    return;
  }

  console.log(
    `Found ${transactions.length} transactions.`
  );

  let processed = 0;

  for (
    let start = 0;
    start < transactions.length;
    start += BATCH_SIZE
  ) {
    const batch = transactions.slice(
      start,
      start + BATCH_SIZE
    );

    const contents = batch.map(buildTransactionContent);

    console.log(
      `Embedding ${start + 1}-${start + batch.length}...`
    );

    const embeddings =
      await generateEmbeddings(contents);

    const rows = batch.map((transaction, index) => ({
      transaction_id: transaction.id,
      content: contents[index],
      embedding: embeddings[index],
    }));

    await supabaseRequest(
      "/rest/v1/transaction_embeddings?on_conflict=transaction_id",
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(rows),
      }
    );

    processed += batch.length;

    console.log(
      `Stored ${processed}/${transactions.length}`
    );
  }

  console.log(
    "Finished generating transaction embeddings."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});