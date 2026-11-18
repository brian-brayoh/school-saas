import Link from "next/link";
import { withTenant } from "@/lib/db";
import { requireSchool, FINANCE_ROLES } from "@/lib/school";
import { formatKes } from "@/lib/money";
import { loadMatchContext, payerHistory } from "@/lib/c2b";
import { matchBillRef } from "@/lib/matching";
import { ActionForm } from "@/components/ActionForm";
import { Card, Notice, PageHeader, btnSecondaryCls, inputCls } from "@/components/ui";
import { assignPaymentAction, ignorePaymentAction } from "./actions";

const fmt = (d: Date) => d.toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });

export default async function UnmatchedPage() {
  const { tenant } = await requireSchool(FINANCE_ROLES);

  const rows = await withTenant(tenant.id, async (tx) => {
    const payments = await tx.payment.findMany({
      where: { matchStatus: { in: ["UNMATCHED", "SUGGESTED"] } },
      orderBy: { paidAt: "asc" },
      take: 100,
      include: { channel: true },
    });
    if (!payments.length) return [];
    const ctx = await loadMatchContext(tx);
    const byId = new Map(ctx.students.map((s) => [s.id, s]));
    const out = [];
    for (const p of payments) {
      const r = matchBillRef(p.billRef, ctx.students, ctx.aliases, await payerHistory(tx, p.payerPhone, p.id));
      const suggestions = r.kind === "suggested" ? r.suggestions.map((s) => ({ ...s, student: byId.get(s.studentId)! })) : [];
      out.push({ p, suggestions });
    }
    return out;
  }, { timeout: 60_000 });

  return (
    <>
      <div className="mb-2 text-sm"><Link href="/payments" className="text-brand-700 hover:underline">← Payments</Link></div>
      <PageHeader
        title="Payments to match"
        description="M-Pesa payments whose account number didn't match a student exactly. Assigning one teaches the system that reference for next time."
      />
      {rows.length === 0 && <Notice tone="success">Nothing to match. Every payment has found its student.</Notice>}
      <div className="space-y-4">
        {rows.map(({ p, suggestions }) => (
          <Card key={p.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold tabular-nums">{formatKes(p.amountCents)}</div>
                <div className="text-sm text-stone-600">
                  {fmt(p.paidAt)} · <span className="font-mono">{p.reference}</span> · {p.payerName ?? "unknown payer"}
                </div>
                <div className="mt-1 text-sm">
                  Account typed: <span className="rounded bg-amber-50 px-2 py-0.5 font-mono text-amber-900">{p.billRef || "(blank)"}</span>
                </div>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-stone-600">Not school fees?</summary>
                <form action={ignorePaymentAction} className="mt-2 flex gap-2">
                  <input type="hidden" name="paymentId" value={p.id} />
                  <input name="reason" placeholder="e.g. Refunded, uniform shop" className={`${inputCls} py-1`} />
                  <button className={`${btnSecondaryCls} py-1`}>Set aside</button>
                </form>
              </details>
            </div>

            {suggestions.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-stone-500">Likely student</div>
                {suggestions.map((s) => (
                  <ActionForm key={s.studentId} action={assignPaymentAction} submitLabel="Assign" className="flex flex-wrap items-center gap-3 rounded-md border border-stone-200 px-3 py-2 text-sm" buttonClassName={`${btnSecondaryCls} py-1`}>
                    <input type="hidden" name="paymentId" value={p.id} />
                    <input type="hidden" name="studentId" value={s.studentId} />
                    <span className="font-mono">{s.student.admissionNo}</span>
                    <span className="font-medium">{s.student.firstName} {s.student.lastName}</span>
                    <span className="text-xs text-stone-500">{s.reason}</span>
                  </ActionForm>
                ))}
              </div>
            )}

            <ActionForm action={assignPaymentAction} submitLabel="Assign" className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <input type="hidden" name="paymentId" value={p.id} />
              <span className="text-stone-600">{suggestions.length ? "Someone else?" : "Assign to"}</span>
              <input name="admissionNo" required placeholder="Admission no" className={`${inputCls} w-40 py-1`} />
            </ActionForm>
          </Card>
        ))}
      </div>
    </>
  );
}
