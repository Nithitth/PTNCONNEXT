# BRAND.md: PTN Connext brand guide

The one definition of how PTN Connext looks, moves and speaks: on the website, in print, in slides and on social media. CLAUDE.md imports this file, so every Claude session follows it; the team can read it as a normal guide.

- **Source of truth for values:** the code. Colours and shadows live in the `@theme` block of `src/app/globals.css`, components in `src/components/ui.tsx`. When a value changes, change the code and this file together.
- **(เสนอ)** marks a rule that was proposed when this guide was written (2026-11-20) and is waiting for the team's OK. Follow it until the team decides otherwise, then remove the mark.

---

## 1. The brand in one page

**What it is:** PTN Connext is the school's own web app for one Thai high school. It puts work, exams and class materials in one smart calendar, and helps students plan for university (TCAS search, score calculator, Roadmap).

**Who it speaks to:**

| Audience | What they need from the brand |
|---|---|
| Students (ม.4–ม.6) | Friendly, quick, a little playful (Roadmap card, rewards) |
| Teachers | Calm, obvious, very easy (big buttons, step-by-step guide) |
| Director, judges, other schools | Trustworthy, measured, real numbers (report, war room, posters) |

**Personality:** clean · warm · quick · trustworthy. Energetic in the details (motion, gradients), never noisy.

**The look in one line:** the school's red `#DB2931` on white, thin light-grey lines, soft shadows, a red gradient for moments of emphasis, gentle motion.

**Never (the team rejected these, 2026-11-10):** thick black frames, hard offset ("brutalist") shadows, tilted "sticker" elements.

---

## 2. Logo

### Files (`public/brand/`, transparent PNG)

| File | Size (px) | Use for |
|---|---|---|
| `ptn-connext-red.png` | 1424×206 | **Main logo**, on white or light backgrounds |
| `ptn-connext-white.png` | 1424×206 | On red, the brand gradient or dark photos |
| `connext-red.png` / `connext-white.png` | 1352×276 | (เสนอ) short form for tight spaces where "PTN" is already clear (app tiles, stickers). Unused in the app so far |
| `arrow-white.png` | 185×272 | The arrow-"t" mark, **decoration only** (see below) |
| `src/app/icon.png` / `apple-icon.png` | 512 / 180 | App icon: white arrow-"t" on a red rounded square. Also the avatar for social accounts (เสนอ) |

In code, always use the `Logo` component (`src/components/NavBar.tsx`), never type the name in a font: sizes `sm` 18 px, `md` 26 px, `lg` 40 px tall; tones `red` / `white`.

### Rules

- **Clear space (เสนอ):** keep empty space around the logo at least the height of the arrow-"t" on every side.
- **Minimum size (เสนอ):** 18 px tall on screen; 25 mm wide in print (short form 15 mm).
- **Backgrounds:** red logo on white/very light (`page`, `sunken`); white logo on brand red, the brand gradient, or a photo darkened to at least 60%.
- **Don't (เสนอ):** recolour it (only red or white), stretch or squash, add outlines, shadows or glows, rotate it, put it on busy photos without darkening, crop it, or retype "PTN Connext" in another font.
- **Co-branding (เสนอ):** next to school or partner logos (e.g. Chula on the competition poster), all logos share one baseline and similar optical height, separated by the clear space; partner logos keep their own rules.

### The arrow-"t" as decoration

The arrow from the final "t" is the brand's graphic signature. Use it large, faint and behind content:
- opacity 0.09–0.15 in white on red/gradient (home hero, feature cards, login), often with `animate-float`;
- as `.t-mark` (gradient-filled through a mask) on the TCAS showcase;
- inside the flashing tile of `LoadingPopup`.

Never use the arrow alone as a substitute for the logo, and never more than one big arrow per view.

---

## 3. Colour

### Core palette

CMYK values are **(เสนอ)** starting points calculated from screen colours. Ask the print shop for a proof and match the proof, not the screen.

