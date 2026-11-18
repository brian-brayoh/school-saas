"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withTenant } from "@/lib/db";
import { requireSchool, FINANCE_ROLES } from "@/lib/school";
import { audit } from "@/lib/audit";
import { invoiceBalance, refreshInvoiceStatus, ADJUSTMENT_LABELS } from "@/lib/fees";
import { formatKes, parseKes } from "@/lib/money";
import type { FormState } from "@/components/ActionForm";

const schema = z.object({
  studentId: z.string().min(1),
  invoiceId: z.string().min(1, "Pick the invoice"),
  type: z.enum(["BURSARY", "DISCOUNT", "WAIVER", "DEBIT"]),
  amount: z.string(),
  reason: z.string().trim().min(3, "Give a reason, e.g. CDF bursary 2027 or School trip to Naivasha"),
});

export async function addAdjustment(_p: FormState, fd: FormData): Promise<FormState> {
  const { tenant, user } = await requireSchool(FINANCE_ROLES);
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const amountCents = parseKes(d.amount);
  if (!amountCents || amountCents <= 0n) return { error: "Enter an amount in KES, e.g. 5000" };

  const res = await withTenant(tenant.id, async (tx) => {
    const inv = await tx.invoice.findFirst({ where: { id: d.invoiceId, studentId: d.studentId }, include: { adjustments: true } });
    if (!inv || inv.status === "VOID") return { error: "That invoice isn't available" };
    const balance = invoiceBalance(inv);
    if (d.type !== "DEBIT" && amountCents > balance) {
      return { error: `A ${ADJUSTMENT_LABELS[d.type].toLowerCase()} can't be more than the balance on ${inv.number} (${formatKes(balance)}).` };
    }
    const adj = await tx.adjustment.create({
      data: { tenantId: tenant.id, studentId: d.studentId, invoiceId: inv.id, type: d.type, amountCents, reason: d.reason, approvedById: user.id },
    });
    await refreshInvoiceStatus(tx, inv.id);
    await audit(tx, {
      tenantId: tenant.id,
      actorUserId: user.id,
      action: "fees.adjustment.add",
      entity: "Adjustment",
      entityId: adj.id,
      after: { invoice: inv.number, type: d.type, amountCents: amountCents.toString(), reason: d.reason },
    });
    return { ok: `${ADJUSTMENT_LABELS[d.type]} of ${formatKes(amountCents)} recorded on ${inv.number}.` };
  });

  revalidatePath(`/students/${d.studentId}`);
  revalidatePath("/fees", "layout");
  return res;
}
