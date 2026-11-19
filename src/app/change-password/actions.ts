"use server";

import { redirect } from "next/navigation";
import { loginIdToEmail } from "@/lib/authEmail";
import { requireProfile } from "@/lib/auth";
import { logAudit, logError } from "@/lib/logs";
import { newPasswordProblem } from "@/lib/roster";
import { cleanTotp, verifiedFactor } from "@/lib/twoStep";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ChangePasswordState = { error?: string; done?: boolean };

export async function changePassword(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const profile = await requireProfile();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const problem = newPasswordProblem(next, confirm, profile.login_id);
  if (problem) return { error: problem };
  if (!profile.twoStepOn && next === current) return { error: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม" };

  try {
    const supabase = await createClient();
    // Confirm it's really them first, so someone using an unlocked device can't quietly change it.
    // With two-step on: a fresh authenticator code (signing in again would drop the session's two-step
    // level, and Supabase then refuses the change). Otherwise: the current password.
    if (profile.twoStepOn) {
      const factor = await verifiedFactor(supabase);
      const ok = factor && !(await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: cleanTotp(String(formData.get("code") ?? "")) })).error;
      if (!ok) return { error: "รหัส 6 หลักจากแอปไม่ถูกต้อง" };
    } else {
      const check = await supabase.auth.signInWithPassword({
        email: loginIdToEmail(profile.login_id),
        password: current,
      });
      if (check.error) return { error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" };
    }

    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) {
      if (error.code === "weak_password") return { error: "รหัสผ่านใหม่คาดเดาง่ายเกินไป ลองใช้ตัวอักษรผสมตัวเลข" };
      if (error.code === "same_password") return { error: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม" };
      throw error;
    }

    if (profile.must_change_password) {
      const { error: flagError } = await createAdminClient().from("profiles").update({ must_change_password: false }).eq("id", profile.id);
      if (flagError) throw flagError;
    }
    await logAudit(profile.id, "password-change", null, { twoStep: profile.twoStepOn });
  } catch (e) {
    await logError("change-password", e);
    return { error: "เปลี่ยนรหัสผ่านไม่สำเร็จ ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง" };
  }

  if (profile.must_change_password) redirect("/calendar");
  return { done: true };
}