| Name (token) | Hex | RGB | CMYK (เสนอ) | Use |
|---|---|---|---|---|
| Brand red (`brand`) | `#DB2931` | 219 41 49 | 0 81 78 14 | The brand. Primary buttons, active nav, key numbers, the logo |
| Hover red (`brand-hover`) | `#C01E26` | 192 30 38 | 0 84 80 25 | Hover/pressed in the app |
| Hot red (`brand-hot`) | `#FF4A3D` | 255 74 61 | 0 71 76 0 | Gradient start, hover glow. Not for small text (contrast) |
| Deep crimson (`brand-deep`) | `#8E1219` | 142 18 25 | 0 87 82 44 | Gradient end, pressed state |
| Brand ink (`brand-ink`) | `#6E0E14` | 110 14 20 | 0 87 82 57 | Dark red text on light red |
| Red soft (`brand-soft`) | `#FDECEC` | 253 236 236 | 0 7 7 1 | Light red backgrounds, hover fills |
| Red tint (`brand-tint`) | `#F9D1D3` | 249 209 211 | 0 16 15 2 | Light red accents |
| Ink (`ink`) | `#140E0E` | 20 14 14 | 0 30 30 92 | Main text (a warm near-black, never pure black) |
| Muted (`muted`) | `#5C5352` | 92 83 82 | 0 10 11 64 | Secondary text |
| Faint (`faint`) | `#8E8483` | 142 132 131 | 0 7 8 44 | Hints, captions, placeholders (large or non-essential text only) |
| Surface (`surface`) | `#FFFFFF` | 255 255 255 | 0 0 0 0 | Cards, panels |
| Page (`page`) | `#F6F4F3` | 246 244 243 | 0 1 1 4 | App background (warm off-white) |
| Sunken (`sunken`) | `#F0ECEA` | 240 236 234 | 0 2 3 6 | Wells, tracks, tab bars |
| Line (`line`) | `#E4DEDB` | 228 222 219 | 0 3 4 11 | 1 px borders |
| Line strong (`line-strong`) | `#CFC6C2` | 207 198 194 | 0 4 6 19 | Hover borders, dashed empty states |

**Proportions (เสนอ):** about 70% white and warm neutrals, 20% red, 10% other accents. Red is precious: if everything is red, nothing stands out.

### Gradients

| Name (class) | Recipe | Where |
|---|---|---|
| Brand gradient (`.bg-brand-gradient`) | 135°: hot `#FF4A3D` 0% → brand 42% → deep `#8E1219` 100% | Emphasis panels, report cover, icon tiles, the top strip on every page. Add `.speed-lines` (white 7%, 2 px every 22 px at 120°) for texture |
| Text gradient (`.text-gradient`) | 100°: hot → brand → deep | One or two words in a big heading |
| Feature gradient (`.bg-feature-gradient`) | 135°: hot → brand 38% → `#A3266F` 72% → violet `#8A4FD8`, plus a violet glow top right | Home feature cards (calendar, TCAS, Roadmap), promos |
| TCAS gradient (`.text-tcas-gradient`, `--tcas-gradient`) | 100°: hot → brand → violet → brand, slowly panning | TCAS headlines only ("Top University") |

Red, white or gradient fills get a matching border or none, **never a grey border**.

### Functional colours (use only for their job)

| Group | Colours | Only for |
|---|---|---|
| Status | danger `#A8121F` / `#FDECEB`, success `#1D7148` / `#E7F3EC`, warning `#7A4B00` / `#FFF5DE` | Messages and states. **Info notices are grey** (`sunken`), because red means brand. Errors always carry an icon |
| Calendar | exam `#E9A21F` / soft `#F8D58A` / tint `#FDF0D2` (quizzes); major-soft `#F6B9BC` / tint `#FDE6E7` (midterm/final); urgent `#D92B33` (due within 24 h, blinking); event stripes `#FEF6E4` + `#F2D394` with text `#7A4B00` | The calendar and anything about deadlines and exams |
| Subjects (`src/lib/school.ts`) | คณิตศาสตร์ `#EA7A1F` · PAT `#8A4FD8` · สังคมศึกษา `#8B5A2B` · วิทยาศาสตร์ `#23995A` · ภาษาไทย `#C99A06` · ภาษาอังกฤษ `#2D7FD3` | Dots, chips and bars for that subject, everywhere (app, report, posters) |
| Chance levels (TCAS) | 1 `#B3261E` · 2 `#F4A4A0` · 3 `#F59E0B` · 4 `#2FA36B` · 5 `#0E6B3D` | The calculator's chance scale only |
| Report groups | tcas `#6D3FC4` / `#EFE7FB`, feature `#2563C4` / `#E5EFFC` | Goal-group tiles in รายงาน & OKR |
| Universities | Faculty colours (`src/lib/facultyColors.ts`) and university faces (`uni-*` in `globals.css`) | TCAS lists and Roadmap cards only. Not brand colours |

