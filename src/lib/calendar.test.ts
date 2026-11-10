import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bangkokInputToIso,
  dayKey,
  formatDayLong,
  formatMonth,
  formatTime,
  isDueSoon,
  isoToBangkokInput,
  monthGrid,
  parseMonth,
  placeItems,
  shiftMonth,
  sortMaterials,
  upcoming,
  type CalendarItem,
} from "./calendar";
import { cleanUrl, fileProblem, validatePost, type PostInput } from "./postForm";

const item = (over: Partial<CalendarItem>): CalendarItem => ({
  key: over.key ?? Math.random().toString(36),
  type: "assignment",
  examKind: "quiz",
  title: "งาน",
  description: "",
  subject: null,
  dueAt: null,
  endsAt: null,
  room: null,
  contentOrder: 0,
  createdAt: "2026-11-01T00:00:00Z",
  attachments: [],
  ...over,
});

test("Thai time: a 23:30 deadline stays on its own day", () => {
  const iso = bangkokInputToIso("2026-11-12T23:30")!;
  assert.equal(iso, "2026-11-12T16:30:00.000Z");
  assert.equal(dayKey(iso), "2026-11-12");
  assert.equal(dayKey("2026-11-12T17:00:00Z"), "2026-11-13"); // 00:00 next day in Bangkok
  assert.equal(isoToBangkokInput(iso), "2026-11-12T23:30");
  assert.equal(isoToBangkokInput(iso, false), "2026-11-12");
});

test("date boxes: rejects impossible dates", () => {
  assert.equal(bangkokInputToIso("2026-02-30"), null);
  assert.equal(bangkokInputToIso("hello"), null);
  assert.equal(bangkokInputToIso("2026-11-12"), "2026-11-11T17:00:00.000Z");
});

test("month param and grid", () => {
  const now = new Date("2026-11-30T18:00:00Z"); // already 1 Dec in Bangkok
  assert.deepEqual(parseMonth(undefined, now), { year: 2026, month: 12 });
  assert.deepEqual(parseMonth("2027-01", now), { year: 2027, month: 1 });
  assert.deepEqual(parseMonth("2027-13", now), { year: 2026, month: 12 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });

  const grid = monthGrid({ year: 2026, month: 11 }); // 1 Nov 2026 is a Sunday
  assert.equal(grid.length, 42);
  assert.equal(grid[0], "2026-11-01");
  const dec = monthGrid({ year: 2026, month: 12 }); // 1 Dec 2026 is a Tuesday
  assert.equal(dec[0], "2026-11-29");
});

test("Thai labels use the Buddhist year", () => {
  assert.equal(formatMonth({ year: 2026, month: 11 }), "พฤศจิกายน 2569");
  assert.match(formatDayLong("2026-11-12"), /12 พฤศจิกายน 2569/);
  assert.equal(formatTime("2026-11-12T09:30:00Z"), "16:30 น.");
});

test("placeItems: deadlines, exam lead-up and multi-day events", () => {
  const days = monthGrid({ year: 2026, month: 11 });
  const hw = item({ type: "assignment", dueAt: bangkokInputToIso("2026-11-12T16:30") });
  const exam = item({ type: "exam", dueAt: bangkokInputToIso("2026-11-20") }); // quiz: 3 days before
  const final = item({ type: "exam", examKind: "major", dueAt: bangkokInputToIso("2026-11-30") }); // 5 days before
  const event = item({
    type: "event",
    dueAt: bangkokInputToIso("2026-11-25"),
    endsAt: bangkokInputToIso("2026-11-27"),
  });
  const material = item({ type: "material" });
  const map = placeItems([hw, exam, final, event, material], days);

  assert.deepEqual(map.get("2026-11-12")!.due, [hw]);
  assert.deepEqual(map.get("2026-11-20")!.exams, [exam]);
  assert.deepEqual(map.get("2026-11-17")!.leadUp.map((l) => l.daysLeft), [3]);
  assert.deepEqual(map.get("2026-11-19")!.leadUp.map((l) => l.daysLeft), [1]);
  assert.equal(map.get("2026-11-16")!.leadUp.length, 0);
  // Midterm/final: 5 highlighted days (25–29), not 6.
  assert.deepEqual(map.get("2026-11-25")!.leadUp.map((l) => l.daysLeft), [5]);
  assert.equal(map.get("2026-11-24")!.leadUp.length, 0);
  assert.equal(map.get("2026-11-26")!.events.length, 1);
  assert.equal(map.get("2026-11-28")!.events.length, 0);
});

test("blink only within 24 hours, never after the deadline", () => {
  const now = new Date("2026-11-12T00:00:00Z");
  assert.equal(isDueSoon("2026-11-12T23:00:00Z", now), true);
  assert.equal(isDueSoon("2026-11-13T01:00:00Z", now), false);
  assert.equal(isDueSoon("2026-11-11T23:00:00Z", now), false);
});

