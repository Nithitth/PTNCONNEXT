// Pure helpers for accounts and the school roster import.
// No server or browser APIs here, so the same rules run in the
// admin's browser (preview) and again on the server (before saving).

import { CLASSROOM_RULE, SUBJECT_NAMES, findSubject, isSchoolClassroom, type SchoolSubject } from "./school";

export type Cell = string | number | boolean | Date | null | undefined;

/** Hidden email domain: Supabase Auth needs an email, users only type their ID (see authEmailCore.ts). */
export const LOGIN_EMAIL_DOMAIN = "ptn-connext.local";

export function normalizeLoginId(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(Math.trunc(value));
  return thaiDigitsToArabic(String(value)).trim().toLowerCase();
}

export function isValidLoginId(id: string): boolean {
  return /^[a-z0-9._-]{1,40}$/.test(id);
}

export function thaiDigitsToArabic(s: string): string {
  return s.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
}

/** Thai school year (พ.ศ.) starts in mid-May. Nov 2026 → 2569, Mar 2027 → 2569. */
export function currentAcademicYear(now: Date = new Date()): number {
  const be = now.getFullYear() + 543;
  return now.getMonth() >= 4 ? be : be - 1;
}

// ─── Classrooms ──────────────────────────────────────────────

export type ClassroomRef = { grade: number; room: number };

export function formatClassroom(c: ClassroomRef): string {
  return `ม.${c.grade}/${c.room}`;
}

function cleanGradeText(v: Cell): string {
  return thaiDigitsToArabic(String(v ?? ""))
    .replace(/มัธยมศึกษาปีที่|ชั้น|ม\.|ม/g, "")
    .replace(/\s+/g, "")
    .trim();
}

/** Reads "ม.5/2", or grade "ม.5" + room "2", or 5 + 2. */
export function parseClassroom(gradeCell: Cell, roomCell?: Cell): ClassroomRef | null {
  let gradeText = cleanGradeText(gradeCell);
  let roomText = roomCell === undefined || roomCell === null ? "" : cleanGradeText(roomCell);
  if (gradeText.includes("/")) {
    [gradeText, roomText] = gradeText.split("/");
  }
  const grade = Number(gradeText);
  const room = Number(roomText);
  if (!Number.isInteger(grade) || grade < 1 || grade > 6) return null;
  if (!Number.isInteger(room) || room < 1 || room > 99) return null;
  return { grade, room };
}

