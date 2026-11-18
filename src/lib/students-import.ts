import ExcelJS from "exceljs";
import type { Gender, Residence } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { normalizeKePhone } from "@/lib/phone";
import { labelsFor, type Labels } from "@/lib/terms";

/** Column headers in the template, in order. Matching is case/space-insensitive. */
export const COLUMNS = [
  { key: "admissionNo", header: "Admission No", required: true, width: 14 },
  { key: "firstName", header: "First Name", required: true, width: 16 },
  { key: "lastName", header: "Last Name", required: true, width: 16 },
  { key: "gender", header: "Gender", required: false, width: 9 },
  { key: "dateOfBirth", header: "Date of Birth", required: false, width: 14 },
  { key: "residence", header: "Day/Boarding", required: false, width: 13 },
  { key: "className", header: "Class", required: true, width: 12 },
  { key: "streamName", header: "Stream", required: false, width: 10 },
  { key: "upi", header: "UPI", required: false, width: 12 },
  { key: "g1Name", header: "Guardian Name", required: false, width: 20 },
  { key: "g1Phone", header: "Guardian Phone", required: false, width: 15 },
  { key: "g1Relationship", header: "Guardian Relationship", required: false, width: 12 },
  { key: "g2Name", header: "Guardian 2 Name", required: false, width: 20 },
  { key: "g2Phone", header: "Guardian 2 Phone", required: false, width: 15 },
  { key: "g2Relationship", header: "Guardian 2 Relationship", required: false, width: 12 },
] as const;

type ColKey = (typeof COLUMNS)[number]["key"];

/** Other headers accepted for a column, so TVET/university templates import too. */
const HEADER_ALIASES: Partial<Record<ColKey, string[]>> = {
  admissionNo: ["Reg No", "Registration No", "Adm No", "Admission Number", "Student No"],
  className: ["Course", "Programme", "Program", "Grade"],
  streamName: ["Intake", "Cohort", "Group"],
  residence: ["Residence", "Non-resident/Resident", "Resident"],
  g1Name: ["Parent/Guardian Name", "Next of kin Name", "Parent Name"],
  g1Phone: ["Parent/Guardian Phone", "Next of kin Phone", "Parent Phone"],
  g1Relationship: ["Parent/Guardian Relationship", "Next of kin Relationship"],
  g2Name: ["Parent/Guardian 2 Name", "Next of kin 2 Name"],
  g2Phone: ["Parent/Guardian 2 Phone", "Next of kin 2 Phone"],
  g2Relationship: ["Parent/Guardian 2 Relationship", "Next of kin 2 Relationship"],
};

/** Template header for a column, in the institution's own words. */
export function headerFor(key: ColKey, L: Labels): string {
  const c = COLUMNS.find((x) => x.key === key)!;
  const g = (h: string) => h.replace(/^Guardian/, L.guardian);
  switch (key) {
    case "admissionNo": return L.admissionNo.replace(/ no$/i, " No");
    case "className": return L.class;
    case "streamName": return L.stream;
    case "residence": return `${L.day}/${L.boarding}`;
    default: return key.startsWith("g") ? g(c.header) : c.header;
  }
}
const MAX_ROWS = 5000;

export type ClassRef = { id: string; name: string; streams: { id: string; name: string }[] };

export type GuardianInput = { name: string; phone: string; relationship: string | null };

export type ValidRow = {
  row: number;
  admissionNo: string;
  firstName: string;
  lastName: string;
  gender: Gender | null;
  dateOfBirth: Date | null;
  residence: Residence;
  upi: string | null;
  streamId: string;
  classLabel: string;
  guardians: GuardianInput[];
};

export type RowError = { row: number; admissionNo?: string; messages: string[] };

export type ValidationReport = {
  totalRows: number;
  valid: ValidRow[];
  errors: RowError[];
  fileError?: string;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Admission numbers are stored trimmed + uppercase so M-Pesa matching is predictable. */
export const normalizeAdmission = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text.trim(); // hyperlink
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue); // formula
    return "";
  }
  return String(v).trim();
}

function parseDate(v: ExcelJS.CellValue): Date | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  const s = cellText(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return mkDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // dd/mm/yyyy (Kenyan format)
  if (m) return mkDate(+m[3], +m[2], +m[1]);
  return "invalid";
}

function mkDate(y: number, mo: number, d: number): Date | "invalid" {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || y < 1990 || dt > new Date()) return "invalid";
  return dt;
}

