const response = await fetch(
  "https://integrate.api.nvidia.com/v1/embeddings",
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: ["Spent ₹450 at Swiggy on 2026-07-15. Category: Food."],
      model: "nvidia/nemotron-3-embed-1b",
      input_type: "passage",
      embedding_type: "float",
      encoding_format: "float",
    }),
  }
);

const data = await response.json();

if (!response.ok) {
  console.error(data);
  process.exit(1);
}

console.log("Embedding dimensions:", data.data[0].embedding.length);
console.log("First 5 values:", data.data[0].embedding.slice(0, 5));