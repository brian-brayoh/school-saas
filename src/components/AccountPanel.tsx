import { ActionForm } from "@/components/ActionForm";
import { Card, Field, Notice, PageHeader, inputCls } from "@/components/ui";
import { changeMyPassword } from "@/lib/account-actions";
import { MIN_PASSWORD } from "@/lib/passwords";
import { formatKePhone } from "@/lib/phone";

export function AccountPanel({
  user,
  roleLabel,
  first,
}: {
  user: { name: string; email: string | null; phone: string | null; mustChangePassword: boolean };
  roleLabel: string;
  first: boolean;
}) {
  return (
    <>
      <PageHeader title="My account" description={`${user.name}, ${roleLabel}`} />
      {(first || user.mustChangePassword) && (
        <div className="mb-6 max-w-xl">
          <Notice>You signed in with a temporary password. Choose your own before you continue.</Notice>
        </div>
      )}
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <Card title="Signing in">
          <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
            <dt className="text-stone-500">Email</dt><dd>{user.email ?? "none"}</dd>
            <dt className="text-stone-500">Phone</dt><dd>{user.phone ? formatKePhone(user.phone) : "none"}</dd>
          </dl>
          <p className="mt-4 text-xs text-stone-500">You can sign in with either. Ask an owner or admin to change them.</p>
        </Card>
        <Card title={user.mustChangePassword ? "Choose your password" : "Change password"}>
          <ActionForm keepValues action={changeMyPassword} submitLabel={user.mustChangePassword ? "Set password" : "Change password"} className="space-y-4">
            <Field label={user.mustChangePassword ? "Temporary password" : "Current password"}>
              <input name="current" type="password" required autoComplete="current-password" className={inputCls} />
            </Field>
            <Field label="New password" hint={`At least ${MIN_PASSWORD} characters. A short sentence works well.`}>
              <input name="next" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className={inputCls} />
            </Field>
            <Field label="New password again">
              <input name="confirm" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className={inputCls} />
            </Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
