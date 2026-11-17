"use server";

import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { logError, logLogin, logSignup } from "@/lib/logs";
import { sendEmailCode } from "@/lib/mail";
import { loginIdToEmail } from "@/lib/authEmail";
import { formatClassroom, newPasswordProblem } from "@/lib/roster";
import {
  EMAIL_CODE_MINUTES,
  EMAIL_CODE_TRIES,
  EMAIL_RESEND_SECONDS,
  NO_SUBJECT,
  PERSONAL_CODE_TRIES,
  cleanCode,
  isPersonalCode,
  isRoomCode,
  maskEmail,
  maskPhone,
  nameKey,
  nameKeyFromFull,
  newEmailCode,
  normalizeEmail,
  normalizePhone,
  slotStatus,
} from "@/lib/signup";
import { clearTicket, hashCode, isSignupOpen, readTicket, writeTicket } from "@/lib/signupServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Sign-up steps. Everything runs on the server with the admin client (the new tables have no browser
// access), every step re-checks the master switch, and progress lives in a signed cookie (signupServer.ts).
// The last step re-checks everything against the database before creating the account.

export type SignupResult = {
  ok?: true;
  error?: string;
  /** What the next step shows. */
  room?: string;
  studentId?: string;
  name?: string;
  sentTo?: string;
};

const CLOSED = "ขณะนี้ปิดรับลงทะเบียน ติดต่อผู้ดูแลระบบ";
const FAILED = "ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง";
const EXPIRED = "หมดเวลาการลงทะเบียนครั้งนี้ เริ่มใหม่ตั้งแต่ขั้นแรก";
/** Gmail sends about 500 a day; stop a little before that. */
const DAILY_EMAIL_LIMIT = 480;

type Reg = {
  id: string;
  kind: "student" | "teacher";
  login_id: string | null;
  prefix: string;
  first_name: string;
  last_name: string;
  classroom_id: string | null;
  assignments: { subject_code: string; classroom_id: string | null }[];
  code_hash: string | null;
  code_expires_at: string | null;
  code_attempts: number;
  claimed_by: string | null;
};
const REG = "id, kind, login_id, prefix, first_name, last_name, classroom_id, assignments, code_hash, code_expires_at, code_attempts, claimed_by";

async function roomLabel(admin: ReturnType<typeof createAdminClient>, classroomId: string | null | undefined) {
  if (!classroomId) return "";
  const { data } = await admin.from("classrooms").select("grade, room").eq("id", classroomId).maybeSingle();
  return data ? formatClassroom(data) : "";
}

/** Runs one step: the master switch first, unexpected errors logged. */
async function step(name: string, fn: (admin: ReturnType<typeof createAdminClient>) => Promise<SignupResult>): Promise<SignupResult> {
  try {
    const admin = createAdminClient();
    if (!(await isSignupOpen(admin))) return { error: CLOSED };
    return await fn(admin);
  } catch (e) {
    await logError(`signup/${name}`, e);
    return { error: FAILED };
  }
}

// ─── Student: room code (or a personal code), then the name ──

export async function enterStudentCode(raw: string): Promise<SignupResult> {
  return step("code", async (admin) => {
    const code = cleanCode(String(raw ?? ""));
    if (isRoomCode(code)) {
      const { data: slot } = await admin
        .from("signup_rooms")
        .select("classroom_id, starts_at, ends_at")
        .eq("code", code)
        .maybeSingle();
      if (!slot) {
        await logSignup("room_code", "fail", { detail: "รหัสห้องไม่ถูกต้อง" });
        return { error: "รหัสห้องไม่ถูกต้อง ตรวจรหัสบนการ์ด QR อีกครั้ง" };
      }
      const status = slotStatus({ startsAt: slot.starts_at, endsAt: slot.ends_at });
      if (status !== "open") {
        await logSignup("room_code", "fail", { classroomId: slot.classroom_id, detail: status === "upcoming" ? "ยังไม่ถึงเวลา" : "หมดเวลา" });
        return {
          error: status === "upcoming" ? "ยังไม่ถึงเวลาลงทะเบียนของห้องนี้" : "หมดเวลาลงทะเบียนของห้องนี้แล้ว แจ้งผู้ดูแลระบบ",
        };
      }
      await writeTicket({ kind: "student", classroomId: slot.classroom_id });
      return { ok: true, room: await roomLabel(admin, slot.classroom_id) };
    }
    if (isPersonalCode(code)) {
      const { data } = await admin.from("registrations").select(REG).eq("code_hash", hashCode(code)).eq("kind", "student").maybeSingle();
      const reg = data as Reg | null;
      if (!reg || !reg.code_expires_at || new Date(reg.code_expires_at) < new Date()) {
        await logSignup("personal_code", "fail", { detail: "รหัสส่วนตัวไม่ถูกต้องหรือหมดอายุ" });
        return { error: "รหัสไม่ถูกต้องหรือหมดอายุ ขอรหัสใหม่จากผู้ดูแลระบบ" };
      }
      await writeTicket({ kind: "student", classroomId: reg.classroom_id ?? undefined, personalFor: reg.id });
      return { ok: true, room: await roomLabel(admin, reg.classroom_id) };
    }
    return { error: "รหัสห้องมี 6 ตัว (รหัสส่วนตัวมี 9 ตัว) ตรวจอีกครั้ง" };
  });
}

