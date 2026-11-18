import type { Metadata } from "next";
import { requireSchool, can, MANAGE_ROLES, FINANCE_ROLES, currentTenant } from "@/lib/school";
import { LogoutButton } from "@/components/LogoutButton";
import { NavLink } from "./NavLink";
import { withTenant } from "@/lib/db";
import { brandingUrls } from "@/lib/branding";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await currentTenant();
  return { title: { default: tenant?.name ?? "Ada", template: `%s | ${tenant?.name ?? "Ada"}` } };
}

export default async function SchoolLayout({ children }: { children: React.ReactNode }) {
  const { tenant, user, role, labels } = await requireSchool();
  const manage = can(role, MANAGE_ROLES);
  const brand = await withTenant(tenant.id, (tx) => brandingUrls(tx, tenant));
  const badge = brand.sealUrl ?? brand.logoUrl;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-stone-200 bg-white md:flex">
        <div className="flex items-center gap-3 border-b border-stone-200 px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {badge && <img src={badge} alt="" className="h-10 w-10 shrink-0 object-contain" />}
          <div className="min-w-0">
            <div className="font-semibold leading-tight">{tenant.name}</div>
            <div className="text-xs text-stone-500">{tenant.status === "TRIAL" ? "Trial" : "Back office"}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NavLink href="/students">{labels.students}</NavLink>
          {can(role, FINANCE_ROLES) && <NavLink href="/fees">Fees</NavLink>}
          {can(role, FINANCE_ROLES) && <NavLink href="/payments">Payments</NavLink>}
          {manage && <NavLink href="/setup">{labels.setup}</NavLink>}
          {manage && <NavLink href="/users">Staff &amp; access</NavLink>}
          {manage && <NavLink href="/settings/mpesa">M-Pesa</NavLink>}
          {manage && <NavLink href="/settings/profile">Profile &amp; logo</NavLink>}
        </nav>
        <div className="border-t border-stone-200 p-4 text-sm">
          <div className="font-medium">{user.name}</div>
          <div className="text-xs text-stone-500">{role.toLowerCase()}</div>
          <LogoutButton className="mt-2 text-brand-700 hover:underline" />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-6 py-8 md:px-10">{children}</main>
    </div>
  );
}
