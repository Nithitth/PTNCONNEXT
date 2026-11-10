# PTN Connext — Concept and Design (Phase 1: Smart Calendar)

## Context
PTN school's teaching materials, deadlines, exam dates and university guidance are scattered (chat groups, handouts, separate sites). PTN Connext puts them in one logged-in web app: a **Smart Calendar** where teachers post once and the right classrooms see it, and later a **TCAS hub (TCASter)**. Goals: less scattered info, less repeated teacher work, students who plan earlier.

Builders: Economics/Business students new to coding, building with AI ("vibe coding"). Folder `C:\Users\Fight\Documents\PTNCONNEXT` is empty — greenfield.

**Decided with the user**
- Phase 1 = Smart Calendar + everything around it, **working in 2–3 weeks**. TCASter comes months later (Phase 2).
- Interface **Thai only**; dates shown in Buddhist Era (พ.ศ.).
- Files: **links (Google Drive/Slides/Canva) + small PDF uploads (≤10 MB)**.
- Accounts: **Excel roster export from the school**, uploaded by an admin each term.
- TCAS data (Phase 2): **auto-pulled from public sites**, with admin review before publishing.

## Approach (chosen: real app, thin slice)
- Considered: (A) real app built in thin slices, (B) clickable prototype with fake data, (C) no-code tools. Picked A: everything built is kept. B would have to be rebuilt after the demo. C can't handle role-based navigation or the consoles.
- **Stack (Claude's call, chosen to fit a non-coding team using AI):** Next.js (App Router, TypeScript) on Vercel + Supabase (Auth, Postgres, Storage, Row Level Security). Tailwind CSS + shadcn/ui for components. Everything runs on free tiers. Deploys happen on `git push`.
- Why: AI tools generate this stack most reliably, and nobody has to run a server. RLS enforces "who sees what" in the database itself, not only in the UI.

## Roles and navigation
| Tab | Guest | Student | Teacher | Admin |
|---|---|---|---|---|
| หน้าแรก (Home/Info) | ✓ | ✓ | ✓ | ✓ |
| ปฏิทิน (Calendar) | – | view/download | view/download | view/download |
| TCAS | – | "เร็วๆ นี้" in Phase 1 | same | same |
| คอนโซลครู (Teacher's Console) | – | – | ✓ | ✓ |
| คอนโซลผู้พัฒนา (Developer Console) | – | – | – | ✓ |
| Right side | เข้าสู่ระบบ | name + classroom → account | name → account | name → account |

## Screens (Phase 1)
1. **Home page**: hero explaining Connext + its 2 functions. A login section further down the page. A feedback box at the very bottom, shown only to logged-in users.
2. **Login ("เข้าสู่ระบบ Connext")**: toggle between Student and Teacher.
   - Student: student ID + password. Teacher: preassigned username + password.
   - The first password is the birthdate in DDMMYYYY format. **Changing it is optional** (decided 2026-11-10): after PDPA the user is offered a "set a new password" screen with a skip button, and a reminder bar stays on every page until they change it, because classmates know each other's birthdays.
3. **PDPA gate**: shown before entering the app on first login. It explains what is collected, why, and that only admins can see it. Acceptance is stored with a version number and timestamp, and declining logs the user out. Guests see a short disclosure banner, and nothing is collected from them.
4. **Student calendar** (mockup shown in chat):
   - Month grid. Colored dots, one color per subject. A dot blinks only when work is due within 24 hours; with reduced-motion turned on it shows a red ring instead.
   - Bands: strong amber on the exam day, light amber for the lead-up days, purple for school events.
   - Clicking a day opens a detail drawer with each item, its deadline time and its files.
   - Side panel lists materials and announcements for the student's own classroom, sortable by subject, alphabetical order, or content order.
   - Phone layout: the side panel moves below the grid, and cells show dots only.
5. **Teacher's Console** (mockup shown in chat): tabs มอบหมายงาน / แชร์เอกสาร / ประกาศวันสอบ / งานของฉัน.
   - Assign: one file or link, plus rows of classroom and deadline (one deadline per classroom). The classroom list only includes rooms the teacher teaches.
   - Announce exam: date, classrooms, and lead-up length in days.
   - My posts: edit or delete.
6. **Developer Console (admin)**:
   - Counts: users, teachers, files, posts.
   - Login report.
   - Feedback inbox.
   - Error log.
   - Roster import: upload Excel → preview → create/update accounts. Each row shows errors, e.g. a duplicate ID or missing classroom.
   - Reset a user's password.
7. **Account page**: change password, view profile.

## Data model (Supabase Postgres)
- `profiles`: id (= auth user), role (`student|teacher|admin`), display_name, login_id (student ID or teacher username), classroom_id (students), must_change_password, pdpa_version, pdpa_accepted_at
- `classrooms`: id, grade (ม.4–ม.6), room, academic_year
- `subjects`: id, code, name_th, color
- `teaching_assignments`: teacher_id, classroom_id, subject_id. Comes from the roster and drives the classroom drop-downs.
- `posts`: id, type (`assignment|material|exam|announcement|event`), title, description, subject_id, author_id, content_order, timestamps
- `post_targets`: post_id, classroom_id (null = whole school), due_at / event_date, lead_days
- `attachments`: post_id, kind (`file|link`), storage_path or url, file_name, size_bytes
- `feedback`, `login_events` (user, time, success), `error_logs` (time, route, message)
- Auth mapping: Supabase Auth needs an email, so log in with `<login_id>@ptn-connext.local` behind the scenes. Users only ever type their ID.
- PDPA data minimization: the birthdate is used only to set the first password at import. **It is not stored afterwards.**

## Security rules (RLS — the part vibe-coded apps most often get wrong)
- Students read only posts targeted at their classroom or the whole school. They can't write anything except feedback and their own profile password.
- Teachers write posts only for classrooms in their `teaching_assignments`, and edit or delete only their own posts.
- Only admins read `feedback`, `login_events`, `error_logs` and analytics.
- The service-role key stays server-side only, used for roster import and password reset. It is never sent to the browser.
- Uploads: PDF only, ≤10 MB, private bucket, downloaded through signed URLs.

## Build order (≈3 weeks)
- **Week 1 — foundation:**
  - Create the GitHub repo, Vercel project and Supabase project.
  - Schema + RLS policies.
  - Seed file with test accounts for each role.
  - Roster Excel import.
  - Login + optional password change + PDPA gate.
  - Navigation by role.
  - Home page.
- **Week 2 — calendar:**
  - Teacher's Console: assign, share document, announce exam, my posts.
  - Student calendar grid + bands + day drawer + side panel with sorting.
  - Phone layout.
- **Week 3 — admin and launch:**
  - Feedback box.
  - Developer Console: counts, login report, feedback, error log.
  - Role-permission test pass.
  - Pilot with one or two classrooms, fixes, then school-wide launch.
- In the repo, save this design as `docs/specs/2026-11-10-ptn-connext-design.md`.

## Phase 2 (later) — TCASter outline
- A scheduled GitHub Action scraper pulls Round 1/3 criteria, score weightings and competition rates into a **staging** table.
- The admin reviews the differences in the Developer Console, then publishes. Every figure shows its source link and "updated" date. Scraper failures appear in the error log, and admins can fix single rows by hand.
- Start with the faculties PTN students actually target, and check each source site's terms of use.
- Features: target-score calculator (per exam part), roadmap generator from presets (target faculty + skills + achievements). Teachers get view-only access. Admin analytics on goals and roadmaps.

## Open items for the school (not blocking the build)
- Whether guardian consent is needed in addition to student consent under PDPA, since most users are under 20.
- Formal OK to receive the roster, including birthdates.
- The list of authorized teacher usernames.

## Verification
- Seed one test account per role, plus a student in a second classroom. Then:
  - Student A sees nothing posted only to classroom B. Check both in the UI and by querying Supabase directly with A's session.
  - A student can't open `/teacher` or `/admin`. A teacher can't open `/admin`.
  - First login with the birthdate offers a password change that can be skipped; skipping shows a reminder bar until it's changed. Declining PDPA logs the user out.
  - A teacher posts to two rooms with different deadlines → each room's calendar shows the right date. An item due within 24 hours blinks.
  - Uploading a file over 10 MB, or a non-PDF, is rejected with a Thai error message.
  - Roster import with a broken row shows an error for that row and still creates the others.
  - Check every screen at phone width (375px) and desktop width in the in-app browser.
  - Feedback and login events show up in the Developer Console.
