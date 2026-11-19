"use server";

import bcrypt from "bcryptjs";
import { auth, unstable_update } from "@/auth";
import { prisma, withSystem } from "@/lib/db";
import { currentHost } from "@/lib/school";
import { audit } from "@/lib/audit";
import { passwordProblem, setPassword } from "@/lib/passwords";
import type { FormState } from "@/components/ActionForm";

/** Change your own password. Signs out your other devices, keeps this one signed in. */
export async function changeMyPassword(_p: FormState, fd: FormData): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Your session has ended. Sign in again." };
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  const confirm = String(fd.get("confirm") ?? "");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.sessionVersion !== (session.user.sessionVersion ?? 0)) return { error: "Your session has ended. Sign in again." };
  if (!(await bcrypt.compare(current, user.passwordHash))) return { error: "Your current password is wrong." };
  if (next !== confirm) return { error: "The new passwords don't match." };
  const problem = passwordProblem(next, { name: user.name, email: user.email });
  if (problem) return { error: problem };
  if (await bcrypt.compare(next, user.passwordHash)) return { error: "Choose a password different from your current one." };

  const wasTemporary = user.mustChangePassword;
  const updated = await withSystem(async (tx) => {
    const u = await setPassword(tx, user.id, next, { mustChange: false });
    if (session.user.tenantId) {
      await audit(tx, { tenantId: session.user.tenantId, actorUserId: user.id, action: "user.password.change", entity: "User", entityId: user.id });
    }
    return u;
  });
  await unstable_update({ sessionVersion: updated.sessionVersion } as never);

  const host = await currentHost();
  const home = host.area === "admin" ? "/tenants" : "/dashboard";
  return wasTemporary
    ? { ok: "Password set.", link: { href: home, label: "Continue", sameTab: true } }
    : { ok: "Password changed. Any other device signed in with your account has been signed out." };
}
