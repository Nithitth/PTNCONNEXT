"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { bangkokInputToIso } from "@/lib/calendar";
import { logAudit, logError, logSignup } from "@/lib/logs";
import { formatClassroom } from "@/lib/roster";
import { PERSONAL_CODE_DAYS, newPersonalCode, newRoomCode, slotProblem } from "@/lib/signup";
import { hashCode } from "@/lib/signupServer";
import { createAdminClient } from "@/lib/supabase/admin";

// Developer Console → ลงทะเบียน & เข้าสู่ระบบ. Admins only; every change is recorded with who made it.

export type AccessResult = { ok?: true; error?: string; code?: string };

const PATH = "/admin/access";
const FAILED = "ทำรายการไม่สำเร็จ ลองอีกครั้ง";
const isUuid = (s: string) => /^[0-9a-f-]{36}$/.test(s);

async function admin() {
  const profile = await requireProfile({ roles: ["admin"] });
  return { profile, db: createAdminClient() };
}

/** A fresh room code that no other room uses. */
async function uniqueRoomCode(db: ReturnType<typeof createAdminClient>) {
  for (let i = 0; i < 5; i++) {
    const code = newRoomCode();
    const { data } = await db.from("signup_rooms").select("code").eq("code", code).maybeSingle();
    if (!data) return code;
  }
  throw new Error("could not make a unique room code");
}

