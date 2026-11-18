"use server";

import { revalidatePath } from "next/cache";
import { withTenant } from "@/lib/db";
import { requireSchool, FINANCE_ROLES } from "@/lib/school";
import { audit } from "@/lib/audit";
import { assignPayment } from "@/lib/c2b";
import { normalizeAdmission } from "@/lib/students-import";
import { formatKes } from "@/lib/money";
import type { FormState } from "@/components/ActionForm";

export async function assignPaymentAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { tenant, user } = await requireSchool(FINANCE_ROLES);
  const paymentId = String(fd.get("paymentId") ?? "");
  const studentId = String(fd.get("studentId") ?? "");
  const admissionNo = String(fd.get("admissionNo") ?? "").trim();

  try {
    const res = await withTenant(tenant.id, async (tx) => {
      const student = studentId
        ? await tx.student.findUnique({ where: { id: studentId } })
        : await tx.student.findFirst({ where: { admissionNo: normalizeAdmission(admissionNo) } });
      if (!student) return { error: `No student with admission number "${admissionNo}"` };
      const { receipt } = await assignPayment(tx, tenant.id, paymentId, student.id);
      const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      await audit(tx, { tenantId: tenant.id, actorUserId: user.id, action: "payment.assign", entity: "Payment", entityId: paymentId, after: { studentId: student.id, receipt: receipt.number } });
      return {
        ok: `${formatKes(p.amountCents)} assigned to ${student.firstName} ${student.lastName} (${receipt.number}). "${p.billRef ?? ""}" will match them automatically next time.`,
        link: { href: `/receipts/${receipt.id}`, label: "Print receipt" },
      };
    }, { timeout: 60_000 });
    revalidatePath("/", "layout");
    return res;
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function ignorePaymentAction(fd: FormData) {
  const { tenant, user } = await requireSchool(FINANCE_ROLES);
  const paymentId = String(fd.get("paymentId") ?? "");
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 200) || "Not school fees";
  await withTenant(tenant.id, async (tx) => {
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (p.matchStatus !== "UNMATCHED" && p.matchStatus !== "SUGGESTED") return;
    await tx.payment.update({
      where: { id: paymentId },
      data: { matchStatus: "IGNORED", rawPayload: { ...((p.rawPayload as object) ?? {}), ignoredReason: reason, ignoredBy: user.id } },
    });
    await audit(tx, { tenantId: tenant.id, actorUserId: user.id, action: "payment.ignore", entity: "Payment", entityId: paymentId, after: { reason } });
  });
  revalidatePath("/", "layout");
}
