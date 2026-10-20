"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PageHeader, Panel, PanelHeader, buttonGhost, buttonPrimary, inputBase, selectBase } from "@/components/ui";
import { errorText, formatPhone, getBrowserSupabase, getMyName, saveMyName } from "@/lib/supabase";

type Role = "owner" | "member";

type Overview = {
  account: { id: string; name: string };
  me: { user_id: string; phone: string; role: Role };
  members: Array<{ user_id: string; phone: string; role: Role; joined_at: string }>;
  invites: Array<{ phone: string; role: Role; created_at: string }>;
  incoming_invites: Array<{
    account_id: string;
    account_name: string;
    role: Role;
    invited_by_phone: string | null;
    created_at: string;
  }>;
  transaction_count: number;
};

type ApkInfo = { size: number; updatedAt: string | null } | null;

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs ${
        role === "owner" ? "bg-[#3fae8f]/20 text-[#7fd6bb]" : "bg-white/[0.06] text-[#a7b3ae]"
      }`}
    >
      {role === "owner" ? "Owner" : "Member"}
    </span>
  );
}

export default function AccountPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [apk, setApk] = useState<ApkInfo | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState<Role>("member");
  const [name, setName] = useState("");
  const [myName, setMyName] = useState<string | null>(null);
  const [myNameDraft, setMyNameDraft] = useState("");

  const load = useCallback(async () => {
    const supabase = getBrowserSupabase();
    try {
      await supabase.rpc("ensure_account");
      const { data, error } = await supabase.rpc("get_account_overview");
      if (error) throw error;
      const value = data as Overview;
      setOverview(value);
      setName(value.account.name);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorText(err));
    }

    getMyName()
      .then((n) => {
        setMyName(n);
        setMyNameDraft(n ?? "");
      })
      .catch(() => {});

    const { data: files } = await supabase.storage.from("apk").list("", { search: "smartspend.apk" });
    const file = files?.find((f) => f.name === "smartspend.apk");
    setApk(
      file
        ? { size: Number(file.metadata?.size ?? 0), updatedAt: file.updated_at ?? file.created_at ?? null }
        : null,
    );
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data on mount
    load();
  }, [load]);

  /** Runs an account RPC, shows the result, reloads. */
  async function run(fn: string, args: Record<string, unknown> | undefined, success: string) {
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await getBrowserSupabase().rpc(fn, args);
      if (error) throw error;
      setNotice({ kind: "ok", text: success });
      await load();
      return true;
    } catch (err) {
      setNotice({ kind: "error", text: errorText(err) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addPhone(event: FormEvent) {
    event.preventDefault();
    const ok = await run(
      "add_account_phone",
      { p_phone: newPhone, p_role: newRole },
      "Number added. They'll see the invite on this page after logging in with it.",
    );
    if (ok) setNewPhone("");
  }

  async function rename(event: FormEvent) {
    event.preventDefault();
    const ok = await run("rename_account", { p_name: name }, "Account renamed.");
    if (ok) window.dispatchEvent(new Event("smartspend:account-changed"));
  }

  async function saveYourName(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await saveMyName(myNameDraft);
      setMyName(myNameDraft.trim());
      setNotice({ kind: "ok", text: "Name saved." });
    } catch (err) {
      setNotice({ kind: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await getBrowserSupabase().auth.signOut();
    window.location.assign("/login");
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Account" />
        <Panel className="p-6">
          <p className="text-[#f08a8a]">{loadError}</p>
          <button type="button" onClick={signOut} className={`${buttonGhost} mt-4`}>
            Log out
          </button>
        </Panel>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="space-y-6">
        <PageHeader title="Account" />
        <div className="h-64 animate-pulse rounded-[28px] bg-white/[0.05]" />
      </div>
    );
  }

  const isOwner = overview.me.role === "owner";
  const aloneHere = overview.members.length === 1;

  return (
    <div className="space-y-6">
      <PageHeader title="Account" subtitle={`Logged in as ${formatPhone(overview.me.phone)}`}>
        <button type="button" onClick={signOut} className={buttonGhost}>
          Log out
        </button>
      </PageHeader>

      {notice && (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={`rounded-2xl px-5 py-3 text-sm ${
            notice.kind === "error" ? "bg-[#f08a8a]/10 text-[#f08a8a]" : "bg-[#3fae8f]/10 text-[#7fd6bb]"
          }`}
        >
          {notice.text}
        </p>
      )}

      {/* Invitations to other accounts */}
      {overview.incoming_invites.map((invite) => (
        <Panel key={invite.account_id} className="p-6">
          <PanelHeader
            title={`Join "${invite.account_name}"?`}
            subtitle={`${invite.invited_by_phone ? formatPhone(invite.invited_by_phone) : "Someone"} added your number as ${
              invite.role === "owner" ? "an owner" : "a member"
            }.`}
          />
          <p className="mt-3 text-sm text-[#a7b3ae]">
            {aloneHere
              ? overview.transaction_count > 0
                ? `You'll leave "${overview.account.name}". It has ${overview.transaction_count} transactions and no other members, so it will be deleted. The SmartSpend app re-uploads your phone's transactions into the new account on its next sync.`
                : `You'll leave "${overview.account.name}", which is empty and will be deleted.`
              : `You'll leave "${overview.account.name}"; its other members keep it.`}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              className={buttonPrimary}
              onClick={() =>
                run(
                  "accept_account_invite",
                  { p_account_id: invite.account_id },
                  `You're now in "${invite.account_name}".`,
                ).then((ok) => ok && window.dispatchEvent(new Event("smartspend:account-changed")))
              }
            >
              Join account
            </button>
            <button
              type="button"
              disabled={busy}
              className={buttonGhost}
              onClick={() => run("decline_account_invite", { p_account_id: invite.account_id }, "Invite declined.")}
            >
              Decline
            </button>
          </div>
        </Panel>
      ))}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* Phone numbers */}
        <Panel className="p-6" delay={0.05}>
          <PanelHeader
            title="Phone numbers"
            subtitle="Everyone listed here can log in and see this account's data."
          />

          <ul className="mt-5 divide-y divide-white/[0.06]">
            {overview.members.map((member) => {
              const isMe = member.user_id === overview.me.user_id;
              return (
                <li key={member.user_id} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1 truncate text-white">
                    {formatPhone(member.phone)}
                    {isMe && <span className="ml-2 text-sm text-[#7d8a85]">(you)</span>}
                  </span>
                  <RoleBadge role={member.role} />
                  {isOwner && !isMe && (
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-full px-3 py-1 text-sm text-[#f08a8a] hover:bg-[#f08a8a]/10 disabled:opacity-40"
                      onClick={() => {
                        if (confirm(`Remove ${formatPhone(member.phone)}? They lose access immediately.`)) {
                          run("remove_account_member", { p_user_id: member.user_id }, "Number removed.");
                        }
                      }}
                    >
                      Remove
                    </button>
                  )}
                </li>
              );
            })}
            {overview.invites.map((invite) => (
              <li key={invite.phone} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1 truncate text-[#c8d1cd]">
                  {formatPhone(invite.phone)}
                  <span className="ml-2 text-sm text-[#7d8a85]">invited {fmtDate(invite.created_at)}</span>
                </span>
                <RoleBadge role={invite.role} />
                {isOwner && (
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-full px-3 py-1 text-sm text-[#a7b3ae] hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                    onClick={() => run("cancel_account_invite", { p_phone: invite.phone }, "Invite cancelled.")}
                  >
                    Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>

          {isOwner ? (
            <form onSubmit={addPhone} className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input
                type="tel"
                inputMode="tel"
                placeholder="+91 98765 43210"
                aria-label="Phone number to add"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className={`${inputBase} min-w-0 flex-1`}
              />
              <select
                aria-label="Role"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as Role)}
                className={selectBase}
              >
                <option value="member">Member</option>
                <option value="owner">Owner</option>
              </select>
              <button type="submit" disabled={busy || newPhone.replace(/\D/g, "").length < 10} className={buttonPrimary}>
                Add number
              </button>
            </form>
          ) : (
            <p className="mt-5 text-sm text-[#7d8a85]">Only owners can add or remove numbers.</p>
          )}
          <p className="mt-3 text-xs text-[#7d8a85]">
            Owners can add and remove numbers. Members can view data and change categories. The new number
            accepts the invite on this page after logging in.
          </p>
        </Panel>

        <div className="space-y-6">
          {/* Android app */}
          <Panel className="p-6" delay={0.1}>
            <PanelHeader title="Android app" subtitle="Reads your bank SMS and syncs them to this account." />
            {apk === undefined ? (
              <div className="mt-5 h-11 w-44 animate-pulse rounded-full bg-white/[0.05]" />
            ) : apk ? (
              <>
                <a href="/api/app/download" className={`${buttonPrimary} mt-5`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
                  </svg>
                  Download APK
                </a>
                <p className="mt-2 text-xs text-[#7d8a85]">
                  {apk.size ? `${(apk.size / 1024 / 1024).toFixed(1)} MB` : ""}
                  {apk.updatedAt ? ` · updated ${fmtDate(apk.updatedAt)}` : ""}
                </p>
                <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-[#a7b3ae]">
                  <li>Open the downloaded file on your Android phone.</li>
                  <li>If asked, allow your browser to install unknown apps.</li>
                  <li>Open SmartSpend and log in with a number on this account, then allow SMS access.</li>
                  <li>
                    When the app says &ldquo;Synced to your account&rdquo;, come back to{" "}
                    <Link href="/" className="text-[#7fd6bb] underline underline-offset-4">My Dashboard</Link> to see your
                    charts, reports and chat.
                  </li>
                </ol>
              </>
            ) : (
              <p className="mt-5 text-sm text-[#a7b3ae]">The app hasn&apos;t been uploaded yet.</p>
            )}
          </Panel>

          {/* Your name (per login, used in the chat greeting) */}
          <Panel className="p-6" delay={0.12}>
            <PanelHeader title="Your name" subtitle="Used to greet you. Only for this phone number's login." />
            <form onSubmit={saveYourName} className="mt-5 flex gap-3">
              <input
                aria-label="Your name"
                value={myNameDraft}
                maxLength={40}
                autoComplete="given-name"
                placeholder="Your first name"
                onChange={(e) => setMyNameDraft(e.target.value)}
                className={`${inputBase} min-w-0 flex-1`}
              />
              <button
                type="submit"
                disabled={busy || !myNameDraft.trim() || myNameDraft.trim() === (myName ?? "")}
                className={buttonGhost}
              >
                Save
              </button>
            </form>
          </Panel>

          {/* Account settings */}
          <Panel className="p-6" delay={0.15}>
            <PanelHeader title="Account" subtitle={`${overview.transaction_count} transactions`} />
            {isOwner ? (
              <form onSubmit={rename} className="mt-5 flex gap-3">
                <input
                  aria-label="Account name"
                  value={name}
                  maxLength={40}
                  onChange={(e) => setName(e.target.value)}
                  className={`${inputBase} min-w-0 flex-1`}
                />
                <button
                  type="submit"
                  disabled={busy || !name.trim() || name.trim() === overview.account.name}
                  className={buttonGhost}
                >
                  Rename
                </button>
              </form>
            ) : (
              <p className="mt-5 text-white">{overview.account.name}</p>
            )}

            <button
              type="button"
              disabled={busy}
              className="mt-6 text-sm text-[#f08a8a] hover:underline disabled:opacity-40"
              onClick={() => {
                const message = aloneHere
                  ? `You're the only member. Leaving deletes "${overview.account.name}" and all ${overview.transaction_count} of its transactions. Continue?`
                  : `Leave "${overview.account.name}"? You'll lose access to its data.`;
                if (confirm(message)) {
                  run("leave_account", undefined, "You left the account.").then(
                    (ok) => ok && window.dispatchEvent(new Event("smartspend:account-changed")),
                  );
                }
              }}
            >
              Leave this account
            </button>
          </Panel>
        </div>
      </div>
    </div>
  );
}
