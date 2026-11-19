import { notFound } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { currentTenant } from "@/lib/school";
import { withTenant } from "@/lib/db";
import { brandingUrls } from "@/lib/branding";

export default async function SchoolLogin({ searchParams }: { searchParams: Promise<{ suspended?: string; expired?: string }> }) {
  const tenant = await currentTenant();
  if (!tenant) notFound();
  const { suspended, expired } = await searchParams;
  const brand = await withTenant(tenant.id, (tx) => brandingUrls(tx, tenant));
  return (
    <LoginForm
      title={tenant.name}
      imageUrl={brand.sealUrl ?? brand.logoUrl}
      subtitle="Sign in to the school back office"
      notice={
        suspended || tenant.status === "SUSPENDED"
          ? "This school's account is suspended. Contact support."
          : expired
            ? "You were signed out because your password was changed. Sign in again."
            : undefined
      }
      forgotHelp="Ask your school's owner or administrator. They can reset it under Staff & access and give you a temporary password."
    />
  );
}
