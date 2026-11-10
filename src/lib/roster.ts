// Pure helpers for accounts and the school roster import.
// No server or browser APIs here, so the same rules run in the
// admin's browser (preview) and again on the server (before saving).

import { CLASSROOM_RULE, SUBJECT_NAMES, findSubject, isSchoolClassroom, type SchoolSubject } from "./school";

export type Cell = string | number | boolean | Date | null | undefined;

/** Hidden email domain: Supabase Auth needs an email, users only type their ID. */
export const LOGIN_EMAIL_DOMAIN = "ptn-connext.local";

export function normalizeLoginId(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(Math.trunc(value));
  return thaiDigitsToArabic(String(value)).trim().toLowerCase();
}

export function isValidLoginId(id: string): boolean {
  return /^[a-z0-9._-]{1,40}$/.test(id);
}

export function loginIdToEmail(loginId: string): string {
  return `${normalizeLoginId(loginId)}@${LOGIN_EMAIL_DOMAIN}`;
}

export function thaiDigitsToArabic(s: string): string {
  return s.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
}

// ─── Dates ───────────────────────────────────────────────────

const THAI_MONTHS: Record<string, number> = {
  มกราคม: 1, "ม.ค.": 1, กุมภาพันธ์: 2, "ก.พ.": 2, มีนาคม: 3, "มี.ค.": 3,
  เมษายน: 4, "เม.ย.": 4, พฤษภาคม: 5, "พ.ค.": 5, มิถุนายน: 6, "มิ.ย.": 6,
  กรกฎาคม: 7, "ก.ค.": 7, สิงหาคม: 8, "ส.ค.": 8, กันยายน: 9, "ก.ย.": 9,
  ตุลาคม: 10, "ต.ค.": 10, พฤศจิกายน: 11, "พ.ย.": 11, ธันวาคม: 12, "ธ.ค.": 12,
};

export type BirthdateResult =
  | { ok: true; day: number; month: number; year: number; password: string }
  | { ok: false; error: string };

/**
 * Reads a birthdate from an Excel cell and returns the first-login password
 * (DDMMYYYY, Gregorian year). Accepts real Excel dates, "05/05/2552" (พ.ศ.),
 * "5/5/2009", "2009-05-05", "05052009", and "5 พฤษภาคม 2552".
 */