test("upcoming: future work and exams, soonest first", () => {
  const now = new Date("2026-11-12T05:00:00Z"); // 12:00 in Bangkok
  const late = item({ key: "late", dueAt: "2026-11-12T03:00:00Z" });
  const soon = item({ key: "soon", dueAt: "2026-11-13T03:00:00Z" });
  const examToday = item({ key: "exam", type: "exam", dueAt: bangkokInputToIso("2026-11-12") });
  const far = item({ key: "far", dueAt: "2026-12-30T03:00:00Z" });
  assert.deepEqual(upcoming([soon, late, far, examToday], now).map((i) => i.key), ["exam", "soon"]);
});

test("materials sort by subject, name or content order", () => {
  const a = item({ key: "a", title: "ข", subject: { code: "1", name: "ฟิสิกส์", color: "" }, contentOrder: 2 });
  const b = item({ key: "b", title: "ก", subject: { code: "2", name: "คณิตศาสตร์", color: "" }, contentOrder: 3 });
  const c = item({ key: "c", title: "ค", subject: { code: "2", name: "คณิตศาสตร์", color: "" }, contentOrder: 1 });
  assert.deepEqual(sortMaterials([a, b, c], "subject").map((i) => i.key), ["c", "b", "a"]);
  assert.deepEqual(sortMaterials([a, b, c], "name").map((i) => i.key), ["b", "a", "c"]);
  assert.deepEqual(sortMaterials([a, b, c], "order").map((i) => i.key), ["c", "a", "b"]);
});

// ─── Teacher's Console rules ─────────────────────────────────

const base: PostInput = {
  kind: "assignment",
  subjectId: "math",
  title: "  แบบฝึกหัด  บทที่ 3 ",
  description: "",
  contentOrder: "",
  examKind: "quiz",
  targets: [
    { classroomId: "r1", due: "2026-11-12T16:30" },
    { classroomId: "r2", due: "2026-11-13T08:00" },
  ],
  attachment: { mode: "none" },
};

test("assignment: one deadline per classroom", () => {
  const r = validatePost(base);
  assert.ok(r.ok);
  assert.equal(r.value.title, "แบบฝึกหัด บทที่ 3");
  assert.deepEqual(
    r.value.targets.map((t) => t.due_at),
    ["2026-11-12T09:30:00.000Z", "2026-11-13T01:00:00.000Z"],
  );
});

test("assignment: refuses missing times, no rooms, duplicate rooms", () => {
  assert.equal(validatePost({ ...base, targets: [{ classroomId: "r1", due: "2026-11-12" }] }).ok, false);
  assert.equal(validatePost({ ...base, targets: [] }).ok, false);
  assert.equal(
    validatePost({ ...base, targets: [base.targets[0], base.targets[0]] }).ok,
    false,
  );
  assert.equal(validatePost({ ...base, subjectId: null }).ok, false);
  assert.equal(validatePost({ ...base, title: "   " }).ok, false);
});

test("material needs a file or link; exam lead days follow the kind; event end after start", () => {
  const material: PostInput = { ...base, kind: "material", targets: [{ classroomId: "r1", due: "" }] };
  assert.equal(validatePost(material).ok, false);
  const withLink = validatePost({ ...material, attachment: { mode: "link", url: "drive.google.com/x" } });
  assert.ok(withLink.ok);
  assert.deepEqual(withLink.value.attachment, { mode: "link", url: "https://drive.google.com/x" });

  const exam: PostInput = { ...base, kind: "exam", targets: [{ classroomId: "r1", due: "2026-12-01" }] };
  const e = validatePost(exam);
  assert.ok(e.ok);
  assert.equal(e.value.exam_kind, "quiz");
  assert.equal(e.value.targets[0].lead_days, 3);
  const major = validatePost({ ...exam, examKind: "major" });
  assert.ok(major.ok && major.value.exam_kind === "major" && major.value.targets[0].lead_days === 5);
  assert.equal(validatePost({ ...exam, examKind: "big" as never }).ok, false);
  // Non-exams always save as "quiz" (the column's default), whatever the form sent.
  const hw = validatePost({ ...base, examKind: "major" });
  assert.ok(hw.ok && hw.value.exam_kind === "quiz");

  const event: PostInput = {
    ...base,
    kind: "event",
    subjectId: null,
    targets: [{ classroomId: null, due: "2026-12-05", end: "2026-12-04" }],
  };
  assert.equal(validatePost(event).ok, false);
  const okEvent = validatePost({ ...event, targets: [{ classroomId: null, due: "2026-12-05", end: "2026-12-06" }] });
  assert.ok(okEvent.ok);
  assert.equal(okEvent.value.subject_id, null);
});

test("links and files: only http(s), only PDFs up to 10 MB", () => {
  assert.equal(cleanUrl("javascript:alert(1)"), null);
  assert.equal(cleanUrl("ftp://x.com/a"), null);
  assert.equal(cleanUrl("localhost"), null);
  assert.equal(cleanUrl("https://www.canva.com/design/abc"), "https://www.canva.com/design/abc");
  assert.equal(fileProblem({ name: "slides.pdf", size: 1000, type: "application/pdf" }), null);
  assert.ok(fileProblem({ name: "slides.pptx", size: 1000 }));
  assert.ok(fileProblem({ name: "big.pdf", size: 10 * 1024 * 1024 + 1 }));
});
