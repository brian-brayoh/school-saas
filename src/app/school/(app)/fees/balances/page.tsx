import Link from "next/link";
import { withTenant } from "@/lib/db";
import { requireSchool, FINANCE_ROLES } from "@/lib/school";
import { invoiceBalance } from "@/lib/fees";
import { formatKes } from "@/lib/money";
import { formatKePhone } from "@/lib/phone";
import { Card, Notice, PageHeader, btnSecondaryCls, inputCls } from "@/components/ui";
import { resolveTerm, termLabel } from "../terms";

export default async function BalancesPage({ searchParams }: { searchParams: Promise<{ term?: string; class?: string; min?: string }> }) {
  const { tenant, labels: L } = await requireSchool(FINANCE_ROLES);
  const sp = await searchParams;

  const data = await withTenant(tenant.id, async (tx) => {
    const { term, terms } = await resolveTerm(tx, sp.term);
    if (!term) return null;
    const [invoices, classes] = await Promise.all([
      tx.invoice.findMany({
        where: {
          termId: term.id,
          status: { in: ["OPEN", "PARTIAL"] },
          ...(sp.class && { student: { enrollments: { some: { termId: term.id, stream: { classId: sp.class } } } } }),
        },
        include: {
          adjustments: true,
          student: {
            include: {
              enrollments: { where: { termId: term.id }, include: { stream: { include: { class: true } } } },
              guardians: { where: { isPrimary: true }, include: { guardian: true } },
            },
          },
        },
      }),
      tx.class.findMany({ orderBy: { sortOrder: "asc" } }),
    ]);
    return { term, terms, invoices, classes };
  }, { timeout: 60_000 });

  if (!data) return <Notice>Set a current term under <Link className="underline" href="/setup">Academic setup</Link> first.</Notice>;

  const min = BigInt(Math.max(0, Math.floor(Number(sp.min) || 0))) * 100n;
  const rows = data.invoices
    .map((inv) => ({ inv, balance: invoiceBalance(inv) }))
    .filter((r) => r.balance > 0n && r.balance >= min)
    .sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));
  const total = rows.reduce((s, r) => s + r.balance, 0n);

  return (
    <>
      <PageHeader
        title="Balances"
        description={`${rows.length} student${rows.length === 1 ? "" : "s"} owing ${formatKes(total)} for ${termLabel(data.term)}`}
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="term" defaultValue={data.term.id} className={`${inputCls} w-48`}>
          {data.terms.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}
        </select>
        <select name="class" defaultValue={sp.class ?? ""} className={`${inputCls} w-40`}>
          <option value="">All {L.classes.toLowerCase()}</option>
          {data.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input name="min" defaultValue={sp.min ?? ""} placeholder="Owing at least (KES)" inputMode="numeric" className={`${inputCls} w-48`} />
        <button className={btnSecondaryCls}>Filter</button>
      </form>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-stone-500">
              <tr><th className="pb-2">{L.admissionNo}</th><th>{L.student}</th><th>{L.class}</th><th>{L.guardian}</th><th>Invoice</th><th className="text-right">Balance</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map(({ inv, balance }) => {
                const s = inv.student;
                const e = s.enrollments[0];
                const g = s.guardians[0]?.guardian;
                return (
                  <tr key={inv.id}>
                    <td className="py-2 font-mono">{s.admissionNo}</td>
                    <td><Link className="font-medium text-brand-700 hover:underline" href={`/students/${s.id}`}>{s.lastName}, {s.firstName}</Link></td>
                    <td>{e ? e.stream.class.name : "—"}</td>
                    <td>{g ? `${g.name} · ${formatKePhone(g.phone)}` : <span className="text-amber-700">None</span>}</td>
                    <td className="font-mono text-xs">{inv.number}</td>
                    <td className="text-right font-medium tabular-nums">{formatKes(balance)}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-stone-500">Nobody owes anything for this term.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
