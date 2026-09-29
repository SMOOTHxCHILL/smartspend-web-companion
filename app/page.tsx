"use client";

import { useEffect, useState } from "react";

type CategoryData = {
  category: string;
  amount: number;
};

type MonthlyData = {
  month: string;
  amount: number;
};

type SummaryData = {
  totalSpending: number;
  transactionCount: number;
  averageTransaction: number;
  categoryData: CategoryData[];
  monthlyData: MonthlyData[];
};

export default function Home() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchSummary() {
      try {
        const response = await fetch("/api/summary");

        if (!response.ok) {
          throw new Error("Failed to fetch summary");
        }

        const data = await response.json();
        setSummary(data);
      } catch (error) {
        console.error(error);
        setError("Unable to load spending data.");
      } finally {
        setLoading(false);
      }
    }

    fetchSummary();
  }, []);

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="mt-1 text-zinc-400">
            Overview of your spending activity.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-black">Loading spending data...</p>
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="mt-1 text-zinc-400">
            Overview of your spending activity.
          </p>
        </div>

        <div className="rounded-xl border border-red-200 bg-white p-6">
          <p className="text-red-600">
            {error || "Unable to load spending data."}
          </p>
        </div>
      </div>
    );
  }

  const { totalSpending, transactionCount, averageTransaction } = summary;

  const categoryData = summary.categoryData;
  const monthlyData = summary.monthlyData;

  const maxMonthlySpend =
    monthlyData.length > 0
      ? Math.max(...monthlyData.map((item) => item.amount))
      : 0;

  return (
    <div className="space-y-8">
      {/* Page heading */}
      <div>
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-zinc-400">
          Overview of your spending activity.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-black">Total Spending</p>

          <p className="mt-2 text-3xl font-bold text-black">
            ₹
            {totalSpending.toLocaleString("en-IN", {
              maximumFractionDigits: 0,
            })}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-black">Transactions</p>

          <p className="mt-2 text-3xl font-bold text-black">
            {transactionCount.toLocaleString("en-IN")}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-black">
            Average Transaction
          </p>

          <p className="mt-2 text-3xl font-bold text-black">
            ₹
            {averageTransaction.toLocaleString("en-IN", {
              maximumFractionDigits: 0,
            })}
          </p>
        </div>
      </div>

      {/* Spending trend */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-black">
          Spending Trend
        </h2>

        <div className="mt-8 flex h-72 items-end gap-4 border-b border-gray-300 px-4">
          {monthlyData.map((item) => {
            const height =
              maxMonthlySpend > 0
                ? (item.amount / maxMonthlySpend) * 100
                : 0;

            return (
              <div
                key={item.month}
                className="flex h-full flex-1 flex-col items-center justify-end"
              >
                <span className="mb-2 text-sm font-medium text-black">
                  ₹{(item.amount / 1000).toFixed(1)}k
                </span>

                <div
                  className="w-full max-w-16 rounded-t-md bg-black"
                  style={{ height: `${height}%` }}
                />

                <span className="mt-3 text-sm font-medium text-black">
                  {item.month}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category breakdown */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-black">
          Category Breakdown
        </h2>

        <div className="mt-6 space-y-5">
          {categoryData.map((item) => {
            const percentage =
              totalSpending > 0
                ? (item.amount / totalSpending) * 100
                : 0;

            return (
              <div key={item.category}>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="font-medium text-black">
                    {item.category}
                  </span>

                  <span className="font-medium text-black">
                    ₹
                    {item.amount.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>

                <div className="h-2 rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-black"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}