"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

/* The name shown in the greeting. */
const USER_NAME = "Anirudh";

type NavItem = {
  name: string;
  href: string;
  icon: ReactNode;
};

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const icons = {
  home: (
    <svg {...iconProps}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  ),
  list: (
    <svg {...iconProps}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3 10h18" />
      <path d="M15.5 14.5h2" />
    </svg>
  ),
  tag: (
    <svg {...iconProps}>
      <path d="M3 12V4h8l10 10-8 8L3 12Z" />
      <circle cx="7.5" cy="8.5" r="1.3" />
    </svg>
  ),
  chart: (
    <svg {...iconProps}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 16v-4M12 16V8M16 16v-6" />
    </svg>
  ),
  chat: (
    <svg {...iconProps}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5Z" />
      <path d="M8.5 9.5h7M8.5 12.5h4" />
    </svg>
  ),
  search: (
    <svg {...iconProps} width={18} height={18}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
};

const mainNav: NavItem[] = [
  { name: "Dashboard", href: "/", icon: icons.home },
  { name: "Transactions", href: "/transactions", icon: icons.list },
  { name: "Reports", href: "/reports", icon: icons.chart },
];

const secondaryNav: NavItem[] = [
  { name: "Categories", href: "/categories", icon: icons.tag },
  { name: "Ask SmartSpend", href: "/chat", icon: icons.chat },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
        <circle cx="17" cy="17" r="16" fill="#1f6f5a" />
        <path d="M17 1a16 16 0 0 1 16 16H17Z" fill="#3fae8f" />
        <path d="M17 33A16 16 0 0 1 1 17h16Z" fill="#3fae8f" />
        <circle cx="17" cy="17" r="5" fill="#0a0d0c" />
      </svg>
      <span className="text-[15px] font-medium tracking-tight text-white">
        SmartSpend
      </span>
    </Link>
  );
}

function NavButton({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      title={item.name}
      aria-label={item.name}
      aria-current={active ? "page" : undefined}
      className={`group relative flex h-12 w-12 items-center justify-center rounded-full transition-all duration-200 ${
        active
          ? "bg-white text-[#1f6f5a] shadow-[0_8px_24px_-8px_rgba(63,174,143,0.7)]"
          : "text-[#a7b3ae] hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      {item.icon}
      {/* Hover label (desktop only) */}
      <span className="pointer-events-none absolute left-[calc(100%+12px)] hidden whitespace-nowrap rounded-lg bg-[#1a2320] px-2.5 py-1 text-xs text-white opacity-0 shadow-lg ring-1 ring-white/10 transition-opacity group-hover:opacity-100 md:block">
        {item.name}
      </span>
    </Link>
  );
}

function SearchBar() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const query = value.trim();
    router.push(
      query
        ? `/transactions?search=${encodeURIComponent(query)}`
        : "/transactions",
    );
  }

  return (
    <form
      onSubmit={submit}
      role="search"
      className="glass flex h-12 w-full max-w-md items-center gap-3 rounded-full px-5 text-[#a7b3ae] focus-within:ring-1 focus-within:ring-[#3fae8f]/60"
    >
      {icons.search}
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search merchants"
        aria-label="Search merchants"
        className="w-full bg-transparent text-sm text-white placeholder:text-[#8a9691] focus:outline-none"
      />
    </form>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="mx-auto min-h-screen max-w-[1440px] px-4 pb-28 sm:px-6 md:pb-10 lg:px-10">
      {/* Top bar */}
      <header className="flex items-center gap-4 py-6 md:gap-10">
        <div className="shrink-0">
          <Logo />
        </div>
        <div className="hidden flex-1 sm:block">
          <SearchBar />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-lg font-medium text-white sm:inline">
            Hi {USER_NAME}!
          </span>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#3fae8f] to-[#1f6f5a] text-base font-semibold text-white ring-2 ring-white/10">
            {USER_NAME.charAt(0)}
          </span>
        </div>
      </header>

      <div className="flex gap-6 lg:gap-10">
        {/* Side rail (tablet and up) */}
        <aside className="sticky top-6 hidden h-[calc(100vh-9rem)] shrink-0 flex-col items-center gap-5 md:flex">
          <nav className="glass flex flex-col gap-2 rounded-full p-1.5">
            {mainNav.map((item) => (
              <NavButton key={item.href} item={item} active={isActive(item.href)} />
            ))}
          </nav>
          <nav className="glass flex flex-col gap-2 rounded-full p-1.5">
            {secondaryNav.map((item) => (
              <NavButton key={item.href} item={item} active={isActive(item.href)} />
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* Bottom bar (phones) */}
      <nav className="fixed inset-x-4 bottom-4 z-40 flex justify-around rounded-full border border-white/[0.08] bg-[#151d1a]/95 p-1.5 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.9)] backdrop-blur-xl md:hidden">
        {[...mainNav, ...secondaryNav].map((item) => (
          <NavButton key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>
    </div>
  );
}
