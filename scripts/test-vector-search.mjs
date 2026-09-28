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

const question = "What transactions were related to groceries?";

async function generateQueryEmbedding(text) {
  const response = await fetch(
    "https://integrate.api.nvidia.com/v1/embeddings",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: [text],
        model: "nvidia/nemotron-3-embed-1b",
        input_type: "query",
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

  return data.data[0].embedding;
}

async function main() {
  console.log(`Question: ${question}`);
  console.log("Generating query embedding...");

  const embedding = await generateQueryEmbedding(question);

  console.log(
    `Embedding dimensions: ${embedding.length}`
  );

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/match_transaction_embeddings`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query_embedding: embedding,
        match_count: 5,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Supabase request failed (${response.status}): ${JSON.stringify(data)}`
    );
  }

  console.log("\nTop matches:\n");

  for (const result of data) {
    console.log(
      `Similarity: ${Number(result.similarity).toFixed(4)}`
    );
    console.log(`Transaction ID: ${result.transaction_id}`);
    console.log(result.content);
    console.log("---");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});