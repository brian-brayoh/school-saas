"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withTenant } from "@/lib/db";
import { requireSchool, FINANCE_ROLES } from "@/lib/school";
import { audit } from "@/lib/audit";
import { formatKes, parseKes } from "@/lib/money";
import { normalizeAdmission } from "@/lib/students-import";
import { randomBytes } from "node:crypto";
import { ingestC2B, simulatedTransId } from "@/lib/c2b";
import { MPESA_CODE_RE, allocatePayment, issueReceipt, manualChannel, reversePayment, METHOD_LABELS, type ManualMethod } from "@/lib/payments";
import type { FormState } from "@/components/ActionForm";

const schema = z.object({
  studentId: z.string().optional(),
  admissionNo: z.string().optional(),
  amount: z.string(),
  method: z.enum(["CASH", "BANK", "MPESA"]),
  reference: z.string().trim().optional(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date it was paid"),
  payerName: z.string().trim().max(100).optional(),
});

function paidAtFrom(day: string): Date | null {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
  if (day > today) return null;
  return day === today ? new Date() : new Date(`${day}T12:00:00+03:00`);
}

export async function recordPayment(_p: FormState, fd: FormData): Promise<FormState> {
  const { tenant, user } = await requireSchool(FINANCE_ROLES);
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  const amountCents = parseKes(d.amount);
  if (!amountCents || amountCents <= 0n) return { error: "Enter the amount paid in KES, e.g. 15000" };
  const paidAt = paidAtFrom(d.paidOn);
  if (!paidAt) return { error: "The payment date can't be in the future" };

  const method = d.method as ManualMethod;
  let reference = (d.reference ?? "").toUpperCase().replace(/\s+/g, "");
  if (method === "MPESA" && !MPESA_CODE_RE.test(reference)) return { error: "Enter the 10-character M-Pesa code from the SMS, e.g. SKL4ABCD12" };
  if (method === "BANK" && reference.length < 3) return { error: "Enter the bank slip or transaction reference" };
  if (method === "CASH" && !reference) reference = `CASH-${Date.now().toString(36).toUpperCase()}`;

  return withTenant(tenant.id, async (tx) => {
    const student = d.studentId
      ? await tx.student.findUnique({ where: { id: d.studentId } })
      : await tx.student.findFirst({ where: { admissionNo: normalizeAdmission(d.admissionNo ?? "") } });
    if (!student) return { error: `No student with admission number "${d.admissionNo ?? ""}"` };

    // The same M-Pesa code must never be counted twice, whichever channel recorded it.
    const dup = await tx.payment.findFirst({
      where: {
        reference,
        channel: method === "MPESA" ? { type: { in: ["PAYBILL", "TILL"] } } : { type: method === "CASH" ? "CASH" : "BANK" },
      },
      include: { receipt: true, student: true },
    });
    if (dup) {
      return { error: `${reference} is already recorded${dup.receipt ? ` (receipt ${dup.receipt.number})` : ""}${dup.student ? ` for ${dup.student.firstName} ${dup.student.lastName}` : ""}.` };
    }

    const channel = await manualChannel(tx, tenant.id, method);
    const payment = await tx.payment.create({
      data: {
        tenantId: tenant.id,
        channelId: channel.id,
        reference,
        amountCents,
        payerName: d.payerName || null,
        billRef: student.admissionNo,
        paidAt,
        matchStatus: "MATCHED",
        studentId: student.id,
        rawPayload: { source: "manual", method, recordedBy: user.id },
      },
    });
    const { allocated, credit } = await allocatePayment(tx, tenant.id, { id: payment.id, studentId: student.id, amountCents });
    const receipt = await issueReceipt(tx, tenant.id, payment.id, paidAt);
    await audit(tx, {
      tenantId: tenant.id,
      actorUserId: user.id,
      action: "payment.record",
      entity: "Payment",
      entityId: payment.id,
      after: { receipt: receipt.number, method, reference, amountCents: amountCents.toString(), studentId: student.id },
    });

    revalidatePath("/", "layout");
    return {
      ok:
        `Receipt ${receipt.number}: ${formatKes(amountCents)} ${METHOD_LABELS[method].toLowerCase()} for ${student.firstName} ${student.lastName}.` +
        (credit > 0n ? ` ${formatKes(allocated)} cleared invoices and ${formatKes(credit)} is kept as credit for next term.` : ""),
      link: { href: `/receipts/${receipt.id}`, label: "Print receipt" },
    };
  });
}

export async function reversePaymentAction(fd: FormData) {
  const { tenant, user } = await requireSchool(FINANCE_ROLES);
  const paymentId = String(fd.get("paymentId") ?? "");
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 200) || "Recorded by mistake";
  await withTenant(tenant.id, async (tx) => {
    const rev = await reversePayment(tx, tenant.id, paymentId);
    await audit(tx, { tenantId: tenant.id, actorUserId: user.id, action: "payment.reverse", entity: "Payment", entityId: paymentId, after: { reversalId: rev.id, reason } });
  });
  revalidatePath("/", "layout");
}

