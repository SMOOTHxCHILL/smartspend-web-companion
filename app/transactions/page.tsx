"use client";

import { useMemo, useState } from "react";

type Transaction = {
  id: number;
  merchant: string;
  amount: number;
  category: string;
  date: string;
};

const transactions: Transaction[] = [
  {
    id: 1,
    merchant: "Swiggy",
    amount: 540,
    category: "Food",
    date: "2026-09-22",
  },
  {
    id: 2,
    merchant: "HDFC Fuel Station",
    amount: 2200,
    category: "Fuel",
    date: "2026-09-21",
  },
  {
    id: 3,
    merchant: "DMart",
    amount: 3850,
    category: "Groceries",
    date: "2026-09-20",
  },
  {
    id: 4,
    merchant: "Amazon",
    amount: 1299,
    category: "Shopping",
    date: "2026-09-18",
  },
  {
    id: 5,
    merchant: "Zomato",
    amount: 720,
    category: "Food",
    date: "2026-09-17",
  },
  {
    id: 6,
    merchant: "Airtel",
    amount: 899,
    category: "Bills",
    date: "2026-09-15",
  },
  {
    id: 7,
    merchant: "Reliance Fresh",
    amount: 2150,
    category: "Groceries",
    date: "2026-09-14",
  },
  {
    id: 8,
    merchant: "Uber",
    amount: 460,
    category: "Transport",
    date: "2026-09-12",
  },
];

export default function Transactions() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("newest");

  const filteredTransactions = useMemo(() => {
    let result = transactions.filter((transaction) => {
      const matchesSearch = transaction.merchant
        .toLowerCase()
        .includes(search.toLowerCase());

      const matchesCategory =
        category === "All" || transaction.category === category;

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
  }, [search, category, sort]);

  function exportCSV() {
    const headers = ["Merchant", "Category", "Date", "Amount"];

    const rows = filteredTransactions.map((transaction) => [
      transaction.merchant,
      transaction.category,
      transaction.date,
      transaction.amount,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.join(","))
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Transactions</h1>
        <p className="mt-1 text-gray-500">
          Search, filter, and explore your spending history.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 md:flex-row">
        <input
          type="text"
          placeholder="Search merchant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300"
        />

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option>All</option>
          <option>Food</option>
          <option>Groceries</option>
          <option>Fuel</option>
          <option>Shopping</option>
          <option>Bills</option>
          <option>Transport</option>
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="highest">Highest amount</option>
          <option value="lowest">Lowest amount</option>
        </select>

        <button
          onClick={exportCSV}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Export CSV
        </button>
      </div>

      {/* Transaction table */}
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-gray-500">
              <tr>
                <th className="px-6 py-4 font-medium">Merchant</th>
                <th className="px-6 py-4 font-medium">Category</th>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 text-right font-medium">
                  Amount
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredTransactions.map((transaction) => (
                <tr
                  key={transaction.id}
                  className="border-b last:border-0 hover:bg-gray-50"
                >
                  <td className="px-6 py-4 font-medium">
                    {transaction.merchant}
                  </td>

                  <td className="px-6 py-4">
                    {transaction.category}
                  </td>

                  <td className="px-6 py-4 text-gray-500">
                    {new Date(transaction.date).toLocaleDateString(
                      "en-IN"
                    )}
                  </td>

                  <td className="px-6 py-4 text-right font-medium">
                    ₹{transaction.amount.toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredTransactions.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No transactions found.
          </div>
        )}
      </div>

      <div className="text-sm text-gray-500">
        Showing {filteredTransactions.length} transactions
      </div>
    </div>
  );
}