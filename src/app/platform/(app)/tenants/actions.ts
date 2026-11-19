"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma, withSystem } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/school";
import { RESERVED_SLUGS, SLUG_RE, schoolUrl } from "@/lib/host";
import { normalizeKePhone } from "@/lib/phone";
import { DEFAULT_CLASSES, DEFAULT_STREAM } from "@/lib/defaults";
import { audit } from "@/lib/audit";
import { applyProfile } from "@/lib/institution-profile";
import { generateTempPassword, setPassword } from "@/lib/passwords";
import type { FormState } from "@/components/ActionForm";

export type CreateTenantState = FormState;

const schema = z.object({
  name: z.string().trim().min(3, "Name is too short"),
  kind: z.enum(["SCHOOL", "TVET", "UNIVERSITY"]).default("SCHOOL"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_RE, "Code: lowercase letters, numbers and dashes only")
    .refine((s) => !RESERVED_SLUGS.has(s) && s !== (process.env.ADMIN_SUBDOMAIN ?? "admin"), "That code is reserved"),
  county: z.string().trim().optional(),
  ownerName: z.string().trim().min(2, "Owner name is required"),
  ownerEmail: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
  ownerPhone: z.string().trim().optional(),
  ownerPassword: z.string().optional(),
  defaultClasses: z.string().optional(),
});

export async function createTenant(_prev: CreateTenantState, formData: FormData): Promise<CreateTenantState> {
  const admin = await requirePlatformAdmin();
  const parsed = schema.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  const phone = d.ownerPhone ? normalizeKePhone(d.ownerPhone) : null;
  if (d.ownerPhone && !phone) return { error: "Owner phone must be a valid Kenyan mobile number" };
  const email = d.ownerEmail || null;
  if (!email && !phone) return { error: "Give the owner an email or a phone number to sign in with" };

  if (await prisma.tenant.findUnique({ where: { slug: d.slug } })) return { error: "That school code is taken" };

  const existingUser = await prisma.user.findFirst({
    where: { OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
  });
  if (!existingUser && (!d.ownerPassword || d.ownerPassword.length < 8)) {
    return { error: "Set a temporary password of at least 8 characters for the new owner" };
  }

  let profileError: string | null = null;
  const tenant = await withSystem(async (tx) => {
    const created = await tx.tenant.create({ data: { name: d.name, slug: d.slug, kind: d.kind } });
    profileError = await applyProfile(tx, created.id, formData); // name, address, contacts, motto, seal, logo
    if (profileError) throw new Error("PROFILE"); // rolls the whole creation back
    const p = await tx.tenant.findUniqueOrThrow({ where: { id: created.id } });
    // Fall back to the owner's contacts when the letterhead has none.
    const t = await tx.tenant.update({ where: { id: created.id }, data: { phone: p.phone ?? phone, email: p.email ?? email } });

    const owner =
      existingUser ??
      (await tx.user.create({
        data: { name: d.ownerName, email, phone, passwordHash: await bcrypt.hash(d.ownerPassword!, 10), mustChangePassword: true },
      }));
    await tx.membership.create({ data: { tenantId: t.id, userId: owner.id, role: "OWNER" } });

    if (d.defaultClasses && d.kind === "SCHOOL") {
      for (const [i, name] of DEFAULT_CLASSES.entries()) {
        await tx.class.create({
          data: { tenantId: t.id, name, sortOrder: i, streams: { create: { tenantId: t.id, name: DEFAULT_STREAM } } },
        });
      }
    }

    await audit(tx, { tenantId: t.id, actorUserId: admin.id, action: "tenant.create", entity: "Tenant", entityId: t.id });
    return t;
  }).catch((e) => {
    if (e instanceof Error && e.message === "PROFILE") return null;
    throw e;
  });
  if (!tenant) return { error: profileError ?? "Check the letterhead details" };

  revalidatePath("/tenants");
  return {
    ok: `${tenant.name} created at ${schoolUrl(tenant.slug)}${existingUser ? " (owner already had an account; their password is unchanged)" : ""}`,
  };
}

export async function setTenantStatus(formData: FormData) {
  await requirePlatformAdmin();
  const id = String(formData.get("id"));
  const status = formData.get("status") === "SUSPENDED" ? "SUSPENDED" : "ACTIVE";
  await prisma.tenant.update({ where: { id }, data: { status } });
  revalidatePath("/tenants");
}

export async function setTenantKind(formData: FormData) {
  await requirePlatformAdmin();
  const id = String(formData.get("id"));
  const kind = z.enum(["SCHOOL", "TVET", "UNIVERSITY"]).parse(formData.get("kind"));
  await prisma.tenant.update({ where: { id }, data: { kind } });
  revalidatePath("/tenants");
}

export async function savePlatformProfile(_p: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  const id = String(formData.get("tenantId") ?? "");
  const error = await withSystem(async (tx) => {
    const err = await applyProfile(tx, id, formData);
    if (!err) await audit(tx, { tenantId: id, actorUserId: admin.id, action: "tenant.profile", entity: "Tenant", entityId: id });
    return err;
  });
  if (error) return { error };
  revalidatePath("/tenants");
  return { ok: "Saved." };
}

/** Platform admin resets a school owner's or admin's password (e.g. a locked-out owner). */
export async function resetSchoolUserPassword(_p: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  const membershipId = String(formData.get("membershipId") ?? "");
  try {
    const out = await withSystem(async (tx) => {
      const m = await tx.membership.findUniqueOrThrow({ where: { id: membershipId }, include: { user: true } });
      if (m.user.isPlatformAdmin) throw new Error("Reset platform admins from their own account");
      const temp = generateTempPassword();
      await setPassword(tx, m.userId, temp, { mustChange: true });
      await audit(tx, { tenantId: m.tenantId, actorUserId: admin.id, action: "user.password.reset", entity: "User", entityId: m.userId });
      return { name: m.user.name, temp };
    });
    return { ok: `Temporary password for ${out.name}: ${out.temp}  Share it privately. They must choose their own at next sign-in.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
