import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/supabaseServer";
import { buildSpendingOverview } from "@/lib/spendingOverview";

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
      // Broad / advice questions: answered from a summary of ALL transactions
      type: "overview";
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

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/*
 * Finds the category a question is about.
 * Real category names from the database win (so new or renamed
 * categories work); the alias list covers casual words like "food".
 */
function detectCategory(
  question: string,
  knownCategories: string[] = []
): string | null {
  const lowerQuestion = question.toLowerCase();

  const byLength = [...knownCategories].sort(
    (a, b) => b.length - a.length
  );

  for (const category of byLength) {
    const pattern = new RegExp(
      `(?<![\\w])${escapeRegExp(category.toLowerCase())}(?![\\w])`
    );

    if (pattern.test(lowerQuestion)) {
      return category;
    }
  }

  for (const [alias, category] of Object.entries(
    CATEGORY_ALIASES
  )) {
    // Skip aliases whose category was renamed away
    if (
      knownCategories.length > 0 &&
      !knownCategories.includes(category)
    ) {
      continue;
    }

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

async function loadKnownCategories(supabase: SupabaseClient): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("merchants")
      .select("category");

    if (error) throw error;

    return [
      ...new Set(
        (data ?? [])
          .map((row) => row.category as string)
          .filter(Boolean)
      ),
    ];
  } catch (error) {
    console.error("Could not load categories:", error);
    return [];
  }
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
  question: string,
  knownCategories: string[]
): QueryRoute {
  const lowerQuestion = question.toLowerCase();

  const dateRange = getDateRange(question);
  const category = detectCategory(
    question,
    knownCategories
  );

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

  /*
   * Advice-style questions ("how can I cut back?", "what should I
   * watch out for?") need the whole picture, never a handful of
   * similar transactions.
   */
  const asksForAdvice =
    /\b(reduce|reducing|cut down|cut back|cut my|save money|saving money|save more|tips?|advice|advise|suggest|suggestions?|recommend|recommendations?|improve|budget|budgeting|overspend|overspending|waste|wasting|habits?|patterns?|look out for|watch out for|analy[sz]e|insights?|overview|summari[sz]e|summary)\b/i.test(
      lowerQuestion
    );

  // "entire", "overall", "in general"... — broad scope
  const asksAboutEverything =
    /\b(entire|overall|in general|generally|all of my|all my|whole|everything|across the board)\b/i.test(
      lowerQuestion
    );

  if (asksForAdvice) {
    return { type: "overview" };
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

  // Broad, non-numeric questions also get the full picture
  if (asksAboutEverything) {
    return { type: "overview" };
  }

  return {
    type: "rag",
  };
}

/*
 * Calls a Postgres function AS the logged-in user. The functions run with
 * the caller's rights, so Row Level Security limits them to that user's
 * account.
 */
async function getSupabaseRpc<T>(
  supabase: SupabaseClient,
  functionName: string,
  body: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.rpc(functionName, body);

  if (error) {
    throw new Error(`Supabase RPC ${functionName} failed: ${error.message}`);
  }

  return data as T;
}

async function getSpendingTotal(
  supabase: SupabaseClient,
  category: string | null,
  startDate: string | null,
  endDate: string | null
): Promise<SpendingResult> {
  const data =
    await getSupabaseRpc<SpendingResult[]>(
      supabase,
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
  supabase: SupabaseClient,
  startDate: string | null,
  endDate: string | null
): Promise<CategoryResult[]> {
  return getSupabaseRpc<CategoryResult[]>(
    supabase,
    "get_spending_by_category",
    {
      start_date: startDate,
      end_date: endDate,
    }
  );
}

async function getMonthlyBreakdown(
  supabase: SupabaseClient,
  startDate: string | null,
  endDate: string | null
): Promise<MonthlyResult[]> {
  return getSupabaseRpc<MonthlyResult[]>(
    supabase,
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
  supabase: SupabaseClient,
  embedding: number[],
  category: string | null,
  type: string | null
): Promise<RetrievedTransaction[]> {
  const data =
    await getSupabaseRpc<RetrievedTransaction[]>(
      supabase,
      "match_transaction_embeddings_filtered",
      {
        query_embedding: embedding,
        match_count: 12,
        category_filter: category,
        type_filter: type,
      }
    );

  return data;
}

/*
 * How replies should look. The chat page renders this subset of
 * Markdown (headings, bold, bullet and numbered lists).
 */
const FORMAT_RULES = `
Formatting:
- Write in Markdown. Use **bold** for key amounts, merchants and categories.
- Use "- " bullet points for lists and "1. " for ordered steps. Indent sub-points by two spaces.
- For longer answers, group points under short "### " headings.
- Never use tables, code blocks or horizontal rules.
- Format money like ₹1,23,456 (Indian digit grouping). Write dates like 26 Jan 2026.
- Do not add disclaimers or footnotes about the data unless it genuinely cannot answer the question.
`;

async function callChatModel(
  systemPrompt: string,
  question: string,
  maxTokens: number
) {
  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    throw new Error("Missing NVIDIA_API_KEY");
  }

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
          max_tokens: maxTokens,
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

  return answer.trim();
}

/* Search questions: answer from the closest matching transactions */
async function generateAnswer(
  question: string,
  transactions: RetrievedTransaction[]
) {
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
These are the transactions most relevant to the question, found by search.

Rules:
- Do not invent transactions, amounts, dates, merchants, categories, or other facts.
- Do not use outside knowledge.
- If the supplied transactions do not contain enough information to answer, say so clearly in one sentence.
- Do not claim the supplied transactions are every transaction, and do not state totals across all spending from them.
- Keep the answer concise and useful.
- When relevant, mention the merchant, amount, date, and category from the supplied data.
- If the user asks for related transactions, list only transactions present in the supplied data.
${FORMAT_RULES}
Transaction data:
${context}
`;

  return callChatModel(systemPrompt, question, 600);
}

/* Broad / advice questions: answer from a summary of every transaction */
async function generateOverviewAnswer(
  question: string,
  brief: string
) {
  const systemPrompt = `
You are SmartSpend, a friendly, practical personal finance coach for a user in India.

You are given a summary of the user's COMPLETE transaction history (every transaction SmartSpend has recorded, condensed into totals, categories, merchants, recurring payments and trends). Use it to answer the question.

Rules:
- Base every observation on numbers from the summary. Quote specific amounts, merchants and categories.
- Do not invent transactions, merchants or figures that are not in the summary.
- Prioritise: lead with the 2–4 changes that would save the most money, with a rough monthly saving for each where the data supports it.
- Then mention patterns worth watching (recurring payments, many small payments, categories that are rising, large one-off spends).
- General money advice is fine when it follows from the data, but keep it short and concrete — no generic lectures.
- The summary covers all recorded transactions, so do not say the data is partial or only a sample.
- Aim for roughly 200–350 words.
${FORMAT_RULES}
Spending summary:
${brief}
`;

  return callChatModel(systemPrompt, question, 1100);
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

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

    const knownCategories =
      await loadKnownCategories(supabase);

    const route = detectQueryRoute(
      trimmedQuestion,
      knownCategories
    );

    /*
     * SQL ROUTE:
     * Exact numerical questions are answered
     * deterministically from PostgreSQL.
     */
    if (route.type === "spending_total") {
      const result = await getSpendingTotal(
        supabase,
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
        supabase,
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
        supabase,
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
     * OVERVIEW ROUTE:
     * Broad or advice questions are answered from a summary of
     * every transaction rather than a few search matches.
     */
    if (route.type === "overview") {
      const overview = await buildSpendingOverview(supabase);

      const answer = await generateOverviewAnswer(
        trimmedQuestion,
        overview.brief
      );

      return NextResponse.json({
        answer,
        sources: [],
        route: "overview",
        data: {
          transactionCount: overview.transactionCount,
          startDate: overview.startDate,
          endDate: overview.endDate,
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

    const category = detectCategory(
      trimmedQuestion,
      knownCategories
    );

    const transactionType =
      detectTransactionType(trimmedQuestion);

    const transactions =
      await retrieveTransactions(
        supabase,
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