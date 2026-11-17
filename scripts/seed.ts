/**
 * Creates TEST data for development: the 8 classrooms, the 6 subjects, and one
 * account per role. Safe to run more than once (skips what already exists).
 *
 *   npm run seed
 *
 * Test accounts (already registered; check:security needs these passwords unchanged):
 *   นักเรียน ม.5/1   90001          05052009
 *   นักเรียน ม.5/2   90002          06062009
 *   ครู              teacher.test   12031980   (สอนคณิตศาสตร์ ใน ม.5/1 และ ม.5/2; also logs in by
 *                                              phone 0800000001 or email teacher.test@example.com)
 *   ผู้ดูแลระบบ      admin.test     01011990   (log in with “ครู”)
 *
 * Not yet registered, for trying /signup:
 *   นักเรียน ม.5/1   90003  ด.ญ.ลองลงทะเบียน ทดสอบ   room code TESTM5 (open for 2 hours from each seed run)
 *   ครู              นางครูใหม่ ทดสอบ (คณิตศาสตร์)      personal code TST-SGN-UP2 (needs SIGNUP_SECRET)
 *
 * admin.test also gets two-step verification; its secret is saved to .ptn-test-totp.json (gitignored).
 * Add that secret to an authenticator app to log in as admin.test in the browser.
 *
 * Runs only on the TEST Supabase project (marked in app_settings; see docs/SETUP.md step 2a).
 */
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { hiddenEmailFor, loginEmailSecretFrom } from "../src/lib/authEmailCore";
import { currentAcademicYear } from "../src/lib/roster";
import { CLASSROOMS, SUBJECTS } from "../src/lib/school";
import { nameKey, nameKeyFromFull } from "../src/lib/signup";
import { loadEnv, readTestFactor, requireTestDatabase, saveTestFactor, totp } from "./lib";

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const loginIdToEmail = (id: string) => hiddenEmailFor(id, loginEmailSecretFrom(process.env));

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) {
    console.error(`✗ ${what}`, error);
    process.exit(1);
  }
  return data;
}

/** Stops on an error (for calls whose result we don't need). */
async function ok(p: PromiseLike<{ error: unknown }>, what: string) {
  const { error } = await p;
  if (error) {
    console.error(`✗ ${what}`, error);
    process.exit(1);
  }
}

