import { withTenant } from "@/lib/db";
import { requireSchool, MANAGE_ROLES } from "@/lib/school";
import { brandingUrls } from "@/lib/branding";
import { ActionForm } from "@/components/ActionForm";
import { InstitutionHeader } from "@/components/InstitutionHeader";
import { InstitutionProfileFields } from "@/components/InstitutionProfileFields";
import { Card, PageHeader } from "@/components/ui";
import { saveSchoolProfile } from "./actions";

export default async function SchoolProfilePage() {
  const { tenant, labels: L } = await requireSchool(MANAGE_ROLES);
  const brand = await withTenant(tenant.id, (tx) => brandingUrls(tx, tenant));

  return (
    <>
      <PageHeader title={`${L.institution.charAt(0).toUpperCase()}${L.institution.slice(1)} profile`} description="How your name, contacts, seal and logo appear on receipts and fee statements." />
      <Card title="Preview" className="mb-6">
        <div className="mx-auto max-w-2xl rounded-md border border-stone-200 bg-white p-6">
          <InstitutionHeader tenant={tenant} sealUrl={brand.sealUrl} logoUrl={brand.logoUrl}>
            <div className="text-base font-bold">Official receipt</div>
            <div className="font-mono text-lg font-bold">RCT-2027-00001</div>
          </InstitutionHeader>
        </div>
      </Card>
      <Card title="Details">
        <ActionForm keepValues action={saveSchoolProfile} submitLabel="Save profile" className="space-y-6">
          <InstitutionProfileFields current={tenant} sealUrl={brand.sealUrl} logoUrl={brand.logoUrl} />
        </ActionForm>
      </Card>
    </>
  );
}
