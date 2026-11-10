"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { logError } from "@/lib/logs";
import { loginIdToEmail, newPasswordProblem } from "@/lib/roster";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ChangePasswordState = { error?: string; done?: boolean };

export async function changePassword(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const profile = await requireProfile();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const problem = newPasswordProblem(next, confirm);
  if (problem) return { error: problem };
  if (next === current) return { error: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม" };

  try {
    const supabase = await createClient();
    // Confirm the current password first, so someone using an unlocked
    // device can't quietly change it.
    const check = await supabase.auth.signInWithPassword({
      email: loginIdToEmail(profile.login_id),
      password: current,
    });
    if (check.error) return { error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" };

    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) {
      if (error.code === "weak_password") return { error: "รหัสผ่านใหม่คาดเดาง่ายเกินไป ลองใช้ตัวอักษรผสมตัวเลข" };
      if (error.code === "same_password") return { error: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม" };
      throw error;
    }

    if (profile.must_change_password) {
      const { error: flagError } = await createAdminClient()
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", profile.id);
      if (flagError) throw flagError;
    }
  } catch (e) {
    await logError("change-password", e);
    return { error: "เปลี่ยนรหัสผ่านไม่สำเร็จ ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง" };
  }

  if (profile.must_change_password) redirect("/calendar");
  return { done: true };
}
