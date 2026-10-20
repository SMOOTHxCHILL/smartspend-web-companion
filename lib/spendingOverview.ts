/*
 * Server-only: builds a compact summary of ALL transactions for
 * broad questions ("how can I cut my spending overall?").
 *
 * Similarity search only returns a handful of transactions, which is
 * right for "find my Swiggy orders" but useless for advice about the
 * whole picture. This file reads every transaction and condenses it
 * into a brief the model can reason over.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = {
  amount: number | string;
  type: "debit" | "credit";
  raw_merchant: string | null;
  transaction_date: string;
  merchants: { canonical_name: string; category: string } | { canonical_name: string; category: string }[] | null;
};

export type Txn = {
  amount: number;
  type: "debit" | "credit";
  merchant: string;
  category: string;
  date: Date;
};

export type SpendingOverview = {
  /** Text brief handed to the model */
  brief: string;
  transactionCount: number;
  startDate: string | null;
  endDate: string | null;
};

const PAGE = 1000; // PostgREST's default row cap per request

async function loadAllTransactions(supabase: SupabaseClient): Promise<Txn[]> {
  const rows: Row[] = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("amount, type, raw_merchant, transaction_date, merchants ( canonical_name, category )")
      .not("transaction_date", "is", null)
      .order("transaction_date", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Could not load transactions: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < PAGE) break;
  }

  return rows.map((row) => {
    const merchant = Array.isArray(row.merchants) ? row.merchants[0] : row.merchants;
    return {
      amount: Math.abs(Number(row.amount)),
      type: row.type,
      merchant: merchant?.canonical_name || row.raw_merchant || "Unknown",
      category: merchant?.category || "Other",
      date: new Date(row.transaction_date),
    };
  });
}

