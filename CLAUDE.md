# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

PTN Connext is a school web app for one Thai high school.
- **Phase 1 (current):** Smart Calendar. Teachers post assignments, exams and materials to classrooms, and students view them.
- **Phase 2 (in progress):** TCASter, a university-admissions hub. Release 1 (program info + score calculator) is built; design in `docs/specs/2026-11-11-tcaster-design.md`, plan in `docs/plans/2026-11-11-tcaster.md`.

The approved design is in `docs/specs/2026-11-10-ptn-connext-design.md`. Setup steps for humans are in `docs/SETUP.md`.

The team are Economics/Business students with no coding background who build with AI. When you talk to them, explain changes in plain language. When you write code, prefer the simplest approach over clever abstractions.

The UI is **Thai only**. All user-facing copy is Thai, and dates are shown in the Buddhist Era (พ.ศ. = CE + 543).

## Commands

Requires **Node 22+**. `@supabase/supabase-js` needs native WebSocket and crashes on Node 20. The dev machine is Windows/PowerShell.

```bash
npm run dev               # localhost:3000 (needs .env.local, see .env.example)
npm run build             # production build — run before pushing
npm run lint              # eslint
npm run typecheck         # tsc --noEmit (run `npx next typegen` first if PageProps/LayoutProps are missing)
npm test                  # node:test via tsx on src/lib/{roster,calendar,tcas,tcasSource}.test.ts
npx tsx --test --test-name-pattern "birthdate" src/lib/roster.test.ts   # single test
npm run seed              # create test classrooms/subjects + one account per role (idempotent)
npm run check:security    # logs in as test student/teacher against the real Supabase project and verifies RLS
```

The test accounts and their passwords are listed in the header of `scripts/seed.ts`. `check:security` needs those accounts to still have their birthdate passwords. If you change one while testing in the browser, restore it afterwards with the admin client (`auth.admin.updateUserById`), and reset `must_change_password`/`pdpa_version`.

## Architecture

**Stack:**
- Next.js 16 App Router (Turbopack) with Supabase (Auth, Postgres, Storage), Tailwind v4, deployed to Vercel.
- There is no ORM and no generated DB types. Queries go through `supabase-js`, and results are cast to local types.

**Next 16 specifics:**
- The request hook is `src/proxy.ts`. The old `middleware.ts` convention is deprecated.
- `PageProps<"/route">` and `LayoutProps` are globally generated types.
- `cacheComponents` is deliberately `false` in `next.config.ts`, because nearly every page depends on the logged-in user.
- `getCurrentProfile()` calls `connection()` so every page renders per request.

**Identity:**
- Users type a student ID or teacher username (`login_id`). It's mapped to a hidden email `<login_id>@ptn-connext.local` by `loginIdToEmail()` in `src/lib/roster.ts`, because Supabase Auth needs an email.
- The first password is the birthdate as `DDMMYYYY` (Gregorian year).
- The role lives in `public.profiles`, not in auth metadata.
- Public sign-up is disabled in Supabase. Accounts are created only by the admin roster import (`src/app/admin/actions.ts`) or the seed script, both using the service-role key.
- `createAccount()` deletes the auth user again if the profile insert fails.

**Two Supabase clients — pick deliberately:**
- `src/lib/supabase/server.ts` `createClient()` acts as the logged-in user, so every query is filtered by RLS. Use it by default.
- `src/lib/supabase/admin.ts` `createAdminClient()` uses the service-role key and bypasses RLS. It is `server-only`. Use it only after `requireProfile({ roles: [...] })`, or for logging.

**Access control is layered:**
1. **`src/proxy.ts`:** refreshes the session cookie and redirects guests away from protected paths. That's all it does.
2. **`requireProfile()` in `src/lib/auth.ts`:** called at the top of every protected page *and* server action.
   - Order of checks: logged in → PDPA accepted (`pdpa_version >= PDPA_VERSION`) → role.
   - Changing the birthdate password is **optional**. PDPA acceptance redirects once to `/change-password` (which has a skip link). After that, `PasswordReminder` (rendered in the layout) shows while `must_change_password` is true.
   - Bump `PDPA_VERSION` whenever the text in `PdpaNotice.tsx` changes; everyone is then asked to accept again.
