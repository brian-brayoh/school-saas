import { withSystem } from "@/lib/db";
import { ingestC2B } from "@/lib/c2b";
import type { C2BConfirmation } from "@/lib/daraja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCEPTED = { ResultCode: 0, ResultDesc: "Accepted" };

/**
 * Safaricom POSTs here after every completed payment to a school's shortcode.
 * The unguessable token in the path identifies the school's channel. Daraja
 * doesn't sign requests, so the token must stay secret; consider allow-listing
 * Safaricom's IPs at the edge in production.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const channel = await withSystem((tx) =>
    tx.paymentChannel.findUnique({ where: { callbackToken: token }, select: { id: true, tenantId: true, isActive: true } }),
  );
  if (!channel || !channel.isActive) return Response.json({ ResultCode: 1, ResultDesc: "Unknown channel" }, { status: 404 });

  let payload: C2BConfirmation;
  try {
    payload = (await req.json()) as C2BConfirmation;
  } catch {
    return Response.json({ ResultCode: 1, ResultDesc: "Bad JSON" }, { status: 400 });
  }

  try {
    const r = await ingestC2B(channel, payload, "daraja");
    console.info(`[c2b] ${payload.TransID} ${payload.TransAmount} ref="${payload.BillRefNumber ?? ""}" → ${r.status}`);
  } catch (e) {
    // Still acknowledge: the money has moved either way, and a failure here is
    // ours to fix (statement upload backfills anything that wasn't saved).
    console.error("[c2b] failed to record confirmation", payload?.TransID, e);
  }
  return Response.json(ACCEPTED);
}