const rupees = (value: number) =>
  `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const monthKey = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

const day = (date: Date) => date.toISOString().slice(0, 10);

function sumBy<T>(items: T[], key: (item: T) => string, value: (item: T) => number) {
  const totals = new Map<string, { total: number; count: number }>();
  for (const item of items) {
    const entry = totals.get(key(item)) ?? { total: 0, count: 0 };
    entry.total += value(item);
    entry.count += 1;
    totals.set(key(item), entry);
  }
  return [...totals.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total);
}

/** `supabase` must be the logged-in user's client (RLS scopes it to their account). */
export async function buildSpendingOverview(supabase: SupabaseClient): Promise<SpendingOverview> {
  return summarizeTransactions(await loadAllTransactions(supabase));
}

/** Pure summary of a list of transactions (sorted oldest first). */
export function summarizeTransactions(all: Txn[]): SpendingOverview {
  if (all.length === 0) {
    return { brief: "There are no transactions recorded yet.", transactionCount: 0, startDate: null, endDate: null };
  }

  const debits = all.filter((t) => t.type === "debit");
  const credits = all.filter((t) => t.type === "credit");
  const first = all[0].date;
  const last = all[all.length - 1].date;

  const totalOut = debits.reduce((s, t) => s + t.amount, 0);
  const totalIn = credits.reduce((s, t) => s + t.amount, 0);

  // Months — every month in the range, including empty ones
  const months: string[] = [];
  for (
    let cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
    cursor <= last;
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
  ) {
    months.push(monthKey(cursor));
  }
  const monthCount = months.length;
  const monthly = months.map((key) => {
    const inMonth = all.filter((t) => monthKey(t.date) === key);
    const out = inMonth.filter((t) => t.type === "debit");
    return {
      key,
      spent: out.reduce((s, t) => s + t.amount, 0),
      received: inMonth.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0),
      count: out.length,
    };
  });

  const categories = sumBy(debits, (t) => t.category, (t) => t.amount);
  const merchants = sumBy(debits, (t) => t.merchant, (t) => t.amount);
  const merchantCategory = new Map(debits.map((t) => [t.merchant, t.category]));

  // Recurring: paid in at least 3 different months
  const monthsByMerchant = new Map<string, Set<string>>();
  for (const t of debits) {
    const set = monthsByMerchant.get(t.merchant) ?? new Set<string>();
    set.add(monthKey(t.date));
    monthsByMerchant.set(t.merchant, set);
  }
  const recurring = merchants
    .filter((m) => (monthsByMerchant.get(m.name)?.size ?? 0) >= 3)
    .slice(0, 10);

  // Small, frequent spending adds up quietly
  const SMALL = 500;
  const small = debits.filter((t) => t.amount <= SMALL);
  const smallTotal = small.reduce((s, t) => s + t.amount, 0);
  const smallByMerchant = sumBy(small, (t) => t.merchant, (t) => t.amount).slice(0, 5);

  // Weekends vs weekdays
  const weekend = debits.filter((t) => [0, 6].includes(t.date.getUTCDay()));
  const weekendTotal = weekend.reduce((s, t) => s + t.amount, 0);

  const largest = [...debits].sort((a, b) => b.amount - a.amount).slice(0, 8);

  // The newest month is usually still running; leave it out of trends
  const daysInLastMonth = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0)).getUTCDate();
  const lastMonthPartial = last.getUTCDate() < daysInLastMonth;
  const completeMonths = lastMonthPartial ? months.slice(0, -1) : months;

  // Last 3 complete months vs the 3 before, per category
  const recentKeys = new Set(completeMonths.slice(-3));
  const earlierKeys = new Set(completeMonths.slice(-6, -3));
  const trend = categories.slice(0, 8).map((c) => {
    const recent = debits
      .filter((t) => t.category === c.name && recentKeys.has(monthKey(t.date)))
      .reduce((s, t) => s + t.amount, 0);
    const earlier = debits
      .filter((t) => t.category === c.name && earlierKeys.has(monthKey(t.date)))
      .reduce((s, t) => s + t.amount, 0);
    return { name: c.name, recent, earlier };
  });

  const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(0)}%` : "0%");

  const lines = [
    `COVERAGE: all ${all.length} transactions from ${day(first)} to ${day(last)} (${monthCount} months). This is the user's complete SmartSpend history, not a sample.`,
    "",
    "TOTALS",
    `- Spent: ${rupees(totalOut)} across ${debits.length} payments (average ${rupees(totalOut / Math.max(debits.length, 1))} each, ${rupees(totalOut / monthCount)} per month)`,
    `- Received: ${rupees(totalIn)} across ${credits.length} credits`,
    `- Net: ${totalIn - totalOut >= 0 ? "+" : "−"}${rupees(Math.abs(totalIn - totalOut))}`,
    "",
    "MONTH BY MONTH (spent / received / number of payments)",
    ...monthly.map(
      (m, i) =>
        `- ${m.key}${lastMonthPartial && i === monthly.length - 1 ? ` (in progress, up to ${day(last)})` : ""}: ${rupees(m.spent)} / ${rupees(m.received)} / ${m.count}`,
    ),
    "",
    "SPENDING BY CATEGORY (total, share of spending, payments, per month)",
    ...categories.map(
      (c) => `- ${c.name}: ${rupees(c.total)}, ${pct(c.total, totalOut)}, ${c.count} payments, ${rupees(c.total / monthCount)}/month`,
    ),
    "",
    `CATEGORY TREND (last 3 complete months ${[...recentKeys].join(", ")} vs the 3 before ${[...earlierKeys].join(", ") || "—"})`,
    ...trend.map((t) => `- ${t.name}: ${rupees(t.recent)} vs ${rupees(t.earlier)}`),
    "",
    "TOP MERCHANTS BY SPEND (total, payments, average payment, category)",
    ...merchants
      .slice(0, 12)
      .map(
        (m) => `- ${m.name}: ${rupees(m.total)}, ${m.count} payments, avg ${rupees(m.total / m.count)}, ${merchantCategory.get(m.name)}`,
      ),
    "",
    "RECURRING MERCHANTS (paid in 3+ different months)",
    ...(recurring.length
      ? recurring.map(
          (m) =>
            `- ${m.name}: ${monthsByMerchant.get(m.name)?.size} months, ${rupees(m.total)} total, about ${rupees(
              m.total / (monthsByMerchant.get(m.name)?.size ?? 1),
            )} per active month`,
        )
      : ["- none"]),
    "",
    `SMALL PAYMENTS (≤ ${rupees(SMALL)}): ${small.length} payments totalling ${rupees(smallTotal)} (${pct(smallTotal, totalOut)} of spending)`,
    ...smallByMerchant.map((m) => `- ${m.name}: ${m.count} small payments, ${rupees(m.total)}`),
    "",
    `WEEKENDS: ${rupees(weekendTotal)} (${pct(weekendTotal, totalOut)} of spending, ${weekend.length} payments)`,
    "",
    "LARGEST SINGLE PAYMENTS",
    ...largest.map((t) => `- ${day(t.date)}: ${rupees(t.amount)} at ${t.merchant} (${t.category})`),
  ];

  return {
    brief: lines.join("\n"),
    transactionCount: all.length,
    startDate: first.toISOString(),
    endDate: last.toISOString(),
  };
}
