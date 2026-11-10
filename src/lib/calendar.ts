// Pure date + calendar helpers. No server or browser APIs, so the calendar
// page (server) and the calendar view (browser) use exactly the same rules.
//
// Everything is in Thai time (Asia/Bangkok, UTC+7, no daylight saving).
// A "day key" is a plain calendar date string like "2026-11-12".
import { EXAM_LEAD_DAYS, type ExamKind, type PostKind } from "./postForm";

export type DayKey = string;

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Thai-time calendar date of a moment. */
export function dayKey(moment: string | Date): DayKey {
  const t = typeof moment === "string" ? Date.parse(moment) : moment.getTime();
  return new Date(t + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(key: DayKey, n: number): DayKey {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Whole days from a to b (b later → positive). */
export function daysBetween(a: DayKey, b: DayKey): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/**
 * What a teacher typed in a date / date-time box ("2026-11-12" or
 * "2026-11-12T16:30"), read as Thai time → an ISO timestamp for the database.
 */
export function bangkokInputToIso(value: string): string | null {
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [y, mo, d, h, mi] = [1, 2, 3, 4, 5].map((i) => Number(m[i] ?? 0));
  const utc = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(utc);
  const real =
    check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d && h < 24 && mi < 60;
  if (!real || y < 2000 || y > 2100) return null;
  return new Date(utc - BANGKOK_OFFSET_MS).toISOString();
}

/** The reverse: a database timestamp → the value a date / date-time box expects. */
export function isoToBangkokInput(iso: string, withTime = true): string {
  return new Date(Date.parse(iso) + BANGKOK_OFFSET_MS).toISOString().slice(0, withTime ? 16 : 10);
}

// ─── Months ──────────────────────────────────────────────────

/** A month by its Gregorian year (ค.ศ.) and month number 1–12. */
export type MonthRef = { year: number; month: number };

/** Reads "?m=2026-11"; anything else means the current month in Thai time. */
export function parseMonth(param: string | undefined, now: Date): MonthRef {
  const m = param?.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) return { year, month };
  }
  const [y, mo] = dayKey(now).split("-").map(Number);
  return { year: y, month: mo };
}

export function shiftMonth({ year, month }: MonthRef, n: number): MonthRef {
  const i = year * 12 + (month - 1) + n;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

export function monthParam({ year, month }: MonthRef): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** 6 weeks × 7 days, starting on the Sunday on or before the 1st (Thai calendars start on Sunday). */
export function monthGrid(ref: MonthRef): DayKey[] {
  const first = `${monthParam(ref)}-01`;
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const start = addDays(first, -weekday);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export const isInMonth = (key: DayKey, ref: MonthRef) => key.startsWith(`${monthParam(ref)}-`);

// ─── Thai labels (พ.ศ. comes from the th-TH locale automatically) ──

const asUtcDate = (key: DayKey) => new Date(`${key}T00:00:00Z`);
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("th-TH", { timeZone: "UTC", ...o });
const LONG_DAY = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
const SHORT_DAY = fmt({ day: "numeric", month: "short" });
const SHORT_MONTH = fmt({ month: "short" });
const MONTH = fmt({ month: "long", year: "numeric" });
const TIME = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

/** "วันพฤหัสบดีที่ 12 พฤศจิกายน 2569" */
export const formatDayLong = (key: DayKey) => LONG_DAY.format(asUtcDate(key));
/** "12 พ.ย." */
export const formatDayShort = (key: DayKey) => SHORT_DAY.format(asUtcDate(key));
/** "พ.ย." */
export const formatMonthShort = (key: DayKey) => SHORT_MONTH.format(asUtcDate(key));
/** "พฤศจิกายน 2569" */
export const formatMonth = ({ year, month }: MonthRef) => MONTH.format(new Date(Date.UTC(year, month - 1, 1)));
/** "16:30 น." */
export const formatTime = (iso: string) => `${TIME.format(new Date(iso))} น.`;
/** The moment `h` hours ago, as an ISO string (for "last 24 hours" filters). */
export const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();

/** "12 พ.ย. 2569 16:30" — for logs and lists in Thai time. */
const DATE_TIME = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
export const formatDateTime = (iso: string) => DATE_TIME.format(new Date(iso));

export const WEEKDAYS_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

// ─── Calendar items ──────────────────────────────────────────

export type Attachment = { id: string; kind: "file" | "link"; name: string; href: string };

/** One post as it lands in one classroom (a post sent to 2 rooms = 2 items). */
export type CalendarItem = {
  key: string;
  type: PostKind;
  /** Exams: quiz (amber) or midterm/final (red). */
  examKind: ExamKind;
  title: string;
  description: string;
  subject: { code: string; name: string; color: string } | null;
  /** Assignment: deadline. Exam / event: the day it starts. */
  dueAt: string | null;
  /** Event: the last day. */
  endsAt: string | null;
  /** "ม.5/1", "ทั้งโรงเรียน", or null when it isn't worth showing. */
  room: string | null;
  contentOrder: number;
  createdAt: string;
  attachments: Attachment[];
};

export type DayInfo = {
  due: CalendarItem[];
  exams: CalendarItem[];
  leadUp: { item: CalendarItem; daysLeft: number }[];
  events: CalendarItem[];
};

const emptyDay = (): DayInfo => ({ due: [], exams: [], leadUp: [], events: [] });

export const dayIsEmpty = (d: DayInfo) =>
  d.due.length + d.exams.length + d.leadUp.length + d.events.length === 0;

/** Puts each item on the days it belongs to. Only days in `days` are filled. */
export function placeItems(items: CalendarItem[], days: DayKey[]): Map<DayKey, DayInfo> {
  const map = new Map<DayKey, DayInfo>(days.map((d) => [d, emptyDay()]));
  const at = (k: DayKey) => map.get(k);

  for (const item of items) {
    if (!item.dueAt) continue;
    const start = dayKey(item.dueAt);
    if (item.type === "assignment") {
      at(start)?.due.push(item);
    } else if (item.type === "exam") {
      at(start)?.exams.push(item);
      // The highlighted days before follow the exam kind (3 for a quiz, 5 for midterm/final),
      // so changing the rule updates exams that were posted earlier too.
      for (let n = 1; n <= EXAM_LEAD_DAYS[item.examKind]; n++) at(addDays(start, -n))?.leadUp.push({ item, daysLeft: n });
    } else if (item.type === "event") {
      const end = item.endsAt ? dayKey(item.endsAt) : start;
      const length = Math.min(Math.max(daysBetween(start, end), 0), 62);
      for (let n = 0; n <= length; n++) at(addDays(start, n))?.events.push(item);
    }
  }
  for (const info of map.values()) {
    info.due.sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
    info.leadUp.sort((a, b) => a.daysLeft - b.daysLeft);
  }
  return map;
}

/** Due within the next 24 hours (and not already past) → the dot blinks. */
export function isDueSoon(dueAt: string, now: Date): boolean {
  const left = Date.parse(dueAt) - now.getTime();
  return left >= 0 && left <= DAY_MS;
}

/** Assignments not yet due and exams from today on, within `days` days, soonest first. */
export function upcoming(items: CalendarItem[], now: Date, days = 14): CalendarItem[] {
  const today = dayKey(now);
  const last = addDays(today, days);
  return items
    .filter((i) => {
      if (!i.dueAt) return false;
      const k = dayKey(i.dueAt);
      if (k > last) return false;
      if (i.type === "assignment") return Date.parse(i.dueAt) >= now.getTime();
      if (i.type === "exam") return k >= today;
      return false;
    })
    .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
}

export type MaterialSort = "subject" | "name" | "order";

const th = (a: string, b: string) => a.localeCompare(b, "th");

/** Sort for the materials list: by subject, by title (ก–ฮ), or by the teacher's content order. */
export function sortMaterials(items: CalendarItem[], by: MaterialSort): CalendarItem[] {
  const byOrder = (a: CalendarItem, b: CalendarItem) =>
    a.contentOrder - b.contentOrder || a.createdAt.localeCompare(b.createdAt);
  return [...items].sort((a, b) => {
    if (by === "name") return th(a.title, b.title);
    if (by === "order") return byOrder(a, b) || th(a.title, b.title);
    return th(a.subject?.name ?? "￿", b.subject?.name ?? "￿") || byOrder(a, b) || th(a.title, b.title);
  });
}
