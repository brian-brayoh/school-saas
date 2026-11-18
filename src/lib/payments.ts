import { randomBytes } from "node:crypto";
import type { ChannelType } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { invoiceBalance, nextNumbers, refreshInvoiceStatus } from "@/lib/fees";

export type ManualMethod = "CASH" | "BANK" | "MPESA";
export const METHOD_LABELS: Record<ManualMethod, string> = {
  CASH: "Cash",
  BANK: "Bank deposit",
  MPESA: "M-Pesa (entered by hand)",
};

const CHANNEL_FOR: Record<ManualMethod, { type: ChannelType; shortcode: string }> = {
  CASH: { type: "CASH", shortcode: "manual" },
  BANK: { type: "BANK", shortcode: "manual" },
  MPESA: { type: "PAYBILL", shortcode: "manual" },
};

export function methodOf(channel: { type: ChannelType; shortcode: string | null }): string {
  if (channel.type === "CASH") return "Cash";
  if (channel.type === "BANK") return "Bank";
  return channel.shortcode === "manual" ? "M-Pesa (manual)" : `M-Pesa ${channel.shortcode ?? ""}`.trim();
}

/** The per-school channel that hand-entered payments of this method belong to (created on first use). */
export async function manualChannel(tx: Tx, tenantId: string, method: ManualMethod) {
  const { type, shortcode } = CHANNEL_FOR[method];
  const found = await tx.paymentChannel.findFirst({ where: { type, shortcode } });
  if (found) return found;
  return tx.paymentChannel.create({
    data: { tenantId, type, shortcode, callbackToken: randomBytes(24).toString("hex") },
  });
}

/** M-Pesa transaction codes: 10 letters/digits, e.g. SKL4ABCD12. */
export const MPESA_CODE_RE = /^[A-Z0-9]{10}$/;

/**
 * Split `amount` across invoices in the order given (oldest first).
 * Pure function: easy to test, used by allocatePayment.
 */
export function planAllocation(invoices: { id: string; balance: bigint }[], amount: bigint) {
  const allocations: { invoiceId: string; amountCents: bigint }[] = [];
  let remaining = amount;
  for (const inv of invoices) {
    if (remaining <= 0n) break;
    if (inv.balance <= 0n) continue;
    const take = inv.balance < remaining ? inv.balance : remaining;
    allocations.push({ invoiceId: inv.id, amountCents: take });
    remaining -= take;
  }
  return { allocations, remainder: remaining };
}

async function openInvoicesOldestFirst(tx: Tx, studentId: string) {
  const invoices = await tx.invoice.findMany({
    where: { studentId, status: { in: ["OPEN", "PARTIAL"] } },
    include: { adjustments: true, term: { select: { startsOn: true } } },
  });
  return invoices
    .sort((a, b) => a.term.startsOn.getTime() - b.term.startsOn.getTime() || a.issuedAt.getTime() - b.issuedAt.getTime())
    .map((inv) => ({ id: inv.id, balance: invoiceBalance(inv) }));
}

async function applyAllocations(tx: Tx, tenantId: string, paymentId: string, allocations: { invoiceId: string; amountCents: bigint }[]) {
  for (const a of allocations) {
    await tx.allocation.create({ data: { tenantId, paymentId, invoiceId: a.invoiceId, amountCents: a.amountCents } });
    await tx.invoice.update({ where: { id: a.invoiceId }, data: { paidCents: { increment: a.amountCents } } });
    await refreshInvoiceStatus(tx, a.invoiceId);
  }
}

/**
 * Settle a matched payment against the student's open invoices, oldest first.
 * Anything left over becomes a StudentCredit, used automatically on the next invoice.
 */
export async function allocatePayment(tx: Tx, tenantId: string, payment: { id: string; studentId: string; amountCents: bigint }) {
  const { allocations, remainder } = planAllocation(await openInvoicesOldestFirst(tx, payment.studentId), payment.amountCents);
  await applyAllocations(tx, tenantId, payment.id, allocations);
  if (remainder > 0n) {
    await tx.studentCredit.create({ data: { tenantId, studentId: payment.studentId, amountCents: remainder, sourcePaymentId: payment.id } });
  }
  return { allocated: payment.amountCents - remainder, credit: remainder };
}

/** Use any unapplied credit on these students' open invoices (called after invoicing). */
export async function applyCredits(tx: Tx, tenantId: string, studentIds: string[]) {
  if (!studentIds.length) return 0n;
  const credits = await tx.studentCredit.findMany({
    where: { studentId: { in: studentIds }, appliedAt: null },
    orderBy: { createdAt: "asc" },
  });
  let used = 0n;
  for (const c of credits) {
    const { allocations, remainder } = planAllocation(await openInvoicesOldestFirst(tx, c.studentId), c.amountCents);
    if (!allocations.length) continue;
    await applyAllocations(tx, tenantId, c.sourcePaymentId, allocations);
    await tx.studentCredit.update({ where: { id: c.id }, data: { appliedAt: new Date() } });
    if (remainder > 0n) {
      await tx.studentCredit.create({ data: { tenantId, studentId: c.studentId, amountCents: remainder, sourcePaymentId: c.sourcePaymentId } });
    }
    used += c.amountCents - remainder;
  }
  return used;
}

export async function issueReceipt(tx: Tx, tenantId: string, paymentId: string, paidAt: Date) {
  const year = String(paidAt.getFullYear());
  const n = await nextNumbers(tx, tenantId, `receipt:${year}`, 1);
  return tx.receipt.create({ data: { tenantId, paymentId, number: `RCT-${year}-${String(n).padStart(5, "0")}` } });
}

/**
 * Undo a payment recorded by mistake. Nothing is deleted: a negative payment
 * is linked to the original, every allocation is matched by a negative one,
 * the invoices reopen, and unused credit from it is cancelled.
 */
export async function reversePayment(tx: Tx, tenantId: string, paymentId: string) {
  const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { allocations: true, reversal: true } });
  if (p.reversal || p.reversedPaymentId || p.amountCents <= 0n) throw new Error("This payment can't be reversed");

  const rev = await tx.payment.create({
    data: {
      tenantId,
      channelId: p.channelId,
      reference: `REV-${p.reference}`.slice(0, 60),
      amountCents: -p.amountCents,
      payerName: p.payerName,
      billRef: p.billRef,
      paidAt: new Date(),
      matchStatus: "MATCHED",
      studentId: p.studentId,
      reversedPaymentId: p.id,
    },
  });

  // Net allocations per invoice (a payment can reach an invoice twice via credit).
  const net = new Map<string, bigint>();
  for (const a of p.allocations) net.set(a.invoiceId, (net.get(a.invoiceId) ?? 0n) + a.amountCents);
  for (const [invoiceId, amount] of net) {
    if (amount === 0n) continue;
    await tx.allocation.create({ data: { tenantId, paymentId: rev.id, invoiceId, amountCents: -amount } });
    await tx.invoice.update({ where: { id: invoiceId }, data: { paidCents: { decrement: amount } } });
    await refreshInvoiceStatus(tx, invoiceId);
  }
  await tx.studentCredit.updateMany({ where: { sourcePaymentId: p.id, appliedAt: null }, data: { appliedAt: new Date() } });
  return rev;
}
