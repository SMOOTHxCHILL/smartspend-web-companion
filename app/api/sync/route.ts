/*
 * POST /api/sync — the Android app uploads its parsed transactions here.
 *
 * Auth: "Authorization: Bearer <Supabase access token>" (or a website
 * session cookie). Everything runs as that user, so Row Level Security
 * keeps the rows inside their account.
 *
 * Body: { items: SyncItem[] }  (at most 500 per request; the app batches)
 * Reply: { inserted, updated, embedded, warning? }
 *
 * Re-sending the same transactions is safe: rows are matched on the SMS
 * hash, so nothing is duplicated.
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabaseServer";
import { embedTransactions } from "@/lib/embeddings";

export const maxDuration = 60;

const MAX_ITEMS = 500;
const EMBED_PER_REQUEST = 200;

type SyncItem = {
  source_hash: string;
  dedup_hash?: string;
  bank: string;
  amount: number;
  type: "debit" | "credit";
  raw_merchant: string;
  transaction_date: string | null;
  confidence: number;
  merchant: { name: string; category: string; category_source: string; mcc?: string | null } | null;
};

function isItem(value: unknown): value is SyncItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.source_hash === "string" &&
    /^[a-f0-9]{16,128}$/i.test(item.source_hash) &&
    typeof item.amount === "number" &&
    Number.isFinite(item.amount) &&
    (item.type === "debit" || item.type === "credit") &&
    (item.transaction_date === null || typeof item.transaction_date === "string")
  );
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  let items: unknown;
  try {
    items = (await request.json())?.items;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(items) || items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `items must be an array of at most ${MAX_ITEMS}.` }, { status: 400 });
  }

  const valid = items.filter(isItem);
  const skipped = items.length - valid.length;

  // Make sure this login has an account (first sync straight after login)
  const { error: accountError } = await supabase.rpc("ensure_account");
  if (accountError) {
    return NextResponse.json({ error: accountError.message }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("sync_transactions", { p_items: valid });
  if (error) {
    console.error("Sync error:", error);
    return NextResponse.json({ error: `Sync failed: ${error.message}` }, { status: 500 });
  }

  const changed = (data ?? []) as Array<{ id: number; inserted: boolean }>;
  const inserted = changed.filter((row) => row.inserted).length;
  const updatedIds = changed.filter((row) => !row.inserted).map((row) => Number(row.id));

  // Keep Ask SmartSpend up to date: re-embed rows whose merchant changed,
  // then catch up on any rows that have no embedding yet. Best-effort —
  // the data is already saved.
  let embedded = 0;
  let warning: string | undefined;
  try {
    const { data: missing, error: missingError } = await supabase.rpc("transactions_missing_embeddings", {
      p_limit: EMBED_PER_REQUEST,
    });
    if (missingError) throw new Error(missingError.message);

    const ids = [...new Set([...updatedIds, ...((missing ?? []) as number[]).map(Number)])].slice(
      0,
      EMBED_PER_REQUEST,
    );
    embedded = await embedTransactions(supabase, ids);
  } catch (embeddingError) {
    console.error("Embedding after sync failed:", embeddingError);
    warning = "Transactions saved, but Ask SmartSpend could not be updated yet. It will catch up on the next sync.";
  }

  return NextResponse.json({ inserted, updated: updatedIds.length, skipped, embedded, warning });
}
