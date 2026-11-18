"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/fees", label: "Overview", exact: true },
  { href: "/fees/structures", label: "Fee structures" },
  { href: "/fees/items", label: "Fee items" },
  { href: "/fees/invoicing", label: "Invoicing" },
  { href: "/fees/balances", label: "Balances" },
];

export function FeesTabs() {
  const path = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-stone-200">
      {TABS.map((t) => {
        const active = t.exact ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${active ? "border-brand-600 font-medium text-brand-700" : "border-transparent text-stone-600 hover:text-stone-900"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
