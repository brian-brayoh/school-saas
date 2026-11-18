import { randomUUID } from "node:crypto";
import type { AdjustmentType, InvoiceStatus, Residence } from "@prisma/client";
import type { Tx } from "@/lib/db";

export const CREDIT_TYPES: AdjustmentType[] = ["BURSARY", "DISCOUNT", "WAIVER"];
export const ADJUSTMENT_LABELS: Record<AdjustmentType, string> = {
  BURSARY: "Bursary (reduces fees owed)",
  DISCOUNT: "Discount",
  WAIVER: "Waiver",
  DEBIT: "Extra charge",
};

type AdjLike = { type: AdjustmentType; amountCents: bigint };

/** Credits reduce what is owed, DEBIT increases it. Amounts are stored positive. */
export const signedAdjustment = (a: AdjLike) => (a.type === "DEBIT" ? a.amountCents : -a.amountCents);

/** What the student still owes on one invoice. Negative = overpaid. */
export function invoiceBalance(inv: { totalCents: bigint; paidCents: bigint; adjustments: AdjLike[] }): bigint {
  return inv.totalCents + inv.adjustments.reduce((s, a) => s + signedAdjustment(a), 0n) - inv.paidCents;
}

export function statusFor(inv: { totalCents: bigint; paidCents: bigint; adjustments: AdjLike[] }, current: InvoiceStatus): InvoiceStatus {
  if (current === "VOID") return "VOID";
  const balance = invoiceBalance(inv);
  if (balance <= 0n) return "PAID";
  const credited = inv.adjustments.some((a) => a.type !== "DEBIT");
  return inv.paidCents > 0n || credited ? "PARTIAL" : "OPEN";
}

/** Recompute and store an invoice's status after a payment or adjustment. */
export async function refreshInvoiceStatus(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { adjustments: true } });
  const status = statusFor(inv, inv.status);
  if (status !== inv.status) await tx.invoice.update({ where: { id: inv.id }, data: { status } });
  return status;
}

/**
 * Reserve `n` consecutive numbers for a key, atomically (safe under concurrent
 * requests). Returns the first number of the block.
 */
