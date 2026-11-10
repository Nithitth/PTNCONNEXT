# TCASter — Design (Phase 2, release 1)

## Why
PTN students learn too late what their target university program actually needs: which exams, what weightings, what portfolio. TCASter lets **ม.4–ม.5 students plan ahead**. They find a program, see exactly how it scores applicants, and play with "what if I scored this" sliders to see how far they are from getting in.

**Success:** a ม.5 student can name their target program and the exams it uses, and knows roughly what scores they need, a year before applying.

The pilot (docs/PILOT.md) is on hold while this is built.

## Decided with the user
| Topic | Decision |
|---|---|
| Who it's for | ม.4–ม.5 students in the existing 8 classrooms. No ม.6, no new accounts. |
| First release | Program info + slider calculator, in 2–3 weeks. The roadmap is release 2. |
| Coverage | **Every program** at 5 universities: จุฬาลงกรณ์ฯ, ธรรมศาสตร์, มหิดล, เกษตรศาสตร์, ศรีนครินทรวิโรฒ (มศว.). That's ~786 programs in TCAS70. |
| Rounds | Round 1 (Portfolio) and Round 3 (Admission). |
| Data source | The official TCAS database behind course.mytcas.com, pulled when the admin asks. The admin reviews it before it goes live. |
| Terms of use | mytcas.com's terms forbid copying its content beyond the service's purpose. The user chose to use the data anyway. Mitigations: credit "ที่มา: mytcas.com (ทปอ.)" with a link on every program page, pull data only when the admin asks, and never offer a bulk download. |
| Calculator | **One slider per exam** the program uses. A bar shows the student's weighted total against the program's minimum, plus a hint such as "เพิ่ม TPAT3 อีก 26 คะแนน = ผ่านเกณฑ์". |
| Privacy | Only the student sees their saved targets and slider scores. Teachers and the admin see **totals only** (e.g. "12 students aim for วิศวกรรมศาสตร์"). |
| Roadmap templates (release 2) | Our team drafts them and the guidance teacher (ครูแนะแนว) checks them. |
| Teachers | Can browse everything, read-only. |

## Non-goals (release 1)
- The roadmap and checklist (release 2).
- Rounds 2 and 4. Current-season application dates.
- Last year's lowest and highest admitted scores. The TCAS file for them is locked (HTTP 403). The calculator compares against the **published minimum score** instead. An optional cut-off column the admin types by hand is a release 2 idea.
- Other universities, and an automatic scheduled robot.

## Anti-goals (a failure even if it works)
- A number that differs from mytcas with no source or date shown. Every figure shows its source link and "ข้อมูล TCAS70 · อัปเดต <date>".
- Staff seeing an individual student's targets or scores.
- A wrong calculation shown confidently. If a program's weightings don't add up to 100%, or use an exam code we don't recognise, that program shows "ดูรายละเอียดที่ mytcas" and no calculator.

## Data source (verified 2026-11-11)
These are public JSON files on `https://my-tcas.s3.ap-southeast-1.amazonaws.com/mytcas/`, the same ones course.mytcas.com loads:
- **`courses.json`** (~4,740 programs, all universities). It has the university, campus, faculty, `group_field_th` (field group, e.g. "วิศวกรรมศาสตร์"), field, program name in Thai and English, `program_type_name_th` (e.g. "ภาษาไทย ปกติ"), `program_id`, cost text and graduate rate.
- **`rounds/<program_id>.json`**: an array, one entry per admission project, with `type` like `"1_2570"` or `"3_2570"`.
  - **Round 1 entries:** `project_name_th`, `receive_student_number`, `folio` (portfolio questions such as `folio_q1`, `folio_q2`), `criteria` (long text), `link`, `closed_date`.
  - **Round 3 entry:** `receive_student_number`, `min_gpax`, `min_total_score`, `score_conditions` (per-exam minimums), and `scores`, a map from exam code to weight %. Example: `{ tgat: 20, tpat3: 30, a_lv_61: 20, a_lv_64: 20, a_lv_65: 10 }`.
