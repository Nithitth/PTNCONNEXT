import assert from "node:assert/strict";
import { test } from "node:test";
import { alertItems, buildMenu, type MenuCounts } from "./adminMenu";

const ZERO: MenuCounts = {
  students: 0,
  staff: 0,
  studentsRegistered: 0,
  studentsTotal: 0,
  teachersRegistered: 0,
  teachersTotal: 0,
  openRooms: 0,
  signupsToday: 0,
  templatesWaiting: 0,
  posts: 0,
  files: 0,
  newFeedback: 0,
  errors24: 0,
  failedLogins24: 0,
  lockedToday: 0,
  schoolDrive: "off",
  schoolDriveName: null,
};
const boxes = (c: MenuCounts) => buildMenu(c).flatMap((g) => g.boxes);
const find = (c: MenuCounts, href: string) => boxes(c).find((b) => b.href === href)!;

test("buildMenu groups by who it's about, with the three big boxes", () => {
  const menu = buildMenu(ZERO);
  assert.deepEqual(
    menu.map((g) => g.title),
    ["นักเรียน", "ครู", "ระบบ", "รายงาน"],
  );
  assert.deepEqual(
    boxes(ZERO)
      .filter((b) => b.big)
      .map((b) => b.label),
    ["ห้องเรียน & QR", "ผู้ใช้", "นำเข้ารายชื่อ", "รายงาน & OKR"],
  );
  // Every admin page is reachable exactly once.
  const hrefs = boxes(ZERO).map((b) => b.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.equal(hrefs.length, 14);
});

test("buildMenu shows no badges when nothing needs a look", () => {
  assert.deepEqual(
    boxes(ZERO).filter((b) => b.badge),
    [],
  );
  assert.equal(find(ZERO, "/admin/access/rooms").stat, "ยังไม่มีรายชื่อ");
});

test("buildMenu puts each number on its own box", () => {
  const c = {
    ...ZERO,
    students: 240,
    staff: 18,
    studentsRegistered: 30,
    studentsTotal: 320,
    openRooms: 2,
    newFeedback: 3,
    errors24: 1,
    failedLogins24: 4,
    templatesWaiting: 5,
    posts: 56,
    files: 12,
  };
  assert.equal(find(c, "/admin/users").stat, "240 นักเรียน · 18 ครูและผู้ดูแล");
  assert.equal(find(c, "/admin/access/rooms").stat, "ลงทะเบียนแล้ว 30/320 คน");
  assert.equal(find(c, "/admin/access/rooms").badge, "เปิดอยู่ 2 ห้อง");
  assert.equal(find(c, "/admin/feedback").badge, "ใหม่ 3");
  assert.equal(find(c, "/admin/errors").badge, "1 ใน 24 ชม.");
  assert.equal(find(c, "/admin/access/history").badge, "ไม่สำเร็จ 4");
  assert.equal(find(c, "/admin/roadmap").badge, "รอตรวจ 5");
  assert.equal(find(c, "/admin/limits").stat, "โพสต์ 56 · ไฟล์ 12");
  assert.equal(find(c, "/admin/access/rooms").action?.href, "/admin/access/rooms#generate");
});

test("alertItems lists only what needs a look", () => {
  assert.deepEqual(alertItems(ZERO), []);
  assert.deepEqual(
    alertItems({ ...ZERO, errors24: 2, lockedToday: 1 }).map((a) => [a.href, a.count]),
    [
      ["/admin/errors", 2],
      ["/admin/access/history", 1],
    ],
  );
});

test("the school drive box and alert follow its state", () => {
  const box = (c: MenuCounts) => boxes(c).find((b) => b.href === "/admin/drive")!;
  assert.equal(box(ZERO).stat, "ยังไม่ได้เชื่อมต่อ");
  assert.equal(box({ ...ZERO, schoolDrive: "on", schoolDriveName: "PTN Connext" }).stat, "เชื่อมต่อแล้ว · PTN Connext");
  assert.equal(box({ ...ZERO, schoolDrive: "broken" }).badge, "หลุดการเชื่อมต่อ");
  assert.deepEqual(alertItems(ZERO), []);
  assert.deepEqual(
    alertItems({ ...ZERO, schoolDrive: "broken" }).map((a) => a.href),
    ["/admin/drive"],
  );
});
