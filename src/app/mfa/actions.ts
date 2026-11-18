"use server";

import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { lockKey } from "@/lib/authEmail";
import { getCurrentProfile } from "@/lib/auth";
import { failuresFor, TWO_STEP_LOCKED_MESSAGE } from "@/lib/lockout";
import { logAudit, logError, logLogin } from "@/lib/logs";
import { sendEmailCode } from "@/lib/mail";
import { EMAIL_CODE_MINUTES, EMAIL_CODE_TRIES, EMAIL_RESEND_SECONDS, maskEmail, newEmailCode } from "@/lib/signup";
import { hashCode } from "@/lib/signupServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cleanTotp, dropUnfinished, forgetEmailCheck, passedEmailCheck, rememberEmailCheck, verifiedFactor } from "@/lib/twoStep";

export type TwoStepResult = { ok?: boolean; error?: string; qr?: string; secret?: string; factorId?: string; sentTo?: string };

const FAILED = "ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง";
const WRONG_CODE = "รหัสไม่ถูกต้อง ดูรหัส 6 หลักล่าสุดในแอปยืนยันตัวตนแล้วลองใหม่";
const TWO_STEP_LIMIT = 5;

async function signedIn() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

/** Log-in, step 2: the 6-digit code from the authenticator app. */
export async function verifyTwoStep(raw: string): Promise<TwoStepResult> {
  const profile = await signedIn();
  const key = lockKey("two-step", profile.id);
  try {
    const supabase = await createClient();
    if ((await failuresFor(key)) >= TWO_STEP_LIMIT) {
      await supabase.auth.signOut();
      return { error: TWO_STEP_LOCKED_MESSAGE };
    }
    const factor = await verifiedFactor(supabase);
    if (!factor) return { error: "ยังไม่ได้ตั้งค่าการยืนยันสองขั้นตอน" };
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: cleanTotp(raw) });
    if (error) {
      await logLogin(profile.login_id, false, profile.id, { identifier: key, reason: "mfa-wrong" });
      return { error: WRONG_CODE };
    }
    await logLogin(profile.login_id, true, profile.id, { identifier: key, reason: "two-step" });
  } catch (e) {
    await logError("mfa/verify", e);
    return { error: FAILED };
  }
  redirect("/calendar");
}

/** Admin's first set-up: email a 6-digit code to their verified email. */
export async function sendSetupEmail(): Promise<TwoStepResult> {
  const profile = await signedIn();
  try {
    const admin = createAdminClient();
    const { data: me } = await admin.from("profiles").select("email, email_verified_at").eq("id", profile.id).single();
    if (!me?.email || !me.email_verified_at) return { error: "บัญชีนี้ยังไม่มีอีเมลที่ยืนยันแล้ว ให้ผู้ดูแลระบบอีกคนช่วย (ดูคู่มือ docs/SECURITY.md)" };
    const slot = `two-step:${me.email}`;
    const { data: prev } = await admin.from("signup_email_codes").select("last_sent_at").eq("email", slot).maybeSingle();
    if (prev && Date.now() - new Date(prev.last_sent_at).getTime() < EMAIL_RESEND_SECONDS * 1000) {
      return { error: `เพิ่งส่งรหัสไปแล้ว รอ ${EMAIL_RESEND_SECONDS} วินาทีแล้วค่อยขอใหม่` };
    }
    const code = newEmailCode((n) => randomInt(n));
    const { error } = await admin.from("signup_email_codes").upsert({
      email: slot,
      code_hash: hashCode(`email:${slot}:${code}`),
      expires_at: new Date(Date.now() + EMAIL_CODE_MINUTES * 60_000).toISOString(),
      attempts: 0,
      last_sent_at: new Date().toISOString(),
    });
    if (error) throw error;
    await sendEmailCode(me.email, code, "two-step");
    return { ok: true, sentTo: maskEmail(me.email) };
  } catch (e) {
    await logError("mfa/sendSetupEmail", e);
    return { error: FAILED };
  }
}

