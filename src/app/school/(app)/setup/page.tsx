import { withTenant } from "@/lib/db";
import { requireSchool, MANAGE_ROLES } from "@/lib/school";
import { ActionForm } from "@/components/ActionForm";
import { Card, Field, PageHeader, btnSecondaryCls, inputCls } from "@/components/ui";
import { createClass, createStream, createTerm, createYear, setCurrentTerm } from "./actions";

const fmt = (d: Date) => d.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function SetupPage() {
  const { tenant, labels: L } = await requireSchool(MANAGE_ROLES);
  const { years, classes } = await withTenant(tenant.id, async (tx) => ({
    years: await tx.academicYear.findMany({ orderBy: { startsOn: "desc" }, include: { terms: { orderBy: { number: "asc" } } } }),
    classes: await tx.class.findMany({
      orderBy: { sortOrder: "asc" },
      include: { streams: { orderBy: { name: "asc" } } },
    }),
  }));

  return (
    <>
      <PageHeader title={L.setup} description={`Years, ${L.terms.toLowerCase()}, ${L.classes.toLowerCase()} and ${L.streams.toLowerCase()}. The current ${L.term.toLowerCase()} is used for enrollment and invoicing.`} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Academic years & terms">
          <div className="space-y-5">
            {years.map((y) => (
              <div key={y.id} className="rounded-md border border-stone-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{y.name} {y.isCurrent && <span className="ml-2 rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700">current</span>}</div>
                  <div className="text-xs text-stone-500">{fmt(y.startsOn)} – {fmt(y.endsOn)}</div>
                </div>
                <ul className="mt-3 divide-y divide-stone-100 text-sm">
                  {y.terms.map((t) => (
                    <li key={t.id} className="flex items-center justify-between py-2">
                      <span>{L.term} {t.number} <span className="text-stone-500">· {fmt(t.startsOn)} – {fmt(t.endsOn)}</span></span>
                      {t.isCurrent ? (
                        <span className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700">current term</span>
                      ) : (
                        <form action={setCurrentTerm}>
                          <input type="hidden" name="termId" value={t.id} />
                          <button className="text-xs text-brand-700 hover:underline">Make current</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
                {y.terms.length < 3 && (
                  <ActionForm action={createTerm} submitLabel={`Add ${L.term.toLowerCase()}`} className="mt-3 flex flex-wrap items-end gap-2" buttonClassName={btnSecondaryCls}>
                    <input type="hidden" name="academicYearId" value={y.id} />
                    <Field label={L.term}>
                      <select name="number" className={inputCls} defaultValue={y.terms.length + 1}>
                        <option value="1">1</option><option value="2">2</option><option value="3">3</option>
                      </select>
                    </Field>
                    <Field label="Starts"><input type="date" name="startsOn" required className={inputCls} /></Field>
                    <Field label="Ends"><input type="date" name="endsOn" required className={inputCls} /></Field>
                  </ActionForm>
                )}
              </div>
            ))}
          </div>
          <ActionForm action={createYear} submitLabel="Add year" className="mt-5 flex flex-wrap items-end gap-2">
            <Field label="Year"><input name="name" placeholder="2027" required className={`${inputCls} w-24`} /></Field>
            <Field label="Starts"><input type="date" name="startsOn" required className={inputCls} /></Field>
            <Field label="Ends"><input type="date" name="endsOn" required className={inputCls} /></Field>
          </ActionForm>
        </Card>

        <Card title={`${L.classes} & ${L.streams.toLowerCase()}`}>
          <ul className="divide-y divide-stone-100 text-sm">
            {classes.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2">
                <span className="font-medium">{c.name}</span>
                <span className="text-stone-600">{c.streams.map((s) => s.name).join(", ")}</span>
              </li>
            ))}
            {classes.length === 0 && <li className="py-4 text-stone-500">No {L.classes.toLowerCase()} yet.</li>}
          </ul>
          <ActionForm action={createClass} submitLabel={`Add ${L.class.toLowerCase()}`} className="mt-5 flex flex-wrap items-end gap-2">
            <Field label={`New ${L.class.toLowerCase()}`}><input name="name" placeholder={L.classExample} required className={`${inputCls} min-w-64`} /></Field>
          </ActionForm>
          {classes.length > 0 && (
            <ActionForm action={createStream} submitLabel={`Add ${L.stream.toLowerCase()}`} className="mt-4 flex flex-wrap items-end gap-2" buttonClassName={btnSecondaryCls}>
              <Field label={L.class}>
                <select name="classId" className={inputCls}>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label={`${L.stream} name`}><input name="name" placeholder={L.streamExample} required className={inputCls} /></Field>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
