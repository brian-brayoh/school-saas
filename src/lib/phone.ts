/**
 * Normalise a Kenyan mobile number to 2547XXXXXXXX / 2541XXXXXXXX.
 * Accepts 0712345678, 712345678, +254712345678, 254712345678, with spaces/dashes,
 * and Excel's habit of dropping the leading zero.
 * Returns null when it isn't a valid Kenyan mobile number.
 */
export function normalizeKePhone(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim().replace(/[\s\-().]/g, "");
  if (!s) return null;
  if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d+$/.test(s)) return null;

  if (s.startsWith("254") && s.length === 12) s = s.slice(3);
  else if (s.startsWith("0") && s.length === 10) s = s.slice(1);

  if (s.length !== 9 || !/^[71]/.test(s)) return null;
  return `254${s}`;
}

export function formatKePhone(p: string | null | undefined): string {
  if (!p) return "";
  return p.startsWith("254") ? `0${p.slice(3)}` : p;
}
