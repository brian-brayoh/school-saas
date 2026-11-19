import { prisma } from "@/lib/db";
import { requireSchool } from "@/lib/school";
import { AccountPanel } from "@/components/AccountPanel";

export const metadata = { title: "My account" };

export default async function SchoolAccountPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const { user, role } = await requireSchool(undefined, { allowPasswordChange: true });
  const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  return <AccountPanel user={full} roleLabel={role.toLowerCase()} first={Boolean((await searchParams).first)} />;
}
