import { withTenant } from "@/lib/db";
import { requireSchool, FINANCE_ROLES } from "@/lib/school";
import { buildTemplate } from "@/lib/students-import";

export async function GET() {
  const { tenant, labels } = await requireSchool(FINANCE_ROLES);
  const classes = await withTenant(tenant.id, (tx) =>
    tx.class.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, streams: { select: { id: true, name: true } } } }),
  );
  const buf = await buildTemplate(classes, labels);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${tenant.slug}-students-template.xlsx"`,
    },
  });
}
