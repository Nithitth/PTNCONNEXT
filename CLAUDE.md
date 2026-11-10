# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

PTN Connext is a school web app for one Thai high school.
- **Phase 1 (current):** Smart Calendar. Teachers post assignments, exams and materials to classrooms, and students view them.
- **Phase 2 (later):** TCASter, a university-admissions hub.

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
npm test                  # node:test via tsx on src/lib/roster.test.ts
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
- **`INSERT … .select()` also checks the table's SELECT policy on the new row.** `STABLE` helper functions can't see a row inserted in the same statement. SELECT policies therefore need a direct column check, such as `author_id = auth.uid() or can_see_post(id)`; see `0002_authors_see_own_posts.sql`.
- **`profiles` reaches `classrooms` two ways** (directly, and via `teaching_assignments`), so a plain embed fails with "more than one relationship". Use the `PROFILE_CLASSROOM` constant from `src/lib/auth.ts` (`classrooms!profiles_classroom_id_fkey`).
- **Migrations aren't run by tooling.** There's no Supabase CLI or Docker here. Each file is pasted into the Supabase SQL Editor once, in number order.
  - Never edit an applied migration. Add the next numbered file instead.
  - Tell the user to run it: `Get-Content <file> -Raw | Set-Clipboard` makes pasting easy.

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
  - `Brand`, `Card` (`bold` adds the outline and hard shadow), `Field`, `Notice`, `Eyebrow` (`light` for use on red), `PageHeader`, `EmptyState` and `Container`.
- Navigation items per role are defined in `itemsFor()` in `src/components/NavBar.tsx`.
- Layouts must work at 375px width with no horizontal page scroll.

## Status

Week 1 is done: auth, PDPA, roles and navigation, the roster import, admin user search and password reset, and a basic Developer Console.

Next is Week 2:
- The calendar month grid, with subject-colored deadline dots that blink only within 24 hours (with a reduced-motion fallback), exam/lead-up and event bands, a day drawer, and a sortable side panel.
- Teacher's Console tabs: assign homework (one file or link, per-classroom deadlines), share a document, announce an exam, my posts.

`/calendar`, `/teacher` and `/tcas` are placeholders until then. The tables and the storage bucket for Week 2 already exist in `0001_init.sql`.
