"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured, NOT_CONFIGURED_MESSAGE } from "@/lib/env";
import { logError, logLogin } from "@/lib/logs";
import { loginIdToEmail, normalizeLoginId } from "@/lib/roster";
import { createClient } from "@/lib/supabase/server";

export type LoginKind = "student" | "teacher";
export type LoginState = { error?: string; loginId?: string; kind?: LoginKind };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const kind: LoginKind = formData.get("kind") === "teacher" ? "teacher" : "student";
  const loginId = normalizeLoginId(String(formData.get("loginId") ?? ""));
  const password = String(formData.get("password") ?? "");
  const keep = { loginId, kind };

  if (!isSupabaseConfigured) return { error: NOT_CONFIGURED_MESSAGE, ...keep };
  if (!loginId || !password) {
    return { error: kind === "student" ? "กรอกเลขประจำตัวและรหัสผ่าน" : "กรอกชื่อผู้ใช้และรหัสผ่าน", ...keep };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginIdToEmail(loginId),
      password,
    });
    // Supabase's per-IP sign-in limit: every login comes from our server's IP, so a whole class signing in
    // at once can hit it. Not the student's fault, so not a failed login; logged for the Developer Console.
    if (error?.status === 429) {
      await logError("login/rate-limit", error);
      return { error: "มีผู้เข้าสู่ระบบพร้อมกันจำนวนมาก กรุณารอประมาณ 1 นาทีแล้วลองใหม่", ...keep };
    }
    if (error || !data.user) {
      await logLogin(loginId, false, null);
      return {
        error: kind === "student" ? "เลขประจำตัวหรือรหัสผ่านไม่ถูกต้อง" : "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
        ...keep,
      };
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    if (!profile) {
      await supabase.auth.signOut();
      await logLogin(loginId, false, null);
      return { error: "บัญชีนี้ยังไม่ได้ลงทะเบียนในระบบ ติดต่อผู้ดูแลระบบ", ...keep };
    }

    const isStaff = profile.role !== "student";
    if (isStaff !== (kind === "teacher")) {
      await supabase.auth.signOut();
      await logLogin(loginId, false, data.user.id);
      return {
        error: isStaff
          ? "บัญชีนี้เป็นบัญชีครู เลือก “ครู” ด้านบนแล้วลองอีกครั้ง"
          : "บัญชีนี้เป็นบัญชีนักเรียน เลือก “นักเรียน” ด้านบนแล้วลองอีกครั้ง",
        ...keep,
      };
    }

    await logLogin(loginId, true, data.user.id);
  } catch (e) {
    await logError("login", e);
    return { error: "เข้าสู่ระบบไม่สำเร็จ ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง", ...keep };
  }

  // requireProfile() on /calendar sends first-time users to PDPA and password change.
  redirect("/calendar");
}

export async function logout() {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
