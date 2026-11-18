import type { InstitutionKind } from "@prisma/client";

/**
 * Words the UI uses, per institution type. The data model is shared:
 *   Class  = class (school) · course + level (TVET) · programme + year (university)
 *   Stream = stream · intake · cohort/group
 *   Term   = term · term/semester · semester
 *   Residence DAY/BOARDING = day/boarding · non-resident/resident
 */
export type Labels = {
  institution: string;
  student: string;
  students: string;
  admissionNo: string;
  guardian: string;
  guardians: string;
  class: string;
  classes: string;
  classExample: string;
  stream: string;
  streams: string;
  streamExample: string;
  term: string;
  terms: string;
  day: string;
  boarding: string;
  dayGroup: string;
  boardingGroup: string;
  setup: string;
};

const SCHOOL: Labels = {
  institution: "school",
  student: "Student",
  students: "Students",
  admissionNo: "Admission no",
  guardian: "Guardian",
  guardians: "Guardians",
  class: "Class",
  classes: "Classes",
  classExample: "Grade 4",
  stream: "Stream",
  streams: "Streams",
  streamExample: "East",
  term: "Term",
  terms: "Terms",
  day: "Day",
  boarding: "Boarding",
  dayGroup: "Day scholars",
  boardingGroup: "Boarders",
  setup: "Academic setup",
};

const TVET: Labels = {
  ...SCHOOL,
  institution: "institute",
  student: "Trainee",
  students: "Trainees",
  guardian: "Parent/Guardian",
  guardians: "Parents/Guardians",
  class: "Course",
  classes: "Courses",
  classExample: "Diploma Electrical Eng · Year 1",
  stream: "Intake",
  streams: "Intakes",
  streamExample: "Sept 2026",
  day: "Non-resident",
  boarding: "Resident",
  dayGroup: "Non-residents",
  boardingGroup: "Residents",
};

const UNIVERSITY: Labels = {
  ...TVET,
  institution: "university",
  student: "Student",
  students: "Students",
  admissionNo: "Reg no",
  guardian: "Next of kin",
  guardians: "Next of kin",
  class: "Programme",
  classes: "Programmes",
  classExample: "BSc Computer Science · Year 2",
  stream: "Cohort",
  streams: "Cohorts",
  streamExample: "2025 intake",
  term: "Semester",
  terms: "Semesters",
};

const BY_KIND: Record<InstitutionKind, Labels> = { SCHOOL, TVET, UNIVERSITY };

export function labelsFor(kind: InstitutionKind | null | undefined): Labels {
  return BY_KIND[kind ?? "SCHOOL"];
}

export const KIND_NAMES: Record<InstitutionKind, string> = {
  SCHOOL: "School (PP–Grade 12)",
  TVET: "TVET / technical college",
  UNIVERSITY: "University / college",
};

/** Name for a stream that is the only one in its class ("Main"), hidden in most places. */
export const streamSuffix = (name: string) => (name === "Main" ? "" : ` ${name}`);
