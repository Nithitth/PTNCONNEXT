# PTN Connext — Setup guide

Follow these steps once, in order. Takes about 30–45 minutes.

## 1. Install tools on your computer

- **Node.js 22 or newer (LTS)** from <https://nodejs.org>. This PC currently has Node 20.11. The Supabase library needs 22+, so upgrade it.
- **Git** from <https://git-scm.com>. Use the installer's default options.
- Restart the terminal afterwards, then check both are installed:

```bash
node --version
```

```bash
git --version
```

## 2. Create the Supabase project (database + login)

1. Sign up at <https://supabase.com> with the team's shared email, then **New project**.
   - Name: `ptn-connext`. Region: **Northeast Asia (Seoul), `ap-northeast-2`** (the live project). The Vercel functions run next to it: `vercel.json` sets `"regions": ["icn1"]` (Seoul). If the database ever moves, change both together.
   - Save the database password in a password manager.
2. Open **SQL Editor** → **New query**. Paste the whole of [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) and click **Run**. It should say "Success".
   - Then do the same for every other file in `supabase/migrations/`, in number order (`0002_…`, `0003_…`). Each file runs only once.
3. Turn off public sign-ups: **Authentication → Sign In / Providers**. Switch **off** "Allow new users to sign up".
   - Accounts are created only by the app's own sign-up page (on our server, after the room or personal code checks), so Supabase's open sign-up must stay off.
4. Under **Authentication → Providers → Email**:
   - Turn **off** "Confirm email". Logins use hidden internal emails; the app checks real emails itself (step 3a).
   - Keep the minimum password length at 8 or less.
   - Don't require letters *and* digits, or the seeded test accounts' passwords (`05052009`) won't work.
5. Get your keys: **Project Settings → API Keys** (or the **Connect** button). You need:
   - Project URL
   - `anon` / publishable key
   - `service_role` / secret key. **Keep this one secret**: it bypasses every security rule.

## 2a. A second, TEST project (for development and the security check)

Test accounts with known passwords must never be in the real school database. Make a second free project just for testing:

1. In Supabase, **New project** → name it `ptn-connext-test` (same region, Seoul).
2. **SQL Editor**: paste **all** migrations in one go. In PowerShell (keeps the Thai text intact):
   ```powershell
   Get-ChildItem supabase/migrations/*.sql | Sort-Object Name | Get-Content -Raw -Encoding UTF8 | Set-Clipboard
   ```
   Paste and **Run**.
3. Mark it as the test project (only here, never in the real one):
   ```sql
   insert into public.app_settings (key, value) values ('environment', '"test"');
   ```
   `npm run seed` and `npm run check:security` refuse to run on any database without this row.
4. Do steps 2.3 and 2.4 for this project too.
5. Your `.env.local` uses the **test** project's keys. Keep the real project's keys in a separate file `.env.production.local` (also never committed) for the few commands that must run on the real project.

From now on, **every new migration is pasted into both projects** (test first).

## 3. Connect the app on your computer

1. In the project folder, copy `.env.example` to a new file called `.env.local`.
2. Paste in the three values from step 2.5 (of the **test** project, step 2a), and make up long random texts for `CRON_SECRET`, `SIGNUP_SECRET` and `LOGIN_EMAIL_SECRET`.
3. Install the libraries:

```bash
npm install
```

4. Create the test accounts (2 students, 1 teacher, 1 admin). The list of accounts and their passwords is at the top of [`scripts/seed.ts`](../scripts/seed.ts).

```bash
npm run seed
```

5. Start the app:

```bash
npm run dev
```

6. Open <http://localhost:3000/login>.

## 3a. Email for sign-up codes (school Gmail)

Sign-up sends a 6-digit code to check each person's email. It's sent from a school Gmail account (about 500 emails a day).

