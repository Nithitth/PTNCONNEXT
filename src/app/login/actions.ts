"use server";

import { redirect } from "next/navigation";
import { lockKey, loginIdToEmail } from "@/lib/authEmail";
import { isSupabaseConfigured, NOT_CONFIGURED_MESSAGE } from "@/lib/env";
import { failuresFor, LOCKED_MESSAGE } from "@/lib/lockout";
import { logError, logLogin } from "@/lib/logs";
import { normalizeLoginId } from "@/lib/roster";
import { classifyLoginIdentifier, lockoutLimit } from "@/lib/signup";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type LoginKind = "student" | "teacher";
export type LoginState = { error?: string; loginId?: string; kind?: LoginKind };

/**
 * The account's internal ID for what was typed: a student ID / username as is, an email or phone looked
 * up on the server (admin client). Unknown emails/phones return a made-up ID, so the sign-in simply
 * fails with the same message as a wrong password, and nobody can learn whose email or phone is registered.
 */
async function resolveLoginId(id: ReturnType<typeof classifyLoginIdentifier>): Promise<string> {
  if (id.kind === "id") return normalizeLoginId(id.value);
  const { data } = await createAdminClient().from("profiles").select("login_id").eq(id.kind, id.value).maybeSingle();
  return data?.login_id ?? "unknown-account";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const kind: LoginKind = formData.get("kind") === "teacher" ? "teacher" : "student";
  const typed = String(formData.get("loginId") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const keep = { loginId: typed, kind };
  const WRONG = kind === "student" ? "เลขประจำตัว อีเมล หรือรหัสผ่านไม่ถูกต้อง" : "อีเมล เบอร์โทร หรือรหัสผ่านไม่ถูกต้อง";

  if (!isSupabaseConfigured) return { error: NOT_CONFIGURED_MESSAGE, ...keep };
  if (!typed || !password) {
    return { error: kind === "student" ? "กรอกเลขประจำตัวหรืออีเมล และรหัสผ่าน" : "กรอกอีเมลหรือเบอร์โทร และรหัสผ่าน", ...keep };
  }

  let loginId = typed;
  let toTwoStep = false;
  try {
    // Lockout: counted per what was typed (scrambled), the same way whether or not the account exists.
    const id = classifyLoginIdentifier(typed);
    const key = lockKey(id.kind, id.value);
    loginId = await resolveLoginId(id);
    if ((await failuresFor(key)) >= lockoutLimit(id)) {
      await logLogin(loginId, false, null, { identifier: key, reason: "locked" });
      return { error: LOCKED_MESSAGE, ...keep };
    }
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
      await logLogin(loginId, false, null, { identifier: key, reason: "wrong-password" });
      return { error: WRONG, ...keep };
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    if (!profile) {
      await supabase.auth.signOut();
      await logLogin(loginId, false, null, { identifier: key, reason: "no-profile" });
      return { error: "บัญชีนี้ยังไม่ได้ลงทะเบียนในระบบ กด “ลงทะเบียน” ด้านล่าง หรือติดต่อผู้ดูแลระบบ", ...keep };
    }

    const isStaff = profile.role !== "student";
    if (isStaff !== (kind === "teacher")) {
      await supabase.auth.signOut();
      await logLogin(loginId, false, data.user.id, { identifier: key, reason: "wrong-tab" });
      return {
        error: isStaff
          ? "บัญชีนี้เป็นบัญชีครู เลือก “ครู” ด้านบนแล้วลองอีกครั้ง"
          : "บัญชีนี้เป็นบัญชีนักเรียน เลือก “นักเรียน” ด้านบนแล้วลองอีกครั้ง",
        ...keep,
      };
    }

    await logLogin(loginId, true, data.user.id, { identifier: key });
    // Admins always, and anyone who turned two-step on, enter their authenticator code next.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    toTwoStep = profile.role === "admin" || aal?.nextLevel === "aal2";
  } catch (e) {
    await logError("login", e);
    return { error: "เข้าสู่ระบบไม่สำเร็จ ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง", ...keep };
  }

  // requireProfile() on /calendar sends first-time users to PDPA and password change.
  redirect(toTwoStep ? "/mfa" : "/calendar");
}

export async function logout() {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
