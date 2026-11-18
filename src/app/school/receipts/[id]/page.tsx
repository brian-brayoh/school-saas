import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, withTenant } from "@/lib/db";
import { requireSchool } from "@/lib/school";
import { formatKes } from "@/lib/money";
import { kesInWords } from "@/lib/words";
import { methodOf } from "@/lib/payments";
import { invoiceBalance } from "@/lib/fees";
import { PrintButton } from "./PrintButton";
import { InstitutionHeader } from "@/components/InstitutionHeader";
import { brandingUrls } from "@/lib/branding";

/**
 * Printable receipt (A5), outside the app layout so nothing but the receipt prints.
 * Works for every payment: cash, bank, sponsor cheques and M-Pesa.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { tenant, labels: L } = await requireSchool();
  const { id } = await params;

  const data = await withTenant(tenant.id, async (tx) => {
    const receipt = await tx.receipt.findUnique({
      where: { id },
      include: {
        payment: {
          include: {
            channel: true,
            reversal: true,
            allocations: { include: { invoice: { include: { term: { include: { academicYear: true } } } } } },
            student: {
              include: {
                enrollments: { where: { term: { isCurrent: true } }, include: { stream: { include: { class: true } } } },
                invoices: { where: { status: { in: ["OPEN", "PARTIAL"] } }, include: { adjustments: true } },
                credits: { where: { appliedAt: null } },
              },
            },
          },
        },
      },
    });
    if (!receipt) return null;
    const recordedBy = (receipt.payment.rawPayload as { recordedBy?: string } | null)?.recordedBy;
    const servedBy = recordedBy ? (await prisma.user.findUnique({ where: { id: recordedBy }, select: { name: true } }))?.name : null;
    return { receipt, servedBy, brand: await brandingUrls(tx, tenant) };
  });
  if (!data) notFound();

  const { receipt, servedBy, brand } = data;
  const p = receipt.payment;
  const s = p.student;
  const e = s?.enrollments[0];
  const balance = s ? s.invoices.reduce((t, i) => t + invoiceBalance(i), 0n) - s.credits.reduce((t, c) => t + c.amountCents, 0n) : null;
  const allocated = p.allocations.filter((a) => a.amountCents > 0n);
  const credit = p.amountCents - allocated.reduce((t, a) => t + a.amountCents, 0n);
  const isMpesa = p.channel.type === "PAYBILL" || p.channel.type === "TILL";
  const when = p.paidAt.toLocaleString("en-KE", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Nairobi" });

  return (
    <div className="min-h-screen bg-stone-100 py-8 print:bg-white print:py-0">
      <style>{`@page { size: A5; margin: 12mm; } @media print { .no-print { display: none !important; } }`}</style>

      <div className="no-print mx-auto mb-4 flex max-w-[148mm] items-center justify-between px-2">
        <Link href={s ? `/students/${s.id}` : "/payments"} className="text-sm text-brand-700 hover:underline">← Back</Link>
        <PrintButton />
      </div>

      <article className="relative mx-auto max-w-[148mm] bg-white p-8 shadow-sm ring-1 ring-stone-200 print:max-w-none print:p-0 print:shadow-none print:ring-0">
        {p.reversal && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="-rotate-12 rounded border-4 border-red-600/70 px-6 py-2 text-4xl font-black tracking-widest text-red-600/70">REVERSED</span>
          </div>
        )}

        <InstitutionHeader tenant={tenant} sealUrl={brand.sealUrl} logoUrl={brand.logoUrl}>
          <div className="text-base font-bold">Official receipt</div>
          <div className="font-mono text-lg font-bold">{receipt.number}</div>
        </InstitutionHeader>

        <dl className="mt-5 grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
          <dt className="text-stone-500">Date</dt><dd>{when}</dd>
          <dt className="text-stone-500">Received from</dt><dd>{p.payerName || (s ? `${L.guardian} of ${s.firstName} ${s.lastName}` : "—")}</dd>
          {s && (
            <>
              <dt className="text-stone-500">{L.student}</dt>
              <dd className="font-medium">{s.firstName} {s.lastName}</dd>
              <dt className="text-stone-500">{L.admissionNo}</dt>
              <dd className="font-mono">{s.admissionNo}</dd>
              {e && (<><dt className="text-stone-500">{L.class}</dt><dd>{e.stream.class.name}{e.stream.name !== "Main" ? ` ${e.stream.name}` : ""}</dd></>)}
            </>
          )}
          <dt className="text-stone-500">Paid by</dt><dd>{methodOf(p.channel)}</dd>
          <dt className="text-stone-500">{isMpesa ? "M-Pesa code" : "Reference"}</dt><dd className="font-mono">{p.reference}</dd>
        </dl>

        <div className="mt-6 rounded-md border-2 border-stone-800 p-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm font-semibold">Amount received</span>
            <span className="text-2xl font-bold tabular-nums">{formatKes(p.amountCents)}</span>
          </div>
          <p className="mt-1 text-sm italic text-stone-700">{kesInWords(p.amountCents)}</p>
        </div>

        {(allocated.length > 0 || credit > 0n) && (
          <table className="mt-5 w-full text-sm">
            <thead className="text-left text-stone-500"><tr><th className="pb-1 font-normal">Applied to</th><th className="pb-1 text-right font-normal">Amount</th></tr></thead>
            <tbody className="divide-y divide-stone-200 tabular-nums">
              {allocated.map((a) => (
                <tr key={a.id}>
                  <td className="py-1.5">{a.invoice.number}, {a.invoice.term.academicYear.name} {L.term} {a.invoice.term.number}</td>
                  <td className="text-right">{formatKes(a.amountCents)}</td>
                </tr>
              ))}
              {credit > 0n && <tr><td className="py-1.5">Credit carried to next {L.term.toLowerCase()}</td><td className="text-right">{formatKes(credit)}</td></tr>}
            </tbody>
          </table>
        )}

        {balance !== null && !p.reversal && (
          <p className="mt-5 flex justify-between border-t border-stone-300 pt-3 text-sm">
            <span>Fee balance now</span>
            <span className="font-semibold tabular-nums">{balance > 0n ? formatKes(balance) : balance < 0n ? `${formatKes(-balance)} in credit` : "Fully paid"}</span>
          </p>
        )}

        <footer className="mt-10 grid grid-cols-2 gap-8 text-sm">
          <div>
            <div className="h-8 border-b border-stone-400" />
            <div className="mt-1 text-stone-600">Received by{servedBy ? `: ${servedBy}` : isMpesa ? ": automatic (M-Pesa)" : ""}</div>
          </div>
          <div>
            <div className="h-8 border-b border-stone-400" />
            <div className="mt-1 text-stone-600">School stamp</div>
          </div>
        </footer>
        <p className="mt-6 text-center text-xs text-stone-400">Generated {new Date().toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" })}. Check it against {tenant.name}&apos;s records using the receipt number.</p>
      </article>
    </div>
  );
}