export async function findStudent(first: string, last: string): Promise<SignupResult> {
  return step("name", async (admin) => {
    const t = await readTicket();
    if (!t || t.kind !== "student" || !t.classroomId) return { error: EXPIRED };
    const key = nameKey(String(first ?? ""), String(last ?? ""));
    if (!key.includes(" ") || key.length < 3) return { error: "กรอกทั้งชื่อและนามสกุล" };

    const { data, error } = await admin
      .from("registrations")
      .select(REG)
      .eq("kind", "student")
      .eq("classroom_id", t.classroomId)
      .eq("name_key", key);
    if (error) throw error;
    const matches = ((data ?? []) as Reg[]).filter((r) => !t.personalFor || r.id === t.personalFor);
    if (matches.length === 0) {
      await logSignup("name", "fail", { classroomId: t.classroomId, detail: "ไม่พบชื่อในห้อง" });
      return { error: "ไม่พบชื่อนี้ในห้องนี้ ตรวจตัวสะกดชื่อและนามสกุล หรือแจ้งผู้ดูแลระบบ" };
    }
    if (matches.length > 1) {
      await logSignup("name", "fail", { classroomId: t.classroomId, detail: "ชื่อซ้ำในห้อง" });
      return { error: "มีชื่อนี้มากกว่า 1 คนในห้อง ขอรหัสส่วนตัวจากผู้ดูแลระบบ" };
    }
    const reg = matches[0];
    if (reg.claimed_by) {
      await logSignup("name", "fail", { classroomId: t.classroomId, registrationId: reg.id, detail: "ชื่อนี้ลงทะเบียนแล้ว (ลองซ้ำ)" });
      return { error: "ชื่อนี้ลงทะเบียนแล้ว ถ้าไม่ใช่คุณ แจ้งผู้ดูแลระบบทันที" };
    }
    await writeTicket({ kind: "student", classroomId: t.classroomId, personalFor: t.personalFor, registrationId: reg.id });
    await logSignup("name", "ok", { classroomId: t.classroomId, registrationId: reg.id });
    return {
      ok: true,
      studentId: reg.login_id ?? "",
      name: `${reg.prefix}${reg.first_name} ${reg.last_name}`.trim(),
      room: await roomLabel(admin, reg.classroom_id),
    };
  });
}

// ─── Teacher: full name + subject + personal code ────────────

const TEACHER_MISMATCH = "ชื่อ วิชา หรือรหัสลงทะเบียนไม่ตรงกัน ตรวจอีกครั้ง";

export async function checkTeacher(fullName: string, subject: string, raw: string): Promise<SignupResult> {
  return step("teacher", async (admin) => {
    const key = nameKeyFromFull(String(fullName ?? ""));
    const code = cleanCode(String(raw ?? ""));
    if (!key.includes(" ")) return { error: "กรอกทั้งชื่อและนามสกุล" };
    if (!isPersonalCode(code)) return { error: "รหัสลงทะเบียนมี 9 ตัว เช่น K7P-4QX-9MD" };

    const { data } = await admin.from("registrations").select(REG).eq("kind", "teacher").eq("name_key", key).maybeSingle();
    const reg = data as Reg | null;
    if (!reg) {
      await logSignup("teacher_code", "fail", { detail: "ไม่พบชื่อครู" });
      return { error: TEACHER_MISMATCH };
    }
    if (reg.claimed_by) return { error: "ชื่อนี้ลงทะเบียนแล้ว ถ้าไม่ใช่คุณ แจ้งผู้ดูแลระบบทันที" };
    if (reg.code_attempts >= PERSONAL_CODE_TRIES) {
      await logSignup("teacher_code", "fail", { registrationId: reg.id, detail: "รหัสถูกล็อก" });
      return { error: "กรอกผิดหลายครั้ง รหัสถูกล็อกแล้ว ขอรหัสใหม่จากผู้ดูแลระบบ" };
    }
    const subjects = reg.assignments.map((a) => a.subject_code);
    const subjectOk = subjects.length ? subjects.includes(subject) : subject === NO_SUBJECT;
    const codeOk =
      reg.code_hash !== null && reg.code_expires_at !== null && new Date(reg.code_expires_at) > new Date() && reg.code_hash === hashCode(code);
    if (!subjectOk || !codeOk) {
      const attempts = reg.code_attempts + 1;
      await admin.from("registrations").update({ code_attempts: attempts }).eq("id", reg.id);
      await logSignup("teacher_code", "fail", {
        registrationId: reg.id,
        detail: attempts >= PERSONAL_CODE_TRIES ? "ผิดครบ 5 ครั้ง รหัสถูกล็อก" : `ผิดครั้งที่ ${attempts}`,
      });
      return { error: attempts >= PERSONAL_CODE_TRIES ? "กรอกผิดครบ 5 ครั้ง รหัสถูกล็อกแล้ว ขอรหัสใหม่จากผู้ดูแลระบบ" : TEACHER_MISMATCH };
    }
    await writeTicket({ kind: "teacher", registrationId: reg.id });
    await logSignup("teacher_code", "ok", { registrationId: reg.id });
    return { ok: true, name: `${reg.prefix}${reg.first_name} ${reg.last_name}`.trim() };
  });
}

