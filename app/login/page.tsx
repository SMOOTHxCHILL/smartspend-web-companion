"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { buttonGhost, buttonPrimary, inputBase } from "@/components/ui";
import { errorText, formatPhone, getBrowserSupabase, toE164 } from "@/lib/supabase";

const RESEND_SECONDS = 60; // Supabase allows one OTP per number per minute

function safeNext(value: string | null) {
  // Only same-site paths, never "//evil.com"
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function LoginForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  const e164 = toE164(phone);
  const phoneValid = /^\+\d{11,15}$/.test(e164);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => {
    if (step === "code") codeInput.current?.focus();
  }, [step]);

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    if (!phoneValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await getBrowserSupabase().auth.signInWithOtp({ phone: e164 });
      if (error) throw error;
      setStep("code");
      setCode("");
      setResendIn(RESEND_SECONDS);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = getBrowserSupabase();
      const { error } = await supabase.auth.verifyOtp({ phone: e164, token: code, type: "sms" });
      if (error) throw error;

      // Joins the invited account, or creates a new one
      const { error: accountError } = await supabase.rpc("ensure_account");
      if (accountError) throw accountError;

      // Full reload so every server route sees the new session cookie
      window.location.assign(next);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="glass w-full max-w-md rounded-[28px] p-7 sm:p-9"
    >
      <div className="flex items-center gap-2.5">
        <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
          <circle cx="17" cy="17" r="16" fill="#1f6f5a" />
          <path d="M17 1a16 16 0 0 1 16 16H17Z" fill="#3fae8f" />
          <path d="M17 33A16 16 0 0 1 1 17h16Z" fill="#3fae8f" />
          <circle cx="17" cy="17" r="5" fill="#0a0d0c" />
        </svg>
        <span className="text-[15px] font-medium tracking-tight text-white">SmartSpend</span>
      </div>

      {step === "phone" ? (
        <form onSubmit={sendCode} className="mt-8">
          <h1 className="text-3xl font-medium tracking-tight text-white">Log in</h1>
          <p className="mt-2 text-sm text-[#a7b3ae]">
            We&apos;ll text a 6-digit code to your phone. New numbers get their own account.
          </p>

          <label htmlFor="phone" className="mt-7 block text-sm text-[#c8d1cd]">
            Phone number
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            autoFocus
            placeholder="+91 98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={`${inputBase} mt-1.5 w-full text-base`}
          />
          <p className="mt-2 text-xs text-[#7d8a85]">10-digit numbers are treated as Indian (+91).</p>

          {error && <p role="alert" className="mt-4 text-sm text-[#f08a8a]">{error}</p>}

          <button type="submit" disabled={!phoneValid || busy} className={`${buttonPrimary} mt-6 w-full`}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-8">
          <h1 className="text-3xl font-medium tracking-tight text-white">Enter the code</h1>
          <p className="mt-2 text-sm text-[#a7b3ae]">Sent to {formatPhone(e164)}.</p>

          <label htmlFor="code" className="mt-7 block text-sm text-[#c8d1cd]">
            6-digit code
          </label>
          <input
            id="code"
            ref={codeInput}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className={`${inputBase} mt-1.5 w-full text-center text-xl tracking-[0.5em]`}
          />

          {error && <p role="alert" className="mt-4 text-sm text-[#f08a8a]">{error}</p>}

          <button type="submit" disabled={code.length !== 6 || busy} className={`${buttonPrimary} mt-6 w-full`}>
            {busy ? "Checking…" : "Log in"}
          </button>

          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setError(null);
              }}
              className={`${buttonGhost} flex-1`}
            >
              Change number
            </button>
            <button
              type="button"
              onClick={() => sendCode()}
              disabled={resendIn > 0 || busy}
              className={`${buttonGhost} flex-1`}
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
            </button>
          </div>
        </form>
      )}
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
