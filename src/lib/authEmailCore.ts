import { createHmac } from "node:crypto";
import { LOGIN_EMAIL_DOMAIN, normalizeLoginId } from "./roster";

// The hidden Supabase Auth email for a login ID, scrambled with LOGIN_EMAIL_SECRET so nobody outside our
// server can work it out. Without it, nobody can call Supabase's sign-in directly (skipping our log-in
// page and its lockout). Shared by the app (src/lib/authEmail.ts) and the scripts, which pass the secret.

export function loginEmailSecretFrom(env: NodeJS.ProcessEnv): string {
  const s = env.LOGIN_EMAIL_SECRET ?? "";
  if (s.length < 16) throw new Error("LOGIN_EMAIL_SECRET is missing or shorter than 16 characters");
  return s;
}

export function hiddenEmailFor(loginId: string, secret: string): string {
  const mac = createHmac("sha256", secret).update(`login:${normalizeLoginId(loginId)}`).digest("hex");
  return `u-${mac.slice(0, 32)}@${LOGIN_EMAIL_DOMAIN}`;
}

/** A stable, non-reversible key for what someone typed at log-in (for the lockout count). */
export function lockKeyFor(kind: string, value: string, secret: string): string {
  return createHmac("sha256", secret).update(`lock:${kind}:${value}`).digest("hex").slice(0, 32);
}
