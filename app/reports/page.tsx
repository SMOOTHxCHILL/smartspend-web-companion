"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  AnimatedNumber,
  Avatar,
  ErrorPanel,
  LoadingBlocks,
  PageHeader,
  Panel,
  PanelHeader,
  Pills,
} from "@/components/ui";
import {
  colorFor,
  compactInr,
  fetchAllTransactions,
  fullDate,
  inr,
  monthKey,
  monthYear,
  signedInr,
  type Txn,
} from "@/lib/transactions";

type Range = "3" | "6" | "12" | "all";

const RANGES: Array<{ id: Range; label: string }> = [
  { id: "3", label: "3 months" },
  { id: "6", label: "6 months" },
  { id: "12", label: "12 months" },
  { id: "all", label: "All time" },
];

type MonthRow = { key: string; label: string; fullLabel: string; spent: number; received: number };

export default function Reports() {
  const [transactions, setTransactions] = useState<Txn[] | null>(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState<Range>("6");
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    fetchAllTransactions()
      .then(setTransactions)
      .catch((err) => {
        console.error(err);
        setError("Unable to load report data.");
      });
  }, []);

  const report = useMemo(() => {
    if (!transactions?.length) return null;

    const latest = transactions[0].date;
    const earliest = transactions[transactions.length - 1].date;
    const totalMonths =
      (latest.getFullYear() - earliest.getFullYear()) * 12 + latest.getMonth() - earliest.getMonth() + 1;
    const monthCount = range === "all" ? totalMonths : Number(range);

    // Month buckets, oldest first
    const months: MonthRow[] = Array.from({ length: monthCount }, (_, i) => {
      const date = new Date(latest.getFullYear(), latest.getMonth() - (monthCount - 1 - i), 1);
      return {
        key: monthKey(date),
        label: date.toLocaleDateString("en-IN", { month: "short" }),
        fullLabel: monthYear(date),
        spent: 0,
        received: 0,
      };
    });
    const byKey = new Map(months.map((m) => [m.key, m]));
    const inRange = transactions.filter((t) => byKey.has(monthKey(t.date)));

    let spent = 0;
    let received = 0;
    const categories = new Map<string, { amount: number; count: number }>();
    const merchants = new Map<string, { amount: number; count: number; category: string }>();

    for (const t of inRange) {
      const bucket = byKey.get(monthKey(t.date))!;
      if (t.type === "credit") {
        received += t.amount;
        bucket.received += t.amount;
        continue;
      }
      spent += t.amount;
      bucket.spent += t.amount;

      const c = categories.get(t.category) ?? { amount: 0, count: 0 };
      c.amount += t.amount;
      c.count += 1;
      categories.set(t.category, c);

      const m = merchants.get(t.merchant) ?? { amount: 0, count: 0, category: t.category };
      m.amount += t.amount;
      m.count += 1;
      merchants.set(t.merchant, m);
    }

    const debits = inRange.filter((t) => t.type === "debit");

    return {
      months,
      spent,
      received,
      net: received - spent,
      avgPerMonth: spent / monthCount,
      categories: [...categories.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.amount - a.amount),
      merchants: [...merchants.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 6),
      biggest: [...debits].sort((a, b) => b.amount - a.amount).slice(0, 5),
      period: `${months[0].fullLabel} – ${months[months.length - 1].fullLabel}`,
    };
  }, [transactions, range]);

  const header = (
    <PageHeader title="Reports" subtitle={report ? report.period : "Where your money comes from and goes."}>
      {transactions && <Pills label="Time range" options={RANGES} value={range} onChange={setRange} size="sm" />}
    </PageHeader>
  );

  if (error) {
    return (
      <div className="space-y-8">
        {header}
        <ErrorPanel message={error} />
      </div>
    );
  }

  if (!transactions) {
    return (
      <div className="space-y-8">
        {header}
        <LoadingBlocks heights={[110, 360, 320]} />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-8">
        {header}
        <div className="glass rounded-[28px] p-10 text-center text-[#a7b3ae]">No transactions yet.</div>
      </div>
    );
  }

  const chartMax = Math.max(...report.months.flatMap((m) => [m.spent, m.received]), 1);
  const focus = report.months[hovered ?? report.months.length - 1];

  return (
    <div className="space-y-6">
      {header}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Spent", value: report.spent, format: (v: number) => inr(v), tone: "text-white" },
          { label: "Received", value: report.received, format: (v: number) => inr(v), tone: "text-[#7fdcc0]" },
          {
            label: "Net",
            value: report.net,
            format: (v: number) => signedInr(v, 0),
            tone: report.net >= 0 ? "text-[#7fdcc0]" : "text-[#f08a8a]",
          },
          { label: "Average spent / month", value: report.avgPerMonth, format: (v: number) => inr(v), tone: "text-white" },
        ].map((kpi, index) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="glass rounded-[24px] px-6 py-5"
          >
            <p className="text-sm text-[#a7b3ae]">{kpi.label}</p>
            <p className={`mt-1 text-2xl font-semibold tracking-tight ${kpi.tone}`}>
              <AnimatedNumber value={kpi.value} format={kpi.format} />
            </p>
          </motion.div>
        ))}
      </div>

      {/* Monthly in vs out */}
      <Panel className="p-6 sm:p-7" delay={0.1}>
        <PanelHeader
          title="Money in vs out"
          subtitle={
            <span>
              {focus.fullLabel}: <span className="text-[#7fdcc0]">+{inr(focus.received)}</span> in ·{" "}
              <span className="text-[#c9c0ff]">−{inr(focus.spent)}</span> out
            </span>
          }
          action={
            <div className="flex shrink-0 items-center gap-4 pt-1.5 text-xs text-[#a7b3ae]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#3fae8f]" /> In
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#8b7cf6]" /> Out
              </span>
            </div>
          }
        />
        <div className="mt-8 overflow-x-auto pb-1">
          <div
            className="grid h-[240px] items-end gap-3"
            style={{
              gridTemplateColumns: `repeat(${report.months.length}, minmax(44px, 1fr))`,
              minWidth: report.months.length * 52,
            }}
            onMouseLeave={() => setHovered(null)}
          >
            {report.months.map((month, index) => {
              const active = (hovered ?? report.months.length - 1) === index;
              return (
                <button
                  key={month.key}
                  type="button"
                  onMouseEnter={() => setHovered(index)}
                  onFocus={() => setHovered(index)}
                  onClick={() => setHovered(index)}
                  aria-label={`${month.fullLabel}: received ${inr(month.received)}, spent ${inr(month.spent)}`}
                  className="flex h-full flex-col items-center focus:outline-none"
                >
                  <div className={`flex w-full flex-1 items-end justify-center gap-1.5 rounded-2xl pb-0 transition-colors ${active ? "bg-white/[0.04]" : ""}`}>
                    {[
                      { value: month.received, color: "#3fae8f" },
                      { value: month.spent, color: "#8b7cf6" },
                    ].map((bar, barIndex) => (
                      <motion.div
                        key={barIndex}
                        className="w-[34%] max-w-[22px] rounded-full"
                        style={{
                          background: active
                            ? bar.color
                            : `repeating-linear-gradient(135deg, ${bar.color} 0 1.5px, transparent 1.5px 5px)`,
                        }}
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max((bar.value / chartMax) * 100, bar.value > 0 ? 4 : 1)}%` }}
                        transition={{ duration: 0.6, delay: index * 0.03, ease: [0.22, 1, 0.36, 1] }}
                      />
                    ))}
                  </div>
                  <span className={`mt-2.5 text-xs ${active ? "text-white" : "text-[#a7b3ae]"}`}>{month.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Panel>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* Categories */}
        <Panel className="p-6 sm:p-7" delay={0.15}>
          <PanelHeader title="Spending by category" href="/categories" />
          <ul className="mt-6 space-y-5">
            {report.categories.length === 0 && <li className="text-sm text-[#a7b3ae]">No spending in this period.</li>}
            {report.categories.map((category, index) => {
              const share = report.spent > 0 ? (category.amount / report.spent) * 100 : 0;
              const color = colorFor(category.name);
              return (
                <li key={category.name}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2.5 text-sm text-white">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                      <span className="truncate">{category.name}</span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-white">
                      {inr(category.amount)}
                      <span className="ml-2 text-xs text-[#8a9691]">{share.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${share}%` }}
                      transition={{ duration: 0.7, delay: 0.2 + index * 0.04 }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-[#8a9691]">
                    {category.count} transaction{category.count === 1 ? "" : "s"}
                  </p>
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="space-y-6">
          {/* Top merchants */}
          <Panel className="p-6 sm:p-7" delay={0.2}>
            <PanelHeader title="Top merchants" subtitle="By amount spent" />
            <ul className="mt-5 space-y-4">
              {report.merchants.map((merchant) => (
                <li key={merchant.name} className="flex items-center gap-3.5">
                  <Avatar label={merchant.name} color={colorFor(merchant.category)} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-white">{merchant.name}</p>
                    <p className="truncate text-xs text-[#8a9691]">
                      {merchant.count} payment{merchant.count === 1 ? "" : "s"} · {merchant.category}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-white">{compactInr(merchant.amount)}</span>
                </li>
              ))}
            </ul>
          </Panel>

          {/* Biggest expenses */}
          <Panel className="p-6 sm:p-7" delay={0.25}>
            <PanelHeader title="Biggest expenses" href="/transactions" />
            <ul className="mt-5 space-y-3">
              {report.biggest.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.03] px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">{t.merchant}</p>
                    <p className="text-xs text-[#8a9691]">{fullDate(t.date)}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-white">−{inr(t.amount, 2)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
