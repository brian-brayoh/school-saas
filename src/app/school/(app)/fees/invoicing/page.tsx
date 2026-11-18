import Link from "next/link";
import { withTenant } from "@/lib/db";
import { requireSchool, FINANCE_ROLES } from "@/lib/school";
import { planInvoices } from "@/lib/fees";
import { formatKes } from "@/lib/money";
import { ActionForm } from "@/components/ActionForm";
import { Card, Notice, PageHeader } from "@/components/ui";
import { resolveTerm, termLabel } from "../terms";
import { TermPicker } from "../TermPicker";
import { generateTermInvoices } from "./actions";

export const maxDuration = 60;

export default async function InvoicingPage({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  const { tenant, labels: L } = await requireSchool(FINANCE_ROLES);
  const sp = await searchParams;

  const data = await withTenant(tenant.id, async (tx) => {
    const { term, terms } = await resolveTerm(tx, sp.term);
    if (!term) return null;
    return { term, terms, plan: await planInvoices(tx, term.id) };
  }, { timeout: 60_000 });

  if (!data) return <Notice>Set a current term under <Link className="underline" href="/setup">Academic setup</Link> first.</Notice>;
  const { term, terms, plan } = data;
  const t = plan.totals;

  return (
    <>
      <PageHeader
        title="Termly invoicing"
        description={`One invoice per enrolled student for ${termLabel(term)}, from the class fee structure.`}
        actions={<TermPicker value={term.id} terms={terms.map((x) => ({ id: x.id, label: termLabel(x) }))} />}
      />

      {t.enrolled === 0 && (
        <div className="mb-4"><Notice>No students are enrolled in this term. <Link className="font-medium underline" href="/students/import">Import students</Link> while it is the current term.</Notice></div>
      )}
      {t.missingStructure > 0 && (
        <div className="mb-4">
          <Notice tone="error">
            {t.missingStructure} student{t.missingStructure === 1 ? "" : "s"} can&apos;t be invoiced because their {L.class.toLowerCase()} has no fee structure for {L.day.toLowerCase()} or {L.boarding.toLowerCase()}.{" "}
            <Link className="font-medium underline" href={`/fees/structures?term=${term.id}`}>Set fee structures</Link>
          </Notice>
        </div>
      )}

      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-stone-500">
            <tr>
              <th className="pb-2">{L.class}</th>
              <th className="text-right">Enrolled</th>
              <th className="text-right">Already invoiced</th>
              <th className="text-right">No structure</th>
              <th className="text-right">To invoice</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 tabular-nums">
            {plan.classes.map((c) => {
              const missing = c.missingStructure.DAY + c.missingStructure.BOARDING;
              return (
                <tr key={c.classId}>
                  <td className="py-2 font-medium">{c.className}</td>
                  <td className="text-right">{c.enrolled}</td>
                  <td className="text-right">{c.alreadyInvoiced}</td>
                  <td className={`text-right ${missing ? "text-red-700" : ""}`}>
                    {missing ? `${missing}${c.missingStructure.BOARDING ? ` (${c.missingStructure.BOARDING} ${L.boarding.toLowerCase()})` : ""}` : "—"}
                  </td>
                  <td className="text-right font-medium">{c.toInvoice}</td>
                  <td className="text-right">{c.amountCents ? formatKes(c.amountCents) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-stone-200 font-semibold tabular-nums">
            <tr>
              <td className="py-2">Total</td>
              <td className="text-right">{t.enrolled}</td>
              <td className="text-right">{t.alreadyInvoiced}</td>
              <td className="text-right">{t.missingStructure || "—"}</td>
              <td className="text-right">{t.toInvoice}</td>
              <td className="text-right">{formatKes(t.amountCents)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-6 border-t border-stone-100 pt-4">
          {t.toInvoice > 0 ? (
            <ActionForm action={generateTermInvoices} submitLabel={`Create ${t.toInvoice} invoices (${formatKes(t.amountCents)})`} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="termId" value={term.id} />
            </ActionForm>
          ) : (
            <p className="text-sm text-stone-600">
              {t.enrolled > 0 && t.alreadyInvoiced === t.enrolled ? "Everyone enrolled this term has an invoice." : "Nothing to invoice yet."}
            </p>
          )}
          <p className="mt-3 text-xs text-stone-500">
            Safe to run again: students who already have an invoice for this term are skipped, so run it after late admissions.
            Bursaries, waivers and extra charges are added per student from their statement.
          </p>
        </div>
      </Card>
    </>
  );
}
