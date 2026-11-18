/** Parse a KES amount typed by a person ("12,500", "12500.5", "KES 1,200") into cents. */
export function parseKes(input: unknown): bigint | null {
  const s = String(input ?? "").replace(/kes|ksh|sh/gi, "").replace(/[,\s]/g, "").trim();
  if (s === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
}

/** "KES 12,500" (decimals only when there are cents). */
export function formatKes(cents: bigint | number, opts: { bare?: boolean } = {}): string {
  const c = typeof cents === "bigint" ? cents : BigInt(Math.round(cents));
  const neg = c < 0n;
  const abs = neg ? -c : c;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = abs % 100n;
  const body = frac === 0n ? whole : `${whole}.${frac.toString().padStart(2, "0")}`;
  return `${neg ? "-" : ""}${opts.bare ? "" : "KES "}${body}`;
}

/** Cents → the plain number string used to prefill an input ("12500" / "12500.50"). */
export function kesInputValue(cents: bigint | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return formatKes(cents, { bare: true }).replace(/,/g, "");
}
