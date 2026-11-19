import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_LIVE, ago, alerts, defaultRadar, feedText } from "./warroom";
import { linePath, niceMax, polygon, radarPoints } from "./chart";

test("feedText: anonymous Thai lines", () => {
  assert.deepEqual(feedText({ kind: "post", at: "", type: "assignment", subject: "math", grade: 5, room: 2 }), {
    where: "ม.5/2",
    what: "ครูมอบหมายงาน · คณิตศาสตร์",
  });
  assert.deepEqual(feedText({ kind: "post", at: "", type: "event", subject: null, grade: null, room: null }), { where: "ทั้งโรงเรียน", what: "ครูประกาศกิจกรรม" });
  assert.equal(feedText({ kind: "signup", at: "", role: "student", grade: 4, room: 1 }).what, "นักเรียนลงทะเบียนใหม่");
  assert.deepEqual(feedText({ kind: "visit", at: "", feature: "calendar", role: "student", grade: 4, room: 3 }), {
    where: "ม.4/3",
    what: "นักเรียนเปิดปฏิทินอัจฉริยะ",
  });
  assert.equal(feedText({ kind: "visit", at: "", feature: "teacher", role: "teacher", grade: null, room: null }).where, "ครูและผู้ดูแล");
});

test("ago: minutes, hours, days", () => {
  const now = new Date("2026-11-19T12:00:00Z");
  assert.equal(ago("2026-11-19T11:59:30Z", now), "เมื่อสักครู่");
  assert.equal(ago("2026-11-19T11:55:00Z", now), "5 นาทีที่แล้ว");
  assert.equal(ago("2026-11-19T09:00:00Z", now), "3 ชม.ที่แล้ว");
  assert.equal(ago("2026-11-16T12:00:00Z", now), "3 วันที่แล้ว");
});

test("alerts: calm says so; problems come first", () => {
  assert.deepEqual(alerts({ okrs: [], live: EMPTY_LIVE, clashes: 0, storageUse: 0.1, lockouts: 0 }), [{ tone: "info", text: "ทุกอย่างปกติ" }]);
  const a = alerts({ okrs: [], live: { ...EMPTY_LIVE, errors_today: 2 }, clashes: 1, storageUse: 0.85, lockouts: 0, schoolDriveBroken: true });
  assert.deepEqual(
    a.map((x) => x.tone),
    ["danger", "danger", "warning", "warning"],
  );
});

test("defaultRadar: best and weakest room", () => {
  const row = (id: string, v: number | null) => ({
    classroomId: id,
    label: id,
    students: 10,
    values: { signedUp: v, active: v, weekly: null, seen: null, target: null, roadmap: null },
  });
  const r = defaultRadar([row("a", 50), row("b", 90), row("c", 10), row("d", null)]);
  assert.deepEqual(r.ids, ["b", "c"]);
  assert.equal(r.avg.signedUp, 50);
});

test("chart helpers", () => {
  assert.equal(niceMax(73), 100);
  assert.equal(niceMax(0.3), 0.5);
  assert.equal(niceMax(0), 1);
  assert.equal(linePath([null, null], 10, 10), "");
  assert.equal(linePath([0, 10], 10, 10, { pad: 0 }), "M0.0 10.0L10.0 0.0");
  assert.equal(linePath([5, null, 5], 10, 10, { pad: 0, max: 10 }), "M0.0 5.0M10.0 5.0");
  const top = radarPoints([100, 0, 0, 0], 10, 50, 50)[0];
  assert.ok(Math.abs(top.x - 50) < 1e-9 && Math.abs(top.y - 40) < 1e-9);
  assert.equal(polygon([{ x: 1, y: 2 }]), "1.0,2.0");
});