3. **Postgres RLS (`supabase/migrations/`):** the real lock. Every table has RLS.
   - Policies use `security definer` helper functions: `my_role()`, `my_classroom()`, `is_admin()`, `is_staff()`, `teaches_classroom()`, `can_see_post()`, `is_post_author()`.
   - Users can't update their own profile directly. PDPA consent goes through the `accept_pdpa()` RPC, and the `must_change_password` flag is cleared server-side with the admin client.

**Data model:**
- `profiles`: role, login_id, `classroom_id` for students.
- `classrooms`: grade 1–6, room, academic_year in พ.ศ.
- `subjects` and `teaching_assignments`: which teacher teaches which subject to which classroom. This drives what teachers may target.
- `posts` with `post_targets`: one row per classroom, with a per-classroom `due_at`. A null classroom means the whole school (admin only).
- `attachments`: a link, or a PDF of 10 MB or less in the private `materials` bucket, under `<uid>/…`. Files are served through signed URLs.
- `feedback`, `login_events`, `error_logs`: admin-read only, and written via the admin client in `src/lib/logs.ts`.

**Gotchas already hit:**
- **Keep the server next to the database.** Supabase is in Seoul (`ap-northeast-2`), so `vercel.json` pins Vercel functions to `icn1`. Vercel's default (`iad1`, USA) made every query cross the Pacific (about 0.2 s each, several per page). Check the second part of the `x-vercel-id` response header (`sin1::icn1::…` = built in Seoul).
- **Every route has a `loading.tsx`** that renders `LoadingPopup` (flashing logo, Thai text, progress bar), so a click gives instant feedback. Add one with its own Thai text for new sections.
- **`INSERT … .select()` also checks the table's SELECT policy on the new row.** `STABLE` helper functions can't see a row inserted in the same statement. SELECT policies therefore need a direct column check, such as `author_id = auth.uid() or can_see_post(id)`; see `0002_authors_see_own_posts.sql`.
- **`profiles` reaches `classrooms` two ways** (directly, and via `teaching_assignments`), so a plain embed fails with "more than one relationship". Use the `PROFILE_CLASSROOM` constant from `src/lib/auth.ts` (`classrooms!profiles_classroom_id_fkey`).
- **Migrations aren't run by tooling.** There's no Supabase CLI or Docker here. Each file is pasted into the Supabase SQL Editor once, in number order.
  - Never edit an applied migration. Add the next numbered file instead.
  - Tell the user to run it: `Get-Content <file> -Raw | Set-Clipboard` makes pasting easy.
- **RLS speed (migration `0010`):** in policies and helper functions, current-user calls are wrapped as `(select auth.uid())`, `(select public.is_admin())` etc. so Postgres runs them once per query, not once per row. Keep that wrapping in any new policy; row-dependent calls like `can_see_post(id)` stay unwrapped. `0010` also adds indexes on `posts`, `teaching_assignments`, `attachments`, `feedback` and `error_logs`.
- **Styles missing in the dev server** (the gradient "t", blobs, glass, colours) while `npm run build` has them: Turbopack's dev cache kept an old `globals.css`. This happens after a branch switch rewrites files while `npm run dev` runs, and it survives restarts. Fix: stop the dev server, delete `.next/dev`, start again.
- **Never rewrite source files with Windows PowerShell 5.1** (`Get-Content` / `Set-Content`). It reads UTF-8 without a BOM as the ANSI codepage and scrambles every Thai string. Use the Edit tool, or a Node script with `fs.readFileSync(f, "utf8")`.

**Roster import:**
- `src/lib/roster.ts` is pure and shared by both sides. The admin's browser parses the `.xlsx` (with `read-excel-file`) and validates it for a preview. The server action re-validates the same rows before writing.
- It handles:
  - Thai/English header aliases.
  - พ.ศ. or ค.ศ. years.
  - Thai digits and Thai month names.
  - Excel serial dates, and numbers that lost their leading zero.
  - Formats like `ม.5/2`.
- The academic year rolls over in May.
- Rows are sent in chunks of 25, and a teacher's rows are kept in the same chunk.
- Birthdates are used only as the first password and are never stored.