- `ly-programs/<id>.json` (last year's results) returns 403. Don't use it.
- Asking for a missing file without the `?ts=` cache-buster can also return an XML error. Treat any non-JSON response as "no data for this program", not as a crash.

**Exam codes → Thai labels** (`src/lib/tcas.ts`, one table):
- `tgat`, plus parts `tgat1` / `tgat2` / `tgat3` (English, critical thinking, future workforce)
- `tpat1` (กสพท) … `tpat5` (ครุศาสตร์), including any sub-codes such as `tpat21`
- `a_lv_61` คณิต1, `62` คณิต2, `63` วิทยาศาสตร์ประยุกต์, `64` ฟิสิกส์, `65` เคมี, `66` ชีววิทยา, `70` สังคมศึกษา, `81` ภาษาไทย, `82` ภาษาอังกฤษ, `83`–`89` other languages
- GPAX is handled separately (`min_gpax`, and sometimes a weight).

**Builder:** confirm these codes and their score scales against the real TCAS70 data and the blueprint at mytcas.com/blueprint before writing the table. Collect every distinct key in `scores` and `score_conditions` across the 786 programs, and make sure each one is mapped.

## How the data gets in (admin, Developer Console → new tab "ข้อมูล TCAS")
1. **Pull.** The admin clicks "ดึงข้อมูลจาก TCAS" and picks one university at a time. The server fetches `courses.json`, filters to that university, then fetches each program's `rounds` file. Use about 5 requests at a time, and a polite fixed User-Agent with no personal details. Pulling one university per click keeps each request inside Vercel's time limit; the largest, เกษตรศาสตร์, has ~293 programs. Results go into **staging** tables.
2. **Review.** A preview lists what's new, changed or removed compared to the live data, and flags problems: weightings that don't sum to 100, unknown exam codes, a missing round 3. It works like the roster import preview.
3. **Publish.** "เผยแพร่" copies staging to the live tables in one database function (all-or-nothing). It records who published it, when, the TCAS year, and the counts.
- Failures go to `error_logs` (route `tcas/pull`) as usual.
- A university can be re-pulled at any time, for example when TCAS updates. The data changes a few times a year, mostly before each round.

## Tables (new migration; RLS on all)
- `tcas_programs`: `program_id` (primary key, text), university id and name, campus, faculty, `group_field`, field, program name in Thai and English, program type, cost text, seats for round 1 (sum of its projects) and round 3, `tcas_year` (e.g. 2570), `source_updated_at`.
- `tcas_round1_projects`: program_id, project name, seats, portfolio requirements text, criteria text, link.
- `tcas_round3`: program_id, `min_gpax`, `min_total_score`, `weights` (jsonb, exam code → %), `conditions` (jsonb, exam code → minimum score), link.
- `tcas_staging_*`: the same shapes, plus `university_id` and `pulled_at`.
- `tcas_publishes`: who, when, university, year, counts.
- `tcas_targets`: student_id, program_id, `slider_scores` (jsonb), created_at, updated_at. At most 5 per student.

**RLS:**
- Any signed-in user can read the live `tcas_*` tables.
- Only admins can read staging, and only the server (service key) writes it, after `requireProfile({ roles: ["admin"] })`.
- `tcas_targets`: a student reads and writes only their own rows. **Nobody else reads them**, not even admins.
- Staff totals come from a `security definer` function. It returns only counts grouped by `group_field`, faculty, university and grade, and hides any group with fewer than 3 students, so nobody can be singled out.

## Student screens (Thai only, phone-first, same design system)
1. **`/tcas` (browse).**
   - A search box (university, faculty or program).
   - Filters: university (the 5) and field group (`group_field_th`).
   - Results are grouped university → faculty, showing program name, type and round 3 seats.
   - "เป้าหมายของฉัน" (my targets) is pinned at the top.
2. **`/tcas/[programId]` (a program).**
   - **Header:** university, faculty, program, type, cost, and a "ดูต้นฉบับที่ mytcas" link.
   - **Round 1 card:** each project with its seats and portfolio requirements. Long text is shown collapsed.
   - **Round 3 card:** the weighting table, minimum GPAX and minimum total, per-exam minimums, and seats.
   - **Calculator.** One slider per weighted exam, labelled in Thai with its weight. It shows:
     - the live weighted total and the program's minimum;
     - a progress bar;
     - "ขาดอีก X คะแนน" (X points short) or "ผ่านเกณฑ์ขั้นต่ำแล้ว" (minimum reached);
     - a hint that names the exam with the biggest weight and how many points it would need;
     - a warning if any per-exam minimum isn't met.
     The calculation is pure and unit-tested in `src/lib/tcas.ts`.
   - **Save.** "บันทึกเป็นเป้าหมาย" saves the program and the slider values, up to 5 programs.
   - **Footer:** "ข้อมูล TCAS70 จาก mytcas.com (ทปอ.) · อัปเดต <date> · คะแนนขั้นต่ำไม่ใช่คะแนนที่ติดจริง" (the published minimum is not the real admission cut-off).
3. **Teachers** see the same pages without the save button.
4. **Staff totals** (`/tcas/stats`, teachers and admin): counts of student targets by field group, university and grade, shown as bars. No names.

## Privacy and PDPA
Targets and slider scores are new personal data about minors.
- Update the wording in `PdpaNotice.tsx`: what is saved (target programs and the scores the student types), why (their own planning), and who sees it (only them; staff see anonymous totals).
- Then bump `PDPA_VERSION` so everyone accepts again.
- Add the new wording to the school's PDPA sign-off item in `PILOT.md`.

## Build order (~3 weeks)
- **Week 1:**
  - The migration (tables and RLS).
  - The exam-code table and the pure calculator in `src/lib/tcas.ts`, with tests.
  - Pull → staging → review → publish in the Developer Console.
  - Pull all 5 universities.
- **Week 2:**
  - The `/tcas` browse page and the program page with its Round 1 and Round 3 cards.
  - The slider calculator, and saving targets.
- **Week 3:**
  - Staff totals, the PDPA update, and new `check:security` checks:
    - a student can't read another student's targets;
    - staff can't read targets directly;
    - totals hide groups under 3;
    - non-admins can't pull or publish.
  - Phone (375px) checks, and the CLAUDE.md and SETUP.md updates.

## Release 2 (later, for reference)
**Roadmap:** the student picks a target, ticks what they've already done, and gets a term-by-term checklist.
- The templates cover 5–8 field groups. Our team writes them in the Developer Console and the guidance teacher checks them.
- They're filled out with each program's real Round 1 portfolio requirements.
- Possible additions: the optional last-year cut-off column, and an overall readiness meter.

## What a sample of the real data showed (131 of 786 programs, 2026-11-11)
- **Several Round 3 options per program are common** (up to 31, split by project or major).
- **About 1 in 4 programs have no Round 3** (mostly international or special programs).
- **Weightings usually sum to exactly 100.** The exceptions use "pick the best of" formulas (`cal_*` keys).
- **Other things some programs use:**
  - grades by subject group (`gpa21`–`gpa28`);
  - Thammasat's own exams (`tu002`…);
  - V-NET (`vnet_51`).
- **The calculator supports** TGAT, TPAT, A-Level, GPAX and subject-group grades. Anything else shows "โครงการนี้ใช้เกณฑ์พิเศษ ดูรายละเอียดที่ mytcas" (this project uses special criteria; see mytcas).
- **Settled during the build, after a real pull (632 programs):**
  - **Only the weights decide whether a program gets the calculator.** Extra conditions the calculator can't check (combined-score rules, IELTS/TOEFL, combined GPA groups) show a note instead. Under the stricter first rule, 38% of มหิดล programs lost the calculator. Now 34 of 632 programs (5%) have no calculator.
  - **Programs without a calculator** can still be saved as a target, with no scores.
  - **`courses.json` lists some programs more than once**, one entry per major; the first entry is kept.
  - **Round 1 criteria** sit inside `folio`.

## Calls Claude made (check these)
- **A program with several Round 3 entries** (`type` `3_2570` appears more than once): show one calculator per entry, labelled by its project name or by "แบบที่ 1/2".
- **Programs that disappear in a new pull** are kept with `active = false`, not deleted. A student's saved target then shows "หลักสูตรนี้ไม่มีในข้อมูลล่าสุด" (this program isn't in the latest data).
- **Year warning:** ม.4–5 students will apply under a later TCAS year than the data. Every calculator says "เกณฑ์ TCAS70 — ปีที่น้องสมัครอาจเปลี่ยน ใช้เป็นแนวทาง" (TCAS70 criteria; your year may differ, use as a guide).
- **Data is pulled one university per click**, to stay inside Vercel's time limit.
- **Staff totals hide any group under 3 students.**
- **Saved targets are capped at 5 per student.**

## Left to the builder
- Table and column names beyond those above, and the exact URL shapes.
- How long text is collapsed, and the visual details. Follow the existing design system in CLAUDE.md.
- Slider steps and ranges per exam, from the confirmed score scales.
- How the review screen looks, as long as it shows new, changed, removed and flagged programs before publishing.
