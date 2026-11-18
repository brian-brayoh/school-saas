import Link from "next/link";
import { withTenant } from "@/lib/db";
import { requireSchool } from "@/lib/school";
import { Card, Notice, PageHeader, Stat } from "@/components/ui";
import { formatKes } from "@/lib/money";
import { invoiceBalance } from "@/lib/fees";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { tenant, labels: L } = await requireSchool();
  const { denied } = await searchParams;

  const data = await withTenant(tenant.id, async (tx) => {
    const [students, guardians, classes, term, noGuardian] = await Promise.all([
      tx.student.count({ where: { status: "ACTIVE" } }),
      tx.guardian.count(),
      tx.class.count(),
      tx.term.findFirst({ where: { isCurrent: true }, include: { academicYear: true } }),
      tx.student.count({ where: { status: "ACTIVE", guardians: { none: {} } } }),
    ]);
    const enrolled = term ? await tx.enrollment.count({ where: { termId: term.id, student: { status: "ACTIVE" } } }) : 0;
    const invoices = term
      ? await tx.invoice.findMany({ where: { termId: term.id, status: { not: "VOID" } }, include: { adjustments: true } })
      : [];
    let outstanding = 0n, collected = 0n, owing = 0;
    for (const inv of invoices) {
      collected += inv.paidCents;
      const b = invoiceBalance(inv);
      if (b > 0n) { outstanding += b; owing++; }
    }
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
    const today = await tx.payment.aggregate({ where: { paidAt: { gte: new Date(`${day}T00:00:00+03:00`) } }, _sum: { amountCents: true }, _count: true });
    return {
      students, guardians, classes, term, noGuardian, enrolled, invoiced: invoices.length, outstanding, collected, owing,
      today: today._sum.amountCents ?? 0n, todayCount: today._count,
    };
  });

  return (
    <>
      <PageHeader title="Dashboard" description={tenant.name} />
      {denied && <div className="mb-6"><Notice tone="error">Your role doesn&apos;t have access to that page.</Notice></div>}
      {!data.term && (
        <div className="mb-6">
          <Notice>
            No current term is set. <Link href="/setup" className="font-medium underline">Set up the academic year</Link> before importing students.
          </Notice>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Active ${L.students.toLowerCase()}`} value={data.students} />
        <Stat
          label="Enrolled this term"
          value={data.enrolled}
          hint={data.term ? `${data.term.academicYear.name} · ${L.term} ${data.term.number}` : "No current term"}
        />
        <Stat label={L.guardians} value={data.guardians} hint={data.noGuardian ? `${data.noGuardian} ${L.students.toLowerCase()} have none` : undefined} />
        <Stat label={L.classes} value={data.classes} />
      </div>
      {data.invoiced > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Outstanding fees" value={formatKes(data.outstanding)} hint={`${data.owing} students owing`} />
          <Stat label="Collected this term" value={formatKes(data.collected)} />
          <Stat label="Collected today" value={formatKes(data.today)} hint={`${data.todayCount} payment${data.todayCount === 1 ? "" : "s"}`} />
          <Stat label="Invoiced" value={`${data.invoiced} / ${data.enrolled}`} hint="students this term" />
        </div>
      )}
      <Card title="Next steps" className="mt-8">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-stone-700">
          <li><Link className="text-brand-700 hover:underline" href="/setup">Set the academic year, {L.terms.toLowerCase()} and {L.classes.toLowerCase()}</Link></li>
          <li><Link className="text-brand-700 hover:underline" href="/students/import">Import {L.students.toLowerCase()} and {L.guardians.toLowerCase()} from Excel</Link></li>
          <li><Link className="text-brand-700 hover:underline" href="/users">Add the bursar and other staff</Link></li>
          <li><Link className="text-brand-700 hover:underline" href="/fees">Set up fees and invoice the term</Link></li>
          <li><Link className="text-brand-700 hover:underline" href="/payments">Record cash, bank and sponsor payments</Link></li>
          <li className="text-stone-500">Automatic M-Pesa collection and SMS arrive next.</li>
        </ol>
      </Card>
    </>
  );
}
