import type { Tx } from "@/lib/db";

/** The term a fees page is about: ?term=<id> if given, else the current term. */
export async function resolveTerm(tx: Tx, termId?: string) {
  const terms = await tx.term.findMany({
    include: { academicYear: true },
    orderBy: [{ academicYear: { startsOn: "desc" } }, { number: "desc" }],
  });
  const term = (termId && terms.find((t) => t.id === termId)) || terms.find((t) => t.isCurrent) || null;
  return { term, terms };
}

export const termLabel = (t: { number: number; academicYear: { name: string } }) => `${t.academicYear.name} · Term ${t.number}`;