export async function nextNumbers(tx: Tx, tenantId: string, key: string, n: number): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("id", "tenantId", "key", "value")
    VALUES (${randomUUID()}, ${tenantId}, ${key}, ${n}::int)
    ON CONFLICT ("tenantId", "key") DO UPDATE SET "value" = "Counter"."value" + ${n}::int
    RETURNING "value"`;
  return Number(rows[0].value) - n + 1;
}

export const invoiceNumber = (yearName: string, n: number) => `INV-${yearName}-${String(n).padStart(5, "0")}`;

// ─────────────────────────── Termly invoicing ───────────────────────────

export type ClassPlan = {
  classId: string;
  className: string;
  sortOrder: number;
  enrolled: number;
  alreadyInvoiced: number;
  missingStructure: { DAY: number; BOARDING: number };
  toInvoice: number;
  amountCents: bigint;
};

type PlannedInvoice = {
  studentId: string;
  totalCents: bigint;
  lines: { feeItemId: string; description: string; amountCents: bigint }[];
};

export type InvoicePlan = {
  termId: string;
  yearName: string;
  termNumber: number;
  classes: ClassPlan[];
  invoices: PlannedInvoice[];
  totals: { enrolled: number; alreadyInvoiced: number; missingStructure: number; toInvoice: number; amountCents: bigint };
};

/**
 * Work out which enrolled students get an invoice this term and for how much.
 * Uses the fee structure for each student's class + day/boarding. Optional
 * fee items (transport, lunch…) are left out: add those per student as an
 * Extra charge. Students already invoiced for the term are skipped, so this
 * is safe to run again after new students join.
 */
export async function planInvoices(tx: Tx, termId: string): Promise<InvoicePlan> {
  const term = await tx.term.findUniqueOrThrow({ where: { id: termId }, include: { academicYear: true } });

  const [enrollments, structures, invoiced] = await Promise.all([
    tx.enrollment.findMany({
      where: { termId, student: { status: "ACTIVE" } },
      select: {
        studentId: true,
        student: { select: { residence: true } },
        stream: { select: { classId: true, class: { select: { name: true, sortOrder: true } } } },
      },
    }),
    tx.feeStructure.findMany({
      where: { termId },
      include: { lines: { include: { feeItem: true } } },
    }),
    tx.invoice.findMany({ where: { termId }, select: { studentId: true } }),
  ]);

  const invoicedSet = new Set(invoiced.map((i) => i.studentId));
  const structureFor = new Map<string, PlannedInvoice["lines"]>();
  for (const st of structures) {
    const lines = st.lines
      .filter((l) => !l.feeItem.isOptional && l.amountCents > 0n)
      .sort((a, b) => a.feeItem.priority - b.feeItem.priority || a.feeItem.name.localeCompare(b.feeItem.name))
      .map((l) => ({ feeItemId: l.feeItemId, description: l.feeItem.name, amountCents: l.amountCents }));
    if (lines.length) structureFor.set(`${st.classId}:${st.residence}`, lines);
  }

  const classes = new Map<string, ClassPlan>();
  const invoices: PlannedInvoice[] = [];

  for (const e of enrollments) {
    const { classId, class: cls } = e.stream;
    let cp = classes.get(classId);
    if (!cp) {
      cp = {
        classId,
        className: cls.name,
        sortOrder: cls.sortOrder,
        enrolled: 0,
        alreadyInvoiced: 0,
        missingStructure: { DAY: 0, BOARDING: 0 },
        toInvoice: 0,
        amountCents: 0n,
      };
      classes.set(classId, cp);
    }
    cp.enrolled++;
    if (invoicedSet.has(e.studentId)) {
      cp.alreadyInvoiced++;
      continue;
    }
    const residence: Residence = e.student.residence;
    const lines = structureFor.get(`${classId}:${residence}`);
    if (!lines) {
      cp.missingStructure[residence]++;
      continue;
    }
    const totalCents = lines.reduce((s, l) => s + l.amountCents, 0n);
    invoices.push({ studentId: e.studentId, totalCents, lines });
    cp.toInvoice++;
    cp.amountCents += totalCents;
  }

  const list = [...classes.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    termId,
    yearName: term.academicYear.name,
    termNumber: term.number,
    classes: list,
    invoices,
    totals: {
      enrolled: list.reduce((s, c) => s + c.enrolled, 0),
      alreadyInvoiced: list.reduce((s, c) => s + c.alreadyInvoiced, 0),
      missingStructure: list.reduce((s, c) => s + c.missingStructure.DAY + c.missingStructure.BOARDING, 0),
      toInvoice: invoices.length,
      amountCents: invoices.reduce((s, i) => s + i.totalCents, 0n),
    },
  };
}

/** Create the planned invoices in bulk (a handful of queries, not one per student). */
export async function generateInvoices(tx: Tx, tenantId: string, termId: string) {
  const plan = await planInvoices(tx, termId);
  if (plan.invoices.length === 0) return { created: 0, amountCents: 0n, plan };

  const first = await nextNumbers(tx, tenantId, `invoice:${plan.yearName}`, plan.invoices.length);
  const created = await tx.invoice.createManyAndReturn({
    data: plan.invoices.map((p, i) => ({
      tenantId,
      studentId: p.studentId,
      termId,
      number: invoiceNumber(plan.yearName, first + i),
      totalCents: p.totalCents,
      status: "OPEN" as const,
    })),
    select: { id: true, studentId: true },
  });
  const idFor = new Map(created.map((c) => [c.studentId, c.id]));

  await tx.invoiceLine.createMany({
    data: plan.invoices.flatMap((p) =>
      p.lines.map((l) => ({ tenantId, invoiceId: idFor.get(p.studentId)!, feeItemId: l.feeItemId, description: l.description, amountCents: l.amountCents })),
    ),
  });

  return { created: created.length, amountCents: plan.totals.amountCents, plan };
}