// ─── Contact: verified email (anyone) or phone (teachers) ────

async function emailTaken(admin: ReturnType<typeof createAdminClient>, email: string) {
  const { data } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  return Boolean(data);
}

async function phoneTaken(admin: ReturnType<typeof createAdminClient>, phone: string) {
  const { data } = await admin.from("profiles").select("id").eq("phone", phone).maybeSingle();
  return Boolean(data);
}

export async function sendCode(rawEmail: string): Promise<SignupResult> {
  return step("email", async (admin) => {
    const t = await readTicket();
    if (!t?.registrationId) return { error: EXPIRED };
    const email = normalizeEmail(String(rawEmail ?? ""));
    if (!email) return { error: "อีเมลไม่ถูกต้อง" };
    if (await emailTaken(admin, email)) return { error: "อีเมลนี้ใช้กับบัญชีอื่นแล้ว ใช้อีเมลอื่น" };

    const { data: prev } = await admin.from("signup_email_codes").select("last_sent_at").eq("email", email).maybeSingle();
    if (prev && Date.now() - new Date(prev.last_sent_at).getTime() < EMAIL_RESEND_SECONDS * 1000) {
      return { error: `เพิ่งส่งรหัสไปแล้ว รอ ${EMAIL_RESEND_SECONDS} วินาทีแล้วค่อยขอใหม่` };
    }
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10); // Thai date
    const { count } = await admin
      .from("signup_events")
      .select("*", { count: "exact", head: true })
      .eq("kind", "email_sent")
      .gte("created_at", `${today}T00:00:00+07:00`);
    if ((count ?? 0) >= DAILY_EMAIL_LIMIT) return { error: "วันนี้ส่งอีเมลครบโควตาแล้ว ลองใหม่พรุ่งนี้ หรือแจ้งผู้ดูแลระบบ" };

    const code = newEmailCode((n) => randomInt(n));
    const { error } = await admin.from("signup_email_codes").upsert({
      email,
      code_hash: hashCode(`email:${email}:${code}`),
      expires_at: new Date(Date.now() + EMAIL_CODE_MINUTES * 60_000).toISOString(),
      attempts: 0,
      last_sent_at: new Date().toISOString(),
    });
    if (error) throw error;
    await sendEmailCode(email, code);
    await writeTicket({ ...t, pendingEmail: email, email: undefined });
    await logSignup("email_sent", "info", { registrationId: t.registrationId, detail: maskEmail(email) });
    return { ok: true, sentTo: email };
  });
}

export async function verifyCode(raw: string): Promise<SignupResult> {
  return step("verify", async (admin) => {
    const t = await readTicket();
    if (!t?.registrationId || !t.pendingEmail) return { error: EXPIRED };
    const code = String(raw ?? "").replace(/\D/g, "");
    const { data: row } = await admin
      .from("signup_email_codes")
      .select("code_hash, expires_at, attempts")
      .eq("email", t.pendingEmail)
      .maybeSingle();
    if (!row || new Date(row.expires_at) < new Date()) return { error: "รหัสหมดอายุแล้ว กด “ส่งรหัสอีกครั้ง”" };
    if (row.attempts >= EMAIL_CODE_TRIES) return { error: "กรอกผิดหลายครั้งเกินไป กด “ส่งรหัสอีกครั้ง”" };
    if (row.code_hash !== hashCode(`email:${t.pendingEmail}:${code}`)) {
      await admin.from("signup_email_codes").update({ attempts: row.attempts + 1 }).eq("email", t.pendingEmail);
      await logSignup("email_verify", "fail", { registrationId: t.registrationId, detail: maskEmail(t.pendingEmail) });
      return { error: "รหัสไม่ถูกต้อง" };
    }
    await admin.from("signup_email_codes").delete().eq("email", t.pendingEmail);
    await writeTicket({ ...t, email: t.pendingEmail, pendingEmail: undefined, phone: undefined });
    await logSignup("email_verify", "ok", { registrationId: t.registrationId, detail: maskEmail(t.pendingEmail) });
    return { ok: true };
  });
}

