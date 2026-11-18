import { withTenant } from "@/lib/db";
import { requireSchool, FINANCE_ROLES } from "@/lib/school";
import { ActionForm } from "@/components/ActionForm";
import { Card, Field, PageHeader, inputCls } from "@/components/ui";
import { createFeeItem, updateFeeItem } from "./actions";

export default async function FeeItemsPage() {
  const { tenant } = await requireSchool(FINANCE_ROLES);
  const items = await withTenant(tenant.id, (tx) => tx.feeItem.findMany({ orderBy: [{ priority: "asc" }, { name: "asc" }] }));

  return (
    <>
      <PageHeader title="Fee items" description="The things a school charges for. Amounts are set per class in Fee structures." />
      <Card className="mb-6">
        <table className="w-full text-sm">
          <thead className="text-left text-stone-500">
            <tr><th className="pb-2">Item</th><th>Billing</th><th>Order on invoice</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {items.map((it) => (
              <tr key={it.id}>
                <td className="py-2 font-medium">{it.name}</td>
                <td colSpan={3}>
                  <form action={updateFeeItem} className="flex flex-wrap items-center gap-4">
                    <input type="hidden" name="id" value={it.id} />
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="isOptional" defaultChecked={it.isOptional} />
                      Optional (added per student)
                    </label>
                    <input name="priority" type="number" min={1} max={999} defaultValue={it.priority} className={`${inputCls} w-20 py-1`} />
                    <button className="text-xs text-brand-700 hover:underline">Save</button>
                  </form>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-stone-500">No fee items yet.</td></tr>}
          </tbody>
        </table>
      </Card>
      <Card title="Add a fee item">
        <ActionForm action={createFeeItem} submitLabel="Add" className="flex flex-wrap items-end gap-3">
          <Field label="Name"><input name="name" placeholder="Tuition" required className={inputCls} /></Field>
          <Field label="Order" hint="Lower comes first"><input name="priority" type="number" defaultValue={100} className={`${inputCls} w-24`} /></Field>
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="isOptional" /> Optional</label>
        </ActionForm>
        <p className="mt-4 text-xs text-stone-500">
          Optional items (transport, swimming, trips) are not put on everyone&apos;s termly invoice. Add them to individual students as an Extra charge from their statement.
        </p>
      </Card>
    </>
  );
}
