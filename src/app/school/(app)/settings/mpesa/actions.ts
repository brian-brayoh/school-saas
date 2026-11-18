"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Tx } from "@/lib/db";
import { withTenant } from "@/lib/db";
import { requireSchool, MANAGE_ROLES } from "@/lib/school";
import { audit } from "@/lib/audit";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { checkCallbackBase, registerC2BUrls, simulateC2B, type DarajaCreds, type DarajaEnv } from "@/lib/daraja";
import { PSEUDO_SHORTCODES } from "@/lib/c2b";
import type { FormState } from "@/components/ActionForm";

/** The school's real M-Pesa shortcode channel (v1: one per school). */
export async function mpesaChannel(tx: Tx) {
  return tx.paymentChannel.findFirst({
    where: { type: { in: ["PAYBILL", "TILL"] }, shortcode: { notIn: PSEUDO_SHORTCODES } },
    orderBy: { createdAt: "asc" },
  });
}

const schema = z.object({
  type: z.enum(["PAYBILL", "TILL"]),
  shortcode: z.string().trim().regex(/^\d{5,8}$/, "The shortcode is the 5–8 digit paybill or till number"),
  environment: z.enum(["sandbox", "production"]),
  consumerKey: z.string().trim().optional(),
  consumerSecret: z.string().trim().optional(),
});

export async function saveMpesaSettings(_p: FormState, fd: FormData): Promise<FormState> {
  const { tenant, user } = await requireSchool(MANAGE_ROLES);
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  return withTenant(tenant.id, async (tx) => {
    const current = await mpesaChannel(tx);
    const keysGiven = Boolean(d.consumerKey && d.consumerSecret);
    if ((d.consumerKey || d.consumerSecret) && !keysGiven) return { error: "Enter both the consumer key and the consumer secret" };
    if (!current && !keysGiven) return { error: "Enter the consumer key and secret from your Daraja app" };

    let credentialsEnc = current?.credentialsEnc ?? null;
    if (keysGiven) {
      try {
        credentialsEnc = encryptJson({ consumerKey: d.consumerKey!, consumerSecret: d.consumerSecret! } satisfies DarajaCreds);
      } catch (e) {
        return { error: (e as Error).message };
      }
    }
    const changedTarget = current && (current.shortcode !== d.shortcode || current.environment !== d.environment || current.type !== d.type);
    const data = {
      type: d.type,
      shortcode: d.shortcode,
      environment: d.environment,
      credentialsEnc,
      ...((changedTarget || keysGiven) && { registeredAt: null }),
    };
    const ch = current
      ? await tx.paymentChannel.update({ where: { id: current.id }, data })
      : await tx.paymentChannel.create({ data: { ...data, tenantId: tenant.id, callbackToken: randomBytes(24).toString("hex") } });
    await audit(tx, { tenantId: tenant.id, actorUserId: user.id, action: "mpesa.settings", entity: "PaymentChannel", entityId: ch.id, after: { type: d.type, shortcode: d.shortcode, environment: d.environment, keysChanged: keysGiven } });
    revalidatePath("/settings/mpesa");
    return { ok: `Saved ${d.type === "PAYBILL" ? "paybill" : "till"} ${d.shortcode} (${d.environment}). Now register it with Safaricom.` };
  });
}

async function loadCreds(tx: Tx) {
  const ch = await mpesaChannel(tx);
  if (!ch?.credentialsEnc || !ch.shortcode) throw new Error("Save the M-Pesa settings first");
  return { ch, creds: decryptJson<DarajaCreds>(ch.credentialsEnc), env: ch.environment as DarajaEnv };
}

export async function registerUrls(_p: FormState): Promise<FormState> {
  const { tenant, user } = await requireSchool(MANAGE_ROLES);
  try {
    return await withTenant(tenant.id, async (tx) => {
      const { ch, creds, env } = await loadCreds(tx);
      const problem = checkCallbackBase(env);
      if (problem) return { error: problem };
      const r = await registerC2BUrls(env, creds, ch.shortcode!, ch.callbackToken);
      await tx.paymentChannel.update({ where: { id: ch.id }, data: { registeredAt: new Date() } });
      await audit(tx, { tenantId: tenant.id, actorUserId: user.id, action: "mpesa.register", entity: "PaymentChannel", entityId: ch.id, after: { response: r.ResponseDescription ?? null } });
      revalidatePath("/settings/mpesa");
      return { ok: `Safaricom accepted the registration${r.ResponseDescription ? `: ${r.ResponseDescription}` : ""}. Payments to ${ch.shortcode} will now appear automatically.` };
    }, { timeout: 45_000 });
  } catch (e) {
    return { error: `Safaricom said: ${(e as Error).message}` };
  }
}

export async function sandboxTestPayment(_p: FormState, fd: FormData): Promise<FormState> {
  const { tenant } = await requireSchool(MANAGE_ROLES);
  const amount = Math.round(Number(fd.get("amount")));
  const billRef = String(fd.get("billRef") ?? "").trim();
  if (!amount || amount < 1 || amount > 150_000) return { error: "Amount between 1 and 150,000" };
  if (!billRef) return { error: "Enter an account number (admission number)" };
  try {
    return await withTenant(tenant.id, async (tx) => {
      const { ch, creds, env } = await loadCreds(tx);
      if (env !== "sandbox") return { error: "Test payments only work with the sandbox environment" };
      const r = await simulateC2B(env, creds, ch.shortcode!, amount, billRef, ch.type === "TILL" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline");
      return { ok: `Safaricom: ${r.ResponseDescription ?? "accepted"}. It should appear under Payments within a minute.` };
    }, { timeout: 45_000 });
  } catch (e) {
    return { error: `Safaricom said: ${(e as Error).message}` };
  }
}
