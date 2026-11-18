import { withTenant } from "@/lib/db";
import { requireSchool, MANAGE_ROLES } from "@/lib/school";
import { callbackUrls, checkCallbackBase, type DarajaEnv } from "@/lib/daraja";
import { ActionForm } from "@/components/ActionForm";
import { Card, Field, Notice, PageHeader, btnSecondaryCls, inputCls } from "@/components/ui";
import { mpesaChannel, registerUrls, sandboxTestPayment, saveMpesaSettings } from "./actions";

const fmt = (d: Date | null) => (d ? d.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }) : "never");

export default async function MpesaSettingsPage() {
  const { tenant } = await requireSchool(MANAGE_ROLES);
  const ch = await withTenant(tenant.id, (tx) => mpesaChannel(tx));
  const env = (ch?.environment ?? "sandbox") as DarajaEnv;
  const urls = ch ? callbackUrls(ch.callbackToken) : null;
  const callbackProblem = checkCallbackBase(env);

  return (
    <>
      <PageHeader title="M-Pesa" description="Connect the school's paybill so parents' payments land on the right student automatically." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="1. Paybill details">
          <ActionForm action={saveMpesaSettings} submitLabel="Save" className="space-y-4" keepValues>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type">
                <select name="type" defaultValue={ch?.type ?? "PAYBILL"} className={inputCls}>
                  <option value="PAYBILL">Paybill (recommended)</option>
                  <option value="TILL">Till / Buy Goods</option>
                </select>
              </Field>
              <Field label="Paybill or till number"><input name="shortcode" defaultValue={ch?.shortcode ?? ""} inputMode="numeric" required className={inputCls} /></Field>
            </div>
            <Field label="Environment" hint="Use sandbox until the school's Daraja app is approved to go live">
              <select name="environment" defaultValue={env} className={inputCls}>
                <option value="sandbox">Sandbox (testing)</option>
                <option value="production">Production (live money)</option>
              </select>
            </Field>
            <Field label="Consumer key" hint={ch?.credentialsEnc ? "Saved. Leave blank to keep it" : "From the school's app on developer.safaricom.co.ke"}>
              <input name="consumerKey" autoComplete="off" className={inputCls} />
            </Field>
            <Field label="Consumer secret">
              <input name="consumerSecret" type="password" autoComplete="new-password" className={inputCls} />
            </Field>
          </ActionForm>
          <p className="mt-4 text-xs text-stone-500">
            Keys are encrypted before they&apos;re stored. With a till, parents don&apos;t enter an account number, so payments go to the matching queue instead of straight to a student. A paybill is much better for fees.
          </p>
        </Card>

        <div className="space-y-6">
          <Card title="2. Connect to Safaricom">
            {!ch ? (
              <p className="text-sm text-stone-600">Save the paybill details first.</p>
            ) : (
              <div className="space-y-4 text-sm">
                <dl className="grid grid-cols-[9rem_1fr] gap-y-1">
                  <dt className="text-stone-500">Shortcode</dt><dd>{ch.shortcode} · {ch.type.toLowerCase()} · {env}</dd>
                  <dt className="text-stone-500">Registered</dt><dd>{fmt(ch.registeredAt)}</dd>
                  <dt className="text-stone-500">Last payment in</dt><dd>{fmt(ch.lastCallbackAt)}</dd>
                  <dt className="text-stone-500">Confirmation URL</dt><dd className="break-all font-mono text-xs">{urls!.base ? urls!.confirmation : "not set"}</dd>
                </dl>
                {callbackProblem ? (
                  <Notice tone="error">{callbackProblem}</Notice>
                ) : (
                  <ActionForm action={registerUrls} submitLabel={ch.registeredAt ? "Register again" : "Register with Safaricom"}>
                    {null}
                  </ActionForm>
                )}
                <p className="text-xs text-stone-500">Register again if the app&apos;s address changes. The URL contains a secret: don&apos;t share it.</p>
              </div>
            )}
          </Card>

          {ch && env === "sandbox" && (
            <Card title="3. Send a sandbox test payment">
              <ActionForm action={sandboxTestPayment} submitLabel="Send test payment" className="flex flex-wrap items-end gap-3" buttonClassName={btnSecondaryCls}>
                <Field label="Amount (KES)"><input name="amount" defaultValue="1500" inputMode="numeric" className={`${inputCls} w-28`} /></Field>
                <Field label="Account no"><input name="billRef" placeholder="D0001" className={`${inputCls} w-36`} /></Field>
              </ActionForm>
              <p className="mt-3 text-xs text-stone-500">Safaricom sends a fake payment to the confirmation URL, exactly like a real parent paying.</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
