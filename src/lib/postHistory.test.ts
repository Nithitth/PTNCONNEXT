import { test } from "node:test";
import assert from "node:assert/strict";
import { describeChange, postDiff, type PostSnapshot } from "./postHistory";
import { FEATURES, isFeatureKey } from "./features";

const base: PostSnapshot = {
  title: "ใบงาน 1",
  description: null,
  subject_id: "s-math",
  exam_kind: "quiz",
  content_order: null,
  targets: [
    { classroom_id: "r1", due_at: "2026-12-03T16:59:00.000Z" },
    { classroom_id: "r2", due_at: "2026-12-03T16:59:00.000Z" },
  ],
  file: "a.pdf",
};

test("postDiff: nothing changed", () => {
  assert.deepEqual(postDiff(base, { ...base, targets: [...base.targets].reverse() }), []);
  // The same moment written differently is not a change.
  assert.deepEqual(postDiff(base, { ...base, targets: base.targets.map((t) => ({ ...t, due_at: "2026-12-03T23:59:00+07:00" })) }), []);
});

test("postDiff: due date moved, room added and removed, title and file", () => {
  const after: PostSnapshot = {
    ...base,
    title: "ใบงาน 1 (แก้)",
    file: "b.pdf",
    targets: [
      { classroom_id: "r1", due_at: "2026-12-05T16:59:00.000Z" },
      { classroom_id: "r3", due_at: null },
    ],
  };
  const d = postDiff(base, after);
  assert.deepEqual(d.map((c) => c.field).sort(), ["due", "file", "room_added", "room_removed", "title"]);
  const due = d.find((c) => c.field === "due");
  assert.ok(due && due.field === "due" && due.room === "r1" && due.to === "2026-12-05T16:59:00.000Z");
});

test("describeChange: readable Thai", () => {
  const n = { room: (id: string | null) => (id ? `ห้อง-${id}` : "ทั้งโรงเรียน"), subject: () => "คณิตศาสตร์", time: (iso: string | null) => iso ?? "—" };
  assert.equal(describeChange({ field: "due", room: "r1", from: "A", to: "B" }, n), "ห้อง-r1: วันที่ A → B");
  assert.equal(describeChange({ field: "room_removed", room: null, due: null }, n), "เอา ทั้งโรงเรียน ออก");
  assert.equal(describeChange({ field: "exam_kind", from: "quiz", to: "major" }, n), "ประเภทการสอบ: สอบย่อย → สอบกลางภาค/ปลายภาค");
});

test("features: unique keys the database accepts", () => {
  const keys = FEATURES.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.match(k, /^[a-z_]{2,40}$/); // same check as usage_daily.feature
  assert.ok(isFeatureKey("calendar"));
  assert.ok(!isFeatureKey("nope"));
});

// ─── "ใครเปิดดูแล้ว" (seen.ts) ───
import { seenByRoom, seenLabel } from "./seen";

test("seenByRoom: per room, not-seen by name, opened earliest first", () => {
  const students = [
    { id: "a", name: "สมชาย", classroomId: "r1" },
    { id: "b", name: "กมล", classroomId: "r1" },
    { id: "c", name: "ณัฐ", classroomId: "r1" },
    { id: "d", name: "ดารา", classroomId: "r2" },
  ];
  const views = [
    { userId: "c", first: "2026-11-19T03:00:00Z", fileFirst: null },
    { userId: "a", first: "2026-11-19T01:00:00Z", fileFirst: "2026-11-19T01:05:00Z" },
    { userId: "d", first: "2026-11-19T02:00:00Z", fileFirst: null },
  ];
  const [r1, school] = seenByRoom(
    [
      { id: "r1", label: "ม.4/1" },
      { id: null, label: "ทั้งโรงเรียน" },
    ],
    students,
    views,
  );
  assert.equal(r1.total, 3);
  assert.equal(r1.seen, 2);
  assert.deepEqual(
    r1.notSeen.map((s) => s.id),
    ["b"],
  );
  assert.deepEqual(
    r1.opened.map((s) => s.id),
    ["a", "c"],
  );
  assert.equal(r1.opened[0].fileFirst, "2026-11-19T01:05:00Z");
  assert.equal(school.total, 4);
  assert.equal(school.seen, 3);
  assert.equal(seenLabel(28, 40), "เปิดดูแล้ว 28/40");
});
