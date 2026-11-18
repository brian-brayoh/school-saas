import Link from "next/link";
import type { Residence } from "@prisma/client";
import { withTenant } from "@/lib/db";
import { requireSchool, FINANCE_ROLES } from "@/lib/school";
import { formatKes, kesInputValue } from "@/lib/money";
import { ActionForm } from "@/components/ActionForm";
import { Card, Notice, PageHeader, btnSecondaryCls, inputCls } from "@/components/ui";
import { resolveTerm, termLabel } from "../terms";
import { TermPicker } from "../TermPicker";
import { copyStructures, saveStructures } from "./actions";

export default async function StructuresPage({ searchParams }: { searchParams: Promise<{ term?: string; residence?: string }> }) {
  const { tenant, labels: L } = await requireSchool(FINANCE_ROLES);
  const sp = await searchParams;
  const residence: Residence = sp.residence === "BOARDING" ? "BOARDING" : "DAY";

  const data = await withTenant(tenant.id, async (tx) => {
    const { term, terms } = await resolveTerm(tx, sp.term);
    if (!term) return null;
    const [classes, items, structures, invoiced] = await Promise.all([
      tx.class.findMany({ orderBy: { sortOrder: "asc" } }),
      tx.feeItem.findMany({ orderBy: [{ priority: "asc" }, { name: "asc" }] }),
      tx.feeStructure.findMany({ where: { termId: term.id, residence }, include: { lines: true } }),
      tx.invoice.count({ where: { termId: term.id } }),
    ]);
    return { term, terms, classes, items, structures, invoiced };
  });

  if (!data) return <Notice>Set a current term under <Link className="underline" href="/setup">Academic setup</Link> first.</Notice>;
  const { term, terms, classes, items, structures, invoiced } = data;

  if (!items.length) {
    return (
      <>
        <PageHeader title="Fee structures" />
        <Notice>Create your <Link className="font-medium underline" href="/fees/items">fee items</Link> first.</Notice>
      </>
    );
  }

  const amount = new Map<string, bigint>();
  for (const s of structures) for (const l of s.lines) amount.set(`${s.classId}_${l.feeItemId}`, l.amountCents);
  const totals = new Map(classes.map((c) => [c.id, items.reduce((sum, it) => sum + (amount.get(`${c.id}_${it.id}`) ?? 0n), 0n)]));
  const otherTerms = terms.filter((t) => t.id !== term.id);
  const tab = (r: Residence) => `/fees/structures?term=${term.id}&residence=${r}`;

  return (
    <>
      <PageHeader
        title="Fee structures"
        description={`Amount per fee item for each ${L.class.toLowerCase()}, in KES. Leave a cell blank if it doesn't pay that item.`}
        actions={<TermPicker value={term.id} terms={terms.map((t) => ({ id: t.id, label: termLabel(t) }))} />}
      />

      <div className="mb-4 flex gap-2">
        {(["DAY", "BOARDING"] as const).map((r) => (
          <Link key={r} href={tab(r)} className={r === residence ? "rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white" : `${btnSecondaryCls} py-1.5`}>
            {r === "DAY" ? L.dayGroup : L.boardingGroup}
          </Link>
        ))}
      </div>

      {invoiced > 0 && (
        <div className="mb-4"><Notice>{invoiced} invoices already exist for {termLabel(term)}. Changes here apply to students invoiced from now on; existing invoices keep their amounts.</Notice></div>
      )}

      <Card>
        <ActionForm keepValues action={saveStructures} submitLabel={`Save ${(residence === "DAY" ? L.dayGroup : L.boardingGroup).toLowerCase()} fees`} className="space-y-4">
          <input type="hidden" name="termId" value={term.id} />
          <input type="hidden" name="residence" value={residence} />
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead className="text-left text-stone-500">
                <tr>
                  <th className="sticky left-0 bg-white pb-2 pr-4">{L.class}</th>
                  {items.map((it) => (
                    <th key={it.id} className="px-1 pb-2 font-medium">
                      {it.name}{it.isOptional && <span className="block text-xs font-normal">optional</span>}
                    </th>
                  ))}
                  <th className="pb-2 pl-3 text-right">{L.term} total</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((c) => (
                  <tr key={c.id}>
                    <td className="sticky left-0 bg-white py-1 pr-4 font-medium whitespace-nowrap">{c.name}</td>
                    {items.map((it) => (
                      <td key={it.id} className="px-1 py-1">
                        <input
                          name={`a_${c.id}_${it.id}`}
                          defaultValue={kesInputValue(amount.get(`${c.id}_${it.id}`))}
                          inputMode="decimal"
                          className={`${inputCls} w-28 text-right tabular-nums`}
                        />
                      </td>
                    ))}
                    <td className="pl-3 text-right tabular-nums text-stone-600 whitespace-nowrap">
                      {totals.get(c.id) ? formatKes(totals.get(c.id)!) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-stone-500">Totals include optional items, which are only charged to students you add them to. Totals refresh after saving.</p>
        </ActionForm>
      </Card>

      {otherTerms.length > 0 && (
        <Card title="Copy from another term" className="mt-6">
          <ActionForm action={copyStructures} submitLabel="Copy structures" className="flex flex-wrap items-end gap-3" buttonClassName={btnSecondaryCls}>
            <input type="hidden" name="termId" value={term.id} />
            <select name="fromTermId" className={`${inputCls} w-56`}>
              {otherTerms.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}
            </select>
          </ActionForm>
          <p className="mt-3 text-xs text-stone-500">Copies day and boarding fees for classes that don&apos;t have a structure in {termLabel(term)} yet.</p>
        </Card>
      )}
    </>
  );
}
