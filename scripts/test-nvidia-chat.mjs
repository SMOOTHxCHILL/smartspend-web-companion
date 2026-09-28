const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

if (!NVIDIA_API_KEY) {
  throw new Error("Missing NVIDIA_API_KEY");
}

const response = await fetch(
  "https://integrate.api.nvidia.com/v1/chat/completions",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NVIDIA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "nvidia/nemotron-3-super-120b-a12b",
      messages: [
        {
          role: "system",
          content:
            "You are SmartSpend, a personal expense analysis assistant.",
        },
        {
          role: "user",
          content:
            "Explain in one sentence why tracking expenses is useful.",
        },
      ],
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: 100,
      stream: false,
      chat_template_kwargs: {
        enable_thinking: false,
      },
    }),
  }
);

const data = await response.json();

if (!response.ok) {
  throw new Error(
    `NVIDIA request failed (${response.status}): ${JSON.stringify(data)}`
  );
}

console.log(data.choices[0].message.content);