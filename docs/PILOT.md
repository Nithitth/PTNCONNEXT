# Pilot and launch checklist

Phase 1 (Smart Calendar) is feature-complete. This is the order for trying it
with real users. Tick each box before moving to the next stage.

## Stage 0 — Before anyone real logs in

The school must sign off on these. They are not technical tasks, but launching without them is a PDPA risk.

- [ ] **PDPA wording approved.** The school's PDPA officer reads the notice in `src/components/PdpaNotice.tsx`. If they change any wording, ask Claude to update it; that also bumps `PDPA_VERSION`, so everyone is asked again. The notice now also covers TCASter: saved target programs and the scores students type, which only the student sees (staff see anonymous totals of 3+ students).
- [ ] **Guardian consent decided.** Most students are under 20. Ask the school whether a parent or guardian must also agree.
- [ ] **Permission to use the roster.** The school formally OKs giving us student and teacher names and birthdates. Birthdates are only used as the first password and are never stored.
- [ ] **Teacher usernames agreed**, e.g. `somsri.k`.

## Stage 1 — Clean the test data

Testers and the real school share one Supabase database, so the test content must go first.

- [ ] Delete the sample posts: log in as `teacher.test` and `admin.test`, open คอนโซลครู → งานของฉัน, and delete each one.
- [ ] In Supabase → **Authentication → Users**, delete `90001`, `90002` and `teacher.test`. Keep **one** admin account; change its password to a strong one first.
  - After this, `npm run check:security` and `npm run seed` won't work against this project. That's expected. They are for development, not for the live school.
- [ ] In Supabase → **Table Editor**, empty `feedback`, `login_events`, `error_logs` and `tcas_targets` (select all rows → delete).
- [ ] Developer Console → **ข้อมูล TCAS**: pull and publish all 5 universities, so TCASter has current data.

## Stage 2 — Pilot with 1–2 classrooms (about 1–2 weeks)

- [ ] Pick 1–2 rooms (for example ม.5/1 and ม.5/2) and the teachers who teach them.
- [ ] Admin: คอนโซลผู้พัฒนา → **นำเข้ารายชื่อ**. Import **students first**, then **teachers**. Use the template download buttons, and fix any red rows the preview shows.
- [ ] Send the site link (from Vercel) plus a short guide to the pilot users:
  - Students log in with their student ID; teachers with their username.
  - The first password is the birthdate as วว ดด ปปปป in ค.ศ. (e.g. born 5 May 2552 → `05052009`).
  - Setting a new password is encouraged (the yellow bar reminds them).
- [ ] Teachers post real work for one week: at least one assignment, one shared document and one exam each.
- [ ] Check the Developer Console **every day**:
  - **ความคิดเห็น:** read what people say.
  - **ข้อผิดพลาด:** anything here is a bug. Copy the message to Claude.
  - **การเข้าสู่ระบบ:** many failed tries usually means a forgotten password. Reset it in **ผู้ใช้**.
- [ ] Ask 3–5 students and every pilot teacher, in person, if possible on their own phones:
  1. Could you find this week's work in under 10 seconds?
  2. Did the deadline dot and the exam colors make sense without explanation?
  3. Did the PDF / link open on your phone?
  4. Teachers: how long did posting one assignment to all your rooms take?
  5. What was confusing or annoying?

## Stage 3 — Fix, then launch to all 8 classrooms

- [ ] Fix what the pilot found. Push to GitHub; Vercel updates by itself.
- [ ] Import the remaining students and teachers.
- [ ] Announce the link to the whole school (homeroom teachers explain the first password).
- [ ] Keep checking the Developer Console daily for the first two weeks.

## Every new school year (May)

- [ ] Import the new roster. Classrooms for the new year are created automatically, and students are moved to their new rooms.
- [ ] If rooms or subjects change, ask Claude to update `src/lib/school.ts` (and add a migration for subjects).