// ───────────────────────── Local M-Pesa simulator ─────────────────────────

export async function simulatorEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_PAYMENT_SIMULATOR === "true";
}

/**
 * Pretend a parent paid the school's paybill. Runs the exact code path a real
 * Safaricom confirmation runs (ingestC2B), on a "simulator" channel.
 */
export async function simulateMpesa(_p: FormState, fd: FormData): Promise<FormState> {
  const { tenant, user } = await requireSchool(FINANCE_ROLES);
  if (!(await simulatorEnabled())) return { error: "The simulator is turned off on this server" };
  const amountCents = parseKes(fd.get("amount"));
  if (!amountCents || amountCents <= 0n) return { error: "Enter an amount in KES" };
  const billRef = String(fd.get("billRef") ?? "").slice(0, 40);
  const name = String(fd.get("payerName") ?? "").trim() || "JOHN SIMULATED";

  const channel = await withTenant(tenant.id, async (tx) =>
    (await tx.paymentChannel.findFirst({ where: { type: "PAYBILL", shortcode: "simulator" } })) ??
    tx.paymentChannel.create({ data: { tenantId: tenant.id, type: "PAYBILL", shortcode: "simulator", callbackToken: randomBytes(24).toString("hex") } }),
  );
  const [first, ...rest] = name.split(/\s+/);
  const transId = simulatedTransId();
  const now = new Date(Date.now() + 3 * 3600_000).toISOString().replace(/\D/g, "").slice(0, 14); // Nairobi time

  const r = await ingestC2B(
    channel,
    {
      TransactionType: "Pay Bill",
      TransID: transId,
      TransTime: now,
      TransAmount: formatKes(amountCents, { bare: true }).replace(/,/g, ""),
      BusinessShortCode: "simulator",
      BillRefNumber: billRef,
      MSISDN: String(fd.get("phone") ?? "").trim() || "2547XXXXX123",
      FirstName: first?.toUpperCase(),
      LastName: rest.join(" ").toUpperCase() || undefined,
    },
    "simulator",
  );
  await withTenant(tenant.id, (tx) => audit(tx, { tenantId: tenant.id, actorUserId: user.id, action: "payment.simulate", entity: "Payment", entityId: r.paymentId ?? transId, after: { billRef, status: r.status } }));
  revalidatePath("/", "layout");

  const msg: Record<string, string> = {
    matched: `${transId}: ${formatKes(amountCents)} for "${billRef}" matched a student automatically and was receipted.`,
    suggested: `${transId}: "${billRef}" looks like a near match. It's waiting in Payments to match for a one-click confirm.`,
    unmatched: `${transId}: "${billRef}" doesn't match anyone. It's waiting in Payments to match.`,
    duplicate: `${transId} was already recorded.`,
    ignored: `${transId} duplicates a payment already recorded, so it was set aside.`,
  };
  return { ok: msg[r.status] };
}
