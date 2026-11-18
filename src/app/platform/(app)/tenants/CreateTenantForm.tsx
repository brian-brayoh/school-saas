"use client";

import { ActionForm } from "@/components/ActionForm";
import { Field, inputCls } from "@/components/ui";
import { InstitutionProfileFields } from "@/components/InstitutionProfileFields";
import { KIND_NAMES } from "@/lib/terms";
import { createTenant } from "./actions";

export function CreateTenantForm({ rootDomain }: { rootDomain: string }) {
  return (
    <ActionForm keepValues action={createTenant} submitLabel="Create institution" className="space-y-8">
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-stone-700">Account</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" hint={`Becomes code.${rootDomain}`}>
            <input name="slug" required className={inputCls} placeholder="stmarys" />
          </Field>
          <Field label="Type" hint="Changes the wording: Class/Course/Programme, Term/Semester, Stream/Intake…">
            <select name="kind" defaultValue="SCHOOL" className={inputCls}>
              {Object.entries(KIND_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="defaultClasses" defaultChecked /> Schools only: create PP1–Grade 9 with a &quot;Main&quot; stream
        </label>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-stone-700">Letterhead (printed on receipts and statements)</h3>
        <InstitutionProfileFields />
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-stone-700">Owner&apos;s sign-in</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Owner name"><input name="ownerName" required className={inputCls} /></Field>
          <Field label="Owner email"><input name="ownerEmail" type="email" className={inputCls} /></Field>
          <Field label="Owner phone"><input name="ownerPhone" className={inputCls} placeholder="0712345678" /></Field>
          <Field label="Temporary password" hint="Only used if the owner doesn't have an account yet">
            <input name="ownerPassword" type="text" className={inputCls} />
          </Field>
        </div>
      </section>
    </ActionForm>
  );
}
