import { withTenant } from "@/lib/db";
import { requireSchool, MANAGE_ROLES } from "@/lib/school";
import { formatKePhone } from "@/lib/phone";
import { ActionForm } from "@/components/ActionForm";
import { Card, Field, PageHeader, inputCls } from "@/components/ui";
import { addMember, changeRole, removeMember, resetMemberPassword } from "./actions";
import { btnSecondaryCls } from "@/components/ui";

const ROLE_HELP: Record<string, string> = {
  OWNER: "Everything, including owners and billing",
  ADMIN: "Everything except managing owners",
  BURSAR: "Fees, payments, students and imports",
  TEACHER: "View students in the school",
  VIEWER: "Read-only",
};

export default async function UsersPage() {
  const { tenant, user: me, role: myRole } = await requireSchool(MANAGE_ROLES);
  const members = await withTenant(tenant.id, (tx) =>
    tx.membership.findMany({ include: { user: true }, orderBy: [{ role: "asc" }, { createdAt: "asc" }] }),
  );
  const grantable = Object.keys(ROLE_HELP).filter((r) => r !== "OWNER" || myRole === "OWNER");

  return (
    <>
      <PageHeader title="Staff & access" description="Who can sign in to this school and what they can do." />
      <Card className="mb-6">
        <table className="w-full text-sm">
          <thead className="text-left text-stone-500">
            <tr><th className="pb-2">Name</th><th>Sign-in</th><th>Role</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {members.map((m) => {
              const locked = m.userId === me.id || (m.role === "OWNER" && myRole !== "OWNER");
              return (
                <tr key={m.id}>
                  <td className="py-2 font-medium">{m.user.name}{m.userId === me.id && <span className="ml-1 text-stone-500">(you)</span>}</td>
                  <td className="text-stone-600">{m.user.email ?? formatKePhone(m.user.phone)}</td>
                  <td>
                    {locked ? (
                      m.role.toLowerCase()
                    ) : (
                      <form action={changeRole} className="flex items-center gap-2">
                        <input type="hidden" name="membershipId" value={m.id} />
                        <select name="role" defaultValue={m.role} className={`${inputCls} w-32 py-1`}>
                          {grantable.map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}
                        </select>
                        <button className="text-xs text-brand-700 hover:underline">Save</button>
                      </form>
                    )}
                  </td>
                  <td className="text-right">
                    {!locked && (
                      <div className="flex flex-col items-end gap-1">
                        <ActionForm action={resetMemberPassword} submitLabel="Reset password" className="flex max-w-xs flex-col items-end gap-1 text-left" buttonClassName={`${btnSecondaryCls} px-2 py-1 text-xs`}>
                          <input type="hidden" name="membershipId" value={m.id} />
                        </ActionForm>
                        <form action={removeMember}>
                          <input type="hidden" name="membershipId" value={m.id} />
                          <button className="text-xs text-red-700 hover:underline">Remove</button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title="Add staff">
        <ActionForm action={addMember} submitLabel="Add" className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Full name"><input name="name" required className={inputCls} /></Field>
          <Field label="Email"><input name="email" type="email" className={inputCls} /></Field>
          <Field label="Phone"><input name="phone" placeholder="0712345678" className={inputCls} /></Field>
          <Field label="Role">
            <select name="role" defaultValue="BURSAR" className={inputCls}>
              {grantable.map((r) => <option key={r} value={r}>{r.toLowerCase()} — {ROLE_HELP[r]}</option>)}
            </select>
          </Field>
          <Field label="Temporary password" hint="Only needed if they don't have an account yet. They'll be asked to change it.">
            <input name="password" className={inputCls} />
          </Field>
        </ActionForm>
      </Card>
    </>
  );
}