export async function setPhone(rawPhone: string, rawConfirm: string): Promise<SignupResult> {
  return step("phone", async (admin) => {
    const t = await readTicket();
    if (!t?.registrationId || t.kind !== "teacher") return { error: EXPIRED };
    const phone = normalizePhone(String(rawPhone ?? ""));
    if (!phone) return { error: "เบอร์โทรไม่ถูกต้อง ใช้เบอร์มือถือ 10 หลัก เช่น 081-234-5678" };
    if (phone !== normalizePhone(String(rawConfirm ?? ""))) return { error: "เบอร์โทรทั้งสองช่องไม่ตรงกัน" };
    if (await phoneTaken(admin, phone)) return { error: "เบอร์นี้ใช้กับบัญชีอื่นแล้ว" };
    await writeTicket({ ...t, phone, email: undefined, pendingEmail: undefined });
    return { ok: true };
  });
}

// ─── Last step: the password, then the account ───────────────

export async function finishSignup(password: string, confirm: string): Promise<SignupResult> {
  const result = await step("finish", async (admin) => {
    const t = await readTicket();
    if (!t?.registrationId || (!t.email && !t.phone)) return { error: EXPIRED };
    const { data } = await admin.from("registrations").select(REG).eq("id", t.registrationId).maybeSingle();
    const reg = data as Reg | null;
    if (!reg || reg.kind !== t.kind) return { error: EXPIRED };
    const problem = newPasswordProblem(String(password ?? ""), String(confirm ?? ""), reg.login_id ?? undefined);
    if (problem) return { error: problem.replace("รหัสผ่านใหม่", "รหัสผ่าน") };
    if (reg.claimed_by) return { error: "ชื่อนี้ลงทะเบียนแล้ว ถ้าไม่ใช่คุณ แจ้งผู้ดูแลระบบทันที" };
    if (t.email && (await emailTaken(admin, t.email))) return { error: "อีเมลนี้ใช้กับบัญชีอื่นแล้ว" };
    if (t.phone && (await phoneTaken(admin, t.phone))) return { error: "เบอร์นี้ใช้กับบัญชีอื่นแล้ว" };

    // Students log in with their student ID; teachers get a hidden internal ID they never type.
    const loginId = reg.kind === "student" ? reg.login_id! : `t-${randomInt(36 ** 6).toString(36).padStart(6, "0")}`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: loginIdToEmail(loginId),
      password: String(password),
      email_confirm: true,
    });
    if (createError || !created.user) {
      if (createError?.code === "email_exists") return { error: "มีบัญชีของคนนี้อยู่แล้ว ถ้าไม่ใช่คุณ แจ้งผู้ดูแลระบบทันที" };
      if (createError?.code === "weak_password") return { error: "รหัสผ่านง่ายเกินไป ลองใช้ตัวอักษรผสมตัวเลข" };
      throw createError ?? new Error("createUser failed");
    }
    const { error: claimError } = await admin.rpc("claim_registration", {
      p_registration: reg.id,
      p_user: created.user.id,
      p_login_id: loginId,
      p_display_name: `${reg.prefix}${reg.first_name} ${reg.last_name}`.trim(),
      p_email: t.email ?? null,
      p_phone: t.phone ?? null,
    });
    if (claimError) {
      await admin.auth.admin.deleteUser(created.user.id);
      if (claimError.code === "23505") return { error: "ชื่อ อีเมล หรือเบอร์นี้ลงทะเบียนแล้ว ถ้าไม่ใช่คุณ แจ้งผู้ดูแลระบบทันที" };
      throw claimError;
    }

    await logSignup("registered", "ok", {
      classroomId: reg.classroom_id,
      registrationId: reg.id,
      detail: t.email ? maskEmail(t.email) : maskPhone(t.phone!),
    });
    await clearTicket();

    // Sign the new user in on this browser.
    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: loginIdToEmail(loginId), password: String(password) });
    if (signInError) return { ok: true, error: "ลงทะเบียนสำเร็จ เข้าสู่ระบบด้วยรหัสผ่านที่เพิ่งตั้ง" };
    await logLogin(loginId, true, created.user.id);
    return { ok: true };
  });
  if (result.ok && !result.error) redirect("/pdpa");
  return result;
}

/** Starts over (e.g. "ไม่ใช่ฉัน" or switching between นักเรียน and ครู). */
export async function restartSignup(): Promise<void> {
  await clearTicket();
}
