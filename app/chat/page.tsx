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
      <div>
        <h1 className="text-3xl font-bold">Ask SmartSpend</h1>
        <p className="mt-1 text-gray-500">
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
              className="rounded-xl border bg-white p-4 text-left text-sm hover:bg-gray-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Conversation */}
      {messages.length > 0 && (
        <div className="space-y-4 rounded-xl border bg-white p-6">
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
                  className={`rounded-xl px-4 py-3 text-sm ${
                    message.role === "user"
                      ? "bg-black text-white"
                      : "bg-gray-100 text-gray-900"
                  }`}
                >
                  {message.content}
                </div>

                {/* SQL metadata */}
                {message.role === "assistant" &&
                  message.route === "sql" &&
                  message.data && (
                    <div className="mt-2 rounded-lg border bg-white p-3 text-xs text-gray-600">
                      <div className="mb-2 font-medium text-gray-900">
                        Calculated from transaction data
                      </div>

                      {message.data.totalSpent !== undefined && (
                        <div>
                          Total:{" "}
                          <span className="font-medium text-gray-900">
                            {formatCurrency(message.data.totalSpent)}
                          </span>
                        </div>
                      )}

                      {message.data.transactionCount !== undefined && (
                        <div>
                          Transactions:{" "}
                          <span className="font-medium text-gray-900">
                            {message.data.transactionCount}
                          </span>
                        </div>
                      )}

                      {message.data.categories &&
                        message.data.categories.length > 0 && (
                          <div className="mt-3 space-y-1">
                            {message.data.categories.map((category) => (
                              <div
                                key={category.category}
                                className="flex justify-between gap-4"
                              >
                                <span>{category.category}</span>
                                <span className="font-medium">
                                  {formatCurrency(category.totalSpent)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                      {message.data.months &&
                        message.data.months.length > 0 && (
                          <div className="mt-3 space-y-1">
                            {message.data.months.map((month) => (
                              <div
                                key={month.month}
                                className="flex justify-between gap-4"
                              >
                                <span>{month.month}</span>
                                <span className="font-medium">
                                  {formatCurrency(month.totalSpent)}
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
                    <div className="mt-2 rounded-lg border bg-white p-3 text-xs">
                      <div className="mb-2 font-medium text-gray-900">
                        Related transactions
                      </div>

                      <div className="space-y-2">
                        {message.sources.map((source) => (
                          <div
                            key={source.transaction_id}
                            className="rounded-md bg-gray-50 p-2 text-gray-600"
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
              <div className="rounded-xl bg-gray-100 px-4 py-3 text-sm text-gray-500">
                Analyzing your transactions...
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div className="rounded-xl border bg-white p-4">
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
            className="flex-1 rounded-lg border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-gray-300 disabled:bg-gray-50"
          />

          <button
            onClick={() => askQuestion()}
            disabled={!question.trim() || loading}
            className="rounded-lg bg-black px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "..." : "Ask"}
          </button>
        </div>
      </div>
    </div>
  );
}