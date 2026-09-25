"use client";

import { useState } from "react";

type Merchant = {
  id: number;
  name: string;
  category: string;
  source: "ML" | "Manual";
};

const initialMerchants: Merchant[] = [
  { id: 1, name: "Swiggy", category: "Food", source: "ML" },
  { id: 2, name: "Zomato", category: "Food", source: "ML" },
  { id: 3, name: "DMart", category: "Groceries", source: "ML" },
  { id: 4, name: "Reliance Fresh", category: "Groceries", source: "Manual" },
  { id: 5, name: "HDFC Fuel Station", category: "Fuel", source: "ML" },
  { id: 6, name: "Amazon", category: "Shopping", source: "Manual" },
  { id: 7, name: "Airtel", category: "Bills", source: "ML" },
  { id: 8, name: "Uber", category: "Transport", source: "ML" },
];

const categories = [
  "Food",
  "Groceries",
  "Fuel",
  "Shopping",
  "Bills",
  "Transport",
];

export default function Categories() {
  const [merchants, setMerchants] = useState(initialMerchants);
  const [search, setSearch] = useState("");

  const filteredMerchants = merchants.filter((merchant) =>
    merchant.name.toLowerCase().includes(search.toLowerCase())
  );

  function updateCategory(id: number, category: string) {
    setMerchants((current) =>
      current.map((merchant) =>
        merchant.id === id
          ? {
              ...merchant,
              category,
              source: "Manual",
            }
          : merchant
      )
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Categories</h1>
        <p className="mt-1 text-gray-500">
          Manage merchant categories and review categorization sources.
        </p>
      </div>

      {/* Category summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => {
          const count = merchants.filter(
            (merchant) => merchant.category === category
          ).length;

          return (
            <div
              key={category}
              className="rounded-xl border bg-white p-5"
            >
              <p className="text-sm text-gray-500">{category}</p>
              <p className="mt-1 text-2xl font-bold">{count}</p>
              <p className="text-xs text-gray-400">merchants</p>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="rounded-xl border bg-white p-4">
        <input
          type="text"
          placeholder="Search merchants..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300"
        />
      </div>

      {/* Merchant table */}
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-gray-500">
              <tr>
                <th className="px-6 py-4 font-medium">Merchant</th>
                <th className="px-6 py-4 font-medium">Category</th>
                <th className="px-6 py-4 font-medium">
                  Category Source
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredMerchants.map((merchant) => (
                <tr
                  key={merchant.id}
                  className="border-b last:border-0 hover:bg-gray-50"
                >
                  <td className="px-6 py-4 font-medium">
                    {merchant.name}
                  </td>

                  <td className="px-6 py-4">
                    <select
                      value={merchant.category}
                      onChange={(e) =>
                        updateCategory(
                          merchant.id,
                          e.target.value
                        )
                      }
                      className="rounded-lg border px-3 py-2 text-sm"
                    >
                      {categories.map((category) => (
                        <option key={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        merchant.source === "Manual"
                          ? "bg-gray-200 text-gray-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {merchant.source}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredMerchants.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No merchants found.
          </div>
        )}
      </div>
    </div>
  );
}