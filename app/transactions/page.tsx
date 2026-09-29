"use client";

import { useEffect, useMemo, useState } from "react";

type ApiTransaction = {
  id: number;
  bank: string;
  amount: number;
  type: "debit" | "credit";
  raw_merchant: string;
  transaction_date: string | null;
  confidence: number;
  merchant_id: number | null;
  merchants:
    | {
        canonical_name: string;
        category: string;
        category_source: string;
      }
    | {
        canonical_name: string;
        category: string;
        category_source: string;
      }[]
    | null;
};

type Transaction = {
  id: number;
  merchant: string;
  amount: number;
  category: string;
  date: string;
  type: "debit" | "credit";
};

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchTransactions() {
      try {
        setLoading(true);

        const firstResponse = await fetch(
          "/api/transactions?page=1&limit=100"
        );

        if (!firstResponse.ok) {
          throw new Error("Failed to fetch transactions");
        }

        const firstResult = await firstResponse.json();

        const allTransactions = [...firstResult.data];
        const totalPages = firstResult.pagination.totalPages;

        if (totalPages > 1) {
          const remainingRequests = [];

          for (let page = 2; page <= totalPages; page++) {
            remainingRequests.push(
              fetch(`/api/transactions?page=${page}&limit=100`).then(
                (response) => {
                  if (!response.ok) {
                    throw new Error("Failed to fetch transactions");
                  }

                  return response.json();
                }
              )
            );
          }

          const remainingResults = await Promise.all(remainingRequests);

          for (const result of remainingResults) {
            allTransactions.push(...result.data);
          }
        }

        const formattedTransactions: Transaction[] =
          allTransactions.map((transaction: ApiTransaction) => {
            const merchant = Array.isArray(transaction.merchants)
              ? transaction.merchants[0]
              : transaction.merchants;

            return {
              id: transaction.id,
              merchant:
                merchant?.canonical_name ||
                transaction.raw_merchant,
              amount: Number(transaction.amount),
              category: merchant?.category || "Other",
              date: transaction.transaction_date || "",
              type: transaction.type,
            };
          });

        setTransactions(formattedTransactions);
      } catch (error) {
        console.error(error);
        setError("Unable to load transactions.");
      } finally {
        setLoading(false);
      }
    }

    fetchTransactions();
  }, []);

  const categories = useMemo(() => {
    const uniqueCategories = Array.from(
      new Set(
        transactions.map(
          (transaction) => transaction.category
        )
      )
    );

    return uniqueCategories.sort();
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    let result = transactions.filter((transaction) => {
      const matchesSearch = transaction.merchant
        .toLowerCase()
        .includes(search.toLowerCase());

      const matchesCategory =
        category === "All" ||
        transaction.category === category;

      return matchesSearch && matchesCategory;
    });

    result = [...result].sort((a, b) => {
      if (sort === "newest") {
        return b.date.localeCompare(a.date);
      }

      if (sort === "oldest") {
        return a.date.localeCompare(b.date);
      }

      if (sort === "highest") {
        return b.amount - a.amount;
      }

      return a.amount - b.amount;
    });

    return result;
  }, [transactions, search, category, sort]);

  function exportCSV() {
    const headers = ["Merchant", "Category", "Date", "Amount"];

    const rows = filteredTransactions.map((transaction) => [
      transaction.merchant,
      transaction.category,
      transaction.date
        ? new Date(
            transaction.date
          ).toLocaleDateString("en-IN")
        : "",
      transaction.amount,
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((value) =>
            `"${String(value).replace(/"/g, '""')}"`
          )
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "smartspend-transactions.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Transactions
          </h1>

          <p className="mt-1 text-zinc-400">
            Search, filter, and explore your spending history.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-zinc-600">
          Loading transactions...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Transactions
          </h1>

          <p className="mt-1 text-zinc-400">
            Search, filter, and explore your spending history.
          </p>
        </div>

        <div className="rounded-xl border border-red-200 bg-white p-8 text-center text-red-600">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">
          Transactions
        </h1>

        <p className="mt-1 text-zinc-400">
          Search, filter, and explore your spending history.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 md:flex-row">
        <input
          type="text"
          placeholder="Search merchant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-500 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        />

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        >
          <option value="All">All</option>

          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="highest">Highest amount</option>
          <option value="lowest">Lowest amount</option>
        </select>

        <button
          onClick={exportCSV}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.98]"
        >
          Export CSV
        </button>
      </div>

      {/* Transaction table */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-900">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-700">
              <tr>
                <th className="px-6 py-4 font-semibold">
                  Merchant
                </th>

                <th className="px-6 py-4 font-semibold">
                  Category
                </th>

                <th className="px-6 py-4 font-semibold">
                  Date
                </th>

                <th className="px-6 py-4 text-right font-semibold">
                  Amount
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredTransactions.map((transaction) => (
                <tr
                  key={transaction.id}
                  className="border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50"
                >
                  <td className="px-6 py-4 font-medium text-zinc-950">
                    {transaction.merchant}
                  </td>

                  <td className="px-6 py-4 text-zinc-700">
                    {transaction.category}
                  </td>

                  <td className="px-6 py-4 text-zinc-500">
                    {transaction.date
                      ? new Date(
                          transaction.date
                        ).toLocaleDateString("en-IN")
                      : "-"}
                  </td>

                  <td className="px-6 py-4 text-right font-semibold text-zinc-950">
                    ₹{transaction.amount.toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredTransactions.length === 0 && (
          <div className="p-8 text-center text-zinc-500">
            No transactions found.
          </div>
        )}
      </div>

      <div className="text-sm text-zinc-400">
        Showing {filteredTransactions.length} of{" "}
        {transactions.length} transactions
      </div>
    </div>
  );
}