"use client";

import { useEffect, useState } from "react";

type Row = {
  sms: string;
  amount: number;
  adm: string;
  name: string;
  cls: string;
  result: "receipted" | "suggested";
  receipt?: string;
};

const ROWS: Row[] = [
  { sms: "SKL4AB7Q21 Confirmed. Ksh5,000.00 from JANE WANJIKU, account d-0001", amount: 5000, adm: "D0001", name: "Wanjiku Kamau", cls: "Grade 4 East", result: "receipted", receipt: "RCT-2027-00412" },
  { sms: "SKL9CD2M04 Confirmed. Ksh12,000.00 from PAUL OTIENO, account ADM 0012", amount: 12000, adm: "D0012", name: "Brian Otieno", cls: "Grade 7", result: "receipted", receipt: "RCT-2027-00413" },
  { sms: "SKM1EF8K77 Confirmed. Ksh3,500.00 from ESTHER KIPTOO, account 2001", amount: 3500, adm: "ADM2001", name: "Amani Kiptoo", cls: "Grade 1", result: "suggested" },
];

const START = 1_284_500;
const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;

/** Three paybill payments arrive and settle themselves. Plays once; reduced motion shows the end state. */
export function HeroLedger() {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(ROWS.length);
      return;
    }
    const timers = ROWS.map((_, i) => window.setTimeout(() => setShown(i + 1), 900 + i * 1700));
    return () => timers.forEach(clearTimeout);
  }, []);

  const outstanding = START - ROWS.slice(0, shown).reduce((s, r) => s + (r.result === "receipted" ? r.amount : 0), 0);

  return (
    <figure className="relative" aria-label="Example: three M-Pesa payments matched to students">
      {/* the old way, behind */}
      <div aria-hidden className="ruled absolute -left-4 -top-6 hidden w-[88%] -rotate-3 rounded-sm px-14 pb-6 pt-5 shadow-[0_1px_0_#d8dcea,0_18px_40px_-24px_rgba(22,24,43,.45)] sm:block">
        <p className="font-hand text-[1.05rem] leading-8 text-carbon/80">17/1 &nbsp; 5,000 &nbsp;&nbsp; acc &quot;wanjiku&quot;?? which one</p>
        <p className="font-hand text-[1.05rem] leading-8 text-carbon/80 line-through decoration-margin decoration-2">17/1 &nbsp; 12,000 &nbsp; adm 001 or 0011?</p>
        <p className="font-hand text-[1.05rem] leading-8 text-carbon/80">17/1 &nbsp; 3,500 &nbsp;&nbsp; no acc no. call mother</p>
      </div>

      {/* the new way */}
      <div className="relative rounded-md bg-white sm:mt-16 shadow-[0_1px_0_#e3e6ef,0_30px_60px_-30px_rgba(25,34,106,.55)] ring-1 ring-ink/10 sm:ml-10">
        <div className="flex items-baseline justify-between border-b border-ink/10 px-5 py-4">
          <span className="text-sm font-semibold">Paybill payments, today</span>
          <span className="text-right">
            <span className="block text-xs text-ink/60">Outstanding this term</span>
            <span className="text-lg font-bold tabular-nums text-carbon" aria-live="polite">{kes(outstanding)}</span>
          </span>
        </div>
        <ol className="divide-y divide-ink/10">
          {ROWS.map((r, i) => (
            <li key={r.adm} className="ledger-row px-5 py-4" data-in={i < shown}>
              <p className="max-w-[46ch] rounded-lg rounded-bl-none bg-trip/70 px-3 py-2 text-[0.8rem] leading-snug text-ink/85">{r.sms}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    <span className="tabular-nums text-carbon">{r.adm}</span>&ensp;{r.name}
                  </p>
                  <p className="text-sm text-ink/60">{r.cls}{r.receipt ? `, receipt ${r.receipt}` : ""}</p>
                </div>
                {r.result === "receipted" ? (
                  <span className="stamp shrink-0 rounded border-2 border-margin px-2 py-0.5 text-sm font-bold tracking-wide text-margin">Paid {kes(r.amount)}</span>
                ) : (
                  <span className="stamp shrink-0 rounded border-2 border-carbon px-2 py-0.5 text-sm font-bold text-carbon">Confirm?</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <figcaption className="mt-4 text-sm text-ink/60 sm:ml-10">
        Exact account numbers settle on their own. &ldquo;2001&rdquo; waits for one click, and is matched automatically from then on.
      </figcaption>
    </figure>
  );
}