export function parseBirthdate(value: Cell, now: Date = new Date()): BirthdateResult {
  let d: number, m: number, y: number;

  if (value === null || value === undefined || value === "") {
    return { ok: false, error: "ไม่มีวันเกิด" };
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { ok: false, error: "วันเกิดไม่ถูกต้อง" };
    d = value.getUTCDate();
    m = value.getUTCMonth() + 1;
    y = value.getUTCFullYear();
  } else if (typeof value === "number") {
    if (!Number.isInteger(value)) return { ok: false, error: "วันเกิดไม่ถูกต้อง" };
    if (value >= 1 && value < 100000) {
      // Excel date serial number (days since 30 Dec 1899)
      const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
      d = date.getUTCDate();
      m = date.getUTCMonth() + 1;
      y = date.getUTCFullYear();
    } else {
      // e.g. 05052009 typed as a number loses its leading zero → 5052009
      return parseBirthdate(String(value).padStart(8, "0"), now);
    }
  } else {
    const s = thaiDigitsToArabic(String(value)).trim().replace(/\s+/g, " ");
    let match: RegExpMatchArray | null;
    if ((match = s.match(/^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})$/))) {
      [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    } else if ((match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
      [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    } else if ((match = s.match(/^(\d{2})(\d{2})(\d{4})$/))) {
      [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    } else if ((match = s.match(/^(\d{1,2}) ?(\S+?) ?(\d{4})$/)) && THAI_MONTHS[match[2]]) {
      [d, m, y] = [Number(match[1]), THAI_MONTHS[match[2]], Number(match[3])];
    } else {
      return { ok: false, error: `อ่านวันเกิดไม่ได้: "${s}"` };
    }
  }

  if (y > 2400) y -= 543; // พ.ศ. → ค.ศ.
  const check = new Date(Date.UTC(y, m - 1, d));
  const realDate =
    check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
  if (!realDate) return { ok: false, error: "วันเกิดไม่ใช่วันที่จริง" };
  if (y < 1940 || check.getTime() > now.getTime()) {
    return { ok: false, error: "ปีเกิดไม่สมเหตุสมผล" };
  }
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return { ok: true, day: d, month: m, year: y, password: `${pad(d)}${pad(m)}${pad(y, 4)}` };
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
  "loginId" | "prefix" | "firstName" | "lastName" | "grade" | "room" | "birthdate"
>[] = [
  { key: "loginId", header: "เลขประจำตัว", aliases: ["เลขประจำตัวนักเรียน", "รหัสนักเรียน", "student_id"], required: true },
  { key: "prefix", header: "คำนำหน้า", aliases: ["คำนำหน้าชื่อ", "prefix"], required: false },
  { key: "firstName", header: "ชื่อ", aliases: ["first_name"], required: true },
  { key: "lastName", header: "นามสกุล", aliases: ["last_name"], required: true },
  { key: "grade", header: "ชั้น", aliases: ["ระดับชั้น", "grade"], required: true },
  { key: "room", header: "ห้อง", aliases: ["room"], required: false },
  { key: "birthdate", header: "วันเกิด", aliases: ["วันเดือนปีเกิด", "birthdate"], required: true },
];

export const TEACHER_COLUMNS: ColumnDef<
  "loginId" | "displayName" | "birthdate" | "subjectName" | "subjectCode" | "classrooms"
>[] = [
  { key: "loginId", header: "ชื่อผู้ใช้", aliases: ["username"], required: true },
  { key: "displayName", header: "ชื่อ-นามสกุล", aliases: ["ชื่อครู", "ชื่อ", "name"], required: true },
  { key: "birthdate", header: "วันเกิด", aliases: ["วันเดือนปีเกิด", "birthdate"], required: true },
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
  displayName: string;
  classroom: ClassroomRef;
  password: string;
};

export type Validated<T> = { ok: true; value: T } | { ok: false; rowNumber: number; errors: string[] };

export function validateStudentRow(row: RawRow<(typeof STUDENT_COLUMNS)[number]["key"]>, now?: Date): Validated<StudentRow> {
  const errors: string[] = [];
  const loginId = normalizeLoginId(row.cells.loginId);
  if (!loginId) errors.push("ไม่มีเลขประจำตัว");
  else if (!isValidLoginId(loginId)) errors.push("เลขประจำตัวมีอักขระที่ใช้ไม่ได้");

  const first = text(row.cells.firstName);
  const last = text(row.cells.lastName);
  if (!first) errors.push("ไม่มีชื่อ");
  if (!last) errors.push("ไม่มีนามสกุล");
  const displayName = `${text(row.cells.prefix)}${first} ${last}`.trim();

  const classroom = parseClassroom(row.cells.grade, row.cells.room);
  if (!classroom) errors.push("ชั้น/ห้องไม่ถูกต้อง (เช่น ม.5 ห้อง 2 หรือ ม.5/2)");
  else if (!isSchoolClassroom(classroom)) errors.push(`${formatClassroom(classroom)}: ${CLASSROOM_RULE}`);

  const bd = parseBirthdate(row.cells.birthdate, now);
  if (!bd.ok) errors.push(bd.error);

  if (errors.length || !classroom || !bd.ok) return { ok: false, rowNumber: row.rowNumber, errors };
  return { ok: true, value: { rowNumber: row.rowNumber, loginId, displayName, classroom, password: bd.password } };
}

export type TeacherRow = {
  rowNumber: number;
  loginId: string;
  displayName: string;
  password: string;
  /** One of the six subjects in src/lib/school.ts. */
  subject: SchoolSubject | null;
  classrooms: ClassroomRef[];
};

export function validateTeacherRow(row: RawRow<(typeof TEACHER_COLUMNS)[number]["key"]>, now?: Date): Validated<TeacherRow> {
  const errors: string[] = [];
  const loginId = normalizeLoginId(row.cells.loginId);
  if (!loginId) errors.push("ไม่มีชื่อผู้ใช้");
  else if (!isValidLoginId(loginId)) errors.push("ชื่อผู้ใช้ใช้ได้เฉพาะ a-z, 0-9, จุด, ขีด");

  const displayName = text(row.cells.displayName);
  if (!displayName) errors.push("ไม่มีชื่อ-นามสกุล");

  const bd = parseBirthdate(row.cells.birthdate, now);
  if (!bd.ok) errors.push(bd.error);

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

  if (errors.length || !bd.ok) return { ok: false, rowNumber: row.rowNumber, errors };
  return { ok: true, value: { rowNumber: row.rowNumber, loginId, displayName, password: bd.password, subject, classrooms } };
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

export function newPasswordProblem(pw: string, confirm: string): string | null {
  if (pw.length < 8) return "รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร";
  if (/^\d{8}$/.test(pw)) return "อย่าใช้ตัวเลข 8 หลัก (คล้ายวันเกิด) เป็นรหัสผ่าน";
  if (pw !== confirm) return "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน";
  return null;
}
