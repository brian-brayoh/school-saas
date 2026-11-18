"use server";

import { revalidatePath } from "next/cache";
import { withTenant } from "@/lib/db";
import { requireSchool, MANAGE_ROLES } from "@/lib/school";
import { audit } from "@/lib/audit";
import { applyProfile } from "@/lib/institution-profile";
import type { FormState } from "@/components/ActionForm";

export async function saveSchoolProfile(_p: FormState, fd: FormData): Promise<FormState> {
  const { tenant, user } = await requireSchool(MANAGE_ROLES);
  const error = await withTenant(tenant.id, async (tx) => {
    const err = await applyProfile(tx, tenant.id, fd);
    if (!err) await audit(tx, { tenantId: tenant.id, actorUserId: user.id, action: "tenant.profile", entity: "Tenant", entityId: tenant.id });
    return err;
  });
  if (error) return { error };
  revalidatePath("/", "layout");
  return { ok: "Saved. Receipts and statements now use these details." };
}
