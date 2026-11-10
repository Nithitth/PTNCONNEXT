// Rules for what a teacher may post. Pure, so the Teacher's Console form can
// show the same errors the server would, and the server checks them again.
import { bangkokInputToIso } from "./calendar";

/**
 * The four kinds of post (the database enum also has "announcement",
 * which nothing creates yet — the loaders leave it out).
 */
export type PostKind = "assignment" | "material" | "exam" | "event";

/** What the form may offer: subjects you teach, each with the rooms you teach it in. */
export type RoomOption = { id: string; label: string };
export type SubjectOption = { id: string; code: string; name: string; color: string; rooms: RoomOption[] };

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_DESCRIPTION = 2000;

/** Supabase Storage bucket for teachers' PDFs. */
export const MATERIALS_BUCKET = "materials";

/** In the form, the "ทั้งโรงเรียน" choice uses this id (saved as classroom_id null). */
export const SCHOOL = "school";

export const isUuid = (s: string) => /^[0-9a-f-]{36}$/.test(s);

/** One classroom the post goes to. classroomId null = whole school (admins only). */
type TargetInput = {
  classroomId: string | null;
  /** assignment: "2026-11-12T16:30"; exam / event: "2026-11-12"; material: "" */
  due: string;
  /** event: last day "2026-11-14" (optional) */
  end?: string;
};

export type AttachmentInput =
  | { mode: "keep" }
  | { mode: "none" }
  | { mode: "link"; url: string }
  | { mode: "file"; storagePath: string; fileName: string; size: number };

export type PostInput = {
  kind: PostKind;
  subjectId: string | null;
  title: string;
  description: string;
  /** Materials only: chapter / lesson number used for sorting. "" = none. */
  contentOrder: string;
  /** Exams only: quiz or midterm/final (this also sets how many days before are highlighted). */
  examKind: ExamKind;
  targets: TargetInput[];
  attachment: AttachmentInput;
};

type CleanTarget = { classroom_id: string | null; due_at: string | null; ends_at: string | null; lead_days: number };

export type CleanPost = {
  type: PostKind;
  subject_id: string | null;
  title: string;
  description: string;
  content_order: number;
  exam_kind: ExamKind;
  targets: CleanTarget[];
  attachment: AttachmentInput;
};

export const KIND_LABEL: Record<PostKind, string> = {
  assignment: "งาน",
  material: "เอกสาร",
  exam: "สอบ",
  event: "กิจกรรม",
};

/**
 * Two kinds of exam, each with its own calendar color:
 * quiz = light / dark amber, major (midterm, final) = light / dark red.
 */
export type ExamKind = "quiz" | "major";

export const EXAM_KIND_LABEL: Record<ExamKind, string> = {
  quiz: "สอบเก็บคะแนน / สอบย่อย",
  major: "สอบกลางภาค / ปลายภาค",
};

/** How many days before the exam the calendar highlights (fixed per kind, school rule). */
export const EXAM_LEAD_DAYS: Record<ExamKind, number> = { quiz: 3, major: 5 };

/** Only http(s) links — never "javascript:" or other tricks. */
export function cleanUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s || s.length > 2000) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function fileProblem(file: { name: string; size: number; type?: string }): string | null {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) return "อัปโหลดได้เฉพาะไฟล์ PDF (ไฟล์อื่นให้แชร์เป็นลิงก์ เช่น Google Drive)";
  if (file.size > MAX_FILE_BYTES) return "ไฟล์ใหญ่เกิน 10 MB ลองบีบอัดไฟล์ หรือแชร์เป็นลิงก์แทน";
  if (file.size === 0) return "ไฟล์ว่างเปล่า";
  return null;
}

type Checked = { ok: true; value: CleanPost } | { ok: false; error: string };

export function validatePost(input: PostInput): Checked {
  const fail = (error: string): Checked => ({ ok: false, error });
  const kind = input.kind;
  if (!(kind in KIND_LABEL)) return fail("ประเภทโพสต์ไม่ถูกต้อง");

  const title = input.title.replace(/\s+/g, " ").trim();
  if (!title) return fail("ใส่ชื่อเรื่อง");
  if (title.length > 200) return fail("ชื่อเรื่องยาวเกิน 200 ตัวอักษร");

  const description = input.description.trim();
  if (description.length > MAX_DESCRIPTION) return fail(`รายละเอียดยาวเกิน ${MAX_DESCRIPTION} ตัวอักษร`);

  const subject_id = kind === "event" ? null : input.subjectId || null;
  if (kind !== "event" && !subject_id) return fail("เลือกวิชา");

  let content_order = 0;
  if (kind === "material" && input.contentOrder.trim()) {
    content_order = Number(input.contentOrder);
    if (!Number.isInteger(content_order) || content_order < 0 || content_order > 9999) {
      return fail("ลำดับเนื้อหาต้องเป็นเลขจำนวนเต็ม 0–9999");
    }
  }

  let lead_days = 0;
  let exam_kind: ExamKind = "quiz";
  if (kind === "exam") {
    if (!(input.examKind in EXAM_KIND_LABEL)) return fail("เลือกประเภทการสอบ");
    exam_kind = input.examKind;
    lead_days = EXAM_LEAD_DAYS[exam_kind];
  }

  if (input.targets.length === 0) return fail("เลือกอย่างน้อยหนึ่งห้อง");
  const seen = new Set<string>();
  const targets: CleanTarget[] = [];
  for (const t of input.targets) {
    const id = t.classroomId ?? SCHOOL;
    if (seen.has(id)) return fail("เลือกห้องซ้ำ");
    seen.add(id);

    let due_at: string | null = null;
    let ends_at: string | null = null;
    if (kind === "assignment") {
      if (!/T\d{2}:\d{2}$/.test(t.due)) return fail("ใส่วันและเวลากำหนดส่งให้ครบทุกห้อง");
      due_at = bangkokInputToIso(t.due);
      if (!due_at) return fail("วันกำหนดส่งไม่ถูกต้อง");
    } else if (kind === "exam" || kind === "event") {
      due_at = bangkokInputToIso(t.due.slice(0, 10));
      if (!due_at) return fail(kind === "exam" ? "ใส่วันสอบให้ครบทุกห้อง" : "ใส่วันเริ่มกิจกรรม");
      if (kind === "event" && t.end) {
        ends_at = bangkokInputToIso(t.end.slice(0, 10));
        if (!ends_at) return fail("วันสิ้นสุดกิจกรรมไม่ถูกต้อง");
        if (ends_at < due_at) return fail("วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
      }
    }
    targets.push({ classroom_id: t.classroomId, due_at, ends_at, lead_days });
  }

  let attachment = input.attachment;
  if (attachment.mode === "link") {
    const url = cleanUrl(attachment.url);
    if (!url) return fail("ลิงก์ไม่ถูกต้อง ต้องขึ้นต้นด้วย https://");
    attachment = { mode: "link", url };
  } else if (attachment.mode === "file") {
    const problem = fileProblem({ name: attachment.fileName, size: attachment.size });
    if (problem) return fail(problem);
    if (!attachment.storagePath || attachment.fileName.length > 200) return fail("ไฟล์ไม่ถูกต้อง");
  }
  if (kind === "material" && attachment.mode === "none") return fail("แนบไฟล์ PDF หรือลิงก์ของเอกสาร");

  return { ok: true, value: { type: kind, subject_id, title, description, content_order, exam_kind, targets, attachment } };
}
