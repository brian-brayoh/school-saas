"use client";

import { useActionState } from "react";
import { goToSchool } from "./actions";

export function SchoolFinder({ tone = "light" }: { tone?: "light" | "dark" }) {
  const [state, action, pending] = useActionState(goToSchool, null);
  const dark = tone === "dark";
  return (
    <form action={action} className="space-y-2">
      <label htmlFor={`slug-${tone}`} className={`block text-sm font-medium ${dark ? "text-white/80" : "text-ink/70"}`}>
        Already using it? Enter your school code
      </label>
      <div className="flex max-w-md gap-2">
        <input
          id={`slug-${tone}`}
          name="slug"
          defaultValue={state?.slug ?? ""}
          key={state?.slug ?? "empty"}
          placeholder="e.g. stmarys"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          className={`min-w-0 flex-1 rounded-md border px-3 py-2.5 text-[0.95rem] outline-none focus:ring-2 ${
            dark ? "border-white/25 bg-white/10 text-white placeholder:text-white/50 focus:ring-white/60" : "border-ink/20 bg-white focus:border-carbon focus:ring-carbon/25"
          }`}
        />
        <button
          disabled={pending}
          className={`shrink-0 rounded-md px-4 py-2.5 text-[0.95rem] font-semibold disabled:opacity-60 ${
            dark ? "bg-white text-carbon hover:bg-trip" : "border border-ink/20 bg-white text-ink hover:border-carbon hover:text-carbon"
          }`}
        >
          {pending ? "Opening…" : "Sign in"}
        </button>
      </div>
      {state?.error && <p className={`text-sm ${dark ? "text-dup" : "text-margin"}`}>{state.error}</p>}
    </form>
  );
}
