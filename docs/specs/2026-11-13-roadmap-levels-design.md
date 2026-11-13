# Roadmap levels: real stages, proof, streaks and rewards

Status: **design, waiting for approval**. Nothing here is built yet.

## Why
Today a Roadmap level is just `1 + XP ÷ 50`. It goes up from any ticking, so it says nothing real about
how ready a student is, and nothing pulls them back each week.

**Goal:** a level should mean a **real step toward admission**. It should be backed by evidence where it
matters, and come with reasons to return every week.

## What the team chose
| Topic | Choice |
|---|---|
| What a level means | **Named readiness stages** (the big levels) with **XP sub-levels inside each stage** |
| Stages | The 6 below. You can't move up until that stage's gate is complete |
| Proof | Some gate steps need proof: **a photo or PDF upload**, **a real number**, or **a link** |
| Coming back | **Weekly streaks**, **unlockable rewards**, **anonymous class comparison** |
| Rewards | **Card frames** and **card themes** |

## The 6 stages
Each stage has a **gate**: a short checklist. Steps marked 🔒 need proof.

| # | Stage | Gate (all must be done) |
|---|---|---|
| 1 | **สำรวจ** (explore) | Roadmap made with a target program · at least 3 boxes |
| 2 | **ตั้งเป้า** (set goals) | A goal box with a target number · GPAX entered for at least 1 term · a motto written |
| 3 | **ปูพื้น** (foundation) | 🔒 Latest GPAX ≥ the program's minimum, **entered as a number with a photo/PDF of the grade report** |
| 4 | **สะสมผลงาน** (build a portfolio) | Half the program's portfolio items ticked · 🔒 at least 2 activities **with a certificate photo/PDF or a link** |
| 5 | **พร้อมสอบ** (exam-ready) | Every exam-prep quest ticked · 🔒 **a real (mock) exam score entered** for each weighted exam, giving a calculator chance of 3 or more |
| 6 | **พร้อมสมัคร** (ready to apply) | All portfolio items ticked · the apply quests ticked · 🔒 **a link to the finished portfolio** |

**Programs without Round 1 or Round 3:** the portfolio or exam steps that don't apply are marked "ไม่ต้องทำ" and count as done.

**Switching target program:** the gates are re-checked against the new program. A student can **drop back
a stage** (shown gently: "เป้าหมายใหม่มีเกณฑ์ต่างไป"), but rewards already earned are kept.

## XP sub-levels inside a stage
- XP works as today: ticking quests, entering GPA, goals, activities, and the 40% cap on self-typed items.
- **Sub-levels:** each stage has its own XP bar, split into **5 sub-levels** (ขั้น 1–5). Bars get longer in higher stages: 100, 150, 200, 250, 300, 350 XP.
- **XP can't skip a gate:** with the bar full but the gate unfinished, the card shows **"ประตูด่านรออยู่"** plus the gate checklist. Extra XP is kept and carries into the next stage.
- **On the card:** for example **"ด่าน 3 · ปูพื้น · ขั้น 4/5"**.

## Moving up a stage (the wow moment)
- **The animation:** a full-card sequence. The card flips, the frame upgrades, a burst of light plays, and "ขึ้นด่าน 4: สะสมผลงาน!" appears with the newly unlocked reward.
- **Next steps:** the gate checklist for the next stage appears straight away, so the student always knows what's next.

## Weekly streak
- **What counts:** a week (Monday to Sunday, Thai time) counts when the student makes **any progress**: ticks something, adds an entry, saves a number, or uploads proof.
- **On the card:** "🔥 4 สัปดาห์ติด". If a week is missed, the streak goes back to 0, but the best streak is remembered.
- **Rewards:** reaching 4, 8 and 16 weeks unlocks streak frames.
- **Where it's tracked:** on the server, so it can't be faked by changing the device clock.

