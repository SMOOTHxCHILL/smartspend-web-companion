"use client";

import { useEffect, useMemo, useState } from "react";

type ApiMerchant = {
  id: number;
  canonical_name: string;
  category: string;
  category_source: string;
};

type Merchant = {
  id: number;
  name: string;
  category: string;
  source: string;
};

export default function Categories() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchMerchants() {
      try {
        setLoading(true);

        const response = await fetch("/api/merchants");

        if (!response.ok) {
          throw new Error("Failed to fetch merchants");
        }

        const result = await response.json();

        const formattedMerchants: Merchant[] =
          result.data.map((merchant: ApiMerchant) => ({
            id: merchant.id,
            name: merchant.canonical_name,
            category: merchant.category,
            source: merchant.category_source,
          }));

        setMerchants(formattedMerchants);
      } catch (error) {
        console.error(error);
        setError("Unable to load merchant data.");
      } finally {
        setLoading(false);
      }
    }

    fetchMerchants();
  }, []);

  const categories = useMemo(() => {
    return Array.from(
      new Set(merchants.map((merchant) => merchant.category))
    ).sort();
  }, [merchants]);

  const filteredMerchants = useMemo(() => {
    return merchants.filter((merchant) =>
      merchant.name
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  }, [merchants, search]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Categories</h1>
          <p className="mt-1 text-gray-500">
            Manage merchant categories and review categorization
            sources.
          </p>
        </div>

        <div className="rounded-xl border bg-white p-8 text-center text-gray-500">
          Loading merchants...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Categories</h1>
          <p className="mt-1 text-gray-500">
            Manage merchant categories and review categorization
            sources.
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
        <h1 className="text-3xl font-bold">Categories</h1>
        <p className="mt-1 text-gray-500">
          Manage merchant categories and review categorization
          sources.
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
                    <span className="rounded-lg border bg-gray-50 px-3 py-2 text-sm">
                      {merchant.category}
                    </span>
                  </td>

                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        merchant.source === "manual"
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

      <div className="text-sm text-gray-500">
        Showing {filteredMerchants.length} of{" "}
        {merchants.length} merchants
      </div>
    </div>
  );
}