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
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="mt-1 text-gray-500">
            Analyze your spending across months and categories.
          </p>
        </div>

        <div className="rounded-xl border bg-white p-8 text-center text-gray-500">
          Loading reports...
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="mt-1 text-gray-500">
            Analyze your spending across months and categories.
          </p>
        </div>

        <div className="rounded-xl border border-red-200 bg-white p-8 text-center text-red-600">
          {error || "Unable to load report data."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="mt-1 text-gray-500">
          Analyze your spending across months and categories.
        </p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-6">
          <p className="text-sm text-gray-500">
            Total Spending
          </p>

          <p className="mt-2 text-3xl font-bold">
            ₹{totalSpent.toLocaleString("en-IN", {
              maximumFractionDigits: 0,
            })}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-6">
          <p className="text-sm text-gray-500">
            Current Month
          </p>

          <p className="mt-2 text-3xl font-bold">
            ₹{currentMonth.toLocaleString("en-IN", {
              maximumFractionDigits: 0,
            })}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-6">
          <p className="text-sm text-gray-500">
            Month-over-Month
          </p>

          <p className="mt-2 text-3xl font-bold">
            {monthChange >= 0 ? "+" : ""}
            {monthChange.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Monthly spending */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold">
          Monthly Spending
        </h2>

        {monthlyData.length > 0 ? (
          <div className="mt-6 space-y-4">
            {monthlyData.map((month) => {
              const width =
                maxMonthlySpend > 0
                  ? (month.amount / maxMonthlySpend) * 100
                  : 0;

              return (
                <div key={month.month}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{month.month}</span>

                    <span className="font-medium">
                      ₹{month.amount.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </div>

                  <div className="h-3 rounded-full bg-gray-100">
                    <div
                      className="h-3 rounded-full bg-black"
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
          <p className="mt-6 text-sm text-gray-500">
            No monthly spending data available.
          </p>
        )}
      </div>

      {/* Top categories */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold">
          Top Categories
        </h2>

        {categoryData.length > 0 ? (
          <div className="mt-6 space-y-4">
            {categoryData.map((category, index) => (
              <div
                key={category.category}
                className="flex items-center justify-between border-b pb-4 last:border-0"
              >
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-400">
                    #{index + 1}
                  </span>

                  <span className="font-medium">
                    {category.category}
                  </span>
                </div>

                <span className="font-medium">
                  ₹{category.amount.toLocaleString("en-IN", {
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-6 text-sm text-gray-500">
            No category data available.
          </p>
        )}
      </div>
    </div>
  );
}