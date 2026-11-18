import type { Tx } from "@/lib/db";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const; // no SVG: it can carry scripts
export const MAX_IMAGE_BYTES = 500 * 1024;
export type BrandKind = "seal" | "logo";

/** Validate an uploaded image. null = nothing uploaded. */
export async function readImage(entry: FormDataEntryValue | null, label: string): Promise<{ data: Buffer; mime: string } | null | { error: string }> {
  if (!(entry instanceof File) || entry.size === 0) return null;
  if (!(IMAGE_TYPES as readonly string[]).includes(entry.type)) return { error: `${label}: use a PNG, JPG or WebP image` };
  if (entry.size > MAX_IMAGE_BYTES) return { error: `${label} is ${Math.round(entry.size / 1024)} KB. Keep it under 500 KB` };
  const data = Buffer.from(await entry.arrayBuffer());
  // Check the file really is the image type it claims to be.
  const sig = data.subarray(0, 12);
  const ok =
    (entry.type === "image/png" && sig[0] === 0x89 && sig[1] === 0x50) ||
    (entry.type === "image/jpeg" && sig[0] === 0xff && sig[1] === 0xd8) ||
    (entry.type === "image/webp" && sig.subarray(8, 12).toString("ascii") === "WEBP");
  if (!ok) return { error: `${label} doesn't look like a valid image file` };
  return { data, mime: entry.type };
}

/** Apply uploads/removals from a profile form (fields: seal, logo, removeSeal, removeLogo). */
export async function saveBrandingFromForm(tx: Tx, tenantId: string, fd: FormData): Promise<string | null> {
  const seal = await readImage(fd.get("seal"), "Seal");
  const logo = await readImage(fd.get("logo"), "Logo");
  for (const r of [seal, logo]) if (r && "error" in r) return r.error;

  const data: Record<string, unknown> = {};
  if (seal && !("error" in seal)) Object.assign(data, { seal: seal.data, sealMime: seal.mime });
  else if (fd.get("removeSeal") === "on") Object.assign(data, { seal: null, sealMime: null });
  if (logo && !("error" in logo)) Object.assign(data, { logo: logo.data, logoMime: logo.mime });
  else if (fd.get("removeLogo") === "on") Object.assign(data, { logo: null, logoMime: null });
  if (!Object.keys(data).length) return null;

  await tx.tenantBranding.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
  return null;
}

/** Image URLs for a tenant (versioned so browsers refresh after an upload), without loading the bytes. */
export async function brandingUrls(tx: Tx, tenant: { id: string; slug: string }) {
  const b = await tx.tenantBranding.findUnique({ where: { tenantId: tenant.id }, select: { sealMime: true, logoMime: true, updatedAt: true } });
  const v = b?.updatedAt.getTime() ?? 0;
  return {
    sealUrl: b?.sealMime ? `/api/branding/${tenant.slug}/seal?v=${v}` : null,
    logoUrl: b?.logoMime ? `/api/branding/${tenant.slug}/logo?v=${v}` : null,
  };
}