function parseGender(s: string): Gender | null | "invalid" {
  const n = norm(s);
  if (!n) return null;
  if (n === "m" || n === "male" || n === "boy") return "MALE";
  if (n === "f" || n === "female" || n === "girl") return "FEMALE";
  return "invalid";
}

function parseResidence(s: string): Residence | "invalid" {
  const n = norm(s);
  if (!n || n === "day" || n === "dayscholar" || n === "nonresident" || n === "nonres" || n === "nr") return "DAY";
  if (n === "boarding" || n === "boarder" || n === "b" || n === "resident" || n === "res") return "BOARDING";
  return "invalid";
}

export async function validateWorkbook(buffer: ArrayBuffer, classes: ClassRef[], L: Labels = labelsFor("SCHOOL")): Promise<ValidationReport> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    return { totalRows: 0, valid: [], errors: [], fileError: "That file isn't a readable .xlsx workbook. Save it as Excel (.xlsx) and try again." };
  }
  const ws = wb.getWorksheet("Students") ?? wb.worksheets[0];
  if (!ws) return { totalRows: 0, valid: [], errors: [], fileError: "The workbook has no sheets." };

  // Map header cells to column keys.
  const colIndex = new Map<ColKey, number>();
  ws.getRow(1).eachCell((cell, col) => {
    const h = norm(cellText(cell.value));
    const match = COLUMNS.find((c) => norm(c.header) === h || (HEADER_ALIASES[c.key] ?? []).some((a) => norm(a) === h));
    if (match) colIndex.set(match.key, col);
  });
  const missing = COLUMNS.filter((c) => c.required && !colIndex.has(c.key)).map((c) => headerFor(c.key, L));
  if (missing.length) {
    return { totalRows: 0, valid: [], errors: [], fileError: `Missing column(s): ${missing.join(", ")}. Download the template and keep its first row.` };
  }

  const classByName = new Map(classes.map((c) => [norm(c.name), c]));
  const seenAdmission = new Map<string, number>();
  const valid: ValidRow[] = [];
  const errors: RowError[] = [];
  let totalRows = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const raw = (k: ColKey) => {
      const i = colIndex.get(k);
      return i ? row.getCell(i).value : null;
    };
    const text = (k: ColKey) => cellText(raw(k));

    if (COLUMNS.every((c) => !text(c.key))) continue; // blank line
    totalRows++;
    if (totalRows > MAX_ROWS) {
      return { totalRows, valid: [], errors: [], fileError: `Too many rows. Import at most ${MAX_ROWS} students per file.` };
    }

    const messages: string[] = [];
    const admissionNo = normalizeAdmission(text("admissionNo"));
    const firstName = text("firstName");
    const lastName = text("lastName");

    if (!admissionNo) messages.push(`${L.admissionNo} is required`);
    else if (admissionNo.length > 30) messages.push(`${L.admissionNo} is too long`);
    else if (seenAdmission.has(admissionNo)) messages.push(`${L.admissionNo} ${admissionNo} also appears on row ${seenAdmission.get(admissionNo)}`);
    else seenAdmission.set(admissionNo, r);
    if (!firstName) messages.push("First Name is required");
    if (!lastName) messages.push("Last Name is required");

    const gender = parseGender(text("gender"));
    if (gender === "invalid") messages.push(`Gender "${text("gender")}" should be M or F`);
    const dob = parseDate(raw("dateOfBirth"));
    if (dob === "invalid") messages.push(`Date of Birth "${text("dateOfBirth")}" should be dd/mm/yyyy`);
    const residence = parseResidence(text("residence"));
    if (residence === "invalid") messages.push(`${L.day}/${L.boarding} "${text("residence")}" should be ${L.day} or ${L.boarding}`);

    let streamId = "";
    let classLabel = "";
    const className = text("className");
    const streamName = text("streamName");
    const cls = classByName.get(norm(className));
    if (!className) messages.push(`${L.class} is required`);
    else if (!cls) messages.push(`${L.class} "${className}" doesn't exist. Add it under ${L.setup} or fix the spelling`);
    else {
      const stream = streamName
        ? cls.streams.find((s) => norm(s.name) === norm(streamName))
        : cls.streams.length === 1
          ? cls.streams[0]
          : undefined; // split class: the stream must be named
      if (!stream) {
        messages.push(
          streamName
            ? `${L.stream} "${streamName}" doesn't exist in ${cls.name}`
            : `${cls.name} has several ${L.streams.toLowerCase()}. Fill in the ${L.stream} column`,
        );
      } else {
        streamId = stream.id;
        classLabel = cls.streams.length > 1 ? `${cls.name} ${stream.name}` : cls.name;
      }
    }

    const guardians: GuardianInput[] = [];
    for (const [nameKey, phoneKey, relKey, label] of [
      ["g1Name", "g1Phone", "g1Relationship", "Guardian"],
      ["g2Name", "g2Phone", "g2Relationship", "Guardian 2"],
    ] as const) {
      const gName = text(nameKey);
      const gPhoneRaw = text(phoneKey);
      if (!gName && !gPhoneRaw) continue;
      const gPhone = normalizeKePhone(gPhoneRaw);
      if (!gPhoneRaw) messages.push(`${label} Phone is required when ${label} Name is filled`);
      else if (!gPhone) messages.push(`${label} Phone "${gPhoneRaw}" isn't a valid Kenyan mobile number`);
      else if (guardians.some((g) => g.phone === gPhone)) messages.push(`${label} Phone repeats the first guardian's`);
      else guardians.push({ name: gName || "Parent/Guardian", phone: gPhone, relationship: text(relKey) || null });
    }

    if (messages.length) {
      errors.push({ row: r, admissionNo: admissionNo || undefined, messages });
      continue;
    }

    valid.push({
      row: r,
      admissionNo,
      firstName,
      lastName,
      gender: gender as Gender | null,
      dateOfBirth: dob as Date | null,
      residence: residence as Residence,
      upi: text("upi") || null,
      streamId,
      classLabel,
      guardians,
    });
  }

  if (totalRows === 0) return { totalRows, valid, errors, fileError: "No student rows found under the header row." };
  return { totalRows, valid, errors };
}