**Phase 1 scope — 6 subjects, 8 classrooms (`src/lib/school.ts`):**
- The subjects are คณิตศาสตร์ (orange), PAT (purple), สังคมศึกษา (brown), วิทยาศาสตร์ (green), ภาษาไทย (gold) and ภาษาอังกฤษ (blue).
  - Each has a short `code` key (`math`, `pat`, `social`, `science`, `thai`, `english`), and the UI shows names, not codes.
  - Migration `0003` creates them and moves older subjects onto them. A DB check constraint (`subjects_only_six`) allows no others.
  - `findSubject()` reads roster text: names, nicknames, or Thai course codes such as `ค32101` → math.
- The classrooms are ม.4/1–4 and ม.5/1–4 (`CLASSROOMS`). This is enforced in the app, not the DB:
  - The roster import rejects any other room.
  - `teaching.ts` lists only these rooms.
  - `0003` creates them for the current academic year.
- **To change either list:** edit `school.ts`, plus a new migration for subjects (the constraint and colors).

**Calendar colors:**
- **Exams have two kinds** (`posts.exam_kind`, migration `0004`):
  - `quiz` (สอบเก็บคะแนน / สอบย่อย) is light amber before the exam (`exam-tint`) and dark amber on the day (`exam-soft`).
  - `major` (สอบกลางภาค / ปลายภาค) is light red before (`major-tint`) and dark red on the day (`major-soft`).
  - `EXAM_LOOK` in `DayDrawer.tsx` maps each kind to its classes. When both kinds fall on one day, major wins.
- **School activities** use `.bg-event-stripes`: light amber with 45° stripes.
- **Due within 24 h:** the dot turns `urgent` red and blinks. `urgent` is the same red used on midterm/final exam chips.

**Calendar and Teacher's Console (Week 2):**
- **Time:** everything is Thai time (Asia/Bangkok, UTC+7). `src/lib/calendar.ts` is pure and shared by server and browser. It holds day keys (`"2026-11-12"`), the 6-week month grid starting on Sunday, `placeItems()` (deadlines, exam + lead-up days, multi-day events), `upcoming()`, `sortMaterials()`, and the Thai labels. Teachers' date boxes are read as Bangkok time by `bangkokInputToIso()`.
- **Rules:** `src/lib/postForm.ts` (pure) validates a post: assignment = one deadline per room; exam = a date per room plus lead days 0–30; material = needs a PDF or link; event = admin-only, start/end. Links must be http(s). The form runs it before uploading, and `savePost` in `src/app/teacher/actions.ts` runs it again. It's also the one home for `PostKind`, `MATERIALS_BUCKET`, `SCHOOL` (the form's "ทั้งโรงเรียน" id) and `isUuid()`; import these instead of retyping the strings.
- **Who may post where:**
  - **Subjects:** teachers get the subjects listed for them in `teaching_assignments`; admins get all 6 (`loadTeachingOptions`).
  - **Rooms:** anyone may post to any of the 8 rooms (`loadCurrentRooms`). The form has a "เลือกทั้ง 8 ห้อง" button that ticks all 8; each room still gets its own row and date.
  - **Whole school** (`classroom_id` null) is admin-only and offered only for school events.
  - `savePost` checks all of this. RLS checks it again (migration `0005`; `teaches_classroom()` is no longer used by policies).
- **Reads:** `src/lib/posts.ts` (`loadDatedItems`, `loadMaterials`, `loadMyPosts`) always uses the user's own client. A post sent to 2 rooms becomes 2 calendar items; students only get their own room's row.
- **PDF uploads go browser → Supabase Storage directly** (`src/lib/supabase/browser.ts`), into `materials/<uid>/<uuid>.pdf`, because server actions have a 1 MB body limit. The server then checks that the path is in the user's own folder and that the file exists before saving. If saving fails, the form deletes the upload.
- **Downloads:** files are opened through `/files/[id]` (route handler). It reads the attachment via RLS, then redirects to a 60-second signed URL (`?download=1` saves the file instead). Never put signed URLs or storage paths in pages.
- **Editing** replaces the post's targets. The attachment is kept unless the teacher picks a new one.
- **Who may edit and delete** (migration `0006`):
  - Admins: every post. Their console tab is "โพสต์ทั้งหมด".
  - Teachers: their own posts, plus every post in a subject they teach, including colleagues' posts. School events (no subject) only by their author or an admin.
  - This is `canManage()` in `teacher/actions.ts`, `loadManagedPosts()` in `posts.ts`, and in RLS `teaches_subject()` / `can_manage_post()`.
  - `author_id` and `type` can't be updated by anyone (column grants). Don't put them in an update.
  - Teachers can't read other profiles, so a colleague's post shows "โดยครูท่านอื่น" instead of a name.
