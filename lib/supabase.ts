/*
 * Browser Supabase client (login page, account page).
 * The session is stored in cookies so server routes can read it.
 * Only the public anon key is used here; Row Level Security does the rest.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables");
  }

  // Go through our own site's /supabase proxy (see next.config.ts) so phones
  // that can't reach *.supabase.co still work. Keep the cookie name tied to
  // the real project, so server routes (which call Supabase directly) still
  // find the session.
  const projectRef = new URL(url).hostname.split(".")[0];
  const proxiedUrl = typeof window === "undefined" ? url : `${window.location.origin}/supabase`;

  client = createBrowserClient(proxiedUrl, anonKey, {
    cookieOptions: { name: `sb-${projectRef}-auth-token` },
  });
  return client;
}

/**
 * The logged-in person's display name, kept in their Supabase login
 * (user_metadata.display_name), so each phone number has its own name.
 * Returns null when it hasn't been set yet.
 */
export async function getMyName(): Promise<string | null> {
  const { data } = await getBrowserSupabase().auth.getUser();
  const name = data.user?.user_metadata?.display_name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export async function saveMyName(name: string): Promise<void> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!clean) throw new Error("Please enter a name.");
  const { error } = await getBrowserSupabase().auth.updateUser({ data: { display_name: clean } });
  if (error) throw error;
}

/** "+91 98765 43210" from "919876543210" */
export function formatPhone(digits: string) {
  const d = digits.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return `+${d}`;
}

/** Turns what someone typed into E.164 ("+919876543210"). Bare 10 digits = India. */
export function toE164(input: string) {
  const d = input.replace(/\D/g, "");
  if (d.length === 10) return `+91${d}`;
  return `+${d}`;
}

/** Postgres/Supabase error → a sentence for the page. */
export function errorText(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Something went wrong. Please try again.";
}
