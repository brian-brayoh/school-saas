"use server";

import { revalidatePath } from "next/cache";
import { withTenant } from "@/lib/db";
import { requireSchool, FINANCE_ROLES } from "@/lib/school";
import { audit } from "@/lib/audit";
import { generateInvoices } from "@/lib/fees";
import { applyCredits } from "@/lib/payments";
import { formatKes } from "@/lib/money";
import type { FormState } from "@/components/ActionForm";

export async function generateTermInvoices(_p: FormState, fd: FormData): Promise<FormState> {
  const { tenant, user } = await requireSchool(FINANCE_ROLES);
  const termId = String(fd.get("termId") ?? "");
  if (!termId) return { error: "Pick a term" };
  try {
    const res = await withTenant(
      tenant.id,
      async (tx) => {
        const r = await generateInvoices(tx, tenant.id, termId);
        // Overpayments from earlier terms settle the new invoices straight away.
        const creditUsed = r.created ? await applyCredits(tx, tenant.id, r.plan.invoices.map((i) => i.studentId)) : 0n;
        if (r.created) {
          await audit(tx, {
            tenantId: tenant.id,
            actorUserId: user.id,
            action: "fees.invoices.generate",
            entity: "Term",
            entityId: termId,
            after: { created: r.created, amountCents: r.amountCents.toString(), creditUsed: creditUsed.toString() },
          });
        }
        return { ...r, creditUsed };
      },
      { timeout: 120_000 },
    );
    revalidatePath("/", "layout");
    if (!res.created) return { error: "Nothing to invoice: everyone enrolled is either invoiced already or has no fee structure." };
    return {
      ok: `Created ${res.created} invoices totalling ${formatKes(res.amountCents)}.${res.creditUsed > 0n ? ` ${formatKes(res.creditUsed)} of earlier overpayments was applied.` : ""}`,
    };
  } catch (e) {
    console.error(e);
    return { error: "Invoicing failed and nothing was saved. Try again; if it keeps failing, someone else may be invoicing at the same time." };
  }
}