- The day drawer is a native `<dialog>`: a bottom sheet on phones, a side sheet from `sm` up.

**Server actions:**
- Forms are client components using `useActionState`. Actions return `{ error }` with a Thai message.
- Unexpected failures go through `logError(route, e)`, which writes to `error_logs` for the Developer Console.
- Login attempts are recorded with `logLogin()`.

**UI:**
- **Theme:** matched to the official logo, red `#DB2931` on white. The style is **clean**:
  - Thin 1px light-grey borders (`border border-line`). Don't use black outlines.
  - Soft shadows (`shadow-soft-sm`, `shadow-soft`, `shadow-soft-lg`), plus a soft red glow on primary actions (`shadow-brand-glow`, `shadow-brand-glow-lg`).
  - The red gradient `.bg-brand-gradient` (hot red into deep crimson) for emphasis panels. Add `.speed-lines` on top of it for texture.
  - Red, white or gradient fills get a matching border or none, never a grey one.
  - Tokens live in the `@theme` block of `src/app/globals.css`. Use token classes, not raw colors.
  - Red means "brand", so `info` notices are neutral grey. Errors are always shown with an icon.
- **Motion:**
  - Buttons lift slightly on hover and scale down a touch on click (see `PRESS` in `ui.tsx`).
  - Nav links get a sliding underline.
  - `src/app/template.tsx` animates every page in (`animate-page`), and there are `animate-rise` (with `.delay-1` to `.delay-4`) and `animate-float` utilities.
  - Everything respects `prefers-reduced-motion`.
- **Fonts — a strict rule from the team:**
  - **Anuphan** (by Cadson Demak, SIL Open Font License, so commercial use is OK) is used for *all* UI text. It's self-hosted via `@font-face` in `globals.css` from `public/fonts/Anuphan-Variable.ttf`, which covers weights 100–700; the license is in `public/fonts/Anuphan-OFL.txt`.
  - The team originally wanted "Cloud" (by Typomancer), but its license for commercial use is unclear, so it isn't used.
  - **Prompt** (`next/font/google`, the `font-brand` class or the `<Brand>` component) is used *only* for the "PTN Connext" / "Connext" brand name.
  - Don't add other fonts.
- **Logo files:** `public/brand/` holds red and white transparent PNGs of `ptn-connext-*` and `connext-*`, plus the white arrow `arrow-white.png` used as a decorative graphic. `src/app/icon.png` is the arrow-"t" app icon. Use the `Logo` component in `NavBar.tsx` rather than typing the name.
- **Icons:** `lucide-react`.
- **Shared primitives** are in `src/components/ui.tsx`:
  - `Button` and `buttonStyles`, with variants `primary`, `secondary`, `inverse` (for red backgrounds), `ghost` and `danger`. Use `buttonStyles` to style `<Link>`s as buttons.
  - `smallButtonStyles` (h-9 list/toolbar buttons) and `iconButtonStyles` (square icon buttons, always with `aria-label`). **Don't resize `buttonStyles` by adding classes.** There's no tailwind-merge, so `px-0` next to the built-in `px-5` clashes (an icon button once rendered empty). Use the dedicated style instead.
  - `inputStyles` for text boxes, selects and textareas. It has no width, so add `w-full` or `w-24` yourself.
  - `Brand`, `Card` (`bold` adds a bigger soft shadow), `Field`, `Notice`, `Eyebrow` (`light` for use on red), `PageHeader`, `EmptyState` and `Container`.
  - Calendar colors: `exam` / `exam-soft` / `exam-tint`, and `event` / `event-strong` / `event-ink`. For deadline dots, use the `BLINK` class from `DayDrawer.tsx`: a blink, or a red ring when reduced motion is on.
- Navigation items per role are defined in `itemsFor()` in `src/components/NavBar.tsx`.
- Layouts must work at 375px width with no horizontal page scroll.

## Status

**Week 1 is done:** auth, PDPA, roles and navigation, the roster import, admin user search and password reset, and a basic Developer Console.