1. Make (or pick) a Gmail account for the school, e.g. `ptnconnext.school@gmail.com`.
2. Turn on **2-Step Verification**: Google Account → **Security**.
3. Make an **app password**: Google Account → Security → **App passwords** → name it "PTN Connext" → copy the 16 letters.
4. In `.env.local` (and later in Vercel), set `SMTP_USER` to the Gmail address and `SMTP_PASS` to the 16 letters (no spaces).

Without these, local development prints the code in the dev-server terminal instead (`[dev email] code for …`), so you can still test.

## 3b. Google Drive for teachers' PDFs (optional, about 15 minutes)

Teachers can keep the PDFs they share in **their own Google Drive** instead of in Connext. Google then serves every download, so the school's Supabase space and download quota aren't used. Each teacher connects once with the big red "เชื่อมต่อ Google Drive" button; their PDFs go into a "PTN Connext" folder in their Drive, shared "anyone with the link can view". Without this step everything works as before.

1. Go to <https://console.cloud.google.com> with the team's Google account → **New project** → name it `ptn-connext`.
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen** (also called "Google Auth Platform"):
   - User type **External**. App name **PTN Connext**, support email = the team's email. **Don't upload a logo** (a logo makes Google review the app first).
   - **Data access / Scopes:** add only `https://www.googleapis.com/auth/drive.file` ("see, edit, create and delete only the specific Google Drive files you use with this app"). Connext can then see only the files it puts in Drive, never the rest of a teacher's Drive.
   - **Audience / Publishing status:** press **Publish app** so it says **In production**. In "Testing" every teacher's connection silently stops working after 7 days.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** → type **Web application**, name "PTN Connext". Under **Authorised redirect URIs** add:
   - `http://localhost:3000/api/google/callback`
   - `https://<the live site>/api/google/callback` (the real Vercel address)
5. Copy the **Client ID** and **Client secret** into `.env.local` (and later Vercel) as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and make up a long random `GOOGLE_TOKEN_SECRET` (different in Vercel). Restart `npm run dev`.
6. Paste migration `0019_google_drive.sql` into the test project, then later into the real one.
7. **For Google's app verification** (on the live site): in **Branding**, set the home page to `https://<the live site>/`, the privacy policy to `https://<the live site>/privacy` (public, no log-in), and add the live site's domain under **Authorised domains**. Then prove you own the site: <https://search.google.com/search-console> → **Add property → URL prefix** → the live address → **HTML tag**. Copy only the `content="…"` value into Vercel as `GOOGLE_SITE_VERIFICATION`, redeploy, and press **Verify**. Finally, in **Verification Centre**, press **Submit for verification** (Google takes a few working days).

If a teacher's school Google account can't share files with "anyone with the link" (some school Workspace accounts block it), Connext tells them so; they can connect a personal Gmail instead or keep the file in Connext.

## 3c. Drive ของโรงเรียน: every teacher's PDF in the school's Shared Drive (recommended when the school has Google Workspace)

One admin connects the school's **Shared Drive** once; teachers then connect nothing and every PDF goes there (`ภาคเรียน / วิชา / ห้อง · ชื่อเรื่อง.pdf`). After 180 days the link is switched off and the file moves to a **หมดอายุ** folder (kept). Design: `docs/specs/2026-11-19-school-drive-design.md`. No migration needed.

