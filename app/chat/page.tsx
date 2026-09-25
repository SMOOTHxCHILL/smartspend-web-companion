"use client";

import { useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const suggestedQuestions = [
  "How much did I spend on groceries in July?",
  "What was my highest spending category last month?",
  "How much did I spend on food this year?",
  "Show me my biggest transactions.",
];

export default function Chat() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);

  function askQuestion() {
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion) return;

    setMessages((current) => [
      ...current,
      {
        role: "user",
        content: trimmedQuestion,
      },
      {
        role: "assistant",
        content:
          "This is a mock response. The SmartSpend RAG pipeline will answer this question using your transaction data.",
      },
    ]);

    setQuestion("");
  }

  function useSuggestedQuestion(question: string) {
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
              onClick={() => useSuggestedQuestion(suggestion)}
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
              <div
                className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                  message.role === "user"
                    ? "bg-black text-white"
                    : "bg-gray-100 text-gray-900"
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}
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
            className="flex-1 rounded-lg border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-gray-300"
          />

          <button
            onClick={askQuestion}
            disabled={!question.trim()}
            className="rounded-lg bg-black px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}