export type ImportResult = {
  created: number;
  updated: number;
  unchanged: number;
  guardiansCreated: number;
  links: number;
  enrolled: number;
};

/**
 * Upsert students by admission number, dedupe guardians by phone (siblings
 * share one guardian), link them, and enroll everyone into the current term.
 * Runs inside the caller's tenant transaction: all rows or none.
 */
export async function commitImport(tx: Tx, tenantId: string, rows: ValidRow[], currentTermId: string | null): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, unchanged: 0, guardiansCreated: 0, links: 0, enrolled: 0 };

  // 1. Students
  const existing = await tx.student.findMany({ where: { admissionNo: { in: rows.map((r) => r.admissionNo) } } });
  const byAdm = new Map(existing.map((s) => [s.admissionNo, s]));
  const existingByAdm = new Map(byAdm);

  const toCreate = rows.filter((r) => !byAdm.has(r.admissionNo));
  if (toCreate.length) {
    const created = await tx.student.createManyAndReturn({
      data: toCreate.map((r) => ({
        tenantId,
        admissionNo: r.admissionNo,
        firstName: r.firstName,
        lastName: r.lastName,
        gender: r.gender,
        dateOfBirth: r.dateOfBirth,
        residence: r.residence,
        upi: r.upi,
      })),
    });
    created.forEach((s) => byAdm.set(s.admissionNo, s));
    result.created = created.length;
  }

  for (const r of rows) {
    const s = existingByAdm.get(r.admissionNo);
    if (!s) continue;
    const changed =
      s.firstName !== r.firstName ||
      s.lastName !== r.lastName ||
      (r.gender !== null && s.gender !== r.gender) ||
      (r.dateOfBirth !== null && s.dateOfBirth?.getTime() !== r.dateOfBirth.getTime()) ||
      s.residence !== r.residence ||
      (r.upi !== null && s.upi !== r.upi) ||
      s.status !== "ACTIVE";
    if (!changed) {
      result.unchanged++;
      continue;
    }
    await tx.student.update({
      where: { id: s.id },
      data: {
        firstName: r.firstName,
        lastName: r.lastName,
        residence: r.residence,
        status: "ACTIVE",
        ...(r.gender !== null && { gender: r.gender }),
        ...(r.dateOfBirth !== null && { dateOfBirth: r.dateOfBirth }),
        ...(r.upi !== null && { upi: r.upi }),
      },
    });
    result.updated++;
  }

  // 2. Guardians, deduplicated by phone across the whole school
  const phones = [...new Set(rows.flatMap((r) => r.guardians.map((g) => g.phone)))];
  const guardianByPhone = new Map(
    (await tx.guardian.findMany({ where: { phone: { in: phones } } })).map((g) => [g.phone, g]),
  );
  const newGuardians = new Map<string, { name: string; relationship: string | null }>();
  for (const r of rows) for (const g of r.guardians) if (!guardianByPhone.has(g.phone) && !newGuardians.has(g.phone)) newGuardians.set(g.phone, g);
  if (newGuardians.size) {
    const created = await tx.guardian.createManyAndReturn({
      data: [...newGuardians].map(([phone, g]) => ({ tenantId, phone, name: g.name, relationship: g.relationship })),
    });
    created.forEach((g) => guardianByPhone.set(g.phone, g));
    result.guardiansCreated = created.length;
  }

  // 3. Student ↔ guardian links (first guardian is primary)
  const links = rows.flatMap((r) =>
    r.guardians.map((g, i) => ({
      tenantId,
      studentId: byAdm.get(r.admissionNo)!.id,
      guardianId: guardianByPhone.get(g.phone)!.id,
      isPrimary: i === 0,
    })),
  );
  if (links.length) result.links = (await tx.studentGuardian.createMany({ data: links, skipDuplicates: true })).count;

  // 4. Enrollment in the current term
  if (currentTermId) {
    const studentIds = rows.map((r) => byAdm.get(r.admissionNo)!.id);
    const current = new Map(
      (await tx.enrollment.findMany({ where: { termId: currentTermId, studentId: { in: studentIds } } })).map((e) => [e.studentId, e]),
    );
    const toEnroll = [];
    for (const r of rows) {
      const studentId = byAdm.get(r.admissionNo)!.id;
      const e = current.get(studentId);
      if (!e) toEnroll.push({ tenantId, studentId, termId: currentTermId, streamId: r.streamId });
      else if (e.streamId !== r.streamId) await tx.enrollment.update({ where: { id: e.id }, data: { streamId: r.streamId } });
    }
    if (toEnroll.length) await tx.enrollment.createMany({ data: toEnroll });
    result.enrolled = studentIds.length;
  }

  return result;
}

