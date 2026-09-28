import { NextResponse } from "next/server";

const NVIDIA_API_URL =
  "https://integrate.api.nvidia.com/v1";

const EMBEDDING_MODEL = "nvidia/nemotron-3-embed-1b";
const CHAT_MODEL = "nvidia/nemotron-3-super-120b-a12b";

type RetrievedTransaction = {
  transaction_id: number;
  content: string;
  similarity: number;
};

type ChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type SpendingResult = {
  total_spent: number | string;
  transaction_count: number;
};

type QueryRoute = {
  type: "sql" | "rag";
  category: string | null;
  startDate: string | null;
  endDate: string | null;
};

const CATEGORY_ALIASES: Record<string, string> = {
  groceries: "Groceries",
  grocery: "Groceries",
  food: "Food",
  dining: "Food",
  restaurant: "Food",
  restaurants: "Food",
  fuel: "Fuel",
  petrol: "Fuel",
  gas: "Fuel",
  shopping: "Shopping",
  transfer: "Transfer",
  entertainment: "Entertainment",
  travel: "Travel",
  bills: "Bills",
  utilities: "Utilities",
  health: "Health",
  healthcare: "Health",
};

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function getMonthRange(
  question: string
): {
  startDate: string;
  endDate: string;
} | null {
  const lowerQuestion = question.toLowerCase();

  for (const [monthName, monthIndex] of Object.entries(
    MONTHS
  )) {
    if (!lowerQuestion.includes(monthName)) {
      continue;
    }

    const yearMatch = lowerQuestion.match(
      /\b(20\d{2})\b/
    );

    const year = yearMatch
      ? Number(yearMatch[1])
      : new Date().getFullYear();

    const start = new Date(
      Date.UTC(year, monthIndex, 1)
    );

    const end = new Date(
      Date.UTC(year, monthIndex + 1, 1)
    );

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  }

  return null;
}

function detectCategory(
  question: string
): string | null {
  const lowerQuestion = question.toLowerCase();

  for (const [alias, category] of Object.entries(
    CATEGORY_ALIASES
  )) {
    const pattern = new RegExp(
      `\\b${alias}\\b`,
      "i"
    );

    if (pattern.test(lowerQuestion)) {
      return category;
    }
  }

  return null;
}

function detectQueryRoute(question: string): QueryRoute {
  const lowerQuestion = question.toLowerCase();

  const isAggregateQuestion =
    lowerQuestion.includes("how much") ||
    lowerQuestion.includes("how much have") ||
    lowerQuestion.includes("total spent") ||
    lowerQuestion.includes("total spending") ||
    lowerQuestion.includes("total expense") ||
    lowerQuestion.includes("total expenses") ||
    lowerQuestion.includes("how much did i spend");

  if (!isAggregateQuestion) {
    return {
      type: "rag",
      category: null,
      startDate: null,
      endDate: null,
    };
  }

  const category = detectCategory(question);
  const monthRange = getMonthRange(question);

  return {
    type: "sql",
    category,
    startDate: monthRange?.startDate ?? null,
    endDate: monthRange?.endDate ?? null,
  };
}