/** "ม.5/1, ม.5/2" → two classrooms. Returns null if any part is unreadable. */
export function parseClassroomList(v: Cell): ClassroomRef[] | null {
  const parts = String(v ?? "")
    .split(/[,;\n、]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const out: ClassroomRef[] = [];
  for (const p of parts) {
    const c = parseClassroom(p);
    if (!c) return null;
    if (!out.some((o) => o.grade === c.grade && o.room === c.room)) out.push(c);
  }
  return out;
}

// ─── Spreadsheet columns ─────────────────────────────────────

type ColumnDef<K extends string> = { key: K; header: string; aliases: string[]; required: boolean };

export const STUDENT_COLUMNS: ColumnDef<
  "loginId" | "prefix" | "firstName" | "lastName" | "grade" | "room"
>[] = [
  { key: "loginId", header: "เลขประจำตัว", aliases: ["เลขประจำตัวนักเรียน", "รหัสนักเรียน", "student_id"], required: true },
  { key: "prefix", header: "คำนำหน้า", aliases: ["คำนำหน้าชื่อ", "prefix"], required: false },
  { key: "firstName", header: "ชื่อ", aliases: ["first_name"], required: true },
  { key: "lastName", header: "นามสกุล", aliases: ["last_name"], required: true },
  { key: "grade", header: "ชั้น", aliases: ["ระดับชั้น", "grade"], required: true },
  { key: "room", header: "ห้อง", aliases: ["room"], required: false },
];

export const TEACHER_COLUMNS: ColumnDef<"displayName" | "subjectName" | "subjectCode" | "classrooms">[] = [
  { key: "displayName", header: "ชื่อ-นามสกุล", aliases: ["ชื่อครู", "ชื่อ", "name"], required: true },
  { key: "subjectName", header: "วิชา", aliases: ["ชื่อวิชา", "subject", "subject_name"], required: false },
  { key: "subjectCode", header: "รหัสวิชา", aliases: ["subject_code"], required: false },
  { key: "classrooms", header: "ห้องที่สอน", aliases: ["classrooms"], required: false },
];

const normHeader = (s: Cell) => String(s ?? "").replace(/[\s\-_]/g, "").toLowerCase();

export type RawRow<K extends string> = { rowNumber: number; cells: Partial<Record<K, Cell>> };

/**
 * Turns sheet data (array of rows) into keyed rows using the first non-empty
 * row as headers. Returns the names of any required columns that are missing.
 */
export function mapSheet<K extends string>(
  data: Cell[][],
  columns: ColumnDef<K>[],
): { rows: RawRow<K>[]; missingColumns: string[] } {
  const isEmpty = (r: Cell[]) => r.every((c) => c === null || c === undefined || String(c).trim() === "");
  const headerIndex = data.findIndex((r) => !isEmpty(r));
  if (headerIndex === -1) {
    return { rows: [], missingColumns: columns.filter((c) => c.required).map((c) => c.header) };
  }
  const headers = data[headerIndex].map(normHeader);
  const colIndex = new Map<K, number>();
  for (const col of columns) {
    const names = [col.header, ...col.aliases].map(normHeader);
    const i = headers.findIndex((h) => names.includes(h));
    if (i !== -1) colIndex.set(col.key, i);
  }
  const missingColumns = columns.filter((c) => c.required && !colIndex.has(c.key)).map((c) => c.header);

  const rows: RawRow<K>[] = [];
  for (let r = headerIndex + 1; r < data.length; r++) {
    if (isEmpty(data[r])) continue;
    const cells: Partial<Record<K, Cell>> = {};
    for (const [key, i] of colIndex) cells[key] = data[r][i] ?? null;
    rows.push({ rowNumber: r + 1, cells });
  }
  return { rows, missingColumns };
}

/** Dates can't always cross the network as Date objects; send them as YYYY-MM-DD. */
export function serializeCell(c: Cell): string | number | null {
  if (c === null || c === undefined) return null;
  if (c instanceof Date) {
    if (Number.isNaN(c.getTime())) return null;
    const p = (n: number) => String(n).padStart(2, "0");
    return `${c.getUTCFullYear()}-${p(c.getUTCMonth() + 1)}-${p(c.getUTCDate())}`;
  }
  if (typeof c === "boolean") return String(c);
  return c;
}

const text = (c: Cell) => thaiDigitsToArabic(String(c ?? "")).replace(/\s+/g, " ").trim();

// ─── Row validation ──────────────────────────────────────────

export type StudentRow = {
  rowNumber: number;
  loginId: string;
  prefix: string;
  firstName: string;
  lastName: string;
  displayName: string;
  classroom: ClassroomRef;
};

export type Validated<T> = { ok: true; value: T } | { ok: false; rowNumber: number; errors: string[] };

export function validateStudentRow(row: RawRow<(typeof STUDENT_COLUMNS)[number]["key"]>): Validated<StudentRow> {
  const errors: string[] = [];
  const loginId = normalizeLoginId(row.cells.loginId);
  if (!loginId) errors.push("ไม่มีเลขประจำตัว");
  else if (!isValidLoginId(loginId)) errors.push("เลขประจำตัวมีอักขระที่ใช้ไม่ได้");

  const first = text(row.cells.firstName);
  const last = text(row.cells.lastName);
  if (!first) errors.push("ไม่มีชื่อ");
  if (!last) errors.push("ไม่มีนามสกุล");
  const prefix = text(row.cells.prefix);
  const displayName = `${prefix}${first} ${last}`.trim();

  const classroom = parseClassroom(row.cells.grade, row.cells.room);
  if (!classroom) errors.push("ชั้น/ห้องไม่ถูกต้อง (เช่น ม.5 ห้อง 2 หรือ ม.5/2)");
  else if (!isSchoolClassroom(classroom)) errors.push(`${formatClassroom(classroom)}: ${CLASSROOM_RULE}`);

  if (errors.length || !classroom) return { ok: false, rowNumber: row.rowNumber, errors };
  return { ok: true, value: { rowNumber: row.rowNumber, loginId, prefix, firstName: first, lastName: last, displayName, classroom } };
}

export type TeacherRow = {
  rowNumber: number;
  displayName: string;
  /** One of the six subjects in src/lib/school.ts. */
  subject: SchoolSubject | null;
  classrooms: ClassroomRef[];
};

export function validateTeacherRow(row: RawRow<(typeof TEACHER_COLUMNS)[number]["key"]>): Validated<TeacherRow> {
  const errors: string[] = [];
  const displayName = text(row.cells.displayName);
  if (!displayName) errors.push("ไม่มีชื่อ-นามสกุล");
  else if (!displayName.includes(" ")) errors.push("ใส่ทั้งชื่อและนามสกุล (เว้นวรรคระหว่างกัน)");

  const code = text(row.cells.subjectCode);
  const name = text(row.cells.subjectName);
  const roomsText = text(row.cells.classrooms);
  let subject: TeacherRow["subject"] = null;
  let classrooms: ClassroomRef[] = [];
  if (code || name || roomsText) {
    subject = findSubject(name, code);
    if (!subject) errors.push(`วิชาต้องเป็นหนึ่งใน: ${SUBJECT_NAMES}`);
    const parsed = parseClassroomList(roomsText);
    if (!parsed) errors.push("ห้องที่สอนไม่ถูกต้อง (เช่น ม.5/1, ม.5/2)");
    else {
      const outside = parsed.filter((c) => !isSchoolClassroom(c));
      if (outside.length) errors.push(`${outside.map(formatClassroom).join(", ")}: ${CLASSROOM_RULE}`);
      classrooms = parsed;
    }
  }

  if (errors.length) return { ok: false, rowNumber: row.rowNumber, errors };
  return { ok: true, value: { rowNumber: row.rowNumber, displayName, subject, classrooms } };
}

// ─── Temporary passwords (admin reset) ───────────────────────

const TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function generateTempPassword(length = 10, random: (n: number) => number = secureRandomInt): string {
  let out = "";
  for (let i = 0; i < length; i++) out += TEMP_ALPHABET[random(TEMP_ALPHABET.length)];
  return out;
}

function secureRandomInt(n: number): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] % n;
}

