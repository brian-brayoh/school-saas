import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { prisma, withTenant } from "@/lib/db";
import { parseHost } from "@/lib/host";
import { labelsFor } from "@/lib/terms";

export const MANAGE_ROLES: Role[] = ["OWNER", "ADMIN"];
export const FINANCE_ROLES: Role[] = ["OWNER", "ADMIN", "BURSAR"];

export const currentHost = cache(async () => parseHost((await headers()).get("host")));

export const currentTenant = cache(async () => {
  const host = await currentHost();
  if (host.area !== "school") return null;
  return prisma.tenant.findUnique({ where: { slug: host.slug } });
});

const loadMember = cache(async (tenantId: string, userId: string) =>
  withTenant(tenantId, (tx) =>
    tx.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    }),
  ),
);

/**
 * Gate for every school page and server action.
 * Resolves the school from the host, checks the session was issued for it,
 * and re-reads the membership so role changes apply immediately.
 */
export async function requireSchool(roles?: Role[]) {
  const tenant = await currentTenant();
  if (!tenant) notFound();
  if (tenant.status === "SUSPENDED") redirect("/login?suspended=1");

  const session = await auth();
  if (!session?.user?.id || session.user.tenantId !== tenant.id) redirect("/login");

  const membership = await loadMember(tenant.id, session.user.id);
  if (!membership) redirect("/login");
  if (roles && !roles.includes(membership.role)) redirect("/dashboard?denied=1");

  return { tenant, user: membership.user, role: membership.role, labels: labelsFor(tenant.kind) };
}

export function can(role: Role, roles: Role[]) {
  return roles.includes(role);
}

export async function requirePlatformAdmin() {
  const host = await currentHost();
  if (host.area !== "admin") notFound();
  const session = await auth();
  if (!session?.user?.id || !session.user.isPlatformAdmin || session.user.tenantId !== null) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.isPlatformAdmin) redirect("/login");
  return user;
}
