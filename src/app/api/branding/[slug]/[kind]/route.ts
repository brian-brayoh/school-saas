import { prisma, withTenant } from "@/lib/db";

export const runtime = "nodejs";

/** Public: a school's seal or logo (they appear on documents parents receive anyway). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await params;
  if (kind !== "seal" && kind !== "logo") return new Response("Not found", { status: 404 });
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return new Response("Not found", { status: 404 });

  const b = await withTenant(tenant.id, (tx) => tx.tenantBranding.findUnique({ where: { tenantId: tenant.id } }));
  const data = kind === "seal" ? b?.seal : b?.logo;
  const mime = kind === "seal" ? b?.sealMime : b?.logoMime;
  if (!data || !mime) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=31536000, immutable", // URLs carry ?v=<updatedAt>
      "X-Content-Type-Options": "nosniff",
    },
  });
}
