"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import {
  AnimatedNumber,
  Avatar,
  ErrorPanel,
  LoadingBlocks,
  PageHeader,
  Pills,
  buttonGhost,
  inputBase,
  selectBase,
} from "@/components/ui";
import {
  colorFor,
  compactInr,
  fetchAllTransactions,
  fullDate,
  inr,
  signedAmount,
  signedInr,
  type Txn,
} from "@/lib/transactions";

type TypeFilter = "all" | "debit" | "credit";
type Sort = "newest" | "oldest" | "largest" | "smallest";

const TYPE_OPTIONS: Array<{ id: TypeFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "debit", label: "Spent" },
  { id: "credit", label: "Received" },
];

const PAGE_SIZE = 50;

// useSearchParams needs a Suspense boundary when the page is prerendered
export default function TransactionsPage() {
  return (
    <Suspense fallback={null}>
      <Transactions />
    </Suspense>
  );
}

function Transactions() {
  // A search term from the top search bar arrives as ?search=...
  const searchParam = useSearchParams().get("search") ?? "";
  const [lastSearchParam, setLastSearchParam] = useState(searchParam);

  const [transactions, setTransactions] = useState<Txn[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(searchParam);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<Sort>("newest");
  const [visible, setVisible] = useState(PAGE_SIZE);

  // A new search from the top bar replaces whatever is typed here
  if (searchParam !== lastSearchParam) {
    setLastSearchParam(searchParam);
    setSearch(searchParam);
  }

  useEffect(() => {
    fetchAllTransactions()
      .then(setTransactions)
      .catch((err) => {
        console.error(err);
        setError("Unable to load transactions.");
      });
  }, []);

  const categories = useMemo(
    () => [...new Set((transactions ?? []).map((t) => t.category))].sort(),
    [transactions],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = (transactions ?? []).filter(
      (t) =>
        (typeFilter === "all" || t.type === typeFilter) &&
        (category === "All" || t.category === category) &&
        (!query || t.merchant.toLowerCase().includes(query) || t.bank.toLowerCase().includes(query)),
    );

    return result.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return a.date.getTime() - b.date.getTime();
        case "largest":
          return b.amount - a.amount;
        case "smallest":
          return a.amount - b.amount;
        default:
          return b.date.getTime() - a.date.getTime();
      }
    });
  }, [transactions, search, typeFilter, category, sort]);

  // Totals for whatever is currently filtered
  const totals = useMemo(() => {
    let moneyIn = 0;
    let moneyOut = 0;
    for (const t of filtered) {
      if (t.type === "credit") moneyIn += t.amount;
      else moneyOut += t.amount;
    }
    return { moneyIn, moneyOut, net: moneyIn - moneyOut };
  }, [filtered]);

  function exportCSV() {
    const headers = ["Date", "Merchant", "Category", "Bank", "Type", "Amount"];
    const rows = filtered.map((t) => [
      t.date.toISOString().slice(0, 10),
      t.merchant,
      t.category,
      t.bank,
      t.type,
      signedAmount(t).toFixed(2),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "smartspend-transactions.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const header = (
    <PageHeader title="Transactions" subtitle="Search, filter and export everything SmartSpend has picked up from your bank SMS.">
      {transactions && (
        <button type="button" onClick={exportCSV} className={buttonGhost}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
          </svg>
          Export CSV
        </button>
      )}
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
        <LoadingBlocks heights={[96, 120, 520]} />
      </div>
    );
  }

  const shown = filtered.slice(0, visible);

  return (
    <div className="space-y-6">
      {header}

      {/* Totals for the current filter */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: "Money in", value: totals.moneyIn, color: "text-[#7fdcc0]", format: (v: number) => `+${inr(v)}`, short: (v: number) => `+${compactInr(v)}` },
          { label: "Money out", value: totals.moneyOut, color: "text-[#b9aefc]", format: (v: number) => `−${inr(v)}`, short: (v: number) => `−${compactInr(v)}` },
          {
            label: "Net",
            value: totals.net,
            color: totals.net >= 0 ? "text-[#7fdcc0]" : "text-[#f08a8a]",
            format: (v: number) => signedInr(v, 0),
            short: (v: number) => (v >= 0 ? "+" : "") + compactInr(v),
          },
        ].map((card, index) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="glass min-w-0 rounded-[24px] px-4 py-4 sm:px-6 sm:py-5"
          >
            <p className="truncate text-xs text-[#a7b3ae] sm:text-sm">{card.label}</p>
            <p className={`mt-1 truncate text-base font-semibold tracking-tight sm:text-2xl ${card.color}`}>
              {/* Short form on phones (₹4.8L), full figure from tablet up */}
              <span className="sm:hidden">
                <AnimatedNumber value={card.value} format={card.short} />
              </span>
              <span className="hidden sm:inline">
                <AnimatedNumber value={card.value} format={card.format} />
              </span>
            </p>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="glass flex flex-col gap-4 rounded-[28px] p-4 lg:flex-row lg:items-center">
        <Pills label="Transaction type" options={TYPE_OPTIONS} value={typeFilter} onChange={setTypeFilter} size="sm" />
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <input
            type="search"
            placeholder="Search merchant or bank"
            aria-label="Search merchant or bank"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setVisible(PAGE_SIZE);
            }}
            className={`${inputBase} w-full min-w-0 sm:flex-1`}
          />
          <select
            aria-label="Category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setVisible(PAGE_SIZE);
            }}
            className={selectBase}
          >
            <option value="All">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value as Sort)} className={selectBase}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="largest">Largest amount</option>
            <option value="smallest">Smallest amount</option>
          </select>
        </div>
      </div>

      {/* List */}
      <div className="glass overflow-hidden rounded-[28px]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-[#8a9691]">
              <tr className="border-b border-white/[0.06]">
                <th className="px-6 py-4 font-normal">Merchant</th>
                <th className="px-4 py-4 font-normal">Category</th>
                <th className="px-4 py-4 font-normal">Bank</th>
                <th className="px-4 py-4 font-normal">Date</th>
                <th className="px-6 py-4 text-right font-normal">Amount</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => {
                const value = signedAmount(t);
                return (
                  <tr key={t.id} className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.03]">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar label={t.merchant} color={colorFor(t.category)} size={36} />
                        <span className="font-medium text-white">{t.merchant}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1 text-xs text-[#c8d1cd]">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorFor(t.category) }} />
                        {t.category}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-[#a7b3ae]">{t.bank}</td>
                    <td className="px-4 py-3.5 text-[#a7b3ae]">{fullDate(t.date)}</td>
                    <td
                      className={`px-6 py-3.5 text-right font-semibold tabular-nums ${
                        value >= 0 ? "text-[#7fdcc0]" : "text-white"
                      }`}
                    >
                      {signedInr(value)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && <div className="p-10 text-center text-[#a7b3ae]">No transactions match these filters.</div>}

        {filtered.length > visible && (
          <div className="border-t border-white/[0.06] p-4 text-center">
            <button type="button" onClick={() => setVisible((v) => v + PAGE_SIZE)} className={buttonGhost}>
              Show {Math.min(PAGE_SIZE, filtered.length - visible)} more
            </button>
          </div>
        )}
      </div>

      <p className="text-sm text-[#8a9691]">
        Showing {shown.length} of {filtered.length} matching · {transactions.length} total
      </p>
    </div>
  );
}
