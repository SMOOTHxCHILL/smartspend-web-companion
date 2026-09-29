"use client";

import { useEffect, useMemo, useState } from "react";

type MonthlyData = {
  month: string;
  amount: number;
};

type CategoryData = {
  category: string;
  amount: number;
};

type SummaryData = {
  totalSpending: number;
  transactionCount: number;
  averageTransaction: number;
  categoryData: CategoryData[];
  monthlyData: MonthlyData[];
};

export default function Reports() {
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
        setError("Unable to load report data.");
      } finally {
        setLoading(false);
      }
    }

    fetchSummary();
  }, []);

  const monthlyData = summary?.monthlyData ?? [];
  const categoryData = summary?.categoryData ?? [];

  const totalSpent = summary?.totalSpending ?? 0;

  const currentMonth =
    monthlyData.length > 0
      ? monthlyData[monthlyData.length - 1].amount
      : 0;

  const previousMonth =
    monthlyData.length > 1
      ? monthlyData[monthlyData.length - 2].amount
      : 0;

  const monthChange =
    previousMonth > 0
      ? ((currentMonth - previousMonth) / previousMonth) * 100
      : 0;

  const maxMonthlySpend = useMemo(() => {
    if (monthlyData.length === 0) {
      return 0;
    }

    return Math.max(
      ...monthlyData.map((month) => month.amount)
    );
  }, [monthlyData]);

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Reports
          </h1>

          <p className="mt-1 text-zinc-400">
            Analyze your spending across months and categories.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-zinc-600 shadow-sm">
          Loading reports...
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Reports
          </h1>

          <p className="mt-1 text-zinc-400">
            Analyze your spending across months and categories.
          </p>
        </div>

        <div className="rounded-xl border border-red-200 bg-white p-8 text-center text-red-600 shadow-sm">
          {error || "Unable to load report data."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">
          Reports
        </h1>

        <p className="mt-1 text-zinc-400">
          Analyze your spending across months and categories.
        </p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-sm font-medium text-zinc-500">
            Total Spending
          </p>

          <p className="mt-2 text-3xl font-bold text-zinc-950">
            ₹
            {totalSpent.toLocaleString("en-IN", {
              maximumFractionDigits: 0,
            })}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-sm font-medium text-zinc-500">
            Current Month
          </p>

          <p className="mt-2 text-3xl font-bold text-zinc-950">
            ₹
            {currentMonth.toLocaleString("en-IN", {
              maximumFractionDigits: 0,
            })}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-sm font-medium text-zinc-500">
            Month-over-Month
          </p>

          <p className="mt-2 text-3xl font-bold text-zinc-950">
            {monthChange >= 0 ? "+" : ""}
            {monthChange.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Monthly spending */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">
          Monthly Spending
        </h2>

        <p className="mt-1 text-sm text-zinc-500">
          Spending by month across your transaction history.
        </p>

        {monthlyData.length > 0 ? (
          <div className="mt-6 space-y-5">
            {monthlyData.map((month) => {
              const width =
                maxMonthlySpend > 0
                  ? (month.amount / maxMonthlySpend) * 100
                  : 0;

              return (
                <div key={month.month}>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="font-medium text-zinc-700">
                      {month.month}
                    </span>

                    <span className="font-semibold text-zinc-950">
                      ₹
                      {month.amount.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </div>

                  <div className="h-3 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-3 rounded-full bg-black transition-all duration-500"
                      style={{
                        width: `${width}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-6 text-sm text-zinc-500">
            No monthly spending data available.
          </p>
        )}
      </div>

      {/* Top categories */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">
          Top Categories
        </h2>

        <p className="mt-1 text-sm text-zinc-500">
          Categories ranked by total spending.
        </p>

        {categoryData.length > 0 ? (
          <div className="mt-6 space-y-4">
            {categoryData.map((category, index) => (
              <div
                key={category.category}
                className="flex items-center justify-between border-b border-zinc-100 pb-4 last:border-0 last:pb-0"
              >
                <div className="flex items-center gap-4">
                  <span className="w-8 text-sm font-medium text-zinc-400">
                    #{index + 1}
                  </span>

                  <span className="font-medium text-zinc-900">
                    {category.category}
                  </span>
                </div>

                <span className="font-semibold text-zinc-950">
                  ₹
                  {category.amount.toLocaleString("en-IN", {
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-6 text-sm text-zinc-500">
            No category data available.
          </p>
        )}
      </div>
    </div>
  );
}