### The war room exception

`/admin/report/warroom` is a dark full-screen display with its own palette (background `#06070A`, red `#FF3B43`, amber `#F5B041`, green `#34D399`), scoped to `.warroom`. It's the only dark surface in the brand. Don't reuse it elsewhere (for a dark poster or slide, use the brand gradient or deep crimson instead).

### Contrast (checked against WCAG AA)

| Pair | Ratio | Verdict |
|---|---|---|
| Ink on white | ~19:1 | Any text |
| Muted on white | ~7.5:1 | Any text |
| Brand red on white, white on brand red | ~4.8:1 | Any text (just passes): keep red text bold or ≥ 14 px |
| Faint on white | ~3.6:1 | Large text (≥ 18 px bold / 24 px) or non-essential hints only |
| Hot red on white | ~3.3:1 | Large text and shapes only, never body text |

Never let colour be the only signal: pair it with an icon, a word or a shape (the calendar's blink has a red-ring fallback; status notices have icons).

---

## 4. Typography

### Typefaces (a strict rule from the team)

| Typeface | For | Details |
|---|---|---|
| **Anuphan** (Cadson Demak, SIL Open Font License, commercial use OK) | **All text**: UI, headings, body, numbers, posters, slides | Self-hosted from `public/fonts/Anuphan-Variable.ttf`, weights 100–700. House weight is **bold** (700); extrabold for big display headings |
| **Prompt** (Google Fonts) | **Only** the name "PTN Connext" / "Connext" when it's set as text (`<Brand>`, `font-brand`) | Loaded 600/700/800; the app uses 700 with tight tracking |

No other fonts, anywhere. ("Cloud" by Typomancer was the first wish, but its commercial licence was unclear, so it was dropped.) Fallbacks if Anuphan can't load: Leelawadee UI, Thonburi, system sans.

### Web scale (as built)

| Role | Classes |
|---|---|
| Page title | `font-display text-3xl font-extrabold tracking-tight sm:text-4xl` (`PageHeader`) |
| Hero / login display | `text-4xl`–`text-5xl` (up to `lg:text-6xl`) `font-extrabold leading-tight` |
| Section heading | `font-display text-lg`–`text-xl font-bold` |
| Body | `text-sm`–`text-base`, `leading-relaxed` for paragraphs |
| Small / captions | `text-xs`; `text-[11px]` only for badges and chips |
| Eyebrow | `text-sm font-bold text-brand` after a short skewed red bar |
| Numbers in tables and stats | add `tabular-nums` |

### Thai typesetting

- **Line height (เสนอ):** 1.5–1.7 for Thai body text (Thai has tall vowels and tone marks); 1.15–1.25 for big headings.
- **No letter-spacing on Thai.** `tracking-tight` only on big headings and Latin words like "WAR ROOM".
- Use Thai curly quotes “ ” around UI labels: กด “บันทึก”.
- Digits are Western (0–9), with Thai grouping: `1,240` (`toLocaleString("th-TH")`).
- Don't break a line inside a Thai word; keep short labels on one line.

### Print sizes (เสนอ)

| Item | A0 poster (read from 1–2 m) | A4 / A5 |
|---|---|---|
| Title | 150–220 pt | 28–36 pt |
| Section heading | 80–110 pt | 16–20 pt |
| Big statistic | 160–260 pt | 36–48 pt |
| Body | ≥ 36 pt (ideally 40–48) | ≥ 11 pt |
| Captions, sources | ≥ 24 pt | ≥ 8 pt |

### Canva

- **Prompt** is built into Canva.
- **Anuphan:** upload `Anuphan-Variable.ttf` (or static weights from Google Fonts) to the Canva brand kit; the OFL allows it. If it isn't available, ask before substituting. Don't pick a look-alike.

---

## 5. Shape, depth and space

| Element | Rule |
|---|---|
| Radius | `rounded-lg` small buttons and nav pills · `rounded-xl` buttons, inputs, notices · `rounded-2xl` cards · `rounded-3xl` heroes, login, feature cards · `rounded-full` chips and dots. In print, about 4–8% of the shorter side of a box (เสนอ) |
| Borders | 1 px `line` (`#E4DEDB`); `line-strong` on hover or dashed empty states. **Never black outlines** |
| Shadows (warm, ink-tinted) | `shadow-soft-sm` resting · `shadow-soft` raised · `shadow-soft-lg` hero cards · `shadow-brand-glow` / `-lg` (a soft red glow) only on primary actions |
| Width | `max-w-6xl` (72 rem) for pages, nav and footer, `px-4 sm:px-6` |
| Rhythm | Pages `py-10`; heroes `py-16 sm:py-24`; `PageHeader` `mb-8`; cards `p-5 sm:p-7`; grids `gap-5` |
| Small screens | Everything must work at **375 px** wide with no sideways page scroll |

---

## 6. Graphic elements

| Element | Where | Rule |
|---|---|---|
| Top gradient strip | Top of every page | A thin `bg-brand-gradient` bar (1.5 units) |
| Speed lines | On the brand gradient | Texture only, never on white |
| Arrow-"t" | Heroes, feature cards, loading | See §2: faint, large, behind content |
| Glass panels (`.glass`) | TCAS showcase | White 58%, blur 22 px; on colourful backgrounds only |
| Blurred blobs, mesh (`.tcas-blob`, `.mesh-tcas`) | TCAS pages | Slow drift, behind content |
| Dot grid | Home login section | Subtle texture |
| Emblem watermark | Roadmap cards | University emblem, grey, 13% opacity |
| Roadmap card frames | Roadmap rewards | Game look (bronze, silver, gold, rainbow, flame…): students' cards only, not the wider brand |

Decoration always sits **behind** content, stays subtle, and never competes with numbers or text. One hero effect per view.

---

## 7. Icons

- **lucide-react only** (outline style). No emoji in the UI (one 🎉 on a Roadmap milestone is the exception).
- **Sizes:** `h-4 w-4` default · `h-3.5` in chips · `h-5` in headers · `h-6` in empty states and feature tiles.
- **Stroke:** 2; 2.4 in the nav, notices and feature tiles.
- Decorative icons get `aria-hidden`; icon-only buttons need an `aria-label` (Thai).
- **Print (เสนอ):** the same lucide icons, at least 20 mm on A0, in brand red or white on red, with one consistent stroke weight per piece.

---

## 8. Imagery

- **Photography (เสนอ):** real school life at PTN (classrooms, teachers helping, students using phones or computers), natural light, honest moments. No stock photos of foreign schools; no staged "thumbs up".
- **People and PDPA (เสนอ):** no identifiable student (face, name, ID, uniform name tag) without written consent from the student and a guardian. Prefer hands, backs, wide shots.
- **Screenshots:** take them from the **test** project, or blur every real name, ID and room-activity detail. Show the product at its best: real UI, no mock-ups that don't exist.
- **Treatments already in use:** grayscale photos that turn to colour on hover; a dark overlay (black 80% → 25%) under white text; emblems as watermarks.
- **Credits:** third-party images need a licence and a credit. University photos and emblems are from Wikimedia Commons, credited in `src/lib/tcasArt.ts` and `public/tcas/CREDITS.md` (keep both in sync).
- **Illustration:** none so far. Decoration comes from the arrow-"t", gradients and shapes. If illustration is added (เสนอ): flat, red/neutral, no outlines.

---

## 9. Motion

| Thing | Value |
|---|---|
| Easing (house curve) | `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| Buttons (`PRESS` in `ui.tsx`) | 150 ms; lift `-translate-y-0.5` on hover; `scale-[0.98]` on press |
| Page entrance (`template.tsx`) | `animate-page` 0.35 s |
| Content rising in | `animate-rise` 0.55 s, staggered by `.delay-1`–`.delay-4` (80 ms steps) |
| Sheets and dialogs | Up from the bottom on phones (0.3 s), from the side on larger screens (0.28 s) |
| Ambient | `animate-float` 5 s, gradient pan 6 s, blob drift 22 s |
| Attention | `animate-blink` 1.1 s (deadline within 24 h) |
| Nav | Active link is a solid red pill; inactive links get an underline that slides in on hover |

- **Always respect `prefers-reduced-motion`**: animations stop or become instant, and the deadline blink becomes a red ring.
- **Video and slides (เสนอ):** the same feel. Quick and smooth (200–600 ms), elements rise and fade in, no spins, bounces or flashy transitions.

---

## 10. Voice and writing

### Tone

Thai, neutral and friendly, like a helpful older student or a kind teacher. Address the reader as **คุณ**. **No ครับ/ค่ะ in the UI** (they gender the app). กรุณา/โปรด only for serious moments (security, PDPA).

### Patterns

| Situation | Pattern | Example |
|---|---|---|
| Buttons | Short verb, what happens | บันทึกการแก้ไข · แชร์เอกสาร · เข้าสู่ระบบ |
| Errors | What happened + what to do | ส่งไม่สำเร็จ ลองอีกครั้ง · รหัสหมดอายุแล้ว กด “ส่งรหัสอีกครั้ง” |
| Empty states | Title + next step with an example | ลองใช้คำที่สั้นลง เช่น “วิศวกรรม” แทน “วิศวะ” |
| Teacher guide | 1–3 short lines; every button as “label → what it does”; describe colours literally | ถัดไป → ไปขั้นต่อไปของคู่มือ · หน้าที่เปิดอยู่จะเป็นสีแดง |
| Estimates | Always labelled | ประมาณการ |

### Names and words

| Use | Don't use |
|---|---|
| PTN Connext / Connext | PTN-Connext, PTNConnext, Connex |
| TCAS (in the UI) | TCASter (project code name only) |
| ปฏิทินอัจฉริยะ, Roadmap, คอนโซลครู, คอนโซลผู้พัฒนา | Mixed English UI words when a Thai one exists (เสนอ) |
| นักเรียน, ครู, ผู้ดูแลระบบ | user, admin (in Thai copy) |

### Dates and numbers

- **Buddhist Era** always (พ.ศ. = ค.ศ. + 543), Thai time (Asia/Bangkok). Use the helpers in `src/lib/calendar.ts`:

| Helper | Example |
|---|---|
| `formatDayLong` | วันพฤหัสบดีที่ 12 พฤศจิกายน 2569 |
| `formatDayShort` | 12 พ.ย. |
| `formatMonth` | พฤศจิกายน 2569 |
| `formatTime` | 16:30 น. |
| `formatDateTime` | 12 พ.ย. 2569 16:30 |

- **Numbers:** Western digits with Thai grouping (`1,240`), at most 1 decimal for stats, % without a space (`72%`).
- **English:** only the brand name and the report's English toggle. The rest of the app is Thai only.

### Marketing voice (posters, pitches, social) (เสนอ)

- Lead with the problem in one number, then what Connext does, then proof.
- Confident and specific: "ครูโพสต์ครั้งเดียว ถึงนักเรียนทุกห้อง" beats "ระบบที่ช่วยครูได้มาก".
- **Honest:** real numbers from the report only. Estimates say ประมาณการ. Every outside statistic cites its source and year.
- Short lines; one idea per block; no ALL-CAPS Thai-English mixes; at most one exclamation mark per piece.

---

## 11. Applications

### Website / app

Use the primitives in `src/components/ui.tsx` (`Button`/`buttonStyles`, `smallButtonStyles`, `iconButtonStyles`, `bigButtonStyles` for teacher-critical steps, `inputStyles`, `Card`, `Notice`, `Eyebrow`, `PageHeader`, `EmptyState`, `Container`). Tokens only, no raw colours. Details for building are in CLAUDE.md's UI section.

### Print (เสนอ unless noted)

| Piece | Size | Rules |
|---|---|---|
| Competition poster | A0 portrait 841×1189 mm | 3 mm bleed, 30–40 mm safe margin, 12-column grid with 20 mm gutters, images ≥ 150 dpi at printed size, export **PDF for print** from Canva. Story top to bottom: problem → solution → proof → impact (see CLAUDE.md "Competition poster") |
| Flyer | A5 / A4 | 3 mm bleed, 10 mm margin, one message + QR code |
| Sign-up QR card | As printed by the app (`/admin/access/rooms/[id]/card`) | Keep the app's layout; QR at least 30 mm |
| Report | A4 (built in) | The report page's print styles: A4, 14 mm margins, colours kept |

- **Colour in print:** CMYK values from §3; check a printed proof, since bright red shifts most. Avoid large areas of `brand-hot` (it can't be printed as bright as on screen).
- **Black text:** use ink (rich black C0 M30 Y30 K92) for headings, plain K100 for small body text.

### Slides (เสนอ)

- 16:9 (1920×1080). Cover and closing slide on the brand gradient with speed lines and the white logo; content slides on white.
- One idea per slide; big numbers with a short label; same type rules (Anuphan, Prompt for the name).
- The report's presentation mode (`/admin/report/present`) is the reference look.

### Social (เสนอ)

| Format | Size | Safe zone |
|---|---|---|
| Feed post (IG/Facebook) | 1080×1350 (4:5) | 60 px margin |
| Square | 1080×1080 | 60 px margin |
| Story / Reel cover | 1080×1920 | Keep text out of the top 250 px and bottom 340 px |

Logo bottom-left or top-left at about 1/4 of the width; one headline, at most two lines of supporting text; real screenshots in a device frame or a rounded white card with a soft shadow.

### Canva brand kit (เสนอ)

- **Colours:** brand, hot, deep, ink, muted, page, line, brand-soft, plus the six subject colours.
- **Fonts:** Prompt (headings that include the name), Anuphan (everything else, uploaded).
- **Logos:** the four `public/brand/` logo files and the app icon.

### Email

Sign-up and two-step emails (`src/lib/mail.ts`) copy ink, brand and muted inline, because email can't use the app's CSS. Keep them in step with the tokens.

---

## 12. Accessibility

- Contrast as in §3 (AA); body text never in hot red or faint.
- Touch targets at least 44 px (`h-11` buttons; `bigButtonStyles` at 56 px for teachers).
- Visible focus: a 2 px brand outline with 2 px offset on everything focusable; inputs add the red glow.
- Colour is never the only signal; every image that carries meaning has alt text in Thai.
- Motion respects reduced-motion (§9).

---

## 13. To tidy later (known inconsistencies, not yet fixed in code)

- Raw hex outside the tokens: `#8A4FD8` typed as `bg-[#8a4fd8]` in four places (same as the PAT colour and `--tcas-violet`), `#A3266F` and `#FDE8EE` inside gradients, `#E2B65C` (warning notice border), `#F1DFB4` (password reminder), `#633806`, `#FFD54F`, and the calculator's chip text colours. Candidates for tokens.
- Two violets: `--tcas-violet #8A4FD8` and the report's `tcas` token `#6D3FC4`.
- `urgent #D92B33` is almost the same as `brand #DB2931`; `event-ink` equals `warning` (`#7A4B00`).
- A comment in `src/app/layout.tsx` still mentions the "Cloud" font.
- `connext-red/white.png` aren't used in the app yet; the Roadmap `holo` frame and `classic` theme rely on fallbacks.
- Gradient class syntax is mixed (`bg-gradient-to-*` and `bg-linear-to-*`).

---

## 14. Decision log and how to change a rule

| Date | Decision |
|---|---|
| 2026-11-10 | Clean style matched to the logo: red `#DB2931` on white, thin grey lines, soft shadows, lift/press motion, page-in animation. Rejected: thick black frames, hard offset shadows, tilted stickers |
| 2026-11-10 | Anuphan for all text (Cloud dropped over its licence); Prompt only for the brand name |
| 2026-11-12–13 | TCAS red→violet look and the Roadmap game card (frames, university faces) |
| 2026-11-19 | The dark war room as the one scoped dark surface; report goal-group colours (tcas violet, feature blue) |
| 2026-11-20 | This guide, with print, slides, social and voice rules marked (เสนอ) |

**To change a rule:** agree it with the team → change the code (tokens in `globals.css`, components in `ui.tsx`) → update this file and remove any (เสนอ) mark that's now decided → add a line to the decision log.
