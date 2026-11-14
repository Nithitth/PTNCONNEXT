import { test } from "node:test";
import assert from "node:assert/strict";
import { EXPIRY_WARN_DAYS, MAX_FILE_BYTES, MAX_PICK_BYTES, daysLeft, expiryLabel, fileProblem, pickProblem } from "./postForm";

const MB = 1024 * 1024;

test("pickProblem allows PDFs up to 50 MB, fileProblem stores up to 10 MB", () => {
  assert.equal(pickProblem({ name: "slides.pdf", size: 30 * MB, type: "application/pdf" }), null);
  assert.equal(pickProblem({ name: "slides.pdf", size: MAX_PICK_BYTES }), null);
  assert.match(pickProblem({ name: "slides.pdf", size: MAX_PICK_BYTES + 1 })!, /50 MB/);
  assert.match(fileProblem({ name: "slides.pdf", size: MAX_FILE_BYTES + 1 })!, /10 MB/);
  assert.equal(fileProblem({ name: "slides.pdf", size: MAX_FILE_BYTES }), null);
});

test("pickProblem rejects non-PDFs and empty files", () => {
  assert.match(pickProblem({ name: "notes.docx", size: MB, type: "application/msword" })!, /PDF/);
  assert.match(pickProblem({ name: "x.pdf", size: 0 })!, /ว่างเปล่า/);
  assert.equal(pickProblem({ name: "SCAN.PDF", size: MB }), null); // extension is enough
});

test("daysLeft counts Thai-time days", () => {
  const now = new Date("2026-11-13T03:00:00Z"); // 10:00 Bangkok
  assert.equal(daysLeft(null, now), null);
  assert.equal(daysLeft("2026-11-13T10:00:00Z", now), 0); // 17:00 Bangkok today
  assert.equal(daysLeft("2026-11-13T18:00:00Z", now), 1); // 01:00 Bangkok tomorrow
  assert.equal(daysLeft("2026-12-28T03:00:00Z", now), 45);
  assert.equal(daysLeft("2026-11-13T02:59:59Z", now), -1); // already passed
});

test("expiryLabel texts and warning window", () => {
  const now = new Date("2026-11-13T03:00:00Z");
  assert.equal(expiryLabel(null, now), null);
  assert.deepEqual(expiryLabel("2026-12-28T03:00:00Z", now), { text: "ดาวน์โหลดได้อีก 45 วัน", soon: false, expired: false });
  const warn = new Date(now.getTime() + EXPIRY_WARN_DAYS * 86400000).toISOString();
  assert.equal(expiryLabel(warn, now)!.soon, true);
  assert.deepEqual(expiryLabel("2026-11-13T10:00:00Z", now), { text: "ดาวน์โหลดได้ถึงวันนี้", soon: true, expired: false });
  assert.deepEqual(expiryLabel("2026-11-01T00:00:00Z", now), { text: "ไฟล์หมดอายุแล้ว", soon: true, expired: true });
});
