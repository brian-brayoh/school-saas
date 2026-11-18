/**
 * Decide which student an M-Pesa payment is for, from the account number
 * the parent typed (BillRefNumber). Pure functions: tested in isolation.
 *
 *  1. exact   — same characters as an admission number once spaces and
 *               punctuation are removed ("adm-001" = "ADM001")  → auto-matched
 *  2. alias   — a typo the bursar already confirmed once        → auto-matched
 *  3. near    — prefix/leading zeros dropped, or one character off → suggested
 *  4. name    — the reference contains a student's name          → suggested
 *  5. payer   — this payer paid for exactly one student before   → suggested
 *  otherwise unmatched → bursar's queue.
 */

export type StudentRef = { id: string; admissionNo: string; firstName: string; lastName: string };
export type Suggestion = { studentId: string; reason: string };
export type MatchResult =
  | { kind: "matched"; studentId: string; reason: "exact" | "alias" }
  | { kind: "suggested"; suggestions: Suggestion[] }
  | { kind: "unmatched" };

/** Uppercase, letters and digits only. */
export const canonRef = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** canonRef without common prefixes and leading zeros: "ADM NO 0045" → "45". */
export function looseRef(s: string | null | undefined): string {
  let c = canonRef(s);
  c = c.replace(/^(ADMNO|ADMN|ADM|NO|ACC|AC)(?=\d)/, "");
  c = c.replace(/^0+(?=\d)/, "");
  return c;
}

/** Levenshtein distance, stopping early once it exceeds `max`. */
export function editDistance(a: string, b: string, max = 1): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export function matchBillRef(
  billRef: string | null | undefined,
  students: StudentRef[],
  aliases: Map<string, string>, // canonRef(billRef) → studentId
  payerHistory: string[] = [], // studentIds this payer paid for before
): MatchResult {
  const canon = canonRef(billRef);

  if (canon) {
    const exact = students.filter((s) => canonRef(s.admissionNo) === canon);
    if (exact.length === 1) return { kind: "matched", studentId: exact[0].id, reason: "exact" };

    const alias = aliases.get(canon);
    if (alias && students.some((s) => s.id === alias)) return { kind: "matched", studentId: alias, reason: "alias" };
  }

  const out = new Map<string, string>();
  const add = (id: string, reason: string) => {
    if (!out.has(id)) out.set(id, reason);
  };

  if (canon) {
    const loose = looseRef(billRef);
    for (const s of students) {
      if (loose && looseRef(s.admissionNo) === loose) add(s.id, "same number without prefix or zeros");
    }
    if (canon.length >= 3) {
      for (const s of students) {
        const adm = canonRef(s.admissionNo);
        if (adm.length >= 3 && editDistance(canon, adm, 1) === 1) add(s.id, "one character different");
      }
    }
    const words = (billRef ?? "").toUpperCase().split(/[^A-Z]+/).filter((w) => w.length >= 4);
    if (words.length) {
      for (const s of students) {
        const names = [s.firstName, s.lastName].map((n) => n.toUpperCase());
        if (words.some((w) => names.includes(w))) add(s.id, "reference contains the student's name");
      }
    }
  }

  const history = [...new Set(payerHistory)];
  if (history.length === 1) add(history[0], "this payer paid for this student before");

  const suggestions = [...out].slice(0, 5).map(([studentId, reason]) => ({ studentId, reason }));
  return suggestions.length ? { kind: "suggested", suggestions } : { kind: "unmatched" };
}