/** Template workbook: Students sheet with dropdowns, plus Classes and Instructions sheets. */
export async function buildTemplate(classes: ClassRef[], L: Labels = labelsFor("SCHOOL")): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Students", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: headerFor(c.key, L), key: c.key, width: Math.max(c.width, headerFor(c.key, L).length + 2) }));
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF187049" } };
  COLUMNS.forEach((c, i) => {
    if (c.required) header.getCell(i + 1).value = `${headerFor(c.key, L)} *`; // "*" is ignored when reading headers
  });

  // Keep phone and admission columns as text so Excel doesn't drop leading zeros.
  for (const key of ["admissionNo", "g1Phone", "g2Phone", "upi"] as const) ws.getColumn(key).numFmt = "@";
  ws.getColumn("dateOfBirth").numFmt = "dd/mm/yyyy";

  const classSheet = wb.addWorksheet("Classes");
  classSheet.columns = [
    { header: L.class, key: "c", width: 36 },
    { header: L.streams, key: "s", width: 30 },
  ];
  classSheet.getRow(1).font = { bold: true };
  classes.forEach((c) => classSheet.addRow({ c: c.name, s: c.streams.map((s) => s.name).join(", ") }));

  const last = 2001;
  const list = (formulae: string[]) => ({ type: "list" as const, allowBlank: true, formulae, showErrorMessage: true });
  for (let r = 2; r <= last; r++) {
    ws.getCell(r, 4).dataValidation = list(['"M,F"']);
    ws.getCell(r, 6).dataValidation = list([`"${L.day},${L.boarding}"`]);
    if (classes.length) ws.getCell(r, 7).dataValidation = list([`Classes!$A$2:$A$${classes.length + 1}`]);
  }

  const help = wb.addWorksheet("Instructions");
  help.getColumn(1).width = 110;
  [
    "How to fill this template",
    "",
    "• One student per row on the Students sheet. Don't rename or reorder the header row.",
    `• Required: ${headerFor("admissionNo", L)}, First Name, Last Name, ${L.class}. Everything else is optional.`,
    `• ${headerFor("admissionNo", L)} is what payers type as the M-Pesa account number, so keep it exactly as the ${L.institution} uses it.`,
    `• ${L.class} must match one on the Classes sheet. ${L.stream} can be blank when there is only one.`,
    `• Gender: M or F. ${L.day}/${L.boarding}: ${L.day} or ${L.boarding} (blank means ${L.day}). Date of Birth: dd/mm/yyyy.`,
    "• Guardian phones: 0712345678 or 254712345678. Siblings with the same guardian phone share one guardian record.",
    "• Re-importing the same file is safe: existing admission numbers are updated, not duplicated.",
  ].forEach((line, i) => {
    const row = help.addRow([line]);
    if (i === 0) row.font = { bold: true, size: 14 };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
