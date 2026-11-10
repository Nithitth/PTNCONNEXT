"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireProfile } from "@/lib/auth";
import { logError } from "@/lib/logs";
import {
  currentAcademicYear,
  generateTempPassword,
  loginIdToEmail,
  validateStudentRow,
  validateTeacherRow,
  type ClassroomRef,
  type RawRow,
  type STUDENT_COLUMNS,
  type TEACHER_COLUMNS,
} from "@/lib/roster";
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

/** Creates the login + profile together; removes the login again if the profile can't be saved. */
async function createAccount(
  admin: SupabaseClient,
  loginId: string,
  password: string,
  profile: { role: "student" | "teacher"; display_name: string; classroom_id: string | null },
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.createUser({
    email: loginIdToEmail(loginId),
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    if (error?.code === "email_exists") {
      return "มีบัญชีเข้าสู่ระบบค้างอยู่แต่ไม่มีโปรไฟล์ ลบผู้ใช้นี้ใน Supabase → Authentication แล้วนำเข้าใหม่";
    }
    return `สร้างบัญชีไม่สำเร็จ: ${error?.message ?? "unknown"}`;
  }
  const { error: pErr } = await admin.from("profiles").insert({
    id: data.user.id,
    login_id: loginId,
    must_change_password: true,
    ...profile,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id);
    return `บันทึกโปรไฟล์ไม่สำเร็จ: ${pErr.message}`;
  }
  return null;
}

async function existingProfiles(admin: SupabaseClient, loginIds: string[]) {
  if (loginIds.length === 0) return new Map<string, { id: string; role: string }>();
  const { data, error } = await admin.from("profiles").select("id, login_id, role").in("login_id", loginIds);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.login_id as string, { id: p.id as string, role: p.role as string }]));
}

export async function importStudents(rows: SerializedRow<StudentKey>[]): Promise<ImportRowResult[]> {
  await requireProfile({ roles: ["admin"] });
  if (rows.length > MAX_ROWS_PER_CALL) throw new Error("too many rows");

  try {
    const admin = createAdminClient();
    const classroomId = classroomResolver(admin);
    // Validate again on the server — never trust what the browser sent.
    const checked = rows.map((r) => validateStudentRow(r as RawRow<StudentKey>));
    const existing = await existingProfiles(
      admin,
      checked.flatMap((c) => (c.ok ? [c.value.loginId] : [])),
    );
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
      const cid = await classroomId(s.classroom);
      const found = existing.get(s.loginId);

      if (found) {
        if (found.role !== "student") {
          results.push({ rowNumber: s.rowNumber, loginId: s.loginId, status: "error", message: "เลขนี้เป็นบัญชีครู/ผู้ดูแลอยู่แล้ว" });
          continue;
        }
        // Existing student: update name and classroom, keep their password.
        const { error } = await admin
          .from("profiles")
          .update({ display_name: s.displayName, classroom_id: cid })
          .eq("id", found.id);
        results.push(
          error
            ? { rowNumber: s.rowNumber, loginId: s.loginId, status: "error", message: error.message }
            : { rowNumber: s.rowNumber, loginId: s.loginId, status: "updated" },
        );
        continue;
      }

      const problem = await createAccount(admin, s.loginId, s.password, {
        role: "student",
        display_name: s.displayName,
        classroom_id: cid,
      });
      results.push(
        problem
          ? { rowNumber: s.rowNumber, loginId: s.loginId, status: "error", message: problem }
          : { rowNumber: s.rowNumber, loginId: s.loginId, status: "created" },
      );
    }
    return results;
  } catch (e) {
    await logError("admin/importStudents", e);
    throw new Error("นำเข้าไม่สำเร็จ ระบบขัดข้อง ดูรายละเอียดในบันทึกข้อผิดพลาด");
  }
}

