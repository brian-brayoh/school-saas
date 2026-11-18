/**
 * Realistic test data for the "demo" school (run `npm run db:seed` first).
 *   npm run db:demo
 *
 * Adds, for the current term:
 *  - ~130 students across PP1–Grade 9 (Grade 4 split into East/West streams),
 *    about a third of Grade 4–9 boarding, some siblings sharing a guardian
 *  - fee items: Tuition, Lunch, Activity, Boarding, Transport (optional)
 *  - fee structures for day scholars (all classes) and boarders (Grades 4–8).
 *    Grade 9 boarding is left out ON PURPOSE so Invoicing shows the
 *    "no fee structure" warning.
 * Invoices are NOT created: run Fees → Invoicing yourself.
 *
 * Idempotent: running it again adds nothing new.
 * Phone numbers are made up (2547 00 xxx xxx). Don't send real SMS to them.
 */
import { prisma, withSystem } from "../src/lib/db";

const FIRST = {
  F: ["Wanjiku", "Achieng", "Njeri", "Akinyi", "Wambui", "Chebet", "Mwende", "Nyambura", "Atieno", "Wairimu", "Jepkosgei", "Kemunto", "Zawadi", "Makena", "Imani", "Neema", "Faith", "Mercy", "Grace", "Esther"],
  M: ["Kamau", "Otieno", "Mwangi", "Kipchoge", "Ochieng", "Njoroge", "Kiprono", "Mutua", "Onyango", "Kariuki", "Wekesa", "Barasa", "Baraka", "Juma", "Brian", "Kevin", "Dennis", "Ian", "Collins", "Victor"],
};
const LAST = ["Kamau", "Otieno", "Mwangi", "Wanjala", "Ochieng", "Njoroge", "Kiprotich", "Mutua", "Onyango", "Kariuki", "Wekesa", "Barasa", "Muthoni", "Odhiambo", "Kimani", "Chege", "Maina", "Omondi", "Rotich", "Ndungu", "Gitau", "Owino", "Kibet", "Nyaga"];
const GUARDIAN_FIRST = ["Mary", "John", "Jane", "Peter", "Lucy", "James", "Ann", "Joseph", "Ruth", "David", "Agnes", "Samuel", "Beatrice", "Daniel", "Catherine", "Paul"];

// Deterministic random so every run produces the same school.
let seed = 20271;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];

