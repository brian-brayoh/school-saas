import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Tx } from "@/lib/db";

export const MIN_PASSWORD = 10;

const COMMON = new Set([
  "password", "password1", "password123", "1234567890", "12345678910", "qwertyuiop", "iloveyou12",
  "kenya12345", "nairobi123", "admin12345", "welcome123", "changeme123", "school1234",
]);

/** Returns a problem to show the person, or null if the password is acceptable. */
export function passwordProblem(pw: string, context: { name?: string | null; email?: string | null } = {}): string | null {
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters. A short sentence is easy to remember.`;
  if (pw.length > 128) return "That password is too long (128 characters at most).";
  const lower = pw.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(pw) || /^\d+$/.test(pw)) return "That password is too easy to guess. Pick something less common.";
  const bits = [context.name, context.email?.split("@")[0]].filter(Boolean).map((x) => x!.toLowerCase());
  if (bits.some((b) => b.length >= 4 && lower.includes(b))) return "Don't use your name or email in your password.";
  return null;
}

/** Readable one-time password, e.g. "kite-7348-river". No look-alike characters. */
export function generateTempPassword(): string {
  const words = ["kite", "river", "mango", "lion", "cedar", "zebra", "maple", "ocean", "tiger", "baobab", "rhino", "falcon", "jasmine", "savanna", "acacia", "eagle"];
  const w = () => words[randomInt(words.length)];
  return `${w()}-${randomInt(1000, 9999)}-${w()}`;
}

/** Set a password and sign the user out of every other session. */
export async function setPassword(tx: Tx, userId: string, plain: string, opts: { mustChange: boolean }) {
  return tx.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(plain, 10), mustChangePassword: opts.mustChange, sessionVersion: { increment: 1 } },
    select: { id: true, sessionVersion: true },
  });
}
