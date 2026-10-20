/*
 * GET /api/account — who is logged in and which account they are in.
 * Also makes sure the login has an account (ensure_account), so a session
 * that skipped the login page's last step still lands somewhere.
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabaseServer";

type EnsureRow = {
  account_id: string;
  account_name: string;
  role: "owner" | "member";
  phone: string;
  pending_invites: number;
};

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await auth.supabase.rpc("ensure_account");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as EnsureRow | undefined;
  if (!row) {
    return NextResponse.json({ error: "No account" }, { status: 403 });
  }

  return NextResponse.json({
    accountId: row.account_id,
    accountName: row.account_name,
    role: row.role,
    phone: row.phone,
    pendingInvites: row.pending_invites,
  });
}