export async function importTeachers(rows: SerializedRow<TeacherKey>[]): Promise<ImportRowResult[]> {
  await requireProfile({ roles: ["admin"] });
  if (rows.length > MAX_ROWS_PER_CALL) throw new Error("too many rows");

  try {
    const admin = createAdminClient();
    const classroomId = classroomResolver(admin);
    const checked = rows.map((r) => validateTeacherRow(r as RawRow<TeacherKey>));
    const existing = await existingProfiles(
      admin,
      [...new Set(checked.flatMap((c) => (c.ok ? [c.value.loginId] : [])))],
    );
    const teacherIds = new Map<string, string | { error: string }>();
    const subjectIds = new Map<string, string>();
    const results: ImportRowResult[] = [];

    for (const c of checked) {
      if (!c.ok) {
        results.push({ rowNumber: c.rowNumber, loginId: "", status: "error", message: c.errors.join(" · ") });
        continue;
      }
      const t = c.value;
      let status: ImportRowResult["status"] = "updated";

      // 1) The teacher account (first row for this username creates/updates it).
      if (!teacherIds.has(t.loginId)) {
        const found = existing.get(t.loginId);
        if (found) {
          if (found.role === "student") {
            teacherIds.set(t.loginId, { error: "ชื่อผู้ใช้นี้เป็นบัญชีนักเรียนอยู่แล้ว" });
          } else {
            await admin.from("profiles").update({ display_name: t.displayName }).eq("id", found.id);
            teacherIds.set(t.loginId, found.id);
          }
        } else {
          const problem = await createAccount(admin, t.loginId, t.password, {
            role: "teacher",
            display_name: t.displayName,
            classroom_id: null,
          });
          if (problem) {
            teacherIds.set(t.loginId, { error: problem });
          } else {
            const again = await existingProfiles(admin, [t.loginId]);
            teacherIds.set(t.loginId, again.get(t.loginId)!.id);
            status = "created";
          }
        }
      }
      const teacherId = teacherIds.get(t.loginId)!;
      if (typeof teacherId !== "string") {
        results.push({ rowNumber: t.rowNumber, loginId: t.loginId, status: "error", message: teacherId.error });
        continue;
      }

      // 2) Subject + the classrooms they teach it in.
      if (t.subject) {
        let sid = subjectIds.get(t.subject.code);
        if (!sid) {
          const { data, error } = await admin
            .from("subjects")
            .upsert(
              { code: t.subject.code, name_th: t.subject.name, color: t.subject.color },
              { onConflict: "code" },
            )
            .select("id")
            .single();
          if (error || !data) {
            results.push({ rowNumber: t.rowNumber, loginId: t.loginId, status: "error", message: error?.message });
            continue;
          }
          sid = data.id as string;
          subjectIds.set(t.subject.code, sid);
        }
        const links = await Promise.all(
          t.classrooms.map(async (room) => ({ teacher_id: teacherId, subject_id: sid, classroom_id: await classroomId(room) })),
        );
        const { error } = await admin
          .from("teaching_assignments")
          .upsert(links, { onConflict: "teacher_id,classroom_id,subject_id", ignoreDuplicates: true });
        if (error) {
          results.push({ rowNumber: t.rowNumber, loginId: t.loginId, status: "error", message: error.message });
          continue;
        }
      }
      results.push({ rowNumber: t.rowNumber, loginId: t.loginId, status });
    }
    return results;
  } catch (e) {
    await logError("admin/importTeachers", e);
    throw new Error("นำเข้าไม่สำเร็จ ระบบขัดข้อง ดูรายละเอียดในบันทึกข้อผิดพลาด");
  }
}

export type ResetState = { tempPassword?: string; error?: string };

/** Gives a user a one-time temporary password; they must change it at next login. */
export async function resetPassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  await requireProfile({ roles: ["admin"] });
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "ไม่พบผู้ใช้" };
  try {
    const admin = createAdminClient();
    const tempPassword = generateTempPassword();
    const { error } = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
    if (error) throw error;
    const { error: flagError } = await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);
    if (flagError) throw flagError;
    return { tempPassword };
  } catch (e) {
    await logError("admin/resetPassword", e);
    return { error: "รีเซ็ตไม่สำเร็จ ลองอีกครั้ง" };
  }
}
