"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Avatar,
  ErrorPanel,
  LoadingBlocks,
  PageHeader,
  buttonGhost,
  buttonPrimary,
  inputBase,
  selectBase,
} from "@/components/ui";
import { colorFor, compactInr, fetchAllTransactions, inr, type Txn } from "@/lib/transactions";

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

type Toast = { kind: "success" | "warning" | "error"; text: string } | null;

type Dialog =
  | { kind: "create"; preselected: number[] }
  | { kind: "rename"; category: string }
  | null;

const NEW_CATEGORY = "__new__";

/* =========================================================
   Saving
========================================================= */

async function saveCategory(payload: { merchantIds?: number[]; renameFrom?: string; category: string }) {
  const response = await fetch("/api/merchants", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not save the change.");
  return result as { updated: number; reembedded: number; warning?: string };
}

/* =========================================================
   Modal shell
========================================================= */

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-lg rounded-[28px] border border-white/[0.08] bg-[#151d1a]/95 p-6 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-[#a7b3ae] hover:bg-white/[0.06] hover:text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </motion.div>
    </motion.div>
  );
}

/* =========================================================
   Create-category dialog
========================================================= */

function CreateCategoryDialog({
  merchants,
  existing,
  preselected,
  onClose,
  onSave,
}: {
  merchants: Merchant[];
  existing: string[];
  preselected: number[];
  onClose: () => void;
  onSave: (name: string, merchantIds: number[]) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set(preselected));
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();
  const clash = existing.find((c) => c.toLowerCase() === trimmed.toLowerCase());
  const shown = merchants.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed || picked.size === 0) return;
    setSaving(true);
    await onSave(clash ?? trimmed, [...picked]);
    setSaving(false);
  }

  return (
    <Modal title="New category" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm text-[#a7b3ae]">Name</span>
          <input
            autoFocus
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Subscriptions"
            className={`${inputBase} mt-1.5 w-full`}
          />
        </label>
        {clash && (
          <p className="text-xs text-[#d4f27a]">
            “{clash}” already exists — the merchants you pick will be moved into it.
          </p>
        )}

        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#a7b3ae]">Merchants to move in</span>
            <span className="text-xs text-[#8a9691]">{picked.size} selected</span>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search merchants"
            aria-label="Search merchants to add"
            className={`${inputBase} mt-1.5 w-full`}
          />
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
            {shown.map((merchant) => (
              <li key={merchant.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 hover:bg-white/[0.04]">
                  <input
                    type="checkbox"
                    checked={picked.has(merchant.id)}
                    onChange={() =>
                      setPicked((current) => {
                        const next = new Set(current);
                        if (next.has(merchant.id)) next.delete(merchant.id);
                        else next.add(merchant.id);
                        return next;
                      })
                    }
                    className="h-4 w-4 accent-[#3fae8f]"
                  />
                  <span className="flex-1 truncate text-sm text-white">{merchant.name}</span>
                  <span className="truncate text-xs text-[#8a9691]">{merchant.category}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs leading-relaxed text-[#8a9691]">
          Categories live on merchants, so a new category is saved once at least one merchant is in it.
        </p>

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className={buttonGhost}>
            Cancel
          </button>
          <button type="submit" disabled={!trimmed || picked.size === 0 || saving} className={buttonPrimary}>
            {saving ? "Saving…" : clash ? "Move merchants" : "Create category"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* =========================================================
   Rename dialog
========================================================= */

function RenameDialog({
  category,
  merchantCount,
  existing,
  onClose,
  onSave,
}: {
  category: string;
  merchantCount: number;
  existing: string[];
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(category);
  const [saving, setSaving] = useState(false);
  const trimmed = name.trim();
  const clash = existing.find((c) => c !== category && c.toLowerCase() === trimmed.toLowerCase());
  const unchanged = trimmed === category;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed || unchanged) return;
    setSaving(true);
    await onSave(clash ?? trimmed);
    setSaving(false);
  }

  return (
    <Modal title={`Rename “${category}”`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm text-[#a7b3ae]">New name</span>
          <input
            autoFocus
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            className={`${inputBase} mt-1.5 w-full`}
          />
        </label>
        <p className={`text-xs ${clash ? "text-[#d4f27a]" : "text-[#8a9691]"}`}>
          {clash
            ? `“${clash}” already exists — this will merge ${merchantCount} merchant${merchantCount === 1 ? "" : "s"} into it.`
            : `Applies to all ${merchantCount} merchant${merchantCount === 1 ? "" : "s"} in this category.`}
        </p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={buttonGhost}>
            Cancel
          </button>
          <button type="submit" disabled={!trimmed || unchanged || saving} className={buttonPrimary}>
            {saving ? "Saving…" : clash ? "Merge" : "Rename"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* =========================================================
   Page
========================================================= */

export default function Categories() {
  const [merchants, setMerchants] = useState<Merchant[] | null>(null);
  const [transactions, setTransactions] = useState<Txn[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkTarget, setBulkTarget] = useState("");
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    fetch("/api/merchants")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to fetch merchants");
        return response.json();
      })
      .then((result: { data: ApiMerchant[] }) =>
        setMerchants(
          result.data.map((m) => ({
            id: m.id,
            name: m.canonical_name,
            category: m.category,
            source: m.category_source,
          })),
        ),
      )
      .catch((err) => {
        console.error(err);
        setError("Unable to load merchant data.");
      });

    // Spending totals are a nice-to-have; the page works without them
    fetchAllTransactions()
      .then(setTransactions)
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.kind === "success" ? 3500 : 7000);
    return () => clearTimeout(timer);
  }, [toast]);

  /* ---------- Derived data ---------- */

  const { spendByMerchant, receivedByMerchant } = useMemo(() => {
    const spent = new Map<number, number>();
    const received = new Map<number, number>();
    for (const t of transactions) {
      if (t.merchantId === null) continue;
      const target = t.type === "debit" ? spent : received;
      target.set(t.merchantId, (target.get(t.merchantId) ?? 0) + t.amount);
    }
    return { spendByMerchant: spent, receivedByMerchant: received };
  }, [transactions]);

  const categoryStats = useMemo(() => {
    const stats = new Map<string, { merchants: number; spent: number; received: number }>();
    for (const m of merchants ?? []) {
      const entry = stats.get(m.category) ?? { merchants: 0, spent: 0, received: 0 };
      entry.merchants += 1;
      entry.spent += spendByMerchant.get(m.id) ?? 0;
      entry.received += receivedByMerchant.get(m.id) ?? 0;
      stats.set(m.category, entry);
    }
    return [...stats.entries()]
      .map(([name, s]) => ({ name, ...s }))
      .sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name));
  }, [merchants, spendByMerchant, receivedByMerchant]);

  const categoryNames = useMemo(() => categoryStats.map((c) => c.name).sort(), [categoryStats]);
  const totalSpent = categoryStats.reduce((sum, c) => sum + c.spent, 0);

  const filtered = useMemo(
    () =>
      (merchants ?? []).filter(
        (m) =>
          (!activeCategory || m.category === activeCategory) &&
          m.name.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [merchants, activeCategory, search],
  );

  /* ---------- Actions ---------- */

  function applyLocally(ids: number[], category: string) {
    const idSet = new Set(ids);
    setMerchants((current) =>
      (current ?? []).map((m) => (idSet.has(m.id) ? { ...m, category, source: "manual" } : m)),
    );
  }

  function report(result: { warning?: string }, success: string) {
    setToast(result.warning ? { kind: "warning", text: result.warning } : { kind: "success", text: success });
  }

  /** Returns true when the change was saved */
  async function moveMerchants(ids: number[], category: string): Promise<boolean> {
    if (!merchants || ids.length === 0) return false;
    const before = merchants;
    setSavingIds(new Set(ids));
    applyLocally(ids, category); // optimistic
    try {
      const result = await saveCategory({ merchantIds: ids, category });
      report(result, ids.length === 1 ? `Moved to ${category}.` : `Moved ${ids.length} merchants to ${category}.`);
      setSelected(new Set());
      setBulkTarget("");
      return true;
    } catch (err) {
      setMerchants(before); // undo
      setToast({ kind: "error", text: err instanceof Error ? err.message : "Could not save the change." });
      return false;
    } finally {
      setSavingIds(new Set());
    }
  }

  async function renameCategory(from: string, to: string) {
    try {
      const result = await saveCategory({ renameFrom: from, category: to });
      setMerchants((current) =>
        (current ?? []).map((m) => (m.category === from ? { ...m, category: to, source: "manual" } : m)),
      );
      if (activeCategory === from) setActiveCategory(to);
      report(result, `Renamed “${from}” to “${to}”.`);
      setDialog(null);
    } catch (err) {
      setToast({ kind: "error", text: err instanceof Error ? err.message : "Could not rename the category." });
    }
  }

  async function createCategory(name: string, ids: number[]) {
    if (await moveMerchants(ids, name)) {
      setActiveCategory(name);
      setDialog(null);
    }
  }

  function toggleSelected(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /* ---------- Render ---------- */

  const header = (
    <PageHeader title="Categories" subtitle="Sort merchants into the categories that make sense to you.">
      {merchants && (
        <button type="button" className={buttonPrimary} onClick={() => setDialog({ kind: "create", preselected: [...selected] })}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New category
        </button>
      )}
    </PageHeader>
  );

  if (error) {
    return (
      <div className="space-y-8">
        {header}
        <ErrorPanel message={error} />
      </div>
    );
  }

  if (!merchants) {
    return (
      <div className="space-y-8">
        {header}
        <LoadingBlocks heights={[150, 90, 480]} />
      </div>
    );
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((m) => selected.has(m.id));

  return (
    <div className="space-y-6">
      {header}

      {/* Category cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {categoryStats.map((category, index) => {
          const active = activeCategory === category.name;
          const share = totalSpent > 0 ? (category.spent / totalSpent) * 100 : 0;
          const color = colorFor(category.name);
          return (
            <motion.div
              key={category.name}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.03, 0.3) }}
              className={`glass group relative rounded-[24px] p-5 transition-colors ${
                active ? "ring-1 ring-[#3fae8f]/70" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveCategory(active ? null : category.name)}
                aria-pressed={active}
                className="block w-full text-left focus:outline-none"
              >
                <div className="flex items-center gap-2.5 pr-8">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="truncate text-base text-white">{category.name}</span>
                </div>
                {/* Income-type categories (salary, transfers) show what came in instead */}
                {category.spent === 0 && category.received > 0 ? (
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-[#7fdcc0]">+{compactInr(category.received)}</p>
                ) : (
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{compactInr(category.spent)}</p>
                )}
                <p className="text-xs text-[#8a9691]">
                  {category.merchants} merchant{category.merchants === 1 ? "" : "s"}
                  {category.spent === 0 && category.received > 0
                    ? " · money in"
                    : totalSpent > 0 && ` · ${share.toFixed(0)}% of spending`}
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${share}%` }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                  />
                </div>
              </button>
              <button
                type="button"
                onClick={() => setDialog({ kind: "rename", category: category.name })}
                aria-label={`Rename ${category.name}`}
                title="Rename"
                className="absolute right-3 top-3 rounded-full p-2 text-[#8a9691] opacity-100 transition hover:bg-white/[0.08] hover:text-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
                  <path d="m13.5 6.5 4 4" />
                </svg>
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="glass flex flex-col gap-3 rounded-[28px] p-4 sm:flex-row sm:items-center">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search merchants"
          aria-label="Search merchants"
          className={`${inputBase} w-full min-w-0 sm:flex-1`}
        />
        {activeCategory && (
          <button type="button" onClick={() => setActiveCategory(null)} className={buttonGhost}>
            {activeCategory}
            <span aria-hidden>×</span>
            <span className="sr-only">Clear category filter</span>
          </button>
        )}
      </div>

      {/* Bulk move bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex flex-col gap-3 rounded-[24px] border border-[#3fae8f]/30 bg-[#3fae8f]/10 p-4 sm:flex-row sm:items-center"
          >
            <span className="text-sm text-white">
              {selected.size} merchant{selected.size === 1 ? "" : "s"} selected
            </span>
            <div className="flex flex-1 flex-wrap gap-3 sm:justify-end">
              <select
                aria-label="Move selected merchants to"
                value={bulkTarget}
                onChange={(event) => {
                  if (event.target.value === NEW_CATEGORY) {
                    setDialog({ kind: "create", preselected: [...selected] });
                  } else {
                    setBulkTarget(event.target.value);
                  }
                }}
                className={selectBase}
              >
                <option value="">Move to…</option>
                {categoryNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                <option value={NEW_CATEGORY}>+ New category…</option>
              </select>
              <button
                type="button"
                disabled={!bulkTarget || savingIds.size > 0}
                onClick={() => moveMerchants([...selected], bulkTarget)}
                className={buttonPrimary}
              >
                Move
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className={buttonGhost}>
                Clear
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Merchant list */}
      <div className="glass overflow-hidden rounded-[28px]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-[#8a9691]">
              <tr className="border-b border-white/[0.06]">
                <th className="w-12 py-4 pl-6">
                  <input
                    type="checkbox"
                    aria-label="Select all shown merchants"
                    checked={allVisibleSelected}
                    onChange={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        for (const m of filtered) {
                          if (allVisibleSelected) next.delete(m.id);
                          else next.add(m.id);
                        }
                        return next;
                      })
                    }
                    className="h-4 w-4 accent-[#3fae8f]"
                  />
                </th>
                <th className="px-4 py-4 font-normal">Merchant</th>
                <th className="px-4 py-4 font-normal">Category</th>
                <th className="px-4 py-4 font-normal">Set by</th>
                <th className="px-6 py-4 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((merchant) => (
                <tr
                  key={merchant.id}
                  className={`border-b border-white/[0.04] transition-colors last:border-0 ${
                    selected.has(merchant.id) ? "bg-[#3fae8f]/[0.07]" : "hover:bg-white/[0.03]"
                  }`}
                >
                  <td className="py-3 pl-6">
                    <input
                      type="checkbox"
                      aria-label={`Select ${merchant.name}`}
                      checked={selected.has(merchant.id)}
                      onChange={() => toggleSelected(merchant.id)}
                      className="h-4 w-4 accent-[#3fae8f]"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar label={merchant.name} color={colorFor(merchant.category)} size={34} />
                      <span className="font-medium text-white">{merchant.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={`Category for ${merchant.name}`}
                      value={merchant.category}
                      disabled={savingIds.has(merchant.id)}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === NEW_CATEGORY) setDialog({ kind: "create", preselected: [merchant.id] });
                        else if (value !== merchant.category) moveMerchants([merchant.id], value);
                      }}
                      className={`${selectBase} h-9 min-w-44 text-xs disabled:opacity-50`}
                    >
                      {categoryNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                      <option value={NEW_CATEGORY}>+ New category…</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${
                        merchant.source === "manual" ? "bg-[#8b7cf6]/20 text-[#c9c0ff]" : "bg-white/[0.06] text-[#a7b3ae]"
                      }`}
                    >
                      {merchant.source === "manual" ? "You" : merchant.source}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums text-[#c8d1cd]">
                    {spendByMerchant.get(merchant.id) ? (
                      `−${inr(spendByMerchant.get(merchant.id) ?? 0)}`
                    ) : receivedByMerchant.get(merchant.id) ? (
                      <span className="text-[#7fdcc0]">+{inr(receivedByMerchant.get(merchant.id) ?? 0)}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <div className="p-10 text-center text-[#a7b3ae]">No merchants found.</div>}
      </div>

      <p className="text-sm text-[#8a9691]">
        Showing {filtered.length} of {merchants.length} merchants · {categoryNames.length} categories
      </p>

      {/* Dialogs */}
      <AnimatePresence>
        {dialog?.kind === "create" && (
          <CreateCategoryDialog
            key="create"
            merchants={merchants}
            existing={categoryNames}
            preselected={dialog.preselected}
            onClose={() => setDialog(null)}
            onSave={createCategory}
          />
        )}
        {dialog?.kind === "rename" && (
          <RenameDialog
            key="rename"
            category={dialog.category}
            merchantCount={categoryStats.find((c) => c.name === dialog.category)?.merchants ?? 0}
            existing={categoryNames}
            onClose={() => setDialog(null)}
            onSave={(name) => renameCategory(dialog.category, name)}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border px-5 py-3.5 text-sm shadow-2xl backdrop-blur-xl md:bottom-8 ${
              toast.kind === "success"
                ? "border-[#3fae8f]/40 bg-[#163a30]/95 text-[#c9f2e4]"
                : toast.kind === "warning"
                  ? "border-[#d4f27a]/40 bg-[#2f3519]/95 text-[#eaf7c3]"
                  : "border-[#f08a8a]/40 bg-[#3a1d1d]/95 text-[#ffd4d4]"
            }`}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
