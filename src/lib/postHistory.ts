// Post history (migration 0020, post_history): what a post looked like and what an edit changed, so a dispute
// ("the deadline was moved") can be settled. Pure and tested; the server writes it with logPostHistory().

export type PostSnapshot = {
  title: string;
  description: string | null;
  subject_id: string | null;
  exam_kind: string | null;
  content_order: number | null;
  /** One per room (classroom_id null = the whole school). due_at is an ISO time or null. */
  targets: { classroom_id: string | null; due_at: string | null }[];
  /** The attached file or link's name, or null. */
  file: string | null;
};

export type Change =
  | { field: "title" | "description" | "subject" | "exam_kind" | "content_order" | "file"; from: unknown; to: unknown }
  | { field: "room_added" | "room_removed"; room: string | null; due: string | null }
  | { field: "due"; room: string | null; from: string | null; to: string | null };

const sameTime = (a: string | null, b: string | null) => (a && b ? Date.parse(a) === Date.parse(b) : a === b);

/** Every difference between two versions of a post (empty when nothing changed). */
export function postDiff(before: PostSnapshot, after: PostSnapshot): Change[] {
  const out: Change[] = [];
  const plain: [Change["field"] & ("title" | "description" | "exam_kind" | "content_order" | "file"), keyof PostSnapshot][] = [
    ["title", "title"],
    ["description", "description"],
    ["exam_kind", "exam_kind"],
    ["content_order", "content_order"],
    ["file", "file"],
  ];
  for (const [field, key] of plain) {
    const a = before[key] ?? null;
    const b = after[key] ?? null;
    if (a !== b) out.push({ field, from: a, to: b });
  }
  if ((before.subject_id ?? null) !== (after.subject_id ?? null)) out.push({ field: "subject", from: before.subject_id, to: after.subject_id });

  const was = new Map(before.targets.map((t) => [t.classroom_id, t.due_at]));
  const now = new Map(after.targets.map((t) => [t.classroom_id, t.due_at]));
  for (const [room, due] of now) {
    if (!was.has(room)) out.push({ field: "room_added", room, due });
    else if (!sameTime(was.get(room) ?? null, due)) out.push({ field: "due", room, from: was.get(room) ?? null, to: due });
  }
  for (const [room, due] of was) if (!now.has(room)) out.push({ field: "room_removed", room, due });
  return out;
}

export type Namers = { room: (id: string | null) => string; subject: (id: unknown) => string; time: (iso: string | null) => string };

const FIELD: Record<string, string> = {
  title: "ชื่อเรื่อง",
  description: "รายละเอียด",
  exam_kind: "ประเภทการสอบ",
  content_order: "ลำดับเนื้อหา",
  file: "ไฟล์/ลิงก์",
  subject: "วิชา",
};
const EXAM: Record<string, string> = { quiz: "สอบย่อย", major: "สอบกลางภาค/ปลายภาค" };
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

/** One change as a short Thai sentence, e.g. "ม.5/1: กำหนดส่ง 3 ธ.ค. 2569 23:59 → 5 ธ.ค. 2569 23:59". */
export function describeChange(c: Change, n: Namers): string {
  switch (c.field) {
    case "due":
      return `${n.room(c.room)}: วันที่ ${n.time(c.from)} → ${n.time(c.to)}`;
    case "room_added":
      return `เพิ่ม ${n.room(c.room)}${c.due ? ` (${n.time(c.due)})` : ""}`;
    case "room_removed":
      return `เอา ${n.room(c.room)} ออก`;
    case "subject":
      return `${FIELD.subject}: ${n.subject(c.from)} → ${n.subject(c.to)}`;
    case "exam_kind":
      return `${FIELD.exam_kind}: ${EXAM[String(c.from)] ?? show(c.from)} → ${EXAM[String(c.to)] ?? show(c.to)}`;
    case "description":
      return `แก้${FIELD.description}`;
    default:
      return `${FIELD[c.field] ?? c.field}: ${show(c.from)} → ${show(c.to)}`;
  }
}
