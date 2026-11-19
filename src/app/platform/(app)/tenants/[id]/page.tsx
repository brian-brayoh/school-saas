import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, withSystem } from "@/lib/db";
import { brandingUrls } from "@/lib/branding";
import { ActionForm } from "@/components/ActionForm";
import { InstitutionHeader } from "@/components/InstitutionHeader";
import { InstitutionProfileFields } from "@/components/InstitutionProfileFields";
import { Card, PageHeader } from "@/components/ui";
import { resetSchoolUserPassword, savePlatformProfile } from "../actions";
import { requirePlatformAdmin } from "@/lib/school";
import { btnSecondaryCls } from "@/components/ui";
import { formatKePhone } from "@/lib/phone";

export default async function EditTenantPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) notFound();
  const brand = await withSystem((tx) => brandingUrls(tx, tenant));
  const managers = await withSystem((tx) =>
    tx.membership.findMany({ where: { tenantId: tenant.id, role: { in: ["OWNER", "ADMIN"] } }, include: { user: true }, orderBy: { role: "asc" } }),
  );

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
      <Card title="Owners and admins" className="mb-6">
        <p className="mb-4 text-sm text-stone-600">If an owner is locked out, reset their password here. They choose their own at the next sign-in.</p>
        <ul className="divide-y divide-stone-100 text-sm">
          {managers.map((m) => (
            <li key={m.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div>
                <div className="font-medium">{m.user.name} <span className="text-xs font-normal text-stone-500">{m.role.toLowerCase()}</span></div>
                <div className="text-stone-600">{m.user.email ?? formatKePhone(m.user.phone)}</div>
              </div>
              <ActionForm action={resetSchoolUserPassword} submitLabel="Reset password" className="flex max-w-md flex-col items-end gap-1" buttonClassName={`${btnSecondaryCls} px-3 py-1 text-xs`}>
                <input type="hidden" name="membershipId" value={m.id} />
              </ActionForm>
            </li>
          ))}
        </ul>
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
