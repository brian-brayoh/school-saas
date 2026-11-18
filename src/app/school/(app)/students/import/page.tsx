import { requireSchool, FINANCE_ROLES } from "@/lib/school";
import { PageHeader, btnSecondaryCls } from "@/components/ui";
import { ImportForm } from "./ImportForm";

// Large imports on Vercel need more than the default function time.
export const maxDuration = 60;

export default async function ImportPage() {
  const { labels: L } = await requireSchool(FINANCE_ROLES);
  return (
    <>
      <PageHeader
        title={`Import ${L.students.toLowerCase()}`}
        description={`${L.students}, their ${L.class.toLowerCase()} and ${L.guardians.toLowerCase()} from one Excel sheet. Re-importing updates existing records.`}
        actions={<a href="/students/import/template" className={btnSecondaryCls}>Download template</a>}
      />
      <ImportForm labels={{ admissionNo: L.admissionNo, class: L.class }} />
    </>
  );
}
