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
   - Accounts are only created by the roster import, so this has to be off.
4. Under **Authentication → Providers → Email**:
   - Turn **off** "Confirm email". We use hidden fake emails, so confirmation mails can't arrive.
   - Keep the minimum password length at 8 or less.
   - Don't require letters *and* digits, or birthdate passwords (`05052009`) won't work.
5. Get your keys: **Project Settings → API Keys** (or the **Connect** button). You need:
   - Project URL
   - `anon` / publishable key
   - `service_role` / secret key. **Keep this one secret**: it bypasses every security rule.

## 3. Connect the app on your computer

1. In the project folder, copy `.env.example` to a new file called `.env.local`.
2. Paste in the three values from step 2.5.
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

## 4. Check it works (5 minutes)

- [ ] Log in as student `90001` with `05052009`. You should see the PDPA page, then a "set a new password" screen. Click **ข้ามไปก่อน** (skip): you land on the calendar with a yellow reminder bar at the top.
- [ ] Log in as `teacher.test` while "นักเรียน" (student) is selected. You should get a message telling you to pick "ครู" (teacher).
- [ ] As the student, open <http://localhost:3000/admin>. You should be sent back to the home page.
- [ ] Log in as `admin.test` using "ครู". You should see **คอนโซลผู้พัฒนา** in the menu, and the login report should list your logins.
- [ ] Go to Admin → **นำเข้ารายชื่อ**. Download the student template, add 2 rows, and import it. Both rows should show as created.
- [ ] Go to Admin → **ข้อมูล TCAS**. Click **ดึงข้อมูลจาก TCAS** for มหิดล, then **เผยแพร่**. Open **TCAS** in the menu and search for a program.

## 5. Make yourself a real admin

Import the teachers first. Then, in Supabase **SQL Editor**, run this (replace the username):

```sql
update public.profiles set role = 'admin' where login_id = 'your.username';
```

## 6. Put it online (Vercel)

1. Create a GitHub repository and push this folder. `.env.local` is **not** uploaded, which is correct.
2. Sign up at <https://vercel.com> with GitHub, then **Add New → Project** and pick the repository.
3. Under **Environment Variables**, add the same three values from `.env.local`.
4. Click **Deploy**. Every later `git push` updates the site automatically.
5. Before launch, follow [PILOT.md](PILOT.md): school sign-off, cleaning the test data, a 1–2 classroom pilot, then everyone.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Run the app locally at localhost:3000 |
| `npm test` | Check the roster and birthdate rules |
| `npm run check:security` | Log in as the test student/teacher and confirm the database rules block what they should (needs the test accounts with their birthdate passwords) |
| `npm run lint` | Find common code mistakes |
| `npm run build` | Make sure the app builds before you push |

## Where things are

| Folder / file | What's inside |
|---|---|
| `src/app/` | One folder per page (`login`, `calendar`, `teacher`, `admin`, …) |
| `src/components/` | Shared UI pieces (nav bar, forms, buttons) |
| `src/lib/auth.ts` | "Who is logged in" and the PDPA / password / role gates |
| `src/lib/roster.ts` | Birthdate and classroom reading rules for the Excel import |
| `supabase/migrations/` | Database tables and security rules (RLS) |
| `docs/specs/` | The approved design |
