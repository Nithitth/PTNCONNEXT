import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyLoginIdentifier,
  cleanCode,
  countedFailures,
  lockoutLimit,
  isPersonalCode,
  isRoomCode,
  maskEmail,
  nameKey,
  nameKeyFromFull,
  newEmailCode,
  newPersonalCode,
  newRoomCode,
  normalizeEmail,
  normalizePhone,
  slotProblem,
  slotStatus,
  splitFullName,
} from "./signup";

test("lockout: student IDs get 10 tries, everything else 5, whether or not the account exists", () => {
  assert.equal(lockoutLimit(classifyLoginIdentifier("90001")), 10);
  assert.equal(lockoutLimit(classifyLoginIdentifier("nobody@example.com")), 5);
  assert.equal(lockoutLimit(classifyLoginIdentifier("081-234-5678")), 5);
  assert.equal(lockoutLimit(classifyLoginIdentifier("teacher.test")), 5);
});

test("lockout: counts wrong passwords since the last success or unlock", () => {
  const at = (m: number) => new Date(Date.UTC(2026, 10, 17, 3, m)).toISOString();
  const wrong = (m: number) => ({ success: false, reason: "wrong-password", created_at: at(m) });
  const events = [wrong(9), wrong(8), { success: false, reason: "wrong-tab", created_at: at(7) }, wrong(6), { success: true, reason: null, created_at: at(5) }, wrong(4)];
  assert.equal(countedFailures(events), 3);
  assert.equal(countedFailures(events, at(8)), 1);
  assert.equal(countedFailures([]), 0);
});

test("names match whatever title, spacing or zero-width characters are typed", () => {
  const key = nameKey("สมชาย", "ใจดี");
  assert.equal(nameKey("ด.ช. สมชาย", "ใจดี"), key);
  assert.equal(nameKey("  เด็กชายสมชาย ", " ใจดี  "), key);
  assert.equal(nameKey("สม​ชาย", "ใจดี"), key);
  assert.equal(nameKeyFromFull("นาย สมชาย  ใจดี"), key);
  assert.notEqual(nameKey("สมชาย", "ใจร้าย"), key);
  assert.equal(nameKey("Anna", "Smith"), nameKey("anna", "SMITH"));
});

test("a teacher's full name splits into title, first and last name", () => {
  assert.deepEqual(splitFullName("นางสาวสมศรี  รักเรียน"), { prefix: "นางสาว", first: "สมศรี", last: "รักเรียน" });
  assert.deepEqual(splitFullName("สมศรี รัก เรียน"), { prefix: "", first: "สมศรี", last: "รัก เรียน" });
});

test("phone numbers and emails", () => {
  assert.equal(normalizePhone("081-234-5678"), "0812345678");
  assert.equal(normalizePhone("+66 81 234 5678"), "0812345678");
  assert.equal(normalizePhone("๐๘๑๒๓๔๕๖๗๘"), "0812345678");
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizeEmail(" Som@Gmail.com "), "som@gmail.com");
  assert.equal(normalizeEmail("not-an-email"), null);
  assert.equal(maskEmail("somchai@gmail.com"), "som***@gmail.com");
});

test("the log-in box tells email, phone and ID apart", () => {
  assert.deepEqual(classifyLoginIdentifier("Som@Gmail.com"), { kind: "email", value: "som@gmail.com" });
  assert.deepEqual(classifyLoginIdentifier("081 234 5678"), { kind: "phone", value: "0812345678" });
  assert.deepEqual(classifyLoginIdentifier("๙๐๐๐๑"), { kind: "id", value: "90001" });
  assert.deepEqual(classifyLoginIdentifier("Admin.Test"), { kind: "id", value: "admin.test" });
});

test("codes use unambiguous characters and clean up when typed", () => {
  const room = newRoomCode();
  assert.ok(isRoomCode(room) && !/[01OIL]/.test(room), room);
  const personal = newPersonalCode();
  assert.match(personal, /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/);
  assert.ok(isPersonalCode(cleanCode(personal.toLowerCase())));
  assert.match(newEmailCode(), /^\d{6}$/);
  assert.equal(cleanCode(" k7p 4qx "), "K7P4QX");
});

test("a room's slot is upcoming, open, then closed", () => {
  const slot = { startsAt: "2026-11-17T08:30:00+07:00", endsAt: "2026-11-17T09:00:00+07:00" };
  assert.equal(slotStatus(null), "none");
  assert.equal(slotStatus(slot, new Date("2026-11-17T08:29:59+07:00")), "upcoming");
  assert.equal(slotStatus(slot, new Date("2026-11-17T08:30:00+07:00")), "open");
  assert.equal(slotStatus(slot, new Date("2026-11-17T08:59:59+07:00")), "open");
  assert.equal(slotStatus(slot, new Date("2026-11-17T09:00:00+07:00")), "closed");
});

test("a new sign-up slot needs real times, an end after the start, and must not be over already", () => {
  const now = new Date("2026-11-17T10:00:00+07:00").getTime();
  assert.equal(slotProblem("2026-11-18", "08:30", "09:00", now), null);
  assert.equal(slotProblem("2026-11-17", "09:30", "10:30", now), null); // open right now
  assert.equal(slotProblem("2026-11-17", "08:30", "09:00", now), "ช่วงเวลานี้ผ่านไปแล้ว เลือกวันหรือเวลาใหม่");
  assert.equal(slotProblem("2026-11-18", "09:00", "09:00", now), "เวลาสิ้นสุดต้องหลังเวลาเริ่ม");
  assert.equal(slotProblem("2026-11-18", "10:00", "09:00", now), "เวลาสิ้นสุดต้องหลังเวลาเริ่ม");
  assert.equal(slotProblem("2026-02-30", "08:30", "09:00", now), "วันหรือเวลาไม่ถูกต้อง");
  assert.equal(slotProblem("18/11/2026", "08:30", "09:00", now), "วันหรือเวลาไม่ถูกต้อง");
  assert.equal(slotProblem("2026-11-18", "8:30", "09:00", now), "วันหรือเวลาไม่ถูกต้อง");
});
