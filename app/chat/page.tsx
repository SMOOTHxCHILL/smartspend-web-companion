"use client";

import { useState } from "react";

type Source = {
  transaction_id: number;
  content: string;
  similarity: number;
};

type AskResponse = {
  answer: string;
  route: "sql" | "rag";
  sources?: Source[];
  data?: {
    totalSpent?: number;
    transactionCount?: number;
    category?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    categories?: {
      category: string;
      totalSpent: number;
      transactionCount: number;
    }[];
    months?: {
      month: string;
      totalSpent: number;
      transactionCount: number;
    }[];
  };
};

type Message = {
  role: "user" | "assistant";
  content: string;
  route?: "sql" | "rag";
  sources?: Source[];
  data?: AskResponse["data"];
};

const suggestedQuestions = [
  "How much did I spend on groceries in July?",
  "What was my highest spending category last month?",
  "How much did I spend on food this year?",
  "Show me my biggest transactions.",
];

function formatCurrency(value: number) {
  return `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function Chat() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  async function askQuestion(questionOverride?: string) {
    const trimmedQuestion = (questionOverride ?? question).trim();

    if (!trimmedQuestion || loading) return;

    setMessages((current) => [
      ...current,
      {
        role: "user",
        content: trimmedQuestion,
      },
    ]);

    setQuestion("");
    setLoading(true);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: trimmedQuestion,
        }),
      });

      const data: AskResponse = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.answer === "string"
            ? data.answer
            : "Something went wrong."
        );
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.answer,
          route: data.route,
          sources: data.sources,
          data: data.data,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Unable to process your question.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function selectSuggestedQuestion(question: string) {
    setQuestion(question);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">
          Ask SmartSpend
        </h1>

        <p className="mt-1 text-zinc-400">
          Ask questions about your spending using natural language.
        </p>
      </div>

      {/* Suggested questions */}
      {messages.length === 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {suggestedQuestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => selectSuggestedQuestion(suggestion)}
              className="rounded-xl border border-zinc-200 bg-white p-4 text-left text-sm font-medium text-zinc-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-zinc-50 hover:shadow-md"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Conversation */}
      {messages.length > 0 && (
        <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${
                message.role === "user"
                  ? "justify-end"
                  : "justify-start"
              }`}
            >
              <div className="max-w-[85%]">
                <div
                  className={`rounded-xl px-4 py-3 text-sm leading-6 ${
                    message.role === "user"
                      ? "bg-black text-white"
                      : "bg-zinc-100 text-zinc-900"
                  }`}
                >
                  {message.content}
                </div>

                {/* SQL metadata */}
                {message.role === "assistant" &&
                  message.route === "sql" &&
                  message.data && (
                    <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-4 text-xs text-zinc-600 shadow-sm">
                      <div className="mb-3 font-semibold text-zinc-950">
                        Calculated from transaction data
                      </div>

                      {message.data.totalSpent !== undefined && (
                        <div>
                          Total:{" "}
                          <span className="font-semibold text-zinc-950">
                            {formatCurrency(
                              message.data.totalSpent
                            )}
                          </span>
                        </div>
                      )}

                      {message.data.transactionCount !== undefined && (
                        <div className="mt-1">
                          Transactions:{" "}
                          <span className="font-semibold text-zinc-950">
                            {message.data.transactionCount}
                          </span>
                        </div>
                      )}

                      {message.data.categories &&
                        message.data.categories.length > 0 && (
                          <div className="mt-4 space-y-2 border-t border-zinc-100 pt-3">
                            {message.data.categories.map(
                              (category) => (
                                <div
                                  key={category.category}
                                  className="flex justify-between gap-4"
                                >
                                  <span className="text-zinc-600">
                                    {category.category}
                                  </span>

                                  <span className="font-semibold text-zinc-950">
                                    {formatCurrency(
                                      category.totalSpent
                                    )}
                                  </span>
                                </div>
                              )
                            )}
                          </div>
                        )}

                      {message.data.months &&
                        message.data.months.length > 0 && (
                          <div className="mt-4 space-y-2 border-t border-zinc-100 pt-3">
                            {message.data.months.map((month) => (
                              <div
                                key={month.month}
                                className="flex justify-between gap-4"
                              >
                                <span className="text-zinc-600">
                                  {month.month}
                                </span>

                                <span className="font-semibold text-zinc-950">
                                  {formatCurrency(
                                    month.totalSpent
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                  )}

                {/* RAG sources */}
                {message.role === "assistant" &&
                  message.route === "rag" &&
                  message.sources &&
                  message.sources.length > 0 && (
                    <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-4 text-xs shadow-sm">
                      <div className="mb-3 font-semibold text-zinc-950">
                        Related transactions
                      </div>

                      <div className="space-y-2">
                        {message.sources.map((source) => (
                          <div
                            key={source.transaction_id}
                            className="rounded-md border border-zinc-100 bg-zinc-50 p-3 text-zinc-600"
                          >
                            {source.content}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-500">
                Analyzing your transactions...
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex gap-3">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                askQuestion();
              }
            }}
            placeholder="Ask about your spending..."
            disabled={loading}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-black placeholder:text-zinc-500 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-400"
          />

          <button
            onClick={() => askQuestion()}
            disabled={!question.trim() || loading}
            className="rounded-lg bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "..." : "Ask"}
          </button>
        </div>
      </div>
    </div>
  );
}