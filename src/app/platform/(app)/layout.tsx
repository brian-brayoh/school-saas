import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/school";
import { LogoutButton } from "@/components/LogoutButton";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="font-semibold">Platform admin</span>
            <Link href="/tenants" className="text-sm text-stone-700 hover:text-brand-700">Schools</Link>
          </div>
          <div className="flex items-center gap-3 text-sm text-stone-600">
            {user.name}
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
