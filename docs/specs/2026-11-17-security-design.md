# PTN Connext security system — design + plan

## Context

PTN Connext will soon hold real data for ~600 students and their teachers (names, student IDs, emails, phones, grades/proof files, TCAS targets). The team wants it hardened **before the pilot** and presentable **to investors and school directors** (user: "all of the above").

Already in place (keep, don't rebuild): RLS on every table with `(select …)`-wrapped helpers (`0010`); owner-only Roadmap/targets/proof; private buckets + 60-second signed links (`/files/[id]`, `/roadmap/proof/[id]`); server-only tables (RLS, no policies); HMAC-hashed sign-up codes (`hashCode`, `src/lib/signupServer.ts`); no account-existence leak at log-in (`src/app/login/actions.ts`); `logLogin`/`logSignup`/`logError` (`src/lib/logs.ts`); `requireProfile()` (`src/lib/auth.ts`); `newPasswordProblem` (`src/lib/roster.ts`, shared by sign-up and change-password); `npm run check:security`.

Gaps found:
1. Seeded test accounts (incl. `admin.test`) with passwords written in `scripts/seed.ts` live in the **production** Supabase project. Production has **no real admin** yet (user).
2. No per-account lockout. Worse: the hidden auth email `<login_id>@ptn-connext.local` is guessable and the anon key is public, so anyone can call Supabase Auth directly and skip any check in our log-in action.
3. Admins log in with a password only.
4. No security headers in `next.config.ts`.
5. No admin audit trail; no backups (free plan); no breach-response plan (PDPA: notify within 72 h).

## Approaches (decided)

- A. In-app fixes only (free).
- **B. In-app fixes now + paid-plan protections prepared to switch on at upgrade — chosen.** Real risks fixed before the pilot at no cost; strongest story for investors.
- C. B + an outside penetration test — later, once funded.

User decisions: two-step **required for admins, optional for teachers**, none for students. Lockout **looser for students** (10 tries) than staff (5 tries), admin can unlock.

## Goals / non-goals / anti-goals

- Goals: no known passwords in production; password guessing stopped on every path; a stolen admin password alone is useless; browsers can't frame/inject Connext; every admin action traceable; a plain one-page security summary + a breach checklist.
- Non-goals: SMS codes, student two-step, a bug bounty, column encryption (Supabase encrypts disks), script nonces (later upgrade).
- Anti-goals: a class of 40 unable to sign in together (one shared school IP); new personal data forcing a PDPA re-consent; any admin locked out with no way back; a security page that oversells.

## Design

### 1. Separate test database + production clean-up
- Second free Supabase project "ptn-connext-test"; `.env.local` → test, Vercel → production. Every migration is pasted into **both** from now on (SETUP.md).
- `scripts/seed.ts` and `scripts/check-security.ts` refuse to run when `NEXT_PUBLIC_SUPABASE_URL` contains the production project ref (a committed constant; the ref isn't secret).
- **Real admin first** (no real admin exists): SETUP step — import yourself as a teacher, issue yourself a personal code as `admin.test`, sign up, run the make-admin SQL, set up two-step. Only then the clean-up.
- Clean-up SQL/script for production deletes the test accounts, their registrations and the TESTM5 slot, and **refuses if no other admin would remain**.

### 2. Unguessable hidden emails (closes the direct-to-Supabase path)
- `loginIdToEmail(id)` becomes `<HMAC-SHA256(LOGIN_EMAIL_SECRET, id), first 32 hex>@ptn-connext.local`, server-only (moves out of the pure `roster.ts` into a `server-only` module). Without the secret nobody can form a valid auth email, so all password attempts must go through our log-in action and its lockout.
- One-off script `npm run migrate:auth-emails` updates existing users with `auth.admin.updateUserById` (few accounts exist now). Sign-up, seed, check:security and admin password reset use the new function.
- New env var `LOGIN_EMAIL_SECRET` (different in test and production; .env.example, SETUP, Vercel). Changing it later requires re-running the script — documented.

### 3. Log-in lockout (`src/app/login/actions.ts`)
- Count only **wrong-password** failures (the wrong-tab and no-profile cases get a different `reason`, not counted) for the **normalised typed identifier** — known or unknown, so the lockout looks the same either way (no account-existence leak).
- Limits within 15 minutes since the last success/unlock: identifier that resolves to a student or is a student-ID-shaped input → **10**; email/phone/staff → **5**. Over the limit → "ใส่รหัสผ่านผิดหลายครั้ง กรุณารอ 15 นาที หรือติดต่อผู้ดูแลระบบ", no Supabase call.
- Storage: `login_events` gets `identifier` (normalised typed value; for emails store the masked form + hash, never the full email) and `reason`; unlocks go in a separate `login_unlocks (identifier, actor_id, created_at)` table so they don't inflate `admin_usage` counts. Index on `(identifier, created_at)`.
- Console: "ล็อกอยู่ตอนนี้" list (locked in the last 15 min) with "ปลดล็อก" (audited), next to the existing 5+-in-24h flag.
- No IP addresses stored (no PDPA bump); per-IP limits come from the Vercel Firewall (§8).
- Password rules extend `newPasswordProblem`: reject a small built-in common-password list and the login ID itself (it already rejects birthdates).

### 4. Two-step verification (Supabase Auth MFA, authenticator app/TOTP, free)
- Log-in action redirects to `/mfa` when the user is an admin or has a verified factor; otherwise as today.
- `/mfa` (in `PROTECTED` in `src/proxy.ts`; own gate, does **not** call the aal-checking `requireProfile`; has a log-out button): verify the 6-digit code, or enroll if there's no verified factor. **Admin first enrollment also requires a 6-digit email code** to the account's verified email (reuse `sendEmailCode`/`signup_email_codes` pattern) so a stolen password can't register the thief's phone. Unverified leftover factors are deleted before a new enroll.
- `requireProfile()`: read `aal` from the `getClaims()` it already does (`auth.ts`); check **before** PDPA: admin at aal1 → `/mfa`; anyone with `nextLevel = aal2` at aal1 → `/mfa`.
- Database: new migration redefines `is_admin()` to also require `(select auth.jwt()->>'aal') = 'aal2'`. Affects all admin read policies, `admin_usage`, `tcas_publish`, `can_see_post`/`can_manage_post` admin branches; service-role paths unaffected. An aal1 admin keeps teacher-level powers (`is_staff`, `my_role`) — stated in docs. **Rollout order: deploy the app → admins enroll → paste the migration.**
- Teachers: `/account/security` to turn it on/off (turning off needs a current code).
- Change password (`src/app/change-password/actions.ts`): for users with two-step, confirm with a fresh 6-digit code instead of re-signing-in (which drops to aal1 and makes Supabase refuse).
- Recovery: an admin removes another staff member's factor (Developer Console → ผู้ใช้, `auth.admin.mfa.deleteFactor`, audited). Docs: keep **at least 2 admins**, plus a last-admin SQL snippet.
- Seed/check (test project only): enroll a factor for `admin.test` via the API, verify it, save the returned secret to a gitignored file; check:security computes TOTP codes with `node:crypto`.

### 5. Security headers (`next.config.ts` `headers()`)
- CSP (production): `default-src 'self'`; `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`; `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob:` + Supabase; `font-src 'self' data:`; `connect-src 'self'` + Supabase https/wss; `worker-src 'self' blob:`; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`. Dev adds `'unsafe-eval'`. Preview deployments may allow `vercel.live`.
- pdf.js: `isEvalSupported: false` in `src/lib/compressFile.ts`.
- Plus HSTS (1 year), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- SECURITY.md says honestly: the CSP mainly blocks framing, plugins and outside connections; `'unsafe-inline'` limits its script protection.

### 6. Audit log
- `audit_events (id, actor_id, action, target, detail jsonb, created_at)`, RLS on, no policies; `logAudit()` in `src/lib/logs.ts` (no passwords/codes/full emails; reuse `maskEmail`/`maskPhone`).
- Written by: password reset, roster imports, registration release, personal codes, factor removal, unlocks, TCAS publish, Roadmap template edits, the sign-up master switch. (Room slots already log to `signup_events`.)
- Console: ประวัติ gets "การกระทำของผู้ดูแล"; ภาพรวม gets a "ความปลอดภัย" card (locked now, staff with/without two-step, factor removals).
- Retention: the daily cron (`/api/cron/expire-files`) also deletes `login_events`, `login_unlocks`, `signup_events`, `audit_events` older than 365 days.

### 7. Documents
- `docs/SECURITY.md` (Thai + English, one page, for proposals/directors): data held, who sees what, the layers and their honest limits, what switches on with Pro, how it's tested.
- `docs/INCIDENT.md` (Thai checklist): detect → contain (sign-up switch off, rotate Supabase JWT secret = everyone signed out, rotate service key / `SIGNUP_SECRET` / `LOGIN_EMAIL_SECRET` (+ re-run the email script) / `CRON_SECRET` / SMTP) → assess (audit + log-in history) → notify PDPC and affected people within 72 h → record.
- SETUP.md: keep the GitHub repo private; GitHub secret scanning + Dependabot; two-step on the team's own Supabase/Vercel/GitHub/Gmail accounts; **free backup before the pilot**: a `pg_dump` from the database connection string (install the PostgreSQL client tools), kept encrypted, off shared drives.

### 8. Paid layer (checklist in SECURITY.md/SETUP.md, switched on at upgrade)
- Supabase Pro: daily backups, leaked-password protection, session inactivity timeout (~8 h). Recommended before real student data goes in.
- Vercel Pro: Firewall rate limits on POST `/login` and `/signup` (generous, ~120/min/IP, one school IP = a whole class), BotID on `/signup`.

## Left to the builder
Exact CSP origins; `/mfa` and `/account/security` look (existing `Card`/`Field`/`Button`, a `loading.tsx` with Thai text, 375 px); the common-password list; migration number (`0017`, possibly split so the `is_admin()` change is its own later file `0018` matching the rollout order).

## Implementation order
1. Copy this design to `docs/specs/2026-11-17-security-design.md`.
2. Test-project guard in scripts; SETUP steps (test project, real admin first, clean-up with the last-admin check).
3. Unguessable hidden emails + migration script.
4. Migration 0017: `login_events.identifier/reason`, `login_unlocks`, `audit_events`, indexes.
5. Lockout + password rules (+ tests: `roster.test.ts`, a pure `lockoutLimit()` test).
6. Two-step: `/mfa`, `requireProfile`, log-in redirect, `/account/security`, change-password, factor removal, seed/check TOTP.
7. Migration 0018: `is_admin()` requires aal2 (pasted after admins enroll).
8. Headers + pdf.js setting.
9. `logAudit` calls, console views, retention in the cron.
10. Docs: SECURITY.md, INCIDENT.md, SETUP.md, .env.example, CLAUDE.md.

## Verification
- `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
- `npm run seed` + `npm run check:security` against the **test** project. New checks: the old guessable email no longer signs in; an aal1 admin JWT can't read admin-only tables or call `admin_usage`, an aal2 one can; `audit_events`/`login_unlocks` unreadable by student/teacher; scripts refuse the production URL.
- Browser (dev server, test project): lockout after 10 student / 5 staff wrong tries with the same message for unknown emails, admin unlock; admin log-in → email code → enroll → code; teacher opt-in, log-in with code, password change with code; headers present and no CSP errors while compressing a **scanned** PDF, uploading proof, opening a file, the QR card and sign-up; 375 px for the new pages.
