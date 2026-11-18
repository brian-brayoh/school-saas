import Link from "next/link";
import { withTenant } from "@/lib/db";
import { requireSchool, FINANCE_ROLES } from "@/lib/school";
import { formatKes } from "@/lib/money";
import { invoiceBalance, signedAdjustment } from "@/lib/fees";
import { Card, Notice, PageHeader, Stat } from "@/components/ui";
import { resolveTerm, termLabel } from "./terms";

export default async function FeesOverview() {
  const { tenant } = await requireSchool(FINANCE_ROLES);

  const data = await withTenant(tenant.id, async (tx) => {
    const { term } = await resolveTerm(tx);
    if (!term) return null;
    const [items, structures, enrolled, invoices] = await Promise.all([
      tx.feeItem.count(),
      tx.feeStructure.count({ where: { termId: term.id } }),
      tx.enrollment.count({ where: { termId: term.id, student: { status: "ACTIVE" } } }),
      tx.invoice.findMany({ where: { termId: term.id, status: { not: "VOID" } }, include: { adjustments: true } }),
    ]);
    let billed = 0n, adjusted = 0n, paid = 0n, outstanding = 0n, owing = 0;
    for (const inv of invoices) {
      billed += inv.totalCents;
      adjusted += inv.adjustments.reduce((s, a) => s + signedAdjustment(a), 0n);
      paid += inv.paidCents;
      const b = invoiceBalance(inv);
      if (b > 0n) { outstanding += b; owing++; }
    }
    return { term, items, structures, enrolled, invoiced: invoices.length, billed, adjusted, paid, outstanding, owing };
  });

  if (!data) {
    return (
      <>
        <PageHeader title="Fees" />
        <Notice>Set a current term under <Link className="font-medium underline" href="/setup">Academic setup</Link> first.</Notice>
      </>
    );
  }

  const steps = [
    { done: data.items > 0, href: "/fees/items", text: "Create fee items (Tuition, Lunch, Activity…)" },
    { done: data.structures > 0, href: "/fees/structures", text: `Set fee structures for ${termLabel(data.term)}` },
    { done: data.invoiced > 0 && data.invoiced >= data.enrolled, href: "/fees/invoicing", text: `Invoice all ${data.enrolled} enrolled students` },
  ];

  return (
    <>
      <PageHeader title="Fees" description={termLabel(data.term)} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Billed" value={formatKes(data.billed)} hint={`${data.invoiced} of ${data.enrolled} students invoiced`} />
        <Stat label="Bursaries, waivers & extras" value={formatKes(data.adjusted)} hint="Negative = reduced what's owed" />
        <Stat label="Collected" value={formatKes(data.paid)} hint="M-Pesa arrives in the next build step" />
        <Stat label="Outstanding" value={formatKes(data.outstanding)} hint={`${data.owing} students owing`} />
      </div>
      <Card title="Setting up this term" className="mt-8">
        <ol className="space-y-2 text-sm">
          {steps.map((s, i) => (
            <li key={s.href} className="flex items-center gap-3">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${s.done ? "bg-brand-600 text-white" : "bg-stone-200 text-stone-600"}`}>
                {s.done ? "✓" : i + 1}
              </span>
              <Link href={s.href} className="text-brand-700 hover:underline">{s.text}</Link>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
