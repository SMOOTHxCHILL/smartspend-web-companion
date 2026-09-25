const monthlyData = [
  { month: "April", amount: 18200 },
  { month: "May", amount: 21500 },
  { month: "June", amount: 19800 },
  { month: "July", amount: 24300 },
  { month: "August", amount: 22100 },
  { month: "September", amount: 23700 },
];

const categoryData = [
  { category: "Food", amount: 12450 },
  { category: "Groceries", amount: 8750 },
  { category: "Fuel", amount: 5200 },
  { category: "Shopping", amount: 4100 },
  { category: "Bills", amount: 3200 },
];

export default function Reports() {
  const totalSpent = monthlyData.reduce(
    (sum, month) => sum + month.amount,
    0
  );

  const currentMonth = monthlyData[monthlyData.length - 1].amount;
  const previousMonth = monthlyData[monthlyData.length - 2].amount;

  const monthChange =
    ((currentMonth - previousMonth) / previousMonth) * 100;

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
            ₹{totalSpent.toLocaleString("en-IN")}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-6">
          <p className="text-sm text-gray-500">
            Current Month
          </p>
          <p className="mt-2 text-3xl font-bold">
            ₹{currentMonth.toLocaleString("en-IN")}
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

        <div className="mt-6 space-y-4">
          {monthlyData.map((month) => (
            <div key={month.month}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{month.month}</span>
                <span className="font-medium">
                  ₹{month.amount.toLocaleString("en-IN")}
                </span>
              </div>

              <div className="h-3 rounded-full bg-gray-100">
                <div
                  className="h-3 rounded-full bg-black"
                  style={{
                    width: `${(month.amount / 25000) * 100}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top categories */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold">
          Top Categories
        </h2>

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
                ₹{category.amount.toLocaleString("en-IN")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}