/** Sets (or changes) a room's sign-up slot. A room without a code gets one. */
export async function saveSlot(classroomId: string, date: string, start: string, end: string): Promise<AccessResult> {
  const { profile, db } = await admin();
  if (!isUuid(classroomId)) return { error: FAILED };
  const problem = slotProblem(date, start, end);
  if (problem) return { error: problem };
  const startsAt = bangkokInputToIso(`${date}T${start}`)!;
  const endsAt = bangkokInputToIso(`${date}T${end}`)!;
  try {
    const { data: existing } = await db.from("signup_rooms").select("code").eq("classroom_id", classroomId).maybeSingle();
    const { error } = await db.from("signup_rooms").upsert({
      classroom_id: classroomId,
      code: existing?.code ?? (await uniqueRoomCode(db)),
      starts_at: startsAt,
      ends_at: endsAt,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    await logSignup("admin_slot", "info", { classroomId, actorId: profile.id, detail: `ตั้งเวลา ${date} ${start}–${end} โดย ${profile.display_name}` });
    revalidatePath(PATH, "layout");
    return { ok: true };
  } catch (e) {
    await logError("admin/access/slot", e);
    return { error: FAILED };
  }
}

/**
 * The generator panel: gives a room a brand-new code for one date and time (Thai time). Any older code or
 * QR of that room stops working at once. The code is returned to show the admin (it isn't secret: it
 * only works inside the slot, and only for names in that room).
 */
export async function createRoomCode(classroomId: string, date: string, start: string, end: string): Promise<AccessResult> {
  const { profile, db } = await admin();
  if (!isUuid(classroomId)) return { error: "เลือกห้องก่อน" };
  const problem = slotProblem(date, start, end);
  if (problem) return { error: problem };
  const startsAt = bangkokInputToIso(`${date}T${start}`)!;
  const endsAt = bangkokInputToIso(`${date}T${end}`)!;
  try {
    const { data: room } = await db.from("classrooms").select("grade, room").eq("id", classroomId).maybeSingle();
    if (!room) return { error: "ไม่พบห้องนี้" };
    const code = await uniqueRoomCode(db);
    const { error } = await db.from("signup_rooms").upsert({
      classroom_id: classroomId,
      code,
      starts_at: startsAt,
      ends_at: endsAt,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    await logSignup("admin_qr", "info", { classroomId, actorId: profile.id, detail: `สร้างรหัส ${date} ${start}–${end} โดย ${profile.display_name}` });
    await logAudit(profile.id, "room-code", formatClassroom(room), { date, start, end });
    revalidatePath(PATH, "layout");
    return { ok: true, code };
  } catch (e) {
    await logError("admin/access/create-code", e);
    return { error: FAILED };
  }
}

/** Opens a room right now for `minutes` (absent students, or a quick test). */
export async function openNow(classroomId: string, minutes: number): Promise<AccessResult> {
  const { profile, db } = await admin();
  if (!isUuid(classroomId) || ![15, 30, 60].includes(minutes)) return { error: FAILED };
  try {
    const { data: existing } = await db.from("signup_rooms").select("code").eq("classroom_id", classroomId).maybeSingle();
    const now = Date.now();
    const { error } = await db.from("signup_rooms").upsert({
      classroom_id: classroomId,
      code: existing?.code ?? (await uniqueRoomCode(db)),
      starts_at: new Date(now).toISOString(),
      ends_at: new Date(now + minutes * 60_000).toISOString(),
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    await logSignup("admin_slot", "info", { classroomId, actorId: profile.id, detail: `เปิดทันที ${minutes} นาที โดย ${profile.display_name}` });
    revalidatePath(PATH, "layout");
    return { ok: true };
  } catch (e) {
    await logError("admin/access/open", e);
    return { error: FAILED };
  }
}

/** Ends a room's slot now (the code stops working). */
export async function closeNow(classroomId: string): Promise<AccessResult> {
  const { profile, db } = await admin();
  if (!isUuid(classroomId)) return { error: FAILED };
  try {
    const now = new Date().toISOString();
    const { data: slot } = await db.from("signup_rooms").select("starts_at").eq("classroom_id", classroomId).maybeSingle();
    if (!slot) return { ok: true };
    const { error } = await db
      .from("signup_rooms")
      .update({ starts_at: slot.starts_at < now ? slot.starts_at : new Date(Date.now() - 60_000).toISOString(), ends_at: now, updated_by: profile.id, updated_at: now })
      .eq("classroom_id", classroomId);
    if (error) throw error;
    await logSignup("admin_slot", "info", { classroomId, actorId: profile.id, detail: `ปิดทันที โดย ${profile.display_name}` });
    revalidatePath(PATH, "layout");
    return { ok: true };
  } catch (e) {
    await logError("admin/access/close", e);
    return { error: FAILED };
  }
}

/** Gives a room a new code (the old QR stops working at once). */
export async function regenerateRoomCode(classroomId: string): Promise<AccessResult> {
  const { profile, db } = await admin();
  if (!isUuid(classroomId)) return { error: FAILED };
  try {
    const { error, data } = await db
      .from("signup_rooms")
      .update({ code: await uniqueRoomCode(db), updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("classroom_id", classroomId)
      .select("classroom_id");
    if (error) throw error;
    if (!data?.length) return { error: "ตั้งเวลาให้ห้องนี้ก่อน" };
    await logSignup("admin_qr", "info", { classroomId, actorId: profile.id, detail: `สร้าง QR ใหม่ โดย ${profile.display_name}` });
    revalidatePath(PATH, "layout");
    return { ok: true };
  } catch (e) {
    await logError("admin/access/qr", e);
    return { error: FAILED };
  }
}

/**
 * Makes a personal sign-up code for one person (a teacher, or an absent student). The code is returned
 * once, to show the admin; only its scrambled copy is stored. Also unlocks a locked code.
 */
export async function issuePersonalCode(registrationId: string): Promise<AccessResult> {
  const { profile, db } = await admin();
  if (!isUuid(registrationId)) return { error: FAILED };
  try {
    const code = newPersonalCode();
    const { data, error } = await db
      .from("registrations")
      .update({
        code_hash: hashCode(code.replace(/-/g, "")),
        code_expires_at: new Date(Date.now() + PERSONAL_CODE_DAYS * 86_400_000).toISOString(),
        code_attempts: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", registrationId)
      .is("claimed_by", null)
      .select("id, classroom_id");
    if (error) throw error;
    if (!data?.length) return { error: "คนนี้ลงทะเบียนแล้ว" };
    await logSignup("admin_code", "info", {
      registrationId,
      classroomId: data[0].classroom_id,
      actorId: profile.id,
      detail: `สร้างรหัสส่วนตัว โดย ${profile.display_name}`,
    });
    await logAudit(profile.id, "personal-code", registrationId);
    revalidatePath(PATH, "layout");
    return { ok: true, code };
  } catch (e) {
    await logError("admin/access/code", e);
    return { error: FAILED };
  }
}

/** Undoes a registration: deletes that login (and its data) and lets the person sign up again. */
export async function releaseRegistration(registrationId: string): Promise<AccessResult> {
  const { profile, db } = await admin();
  if (!isUuid(registrationId)) return { error: FAILED };
  try {
    const { data: reg } = await db.from("registrations").select("claimed_by, classroom_id").eq("id", registrationId).maybeSingle();
    if (!reg?.claimed_by) return { error: "คนนี้ยังไม่ได้ลงทะเบียน" };
    if (reg.claimed_by === profile.id) return { error: "ยกเลิกบัญชีของตัวเองไม่ได้" };
    const { error } = await db.auth.admin.deleteUser(reg.claimed_by); // the profile goes with it
    if (error) throw error;
    await db.from("registrations").update({ claimed_by: null, claimed_at: null, updated_at: new Date().toISOString() }).eq("id", registrationId);
    await logSignup("admin_release", "info", {
      registrationId,
      classroomId: reg.classroom_id,
      actorId: profile.id,
      detail: `ยกเลิกการลงทะเบียน โดย ${profile.display_name}`,
    });
    await logAudit(profile.id, "release-registration", registrationId);
    revalidatePath(PATH, "layout");
    return { ok: true };
  } catch (e) {
    await logError("admin/access/release", e);
    return { error: FAILED };
  }
}

/** Ends a log-in lockout now (the person may try again straight away). */
export async function unlockLogin(identifier: string): Promise<AccessResult> {
  const { profile, db } = await admin();
  if (!/^[0-9a-f]{32}$/.test(identifier)) return { error: FAILED };
  try {
    const { error } = await db.from("login_unlocks").insert({ identifier, actor_id: profile.id });
    if (error) throw error;
    await logAudit(profile.id, "unlock-login", identifier);
    revalidatePath(PATH, "layout");
    return { ok: true };
  } catch (e) {
    await logError("admin/access/unlock", e);
    return { error: FAILED };
  }
}

/** Turns off a staff member's two-step (lost phone). They set it up again at their next log-in. */
export async function resetTwoStep(userId: string): Promise<AccessResult> {
  const { profile, db } = await admin();
  if (!isUuid(userId)) return { error: FAILED };
  if (userId === profile.id) return { error: "รีเซ็ตของตัวเองไม่ได้ ให้ผู้ดูแลระบบอีกคนทำให้" };
  try {
    const { data, error } = await db.auth.admin.mfa.listFactors({ userId });
    if (error) throw error;
    for (const f of data.factors) {
      const { error: delError } = await db.auth.admin.mfa.deleteFactor({ id: f.id, userId });
      if (delError) throw delError;
    }
    await logAudit(profile.id, "two-step-reset", userId);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) {
    await logError("admin/access/two-step-reset", e);
    return { error: FAILED };
  }
}

/** The master switch: accept sign-ups or not. */
export async function setSignupOpen(open: boolean): Promise<AccessResult> {
  const { profile, db } = await admin();
  try {
    const { error } = await db
      .from("app_settings")
      .upsert({ key: "signup_open", value: open, updated_by: profile.id, updated_at: new Date().toISOString() });
    if (error) throw error;
    await logSignup("admin_switch", "info", { actorId: profile.id, detail: `${open ? "เปิด" : "ปิด"}รับลงทะเบียน โดย ${profile.display_name}` });
    await logAudit(profile.id, open ? "signup-open" : "signup-close");
    revalidatePath(PATH, "layout");
    return { ok: true };
  } catch (e) {
    await logError("admin/access/switch", e);
    return { error: FAILED };
  }
}