**Week 2 is done:**
- `/calendar`: the month grid, subject-colored deadline dots that blink within 24 h, exam and lead-up shading, event bands, the day drawer, "ใกล้ถึงกำหนด" (the next 14 days), and the materials list sortable by subject, ก–ฮ or content order.
- `/teacher` tabs: มอบหมายงาน, แชร์เอกสาร, ประกาศวันสอบ, กิจกรรมโรงเรียน (admin only), and งานของฉัน (edit at `/teacher/posts/[id]`, two-tap delete).
- `check:security` now also covers storage uploads and attachment visibility.
- No new migration was needed.

**Week 3 is done:**
- **Feedback box** on the home page for logged-in users, in the spot where guests see the login form (`FeedbackForm.tsx`, `src/app/feedback/actions.ts`).
  - It's limited to 3 messages per person in any 24 hours. That count uses the admin client, because users can't read `feedback`.
  - The insert has no `.select()`, since students can't read their own row back.
- **Developer Console** tabs (`AdminNav`):
  - ภาพรวม: stats, plus "ควรตรวจดู" cards that turn red when there is new feedback, errors, or failed logins.
  - `/admin/feedback`: the inbox, with sender name, role and room.
  - `/admin/errors`: the `error_logs` list.
  - `/admin/logins`: 24 h counts, a "failed only" filter, and IDs with 5+ failed tries in 24 h flagged.
  - Existing pages: ผู้ใช้, นำเข้ารายชื่อ.
- `check:security` (28 checks) also signs in as `admin.test`. It covers feedback (send only as yourself), who can read the console tables, and admins posting like teachers.
- **Pilot and launch steps:** `docs/PILOT.md`.

**Phase 2, TCASter release 1 is built** (branch `tcaster`; migrations `0007` and `0008`). The pilot is on hold.

**Next:** TCASter release 2 (the roadmap), then the pilot (human steps in `docs/PILOT.md`).

## TCASter (Phase 2)

**Data flow:**
- The source is the official TCAS database: the public JSON behind course.mytcas.com (`courses.json` and `rounds/<program_id>.json` on `my-tcas.s3…`). Last year's admitted scores (`ly-programs`) are locked (403), so the calculator compares against each program's published minimum.
- The admin pulls **one university per click** in Developer Console → **ข้อมูล TCAS** (`src/app/admin/tcas`). This runs `pullUniversity`: `fetchCourses`/`fetchRounds` in `src/lib/tcasFetch.ts`, then `normalizeProgram`, writing `tcas_staging` via the admin client.
  - Staging is replaced only after every request succeeds. A failed insert clears that university's staging.
- The page shows new, changed and removed programs, plus the ones with no calculator. **Publish** calls `tcas_publish(p_university)`, an all-or-nothing database function.
  - Programs that disappear are set `active = false`, not deleted.
- The 5 universities and their TCAS ids are in `TCAS_UNIVERSITIES` (`src/lib/tcas.ts`). The year is `TCAS_YEAR = 2570`; change both for a new TCAS year.
- The data has quirks the code already handles:
  - `courses.json` lists some programs more than once (`uniqueCourses`).
  - Round 1 `criteria` sits inside `folio`.
  - One program can have many Round 3 options.
