# PTN Connext

School web app that puts assignments, exam dates, teaching materials and university (TCAS) guidance in one place.

- **Design:** [docs/specs/2026-11-10-ptn-connext-design.md](docs/specs/2026-11-10-ptn-connext-design.md)
- **First-time setup:** [docs/SETUP.md](docs/SETUP.md)

Built with Next.js 16, Supabase (login, database and file storage), and Tailwind CSS, and deployed on Vercel.

## Status

- **Week 1 (done):** Home page, role-based menu, login (student/teacher), optional password change on first login (with a reminder bar until it's done), PDPA consent, Excel roster import, admin password reset, and a basic Developer Console. The database has security rules (RLS) on every table.
- **Week 2:** Smart Calendar and Teacher's Console.
- **Week 3:** Feedback, the full Developer Console, and launch.
