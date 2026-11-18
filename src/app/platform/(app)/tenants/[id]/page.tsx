import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, withSystem } from "@/lib/db";
import { brandingUrls } from "@/lib/branding";
import { ActionForm } from "@/components/ActionForm";
import { InstitutionHeader } from "@/components/InstitutionHeader";
import { InstitutionProfileFields } from "@/components/InstitutionProfileFields";
import { Card, PageHeader } from "@/components/ui";
import { savePlatformProfile } from "../actions";

export default async function EditTenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) notFound();
  const brand = await withSystem((tx) => brandingUrls(tx, tenant));

  return (
    <>
      <div className="mb-2 text-sm"><Link href="/tenants" className="text-brand-700 hover:underline">← Institutions</Link></div>
      <PageHeader title={tenant.name} description={`Code ${tenant.slug}. The letterhead printed on its receipts and statements.`} />
      <Card title="Preview" className="mb-6">
        <div className="mx-auto max-w-2xl rounded-md border border-stone-200 bg-white p-6">
          <InstitutionHeader tenant={tenant} sealUrl={brand.sealUrl} logoUrl={brand.logoUrl}>
            <div className="text-base font-bold">Official receipt</div>
            <div className="font-mono text-lg font-bold">RCT-2027-00001</div>
          </InstitutionHeader>
        </div>
      </Card>
      <Card title="Details">
        <ActionForm keepValues action={savePlatformProfile} submitLabel="Save" className="space-y-6">
          <input type="hidden" name="tenantId" value={tenant.id} />
          <InstitutionProfileFields current={tenant} sealUrl={brand.sealUrl} logoUrl={brand.logoUrl} />
        </ActionForm>
      </Card>
    </>
  );
}