async function main() {
  await requireTestDatabase(db);
  const year = currentAcademicYear();

  // The 8 Phase 1 classrooms and 6 subjects (src/lib/school.ts).
  const rooms = await must(
    db
      .from("classrooms")
      .upsert(
        CLASSROOMS.map((c) => ({ ...c, academic_year: year })),
        { onConflict: "grade,room,academic_year" },
      )
      .select("id, grade, room"),
    "classrooms",
  );
  const roomId = (r: number) => (rooms ?? []).find((x) => x.grade === 5 && x.room === r)!.id as string;

  const subjects = await must(
    db
      .from("subjects")
      .upsert(
        SUBJECTS.map((s) => ({ code: s.code, name_th: s.name, color: s.color })),
        { onConflict: "code" },
      )
      .select("id, code"),
    "subjects",
  );
  const math = (subjects ?? []).find((s) => s.code === "math")!.id as string;

  const accounts = [
    { login_id: "90001", password: "05052009", role: "student", display_name: "ด.ญ.ทดสอบ ห้องหนึ่ง", classroom_id: roomId(1) },
    { login_id: "90002", password: "06062009", role: "student", display_name: "ด.ช.ทดสอบ ห้องสอง", classroom_id: roomId(2) },
    { login_id: "teacher.test", password: "12031980", role: "teacher", display_name: "ครูทดสอบ ใจดี", classroom_id: null },
    { login_id: "admin.test", password: "01011990", role: "admin", display_name: "ผู้ดูแลทดสอบ", classroom_id: null },
  ] as const;

  const ids: Record<string, string> = {};
  for (const a of accounts) {
    const existing = await must(db.from("profiles").select("id").eq("login_id", a.login_id).maybeSingle(), a.login_id);
    if (existing) {
      ids[a.login_id] = existing.id;
      // Keep the hidden email in step with LOGIN_EMAIL_SECRET.
      await ok(db.auth.admin.updateUserById(existing.id, { email: loginIdToEmail(a.login_id), email_confirm: true }), `email ${a.login_id}`);
      console.log(`· ${a.login_id} already exists`);
      continue;
    }
    const { data, error } = await db.auth.admin.createUser({
      email: loginIdToEmail(a.login_id),
      password: a.password,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.error(`✗ create ${a.login_id}`, error);
      process.exit(1);
    }
    const { password: _pw, ...profile } = a;
    void _pw;
    await must(db.from("profiles").insert({ id: data.user.id, ...profile, must_change_password: true }), `profile ${a.login_id}`);
    ids[a.login_id] = data.user.id;
    console.log(`✓ ${a.login_id} (${a.role})`);
  }

  await must(
    db.from("teaching_assignments").upsert(
      [
        { teacher_id: ids["teacher.test"], classroom_id: roomId(1), subject_id: math },
        { teacher_id: ids["teacher.test"], classroom_id: roomId(2), subject_id: math },
      ],
      { onConflict: "teacher_id,classroom_id,subject_id", ignoreDuplicates: true },
    ),
    "teaching_assignments",
  );

  // Names and contact details on the test accounts (log-in by phone/email for the test teacher).
  const names: Record<string, { first_name: string; last_name: string; phone?: string; email?: string; email_verified_at?: string }> = {
    "90001": { first_name: "ทดสอบ", last_name: "ห้องหนึ่ง" },
    "90002": { first_name: "ทดสอบ", last_name: "ห้องสอง" },
    "teacher.test": { first_name: "ครูทดสอบ", last_name: "ใจดี", phone: "0800000001", email: "teacher.test@example.com" },
    "admin.test": { first_name: "ผู้ดูแล", last_name: "ทดสอบ", email: "admin.test@example.com", email_verified_at: new Date().toISOString() },
  };
  for (const [loginId, n] of Object.entries(names)) {
    await must(db.from("profiles").update(n).eq("id", ids[loginId]), `names ${loginId}`);
  }

  // Pre-registrations: the two test students as already registered, plus one student who isn't yet.
  await must(
    db.from("registrations").upsert(
      [
        { kind: "student", login_id: "90001", prefix: "ด.ญ.", first_name: "ทดสอบ", last_name: "ห้องหนึ่ง", name_key: nameKey("ทดสอบ", "ห้องหนึ่ง"), classroom_id: roomId(1), claimed_by: ids["90001"] },
        { kind: "student", login_id: "90002", prefix: "ด.ช.", first_name: "ทดสอบ", last_name: "ห้องสอง", name_key: nameKey("ทดสอบ", "ห้องสอง"), classroom_id: roomId(2), claimed_by: ids["90002"] },
        { kind: "student", login_id: "90003", prefix: "ด.ญ.", first_name: "ลองลงทะเบียน", last_name: "ทดสอบ", name_key: nameKey("ลองลงทะเบียน", "ทดสอบ"), classroom_id: roomId(1) },
      ],
      { onConflict: "login_id" },
    ),
    "student registrations",
  );

  // A teacher who hasn't signed up yet, with a known personal code (scrambled with SIGNUP_SECRET, like the app).
  const secret = process.env.SIGNUP_SECRET ?? "";
  const teacherName = "นางครูใหม่ ทดสอบ";
  const teacherKey = nameKeyFromFull(teacherName);
  const teacherValues = {
    prefix: "นาง",
    first_name: "ครูใหม่",
    last_name: "ทดสอบ",
    assignments: [{ subject_code: "math", classroom_id: roomId(1) }],
    code_hash: secret.length >= 16 ? createHmac("sha256", secret).update("TSTSGNUP2").digest("hex") : null,
    code_expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    code_attempts: 0,
  };
  const existingTeacher = await must(
    db.from("registrations").select("id, claimed_by").eq("kind", "teacher").eq("name_key", teacherKey).maybeSingle(),
    "teacher registration",
  );
  if (!existingTeacher) {
    await must(db.from("registrations").insert({ kind: "teacher", name_key: teacherKey, ...teacherValues }), "teacher registration");
  } else if (!existingTeacher.claimed_by) {
    await must(db.from("registrations").update(teacherValues).eq("id", existingTeacher.id), "teacher registration");
  }
  if (!teacherValues.code_hash) console.log("· SIGNUP_SECRET not set: the test teacher has no personal code");

  // ม.5/1's sign-up slot: open now for 2 hours with code TESTM5.
  await must(
    db.from("signup_rooms").upsert({
      classroom_id: roomId(1),
      code: "TESTM5",
      starts_at: new Date(Date.now() - 60_000).toISOString(),
      ends_at: new Date(Date.now() + 2 * 3_600_000).toISOString(),
    }),
    "signup room",
  );

  // admin.test's two-step verification (admins must have it). Reuses the saved secret if it still matches.
  const adminId = ids["admin.test"];
  const { data: factorList } = await db.auth.admin.mfa.listFactors({ userId: adminId });
  const saved = readTestFactor();
  const verified = (factorList?.factors ?? []).filter((f) => f.status === "verified");
  if (saved && saved.userId === adminId && verified.some((f) => f.id === saved.factorId)) {
    console.log("· admin.test two-step already set up");
  } else {
    for (const f of factorList?.factors ?? []) await db.auth.admin.mfa.deleteFactor({ id: f.id, userId: adminId });
    const c = createClient(url!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    await ok(c.auth.signInWithPassword({ email: loginIdToEmail("admin.test"), password: "01011990" }), "admin.test sign-in");
    const { data: enrolled, error: enrollError } = await c.auth.mfa.enroll({ factorType: "totp", friendlyName: "PTN Connext test" });
    if (enrollError || !enrolled) {
      console.error("✗ admin.test enroll", enrollError);
      process.exit(1);
    }
    await ok(c.auth.mfa.challengeAndVerify({ factorId: enrolled.id, code: totp(enrolled.totp.secret) }), "admin.test verify");
    saveTestFactor({ userId: adminId, factorId: enrolled.id, secret: enrolled.totp.secret });
    await c.auth.signOut();
    console.log("✓ admin.test two-step set up (secret in .ptn-test-totp.json)");
  }

  console.log(`\nDone. Academic year ${year}. Run "npm run dev" and log in at http://localhost:3000/login`);
}

main();
