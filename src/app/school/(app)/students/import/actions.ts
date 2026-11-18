"use server";

import { revalidatePath } from "next/cache";
import { withTenant } from "@/lib/db";
import { requireSchool, FINANCE_ROLES } from "@/lib/school";
import { audit } from "@/lib/audit";
import { commitImport, validateWorkbook, type ImportResult, type RowError } from "@/lib/students-import";

export type ImportState = {
  intent: "validate" | "import";
  fileError?: string;
  totalRows?: number;
  validCount?: number;
  errors?: RowError[];
  preview?: { admissionNo: string; name: string; classLabel: string; guardians: number }[];
  result?: ImportResult;
  noCurrentTerm?: boolean;
} | null;

const MAX_BYTES = 4 * 1024 * 1024;

export async function importStudents(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const { tenant, user, labels } = await requireSchool(FINANCE_ROLES);
  const intent = fd.get("intent") === "import" ? "import" : "validate";
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { intent, fileError: "Choose an .xlsx file first." };
  if (file.size > MAX_BYTES) return { intent, fileError: "File is larger than 4 MB. Split it into smaller files." };

  const { classes, term } = await withTenant(tenant.id, async (tx) => ({
    classes: await tx.class.findMany({ select: { id: true, name: true, streams: { select: { id: true, name: true } } } }),
    term: await tx.term.findFirst({ where: { isCurrent: true } }),
  }));

  const report = await validateWorkbook(await file.arrayBuffer(), classes, labels);
  const base = {
    intent,
    fileError: report.fileError,
    totalRows: report.totalRows,
    validCount: report.valid.length,
    errors: report.errors.slice(0, 200),
    noCurrentTerm: !term,
  } satisfies ImportState;

  if (intent === "validate" || report.fileError || report.errors.length) {
    return {
      ...base,
      intent: "validate",
      preview: report.valid.slice(0, 10).map((r) => ({
        admissionNo: r.admissionNo,
        name: `${r.firstName} ${r.lastName}`,
        classLabel: r.classLabel,
        guardians: r.guardians.length,
      })),
    };
  }

  const result = await withTenant(
    tenant.id,
    async (tx) => {
      const res = await commitImport(tx, tenant.id, report.valid, term?.id ?? null);
      await audit(tx, {
        tenantId: tenant.id,
        actorUserId: user.id,
        action: "students.import",
        entity: "Student",
        entityId: file.name.slice(0, 100),
        after: { ...res, rows: report.valid.length },
      });
      return res;
    },
    { timeout: 120_000 },
  );

  revalidatePath("/students");
  revalidatePath("/dashboard");
  return { ...base, result };
}
