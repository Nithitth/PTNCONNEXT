import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentAcademicYear,
  generateTempPassword,
  mapSheet,
  newPasswordProblem,
  parseClassroom,
  parseClassroomList,
  serializeCell,
  STUDENT_COLUMNS,
  TEACHER_COLUMNS,
  validateStudentRow,
  validateTeacherRow,
} from "./roster";
import { CLASSROOMS, SUBJECTS, findSubject, isSchoolClassroom } from "./school";

test("classrooms", () => {
  assert.deepEqual(parseClassroom("ม.5/2"), { grade: 5, room: 2 });
  assert.deepEqual(parseClassroom("ม.5", 2), { grade: 5, room: 2 });
  assert.deepEqual(parseClassroom(5, "2"), { grade: 5, room: 2 });
  assert.deepEqual(parseClassroom("มัธยมศึกษาปีที่ 4", "๑๐"), { grade: 4, room: 10 });
  assert.equal(parseClassroom("ม.7/1"), null);
  assert.equal(parseClassroom("ม.5"), null); // no room
  assert.deepEqual(parseClassroomList("ม.5/1, ม.5/2;ม.5/1"), [
    { grade: 5, room: 1 },
    { grade: 5, room: 2 },
  ]);
  assert.equal(parseClassroomList("ม.5/1, เละ"), null);
});

test("academic year rolls over in May", () => {
  assert.equal(currentAcademicYear(new Date(2026, 10, 10)), 2569);
  assert.equal(currentAcademicYear(new Date(2027, 2, 1)), 2569);
  assert.equal(currentAcademicYear(new Date(2027, 4, 16)), 2570);
});

test("student sheet: header aliases, empty rows, per-row errors", () => {
  const data = [
    [],
    ["รหัสนักเรียน", "คำนำหน้า", "ชื่อ", "นามสกุล", "ชั้น", "ห้อง"],
    [12345, "ด.ญ.", "มีนา", "ใจดี", "ม.5", 2],
    [null, null, null, null, null, null],
    ["12346", "นาย", "", "รักเรียน", "ม.9", 1],
  ];
  const { rows, missingColumns } = mapSheet(data, STUDENT_COLUMNS);
  assert.deepEqual(missingColumns, []);
  assert.equal(rows.length, 2);

  const ok = validateStudentRow(rows[0]);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.value.loginId, "12345");
    assert.equal(ok.value.displayName, "ด.ญ.มีนา ใจดี");
    assert.deepEqual(ok.value.classroom, { grade: 5, room: 2 });
    assert.deepEqual([ok.value.prefix, ok.value.firstName, ok.value.lastName], ["ด.ญ.", "มีนา", "ใจดี"]);
    assert.equal(ok.value.rowNumber, 3);
  }

  const bad = validateStudentRow(rows[1]);
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.equal(bad.rowNumber, 5);
    assert.equal(bad.errors.length, 2); // no first name, bad grade
  }
});

test("missing required columns are reported", () => {
  const { missingColumns } = mapSheet([["เลขประจำตัว", "ชื่อ"]], STUDENT_COLUMNS);
  assert.deepEqual(missingColumns, ["นามสกุล", "ชั้น"]);
});

test("teacher rows: full name, one of the 6 subjects, only the 8 Phase 1 rooms", () => {
  const { rows } = mapSheet(
    [
      ["ชื่อ-นามสกุล", "ชื่อวิชา", "รหัสวิชา", "ห้องที่สอน"],
      ["ครูสมศรี มีสุข", "คณิตศาสตร์", "ค32101", "ม.5/1, ม.5/2"],
      ["ครูสมศรี มีสุข", "", "", ""],
      ["ครูแดง", "ดนตรี", "", "ม.4/1"],
      ["ครูแดง ใจดี", "", "ว30201", "ม.4/4, ม.6/1"],
    ],
    TEACHER_COLUMNS,
  );
  const a = validateTeacherRow(rows[0]);
  assert.ok(a.ok);
  if (a.ok) {
    assert.equal(a.value.displayName, "ครูสมศรี มีสุข");
    assert.equal(a.value.classrooms.length, 2);
    assert.equal(a.value.subject?.code, "math");
  }
  const b = validateTeacherRow(rows[1]);
  assert.ok(b.ok && b.value.subject === null);
  const c = validateTeacherRow(rows[2]);
  assert.ok(!c.ok && c.errors.length === 2); // no last name + "ดนตรี" isn't one of the 6
  const d = validateTeacherRow(rows[3]);
  assert.ok(!d.ok && d.errors.length === 1 && d.errors[0].includes("ม.6/1")); // ว30201 → science is fine; ม.6/1 isn't
});

test("subjects: names, nicknames and Thai course codes map to the 6", () => {
  assert.equal(findSubject("คณิต")?.code, "math");
  assert.equal(findSubject("PAT 1")?.code, "pat");
  assert.equal(findSubject("สังคม")?.code, "social");
  assert.equal(findSubject("", "ว32201")?.code, "science");
  assert.equal(findSubject("ฟิสิกส์")?.code, "science");
  assert.equal(findSubject("ภาษา ไทย")?.code, "thai");
  assert.equal(findSubject("English")?.code, "english");
  assert.equal(findSubject("พลศึกษา", "พ32101"), null);
  assert.equal(SUBJECTS.length, 6);
});

test("classrooms: only ม.4/1–4 and ม.5/1–4", () => {
  assert.equal(CLASSROOMS.length, 8);
  assert.ok(isSchoolClassroom({ grade: 4, room: 4 }));
  assert.ok(!isSchoolClassroom({ grade: 5, room: 5 }));
  assert.ok(!isSchoolClassroom({ grade: 6, room: 1 }));
  const { rows } = mapSheet(
    [["เลขประจำตัว", "ชื่อ", "นามสกุล", "ชั้น", "ห้อง"], [1, "ก", "ข", "ม.6", 1]],
    STUDENT_COLUMNS,
  );
  const r = validateStudentRow(rows[0]);
  assert.ok(!r.ok && r.errors[0].includes("ม.6/1"));
});

test("serializeCell keeps dates as calendar dates", () => {
  assert.equal(serializeCell(new Date(Date.UTC(2009, 4, 5))), "2009-05-05");
  assert.equal(serializeCell(null), null);
  assert.equal(serializeCell(42), 42);
});

test("user-chosen passwords", () => {
  assert.match(newPasswordProblem("short", "short") ?? "", /8/);
  assert.match(newPasswordProblem("05052009", "05052009") ?? "", /วันเกิด/);
  assert.match(newPasswordProblem("goodpass1", "goodpass2") ?? "", /ไม่ตรง/);
  assert.equal(newPasswordProblem("goodpass1", "goodpass1"), null);
  assert.match(newPasswordProblem("Password1", "Password1") ?? "", /เดาง่าย/);
  assert.match(newPasswordProblem("aaaaaaaaa", "aaaaaaaaa") ?? "", /เดาง่าย/);
  assert.match(newPasswordProblem("x90001abc", "x90001abc", "90001") ?? "", /เลขประจำตัว/);
  assert.equal(newPasswordProblem("goodpass1", "goodpass1", "90001"), null);
});

test("temp passwords use the safe alphabet", () => {
  const p = generateTempPassword();
  assert.equal(p.length, 10);
  assert.match(p, /^[a-hjkmnp-z2-9]+$/);
});
