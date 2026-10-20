"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import Markdown from "@/components/Markdown";
import { fetchAllTransactions, inr, monthKey, monthYear, type Txn } from "@/lib/transactions";
import { getMyName, saveMyName } from "@/lib/supabase";

/* =========================================================
   Types
========================================================= */

type Source = {
  transaction_id: number;
  content: string;
  similarity: number;
};

type AskData = {
  totalSpent?: number;
  transactionCount?: number;
  category?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  categories?: { category: string; totalSpent: number; transactionCount: number }[];
  months?: { month: string; totalSpent: number; transactionCount: number }[];
};

type AskResponse = {
  answer?: string;
  error?: string;
  route?: "sql" | "rag" | "overview";
  sources?: Source[];
  data?: AskData;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  failed?: boolean;
  route?: "sql" | "rag" | "overview";
  sources?: Source[];
  data?: AskData;
};

/* =========================================================
   Example questions — each one is phrased so the backend
   router sends it down the right path (exact SQL vs search).
========================================================= */

function buildQuestionGroups(): Array<{ title: string; blurb: string; icon: ReactNode; questions: string[] }> {
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const lastMonthName = lastMonth.toLocaleDateString("en-IN", { month: "long" });

  const icon = (path: ReactNode) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );

  return [
    {
      title: "Totals",
      blurb: "Exact numbers from your data",
      icon: icon(<path d="M5 4h14M5 20h14M8 4l6 8-6 8" />),
      questions: [
        "How much did I spend this month?",
        "How much did I spend on groceries last month?",
        `How many transactions did I make in ${lastMonthName}?`,
      ],
    },
    {
      title: "Breakdowns",
      blurb: "Split by category or month",
      icon: icon(
        <>
          <path d="M12 3a9 9 0 1 0 9 9h-9Z" />
          <path d="M15 3.5A9 9 0 0 1 20.5 9H15Z" />
        </>,
      ),
      questions: [
        "What was my highest spending category last month?",
        "Show my spending by category this year",
        "Show my monthly spending",
      ],
    },
    {
      title: "Find transactions",
      blurb: "Search by meaning, not just name",
      icon: icon(
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </>,
      ),
      questions: [
        "Which of my transactions were food orders?",
        "Did I pay any bills recently?",
        "Show me money I received recently",
      ],
    },
    {
      title: "Advice",
      blurb: "Looks at your whole history",
      icon: icon(<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3Z" />),
      questions: [
        "How can I reduce my spending overall?",
        "What spending habits should I watch out for?",
        "Which category did I spend the least on this year?",
      ],
    },
  ];
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/* =========================================================
   Pieces
========================================================= */

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function AnswerDetails({ message }: { message: Message }) {
  const [open, setOpen] = useState(false);

  if (message.route === "overview" && message.data?.transactionCount) {
    const { transactionCount, startDate, endDate } = message.data;
    return (
      <p className="mt-2 text-xs text-[#7fdcc0]">
        ✓ Based on all {transactionCount.toLocaleString("en-IN")} transactions
        {startDate && endDate && `, ${monthYear(new Date(startDate))} – ${monthYear(new Date(endDate))}`}
      </p>
    );
  }

  if (message.route === "sql" && message.data) {
    const rows =
      message.data.categories?.map((c) => ({ label: c.category, value: c.totalSpent, count: c.transactionCount })) ??
      message.data.months?.map((m) => ({ label: m.month, value: m.totalSpent, count: m.transactionCount })) ??
      [];
    const max = Math.max(...rows.map((r) => r.value), 1);

    if (rows.length === 0) {
      return <p className="mt-2 text-xs text-[#7fdcc0]">✓ Calculated exactly from your transactions</p>;
    }

    return (
      <div className="mt-3 rounded-2xl bg-black/20 p-4">
        <p className="mb-3 text-xs text-[#7fdcc0]">✓ Calculated exactly from your transactions</p>
        <ul className="space-y-2.5">
          {rows.map((row) => (
            <li key={row.label}>
              <div className="flex justify-between gap-4 text-xs">
                <span className="text-[#c8d1cd]">{row.label}</span>
                <span className="tabular-nums text-white">{inr(row.value)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full bg-[#8b7cf6]" style={{ width: `${(row.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (message.route === "rag" && message.sources?.length) {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="text-xs text-[#a7b3ae] transition-colors hover:text-white"
        >
          {open ? "Hide" : "Show"} the {message.sources.length} transactions this is based on
        </button>
        <AnimatePresence>
          {open && (
            <motion.ul
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 space-y-1.5 overflow-hidden"
            >
              {message.sources.map((source) => (
                <li key={source.transaction_id} className="rounded-xl bg-black/20 px-3 py-2 text-xs leading-relaxed text-[#c8d1cd]">
                  {source.content}
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return null;
}

/* =========================================================
   Page
========================================================= */

export default function Chat() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<Txn[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(buildQuestionGroups, []);

  // The greeting uses the logged-in person's own name (saved on their login).
  // undefined = still loading, null = not set yet (we ask for it).
  const [userName, setUserName] = useState<string | null | undefined>(undefined);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    getMyName()
      .then(setUserName)
      .catch(() => setUserName(null));
  }, []);

  async function submitName(event: FormEvent) {
    event.preventDefault();
    const clean = nameDraft.trim();
    if (!clean) return;
    setNameError(null);
    try {
      await saveMyName(clean);
      setUserName(clean);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Couldn't save your name.");
    }
  }

  // A light snapshot for the greeting card; the page works without it
  useEffect(() => {
    fetchAllTransactions()
      .then(setTransactions)
      .catch((err) => console.error(err));
  }, []);

  const snapshot = useMemo(() => {
    if (!transactions.length) return null;
    const key = monthKey(transactions[0].date);
    const month = transactions.filter((t) => t.type === "debit" && monthKey(t.date) === key);
    const byCategory = new Map<string, number>();
    for (const t of month) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount);
    const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      monthName: transactions[0].date.toLocaleDateString("en-IN", { month: "long" }),
      spent: month.reduce((sum, t) => sum + t.amount, 0),
      count: month.length,
      topCategory: top?.[0],
    };
  }, [transactions]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setQuestion("");
    setLoading(true);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data: AskResponse = await response.json();

      if (!response.ok || !data.answer) {
        throw new Error(data.error || "Something went wrong.");
      }

      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.answer!, route: data.route, sources: data.sources, data: data.data },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          failed: true,
          content: error instanceof Error ? error.message : "Unable to process your question.",
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    ask(question);
  }

  const started = messages.length > 0;
  const followUps = groups.flatMap((g) => g.questions).filter((q) => !messages.some((m) => m.content === q)).slice(0, 4);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {/* Greeting */}
      <AnimatePresence initial={false}>
        {!started && (
          <motion.section
            key="hero"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: -24 }}
            transition={{ duration: 0.4 }}
            className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#4cbc9c] via-[#3aa486] to-[#24705b] p-7 shadow-[0_30px_60px_-30px_rgba(63,174,143,0.8)] sm:p-10"
          >
            <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-28 left-1/4 h-64 w-96 rotate-12 rounded-full bg-black/15 blur-3xl" />
            {/* Decorative sparkle */}
            <svg className="pointer-events-none absolute right-8 top-8 hidden h-24 w-24 text-white/25 sm:block" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2Z" />
            </svg>

            <div className="relative max-w-2xl">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-white/75">Ask SmartSpend</p>
              <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
                {greeting()}
                {userName ? `, ${userName}` : ""}.
              </h1>
              {userName === null && (
                <form onSubmit={submitName} className="mt-5 flex max-w-md flex-wrap items-center gap-2">
                  <label htmlFor="your-name" className="w-full text-sm text-white/85">
                    What should I call you?
                  </label>
                  <input
                    id="your-name"
                    value={nameDraft}
                    maxLength={40}
                    autoComplete="given-name"
                    placeholder="Your first name"
                    onChange={(e) => setNameDraft(e.target.value)}
                    className="min-w-0 flex-1 rounded-full bg-white/90 px-4 py-2 text-[#14231e] placeholder:text-[#5d6b66] focus:outline-none focus:ring-2 focus:ring-white"
                  />
                  <button
                    type="submit"
                    disabled={!nameDraft.trim()}
                    className="rounded-full bg-black/25 px-4 py-2 text-sm font-medium text-white hover:bg-black/35 disabled:opacity-50"
                  >
                    Save
                  </button>
                  {nameError && <p className="w-full text-sm text-[#ffe0e0]">{nameError}</p>}
                </form>
              )}
              <p className="mt-3 text-lg text-white/85">
                Ask anything about your spending in plain English — totals, categories, or a payment you can&apos;t quite remember.
              </p>

              {snapshot && (
                <div className="mt-7 flex flex-wrap gap-3">
                  {[
                    { label: `${snapshot.monthName} so far`, value: inr(snapshot.spent) },
                    { label: "Payments", value: snapshot.count.toLocaleString("en-IN") },
                    ...(snapshot.topCategory ? [{ label: "Top category", value: snapshot.topCategory }] : []),
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-2xl bg-black/15 px-4 py-2.5 backdrop-blur">
                      <p className="text-xs text-white/70">{stat.label}</p>
                      <p className="text-base font-semibold text-white">{stat.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Example questions */}
      {!started && (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((group, groupIndex) => (
            <motion.section
              key={group.title}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + groupIndex * 0.06 }}
              className="glass rounded-[28px] p-5"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3fae8f]/15 text-[#7fdcc0]">{group.icon}</span>
                <div>
                  <h2 className="text-base font-medium text-white">{group.title}</h2>
                  <p className="text-xs text-[#8a9691]">{group.blurb}</p>
                </div>
              </div>
              <ul className="mt-4 space-y-2">
                {group.questions.map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      onClick={() => ask(q)}
                      className="group flex w-full items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-4 py-3 text-left text-sm text-[#e3e9e6] transition hover:bg-white/[0.08] hover:text-white"
                    >
                      <span>{q}</span>
                      <span className="shrink-0 text-[#7fdcc0] opacity-0 transition-opacity group-hover:opacity-100">
                        <SendIcon />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </motion.section>
          ))}
        </div>
      )}

      {/* Conversation */}
      {started && (
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-medium tracking-tight text-white">Ask SmartSpend</h1>
          <button
            type="button"
            onClick={() => setMessages([])}
            disabled={loading}
            className="glass rounded-full px-4 py-2 text-sm text-[#c8d1cd] transition hover:text-white disabled:opacity-40"
          >
            New chat
          </button>
        </div>
      )}

      {started && (
        <section className="glass space-y-5 rounded-[28px] p-5 sm:p-7" aria-live="polite">
          {messages.map((message, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {message.role === "assistant" && (
                <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#3fae8f]/20 text-[#7fdcc0]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2Z" />
                  </svg>
                </span>
              )}
              <div className="max-w-[85%]">
                <div
                  className={`rounded-3xl px-5 py-3 text-[15px] leading-relaxed ${
                    message.role === "user"
                      ? "rounded-br-lg bg-[#3fae8f] text-white"
                      : message.failed
                        ? "rounded-bl-lg bg-[#f08a8a]/10 text-[#ffd4d4]"
                        : "rounded-bl-lg bg-white/[0.06] text-[#eef2f0]"
                  }`}
                >
                  {message.role === "assistant" && !message.failed ? (
                    <Markdown>{message.content}</Markdown>
                  ) : (
                    <span className="whitespace-pre-wrap">{message.content}</span>
                  )}
                </div>
                {message.role === "assistant" && !message.failed && <AnswerDetails message={message} />}
              </div>
            </motion.div>
          ))}

          {loading && (
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3fae8f]/20" />
              <div className="flex gap-1.5 rounded-3xl bg-white/[0.06] px-5 py-4" aria-label="Thinking">
                {[0, 1, 2].map((dot) => (
                  <motion.span
                    key={dot}
                    className="h-2 w-2 rounded-full bg-[#7fdcc0]"
                    animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                    transition={{ duration: 1, repeat: Infinity, delay: dot * 0.15 }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </section>
      )}

      {/* Follow-up chips */}
      {started && !loading && (
        <div className="flex flex-wrap gap-2">
          {followUps.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => ask(q)}
              className="glass rounded-full px-4 py-2 text-xs text-[#c8d1cd] transition hover:text-white"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={submit}
        className="sticky bottom-24 z-10 flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#18211e]/95 p-2 pl-6 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl md:bottom-6"
      >
        <input
          ref={inputRef}
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about your spending…"
          aria-label="Ask about your spending"
          disabled={loading}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder:text-[#7d8a85] focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!question.trim() || loading}
          aria-label="Ask"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#3fae8f] text-white transition hover:bg-[#46bb9a] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SendIcon />
        </button>
      </form>
    </div>
  );
}
