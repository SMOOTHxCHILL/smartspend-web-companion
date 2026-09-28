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

type CategoryResult = {
  category: string;
  total_spent: number | string;
  transaction_count: number;
};

type MonthlyResult = {
  month: string;
  total_spent: number | string;
  transaction_count: number;
};

type QueryRoute =
  | {
      type: "spending_total";
      category: string | null;
      startDate: string | null;
      endDate: string | null;
    }
  | {
      type: "category_breakdown";
      startDate: string | null;
      endDate: string | null;
    }
  | {
      type: "monthly_breakdown";
      startDate: string | null;
      endDate: string | null;
    }
  | {
      type: "rag";
    };

const CATEGORY_ALIASES: Record<string, string> = {
  groceries: "Groceries",
  grocery: "Groceries",

  food: "Food & Dining",
  dining: "Food & Dining",
  restaurant: "Food & Dining",
  restaurants: "Food & Dining",

  shopping: "Shopping",

  health: "Health",
  healthcare: "Health",
  medical: "Health",

  bills: "Bills & Utilities",
  utilities: "Bills & Utilities",

  transport: "Transport",
  transportation: "Transport",

  other: "Other",
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

function getRelativeDateRange(
  question: string
): {
  startDate: string;
  endDate: string;
} | null {
  const lowerQuestion = question.toLowerCase();
  const now = new Date();

  if (lowerQuestion.includes("this year")) {
    const year = now.getUTCFullYear();

    return {
      startDate: new Date(
        Date.UTC(year, 0, 1)
      ).toISOString(),
      endDate: new Date(
        Date.UTC(year + 1, 0, 1)
      ).toISOString(),
    };
  }

  if (lowerQuestion.includes("last year")) {
    const year = now.getUTCFullYear() - 1;

    return {
      startDate: new Date(
        Date.UTC(year, 0, 1)
      ).toISOString(),
      endDate: new Date(
        Date.UTC(year + 1, 0, 1)
      ).toISOString(),
    };
  }

  if (lowerQuestion.includes("this month")) {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();

    return {
      startDate: new Date(
        Date.UTC(year, month, 1)
      ).toISOString(),
      endDate: new Date(
        Date.UTC(year, month + 1, 1)
      ).toISOString(),
    };
  }

  if (lowerQuestion.includes("last month")) {
    const currentMonth = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        1
      )
    );

    const start = new Date(currentMonth);
    start.setUTCMonth(start.getUTCMonth() - 1);

    return {
      startDate: start.toISOString(),
      endDate: currentMonth.toISOString(),
    };
  }

  return null;
}

function getDateRange(
  question: string
): {
  startDate: string | null;
  endDate: string | null;
} {
  const explicitMonth = getMonthRange(question);

  if (explicitMonth) {
    return explicitMonth;
  }

  const relativeRange =
    getRelativeDateRange(question);

  if (relativeRange) {
    return relativeRange;
  }

  return {
    startDate: null,
    endDate: null,
  };
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

function detectTransactionType(
  question: string
): string | null {
  const lowerQuestion = question.toLowerCase();

  if (
    /\b(spent|spending|expense|expenses|purchase|purchases|debit)\b/i.test(
      lowerQuestion
    )
  ) {
    return "debit";
  }

  if (
    /\b(received|income|credit|credits)\b/i.test(
      lowerQuestion
    )
  ) {
    return "credit";
  }

  return null;
}

function detectQueryRoute(
  question: string
): QueryRoute {
  const lowerQuestion = question.toLowerCase();

  const dateRange = getDateRange(question);
  const category = detectCategory(question);

  const asksForCategoryBreakdown =
    lowerQuestion.includes(
      "spending by category"
    ) ||
    lowerQuestion.includes(
      "spend by category"
    ) ||
    lowerQuestion.includes(
      "spending per category"
    ) ||
    lowerQuestion.includes(
      "spending across categories"
    ) ||
    lowerQuestion.includes(
      "breakdown by category"
    );

  const asksForMonthlyBreakdown =
    lowerQuestion.includes(
      "spending by month"
    ) ||
    lowerQuestion.includes(
      "spend by month"
    ) ||
    lowerQuestion.includes(
      "monthly spending"
    ) ||
    lowerQuestion.includes(
      "spending each month"
    );

  const asksForCategoryRanking =
    lowerQuestion.includes(
      "highest spending category"
    ) ||
    lowerQuestion.includes(
      "most spending category"
    ) ||
    lowerQuestion.includes(
      "category did i spend the most"
    ) ||
    lowerQuestion.includes(
      "category i spent the most"
    ) ||
    lowerQuestion.includes(
      "least spending category"
    ) ||
    lowerQuestion.includes(
      "category did i spend the least"
    );

  if (
    asksForCategoryBreakdown ||
    asksForCategoryRanking
  ) {
    return {
      type: "category_breakdown",
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    };
  }

  if (asksForMonthlyBreakdown) {
    return {
      type: "monthly_breakdown",
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    };
  }

  const isAggregateQuestion =
    lowerQuestion.includes("how much") ||
    lowerQuestion.includes("how much have") ||
    lowerQuestion.includes("total spent") ||
    lowerQuestion.includes("total spending") ||
    lowerQuestion.includes("total expense") ||
    lowerQuestion.includes("total expenses") ||
    lowerQuestion.includes(
      "how much did i spend"
    ) ||
    lowerQuestion.includes(
      "how many transactions"
    ) ||
    lowerQuestion.includes(
      "number of transactions"
    );

  if (isAggregateQuestion) {
    return {
      type: "spending_total",
      category,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    };
  }

  return {
    type: "rag",
  };
}

async function getSupabaseRpc<T>(
  functionName: string,
  body: Record<string, unknown>
): Promise<T> {
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
    `${supabaseUrl}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Supabase RPC failed (${response.status}): ${JSON.stringify(
        data
      )}`
    );
  }

  return data;
}

