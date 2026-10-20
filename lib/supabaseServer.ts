/*
 * Server-only Supabase clients that act AS the logged-in user.
 *
 * Every query made through these clients is filtered by Row Level
 * Security in Postgres, so a user can only ever see their own account's
 * data — even if an API route forgets a filter.
 *
 * Two ways to be logged in:
 *   - Website: the session lives in cookies (set by the login page).
 *   - Android app: it sends "Authorization: Bearer <access token>".
 */
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return { url, anonKey };
}

/** Cookie-based client for route handlers and server components. */
export async function createSupabaseServer(): Promise<SupabaseClient> {
  const { url, anonKey } = env();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a server component, where cookies are read-only.
          // The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/** Client for a raw access token (used by the Android app). */
function createSupabaseForToken(token: string): SupabaseClient {
  const { url, anonKey } = env();
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type AuthedRequest = { supabase: SupabaseClient; user: User };

/**
 * Resolves the caller (cookie or bearer token). Returns a 401 response
 * when nobody is logged in, so routes can do:
 *
 *   const auth = await requireUser(request);
 *   if (auth instanceof NextResponse) return auth;
 */
export async function requireUser(request: Request): Promise<AuthedRequest | NextResponse> {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";

  const supabase = bearer ? createSupabaseForToken(bearer) : await createSupabaseServer();

  // getUser() checks the token with Supabase Auth, so a forged or
  // expired token is rejected here.
  const { data, error } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json({ error: "Please log in." }, { status: 401 });
  }

  return { supabase, user: data.user };
}
