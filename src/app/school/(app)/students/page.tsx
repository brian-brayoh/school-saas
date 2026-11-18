import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/db";
import { requireSchool, can, FINANCE_ROLES } from "@/lib/school";
import { formatKePhone } from "@/lib/phone";
import { formatKes } from "@/lib/money";
import { invoiceBalance } from "@/lib/fees";
import { Card, PageHeader, btnCls, btnSecondaryCls, inputCls } from "@/components/ui";

const PAGE_SIZE = 50;

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; class?: string; page?: string }>;
}) {
  const { tenant, role, labels: L } = await requireSchool();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const classId = sp.class ?? "";
  const page = Math.max(1, Number(sp.page) || 1);

  const { students, total, classes, term } = await withTenant(tenant.id, async (tx) => {
    const term = await tx.term.findFirst({ where: { isCurrent: true } });
    const where: Prisma.StudentWhereInput = {
      status: "ACTIVE",
      ...(q && {
        OR: [
          { admissionNo: { contains: q, mode: "insensitive" } },
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { guardians: { some: { guardian: { phone: { contains: q.replace(/^0/, "") } } } } },
        ],
      }),
      ...(classId && term && { enrollments: { some: { termId: term.id, stream: { classId } } } }),
    };
    const [students, total, classes] = await Promise.all([
      tx.student.findMany({
        where,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          enrollments: { where: { termId: term?.id ?? "__no_current_term__" }, include: { stream: { include: { class: true } } } },
          guardians: { include: { guardian: true }, orderBy: { isPrimary: "desc" } },
          invoices: { where: { termId: term?.id ?? "__no_current_term__", status: { not: "VOID" } }, include: { adjustments: true } },
        },
      }),
      tx.student.count({ where }),
      tx.class.findMany({ orderBy: { sortOrder: "asc" } }),
    ]);
    return { students, total, classes, term };
  });

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => `/students?${new URLSearchParams({ ...(q && { q }), ...(classId && { class: classId }), page: String(p) })}`;

  return (
    <>
      <PageHeader
        title={L.students}
        description={`${total} active ${(total === 1 ? L.student : L.students).toLowerCase()}`}
        actions={can(role, FINANCE_ROLES) && <Link href="/students/import" className={btnCls}>Import from Excel</Link>}
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder={`Search name, ${L.admissionNo.toLowerCase()} or phone`} className={`${inputCls} max-w-sm`} />
        <select name="class" defaultValue={classId} className={`${inputCls} w-40`}>
          <option value="">All {L.classes.toLowerCase()}</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className={btnSecondaryCls}>Filter</button>
      </form>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-stone-500">
              <tr><th className="pb-2">{L.admissionNo}</th><th>Name</th><th>{L.class}</th><th>{L.day}/{L.boarding}</th><th>{L.guardian}</th><th className="text-right">Term balance</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {students.map((s) => {
                const e = s.enrollments[0];
                const g = s.guardians[0]?.guardian;
                return (
                  <tr key={s.id}>
                    <td className="py-2 font-mono">{s.admissionNo}</td>
                    <td><Link href={`/students/${s.id}`} className="font-medium text-brand-700 hover:underline">{s.lastName}, {s.firstName}</Link></td>
                    <td>{e ? `${e.stream.class.name}${e.stream.name !== "Main" ? ` ${e.stream.name}` : ""}` : <span className="text-amber-700">Not enrolled{term ? "" : " (no current term)"}</span>}</td>
                    <td>{s.residence === "BOARDING" ? L.boarding : L.day}</td>
                    <td>{g ? `${g.name} · ${formatKePhone(g.phone)}` : <span className="text-amber-700">None</span>}</td>
                    <td className="text-right tabular-nums">{s.invoices[0] ? formatKes(invoiceBalance(s.invoices[0])) : <span className="text-stone-400">not invoiced</span>}</td>
                  </tr>
                );
              })}
              {students.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-stone-500">No students found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-stone-500">Page {page} of {pages}</span>
            <div className="flex gap-2">
              {page > 1 && <Link className={btnSecondaryCls} href={href(page - 1)}>Previous</Link>}
              {page < pages && <Link className={btnSecondaryCls} href={href(page + 1)}>Next</Link>}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
