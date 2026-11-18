import { requireSchool, FINANCE_ROLES } from "@/lib/school";
import { FeesTabs } from "./FeesTabs";

export default async function FeesLayout({ children }: { children: React.ReactNode }) {
  await requireSchool(FINANCE_ROLES);
  return (
    <>
      <FeesTabs />
      {children}
    </>
  );
}