## Rewards locker
- **Frames:** one per stage:
  - stage 1 plain glass;
  - stage 2 bronze;
  - stage 3 silver;
  - stage 4 gold;
  - stage 5 holographic;
  - stage 6 rainbow.

  Plus streak frames at 4, 8 and 16 weeks.
- **Themes:** card backgrounds unlocked at stages 2, 4 and 6 and at streak 8, for example:
  - the red→purple default;
  - midnight;
  - sakura;
  - aurora.
- **"ตู้รางวัล" panel:** shows every frame and theme, locked ones included, each with its condition ("ถึงด่าน 4 เพื่อปลดล็อก"). The student picks which unlocked ones to use.

## Anonymous class comparison
- **The strip under the card:** for example "ห้อง ม.5/1: เฉลี่ยด่าน 2.4 · คุณอยู่ด่าน 3", and **"คุณนำหน้าครึ่งห้อง"** (you're ahead of half the room).
- **Privacy:** no names, ever. A room shows only when **at least 3 students** in it have a roadmap, the same rule as the staff totals.
- **Who's counted:** students only (teachers' own roadmaps are left out).

## Proof: privacy and storage
- **Where it's kept:** a new **private** storage bucket, `roadmap-proofs/<uid>/…` (photo or PDF, up to 5 MB), served only through a short-lived link, the same pattern as `/files/[id]`. Only the owner can see their proof. Teachers and admins can't.
- **What gets stored:** numbers (GPAX, exam scores) and links are saved with the proof record.
- **Honesty, not checking:** the app doesn't verify certificates. Proof is there so students think twice before ticking.
- **PDPA:** the notice gets a line about stored proof (certificates, grade reports, scores). `PDPA_VERSION` becomes **4**, so everyone accepts once more.

## Data (migration `0013`)
| Change | Why |
|---|---|
| `tcas_roadmaps` + `stage`, `xp`, `streak_weeks`, `best_streak`, `last_active_week`, `frame`, `theme` | Saved by the server on each save, so the class comparison and streaks don't depend on the browser |
| New `tcas_roadmap_proofs` (owner, which gate step, kind `file`/`link`/`number`, path / url / value, date) | The evidence; owner-only RLS |
| Storage bucket `roadmap-proofs` + owner-only policies | Private uploads |
| `roadmap_class_stats()` (security definer) | Per-room average stage for the viewer's own room, hidden under 3 students, students only |

## Code shape
- **`src/lib/roadmapLevels.ts`** (pure, tested):
  - `STAGES` (names, gates, XP sizes, rewards);
  - `stageOf(...)`, which returns the stage, the sub-level, the XP into the stage, and each gate step done or not;
  - `nextStreak(lastWeek, thisWeek, streak)`;
  - `REWARDS`.
- **Server actions:** every save recomputes the stage and XP (with the same `scoreRoadmap` and `stageOf` used on the server), updates the streak, and stores them. Proof upload goes browser → storage, then a server check, the same flow as teacher PDFs.
- **UI:**
  - a stage banner and gate checklist on the board;
  - the level-up sequence;
  - the 🔥 streak badge;
  - the "ตู้รางวัล" panel;
  - the class strip;
  - an "แนบหลักฐาน" button on the GPA, scores, activities and portfolio boxes.

## Build order (about 1–2 weeks)
1. `roadmapLevels.ts` + tests: stages, gates, sub-levels, streaks, rewards.
2. Migration `0013` (the user runs it) + `check:security` additions: proof is owner-only, and class stats hide groups under 3.
3. Server: store stage, XP and streak on save; proof upload and viewing.
4. UI: stage banner, gate checklist, proof buttons.
5. UI: level-up sequence, streak badge, rewards locker, class strip.
6. PDPA v4 text, docs (CLAUDE.md), browser test at 375px and with reduced motion.

## Out of scope
- **Teachers checking proof:** the team chose self-submitted proof.
- **Daily streaks, class leaderboards with names, and extra-box unlocks:** not chosen.
