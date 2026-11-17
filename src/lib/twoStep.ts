import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashCode } from "@/lib/signupServer";

// Two-step verification (Supabase Auth MFA, authenticator app). Admins must set it up; teachers may.
// An admin's FIRST set-up also needs a code sent to their verified email, so someone who only stole
// the password can't register their own phone. That email check is remembered in a signed cookie.

const COOKIE = "ptn-2step-email";
const MINUTES = 15;
const mac = (userId: string, exp: number) => hashCode(`two-step-email:${userId}:${exp}`);

export async function rememberEmailCheck(userId: string) {
  const exp = Date.now() + MINUTES * 60_000;
  (await cookies()).set(COOKIE, `${exp}.${mac(userId, exp)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MINUTES * 60,
  });
}

export async function passedEmailCheck(userId: string): Promise<boolean> {
  const raw = (await cookies()).get(COOKIE)?.value ?? "";
  const [expText, given] = raw.split(".");
  const exp = Number(expText);
  if (!given || !Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = Buffer.from(mac(userId, exp));
  const got = Buffer.from(given);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export async function forgetEmailCheck() {
  (await cookies()).delete({ name: COOKIE, path: "/" });
}

/** The user's verified authenticator, if any (one per person). */
export async function verifiedFactor(supabase: SupabaseClient) {
  const { data } = await supabase.auth.mfa.listFactors();
  return data?.totp?.[0] ?? null;
}

/** Removes set-ups that were started but never finished (each start makes a new one). */
export async function dropUnfinished(supabase: SupabaseClient) {
  const { data } = await supabase.auth.mfa.listFactors();
  for (const f of data?.all ?? []) {
    if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
}

/** The 6 digits someone typed (spaces, dashes and Thai digits allowed). */
export const cleanTotp = (s: string) =>
  String(s ?? "")
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50))
    .replace(/\D/g, "")
    .slice(0, 6);