// ─── Passwords chosen by users ───────────────────────────────

/** Passwords people pick most often (and ones about this school); attackers try these first. */
const COMMON_PASSWORDS = new Set([
  "password", "password1", "passw0rd", "12345678", "123456789", "1234567890", "87654321", "11111111",
  "00000000", "88888888", "12341234", "11223344", "qwerty123", "qwertyuiop", "qwer1234", "1q2w3e4r",
  "q1w2e3r4", "123qweasd", "asdf1234", "asdfghjk", "zxcvbnm1", "abc12345", "abcd1234", "a1234567",
  "aa123456", "iloveyou", "thailand", "bangkok1", "ptnconnext", "ptn12345", "connext1", "welcome1",
]);

/** Why a new password isn't allowed, or null. Pass the login ID so the password can't be the ID itself. */
export function newPasswordProblem(pw: string, confirm: string, loginId?: string): string | null {
  if (pw.length < 8) return "รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร";
  if (/^\d{8}$/.test(pw)) return "อย่าใช้ตัวเลข 8 หลัก (คล้ายวันเกิด) เป็นรหัสผ่าน";
  const lower = pw.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || /^(.)\1+$/.test(pw)) return "รหัสผ่านนี้มีคนใช้มากและเดาง่าย ลองตั้งใหม่ให้เดายากขึ้น";
  if (loginId && normalizeLoginId(loginId).length >= 4 && lower.includes(normalizeLoginId(loginId))) return "อย่าใส่เลขประจำตัวหรือชื่อผู้ใช้ไว้ในรหัสผ่าน";
  if (pw !== confirm) return "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน";
  return null;
}
