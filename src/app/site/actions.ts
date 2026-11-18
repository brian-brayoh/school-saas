"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { SLUG_RE, schoolUrl } from "@/lib/host";

// Redirecting to another subdomain is a different origin, so Next.js hands it
// to the browser as a full navigation (unlike same-origin action redirects).
export async function goToSchool(_prev: { error?: string; slug?: string } | null, formData: FormData) {
  const typed = String(formData.get("slug") ?? "").trim();
  const slug = typed.toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return { slug: typed, error: "Use the short school code (letters, numbers and dashes, no spaces), e.g. stmarys" };
  }
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { slug: true } });
  if (!tenant) return { slug: typed, error: `No school uses the code "${slug}". Check with your school office.` };
  redirect(schoolUrl(tenant.slug, "/login"));
}
