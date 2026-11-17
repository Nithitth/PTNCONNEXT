// Sign-up rules shared by the sign-up page, the log-in form and the admin dashboard.
// Pure (no server or browser APIs), tested in signup.test.ts.

import { bangkokInputToIso } from "./calendar";
import { thaiDigitsToArabic } from "./roster";

// ─── Names ───────────────────────────────────────────────────

/** Title prefixes people may or may not type before their name (longest first). */
const PREFIXES = [
  "เด็กชาย", "เด็กหญิง", "นางสาว", "ด.ช.", "ด.ญ.", "น.ส.", "นาย", "นาง", "ครู", "อาจารย์",
  "mr.", "mrs.", "ms.", "miss", "mr", "mrs", "ms",
];

/** One name part, cleaned: Thai/zero-width/space differences don't matter, Latin letters are lowercased. */
function cleanPart(s: string): string {
  return thaiDigitsToArabic(s.normalize("NFC"))
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Removes one leading title (e.g. "ด.ช.", "นางสาว") from a name. */
function withoutPrefix(s: string): string {
  for (const p of PREFIXES) {
    if (s.startsWith(p)) return s.slice(p.length).trim();
  }
  return s;
}

/** The key two spellings of one person's name share: "ด.ช. สมชาย  ใจดี" and "สมชาย ใจดี" match. */
export function nameKey(first: string, last: string): string {
  return `${withoutPrefix(cleanPart(first))} ${cleanPart(last)}`.trim();
}

/** The same key from a full name typed in one box ("นางสมศรี รักเรียน"): first word = first name. */
export function nameKeyFromFull(full: string): string {
  const parts = withoutPrefix(cleanPart(full)).split(" ").filter(Boolean);
  return nameKey(parts[0] ?? "", parts.slice(1).join(" "));
}

/** Splits a full name into title, first and last name (for teachers, whose roster has one name column). */
export function splitFullName(full: string): { prefix: string; first: string; last: string } {
  const clean = thaiDigitsToArabic(full.normalize("NFC")).replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim();
  const lower = clean.toLowerCase();
  const prefix = PREFIXES.find((p) => lower.startsWith(p)) ?? "";
  const rest = clean.slice(prefix.length).trim();
  const [first = "", ...last] = rest.split(" ");
  return { prefix: clean.slice(0, prefix.length), first, last: last.join(" ") };
}

// ─── Contact details ─────────────────────────────────────────

/** A Thai mobile number as 10 digits ("081-234-5678", "+66 81 234 5678" → "0812345678"), or null. */
export function normalizePhone(s: string): string | null {
  let d = thaiDigitsToArabic(s).replace(/[\s\-().]/g, "");
  if (d.startsWith("+66")) d = `0${d.slice(3)}`;
  else if (d.startsWith("66") && d.length === 11) d = `0${d.slice(2)}`;
  return /^0\d{9}$/.test(d) ? d : null;
}

/** A lower-cased email, or null when it doesn't look like one. */
export function normalizeEmail(s: string): string | null {
  const e = s.trim().toLowerCase();
  return e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
}

/** "somchai@gmail.com" → "som***@gmail.com" (for the dashboard; never log full emails). */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 3)}***@${domain ?? ""}`;
}

/** "0812345678" → "081-***-5678". */
export const maskPhone = (phone: string) => `${phone.slice(0, 3)}-***-${phone.slice(-4)}`;

/** What a person typed in the log-in box: an email, a phone number, or an ID. */
export function classifyLoginIdentifier(raw: string): { kind: "email"; value: string } | { kind: "phone"; value: string } | { kind: "id"; value: string } {
  const s = raw.trim();
  if (s.includes("@")) return { kind: "email", value: s.toLowerCase() };
  const phone = normalizePhone(s);
  if (phone) return { kind: "phone", value: phone };
  return { kind: "id", value: thaiDigitsToArabic(s).toLowerCase() };
}

// ─── Log-in lockout ──────────────────────────────────────────

/** How long a lockout lasts, and the window wrong passwords are counted in. */
export const LOCK_MINUTES = 15;

/**
 * Wrong passwords allowed in LOCK_MINUTES for what was typed. Student IDs get more room (10), because a
 * classmate who knows an ID could otherwise lock a friend out on purpose; emails, phones and usernames 5.
 * It depends only on what was typed, never on whether the account exists (no account-existence leak).
 */
export function lockoutLimit(id: { kind: string; value: string }): number {
  return id.kind === "id" && /^\d{3,12}$/.test(id.value) ? 10 : 5;
}

export type LockEvent = { success: boolean; reason: string | null; created_at: string };

/** Reasons that count towards a lockout (a wrong-tab or not-registered log-in doesn't). */
export const COUNTED_REASONS = ["wrong-password", "mfa-wrong"];

/**
 * Wrong tries that still count: newest first, stopping at the last successful log-in and ignoring
 * everything up to an admin's unlock. Pass only events from the last LOCK_MINUTES.
 */
export function countedFailures(newestFirst: LockEvent[], unlockedAt: string | null = null): number {
  let n = 0;
  for (const e of newestFirst) {
    if (e.success) break;
    if (unlockedAt && e.created_at <= unlockedAt) break;
    if (e.reason && COUNTED_REASONS.includes(e.reason)) n++;
  }
  return n;
}

// ─── Codes ───────────────────────────────────────────────────

/** Letters and digits that can't be confused when read aloud or off a screen (no 0/O, 1/I/L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(length: number, random: (n: number) => number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[random(CODE_ALPHABET.length)];
  return out;
}

function secureRandomInt(n: number): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] % n;
}

/** A room's sign-up code: 6 characters, e.g. "K7P4QX". */
export const newRoomCode = (random = secureRandomInt) => randomCode(6, random);

/** A personal sign-up code (teachers, absent students): 9 characters shown as "K7P-4QX-9MD". */
export const newPersonalCode = (random = secureRandomInt) => {
  const c = randomCode(9, random);
  return `${c.slice(0, 3)}-${c.slice(3, 6)}-${c.slice(6)}`;
};

/** A typed code without spaces/dashes, upper-cased; Thai digits allowed. */
export const cleanCode = (s: string) => thaiDigitsToArabic(s).replace(/[\s-]/g, "").toUpperCase();

export const isRoomCode = (s: string) => /^[A-Z0-9]{6}$/.test(s);
export const isPersonalCode = (s: string) => /^[A-Z0-9]{9}$/.test(s);

/** A 6-digit email check code. */
export const newEmailCode = (random = secureRandomInt) =>
  Array.from({ length: 6 }, () => String(random(10))).join("");

// ─── Rules ───────────────────────────────────────────────────

export const EMAIL_CODE_MINUTES = 10;
export const EMAIL_CODE_TRIES = 5;
export const EMAIL_RESEND_SECONDS = 60;
export const PERSONAL_CODE_DAYS = 14;
export const PERSONAL_CODE_TRIES = 5;
/** How long a half-finished sign-up stays valid. */
export const SIGNUP_TICKET_MINUTES = 20;

export type SlotStatus = "none" | "upcoming" | "open" | "closed";

/** Where a room's sign-up slot stands at `now`. */
export function slotStatus(slot: { startsAt: string; endsAt: string } | null, now: Date = new Date()): SlotStatus {
  if (!slot) return "none";
  const t = now.getTime();
  if (t < new Date(slot.startsAt).getTime()) return "upcoming";
  if (t >= new Date(slot.endsAt).getTime()) return "closed";
  return "open";
}

/** Thai labels for a slot's status. */
export const SLOT_LABEL: Record<SlotStatus, string> = {
  none: "ยังไม่ตั้งเวลา",
  upcoming: "รอเปิด",
  open: "เปิดอยู่",
  closed: "ปิดแล้ว",
};

/**
 * What's wrong with a sign-up slot the admin picked (date "YYYY-MM-DD", times "HH:MM", Thai time), or null.
 * A slot that has already ended is refused: its code would never work.
 */
export function slotProblem(date: string, start: string, end: string, now: number = Date.now()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return "วันหรือเวลาไม่ถูกต้อง";
  const startsAt = bangkokInputToIso(`${date}T${start}`);
  const endsAt = bangkokInputToIso(`${date}T${end}`);
  if (!startsAt || !endsAt) return "วันหรือเวลาไม่ถูกต้อง";
  if (endsAt <= startsAt) return "เวลาสิ้นสุดต้องหลังเวลาเริ่ม";
  if (new Date(endsAt).getTime() <= now) return "ช่วงเวลานี้ผ่านไปแล้ว เลือกวันหรือเวลาใหม่";
  return null;
}

/** "No subject" choice for teachers who don't teach one of the six subjects. */
export const NO_SUBJECT = "none";
