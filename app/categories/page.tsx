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
      new Set(
        merchants.map((merchant) => merchant.category)
      )
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
          <h1 className="text-3xl font-bold text-white">
            Categories
          </h1>

          <p className="mt-1 text-zinc-400">
            Manage merchant categories and review categorization
            sources.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-zinc-600">
          Loading merchants...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Categories
          </h1>

          <p className="mt-1 text-zinc-400">
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
        <h1 className="text-3xl font-bold text-white">
          Categories
        </h1>

        <p className="mt-1 text-zinc-400">
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
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <p className="text-sm font-medium text-zinc-500">
                {category}
              </p>

              <p className="mt-1 text-2xl font-bold text-zinc-950">
                {count}
              </p>

              <p className="text-xs text-zinc-400">
                merchants
              </p>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <input
          type="text"
          placeholder="Search merchants..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-500 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      {/* Merchant table */}
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
                  Category Source
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredMerchants.map((merchant) => (
                <tr
                  key={merchant.id}
                  className="border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50"
                >
                  <td className="px-6 py-4 font-medium text-zinc-950">
                    {merchant.name}
                  </td>

                  <td className="px-6 py-4">
                    <span className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
                      {merchant.category}
                    </span>
                  </td>

                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        merchant.source === "manual"
                          ? "bg-zinc-200 text-zinc-800"
                          : "bg-zinc-100 text-zinc-600"
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
          <div className="p-8 text-center text-zinc-500">
            No merchants found.
          </div>
        )}
      </div>

      <div className="text-sm text-zinc-400">
        Showing {filteredMerchants.length} of{" "}
        {merchants.length} merchants
      </div>
    </div>
  );
}