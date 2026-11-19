// The war room (/admin/report/warroom): pure helpers for the live strip, the anonymous event feed, the alerts
// and the radar's default rooms. No names anywhere: the screen may stand at a booth. Tested in warroom.test.ts.

import { featureOf } from "./features";
import { formatValue, type ScoredOkr } from "./report";
import { roomAverage, ROOM_COLUMNS, type RoomColumn, type RoomRow } from "./reportCompare";
import { SUBJECTS } from "./school";

export type FeedEvent =
  | { kind: "post"; at: string; type: string; subject: string | null; grade: number | null; room: number | null }
  | { kind: "signup"; at: string; role: string; grade: number | null; room: number | null }
  | { kind: "visit"; at: string; feature: string; role: string; grade: number | null; room: number | null };

/** report_live() in migration 0020. */
export type Live = {
  online_now: number;
  users_today: number;
  visits_today: number;
  logins_today: number;
  posts_today: number;
  file_opens_today: number;
  seen_today: number;
  signups_today: number;
  errors_today: number;
  feed: FeedEvent[];
};

export const EMPTY_LIVE: Live = {
  online_now: 0,
  users_today: 0,
  visits_today: 0,
  logins_today: 0,
  posts_today: 0,
  file_opens_today: 0,
  seen_today: 0,
  signups_today: 0,
  errors_today: 0,
  feed: [],
};

const POST: Record<string, string> = { assignment: "มอบหมายงาน", exam: "ประกาศวันสอบ", material: "แชร์เอกสาร", event: "ประกาศกิจกรรม" };
const room = (e: { grade: number | null; room: number | null }) => (e.grade && e.room ? `ม.${e.grade}/${e.room}` : null);

/** One event as an anonymous Thai line: "ม.5/2 · ครูมอบหมายงานคณิตศาสตร์". */
export function feedText(e: FeedEvent): { where: string; what: string } {
  const where = room(e) ?? (e.kind === "post" ? "ทั้งโรงเรียน" : "ครูและผู้ดูแล");
  if (e.kind === "post") {
    const subject = SUBJECTS.find((s) => s.code === e.subject)?.name;
    return { where, what: `ครู${POST[e.type] ?? "โพสต์"}${subject ? ` · ${subject}` : ""}` };
  }
  if (e.kind === "signup") return { where, what: e.role === "teacher" ? "ครูลงทะเบียนใหม่" : "นักเรียนลงทะเบียนใหม่" };
  const who = e.role === "student" ? "นักเรียน" : "ครู";
  return { where, what: `${who}เปิด${featureOf(e.feature)?.th ?? "Connext"}` };
}

/** "เมื่อสักครู่", "5 นาทีที่แล้ว", "2 ชม.ที่แล้ว", "3 วันที่แล้ว". */
export function ago(iso: string, now: Date): string {
  const s = Math.max(0, (now.getTime() - Date.parse(iso)) / 1000);
  if (s < 60) return "เมื่อสักครู่";
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86_400) return `${Math.floor(s / 3600)} ชม.ที่แล้ว`;
  return `${Math.floor(s / 86_400)} วันที่แล้ว`;
}

export type Alert = { tone: "danger" | "warning" | "info"; text: string };

/** What the room should look at now: errors, key results falling behind, clashes ahead, storage. */
export function alerts(o: { okrs: ScoredOkr[]; live: Live; clashes: number; storageUse: number; lockouts: number; schoolDriveBroken?: boolean }): Alert[] {
  const out: Alert[] = [];
  if (o.schoolDriveBroken) out.push({ tone: "danger", text: "Drive ของโรงเรียนหลุดการเชื่อมต่อ" });
  if (o.live.errors_today > 0) out.push({ tone: "danger", text: `ข้อผิดพลาดวันนี้ ${o.live.errors_today} ครั้ง` });
  if (o.clashes > 0) out.push({ tone: "warning", text: `มีวันที่สอบชนกัน ${o.clashes} วัน (ช่วงนี้ + 14 วันข้างหน้า)` });
  if (o.lockouts > 0) out.push({ tone: "warning", text: `บัญชีถูกล็อกชั่วคราว ${o.lockouts} ครั้งในช่วงนี้` });
  if (o.storageUse >= 0.8) out.push({ tone: "warning", text: `พื้นที่เก็บไฟล์ใช้ไป ${Math.round(o.storageUse * 100)}%` });
  const behind = o.okrs.flatMap((x) => x.keyResults.filter((k) => k.status === "behind"));
  for (const k of behind.slice(0, 3))
    out.push({ tone: "info", text: `ยังห่างเป้า: ${k.label} (${formatValue(k.actual, k.unit, "th")} / เป้า ${formatValue(k.target, k.unit, "th")})` });
  if (!out.length) out.push({ tone: "info", text: "ทุกอย่างปกติ" });
  return out;
}

/** A room's average over the room columns that have data. */
const score = (r: { values: Record<RoomColumn, number | null> }) => {
  const v = ROOM_COLUMNS.map((c) => r.values[c.key]).filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** The radar's starting rooms: the best and the weakest (by their average), plus the school average. */
export function defaultRadar(rows: RoomRow[]): { ids: string[]; avg: Record<RoomColumn, number | null> } {
  const ranked = rows
    .map((r) => ({ id: r.classroomId, s: score(r) }))
    .filter((r) => r.s !== null)
    .sort((a, b) => b.s! - a.s!);
  const ids = ranked.length >= 2 ? [ranked[0].id, ranked[ranked.length - 1].id] : ranked.map((r) => r.id);
  return { ids, avg: roomAverage(rows) };
}
