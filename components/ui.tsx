"use client";

/*
 * Shared building blocks for the dark-glass SmartSpend look.
 */

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { animate } from "animejs";
import { motion } from "motion/react";

/* ---------------- Animated number ---------------- */

export function AnimatedNumber({
  value,
  format,
}: {
  value: number;
  format: (value: number) => string;
}) {
  const [display, setDisplay] = useState(0);
  const animation = useRef<ReturnType<typeof animate> | null>(null);
  const current = useRef(0);

  useEffect(() => {
    const state = { value: current.current };
    animation.current?.pause();
    animation.current = animate(state, {
      value,
      duration: 1200,
      ease: "outExpo",
      onUpdate: () => {
        current.current = state.value;
        setDisplay(state.value);
      },
    });
    return () => {
      animation.current?.pause();
    };
  }, [value]);

  return <>{format(display)}</>;
}

/* ---------------- Panels ---------------- */

export function Panel({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: "easeOut" }}
      className={`glass rounded-[28px] ${className}`}
    >
      {children}
    </motion.section>
  );
}

export function PanelHeader({
  title,
  href,
  subtitle,
  action,
}: {
  title: ReactNode;
  href?: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-[22px] font-medium tracking-tight text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-[#8a9691]">{subtitle}</p>}
      </div>
      {action}
      {href && (
        <Link
          href={href}
          className="flex shrink-0 items-center gap-1 pt-1.5 text-sm text-[#c8d1cd] transition-colors hover:text-white"
        >
          View All
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </Link>
      )}
    </div>
  );
}

/** Big page title with optional subtitle and right-side actions */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-medium tracking-tight text-white sm:text-5xl"
        >
          {title}
        </motion.h1>
        {subtitle && <p className="mt-2 text-base text-[#a7b3ae]">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  );
}

/* ---------------- Pills (segmented choice) ---------------- */

export function Pills<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "lg",
}: {
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: "lg" | "sm";
}) {
  const sizing = size === "lg" ? "h-12 px-7 text-base" : "h-10 px-5 text-sm";
  return (
    <div className="flex flex-wrap gap-2.5" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          className={`${sizing} rounded-full transition-all duration-200 ${
            value === option.id
              ? "bg-[#3fae8f] text-white shadow-[0_10px_28px_-12px_rgba(63,174,143,0.9)]"
              : "glass text-[#c8d1cd] hover:text-white"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Buttons & inputs ---------------- */

export const buttonPrimary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#3fae8f] px-5 text-sm font-medium text-white shadow-[0_10px_28px_-14px_rgba(63,174,143,0.9)] transition hover:bg-[#46bb9a] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";

export const buttonGhost =
  "glass inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm text-[#c8d1cd] transition hover:text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";

export const inputBase =
  "h-11 rounded-full border border-white/[0.08] bg-white/[0.04] px-5 text-sm text-white placeholder:text-[#7d8a85] outline-none transition focus:border-[#3fae8f]/60 focus:bg-white/[0.06]";

/** Dark select — the option list is native, so give it a solid background */
export const selectBase = `${inputBase} appearance-none bg-[url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23a7b3ae' stroke-width='2' stroke-linecap='round'><path d='m6 9 6 6 6-6'/></svg>")] bg-[length:16px] bg-[right_16px_center] bg-no-repeat pr-11 [&>option]:bg-[#1a2320] [&>option]:text-white`;

/* ---------------- Avatars ---------------- */

export function Avatar({ label, color, size = 44 }: { label: string; color: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-[#0a0d0c]"
      style={{ background: color, width: size, height: size, fontSize: size * 0.34 }}
      aria-hidden
    >
      {label.charAt(0).toUpperCase()}
    </span>
  );
}

/* ---------------- States ---------------- */

export function LoadingBlocks({ heights }: { heights: number[] }) {
  return (
    <div className="animate-pulse space-y-6" aria-busy aria-label="Loading">
      {heights.map((height, index) => (
        <div key={index} className="rounded-[28px] bg-white/[0.05]" style={{ height }} />
      ))}
    </div>
  );
}

export function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="glass rounded-[28px] p-8">
      <p className="text-lg font-medium text-[#f08a8a]">{message}</p>
      <p className="mt-1 text-sm text-[#a7b3ae]">Check that the dev server can reach Supabase, then refresh.</p>
    </div>
  );
}
