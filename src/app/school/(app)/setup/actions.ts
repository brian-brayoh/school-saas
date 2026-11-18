"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withTenant } from "@/lib/db";
import { requireSchool, MANAGE_ROLES } from "@/lib/school";
import { friendlyDbError } from "@/lib/errors";
import { DEFAULT_STREAM } from "@/lib/defaults";
import type { FormState } from "@/components/ActionForm";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date").transform((s) => new Date(`${s}T00:00:00Z`));

export async function createYear(_p: FormState, fd: FormData): Promise<FormState> {
  const { tenant } = await requireSchool(MANAGE_ROLES);
  const parsed = z
    .object({ name: z.string().trim().min(4, "Year name, e.g. 2027"), startsOn: date, endsOn: date })
    .refine((d) => d.endsOn > d.startsOn, "The year must end after it starts")
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    await withTenant(tenant.id, (tx) => tx.academicYear.create({ data: { tenantId: tenant.id, ...parsed.data } }));
  } catch (e) {
    return { error: friendlyDbError(e, "That academic year already exists") };
  }
  revalidatePath("/setup");
  return { ok: `Academic year ${parsed.data.name} added. Now add its terms.` };
}

export async function createTerm(_p: FormState, fd: FormData): Promise<FormState> {
  const { tenant } = await requireSchool(MANAGE_ROLES);
  const parsed = z
    .object({ academicYearId: z.string().min(1), number: z.coerce.number().int().min(1).max(3), startsOn: date, endsOn: date })
    .refine((d) => d.endsOn > d.startsOn, "The term must end after it starts")
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    await withTenant(tenant.id, (tx) => tx.term.create({ data: { tenantId: tenant.id, ...parsed.data } }));
  } catch (e) {
    return { error: friendlyDbError(e, "That term already exists for this year") };
  }
  revalidatePath("/setup");
  return { ok: "Term added." };
}

export async function setCurrentTerm(fd: FormData) {
  const { tenant } = await requireSchool(MANAGE_ROLES);
  const termId = String(fd.get("termId"));
  await withTenant(tenant.id, async (tx) => {
    const term = await tx.term.findUniqueOrThrow({ where: { id: termId } });
    await tx.term.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
    await tx.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
    await tx.term.update({ where: { id: term.id }, data: { isCurrent: true } });
    await tx.academicYear.update({ where: { id: term.academicYearId }, data: { isCurrent: true } });
  });
  revalidatePath("/", "layout");
}

export async function createClass(_p: FormState, fd: FormData): Promise<FormState> {
  const { tenant } = await requireSchool(MANAGE_ROLES);
  const name = String(fd.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Class name, e.g. Grade 4" };
  try {
    await withTenant(tenant.id, async (tx) => {
      const last = await tx.class.findFirst({ orderBy: { sortOrder: "desc" } });
      await tx.class.create({
        data: {
          tenantId: tenant.id,
          name,
          sortOrder: (last?.sortOrder ?? -1) + 1,
          streams: { create: { tenantId: tenant.id, name: DEFAULT_STREAM } },
        },
      });
    });
  } catch (e) {
    return { error: friendlyDbError(e, "That class already exists") };
  }
  revalidatePath("/setup");
  return { ok: `${name} added with a "${DEFAULT_STREAM}" stream.` };
}

export async function createStream(_p: FormState, fd: FormData): Promise<FormState> {
  const { tenant } = await requireSchool(MANAGE_ROLES);
  const classId = String(fd.get("classId") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  if (!classId || name.length < 1) return { error: "Pick a class and name the stream" };
  try {
    await withTenant(tenant.id, (tx) => tx.stream.create({ data: { tenantId: tenant.id, classId, name } }));
  } catch (e) {
    return { error: friendlyDbError(e, "That stream already exists in this class") };
  }
  revalidatePath("/setup");
  return { ok: `Stream ${name} added.` };
}
