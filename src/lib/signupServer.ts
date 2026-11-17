import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SIGNUP_TICKET_MINUTES } from "@/lib/signup";

// Server-only helpers for sign-up: scrambling codes, the signed step cookie, and the master switch.

function secret(): string {
  const s = process.env.SIGNUP_SECRET ?? "";
  if (s.length < 16) throw new Error("SIGNUP_SECRET is missing or shorter than 16 characters");
  return s;
}

/** A code scrambled one way (HMAC-SHA256), so the database never holds a usable code. */
export const hashCode = (code: string) => createHmac("sha256", secret()).update(code).digest("hex");

// ─── The step cookie ─────────────────────────────────────────

/** What a half-finished sign-up has proven so far. Re-checked against the database at the end. */
export type Ticket = {
  kind: "student" | "teacher";
  /** Student: the room whose open slot (or a personal code) let them in. */
  classroomId?: string;
  /** Student who came in with a personal code: only this pre-registration may match. */
  personalFor?: string;
  /** Set once the name (and for teachers the code) matched a pre-registration. */
  registrationId?: string;
  /** Verified email, or a teacher's phone. */
  email?: string;
  phone?: string;
  /** Email waiting for its check code. */
  pendingEmail?: string;
  exp: number;
};

const COOKIE = "ptn-signup";
const sign = (body: string) => createHmac("sha256", secret()).update(`ticket:${body}`).digest("base64url");

export async function readTicket(): Promise<Ticket | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [body, mac] = raw.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Ticket;
    return t.exp > Date.now() ? t : null;
  } catch {
    return null;
  }
}

/** Saves the ticket (each step refreshes its 20 minutes). */
export async function writeTicket(t: Omit<Ticket, "exp"> & { exp?: number }) {
  const ticket: Ticket = { ...t, exp: Date.now() + SIGNUP_TICKET_MINUTES * 60_000 };
  const body = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  (await cookies()).set(COOKIE, `${body}.${sign(body)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/signup",
    maxAge: SIGNUP_TICKET_MINUTES * 60,
  });
}

export async function clearTicket() {
  (await cookies()).delete({ name: COOKIE, path: "/signup" });
}

// ─── Master switch ───────────────────────────────────────────

/** Whether sign-ups are accepted (Developer Console switch). Pass the admin client. */
export async function isSignupOpen(admin: SupabaseClient): Promise<boolean> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "signup_open").maybeSingle();
  return data?.value !== false;
}