1. **Google Cloud, with the school account** (it must belong to the school's organisation): <https://console.cloud.google.com> → **New project** (`ptn-connext`, Organization = the school) → **APIs & Services → Library → Google Drive API → Enable**.
2. **OAuth consent screen / Google Auth Platform → Audience: Internal.** Internal apps need **no Google verification** (only school accounts can sign in). App name **PTN Connext**, support email = the school account. Data access: add `https://www.googleapis.com/auth/drive` and `https://www.googleapis.com/auth/drive.file`.
3. **Credentials → Create credentials → OAuth client ID → Web application.** Authorised redirect URIs: `http://localhost:3000/api/google/callback` and `https://<the live site>/api/google/callback`.
4. Put the new **Client ID** and **Client secret** in Vercel (and `.env.production.local` / `.env.local`) as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, replacing the old ones (keep `GOOGLE_TOKEN_SECRET`). Redeploy. Teachers who had connected their own Drive with the old keys simply stop using it (the school drive takes over).
5. **The Shared Drive:** in Google Drive (school account) → **Shared drives → New** (e.g. "PTN Connext"). The account that connects must be its **Manager**. Check that a file in it can be shared **"Anyone with the link"** (if not, ask IT to allow it for this Shared Drive).
6. On the live site: **คอนโซลผู้พัฒนา → ครู → Drive ของโรงเรียน → เชื่อมต่อ Drive ของโรงเรียน** → sign in with the school account → allow → pick the Shared Drive → **ทดสอบการเชื่อมต่อ**.

Best practice: ask IT for a dedicated account (e.g. `connext@<school>.ac.th`), make it a Manager of the Shared Drive and connect with it, so the system isn't tied to one person. The files belong to the Shared Drive, so reconnecting with another Manager later loses nothing. If the connection breaks, old links keep working, new PDFs go to Connext, and the admin menu shows an alert until someone reconnects.

## 4. Check it works (5 minutes)

- [ ] Log in as student `90001` with `05052009`. You should see the PDPA page, then a "set a new password" screen. Click **ข้ามไปก่อน** (skip): you land on the calendar with a yellow reminder bar at the top.
- [ ] Log in as `teacher.test` while "นักเรียน" (student) is selected. You should get a message telling you to pick "ครู" (teacher).
- [ ] As the student, open <http://localhost:3000/admin>. You should be sent back to the home page.
- [ ] Log in as `admin.test` using "ครู". You should see **คอนโซลผู้พัฒนา** in the menu, and the login report should list your logins.
- [ ] Go to Admin → **นำเข้ารายชื่อ**. Download the student template, add 2 rows, and import it. Both rows should show as pre-registered (no logins are made).
- [ ] Go to Admin → **ลงทะเบียน & เข้าสู่ระบบ → ห้องเรียน & QR**. ม.5/1 should be open (the seed opened it, code `TESTM5`). In a private window, open <http://localhost:3000/signup>, enter `TESTM5`, then the name **ลองลงทะเบียน ทดสอบ**: student ID `90003` should appear. Finish with an email you can read and a new password.
- [ ] Back on the dashboard, ม.5/1 should show the new registration, and **ประวัติ** should list each step.
- [ ] Go to Admin → **ข้อมูล TCAS**. Click **ดึงข้อมูลจาก TCAS** for มหิดล, then **เผยแพร่**. Open **TCAS** in the menu and search for a program.

## 5. Make yourself a real admin (on the real project)

The real project must end with **at least 2 real admins** and **no test accounts**. In this order:

1. **Hidden log-in emails:** set `LOGIN_EMAIL_SECRET` in `.env.production.local` and in Vercel (the same value, different from the test one), then run once:
   ```
   npm run migrate:auth-emails -- --env=.env.production.local --apply
   ```
2. Paste `0017_security.sql` into the real project. Deploy the new version (step 6).
3. Give yourself a teacher personal code (`.env.production.local` needs the same `SIGNUP_SECRET` as Vercel):
   ```
   npm run first-admin -- --env=.env.production.local --name="นายสมชาย ใจดี"
   ```
   Open the live site's **/signup → ครู**, type that name, pick the subject “ไม่ได้สอนวิชาเหล่านี้”, the code, and **your email** (verified with a code), then a password.
4. In Supabase **SQL Editor** (replace the email):
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
5. Log in again: Connext asks for a code sent to your email, then shows a QR code for an authenticator app (Google Authenticator or Microsoft Authenticator). Do the same for the second admin.
6. When every admin has two-step, paste `0018_admin_two_step.sql`. From then on admin powers in the database need two-step.
7. Remove the test accounts from the real project (it refuses if no other admin would be left):
   ```sql
   do $$
   declare test_ids uuid[] := array(select id from public.profiles where login_id in ('90001','90002','90003','teacher.test','admin.test'));
   begin
     if (select count(*) from public.profiles where role = 'admin' and not (id = any(test_ids))) < 1 then
       raise exception 'No real admin yet: do steps 3-5 first';
     end if;
     delete from auth.users where id = any(test_ids);
     delete from public.registrations where login_id in ('90001','90002','90003') or (kind = 'teacher' and first_name = 'ครูใหม่' and last_name = 'ทดสอบ');
     delete from public.signup_rooms where code = 'TESTM5';
   end $$;
   ```

**If an admin loses their phone:** another admin opens **ผู้ใช้**, searches for them and clicks **ปิดการยืนยันสองขั้นตอน**; they set it up again at their next log-in. If the *only* admin is locked out, in the Supabase SQL Editor: `delete from auth.mfa_factors where user_id = (select id from public.profiles where email = 'you@example.com');`

**Before the pilot, take a backup** (the free plan has none): Supabase → **Connect** → copy the *Session pooler* connection string, install the PostgreSQL tools (`winget install PostgreSQL.PostgreSQL.18`; the name needs the version number, and 18 can back up older databases too), then `& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" "<connection string>" -Fc -f ptn-backup.dump` (the full path, because the installer doesn't add it to PATH). Keep the file in an encrypted place (e.g. a password-protected zip), never in a shared drive or chat.

**Protect the team's own accounts:** turn on two-step for the Supabase, Vercel, GitHub and school Gmail accounts. Keep the GitHub repository **private**, and turn on **Settings → Code security → Secret scanning** and **Dependabot alerts**.

## 6. Put it online (Vercel)

1. Create a GitHub repository and push this folder. `.env.local` is **not** uploaded, which is correct.
2. Sign up at <https://vercel.com> with GitHub, then **Add New → Project** and pick the repository.
3. Under **Environment Variables**, add the **real** project's Supabase keys (from `.env.production.local`), `SIGNUP_SECRET`, `CRON_SECRET` and `LOGIN_EMAIL_SECRET` (long random texts, different from your test ones), and `SMTP_USER` / `SMTP_PASS` (step 3a). Without the SMTP values, sign-up can't send email codes on the live site. Vercel uses it to run the daily clean-up that deletes teachers' PDFs after 180 days (`vercel.json` → `crons`, 03:00 Thai time). Without it, expired PDFs still can't be downloaded, but their files are not deleted.
4. Click **Deploy**. Every later `git push` updates the site automatically.
5. Before launch, follow [PILOT.md](PILOT.md): school sign-off, cleaning the test data, a 1–2 classroom pilot, then everyone.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Run the app locally at localhost:3000 |
| `npm test` | Check the pure rules (roster, calendar, TCAS, Roadmap, sign-up) |
| `npm run check:security` | Log in as the test student/teacher and confirm the database rules block what they should (needs the test accounts with their birthdate passwords) |
| `npm run lint` | Find common code mistakes |
| `npm run build` | Make sure the app builds before you push |

## Where things are

| Folder / file | What's inside |
|---|---|
| `src/app/` | One folder per page (`login`, `calendar`, `teacher`, `admin`, …) |
| `src/components/` | Shared UI pieces (nav bar, forms, buttons) |
| `src/lib/auth.ts` | "Who is logged in" and the PDPA / password / role gates |
| `src/lib/roster.ts` | Name and classroom reading rules for the Excel import |
| `src/lib/signup.ts` | Sign-up rules: name matching, phone/email, codes, time slots, log-in lockout |
| `docs/SECURITY.md` / `docs/INCIDENT.md` | The security summary for the school and investors / what to do if something goes wrong |
| `supabase/migrations/` | Database tables and security rules (RLS) |
| `docs/specs/` | The approved design |