async function getSpendingTotal(
  category: string | null,
  startDate: string | null,
  endDate: string | null
): Promise<SpendingResult> {
  const data =
    await getSupabaseRpc<SpendingResult[]>(
      "get_spending_by_filter",
      {
        category_filter: category,
        start_date: startDate,
        end_date: endDate,
      }
    );

  if (!data[0]) {
    throw new Error(
      "Spending query returned no result."
    );
  }

  return data[0];
}

async function getCategoryBreakdown(
  startDate: string | null,
  endDate: string | null
): Promise<CategoryResult[]> {
  return getSupabaseRpc<CategoryResult[]>(
    "get_spending_by_category",
    {
      start_date: startDate,
      end_date: endDate,
    }
  );
}

async function getMonthlyBreakdown(
  startDate: string | null,
  endDate: string | null
): Promise<MonthlyResult[]> {
  return getSupabaseRpc<MonthlyResult[]>(
    "get_spending_by_month",
    {
      start_date: startDate,
      end_date: endDate,
    }
  );
}

function formatCurrency(
  amount: number | string
): string {
  return `₹${Number(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateRange(
  startDate: string | null,
  endDate: string | null
): string {
  if (!startDate || !endDate) {
    return "the available transaction period";
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  end.setUTCDate(end.getUTCDate() - 1);

  const startLabel = start.toLocaleDateString(
    "en-IN",
    {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }
  );

  const endLabel = end.toLocaleDateString(
    "en-IN",
    {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }
  );

  if (startLabel === endLabel) {
    return startLabel;
  }

  return `${startLabel} to ${endLabel}`;
}

async function generateQueryEmbedding(
  question: string
) {
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
      `Embedding request failed (${response.status}): ${JSON.stringify(
        data
      )}`
    );
  }

  return data.data[0].embedding;
}

async function retrieveTransactions(
  embedding: number[],
  category: string | null,
  type: string | null
): Promise<RetrievedTransaction[]> {
  const data =
    await getSupabaseRpc<RetrievedTransaction[]>(
      "match_transaction_embeddings_filtered",
      {
        query_embedding: embedding,
        match_count: 8,
        category_filter: category,
        type_filter: type,
      }
    );

  return data;
}

async function generateAnswer(
  question: string,
  transactions: RetrievedTransaction[]
) {
  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    throw new Error("Missing NVIDIA_API_KEY");
  }

  const context = transactions.length
    ? transactions
        .map(
          (transaction, index) =>
            `[Source ${index + 1}]
Transaction ID: ${transaction.transaction_id}
Similarity: ${transaction.similarity.toFixed(4)}
${transaction.content}`
        )
        .join("\n\n")
    : "No matching transactions were found.";

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
- If the user asks for related transactions, list only transactions present in the supplied data.
- Do not add transactions that are not present in the supplied data.

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
        `Chat request failed (${response.status}): ${JSON.stringify(
          data
        )}`
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

    const route = detectQueryRoute(
      trimmedQuestion
    );

    /*
     * SQL ROUTE:
     * Exact numerical questions are answered
     * deterministically from PostgreSQL.
     */
    if (route.type === "spending_total") {
      const result = await getSpendingTotal(
        route.category,
        route.startDate,
        route.endDate
      );

      const categoryText =
        route.category?.toLowerCase() ??
        "all categories";

      const periodText = formatDateRange(
        route.startDate,
        route.endDate
      );

      const lowerQuestion =
        trimmedQuestion.toLowerCase();

      const asksForCount =
        lowerQuestion.includes(
          "how many transactions"
        ) ||
        lowerQuestion.includes(
          "number of transactions"
        );

      const answer = asksForCount
        ? `There were ${result.transaction_count} transactions for ${categoryText} during ${periodText}.`
        : `You spent ${formatCurrency(
            result.total_spent
          )} on ${categoryText} during ${periodText}. This includes ${result.transaction_count} transactions.`;

      return NextResponse.json({
        answer,
        sources: [],
        route: "sql",
        data: {
          totalSpent: Number(
            result.total_spent
          ),
          transactionCount:
            Number(result.transaction_count),
          category: route.category,
          startDate: route.startDate,
          endDate: route.endDate,
        },
      });
    }

    /*
     * SQL ROUTE:
     * Category breakdown and category ranking.
     */
    if (route.type === "category_breakdown") {
      const results =
        await getCategoryBreakdown(
          route.startDate,
          route.endDate
        );

      const periodText = formatDateRange(
        route.startDate,
        route.endDate
      );

      if (!results.length) {
        return NextResponse.json({
          answer: `No spending data was found for ${periodText}.`,
          sources: [],
          route: "sql",
          data: {
            categories: [],
          },
        });
      }

      const lowerQuestion =
        trimmedQuestion.toLowerCase();

      const asksForLeast =
        lowerQuestion.includes("least");

      const topCategory = asksForLeast
        ? results[results.length - 1]
        : results[0];

      const answer = asksForLeast
        ? `Your lowest spending category during ${periodText} was ${topCategory.category}, at ${formatCurrency(
            topCategory.total_spent
          )} across ${topCategory.transaction_count} transactions.`
        : `Your highest spending category during ${periodText} was ${topCategory.category}, at ${formatCurrency(
            topCategory.total_spent
          )} across ${topCategory.transaction_count} transactions.`;

      return NextResponse.json({
        answer,
        sources: [],
        route: "sql",
        data: {
          categories: results.map(
            (result) => ({
              category: result.category,
              totalSpent: Number(
                result.total_spent
              ),
              transactionCount:
                Number(result.transaction_count),
            })
          ),
          startDate: route.startDate,
          endDate: route.endDate,
        },
      });
    }

    /*
     * SQL ROUTE:
     * Monthly spending breakdown.
     */
    if (route.type === "monthly_breakdown") {
      const results =
        await getMonthlyBreakdown(
          route.startDate,
          route.endDate
        );

      if (!results.length) {
        return NextResponse.json({
          answer:
            "No monthly spending data was found for the requested period.",
          sources: [],
          route: "sql",
          data: {
            months: [],
          },
        });
      }

      const highestMonth = results.reduce(
        (highest, current) =>
          Number(current.total_spent) >
          Number(highest.total_spent)
            ? current
            : highest
      );

      const answer = `Your highest spending month was ${highestMonth.month}, with ${formatCurrency(
        highestMonth.total_spent
      )} across ${highestMonth.transaction_count} transactions.`;

      return NextResponse.json({
        answer,
        sources: [],
        route: "sql",
        data: {
          months: results.map(
            (result) => ({
              month: result.month,
              totalSpent: Number(
                result.total_spent
              ),
              transactionCount:
                Number(result.transaction_count),
            })
          ),
          startDate: route.startDate,
          endDate: route.endDate,
        },
      });
    }

    /*
     * RAG ROUTE:
     * Semantic questions use vector retrieval.
     *
     * IMPORTANT:
     * The exact same filtered `transactions` array
     * is used for:
     * 1. LLM context
     * 2. UI source cards
     *
     * This prevents the answer and displayed sources
     * from disagreeing.
     */
    const embedding =
      await generateQueryEmbedding(
        trimmedQuestion
      );

    const category =
      detectCategory(trimmedQuestion);

    const transactionType =
      detectTransactionType(trimmedQuestion);

    const transactions =
      await retrieveTransactions(
        embedding,
        category,
        transactionType
      );

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