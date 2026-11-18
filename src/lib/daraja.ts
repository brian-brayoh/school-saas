/**
 * Minimal Safaricom Daraja client (C2B v2). One school = one shortcode with
 * its own consumer key/secret, so nothing here is global.
 */
export type DarajaEnv = "sandbox" | "production";
export type DarajaCreds = { consumerKey: string; consumerSecret: string };

const BASE: Record<DarajaEnv, string> = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
};

/** Daraja rejects callback URLs containing these words (any case). */
const BANNED = ["m-pesa", "mpesa", "safaricom", "exe", "exec", "cmd", "sql", "query"];

export function callbackUrls(token: string) {
  const base = (process.env.PUBLIC_CALLBACK_BASE_URL ?? "").replace(/\/+$/, "");
  return {
    base,
    confirmation: `${base}/api/c2b/${token}/confirm`,
    validation: `${base}/api/c2b/${token}/validate`,
  };
}

export function checkCallbackBase(env: DarajaEnv): string | null {
  const base = (process.env.PUBLIC_CALLBACK_BASE_URL ?? "").trim();
  if (!base) return "PUBLIC_CALLBACK_BASE_URL is not set. It must be the app's public address, e.g. https://yourapp.co.ke";
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    return "PUBLIC_CALLBACK_BASE_URL is not a valid URL";
  }
  if (["localhost", "127.0.0.1"].includes(u.hostname) || u.hostname.endsWith(".localhost")) {
    return "Safaricom can't reach localhost. Use your deployed address, or a tunnel URL for sandbox testing.";
  }
  if (env === "production" && u.protocol !== "https:") return "Production callbacks must use https://";
  const bad = BANNED.find((w) => base.toLowerCase().includes(w));
  if (bad) return `Safaricom rejects callback URLs containing "${bad}". Use a different domain or path.`;
  return null;
}

async function call<T>(env: DarajaEnv, path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${BASE[env]}${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    const b = body as Record<string, string>;
    throw new Error(b.errorMessage || b.ResponseDescription || b.raw || `Daraja HTTP ${res.status}`);
  }
  return body as T;
}

export async function accessToken(env: DarajaEnv, creds: DarajaCreds): Promise<string> {
  const basic = Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString("base64");
  const r = await call<{ access_token: string }>(env, "/oauth/v1/generate?grant_type=client_credentials", {
    method: "GET",
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!r.access_token) throw new Error("Daraja did not return an access token. Check the consumer key and secret.");
  return r.access_token;
}

export async function registerC2BUrls(env: DarajaEnv, creds: DarajaCreds, shortcode: string, token: string) {
  const at = await accessToken(env, creds);
  const urls = callbackUrls(token);
  return call<{ ResponseCode?: string; ResponseDescription?: string }>(env, "/mpesa/c2b/v2/registerurl", {
    method: "POST",
    headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ShortCode: shortcode,
      ResponseType: "Completed", // if our validation URL is down, payments still go through
      ConfirmationURL: urls.confirmation,
      ValidationURL: urls.validation,
    }),
  });
}

/** Sandbox only: ask Safaricom to send a fake customer payment to our confirmation URL. */
export async function simulateC2B(env: DarajaEnv, creds: DarajaCreds, shortcode: string, amount: number, billRef: string, commandId: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline") {
  if (env !== "sandbox") throw new Error("Safaricom only allows simulated payments in the sandbox");
  const at = await accessToken(env, creds);
  return call<{ ResponseDescription?: string }>(env, "/mpesa/c2b/v2/simulate", {
    method: "POST",
    headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ShortCode: shortcode, CommandID: commandId, Amount: amount, Msisdn: "254708374149", BillRefNumber: billRef }),
  });
}

/** The confirmation payload Safaricom POSTs for every completed payment. */
export type C2BConfirmation = {
  TransactionType?: string;
  TransID: string;
  TransTime?: string; // YYYYMMDDHHmmss, Nairobi time
  TransAmount: string | number;
  BusinessShortCode?: string;
  BillRefNumber?: string;
  MSISDN?: string; // masked/hashed in v2
  FirstName?: string;
  MiddleName?: string;
  LastName?: string;
};

export function parseTransTime(t?: string): Date {
  const m = t?.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return new Date();
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+03:00`);
}