- **Cache:** `countByUniversity`, `loadGroupFields` and `loadProgram` (per program id) in `src/lib/tcasData.ts` are wrapped in `unstable_cache`, tagged `"tcas"` (`TCAS_CACHE_TAG`), with `revalidate: 3600` as a safety net. They read with the admin client (cached code can't use cookies), so callers must run `requireProfile()` first.
  - `publishUniversity` calls `updateTag("tcas")`, so a publish shows up on the next request.
  - Searches (`searchPrograms`) and personal data (`loadMyTargets`) are never cached; they use the user's own client.

**Pure, tested logic:**
- `src/lib/tcas.ts`: the exam-code table (`examInfo`), `checkRound3`, `toRound3Option`, `calculate`, `cleanScores`, `pickOption` and `cleanSearch`.
  - Exams use 0–100. GPAX and subject-group GPA (`gpa21`–`gpa28`) use 0–4 and count ×25.
- `src/lib/tcasSource.ts`: `parseRounds`, `normalizeProgram` (the staging payload shape), `uniqueCourses`, `mapLimit` and `diffPrograms`.

**Last year's scores (migration `0009`):**
- During each pull, `fetchLastYearMinMax()` downloads the official Round 3 min/max `.xlsx` (`TCAS_LAST_YEAR_MINMAX_URL` in `tcas.ts`; **update it and `LAST_YEAR_LABEL` every year** from mytcas.com/stat) and reads it with `read-excel-file/node`.
- `parseMinMaxRows` finds columns by header text, and `matchLastYear` matches project/major codes, else the whole program's range.
- The data is stored as `last_min/last_max/last_seats/last_applicants` on `tcas_round3` and `tcas_programs`. If the sheet fails, the pull still works without it.

**Chance levels:** `chanceLevel()` in `tcas.ts`.
- **Level 1:** a failed published minimum, or a total more than max(3, 15% of last year's range) below last year's lowest.
- **Level 2:** below the lowest, but within that margin.
- **Levels 3–5:** the thirds of last year's lowest–highest range.
- Colours are `--chance-1…5` in `globals.css`. With no last-year data, the calculator falls back to the minimum-based message.
- Grades (GPAX, `gpa2x`) range 1–4; `examInfo().min` is 1 for grades.

**List and compare:**
- **Faculty colours:** `src/lib/facultyColors.ts`, from Thai Wikipedia faculty infoboxes. Entries with `verify: true` need checking; the review table is `docs/specs/faculty-colors.md`.
- **List:** `/tcas` has a sticky filter bar with a sort control (`?s=faculty|low|high|competition`).
- **Compare:** `CompareTray.tsx` keeps up to 3 programs in localStorage. `/tcas/compare?ids=a,b,c` shows them side by side.

**Calculator rule:**
- **Only the weights decide whether a Round 3 option gets a calculator.** Unknown exam codes (`tu002`, `vnet_51`, `cal_*`) or weights not summing to 100 set `problem`, and the page shows "ดูรายละเอียดที่ mytcas".
- Other conditions the calculator can't check (`score_condition`, IELTS/TOEFL, combined GPA groups) set `extraConditions` and show a note.

**Naming:** the UI says **"TCAS"**. "TCASter" is only the project/code name (file names, docs, and the PDPA notice, which isn't reworded to avoid a re-consent).

**Pages:**
- `/tcas` opens with the **"อยากเข้า Top University ต้องทำยังไง?" window** (`UniversityShowcase.tsx`), which fills the first screen.
  - It shows the 5 universities as cards: an emblem in a white circle over a campus photo. Each card links to `/tcas?u=<id>#search`.
  - "Top University" uses the red→purple `.text-tcas-gradient`. The big gradient "t" (`.t-mark`, which masks `public/brand/arrow-white.png`) launches on load and moves with parallax; emblems float around it on xl screens.
  - `ShowcaseMotion.tsx` (client) sets `--scroll` for `.tcas-parallax`, reveals `[data-reveal]` elements, and lands on `#search` after a search. It does nothing under `prefers-reduced-motion`.
  - The images are Wikimedia Commons files in `public/tcas/`, with credits in `src/lib/tcasArt.ts` (shown on the page by `TcasCredits`) and in `public/tcas/CREDITS.md`. Keep both in sync when swapping images.
- Below the window is the `#search` section: search, field group, university chips, and "เป้าหมายของฉัน".
- `/tcas/[programId]`: Round 1, Round 3, `Calculator`, and `TargetButtons`.
- `/tcas/stats`: staff only. It calls `tcas_target_totals()`, which is anonymous and hides groups under 3.

**Privacy:**
- `tcas_targets` can be read and written only by the student who owns them; admins can't read them either.
- The limit is 5 per student, enforced by the `tcas_targets_limit` trigger (migration `0008`). `saveTarget` updates an existing target instead of re-inserting it.
- Programs without a calculator can still be saved, with no scores.
- `PDPA_VERSION` is 2: the notice mentions TCASter.

**Terms of use:** mytcas.com's terms forbid copying content beyond the service's purpose; the team chose to use the data anyway.
- Every program page credits "ข้อมูล TCAS70 จาก mytcas.com (ทปอ.)" and links to the original.
- Keep pulls admin-triggered, and never add a bulk download.