/** Admin's first set-up: check the emailed code. */
export async function checkSetupEmail(raw: string): Promise<TwoStepResult> {
  const profile = await signedIn();
  try {
    const admin = createAdminClient();
    const { data: me } = await admin.from("profiles").select("email").eq("id", profile.id).single();
    const slot = `two-step:${me?.email ?? ""}`;
    const { data: row } = await admin.from("signup_email_codes").select("code_hash, expires_at, attempts").eq("email", slot).maybeSingle();
    if (!row || new Date(row.expires_at) < new Date()) return { error: "รหัสหมดอายุแล้ว กด “ส่งรหัสอีกครั้ง”" };
    if (row.attempts >= EMAIL_CODE_TRIES) return { error: "กรอกผิดหลายครั้งเกินไป กด “ส่งรหัสอีกครั้ง”" };
    if (row.code_hash !== hashCode(`email:${slot}:${String(raw ?? "").replace(/\D/g, "")}`)) {
      await admin.from("signup_email_codes").update({ attempts: row.attempts + 1 }).eq("email", slot);
      return { error: "รหัสไม่ถูกต้อง" };
    }
    await admin.from("signup_email_codes").delete().eq("email", slot);
    await rememberEmailCheck(profile.id);
    return { ok: true };
  } catch (e) {
    await logError("mfa/checkSetupEmail", e);
    return { error: FAILED };
  }
}

/** Starts a set-up: returns the QR code (and the secret, for typing in by hand). */
export async function startSetup(): Promise<TwoStepResult> {
  const profile = await signedIn();
  if (profile.role === "student") return { error: "การยืนยันสองขั้นตอนมีสำหรับครูและผู้ดูแลระบบ" };
  try {
    const supabase = await createClient();
    if (await verifiedFactor(supabase)) return { error: "ตั้งค่าการยืนยันสองขั้นตอนไว้แล้ว" };
    if (profile.role === "admin" && !(await passedEmailCheck(profile.id))) return { error: "ยืนยันอีเมลก่อน แล้วค่อยเริ่มตั้งค่า" };
    await dropUnfinished(supabase);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "PTN Connext", issuer: "PTN Connext" });
    if (error) throw error;
    // We draw the QR ourselves: Supabase's own is a 360 KB SVG with no viewBox (it gets cropped when shrunk,
    // so phones couldn't read it) and its account name is the scrambled hidden email. Ours is a PNG with a
    // white border, labelled with the person's name.
    const uri = `otpauth://totp/${encodeURIComponent(`PTN Connext:${profile.display_name}`)}?${new URLSearchParams({
      secret: data.totp.secret,
      issuer: "PTN Connext",
      algorithm: "SHA1",
      digits: "6",
      period: "30",
    })}`;
    const qr = await QRCode.toDataURL(uri, { width: 320, margin: 3, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
    return { ok: true, factorId: data.id, qr, secret: data.totp.secret };
  } catch (e) {
    await logError("mfa/startSetup", e);
    return { error: FAILED };
  }
}

/** Finishes a set-up with the first code from the app. The session is then fully verified (aal2). */
export async function finishSetup(factorId: string, raw: string): Promise<TwoStepResult> {
  const profile = await signedIn();
  try {
    const supabase = await createClient();
    if (profile.role === "admin" && !(await passedEmailCheck(profile.id))) return { error: "ยืนยันอีเมลก่อน แล้วค่อยเริ่มตั้งค่า" };
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: String(factorId), code: cleanTotp(raw) });
    if (error) return { error: WRONG_CODE };
    await forgetEmailCheck();
    await logAudit(profile.id, "two-step-on", profile.login_id);
    return { ok: true };
  } catch (e) {
    await logError("mfa/finishSetup", e);
    return { error: FAILED };
  }
}

/** Teachers may turn two-step off again (with a current code). Admins can't: it's required for them. */
export async function turnOffTwoStep(raw: string): Promise<TwoStepResult> {
  const profile = await signedIn();
  if (profile.role === "admin") return { error: "ผู้ดูแลระบบต้องใช้การยืนยันสองขั้นตอนเสมอ" };
  try {
    const supabase = await createClient();
    const factor = await verifiedFactor(supabase);
    if (!factor) return { ok: true };
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: cleanTotp(raw) });
    if (error) return { error: WRONG_CODE };
    const { error: offError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (offError) throw offError;
    await supabase.auth.refreshSession(); // drop back to a normal session
    await logAudit(profile.id, "two-step-off", profile.login_id);
    return { ok: true };
  } catch (e) {
    await logError("mfa/turnOff", e);
    return { error: FAILED };
  }
}

export async function leaveTwoStep(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
