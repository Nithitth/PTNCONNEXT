import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentAcademicYear,
  generateTempPassword,
  loginIdToEmail,
  mapSheet,
  newPasswordProblem,
  parseBirthdate,
  parseClassroom,
  parseClassroomList,
  serializeCell,
  STUDENT_COLUMNS,
  TEACHER_COLUMNS,
  validateStudentRow,
  validateTeacherRow,
} from "./roster";
import { CLASSROOMS, SUBJECTS, findSubject, isSchoolClassroom } from "./school";

const NOW = new Date("2026-11-10T00:00:00Z");
const pw = (v: Parameters<typeof parseBirthdate>[0]) => {
  const r = parseBirthdate(v, NOW);
  return r.ok ? r.password : `ERR:${r.error}`;
};

test("birthdate → DDMMYYYY password (Gregorian year)", () => {
  assert.equal(pw("05/05/2552"), "05052009"); // พ.ศ. with slashes
  assert.equal(pw("5/5/2009"), "05052009");
  assert.equal(pw("2009-05-05"), "05052009");
  assert.equal(pw("05052009"), "05052009");
  assert.equal(pw("05052552"), "05052009");
  assert.equal(pw(5052009), "05052009"); // leading zero lost in Excel
  assert.equal(pw("๐๕/๐๕/๒๕๕๒"), "05052009"); // Thai digits
  assert.equal(pw("5 พฤษภาคม 2552"), "05052009");
  assert.equal(pw("5 พ.ค. 2552"), "05052009");
  assert.equal(pw(new Date(Date.UTC(2009, 4, 5))), "05052009");
  assert.equal(pw(39938), "05052009"); // Excel serial number for 5 May 2009
});

test("bad birthdates are rejected", () => {
  assert.match(pw("31/02/2009"), /^ERR/);
  assert.match(pw(""), /^ERR/);
  assert.match(pw(null), /^ERR/);
  assert.match(pw("hello"), /^ERR/);
  assert.match(pw("01/01/2030"), /^ERR/); // future
  assert.match(pw("01/01/1900"), /^ERR/);
});

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

test("login id → hidden email", () => {
  assert.equal(loginIdToEmail(" 12345 "), "12345@ptn-connext.local");
  assert.equal(loginIdToEmail("Somsri.K"), "somsri.k@ptn-connext.local");
});

test("student sheet: header aliases, empty rows, per-row errors", () => {
  const data = [
    [],
    ["รหัสนักเรียน", "คำนำหน้า", "ชื่อ", "นามสกุล", "ชั้น", "ห้อง", "วันเกิด"],
    [12345, "ด.ญ.", "มีนา", "ใจดี", "ม.5", 2, "05/05/2552"],
    [null, null, null, null, null, null, null],
    ["12346", "นาย", "", "รักเรียน", "ม.9", 1, "31/02/2552"],
  ];
  const { rows, missingColumns } = mapSheet(data, STUDENT_COLUMNS);
  assert.deepEqual(missingColumns, []);
  assert.equal(rows.length, 2);

  const ok = validateStudentRow(rows[0], NOW);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.value.loginId, "12345");
    assert.equal(ok.value.displayName, "ด.ญ.มีนา ใจดี");
    assert.deepEqual(ok.value.classroom, { grade: 5, room: 2 });
    assert.equal(ok.value.password, "05052009");
    assert.equal(ok.value.rowNumber, 3);
  }

  const bad = validateStudentRow(rows[1], NOW);
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.equal(bad.rowNumber, 5);
    assert.equal(bad.errors.length, 3); // no first name, bad grade, bad date
  }
});

test("missing required columns are reported", () => {
  const { missingColumns } = mapSheet([["เลขประจำตัว", "ชื่อ"]], STUDENT_COLUMNS);
  assert.deepEqual(missingColumns, ["นามสกุล", "ชั้น", "วันเกิด"]);
});

test("teacher rows: one of the 6 subjects, only the 8 Phase 1 rooms", () => {
  const { rows } = mapSheet(
    [
      ["ชื่อผู้ใช้", "ชื่อ-นามสกุล", "วันเกิด", "ชื่อวิชา", "รหัสวิชา", "ห้องที่สอน"],
      ["somsri", "ครูสมศรี มีสุข", "12/03/2523", "คณิตศาสตร์", "ค32101", "ม.5/1, ม.5/2"],
      ["somsri", "ครูสมศรี มีสุข", "12/03/2523", "", "", ""],
      ["ครูแดง", "ครูแดง", "12/03/2523", "ดนตรี", "", "ม.4/1"],
      ["daeng", "ครูแดง", "12/03/2523", "", "ว30201", "ม.4/4, ม.6/1"],
    ],
    TEACHER_COLUMNS,
  );
  const a = validateTeacherRow(rows[0], NOW);
  assert.ok(a.ok);
  if (a.ok) {
    assert.equal(a.value.password, "12031980");
    assert.equal(a.value.classrooms.length, 2);
    assert.equal(a.value.subject?.code, "math");
  }
  const b = validateTeacherRow(rows[1], NOW);
  assert.ok(b.ok && b.value.subject === null);
  const c = validateTeacherRow(rows[2], NOW);
  assert.ok(!c.ok && c.errors.length === 2); // Thai username + "ดนตรี" isn't one of the 6
  const d = validateTeacherRow(rows[3], NOW);
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
    [["เลขประจำตัว", "ชื่อ", "นามสกุล", "ชั้น", "ห้อง", "วันเกิด"], [1, "ก", "ข", "ม.6", 1, "05/05/2552"]],
    STUDENT_COLUMNS,
  );
  const r = validateStudentRow(rows[0], NOW);
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
});

test("temp passwords use the safe alphabet", () => {
  const p = generateTempPassword();
  assert.equal(p.length, 10);
  assert.match(p, /^[a-hjkmnp-z2-9]+$/);
});
