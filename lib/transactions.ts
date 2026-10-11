/*
 * Shared, client-safe helpers for loading and formatting transactions.
 * Every page uses these so numbers always agree with each other.
 */

export type MerchantInfo = {
  canonical_name: string;
  category: string;
  category_source: string;
};

export type ApiTransaction = {
  id: number;
  bank: string;
  amount: number | string;
  type: "debit" | "credit";
  raw_merchant: string;
  transaction_date: string | null;
  merchant_id: number | null;
  merchants: MerchantInfo | MerchantInfo[] | null;
};

export type Txn = {
  id: number;
  merchantId: number | null;
  merchant: string;
  category: string;
  bank: string;
  /** Always positive — use `type` (or `signedAmount`) for direction. */
  amount: number;
  type: "debit" | "credit";
  date: Date;
};

/** Debits count against you, credits for you. */
export const signedAmount = (t: Pick<Txn, "amount" | "type">) =>
  t.type === "credit" ? t.amount : -t.amount;

export async function fetchAllTransactions(): Promise<Txn[]> {
  const getPage = async (page: number) => {
    const response = await fetch(`/api/transactions?page=${page}&limit=100`);
    if (!response.ok) throw new Error("Failed to fetch transactions");
    return response.json() as Promise<{
      data: ApiTransaction[];
      pagination: { totalPages: number };
    }>;
  };

  const first = await getPage(1);
  const rest = await Promise.all(
    Array.from({ length: Math.max(first.pagination.totalPages - 1, 0) }, (_, i) =>
      getPage(i + 2),
    ),
  );

  return [first, ...rest]
    .flatMap((page) => page.data)
    .filter((t) => t.transaction_date)
    .map((t) => {
      const merchant = Array.isArray(t.merchants) ? t.merchants[0] : t.merchants;
      return {
        id: t.id,
        merchantId: t.merchant_id,
        merchant: merchant?.canonical_name || t.raw_merchant || "Unknown",
        category: merchant?.category || "Other",
        bank: t.bank,
        // Stored amounts are treated as sizes; the sign comes from `type`.
        amount: Math.abs(Number(t.amount)),
        type: t.type,
        date: new Date(t.transaction_date as string),
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

/* ---------------- Formatting ---------------- */

export const inr = (value: number, decimals = 0) =>
  `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;

/** "+₹1,200.00" / "−₹350.00" */
export const signedInr = (value: number, decimals = 2) =>
  `${value < 0 ? "−" : "+"}${inr(Math.abs(value), decimals)}`;

export const compactInr = (value: number) => {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1).replace(/\.0$/, "")}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${sign}₹${Math.round(abs)}`;
};

export const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export const shortDate = (date: Date) =>
  date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export const fullDate = (date: Date) =>
  date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export const monthYear = (date: Date) =>
  date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });

export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

/* ---------------- Colours ---------------- */

/** Chart colours in rank order */
export const SLICE_COLORS = ["#8b7cf6", "#d4f27a", "#3fae8f", "#7cc4e8"];

const AVATAR_COLORS = ["#8b7cf6", "#3fae8f", "#e8a26b", "#7cc4e8", "#d97fb5", "#c6d86b"];

/** Stable colour for a category (or any label) */
export function colorFor(text: string) {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
