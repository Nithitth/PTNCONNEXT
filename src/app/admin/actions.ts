"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireProfile } from "@/lib/auth";
import { logAudit, logError } from "@/lib/logs";
import {
  currentAcademicYear,
  generateTempPassword,
  validateStudentRow,
  validateTeacherRow,
  type ClassroomRef,
  type RawRow,
  type STUDENT_COLUMNS,
  type TEACHER_COLUMNS,
} from "@/lib/roster";
import { nameKey, nameKeyFromFull, splitFullName } from "@/lib/signup";
import { createAdminClient } from "@/lib/supabase/admin";

type StudentKey = (typeof STUDENT_COLUMNS)[number]["key"];
type TeacherKey = (typeof TEACHER_COLUMNS)[number]["key"];
type SerializedRow<K extends string> = { rowNumber: number; cells: Partial<Record<K, string | number | null>> };

export type ImportRowResult = {
  rowNumber: number;
  loginId: string;
  status: "created" | "updated" | "error";
  message?: string;
};

const MAX_ROWS_PER_CALL = 100;

/** Finds or creates the classroom for this school year; caches ids within one call. */
function classroomResolver(admin: SupabaseClient) {
  const year = currentAcademicYear();
  const cache = new Map<string, string>();
  return async (c: ClassroomRef): Promise<string> => {
    const key = `${c.grade}/${c.room}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const { data, error } = await admin
      .from("classrooms")
      .upsert({ grade: c.grade, room: c.room, academic_year: year }, { onConflict: "grade,room,academic_year" })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("classroom upsert failed");
    cache.set(key, data.id);
    return data.id;
  };
}

async function existingProfiles(admin: SupabaseClient, loginIds: string[]) {
  if (loginIds.length === 0) return new Map<string, { id: string; role: string }>();
  const { data, error } = await admin.from("profiles").select("id, login_id, role").in("login_id", loginIds);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.login_id as string, { id: p.id as string, role: p.role as string }]));
}

/**
 * Pre-registers students (no login is created): they sign up themselves with their room's QR code.
 * Re-importing updates names and rooms. A student who already has an account keeps it, and their
 * pre-registration is marked as registered.
 */
export async function importStudents(rows: SerializedRow<StudentKey>[]): Promise<ImportRowResult[]> {
  const me = await requireProfile({ roles: ["admin"] });
  if (rows.length > MAX_ROWS_PER_CALL) throw new Error("too many rows");

  try {
    const admin = createAdminClient();
    const classroomId = classroomResolver(admin);
    // Validate again on the server — never trust what the browser sent.
    const checked = rows.map((r) => validateStudentRow(r as RawRow<StudentKey>));
    const ids = checked.flatMap((c) => (c.ok ? [c.value.loginId] : []));
    const [existing, { data: known, error: knownError }] = await Promise.all([
      existingProfiles(admin, ids),
      admin.from("registrations").select("login_id").in("login_id", ids.length ? ids : ["-"]),
    ]);
    if (knownError) throw knownError;
    const already = new Set((known ?? []).map((r) => r.login_id as string));
    const seen = new Set<string>();
    const results: ImportRowResult[] = [];

    for (const c of checked) {
      if (!c.ok) {
        results.push({ rowNumber: c.rowNumber, loginId: "", status: "error", message: c.errors.join(" · ") });
        continue;
      }
      const s = c.value;
      if (seen.has(s.loginId)) {
        results.push({ rowNumber: s.rowNumber, loginId: s.loginId, status: "error", message: "เลขประจำตัวซ้ำในไฟล์" });
        continue;
      }
      seen.add(s.loginId);
      const found = existing.get(s.loginId);
      if (found && found.role !== "student") {
        results.push({ rowNumber: s.rowNumber, loginId: s.loginId, status: "error", message: "เลขนี้เป็นบัญชีครู/ผู้ดูแลอยู่แล้ว" });
        continue;
      }
      const cid = await classroomId(s.classroom);
      const { error } = await admin.from("registrations").upsert(
        {
          kind: "student",
          login_id: s.loginId,
          prefix: s.prefix,
          first_name: s.firstName,
          last_name: s.lastName,
          name_key: nameKey(s.firstName, s.lastName),
          classroom_id: cid,
          updated_at: new Date().toISOString(),
          ...(found ? { claimed_by: found.id } : {}),
        },
        { onConflict: "login_id" },
      );
      if (!error && found) {
        // Existing account: keep it in step with the roster (its password is untouched).
        await admin
          .from("profiles")
          .update({ display_name: s.displayName, first_name: s.firstName, last_name: s.lastName, classroom_id: cid })
          .eq("id", found.id);
      }
      results.push(
        error
          ? { rowNumber: s.rowNumber, loginId: s.loginId, status: "error", message: error.message }
          : { rowNumber: s.rowNumber, loginId: s.loginId, status: already.has(s.loginId) || found ? "updated" : "created" },
      );
    }
    await logAudit(me.id, "import-students", null, { rows: rows.length, ok: results.filter((r) => r.status !== "error").length });
    return results;
  } catch (e) {
    await logError("admin/importStudents", e);
    throw new Error("นำเข้าไม่สำเร็จ ระบบขัดข้อง ดูรายละเอียดในบันทึกข้อผิดพลาด");
  }
}

type Assignment = { subject_code: string; classroom_id: string | null };

/**
 * Pre-registers teachers by full name, with the subjects and rooms they teach. They sign up with a
 * personal code from the admin (Developer Console → ลงทะเบียน & เข้าสู่ระบบ → ครู). One row per
 * subject; a teacher's rows are merged. Teachers already signed up get the new rooms straight away.
 */
export async function importTeachers(rows: SerializedRow<TeacherKey>[]): Promise<ImportRowResult[]> {
  const me = await requireProfile({ roles: ["admin"] });
  if (rows.length > MAX_ROWS_PER_CALL) throw new Error("too many rows");

  try {
    const admin = createAdminClient();
    const classroomId = classroomResolver(admin);
    const checked = rows.map((r) => validateTeacherRow(r as RawRow<TeacherKey>));
    const results: ImportRowResult[] = [];
    // Group this call's rows by teacher (a teacher's rows are always sent together).
    const byTeacher = new Map<string, { name: string; rows: number[]; assignments: Assignment[] }>();

    for (const c of checked) {
      if (!c.ok) {
        results.push({ rowNumber: c.rowNumber, loginId: "", status: "error", message: c.errors.join(" · ") });
        continue;
      }
      const t = c.value;
      const key = nameKeyFromFull(t.displayName);
      const entry = byTeacher.get(key) ?? { name: t.displayName, rows: [], assignments: [] };
      entry.rows.push(t.rowNumber);
      if (t.subject) {
        if (t.classrooms.length === 0) entry.assignments.push({ subject_code: t.subject.code, classroom_id: null });
        for (const room of t.classrooms) entry.assignments.push({ subject_code: t.subject.code, classroom_id: await classroomId(room) });
      }
      byTeacher.set(key, entry);
    }

    for (const [key, t] of byTeacher) {
      const report = (status: ImportRowResult["status"], message?: string) =>
        t.rows.forEach((rowNumber) => results.push({ rowNumber, loginId: t.name, status, message }));
      const { data: reg, error: readError } = await admin
        .from("registrations")
        .select("id, assignments, claimed_by")
        .eq("kind", "teacher")
        .eq("name_key", key)
        .maybeSingle();
      if (readError) {
        report("error", readError.message);
        continue;
      }
      const merged = [...((reg?.assignments as Assignment[] | undefined) ?? []), ...t.assignments].filter(
        (a, i, all) => all.findIndex((b) => b.subject_code === a.subject_code && b.classroom_id === a.classroom_id) === i,
      );
      const { prefix, first, last } = splitFullName(t.name);
      const values = { prefix, first_name: first, last_name: last, assignments: merged, updated_at: new Date().toISOString() };
      const { error } = reg
        ? await admin.from("registrations").update(values).eq("id", reg.id)
        : await admin.from("registrations").insert({ kind: "teacher", name_key: key, ...values });
      if (error) {
        report("error", error.message);
        continue;
      }
      if (reg?.claimed_by) {
        // Already signed up: give them the new subjects/rooms now.
        const { data: subjects } = await admin.from("subjects").select("id, code");
        const links = merged.flatMap((a) => {
          const sid = (subjects ?? []).find((x) => x.code === a.subject_code)?.id;
          return sid && a.classroom_id ? [{ teacher_id: reg.claimed_by, subject_id: sid, classroom_id: a.classroom_id }] : [];
        });
        if (links.length) {
          await admin.from("teaching_assignments").upsert(links, { onConflict: "teacher_id,classroom_id,subject_id", ignoreDuplicates: true });
        }
      }
      report(reg ? "updated" : "created");
    }
    await logAudit(me.id, "import-teachers", null, { rows: rows.length, ok: results.filter((r) => r.status !== "error").length });
    return results.sort((a, b) => a.rowNumber - b.rowNumber);
  } catch (e) {
    await logError("admin/importTeachers", e);
    throw new Error("นำเข้าไม่สำเร็จ ระบบขัดข้อง ดูรายละเอียดในบันทึกข้อผิดพลาด");
  }
}

export type ResetState = { tempPassword?: string; error?: string };

/** Gives a user a one-time temporary password; they must change it at next login. */
export async function resetPassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const me = await requireProfile({ roles: ["admin"] });
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "ไม่พบผู้ใช้" };
  try {
    const admin = createAdminClient();
    const tempPassword = generateTempPassword();
    const { error } = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
    if (error) throw error;
    const { error: flagError } = await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);
    if (flagError) throw flagError;
    await logAudit(me.id, "reset-password", userId);
    return { tempPassword };
  } catch (e) {
    await logError("admin/resetPassword", e);
    return { error: "รีเซ็ตไม่สำเร็จ ลองอีกครั้ง" };
  }
}
