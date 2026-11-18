import Link from "next/link";
import { notFound } from "next/navigation";
import { withTenant } from "@/lib/db";
import { requireSchool, can, FINANCE_ROLES } from "@/lib/school";
import { ADJUSTMENT_LABELS, invoiceBalance, signedAdjustment } from "@/lib/fees";
import { formatKes } from "@/lib/money";
import { formatKePhone } from "@/lib/phone";
import { ActionForm } from "@/components/ActionForm";
import { Card, Field, PageHeader, Stat, inputCls } from "@/components/ui";
import { addAdjustment } from "./actions";
import { recordPayment, reversePaymentAction } from "../../payments/actions";
import { RecordPaymentFields } from "@/components/RecordPaymentFields";
import { methodOf } from "@/lib/payments";
import { btnSecondaryCls } from "@/components/ui";

const fmtDate = (d: Date) => d.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-amber-50 text-amber-800",
  PARTIAL: "bg-sky-50 text-sky-800",
  PAID: "bg-brand-50 text-brand-700",
  VOID: "bg-stone-100 text-stone-500 line-through",
};

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { tenant, role, labels: L } = await requireSchool();
  const { id } = await params;
  const finance = can(role, FINANCE_ROLES);

  const student = await withTenant(tenant.id, (tx) =>
    tx.student.findUnique({
      where: { id },
      include: {
        guardians: { include: { guardian: true }, orderBy: { isPrimary: "desc" } },
        enrollments: { include: { term: { include: { academicYear: true } }, stream: { include: { class: true } } }, orderBy: { createdAt: "desc" } },
        invoices: {
          include: {
            term: { include: { academicYear: true } },
            lines: true,
            adjustments: { include: { approvedBy: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
          },
          orderBy: { issuedAt: "desc" },
        },
        payments: { include: { receipt: true, channel: true, reversal: true }, orderBy: { paidAt: "desc" } },
        credits: { where: { appliedAt: null } },
      },
    }),
  );
  if (!student) notFound();

  const live = student.invoices.filter((i) => i.status !== "VOID");
  const totalBalance = live.reduce((s, i) => s + invoiceBalance(i), 0n);
  const billed = live.reduce((s, i) => s + i.totalCents + i.adjustments.reduce((a, x) => a + signedAdjustment(x), 0n), 0n);
  const paid = live.reduce((s, i) => s + i.paidCents, 0n);
  const current = student.enrollments.find((e) => e.term.isCurrent) ?? student.enrollments[0];
  const openInvoices = live.filter((i) => i.status !== "PAID");
  const credit = student.credits.reduce((s, c) => s + c.amountCents, 0n);

  return (
    <>
      <div className="mb-2 text-sm"><Link href="/students" className="text-brand-700 hover:underline">← {L.students}</Link></div>
      <PageHeader
        actions={<a href={`/statements/${student.id}`} target="_blank" rel="noopener" className={btnSecondaryCls}>Print statement</a>}
        title={`${student.firstName} ${student.lastName}`}
        description={`${L.admissionNo} ${student.admissionNo} · ${current ? `${current.stream.class.name}${current.stream.name !== "Main" ? ` ${current.stream.name}` : ""}` : "Not enrolled"} · ${student.residence === "BOARDING" ? L.boarding : L.day}${student.status !== "ACTIVE" ? ` · ${student.status.toLowerCase()}` : ""}`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Balance" value={formatKes(totalBalance - credit)} hint={credit > 0n ? `Includes ${formatKes(credit)} credit for next term` : undefined} />
        <Stat label="Billed (after adjustments)" value={formatKes(billed)} />
        <Stat label="Paid" value={formatKes(paid)} hint={`M-Pesa account no: ${student.admissionNo}`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {student.invoices.map((inv) => {
            const bal = invoiceBalance(inv);
            return (
              <Card key={inv.id}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-sm font-medium">{inv.number}</span>
                    <span className="ml-2 text-sm text-stone-600">{inv.term.academicYear.name} · {L.term} {inv.term.number} · issued {fmtDate(inv.issuedAt)}</span>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[inv.status]}`}>{inv.status.toLowerCase()}</span>
                </div>
                <table className="w-full text-sm tabular-nums">
                  <tbody className="divide-y divide-stone-100">
                    {inv.lines.map((l) => (
                      <tr key={l.id}><td className="py-1.5">{l.description}</td><td className="text-right">{formatKes(l.amountCents)}</td></tr>
                    ))}
                    {inv.adjustments.map((a) => (
                      <tr key={a.id} className={a.type === "DEBIT" ? "" : "text-brand-700"}>
                        <td className="py-1.5">
                          {ADJUSTMENT_LABELS[a.type]}: {a.reason}
                          <span className="block text-xs text-stone-500">{fmtDate(a.createdAt)} · by {a.approvedBy.name}</span>
                        </td>
                        <td className="text-right">{formatKes(signedAdjustment(a))}</td>
                      </tr>
                    ))}
                    {inv.paidCents > 0n && <tr><td className="py-1.5">Payments</td><td className="text-right">{formatKes(-inv.paidCents)}</td></tr>}
                  </tbody>
                  <tfoot className="border-t-2 border-stone-200 font-semibold">
                    <tr><td className="pt-2">Balance</td><td className="pt-2 text-right">{formatKes(bal)}</td></tr>
                  </tfoot>
                </table>
              </Card>
            );
          })}
          <Card title="Payments">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-stone-100">
                {student.payments.map((p) => {
                  const reversed = Boolean(p.reversal);
                  const isReversal = p.amountCents < 0n;
                  return (
                    <tr key={p.id} className={`align-top ${reversed ? "text-stone-400" : isReversal ? "text-red-700" : ""}`}>
                      <td className="py-2">
                        <span className={reversed ? "line-through" : ""}>{fmtDate(p.paidAt)} · {methodOf(p.channel)} · <span className="font-mono text-xs">{p.reference}</span></span>
                        {p.receipt && (
                          <a href={`/receipts/${p.receipt.id}`} target="_blank" rel="noopener" className="block font-mono text-xs text-brand-700 hover:underline">
                            {p.receipt.number}: print
                          </a>
                        )}
                        {reversed && <span className="block text-xs">reversed</span>}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${reversed ? "line-through" : ""}`}>{formatKes(p.amountCents)}</td>
                      <td className="w-28 py-2 text-right">
                        {finance && !reversed && !isReversal && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-red-700">Reverse…</summary>
                            <form action={reversePaymentAction} className="mt-2 space-y-2 text-left">
                              <input type="hidden" name="paymentId" value={p.id} />
                              <input name="reason" placeholder="Reason" className={`${inputCls} py-1 text-xs`} />
                              <button className={`${btnSecondaryCls} w-full py-1 text-xs text-red-700`}>Confirm reversal</button>
                            </form>
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {student.payments.length === 0 && <tr><td className="py-2 text-stone-500">No payments yet.</td></tr>}
              </tbody>
            </table>
            {credit > 0n && <p className="mt-3 text-sm text-brand-700">{formatKes(credit)} overpaid. It will be used on the next invoice automatically.</p>}
          </Card>
          {student.invoices.length === 0 && (
            <Card><p className="text-sm text-stone-600">No invoices yet. {finance && <Link className="text-brand-700 hover:underline" href="/fees/invoicing">Run termly invoicing</Link>}</p></Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title={L.guardians}>
            <ul className="space-y-2 text-sm">
              {student.guardians.map(({ guardian: g, isPrimary, receivesSms }) => (
                <li key={g.id}>
                  <div className="font-medium">{g.name}{isPrimary && <span className="ml-2 text-xs text-stone-500">primary</span>}</div>
                  <div className="text-stone-600">{formatKePhone(g.phone)}{g.relationship ? ` · ${g.relationship}` : ""}{!receivesSms && " · no SMS"}</div>
                </li>
              ))}
              {student.guardians.length === 0 && <li className="text-amber-700">No {L.guardian.toLowerCase()} on record.</li>}
            </ul>
          </Card>

          {finance && (
            <Card title="Record a payment">
              <ActionForm action={recordPayment} submitLabel="Record payment" className="space-y-3">
                <RecordPaymentFields studentId={student.id} />
              </ActionForm>
            </Card>
          )}

          {finance && openInvoices.length > 0 && (
            <Card title="Bursary, waiver or extra charge">
              <ActionForm action={addAdjustment} submitLabel="Record" className="space-y-3">
                <input type="hidden" name="studentId" value={student.id} />
                <Field label="Invoice">
                  <select name="invoiceId" className={inputCls}>
                    {openInvoices.map((i) => (
                      <option key={i.id} value={i.id}>{i.number} · balance {formatKes(invoiceBalance(i))}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Type">
                  <select name="type" className={inputCls} defaultValue="BURSARY">
                    {Object.entries(ADJUSTMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Amount (KES)"><input name="amount" inputMode="decimal" required className={inputCls} /></Field>
                <Field label="Reason" hint="Shown on the statement"><input name="reason" required className={inputCls} placeholder="CDF bursary 2027" /></Field>
              </ActionForm>
              <p className="mt-3 text-xs text-stone-500">
                Recorded under your name. To undo, record the opposite (an extra charge cancels a waiver).
                If a sponsor (CDF, county, NGO) sends money, record it as a <strong>payment</strong> instead, so it counts as collected.
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