async function generateQueryEmbedding(question: string) {
  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    throw new Error("Missing NVIDIA_API_KEY");
  }

  const response = await fetch(
    `${NVIDIA_API_URL}/embeddings`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: [question],
        model: EMBEDDING_MODEL,
        input_type: "query",
        embedding_type: "float",
        encoding_format: "float",
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Embedding request failed (${response.status}): ${JSON.stringify(data)}`
    );
  }

  return data.data[0].embedding;
}

async function retrieveTransactions(
  embedding: number[]
): Promise<RetrievedTransaction[]> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase environment variables"
    );
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/match_transaction_embeddings`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query_embedding: embedding,
        match_count: 8,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Vector search failed (${response.status}): ${JSON.stringify(data)}`
    );
  }

  return data;
}

async function getSpendingTotal(
  category: string | null,
  startDate: string | null,
  endDate: string | null
): Promise<SpendingResult> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase environment variables"
    );
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/get_spending_by_filter`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        category_filter: category,
        start_date: startDate,
        end_date: endDate,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Spending query failed (${response.status}): ${JSON.stringify(data)}`
    );
  }

  if (!Array.isArray(data) || !data[0]) {
    throw new Error(
      "Spending query returned no result."
    );
  }

  return data[0];
}

async function generateAnswer(
  question: string,
  transactions: RetrievedTransaction[]
) {
  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    throw new Error("Missing NVIDIA_API_KEY");
  }

  const context = transactions
    .map(
      (transaction, index) =>
        `[Source ${index + 1}]
Transaction ID: ${transaction.transaction_id}
Similarity: ${transaction.similarity.toFixed(4)}
${transaction.content}`
    )
    .join("\n\n");

  const systemPrompt = `
You are SmartSpend, a personal expense analysis assistant.

Answer the user's question using ONLY the transaction data provided below.

Rules:
- Do not invent transactions, amounts, dates, merchants, categories, or other facts.
- Do not use outside knowledge.
- If the supplied transactions do not contain enough information to answer, say so clearly.
- Do not claim that the retrieved transactions represent every transaction unless the data explicitly proves that.
- Keep the answer concise and useful.
- When relevant, mention the merchant, amount, date, and category from the supplied data.

Transaction data:
${context}
`;

  let response: Response | null = null;
  let data: ChatResponse = {};

  for (let attempt = 1; attempt <= 3; attempt++) {
    response = await fetch(
      `${NVIDIA_API_URL}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: question,
            },
          ],
          temperature: 0.2,
          top_p: 0.95,
          max_tokens: 500,
          stream: false,
          chat_template_kwargs: {
            enable_thinking: false,
          },
        }),
      }
    );

    data = (await response.json()) as ChatResponse;

    if (response.ok) {
      break;
    }

    if (
      response.status !== 503 ||
      attempt === 3
    ) {
      throw new Error(
        `Chat request failed (${response.status}): ${JSON.stringify(data)}`
      );
    }

    console.log(
      `NVIDIA chat endpoint overloaded. Retrying (${attempt}/3)...`
    );

    await new Promise((resolve) =>
      setTimeout(resolve, attempt * 1500)
    );
  }

  if (!response || !response.ok) {
    throw new Error(
      "NVIDIA chat request failed after retries."
    );
  }

  const answer =
    data.choices?.[0]?.message?.content;

  if (!answer) {
    throw new Error(
      "NVIDIA chat response did not contain an answer."
    );
  }

  return answer;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const question = body?.question;

    if (
      typeof question !== "string" ||
      !question.trim()
    ) {
      return NextResponse.json(
        { error: "A question is required." },
        { status: 400 }
      );
    }

    const trimmedQuestion = question.trim();
    const route = detectQueryRoute(trimmedQuestion);

    if (route.type === "sql") {
      const result = await getSpendingTotal(
        route.category,
        route.startDate,
        route.endDate
      );

      const categoryText =
        route.category ?? "all categories";

      const periodText =
        route.startDate && route.endDate
          ? `from ${route.startDate.slice(
              0,
              10
            )} to ${route.endDate.slice(0, 10)}`
          : "for the available transaction period";

      return NextResponse.json({
        answer: `You spent ₹${Number(
          result.total_spent
        ).toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} on ${categoryText.toLowerCase()} ${periodText}. This includes ${result.transaction_count} transactions.`,
        sources: [],
        route: "sql",
        data: {
          totalSpent: Number(result.total_spent),
          transactionCount:
            Number(result.transaction_count),
          category: route.category,
          startDate: route.startDate,
          endDate: route.endDate,
        },
      });
    }

    const embedding =
      await generateQueryEmbedding(trimmedQuestion);

    const transactions =
      await retrieveTransactions(embedding);

    const answer = await generateAnswer(
      trimmedQuestion,
      transactions
    );

    return NextResponse.json({
      answer,
      sources: transactions,
      route: "rag",
    });
  } catch (error) {
    console.error(
      "SmartSpend /api/ask error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
      },
      { status: 500 }
    );
  }
}