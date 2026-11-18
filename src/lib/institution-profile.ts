import { z } from "zod";
import type { Tx } from "@/lib/db";
import { normalizeKePhone } from "@/lib/phone";
import { saveBrandingFromForm } from "@/lib/branding";

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

const schema = z.object({
  name: z.string().trim().min(3, "Name is too short").max(120),
  address: opt(200),
  county: opt(60),
  phone: opt(30),
  email: z.string().trim().toLowerCase().max(120).optional().transform((v) => v || null).refine((v) => !v || /^\S+@\S+\.\S+$/.test(v), "Enter a valid email"),
  motto: opt(120),
});

/** Update an institution's printed details and images from a profile form. Returns an error message or null. */
export async function applyProfile(tx: Tx, tenantId: string, fd: FormData): Promise<string | null> {
  const parsed = schema.safeParse(Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Check the details";
  const d = parsed.data;
  const phone = d.phone ? normalizeKePhone(d.phone) ?? d.phone.replace(/[^\d+]/g, "") : null; // landlines allowed as typed
  const err = await saveBrandingFromForm(tx, tenantId, fd);
  if (err) return err;
  await tx.tenant.update({ where: { id: tenantId }, data: { name: d.name, address: d.address, county: d.county, phone, email: d.email, motto: d.motto } });
  return null;
}
