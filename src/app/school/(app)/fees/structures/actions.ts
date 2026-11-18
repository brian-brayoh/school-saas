"use server";

import { revalidatePath } from "next/cache";
import type { Residence } from "@prisma/client";
import { withTenant } from "@/lib/db";
import { requireSchool, FINANCE_ROLES } from "@/lib/school";
import { audit } from "@/lib/audit";
import { parseKes } from "@/lib/money";
import type { FormState } from "@/components/ActionForm";

const asResidence = (v: FormDataEntryValue | null): Residence => (v === "BOARDING" ? "BOARDING" : "DAY");

/** Save the whole class × fee item grid for one term and day/boarding. */
export async function saveStructures(_p: FormState, fd: FormData): Promise<FormState> {
  const { tenant, user } = await requireSchool(FINANCE_ROLES);
  const termId = String(fd.get("termId") ?? "");
  const residence = asResidence(fd.get("residence"));

  return withTenant(tenant.id, async (tx) => {
    const term = await tx.term.findUnique({ where: { id: termId }, include: { academicYear: true } });
    if (!term) return { error: "Pick a term" };
    const [classes, items, existing] = await Promise.all([
      tx.class.findMany(),
      tx.feeItem.findMany(),
      tx.feeStructure.findMany({ where: { termId, residence } }),
    ]);
    const existingFor = new Map(existing.map((s) => [s.classId, s]));

    const bad: string[] = [];
    const plan = classes.map((c) => ({
      cls: c,
      lines: items.flatMap((it) => {
        const raw = String(fd.get(`a_${c.id}_${it.id}`) ?? "").trim();
        if (!raw) return [];
        const cents = parseKes(raw);
        if (cents === null) {
          bad.push(`${c.name} / ${it.name}: "${raw}"`);
          return [];
        }
        return cents > 0n ? [{ feeItemId: it.id, amountCents: cents }] : [];
      }),
    }));
    if (bad.length) return { error: `Not valid amounts: ${bad.slice(0, 5).join("; ")}${bad.length > 5 ? "…" : ""}` };

    let saved = 0, removed = 0;
    for (const { cls, lines } of plan) {
      const current = existingFor.get(cls.id);
      if (!lines.length) {
        if (current) {
          await tx.feeStructure.delete({ where: { id: current.id } }); // lines cascade
          removed++;
        }
        continue;
      }
      const st =
        current ??
        (await tx.feeStructure.create({
          data: {
            tenantId: tenant.id,
            termId,
            classId: cls.id,
            residence,
            name: `${cls.name} · ${residence === "DAY" ? "Day" : "Boarding"} · ${term.academicYear.name} T${term.number}`,
          },
        }));
      await tx.feeStructureLine.deleteMany({ where: { feeStructureId: st.id } });
      await tx.feeStructureLine.createMany({ data: lines.map((l) => ({ ...l, tenantId: tenant.id, feeStructureId: st.id })) });
      saved++;
    }
    await audit(tx, { tenantId: tenant.id, actorUserId: user.id, action: "fees.structures.save", entity: "Term", entityId: termId, after: { residence, saved, removed } });

    revalidatePath("/fees", "layout");
    return { ok: `Saved ${saved} class${saved === 1 ? "" : "es"}${removed ? `, cleared ${removed}` : ""}. Invoices already issued are not changed.` };
  }, { timeout: 60_000 });
}

/** Copy every structure (day and boarding) from another term into this one, skipping classes already set. */
export async function copyStructures(_p: FormState, fd: FormData): Promise<FormState> {
  const { tenant, user } = await requireSchool(FINANCE_ROLES);
  const termId = String(fd.get("termId") ?? "");
  const fromTermId = String(fd.get("fromTermId") ?? "");
  if (!termId || !fromTermId || termId === fromTermId) return { error: "Pick a different term to copy from" };

  return withTenant(tenant.id, async (tx) => {
    const term = await tx.term.findUniqueOrThrow({ where: { id: termId }, include: { academicYear: true } });
    const [source, target] = await Promise.all([
      tx.feeStructure.findMany({ where: { termId: fromTermId }, include: { lines: true, class: true } }),
      tx.feeStructure.findMany({ where: { termId }, select: { classId: true, residence: true } }),
    ]);
    const taken = new Set(target.map((t) => `${t.classId}:${t.residence}`));
    let copied = 0;
    for (const s of source) {
      if (taken.has(`${s.classId}:${s.residence}`)) continue;
      await tx.feeStructure.create({
        data: {
          tenantId: tenant.id,
          termId,
          classId: s.classId,
          residence: s.residence,
          name: `${s.class.name} · ${s.residence === "DAY" ? "Day" : "Boarding"} · ${term.academicYear.name} T${term.number}`,
          lines: { create: s.lines.map((l) => ({ tenantId: tenant.id, feeItemId: l.feeItemId, amountCents: l.amountCents })) },
        },
      });
      copied++;
    }
    await audit(tx, { tenantId: tenant.id, actorUserId: user.id, action: "fees.structures.copy", entity: "Term", entityId: termId, after: { fromTermId, copied } });
    revalidatePath("/fees", "layout");
    return copied
      ? { ok: `Copied ${copied} structure${copied === 1 ? "" : "s"}. Check the amounts, then save.` }
      : { error: "Nothing to copy: that term has no structures, or this term already has them all." };
  }, { timeout: 60_000 });
}
