import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { withTenant, type Tx } from "@/lib/db";
import { parseKes } from "@/lib/money";
import { parseTransTime, type C2BConfirmation } from "@/lib/daraja";
import { canonRef, matchBillRef } from "@/lib/matching";
import { allocatePayment, issueReceipt } from "@/lib/payments";

export type IngestStatus = "duplicate" | "ignored" | "matched" | "suggested" | "unmatched";

/** Channels that are not a real shortcode. */
export const PSEUDO_SHORTCODES = ["manual", "simulator"];

/**
 * Record an incoming M-Pesa payment, then try to match and settle it.
 * Two transactions on purpose: the raw payment is saved first, so a bug or
 * timeout in matching can never lose money; it just stays in the queue.
 */
export async function ingestC2B(
  channel: { id: string; tenantId: string },
  payload: C2BConfirmation,
  source: "daraja" | "simulator" | "statement",
): Promise<{ status: IngestStatus; paymentId?: string }> {
  const tenantId = channel.tenantId;
  const reference = String(payload.TransID ?? "").trim().toUpperCase();
  const amountCents = parseKes(String(payload.TransAmount ?? ""));
  if (!reference || !amountCents || amountCents <= 0n) throw new Error(`Unusable C2B payload: ${JSON.stringify(payload).slice(0, 200)}`);

  const saved = await withTenant(tenantId, async (tx) => {
    await tx.paymentChannel.update({ where: { id: channel.id }, data: { lastCallbackAt: new Date() } });

    const same = await tx.payment.findUnique({ where: { channelId_reference: { channelId: channel.id, reference } } });
    if (same) return { status: "duplicate" as const, paymentId: same.id };

    // Already typed in by hand (or arrived on another shortcode)? Keep it for the record, count it once.
    const elsewhere = await tx.payment.findFirst({
      where: { reference, channel: { type: { in: ["PAYBILL", "TILL"] } } },
      select: { id: true },
    });

    const payerName = [payload.FirstName, payload.MiddleName, payload.LastName].filter(Boolean).join(" ").trim() || null;
    try {
      const p = await tx.payment.create({
        data: {
          tenantId,
          channelId: channel.id,
          reference,
          amountCents,
          payerName,
          payerPhone: payload.MSISDN ? String(payload.MSISDN) : null,
          billRef: payload.BillRefNumber ? String(payload.BillRefNumber).trim() : null,
          paidAt: parseTransTime(payload.TransTime),
          matchStatus: elsewhere ? "IGNORED" : "UNMATCHED",
          rawPayload: { source, ...payload, ...(elsewhere && { duplicateOfPaymentId: elsewhere.id }) } as Prisma.InputJsonValue,
        },
      });
      return { status: elsewhere ? ("ignored" as const) : ("saved" as const), paymentId: p.id };
    } catch (e) {
      // Safaricom sometimes sends the same confirmation twice at once.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { status: "duplicate" as const };
      throw e;
    }
  });

  if (saved.status !== "saved") return { status: saved.status, paymentId: saved.paymentId };
  const status = await withTenant(tenantId, (tx) => settleIncoming(tx, tenantId, saved.paymentId!), { timeout: 60_000 });
  return { status, paymentId: saved.paymentId };
}

export async function loadMatchContext(tx: Tx) {
  const [students, aliases] = await Promise.all([
    tx.student.findMany({ where: { status: { not: "LEFT" } }, select: { id: true, admissionNo: true, firstName: true, lastName: true } }),
    tx.billRefAlias.findMany({ select: { normalized: true, studentId: true } }),
  ]);
  return { students, aliases: new Map(aliases.map((a) => [a.normalized, a.studentId])) };
}

export async function payerHistory(tx: Tx, payerPhone: string | null, excludePaymentId?: string) {
  if (!payerPhone) return [];
  const rows = await tx.payment.findMany({
    where: { payerPhone, matchStatus: "MATCHED", studentId: { not: null }, amountCents: { gt: 0 }, ...(excludePaymentId && { id: { not: excludePaymentId } }) },
    select: { studentId: true },
    take: 50,
  });
  return rows.map((r) => r.studentId!);
}

/** Match an unmatched payment; settle it when the match is certain. */
export async function settleIncoming(tx: Tx, tenantId: string, paymentId: string): Promise<IngestStatus> {
  const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (p.matchStatus !== "UNMATCHED") return p.matchStatus === "MATCHED" ? "matched" : "suggested";

  const ctx = await loadMatchContext(tx);
  const result = matchBillRef(p.billRef, ctx.students, ctx.aliases, await payerHistory(tx, p.payerPhone, p.id));

  if (result.kind === "matched") {
    await settleTo(tx, tenantId, p.id, result.studentId);
    return "matched";
  }
  if (result.kind === "suggested") {
    await tx.payment.update({ where: { id: p.id }, data: { matchStatus: "SUGGESTED" } });
    return "suggested";
  }
  return "unmatched";
}

/** Attach a payment to a student, allocate it and issue the receipt. */
export async function settleTo(tx: Tx, tenantId: string, paymentId: string, studentId: string) {
  const p = await tx.payment.update({ where: { id: paymentId }, data: { studentId, matchStatus: "MATCHED" } });
  await allocatePayment(tx, tenantId, { id: p.id, studentId, amountCents: p.amountCents });
  return issueReceipt(tx, tenantId, p.id, p.paidAt);
}

/** Bursar confirms who a payment is for. The typed reference is remembered for next time. */
export async function assignPayment(tx: Tx, tenantId: string, paymentId: string, studentId: string) {
  const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (p.matchStatus !== "UNMATCHED" && p.matchStatus !== "SUGGESTED") throw new Error("This payment is already settled");
  const student = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
  const receipt = await settleTo(tx, tenantId, p.id, student.id);

  const typed = canonRef(p.billRef);
  if (typed && typed !== canonRef(student.admissionNo)) {
    await tx.billRefAlias.upsert({
      where: { tenantId_normalized: { tenantId, normalized: typed } },
      create: { tenantId, normalized: typed, studentId: student.id },
      update: { studentId: student.id },
    });
  }
  return { receipt, student };
}

export function simulatedTransId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(7);
  return "SIM" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
