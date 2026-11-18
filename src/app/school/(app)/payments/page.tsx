import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/db";
import { requireSchool, FINANCE_ROLES } from "@/lib/school";
import { formatKes } from "@/lib/money";
import { methodOf } from "@/lib/payments";
import { ActionForm } from "@/components/ActionForm";
import { RecordPaymentFields } from "@/components/RecordPaymentFields";
import { Card, PageHeader, Stat, btnSecondaryCls, inputCls } from "@/components/ui";
import { recordPayment, simulateMpesa, simulatorEnabled } from "./actions";
import { Field, Notice } from "@/components/ui";

const fmt = (d: Date) => d.toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });

function nairobiDayStart(daysAgo = 0) {
  const day = new Date(Date.now() - daysAgo * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
  return new Date(`${day}T00:00:00+03:00`);
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { tenant } = await requireSchool(FINANCE_ROLES);
  const q = ((await searchParams).q ?? "").trim();

  const data = await withTenant(tenant.id, async (tx) => {
    const where: Prisma.PaymentWhereInput = q
      ? {
          OR: [
            { reference: { contains: q, mode: "insensitive" } },
            { receipt: { number: { contains: q, mode: "insensitive" } } },
            { student: { admissionNo: { contains: q, mode: "insensitive" } } },
            { student: { lastName: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {};
    const monthStart = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }).slice(0, 7)}-01T00:00:00+03:00`);
    const [payments, today, week, month, toMatch] = await Promise.all([
      tx.payment.findMany({
        where,
        orderBy: { paidAt: "desc" },
        take: 100,
        include: { student: true, receipt: true, channel: true, reversal: true },
      }),
      tx.payment.aggregate({ where: { paidAt: { gte: nairobiDayStart() } }, _sum: { amountCents: true }, _count: true }),
      tx.payment.aggregate({ where: { paidAt: { gte: nairobiDayStart(6) } }, _sum: { amountCents: true } }),
      tx.payment.aggregate({ where: { paidAt: { gte: monthStart } }, _sum: { amountCents: true } }),
      tx.payment.aggregate({ where: { matchStatus: { in: ["UNMATCHED", "SUGGESTED"] } }, _sum: { amountCents: true }, _count: true }),
    ]);
    return { payments, today, week, month, toMatch };
  });

  return (
    <>
      <PageHeader title="Payments" description="Money received. Each payment clears the student's oldest unpaid invoice first." />
      {data.toMatch._count > 0 && (
        <div className="mb-6">
          <Notice tone="error">
            {data.toMatch._count} M-Pesa payment{data.toMatch._count === 1 ? "" : "s"} ({formatKes(data.toMatch._sum.amountCents ?? 0n)}) couldn&apos;t be matched to a student.{" "}
            <Link href="/payments/unmatched" className="font-medium underline">Match them now</Link>
          </Notice>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Today" value={formatKes(data.today._sum.amountCents ?? 0n)} />
        <Stat label="Last 7 days" value={formatKes(data.week._sum.amountCents ?? 0n)} />
        <Stat label="This month" value={formatKes(data.month._sum.amountCents ?? 0n)} />
      </div>

      <Card title="Record a payment" className="mt-6">
        <ActionForm action={recordPayment} submitLabel="Record payment" className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <RecordPaymentFields />
        </ActionForm>
        <p className="mt-3 text-xs text-stone-500">
          For cash, bank deposits, sponsor cheques (CDF, county) and M-Pesa payments you need to enter by hand. Paybill payments will arrive automatically once M-Pesa is connected.
        </p>
      </Card>

      {(await simulatorEnabled()) && (
        <Card title="Simulate an M-Pesa paybill payment" className="mt-6 border-dashed">
          <ActionForm action={simulateMpesa} submitLabel="Simulate payment" className="flex flex-wrap items-end gap-3" buttonClassName={btnSecondaryCls}>
            <Field label="Amount (KES)"><input name="amount" defaultValue="5000" inputMode="decimal" className={`${inputCls} w-28`} /></Field>
            <Field label="Account no as the parent typed it"><input name="billRef" placeholder="d0001, adm 1, D-0001…" className={`${inputCls} w-56`} /></Field>
            <Field label="Payer name"><input name="payerName" placeholder="JANE WANJIKU" className={`${inputCls} w-44`} /></Field>
          </ActionForm>
          <p className="mt-3 text-xs text-stone-500">
            Development only. Runs the same code as a real Safaricom notification: exact matches are receipted automatically, near misses and unknown accounts go to Payments to match.
          </p>
        </Card>
      )}

      <form className="mb-4 mt-8 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Receipt, M-Pesa code, admission no or surname" className={`${inputCls} max-w-sm`} />
        <button className={btnSecondaryCls}>Search</button>
      </form>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-stone-500">
              <tr><th className="pb-2">Paid</th><th>Receipt</th><th>Student</th><th>Method</th><th>Reference</th><th className="text-right">Amount</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.payments.map((p) => {
                const reversed = Boolean(p.reversal);
                const isReversal = p.amountCents < 0n;
                return (
                  <tr key={p.id} className={reversed ? "text-stone-400 line-through" : isReversal ? "text-red-700" : ""}>
                    <td className="py-2 whitespace-nowrap">{fmt(p.paidAt)}</td>
                    <td className="font-mono text-xs">
                      {p.receipt ? (
                        <a href={`/receipts/${p.receipt.id}`} target="_blank" rel="noopener" className="text-brand-700 hover:underline">{p.receipt.number}</a>
                      ) : isReversal ? "reversal" : "—"}
                    </td>
                    <td>
                      {p.student ? (
                        <Link className="text-brand-700 hover:underline" href={`/students/${p.student.id}`}>{p.student.admissionNo} · {p.student.firstName} {p.student.lastName}</Link>
                      ) : (
                        <span className="text-amber-700">Unmatched</span>
                      )}
                    </td>
                    <td>{methodOf(p.channel)}{p.matchStatus === "IGNORED" && <span className="ml-1 text-xs text-stone-500">(set aside)</span>}</td>
                    <td className="font-mono text-xs">{p.reference}</td>
                    <td className="text-right tabular-nums font-medium">{formatKes(p.amountCents)}</td>
                  </tr>
                );
              })}
              {data.payments.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-stone-500">No payments yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-stone-500">To reverse a payment recorded by mistake, open the student&apos;s statement.</p>
      </Card>
    </>
  );
}
