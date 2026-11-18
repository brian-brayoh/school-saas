import Link from "next/link";
import { notFound } from "next/navigation";
import { withTenant } from "@/lib/db";
import { requireSchool } from "@/lib/school";
import { formatKes } from "@/lib/money";
import { ADJUSTMENT_LABELS, signedAdjustment } from "@/lib/fees";
import { methodOf } from "@/lib/payments";
import { formatKePhone } from "@/lib/phone";
import { PSEUDO_SHORTCODES } from "@/lib/c2b";
import { PrintButton } from "./PrintButton";
import { InstitutionHeader } from "@/components/InstitutionHeader";
import { brandingUrls } from "@/lib/branding";

type Entry = { date: Date; ref: string; text: string; detail?: string; debit: bigint; credit: bigint };

/**
 * Printable fee statement (A4) with a running balance: invoices, bursaries,
 * extra charges and payments in date order. Closing balance = billed - paid,
 * so overpayments show as credit.
 */
export default async function StatementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string }> }) {
  const { tenant, labels: L } = await requireSchool();
  const { id } = await params;
  const { year } = await searchParams;

  const data = await withTenant(tenant.id, async (tx) => {
    const student = await tx.student.findUnique({
      where: { id },
      include: {
        enrollments: { where: { term: { isCurrent: true } }, include: { stream: { include: { class: true } } } },
        guardians: { where: { isPrimary: true }, include: { guardian: true } },
        invoices: { where: { status: { not: "VOID" } }, include: { term: { include: { academicYear: true } }, lines: true } },
        adjustments: { include: { invoice: { select: { status: true } } } },
        payments: { where: { matchStatus: "MATCHED" }, include: { channel: true, receipt: true } },
      },
    });
    if (!student) return null;
    const paybill = await tx.paymentChannel.findFirst({
      where: { type: { in: ["PAYBILL", "TILL"] }, shortcode: { notIn: PSEUDO_SHORTCODES }, environment: "production" },
    });
    const years = await tx.academicYear.findMany({ orderBy: { startsOn: "desc" }, select: { name: true } });
    return { student, paybill, years, brand: await brandingUrls(tx, tenant) };
  });
  if (!data) notFound();
  const { student: s, paybill, years, brand } = data;

  const entries: Entry[] = [];
  for (const inv of s.invoices) {
    entries.push({
      date: inv.issuedAt,
      ref: inv.number,
      text: `Fees, ${inv.term.academicYear.name} ${L.term} ${inv.term.number}`,
      detail: inv.lines.map((l) => `${l.description} ${formatKes(l.amountCents, { bare: true })}`).join(", "),
      debit: inv.totalCents,
      credit: 0n,
    });
  }
  for (const a of s.adjustments) {
    if (a.invoice?.status === "VOID") continue;
    const v = signedAdjustment(a);
    entries.push({ date: a.createdAt, ref: "", text: ADJUSTMENT_LABELS[a.type].replace(/ \(.*\)$/, ""), detail: a.reason, debit: v > 0n ? v : 0n, credit: v < 0n ? -v : 0n });
  }
  for (const p of s.payments) {
    const reversal = p.amountCents < 0n;
    entries.push({
      date: p.paidAt,
      ref: p.receipt?.number ?? "",
      text: reversal ? "Payment reversed" : `Payment, ${methodOf(p.channel)}`,
      detail: p.reference,
      debit: reversal ? -p.amountCents : 0n,
      credit: reversal ? 0n : p.amountCents,
    });
  }
  entries.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Optional single-year view: everything before it becomes the opening balance.
  let opening = 0n;
  let shown = entries;
  const yr = year ? years.find((y) => y.name === year) : null;
  if (yr) {
    const start = s.invoices.filter((i) => i.term.academicYear.name === yr.name).reduce<Date | null>((m, i) => (!m || i.issuedAt < m ? i.issuedAt : m), null);
    if (start) {
      opening = entries.filter((e) => e.date < start).reduce((t, e) => t + e.debit - e.credit, 0n);
      shown = entries.filter((e) => e.date >= start);
    }
  }
  let running = opening;
  const rows = shown.map((e) => ({ ...e, balance: (running += e.debit - e.credit) }));
  const closing = running;
  const totals = rows.reduce((t, r) => ({ debit: t.debit + r.debit, credit: t.credit + r.credit }), { debit: 0n, credit: 0n });

  const e = s.enrollments[0];
  const g = s.guardians[0]?.guardian;
  const fmt = (d: Date) => d.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Nairobi" });
  const asAt = new Date().toLocaleDateString("en-KE", { dateStyle: "long", timeZone: "Africa/Nairobi" });

  return (
    <div className="min-h-screen bg-stone-100 py-8 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 14mm; } @media print { .no-print { display: none !important; } tr { break-inside: avoid; } }`}</style>

      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-2">
        <Link href={`/students/${s.id}`} className="text-sm text-brand-700 hover:underline">← Back</Link>
        <div className="flex items-center gap-3">
          <form className="flex items-center gap-2 text-sm">
            <select name="year" defaultValue={year ?? ""} className="rounded-md border border-stone-300 bg-white px-2 py-1.5">
              <option value="">All years</option>
              {years.map((y) => <option key={y.name} value={y.name}>{y.name} only</option>)}
            </select>
            <button className="rounded-md border border-stone-300 bg-white px-3 py-1.5 hover:bg-stone-50">Show</button>
          </form>
          <PrintButton />
        </div>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white p-10 shadow-sm ring-1 ring-stone-200 print:max-w-none print:p-0 print:shadow-none print:ring-0">
        <InstitutionHeader tenant={tenant} sealUrl={brand.sealUrl} logoUrl={brand.logoUrl}>
          <div className="text-lg font-bold">Fee statement</div>
          <div className="text-sm text-stone-600">As at {asAt}{yr ? `, ${yr.name}` : ""}</div>
        </InstitutionHeader>

        <div className="mt-5 grid gap-6 text-sm sm:grid-cols-2">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1">
            <dt className="text-stone-500">{L.student}</dt><dd className="font-semibold">{s.firstName} {s.lastName}</dd>
            <dt className="text-stone-500">{L.admissionNo}</dt><dd className="font-mono">{s.admissionNo}</dd>
            {e && (<><dt className="text-stone-500">{L.class}</dt><dd>{e.stream.class.name}{e.stream.name !== "Main" ? ` ${e.stream.name}` : ""}</dd></>)}
          </dl>
          {g && (
            <dl className="grid grid-cols-[8rem_1fr] gap-y-1">
              <dt className="text-stone-500">{L.guardian}</dt><dd>{g.name}</dd>
              <dt className="text-stone-500">Phone</dt><dd>{formatKePhone(g.phone)}</dd>
            </dl>
          )}
        </div>

        <table className="mt-6 w-full text-sm tabular-nums">
          <thead className="border-y border-stone-800 text-left">
            <tr>
              <th className="py-2 pr-2 font-semibold">Date</th>
              <th className="pr-2 font-semibold">Ref</th>
              <th className="pr-2 font-semibold">Description</th>
              <th className="pr-2 text-right font-semibold">Charged</th>
              <th className="pr-2 text-right font-semibold">Paid / credited</th>
              <th className="text-right font-semibold">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 align-top">
            {yr && (
              <tr><td className="py-2" colSpan={5}>Balance brought forward</td><td className="text-right">{formatKes(opening, { bare: true })}</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap py-2 pr-2">{fmt(r.date)}</td>
                <td className="whitespace-nowrap pr-2 font-mono text-xs">{r.ref}</td>
                <td className="pr-2">
                  {r.text}
                  {r.detail && <span className="block text-xs text-stone-500">{r.detail}</span>}
                </td>
                <td className="pr-2 text-right">{r.debit ? formatKes(r.debit, { bare: true }) : ""}</td>
                <td className="pr-2 text-right">{r.credit ? formatKes(r.credit, { bare: true }) : ""}</td>
                <td className="text-right">{formatKes(r.balance, { bare: true })}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-stone-500">No transactions yet.</td></tr>}
          </tbody>
          <tfoot className="border-y-2 border-stone-800 font-semibold">
            <tr>
              <td colSpan={3} className="py-2">Totals</td>
              <td className="pr-2 text-right">{formatKes(totals.debit, { bare: true })}</td>
              <td className="pr-2 text-right">{formatKes(totals.credit, { bare: true })}</td>
              <td />
            </tr>
          </tfoot>
        </table>

        <div className="mt-6 flex justify-end">
          <div className="min-w-64 rounded-md border-2 border-stone-800 px-5 py-3 text-right">
            <div className="text-sm text-stone-600">{closing > 0n ? "Balance due" : closing < 0n ? "In credit" : "Balance"}</div>
            <div className="text-2xl font-bold tabular-nums">{closing === 0n ? "Fully paid" : formatKes(closing < 0n ? -closing : closing)}</div>
          </div>
        </div>

        {closing > 0n && (
          <p className="mt-6 rounded-md bg-stone-100 px-4 py-3 text-sm print:border print:border-stone-300 print:bg-white">
            {paybill ? (
              <>Pay by M-Pesa: <strong>{paybill.type === "TILL" ? "Buy Goods, till" : "Paybill"} {paybill.shortcode}</strong>{paybill.type === "PAYBILL" && <>, account number <strong className="font-mono">{s.admissionNo}</strong></>}. Keep the M-Pesa message as proof of payment.</>
            ) : (
              <>Please quote admission number <strong className="font-mono">{s.admissionNo}</strong> with every payment.</>
            )}
          </p>
        )}

        <p className="mt-8 text-center text-xs text-stone-400">Generated {asAt} from {tenant.name}&apos;s fee records. Contact the bursar about any entry you don&apos;t recognise.</p>
      </article>
    </div>
  );
}
