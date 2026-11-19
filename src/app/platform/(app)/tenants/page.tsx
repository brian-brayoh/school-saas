import { prisma, withSystem } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/school";
import { rootDomain, schoolUrl } from "@/lib/host";
import { Card, PageHeader, btnSecondaryCls } from "@/components/ui";
import { CreateTenantForm } from "./CreateTenantForm";
import { setTenantKind, setTenantStatus } from "./actions";
import { KIND_NAMES } from "@/lib/terms";
import { inputCls } from "@/components/ui";

export default async function TenantsPage() {
  await requirePlatformAdmin();
  const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: "desc" } });
  const studentCounts = await withSystem((tx) =>
    tx.student.groupBy({ by: ["tenantId"], where: { status: "ACTIVE" }, _count: { _all: true } }),
  );
  const counts = new Map(studentCounts.map((c) => [c.tenantId, c._count._all]));
  const brands = await withSystem((tx) => tx.tenantBranding.findMany({ select: { tenantId: true, sealMime: true, logoMime: true, updatedAt: true } }));
  const badge = new Map(
    brands.map((b) => [b.tenantId, b.sealMime ? `seal?v=${b.updatedAt.getTime()}` : b.logoMime ? `logo?v=${b.updatedAt.getTime()}` : null]),
  );

  return (
    <>
      <PageHeader title="Institutions" description="Every school, TVET and university on the platform" />
      <Card title="Onboard an institution" className="mb-8">
        <CreateTenantForm rootDomain={rootDomain()} />
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-stone-500">
            <tr><th className="pb-2">Institution</th><th>Code</th><th>Type</th><th>Status</th><th className="text-right">Active students</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {tenants.map((t) => (
              <tr key={t.id}>
                <td className="py-2">
                  <div className="flex items-center gap-3">
                    {badge.get(t.id) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/branding/${t.slug}/${badge.get(t.id)}`} alt="" className="h-9 w-9 object-contain" />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-600">
                        {t.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                      </span>
                    )}
                    <div>
                      <div className="font-medium">{t.name}</div>
                      <a href={`/tenants/${t.id}`} className="text-xs text-brand-700 hover:underline">Edit profile &amp; logo</a>
                    </div>
                  </div>
                </td>
                <td><a className="text-brand-700 hover:underline" href={schoolUrl(t.slug)}>{t.slug}</a></td>
                <td>
                  <form action={setTenantKind} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={t.id} />
                    <select name="kind" defaultValue={t.kind} className={`${inputCls} w-36 py-1 text-xs`}>
                      {Object.entries(KIND_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button className="text-xs text-brand-700 hover:underline">Save</button>
                  </form>
                </td>
                <td>{t.status}</td>
                <td className="text-right tabular-nums">{counts.get(t.id) ?? 0}</td>
                <td className="text-right">
                  <form action={setTenantStatus}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="status" value={t.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED"} />
                    <button className={btnSecondaryCls}>{t.status === "SUSPENDED" ? "Reactivate" : "Suspend"}</button>
                  </form>
                </td>
              </tr>
            ))}
            {tenants.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-stone-500">No institutions yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
