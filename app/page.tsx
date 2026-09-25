const categoryData = [
  { category: "Food", amount: 12450 },
  { category: "Groceries", amount: 8750 },
  { category: "Fuel", amount: 5200 },
  { category: "Shopping", amount: 4100 },
  { category: "Bills", amount: 3200 },
];

const monthlyData = [
  { month: "Apr", amount: 18200 },
  { month: "May", amount: 21500 },
  { month: "Jun", amount: 19800 },
  { month: "Jul", amount: 24300 },
  { month: "Aug", amount: 22100 },
  { month: "Sep", amount: 23700 },
];

const totalSpent = categoryData.reduce(
  (total, item) => total + item.amount,
  0
);

const maxMonthlySpend = Math.max(
  ...monthlyData.map((item) => item.amount)
);

export default function Home() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-black">Dashboard</h1>
        <p className="mt-1 text-black">
          Overview of your spending activity.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-black">Total Spending</p>
          <p className="mt-2 text-3xl font-bold text-black">
            ₹{totalSpent.toLocaleString("en-IN")}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-black">Transactions</p>
          <p className="mt-2 text-3xl font-bold text-black">248</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-black">
            Average Transaction
          </p>
          <p className="mt-2 text-3xl font-bold text-black">₹1,482</p>
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
              (item.amount / maxMonthlySpend) * 100;

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
              (item.amount / totalSpent) * 100;

            return (
              <div key={item.category}>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="font-medium text-black">
                    {item.category}
                  </span>

                  <span className="font-medium text-black">
                    ₹{item.amount.toLocaleString("en-IN")}
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