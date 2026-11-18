import { notFound } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { currentTenant } from "@/lib/school";
import { withTenant } from "@/lib/db";
import { brandingUrls } from "@/lib/branding";

export default async function SchoolLogin({ searchParams }: { searchParams: Promise<{ suspended?: string }> }) {
  const tenant = await currentTenant();
  if (!tenant) notFound();
  const { suspended } = await searchParams;
  const brand = await withTenant(tenant.id, (tx) => brandingUrls(tx, tenant));
  return (
    <LoginForm
      title={tenant.name}
      imageUrl={brand.sealUrl ?? brand.logoUrl}
      subtitle="Sign in to the school back office"
      notice={suspended || tenant.status === "SUSPENDED" ? "This school's account is suspended. Contact support." : undefined}
    />
  );
}
