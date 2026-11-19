"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { withTenant, type Tx } from "@/lib/db";
import { requireSchool, MANAGE_ROLES } from "@/lib/school";
import { normalizeKePhone } from "@/lib/phone";
import { audit } from "@/lib/audit";
import { friendlyDbError } from "@/lib/errors";
import { generateTempPassword, setPassword } from "@/lib/passwords";
import type { FormState } from "@/components/ActionForm";

const ROLES = ["OWNER", "ADMIN", "BURSAR", "TEACHER", "VIEWER"] as const;

function assertCanGrant(actorRole: Role, target: Role) {
  if (target === "OWNER" && actorRole !== "OWNER") throw new Error("Only an owner can grant or change the owner role");
}

export async function addMember(_p: FormState, fd: FormData): Promise<FormState> {
  const { tenant, user: actor, role: actorRole } = await requireSchool(MANAGE_ROLES);
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Name is required"),
      email: z.string().trim().toLowerCase().email("Invalid email").optional().or(z.literal("")),
      phone: z.string().trim().optional(),
      role: z.enum(ROLES),
      password: z.string().optional(),
    })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  try {
    assertCanGrant(actorRole, d.role);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const phone = d.phone ? normalizeKePhone(d.phone) : null;
  if (d.phone && !phone) return { error: "Phone must be a valid Kenyan mobile number" };
  const email = d.email || null;
  if (!email && !phone) return { error: "Give an email or phone number to sign in with" };

  try {
    const msg = await withTenant(tenant.id, async (tx) => {
      let user = await tx.user.findFirst({ where: { OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] } });
      let created = false;
      if (!user) {
        if (!d.password || d.password.length < 8) throw new Error("PASSWORD");
        user = await tx.user.create({ data: { name: d.name, email, phone, passwordHash: await bcrypt.hash(d.password, 10), mustChangePassword: true } });
        created = true;
      }
      const m = await tx.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: d.role } });
      await audit(tx, { tenantId: tenant.id, actorUserId: actor.id, action: "member.add", entity: "Membership", entityId: m.id, after: { role: d.role, userId: user.id } });
      return created
        ? `${user.name} added. Share their temporary password with them.`
        : `${user.name} already had an account and can sign in with their existing password.`;
    });
    revalidatePath("/users");
    return { ok: msg };
  } catch (e) {
    if (e instanceof Error && e.message === "PASSWORD") return { error: "Set a temporary password of at least 8 characters" };
    return { error: friendlyDbError(e, "That person is already a member of this school") };
  }
}

function ownersLeft(tx: Tx, excludingMembershipId: string) {
  return tx.membership.count({ where: { role: "OWNER", id: { not: excludingMembershipId } } });
}

export async function changeRole(fd: FormData) {
  const { tenant, user: actor, role: actorRole } = await requireSchool(MANAGE_ROLES);
  const id = String(fd.get("membershipId"));
  const role = z.enum(ROLES).parse(fd.get("role"));
  await withTenant(tenant.id, async (tx) => {
    const m = await tx.membership.findUniqueOrThrow({ where: { id } });
    assertCanGrant(actorRole, role);
    if (m.role === "OWNER") assertCanGrant(actorRole, "OWNER");
    if (m.role === "OWNER" && role !== "OWNER" && (await ownersLeft(tx, m.id)) === 0) {
      throw new Error("A school must keep at least one owner");
    }
    await tx.membership.update({ where: { id }, data: { role } });
    await audit(tx, { tenantId: tenant.id, actorUserId: actor.id, action: "member.role", entity: "Membership", entityId: id, before: { role: m.role }, after: { role } });
  });
  revalidatePath("/users");
}

export async function removeMember(fd: FormData) {
  const { tenant, user: actor, role: actorRole } = await requireSchool(MANAGE_ROLES);
  const id = String(fd.get("membershipId"));
  await withTenant(tenant.id, async (tx) => {
    const m = await tx.membership.findUniqueOrThrow({ where: { id } });
    if (m.userId === actor.id) throw new Error("You can't remove yourself");
    if (m.role === "OWNER") {
      assertCanGrant(actorRole, "OWNER");
      if ((await ownersLeft(tx, m.id)) === 0) throw new Error("A school must keep at least one owner");
    }
    await tx.membership.delete({ where: { id } });
    await audit(tx, { tenantId: tenant.id, actorUserId: actor.id, action: "member.remove", entity: "Membership", entityId: id, before: { role: m.role, userId: m.userId } });
  });
  revalidatePath("/users");
}

/** Owner/admin resets a staff member's password to a one-time temporary one. */
export async function resetMemberPassword(_p: FormState, fd: FormData): Promise<FormState> {
  const { tenant, user: actor, role: actorRole } = await requireSchool(MANAGE_ROLES);
  const id = String(fd.get("membershipId") ?? "");
  try {
    const out = await withTenant(tenant.id, async (tx) => {
      const m = await tx.membership.findUniqueOrThrow({ where: { id }, include: { user: true } });
      if (m.userId === actor.id) throw new Error("Change your own password under My account");
      if (m.role === "OWNER") assertCanGrant(actorRole, "OWNER");
      if (m.user.isPlatformAdmin) throw new Error("This account can only be reset by the platform");
      const temp = generateTempPassword();
      await setPassword(tx, m.userId, temp, { mustChange: true });
      await audit(tx, { tenantId: tenant.id, actorUserId: actor.id, action: "user.password.reset", entity: "User", entityId: m.userId });
      return { name: m.user.name, temp };
    });
    return { ok: `Temporary password for ${out.name}: ${out.temp}  Give it to them in person or by phone. They'll choose their own when they sign in, and any device they're signed in on is signed out now.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
