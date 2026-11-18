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
 *
 *   npm run db:demo -- --activity
 * also fills the term with activity: invoices for everyone with a structure,
 * about three weeks of M-Pesa/cash/bank payments (some full, some partial, some
 * none), a few bursaries, and three M-Pesa payments waiting to be matched.
 * Skipped if the demo school already has payments.
 * Phone numbers are made up (2547 00 xxx xxx). Don't send real SMS to them.
 */
import { randomBytes } from "node:crypto";
import { prisma, withSystem, type Tx } from "../src/lib/db";
import { generateInvoices, refreshInvoiceStatus } from "../src/lib/fees";
import { allocatePayment, issueReceipt, manualChannel } from "../src/lib/payments";
import { settleIncoming } from "../src/lib/c2b";

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

  if (process.argv.includes("--activity")) await addActivity(tenant.id);
}

const simRef = () => "SIM" + Array.from(randomBytes(7), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"[b % 34]).join("");

async function simulatorChannel(tx: Tx, tenantId: string) {
  return (
    (await tx.paymentChannel.findFirst({ where: { type: "PAYBILL", shortcode: "simulator" } })) ??
    tx.paymentChannel.create({ data: { tenantId, type: "PAYBILL", shortcode: "simulator", callbackToken: randomBytes(24).toString("hex") } })
  );
}

/** A term already under way: invoices, payments, bursaries and a short matching queue. */
async function addActivity(tenantId: string) {
  const result = await withSystem(
    async (tx) => {
      if ((await tx.payment.count({ where: { tenantId } })) > 0) return null;
      const term = await tx.term.findFirstOrThrow({ where: { tenantId, isCurrent: true } });
      const owner = await tx.membership.findFirstOrThrow({ where: { tenantId, role: "OWNER" } });

      const inv = await generateInvoices(tx, tenantId, term.id);
      const invoices = await tx.invoice.findMany({
        where: { tenantId, termId: term.id },
        include: { student: { include: { guardians: { where: { isPrimary: true }, include: { guardian: true } } } } },
        orderBy: { number: "asc" },
      });

      // Bursaries for a handful of students.
      let bursaries = 0;
      for (const i of invoices.filter((_, n) => n % 19 === 4).slice(0, 6)) {
        const amount = BigInt(5000 + Math.floor(rand() * 6) * 1000) * 100n;
        await tx.adjustment.create({
          data: { tenantId, studentId: i.studentId, invoiceId: i.id, type: "BURSARY", amountCents: amount < i.totalCents ? amount : i.totalCents / 2n, reason: rand() < 0.5 ? "CDF bursary 2027" : "County bursary, Term 1", approvedById: owner.userId },
        });
        await refreshInvoiceStatus(tx, i.id);
        bursaries++;
      }

      const sim = await simulatorChannel(tx, tenantId);
      const cash = await manualChannel(tx, tenantId, "CASH");
      const bank = await manualChannel(tx, tenantId, "BANK");
      let payments = 0;
      let collected = 0n;

      for (const i of invoices) {
        const r = rand();
        if (r < 0.3) continue; // hasn't paid yet
        const fresh = await tx.invoice.findUniqueOrThrow({ where: { id: i.id }, include: { adjustments: true } });
        const owed = fresh.totalCents - fresh.adjustments.reduce((t, a) => t + (a.type === "DEBIT" ? -a.amountCents : a.amountCents), 0n);
        if (owed <= 0n) continue;
        // Full payment, or a round partial amount.
        let amount = r < 0.65 ? owed : (owed * BigInt(30 + Math.floor(rand() * 50))) / 100n;
        amount = amount === owed ? owed : (amount / 50000n) * 50000n || 100000n; // round to KES 500
        const daysAgo = Math.floor(rand() * 21);
        const paidAt = new Date(Date.now() - daysAgo * 86_400_000 - Math.floor(rand() * 8) * 3_600_000);
        const m = rand();
        const channel = m < 0.72 ? sim : m < 0.9 ? cash : bank;
        const g = i.student.guardians[0]?.guardian;
        const p = await tx.payment.create({
          data: {
            tenantId,
            channelId: channel.id,
            reference: channel.id === sim.id ? simRef() : channel.id === cash.id ? `CASH-${simRef().slice(3)}` : `EQ${Math.floor(10_000_000 + rand() * 89_999_999)}`,
            amountCents: amount,
            payerName: g?.name.toUpperCase() ?? null,
            billRef: i.student.admissionNo,
            paidAt,
            matchStatus: "MATCHED",
            studentId: i.studentId,
            rawPayload: { source: "demo-data" },
          },
        });
        await allocatePayment(tx, tenantId, { id: p.id, studentId: i.studentId, amountCents: amount });
        await issueReceipt(tx, tenantId, p.id, paidAt);
        payments++;
        collected += amount;
      }

      // Three M-Pesa payments for the matching queue.
      const first = invoices[0]?.student;
      const queue = [
        { billRef: first ? first.admissionNo.replace(/^D0/, "D") : "D001", name: "JANE WANJIKU", amount: 5000 },
        { billRef: first ? `${first.firstName} fees` : "wanjiku fees", name: "PETER KAMAU", amount: 7500 },
        { billRef: "XYZ123", name: "UNKNOWN PAYER", amount: 2000 },
      ];
      for (const q of queue) {
        const p = await tx.payment.create({
          data: {
            tenantId,
            channelId: sim.id,
            reference: simRef(),
            amountCents: BigInt(q.amount) * 100n,
            payerName: q.name,
            payerPhone: "2547XXXXX" + Math.floor(100 + rand() * 899),
            billRef: q.billRef,
            paidAt: new Date(Date.now() - Math.floor(rand() * 3) * 86_400_000),
            matchStatus: "UNMATCHED",
            rawPayload: { source: "demo-data" },
          },
        });
        await settleIncoming(tx, tenantId, p.id);
      }

      return { invoiced: inv.created, payments, collected, bursaries };
    },
    { timeout: 600_000 },
  );

  if (!result) {
    console.log("Activity skipped: the demo school already has payments.");
    return;
  }
  console.log(
    `Activity: ${result.invoiced} invoices, ${result.payments} payments (KES ${(result.collected / 100n).toLocaleString("en-KE")}), ` +
      `${result.bursaries} bursaries, 3 M-Pesa payments waiting in Payments → match.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
