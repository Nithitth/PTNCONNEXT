// What the school uses PTN Connext for in Phase 1: six subjects and eight
// classrooms. Pure (no server/browser APIs), so pages, the roster import
// and the scripts all read the same list. To add a room or subject later,
// change it here AND in a new migration (see 0003_phase1_subjects_rooms.sql).
import type { ClassroomRef } from "./roster";

/** The six subjects, in the order they're listed. `code` is the key stored in the database. */
export const SUBJECTS = [
  { code: "math", name: "คณิตศาสตร์", color: "#EA7A1F", colorName: "ส้ม" },
  { code: "pat", name: "PAT", color: "#8A4FD8", colorName: "ม่วง" },
  { code: "social", name: "สังคมศึกษา", color: "#8B5A2B", colorName: "น้ำตาล" },
  { code: "science", name: "วิทยาศาสตร์", color: "#23995A", colorName: "เขียว" },
  { code: "thai", name: "ภาษาไทย", color: "#C99A06", colorName: "ทอง" },
  { code: "english", name: "ภาษาอังกฤษ", color: "#2D7FD3", colorName: "ฟ้า" },
] as const;

export type SubjectCode = (typeof SUBJECTS)[number]["code"];
export type SchoolSubject = (typeof SUBJECTS)[number];

/** Other ways a roster might write each subject (compared without spaces/dots, lowercase). */
const ALIASES: Record<SubjectCode, string[]> = {
  math: ["คณิตศาสตร์", "คณิต", "math", "maths", "mathematics"],
  pat: ["pat"],
  social: ["สังคมศึกษา", "สังคม", "social", "socialstudies"],
  science: ["วิทยาศาสตร์", "วิทย์", "วิทยา", "ฟิสิกส์", "เคมี", "ชีววิทยา", "science", "physics", "chemistry", "biology"],
  thai: ["ภาษาไทย", "ไทย", "thai"],
  english: ["ภาษาอังกฤษ", "อังกฤษ", "english"],
};

/** Thai course codes start with the subject group's letter, e.g. ค32101 = คณิตศาสตร์. */
const CODE_LETTER: Record<string, SubjectCode> = { ค: "math", ว: "science", ส: "social", ท: "thai", อ: "english" };

const norm = (s: string) => s.replace(/[\s.\-_]/g, "").toLowerCase();

/**
 * Finds one of the six subjects from what a roster says — a name ("คณิต",
 * "ภาษาอังกฤษ", "PAT"), one of our codes ("math") or a Thai course code ("ค32101").
 */
export function findSubject(...values: string[]): SchoolSubject | null {
  for (const raw of values) {
    const v = norm(raw);
    if (!v) continue;
    const byName = SUBJECTS.find((s) => s.code === v || ALIASES[s.code].some((a) => norm(a) === v));
    if (byName) return byName;
    if (v.startsWith("pat")) return subjectByCode("pat");
    const letter = CODE_LETTER[v[0]];
    if (letter && /^\S\d/.test(v)) return subjectByCode(letter);
  }
  return null;
}

export const subjectByCode = (code: string) => SUBJECTS.find((s) => s.code === code) ?? null;

export const SUBJECT_NAMES = SUBJECTS.map((s) => s.name).join(", ");

// ─── Classrooms ──────────────────────────────────────────────

/** Phase 1: ม.4/1–ม.4/4 and ม.5/1–ม.5/4. */
export const CLASSROOMS: ClassroomRef[] = [4, 5].flatMap((grade) => [1, 2, 3, 4].map((room) => ({ grade, room })));

export const isSchoolClassroom = (c: ClassroomRef) => CLASSROOMS.some((x) => x.grade === c.grade && x.room === c.room);

export const CLASSROOM_RULE = "ช่วงแรกรองรับเฉพาะ ม.4/1–ม.4/4 และ ม.5/1–ม.5/4";
