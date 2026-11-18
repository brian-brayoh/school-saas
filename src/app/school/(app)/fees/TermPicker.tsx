"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { inputCls } from "@/components/ui";

export function TermPicker({ terms, value }: { terms: { id: string; label: string }[]; value: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <select
      className={`${inputCls} w-48`}
      value={value}
      onChange={(e) => {
        const next = new URLSearchParams(params);
        next.set("term", e.target.value);
        router.push(`${path}?${next}`);
      }}
    >
      {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
    </select>
  );
}
