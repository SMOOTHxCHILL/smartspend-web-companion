"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { AnimatedNumber, Avatar, ErrorPanel, Panel, PanelHeader, PageHeader, Pills } from "@/components/ui";
import {
  colorFor,
  compactInr,
  fetchAllTransactions,
  inr,
  monthKey,
  monthYear,
  percentChange,
  shortDate,
  SLICE_COLORS,
  type Txn,
} from "@/lib/transactions";

type Mode = "debit" | "credit";

type MonthBucket = {
  key: string; // YYYY-MM
  label: string; // "Oct"
  fullLabel: string; // "Oct 2026"
  spent: number;
  received: number;
};

/* =========================================================
   Money flow — hatched bar chart
========================================================= */

function niceMax(value: number) {
  if (value <= 0) return 1000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const step = steps.find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

function FlowChart({
  months,
  mode,
  selected,
  onSelect,
}: {
  months: MonthBucket[];
  mode: Mode;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const values = months.map((m) => (mode === "debit" ? m.spent : m.received));
  const max = niceMax(Math.max(...values, 0));
  const ticks = [1, 0.8, 0.6, 0.4, 0.2, 0].map((f) => max * f);

  return (
    <div className="mt-6 flex gap-3 sm:gap-5">
      {/* Y axis */}
      <div className="flex h-[200px] flex-col justify-between pb-0 text-[11px] text-[#c8d1cd] sm:text-xs">
        {ticks.map((tick) => (
          <span key={tick} className="leading-none">
            {compactInr(tick)}
          </span>
        ))}
      </div>

      {/* Bars */}
      <div className="grid flex-1 gap-2 sm:gap-4" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
        {months.map((month, index) => {
          const value = values[index];
          const height = value > 0 ? Math.max((value / max) * 100, 16) : 4;
          const isSelected = index === selected;

          return (
            <button
              key={month.key}
              type="button"
              onClick={() => onSelect(index)}
              onMouseEnter={() => onSelect(index)}
              onFocus={() => onSelect(index)}
              aria-label={`${month.fullLabel}: ${inr(value)}`}
              aria-pressed={isSelected}
              className="group flex flex-col items-center focus:outline-none"
            >
              <div className="relative flex h-[200px] w-full items-end justify-center">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${height}%` }}
                  transition={{ duration: 0.7, delay: 0.15 + index * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  className="relative w-full max-w-[76px] rounded-full transition-[filter] duration-200 group-focus-visible:ring-2 group-focus-visible:ring-white/60"
                  style={
                    isSelected
                      ? { background: "var(--violet)", boxShadow: "0 12px 30px -10px rgba(139,124,246,0.8)" }
                      : {
                          background:
                            "repeating-linear-gradient(135deg, rgba(139,124,246,0.9) 0 1.5px, transparent 1.5px 6px), rgba(139,124,246,0.06)",
                        }
                  }
                >
                  {isSelected && (
                    <>
                      {/* Value pill above the bar */}
                      <span className="absolute -top-[52px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-[#2a3531] px-3 py-1.5 text-xs font-medium text-white shadow-lg">
                        {inr(value)}
                      </span>
                      {/* Ring marker */}
                      <span className="absolute left-1/2 top-1.5 h-5 w-5 -translate-x-1/2 rounded-full border-[3px] border-white bg-[#2a3531]" />
                    </>
                  )}
                </motion.div>
              </div>
              <span className={`mt-2.5 text-xs transition-colors sm:text-sm ${isSelected ? "text-white" : "text-[#a7b3ae]"}`}>
                {month.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================
   Category donut
========================================================= */

type Slice = { name: string; amount: number; color: string };

function Donut({ slices, total, caption }: { slices: Slice[]; total: number; caption: string }) {
  const size = 200;
  const stroke = 26;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Round caps poke out by stroke/2 on each side, so the gap must cover them.
  const gap = slices.length > 1 ? stroke + 10 : 0;

  const fractions = slices.map((slice) => (total > 0 ? slice.amount / total : 0));
  const arcs = slices.map((slice, index) => {
    const before = fractions.slice(0, index).reduce((sum, f) => sum + f, 0);
    return {
      ...slice,
      length: Math.max(fractions[index] * circumference - gap, 0.5),
      start: before * circumference + gap / 2,
    };
  });

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[200px]">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90" role="img" aria-label={`${caption}: ${inr(total)}`}>
        {total === 0 && (
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        )}
        {arcs.map((arc, index) => (
          <motion.circle
            key={arc.name}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={stroke}
            strokeLinecap={slices.length > 1 ? "round" : "butt"}
            strokeDashoffset={-arc.start}
            initial={{ strokeDasharray: `0 ${circumference}` }}
            animate={{ strokeDasharray: `${arc.length} ${circumference}` }}
            transition={{ duration: 0.8, delay: 0.25 + index * 0.1, ease: "easeOut" }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-semibold tracking-tight text-white">
          <AnimatedNumber value={total} format={(v) => compactInr(v)} />
        </span>
        <span className="mt-0.5 text-xs text-[#c8d1cd]">{caption}</span>
      </div>
    </div>
  );
}

/* =========================================================
   Sparkline for the "Spending" tile
========================================================= */

function smoothPath(points: Array<[number, number]>) {
  if (points.length < 2) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function Sparkline({ values }: { values: number[] }) {
  const width = 160;
  const height = 64;
  const max = Math.max(...values, 1);
  const points = values.map(
    (v, i) => [(i / Math.max(values.length - 1, 1)) * width, height - 6 - (v / max) * (height - 12)] as [number, number],
  );

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full overflow-visible" aria-hidden>
      <defs>
        <linearGradient id="sparkStroke" x1="0" x2="1">
          <stop offset="0%" stopColor="#3fae8f" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#5fd3b0" />
        </linearGradient>
      </defs>
      <motion.path
        d={smoothPath(points)}
        fill="none"
        stroke="url(#sparkStroke)"
        strokeWidth="5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, delay: 0.5, ease: "easeInOut" }}
      />
    </svg>
  );
}

/* =========================================================
   Page
========================================================= */

const MODES: Array<{ id: Mode; label: string }> = [
  { id: "debit", label: "Spent" },
  { id: "credit", label: "Received" },
];

const MONTHS_SHOWN = 6;

export default function Dashboard() {
  const [transactions, setTransactions] = useState<Txn[] | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("debit");
  const [selected, setSelected] = useState(MONTHS_SHOWN - 1);

  useEffect(() => {
    fetchAllTransactions()
      .then(setTransactions)
      .catch((err) => {
        console.error(err);
        setError("Unable to load your transactions.");
      });
  }, []);

  const stats = useMemo(() => {
    if (!transactions?.length) return null;

    // Last N calendar months, ending at the newest transaction's month
    const latest = transactions[0].date;
    const months: MonthBucket[] = Array.from({ length: MONTHS_SHOWN }, (_, i) => {
      const date = new Date(latest.getFullYear(), latest.getMonth() - (MONTHS_SHOWN - 1 - i), 1);
      return {
        key: monthKey(date),
        label: date.toLocaleDateString("en-IN", { month: "short" }),
        fullLabel: monthYear(date),
        spent: 0,
        received: 0,
      };
    });
    const byKey = new Map(months.map((m) => [m.key, m]));

    let totalIn = 0;
    let totalOut = 0;
    const banks = new Map<string, number>();

    for (const t of transactions) {
      if (t.type === "credit") totalIn += t.amount;
      else totalOut += t.amount;
      banks.set(t.bank, (banks.get(t.bank) ?? 0) + 1);

      const bucket = byKey.get(monthKey(t.date));
      if (bucket) {
        if (t.type === "credit") bucket.received += t.amount;
        else bucket.spent += t.amount;
      }
    }

    // Weekly spending for the last 10 weeks (sparkline)
    const weeks = Array.from({ length: 10 }, () => 0);
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    for (const t of transactions) {
      if (t.type !== "debit") continue;
      const weeksAgo = Math.floor((latest.getTime() - t.date.getTime()) / weekMs);
      if (weeksAgo >= 0 && weeksAgo < weeks.length) weeks[weeks.length - 1 - weeksAgo] += t.amount;
    }

    return {
      months,
      totalIn,
      totalOut,
      banks: [...banks.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
      firstDate: transactions[transactions.length - 1].date,
      latestDate: latest,
      weeks,
    };
  }, [transactions]);

  const month = stats?.months[selected];
  const previousMonth = stats?.months[selected - 1];

  // Category breakdown for the selected month and mode
  const breakdown = useMemo(() => {
    if (!transactions || !month) return { slices: [] as Slice[], total: 0 };
    const totals = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== mode || monthKey(t.date) !== month.key) continue;
      totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
    }
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const top = ranked.slice(0, 3);
    const rest = ranked.slice(3).reduce((sum, [, amount]) => sum + amount, 0);
    const slices: Slice[] = top.map(([name, amount], i) => ({ name, amount, color: SLICE_COLORS[i] }));
    if (rest > 0) slices.push({ name: "Everything else", amount: rest, color: SLICE_COLORS[3] });
    return { slices, total: ranked.reduce((sum, [, amount]) => sum + amount, 0) };
  }, [transactions, month, mode]);

  const recent = useMemo(
    () => (transactions ?? []).filter((t) => t.type === mode).slice(0, 4),
    [transactions, mode],
  );

  /* ---------- Loading / error / empty states ---------- */

  if (error) return <ErrorPanel message={error} />;

  if (!transactions) {
    return (
      <div className="animate-pulse space-y-6" aria-busy>
        <div className="h-12 w-72 rounded-xl bg-white/[0.06]" />
        <div className="h-12 w-64 rounded-full bg-white/[0.04]" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="space-y-6">
            <div className="h-[320px] rounded-[28px] bg-white/[0.05]" />
            <div className="grid gap-6 md:grid-cols-2">
              <div className="h-[300px] rounded-[28px] bg-white/[0.05]" />
              <div className="h-[300px] rounded-[28px] bg-white/[0.05]" />
            </div>
          </div>
          <div className="h-[660px] rounded-[28px] bg-white/[0.05]" />
        </div>
      </div>
    );
  }

  if (!stats || !month) {
    return (
      <div className="glass rounded-[28px] p-10 text-center">
        <h1 className="text-3xl font-medium text-white">No transactions yet</h1>
        <p className="mt-2 text-[#a7b3ae]">Once the SmartSpend app syncs your bank SMS, your dashboard fills in here.</p>
      </div>
    );
  }

  // The newest month is usually still running, so comparing it with a full
  // month would be misleading — show "so far" and skip the % change.
  const now = new Date();
  const inProgress = month.key === monthKey(now);
  const incomeChange = inProgress ? null : percentChange(month.received, previousMonth?.received ?? 0);
  const expenseChange = inProgress ? null : percentChange(month.spent, previousMonth?.spent ?? 0);
  const net = stats.totalIn - stats.totalOut;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      {/* ================= Left column ================= */}
      <div className="min-w-0 space-y-6">
        <PageHeader title="My Dashboard" />
        <Pills label="Transaction type" options={MODES} value={mode} onChange={setMode} />

        {/* Money flow */}
        <Panel className="p-6 sm:p-7" delay={0.05}>
          <PanelHeader
            title={mode === "debit" ? "Spending Flow" : "Income Flow"}
            subtitle={`Last ${MONTHS_SHOWN} months · tap a bar to inspect it`}
            href="/reports"
          />
          <div className="pt-8">
            <FlowChart months={stats.months} mode={mode} selected={selected} onSelect={setSelected} />
          </div>
        </Panel>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* Category donut */}
          <Panel className="p-6 sm:p-7" delay={0.1}>
            <PanelHeader
              title={mode === "debit" ? "Where it went" : "Where it came from"}
              subtitle={`${month.fullLabel}${inProgress ? " · so far" : ""}`}
              href="/categories"
            />
            <div className="mt-6 grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Donut
                slices={breakdown.slices}
                total={breakdown.total}
                caption={mode === "debit" ? "Total spent" : "Total received"}
              />
              <ul className="space-y-4">
                {breakdown.slices.length === 0 && (
                  <li className="text-sm text-[#a7b3ae]">Nothing {mode === "debit" ? "spent" : "received"} this month.</li>
                )}
                {breakdown.slices.map((slice) => (
                  <li key={slice.name} className="flex gap-2.5">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: slice.color }} />
                    <div>
                      <p className="text-sm text-white">{slice.name}</p>
                      <p className="text-sm text-[#c8d1cd]">{inr(slice.amount)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          {/* Income + expense */}
          <div className="grid gap-6">
            {[
              { title: "Income", value: month.received, change: incomeChange, pill: "bg-[#3fae8f]", note: "received" },
              { title: "Expense", value: month.spent, change: expenseChange, pill: "bg-[#8b7cf6]", note: "spent" },
            ].map((card, i) => (
              <Panel key={card.title} className="flex flex-col justify-between p-6" delay={0.15 + i * 0.05}>
                <h2 className="text-[22px] font-medium tracking-tight text-white">{card.title}</h2>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-3xl font-semibold tracking-tight text-white">
                      <AnimatedNumber value={card.value} format={(v) => inr(v)} />
                    </p>
                    <p className="mt-1 text-sm text-[#c8d1cd]">
                      {month.label} {card.note}
                      {inProgress ? " so far" : ""}
                    </p>
                  </div>
                  {card.change !== null && (
                    <span
                      className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-medium text-white ${card.pill}`}
                      title={`Compared with ${previousMonth?.fullLabel}`}
                      aria-label={`${card.change >= 0 ? "Up" : "Down"} ${Math.abs(card.change).toFixed(0)}% from ${previousMonth?.label}`}
                    >
                      {card.change >= 0 ? "+" : ""}
                      {card.change.toFixed(0)}%
                    </span>
                  )}
                </div>
              </Panel>
            ))}
          </div>
        </div>
      </div>

      {/* ================= Right column ================= */}
      <Panel className="flex flex-col p-5 sm:p-6" delay={0.12}>
        <PanelHeader title="My Accounts" href="/transactions" />

        {/* Stacked balance card */}
        <div className="relative mt-6">
          {stats.banks.length > 1 && (
            <>
              <div className="mx-6 h-3 rounded-t-2xl bg-[#2f7f69]/50" />
              <div className="mx-3 h-3 rounded-t-2xl bg-[#3a9a7f]/70" />
            </>
          )}
          <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#4cbc9c] via-[#3aa486] to-[#2a8068] p-6 shadow-[0_24px_50px_-20px_rgba(63,174,143,0.7)]">
            {/* Soft light streaks */}
            <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-20 left-10 h-40 w-64 rotate-12 rounded-full bg-black/10 blur-2xl" />

            <div className="relative flex items-start justify-between">
              <p className="text-sm text-white/85">Net cash flow</p>
              <Link
                href="/chat"
                title="Ask SmartSpend"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#2a8068] shadow-md transition-transform hover:scale-105"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </Link>
            </div>
            <p className="relative mt-1 text-[34px] font-bold leading-tight tracking-tight text-white">
              <AnimatedNumber value={net} format={(v) => `${v < 0 ? "−" : ""}${inr(Math.abs(v), 2)}`} />
            </p>
            <div className="relative mt-6 flex items-end justify-between gap-3 text-sm text-white/90">
              <span className="truncate font-medium tracking-wide">{stats.banks.slice(0, 3).join(" · ")}</span>
              <span className="shrink-0 text-xs text-white/75">
                {monthYear(stats.firstDate)} – {monthYear(stats.latestDate)}
              </span>
            </div>
          </div>
        </div>

        {/* In / out mini summary */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
            <p className="text-xs text-[#a7b3ae]">Money in</p>
            <p className="mt-0.5 text-base font-medium text-[#7fdcc0]">{compactInr(stats.totalIn)}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
            <p className="text-xs text-[#a7b3ae]">Money out</p>
            <p className="mt-0.5 text-base font-medium text-[#b9aefc]">{compactInr(stats.totalOut)}</p>
          </div>
        </div>

        {/* Recent transactions */}
        <div className="mt-7">
          <PanelHeader title="Transactions" href="/transactions" />
          <ul className="mt-5 space-y-4">
            {recent.length === 0 && <li className="text-sm text-[#a7b3ae]">No transactions of this type yet.</li>}
            {recent.map((t, i) => (
              <motion.li
                key={t.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.05 }}
                className="flex items-center gap-3.5"
              >
                <Avatar label={t.merchant} color={colorFor(t.category)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base text-white">{t.merchant}</p>
                  <p className="truncate text-xs text-[#8a9691]">
                    {t.category} · {shortDate(t.date)}
                  </p>
                </div>
                <span className={`shrink-0 text-base font-semibold ${t.type === "credit" ? "text-[#7fdcc0]" : "text-white"}`}>
                  {t.type === "credit" ? "+" : "−"}
                  {inr(t.amount, 2)}
                </span>
              </motion.li>
            ))}
          </ul>
        </div>

        {/* Bottom tiles */}
        <div className="mt-auto grid grid-cols-2 gap-3 pt-7">
          <Link
            href="/chat"
            className="group rounded-[22px] bg-white/[0.05] p-4 transition-colors hover:bg-white/[0.08]"
          >
            <p className="text-sm font-medium text-white">Ask SmartSpend</p>
            <p className="mt-1 text-xs leading-relaxed text-[#8a9691]">
              “How much did I spend on food last month?”
            </p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#7fdcc0] group-hover:gap-2 transition-all">
              Start a chat →
            </span>
          </Link>
          <div className="rounded-[22px] bg-white/[0.05] p-4">
            <p className="text-sm font-medium text-white">Spending</p>
            <p className="text-xs text-[#8a9691]">Last 10 weeks</p>
            <div className="mt-1">
              <Sparkline values={stats.weeks} />
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
