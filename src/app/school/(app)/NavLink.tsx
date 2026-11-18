"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={`block rounded-md px-3 py-2 text-sm ${active ? "bg-brand-50 font-medium text-brand-700" : "text-stone-700 hover:bg-stone-100"}`}
    >
      {children}
    </Link>
  );
}