const TUITION: Record<string, number> = {
  PP1: 15000, PP2: 15000, "Grade 1": 18000, "Grade 2": 18000, "Grade 3": 18000,
  "Grade 4": 22000, "Grade 5": 22000, "Grade 6": 22000, "Grade 7": 26000, "Grade 8": 26000, "Grade 9": 26000,
};
const BOARDING_CLASSES = new Set(["Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9"]);
const BOARDING_STRUCTURE_CLASSES = new Set(["Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8"]); // not Grade 9
const kes = (n: number) => BigInt(n) * 100n;

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "demo" } });
  if (!tenant) throw new Error('No "demo" school. Run `npm run db:seed` first.');
  const tenantId = tenant.id;

  const summary = await withSystem(
    async (tx) => {
      const term = await tx.term.findFirst({ where: { tenantId, isCurrent: true } });
      if (!term) throw new Error("The demo school has no current term. Set one under Academic setup.");

      // Classes + streams (Grade 4 gets East/West)
      const classes = await tx.class.findMany({ where: { tenantId }, include: { streams: true }, orderBy: { sortOrder: "asc" } });
      const g4 = classes.find((c) => c.name === "Grade 4");
      if (g4) {
        await tx.stream.createMany({
          data: ["East", "West"].map((name) => ({ tenantId, classId: g4.id, name })),
          skipDuplicates: true,
        });
      }
      const streams = await tx.stream.findMany({ where: { tenantId }, include: { class: true } });
      const streamsFor = (classId: string) => {
        const s = streams.filter((x) => x.classId === classId);
        const named = s.filter((x) => x.name !== "Main");
        return named.length ? named : s;
      };

      // Fee items
      await tx.feeItem.createMany({
        data: [
          { tenantId, name: "Tuition", priority: 10 },
          { tenantId, name: "Lunch", priority: 20 },
          { tenantId, name: "Activity", priority: 30 },
          { tenantId, name: "Boarding", priority: 15 },
          { tenantId, name: "Transport", priority: 40, isOptional: true },
        ],
        skipDuplicates: true,
      });
      const items = new Map((await tx.feeItem.findMany({ where: { tenantId } })).map((i) => [i.name, i.id]));

      // Fee structures for the current term
      const existing = await tx.feeStructure.findMany({ where: { tenantId, termId: term.id }, select: { classId: true, residence: true } });
      const has = new Set(existing.map((e) => `${e.classId}:${e.residence}`));
      let structures = 0;
      for (const c of classes) {
        const tuition = TUITION[c.name];
        if (!tuition) continue;
        const plans: { residence: "DAY" | "BOARDING"; lines: [string, number][] }[] = [
          { residence: "DAY", lines: [["Tuition", tuition], ["Lunch", 4500], ["Activity", 1500], ["Transport", 6000]] },
        ];
        if (BOARDING_STRUCTURE_CLASSES.has(c.name)) {
          plans.push({ residence: "BOARDING", lines: [["Tuition", tuition], ["Boarding", 18000], ["Activity", 1500]] });
        }
        for (const p of plans) {
          if (has.has(`${c.id}:${p.residence}`)) continue;
          await tx.feeStructure.create({
            data: {
              tenantId,
              termId: term.id,
              classId: c.id,
              residence: p.residence,
              name: `${c.name} · ${p.residence === "DAY" ? "Day" : "Boarding"} · demo`,
              lines: { create: p.lines.map(([name, amt]) => ({ tenantId, feeItemId: items.get(name)!, amountCents: kes(amt) })) },
            },
          });
          structures++;
        }
      }

      // Students, guardians, links, enrollment
      type S = { admissionNo: string; firstName: string; lastName: string; gender: "MALE" | "FEMALE"; residence: "DAY" | "BOARDING"; streamId: string; dob: Date; family: number };
      const students: S[] = [];
      let n = 1;
      let family = 0;
      for (const c of classes) {
        if (!TUITION[c.name]) continue;
        const grade = c.sortOrder; // PP1 = 0 … Grade 9 = 10
        const count = c.name === "Grade 4" ? 16 : 11 + Math.floor(rand() * 4);
        for (let i = 0; i < count; i++) {
          const gender = rand() < 0.5 ? "FEMALE" : "MALE";
          const sibling = students.length > 5 && rand() < 0.18 ? students[Math.floor(rand() * students.length)] : null;
          const st = pick(streamsFor(c.id));
          const boarder = BOARDING_CLASSES.has(c.name) && rand() < (c.name === "Grade 9" ? 0.15 : 0.33);
          students.push({
            admissionNo: `D${String(n++).padStart(4, "0")}`,
            firstName: pick(FIRST[gender === "FEMALE" ? "F" : "M"]),
            lastName: sibling ? sibling.lastName : pick(LAST),
            gender,
            residence: boarder ? "BOARDING" : "DAY",
            streamId: st.id,
            dob: new Date(Date.UTC(2022 - grade - 1, Math.floor(rand() * 12), 1 + Math.floor(rand() * 27))),
            family: sibling ? sibling.family : ++family,
          });
        }
      }

      const before = await tx.student.count({ where: { tenantId, admissionNo: { startsWith: "D" } } });
      await tx.student.createMany({
        data: students.map((s) => ({
          tenantId, admissionNo: s.admissionNo, firstName: s.firstName, lastName: s.lastName,
          gender: s.gender, residence: s.residence, dateOfBirth: s.dob,
        })),
        skipDuplicates: true,
      });
      const idByAdm = new Map(
        (await tx.student.findMany({ where: { tenantId, admissionNo: { in: students.map((s) => s.admissionNo) } }, select: { id: true, admissionNo: true } }))
          .map((s) => [s.admissionNo, s.id]),
      );

      // One or two guardians per family (siblings share them)
      const families = new Map<number, { name: string; phone: string; relationship: string }[]>();
      for (const s of students) {
        if (families.has(s.family)) continue;
        const base = 254700100000 + s.family * 2;
        const g = [{ name: `${pick(GUARDIAN_FIRST)} ${s.lastName}`, phone: String(base), relationship: rand() < 0.6 ? "Mother" : "Father" }];
        if (rand() < 0.45) g.push({ name: `${pick(GUARDIAN_FIRST)} ${s.lastName}`, phone: String(base + 1), relationship: g[0].relationship === "Mother" ? "Father" : "Mother" });
        families.set(s.family, g);
      }
      const allPhones = [...families.values()].flat().map((g) => g.phone);
      const existingPhones = new Set((await tx.guardian.findMany({ where: { tenantId, phone: { in: allPhones } }, select: { phone: true } })).map((g) => g.phone));
      await tx.guardian.createMany({
        data: [...families.values()].flat().filter((g) => !existingPhones.has(g.phone)).map((g) => ({ tenantId, ...g })),
      });
      const guardianByPhone = new Map((await tx.guardian.findMany({ where: { tenantId, phone: { in: allPhones } } })).map((g) => [g.phone, g.id]));

      await tx.studentGuardian.createMany({
        data: students.flatMap((s) =>
          families.get(s.family)!.map((g, i) => ({ tenantId, studentId: idByAdm.get(s.admissionNo)!, guardianId: guardianByPhone.get(g.phone)!, isPrimary: i === 0 })),
        ),
        skipDuplicates: true,
      });
      await tx.enrollment.createMany({
        data: students.map((s) => ({ tenantId, studentId: idByAdm.get(s.admissionNo)!, termId: term.id, streamId: s.streamId })),
        skipDuplicates: true,
      });

      return {
        students: (await tx.student.count({ where: { tenantId, admissionNo: { startsWith: "D" } } })) - before,
        families: families.size,
        structures,
        boarders9: students.filter((s) => s.residence === "BOARDING" && streams.find((x) => x.id === s.streamId)?.class.name === "Grade 9").length,
      };
    },
    { timeout: 120_000 },
  );

  console.log(
    `Demo data: +${summary.students} students (${summary.families} families), +${summary.structures} fee structures.\n` +
      `Grade 9 has ${summary.boarders9} boarder(s) with no boarding structure on purpose: Invoicing will flag them.\n` +
      `Next: sign in at http://demo.localhost:3000 → Fees → Invoicing.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
