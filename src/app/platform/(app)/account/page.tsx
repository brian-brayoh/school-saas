import { requirePlatformAdmin } from "@/lib/school";
import { AccountPanel } from "@/components/AccountPanel";

export const metadata = { title: "My account" };

export default async function PlatformAccountPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const user = await requirePlatformAdmin({ allowPasswordChange: true });
  return <AccountPanel user={user} roleLabel="platform admin" first={Boolean((await searchParams).first)} />;
}
