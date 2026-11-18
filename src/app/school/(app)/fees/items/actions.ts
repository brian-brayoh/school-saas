"use server";

import { revalidatePath } from "next/cache";
import { withTenant } from "@/lib/db";
import { requireSchool, FINANCE_ROLES } from "@/lib/school";
import { friendlyDbError } from "@/lib/errors";
import type { FormState } from "@/components/ActionForm";

export async function createFeeItem(_p: FormState, fd: FormData): Promise<FormState> {
  const { tenant } = await requireSchool(FINANCE_ROLES);
  const name = String(fd.get("name") ?? "").trim();
  const isOptional = fd.get("isOptional") === "on";
  const priority = Math.min(999, Math.max(1, Number(fd.get("priority")) || 100));
  if (name.length < 2) return { error: "Name the fee item, e.g. Tuition" };
  try {
    await withTenant(tenant.id, (tx) => tx.feeItem.create({ data: { tenantId: tenant.id, name, isOptional, priority } }));
  } catch (e) {
    return { error: friendlyDbError(e, "A fee item with that name already exists") };
  }
  revalidatePath("/fees", "layout");
  return { ok: `${name} added.` };
}

export async function updateFeeItem(fd: FormData) {
  const { tenant } = await requireSchool(FINANCE_ROLES);
  const id = String(fd.get("id"));
  const priority = Math.min(999, Math.max(1, Number(fd.get("priority")) || 100));
  await withTenant(tenant.id, (tx) =>
    tx.feeItem.update({ where: { id }, data: { isOptional: fd.get("isOptional") === "on", priority } }),
  );
  revalidatePath("/fees", "layout");
}
