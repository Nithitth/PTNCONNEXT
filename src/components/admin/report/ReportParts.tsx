// The pieces of รายงาน & OKR. Plain components (no hooks, no server imports), so the report page
// and the presentation (client) both draw with them. Charts are hand-made SVG/CSS: no chart library.
import type { ReactNode } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Crown, Info, Minus, Sparkles } from "lucide-react";
import { cx } from "@/components/ui";
import { change, formatDay, formatValue, roomText, T, type Lang, type ScoredOkr, type Status } from "@/lib/report";
import { DAYS, DAYS_SHORT, type Finding, type FunnelStep, type Impact, type RoomRank, type Workload } from "@/lib/reportAnalysis";
import type { Series } from "@/lib/reportView";

const num = (v: number, lang: Lang, digits = 0) => v.toLocaleString(lang === "th" ? "th-TH" : "en-US", { maximumFractionDigits: digits });

/** A numbered report section. Doesn't split across printed pages. */
export function ReportSection({
  n,
  title,
  note,
  children,
  className,
}: {
  n?: number;
  title: string;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("break-inside-avoid rounded-3xl border border-line bg-surface p-5 shadow-soft-sm sm:p-7 print:shadow-none", className)}>
      <header className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {n !== undefined && <span className="font-display text-sm font-extrabold tabular-nums text-brand">{String(n).padStart(2, "0")}</span>}
        <h2 className="font-display text-xl font-extrabold text-ink sm:text-2xl">{title}</h2>
        {note && <p className="w-full text-sm text-muted sm:w-auto">{note}</p>}
      </header>
      {children}
    </section>
  );
}

/** ▲ 12% / ▼ 8% against the previous period. Green when it moved the good way. */
export function Delta({ now, before, lower = false, lang }: { now: number | null; before: number | null; lower?: boolean; lang: Lang }) {
  const c = change(now, before);
  if (c === null) return null;
  if (Math.round(c) === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-bold text-faint">
        <Minus aria-hidden className="h-3 w-3" />
        {lang === "th" ? "เท่าเดิม" : "no change"}
      </span>
    );
  const good = lower ? c < 0 : c > 0;
  const Icon = c > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cx("inline-flex items-center gap-0.5 text-xs font-bold tabular-nums", good ? "text-success" : "text-danger")} title={T[lang].vsPrev}>
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {Math.round(Math.abs(c))}%
    </span>
  );
}

// ─── Connext Score ───────────────────────────────────────────

/** A half-circle gauge, 0–100. `light` for use on the red cover. */
export function ScoreGauge({
  score,
  prev,
  lang,
  light,
  size = 220,
}: {
  score: number | null;
  prev: number | null;
  lang: Lang;
  light?: boolean;
  size?: number;
}) {
  const r = 80;
  const len = Math.PI * r;
  const v = score ?? 0;
  return (
    <figure className="flex flex-col items-center" aria-label={`${T[lang].score} ${score ?? "—"}`}>
      <svg viewBox="0 0 200 116" width={size} height={size * 0.58} role="img" aria-hidden>
        <path
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          stroke={light ? "rgba(255,255,255,0.22)" : "var(--color-sunken)"}
          strokeWidth="16"
          strokeLinecap="round"
        />
        <path
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          stroke={light ? "#fff" : "var(--color-brand)"}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${(len * v) / 100} ${len}`}
          className="transition-[stroke-dasharray] duration-1000 ease-out motion-reduce:transition-none"
        />
        <text x="100" y="92" textAnchor="middle" className="font-display" fontSize="44" fontWeight="800" fill={light ? "#fff" : "var(--color-ink)"}>
          {score ?? "—"}
        </text>
      </svg>
      <figcaption className={cx("mt-1 text-center text-sm font-bold", light ? "text-white" : "text-ink")}>
        {T[lang].score}
        <span className={cx("ml-2 inline-block rounded-full px-2 py-0.5 align-middle", light ? "bg-white/15" : "bg-sunken")}>
          <Delta now={score} before={prev} lang={lang} />
        </span>
      </figcaption>
    </figure>
  );
}

// ─── Findings ────────────────────────────────────────────────

const TONE = {
  good: { Icon: CheckCircle2, cls: "bg-success-soft text-success" },
  watch: { Icon: AlertTriangle, cls: "bg-warning-soft text-warning" },
  info: { Icon: Info, cls: "bg-brand-soft text-brand" },
};

export function Findings({ items, lang, big }: { items: Finding[]; lang: Lang; big?: boolean }) {
  if (!items.length) return <p className="text-sm text-muted">{lang === "th" ? "ยังมีข้อมูลไม่พอสำหรับข้อค้นพบ" : "Not enough data for findings yet"}</p>;
  return (
    <ol className={cx("grid gap-3", !big && "md:grid-cols-2")}>
      {items.map((f) => {
        const t = TONE[f.tone];
        return (
          <li key={f.key} className={cx("flex items-start gap-3 rounded-2xl border border-line bg-page p-4", big && "p-5")}>
            <span className={cx("grid shrink-0 place-items-center rounded-xl", t.cls, big ? "h-12 w-12" : "h-9 w-9")}>
              <t.Icon aria-hidden className={big ? "h-6 w-6" : "h-4 w-4"} />
            </span>
            <p className={cx("leading-relaxed text-ink", big ? "text-xl sm:text-2xl" : "text-sm sm:text-base")}>{f[lang]}</p>
          </li>
        );
      })}
    </ol>
  );
}

// ─── OKR scorecard ───────────────────────────────────────────

const STATUS: Record<Status, { bar: string; chip: string }> = {
  on: { bar: "bg-success", chip: "bg-success-soft text-success" },
  close: { bar: "bg-exam", chip: "bg-warning-soft text-warning" },
  behind: { bar: "bg-brand", chip: "bg-danger-soft text-danger" },
  none: { bar: "bg-faint", chip: "bg-sunken text-muted" },
};

export function ObjectiveCard({ o, i, lang, big }: { o: ScoredOkr; i: number; lang: Lang; big?: boolean }) {
  return (
    <article className="break-inside-avoid rounded-2xl border border-line bg-page p-4 sm:p-5">
      <div className="mb-3 flex items-start gap-3">
        <span className="bg-brand-gradient grid h-9 w-9 shrink-0 place-items-center rounded-xl font-display text-sm font-extrabold text-white shadow-brand-glow">
          O{i + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={cx("font-display font-bold leading-snug text-ink", big ? "text-2xl sm:text-3xl" : "text-base sm:text-lg")}>
            {lang === "en" && o.objectiveEn ? o.objectiveEn : o.objective}
          </h3>
          {o.progress !== null && (
            <p className="text-xs font-bold text-muted">
              {lang === "th" ? `คืบหน้า ${Math.round(o.progress * 100)}%` : `${Math.round(o.progress * 100)}% complete`}
            </p>
          )}
        </div>
      </div>
      <ul className="space-y-3">
        {o.keyResults.map((k, j) => {
          const s = STATUS[k.status];
          return (
            <li key={j}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className={cx("min-w-0 text-ink", big ? "text-lg" : "text-sm")}>{lang === "en" ? k.labelEn : k.label}</span>
                <span className="flex items-center gap-2">
                  <b className={cx("font-display tabular-nums text-ink", big ? "text-2xl" : "text-base")}>{formatValue(k.actual, k.unit, lang)}</b>
                  <span className="text-xs text-muted">
                    {T[lang].target} {k.lower ? "≤" : "≥"} {formatValue(k.target, k.unit, lang)}
                  </span>
                  <Delta now={k.actual} before={k.previous} lower={k.lower} lang={lang} />
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div
                  className="h-2 flex-1 overflow-hidden rounded-full bg-sunken"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round((k.progress ?? 0) * 100)}
                >
                  <div className={cx("h-full rounded-full", s.bar)} style={{ width: `${Math.round((k.progress ?? 0) * 100)}%` }} />
                </div>
                <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold", s.chip)}>{T[lang].status[k.status]}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

// ─── Impact ──────────────────────────────────────────────────

export function ImpactCards({ impact, lang, big }: { impact: Impact; lang: Lang; big?: boolean }) {
  const cards = [
    { v: num(impact.reach, lang), th: "ครั้งที่นักเรียนได้รับข้อมูล", en: "times a student was informed" },
    {
      v: impact.avgReachPerPost === null ? "—" : num(impact.avgReachPerPost, lang),
      th: "นักเรียนต่อ 1 โพสต์ (เฉลี่ย)",
      en: "students reached per post",
    },
    { v: num(impact.hoursSaved, lang, 1), th: "ชั่วโมงที่ครูประหยัดได้", en: "teacher hours saved" },
    { v: num(impact.pagesSaved, lang), th: `แผ่นที่ไม่ต้องพิมพ์ (≈ ${num(impact.bahtSaved, lang)} บาท)`, en: `pages not printed (≈ ฿${num(impact.bahtSaved, lang)})` },
  ];
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <li key={c.th} className="break-inside-avoid rounded-2xl border border-line bg-page p-4">
          <p className={cx("font-display font-extrabold tabular-nums text-brand", big ? "text-5xl sm:text-6xl" : "text-3xl sm:text-4xl")}>{c.v}</p>
          <p className={cx("mt-1 leading-snug text-muted", big ? "text-lg" : "text-sm")}>{c[lang]}</p>
        </li>
      ))}
    </ul>
  );
}

// ─── Adoption ────────────────────────────────────────────────

export function Funnel({ steps, lang, big }: { steps: FunnelStep[]; lang: Lang; big?: boolean }) {
  const max = Math.max(1, steps[0]?.value ?? 1);
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={s.key} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 sm:grid-cols-[12rem_1fr]">
          <span className={cx("text-ink", big ? "text-lg" : "text-sm")}>{s[lang]}</span>
          <div className="flex items-center gap-2">
            <div className="h-7 flex-1 rounded-lg bg-sunken">
              <div
                className="bg-brand-gradient flex h-full min-w-[2.25rem] items-center justify-end rounded-lg px-2 text-xs font-bold tabular-nums text-white"
                style={{ width: `${Math.max(6, (s.value / max) * 100)}%`, opacity: 1 - i * 0.12 }}
              >
                {num(s.value, lang)}
              </div>
            </div>
            <span className="w-12 shrink-0 text-right text-xs font-bold tabular-nums text-muted">
              {s.fromPrev === null ? "" : `${Math.round(s.fromPrev)}%`}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function RoomRanking({ rooms, lang }: { rooms: RoomRank[]; lang: Lang }) {
  if (!rooms.length) return <p className="text-sm text-muted">{lang === "th" ? "ยังไม่มีรายชื่อห้อง" : "No classes yet"}</p>;
  return (
    <ol className="divide-y divide-line">
      {rooms.map((r, i) => (
        <li key={r.classroomId} className="grid grid-cols-[1.5rem_4.5rem_1fr_auto] items-center gap-2 py-2 text-sm">
          <span className="text-center font-display font-bold text-faint">
            {i === 0 && (r.registeredPct ?? 0) > 0 ? <Crown aria-label="อันดับ 1" className="mx-auto h-4 w-4 text-exam" /> : i + 1}
          </span>
          <span className="font-bold text-ink">{roomText(r.label, lang)}</span>
          <div className="h-2 overflow-hidden rounded-full bg-sunken">
            <div className="bg-brand-gradient h-full rounded-full" style={{ width: `${r.registeredPct ?? 0}%` }} />
          </div>
          <span className="text-right text-xs tabular-nums text-muted">
            {lang === "th" ? "ลงทะเบียน" : "signed up"} <b className="text-ink">{r.registeredPct === null ? "—" : `${Math.round(r.registeredPct)}%`}</b> ·{" "}
            {lang === "th" ? "ใช้งาน" : "active"} <b className="text-ink">{r.activePct === null ? "—" : `${Math.round(r.activePct)}%`}</b>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Small weekly bar chart (SVG). */
export function WeeklyBars({ title, series, lang, tone = "brand" }: { title: string; series: Series; lang: Lang; tone?: "brand" | "ink" }) {
  const max = Math.max(1, ...series.map((s) => s.count));
  // At least 10 slots wide, so a few weeks of data still look like bars (not blocks).
  const w = Math.max(series.length, 10) * 14;
  const total = series.reduce((n, s) => n + s.count, 0);
  return (
    <figure className="break-inside-avoid rounded-2xl border border-line bg-page p-4">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-ink">{title}</span>
        <span className="font-display text-xl font-extrabold tabular-nums text-ink">{num(total, lang)}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${w} 64`}
        preserveAspectRatio="none"
        className="h-20 w-full"
        role="img"
        aria-label={`${title}: ${series.map((s) => s.count).join(", ")}`}
      >
        {series.map((s, i) => {
          const h = (s.count / max) * 58;
          return (
            <rect
              key={s.week}
              x={i * 14 + 2}
              y={62 - h}
              width="10"
              height={Math.max(h, 1)}
              rx="2"
              fill={tone === "brand" ? "var(--color-brand)" : "var(--color-ink)"}
              opacity={s.count ? 1 : 0.18}
            />
          );
        })}
      </svg>
      {series.length > 0 && (
        <div className="mt-1 flex justify-between text-[11px] text-faint">
          <span>{formatDay(series[0].week, lang, false)}</span>
          <span>{formatDay(series[series.length - 1].week, lang, false)}</span>
        </div>
      )}
    </figure>
  );
}

// ─── When people use it ──────────────────────────────────────

export function Heatmap({ title, m, lang }: { title: string; m: number[][]; lang: Lang }) {
  const max = Math.max(1, ...m.flat());
  return (
    <figure className="min-w-0 break-inside-avoid">
      <figcaption className="mb-2 text-sm font-bold text-ink">{title}</figcaption>
      <div className="overflow-x-auto">
        <div className="grid min-w-[30rem] grid-cols-[3.5rem_repeat(24,minmax(0,1fr))] gap-[3px] text-[10px] text-faint">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center">
              {h % 3 === 0 ? h : ""}
            </span>
          ))}
          {m.map((row, d) => (
            <div key={d} className="contents">
              <span className="truncate pr-1 text-right text-[11px] text-muted">{DAYS_SHORT[lang][d]}</span>
              {row.map((v, h) => (
                <span
                  key={h}
                  title={`${DAYS[lang][d]} ${h}:00 · ${v}`}
                  className="aspect-square rounded-[3px]"
                  style={{
                    backgroundColor: v ? `color-mix(in srgb, var(--color-brand) ${Math.round(15 + (v / max) * 85)}%, transparent)` : "var(--color-sunken)",
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}

// ─── Workload ────────────────────────────────────────────────

export function WorkloadView({ work, labels, lang }: { work: Workload; labels: Record<string, string>; lang: Lang }) {
  const room = (id: string) => labels[id] ?? "—";
  const perWeek = new Map<string, { a: number; e: number }>();
  for (const w of work.weeks) {
    const x = perWeek.get(w.week) ?? { a: 0, e: 0 };
    x.a += w.assignments;
    x.e += w.exams;
    perWeek.set(w.week, x);
  }
  const weeks = [...perWeek].sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(1, ...weeks.map(([, x]) => x.a + x.e));
  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <figure className="break-inside-avoid rounded-2xl border border-line bg-page p-4">
        <figcaption className="mb-3 flex flex-wrap items-center gap-3 text-sm font-bold text-ink">
          {lang === "th" ? "งานและสอบต่อสัปดาห์ (ทุกห้อง)" : "Work and exams per week (all classes)"}
          <span className="flex items-center gap-1 text-xs font-normal text-muted">
            <i className="h-2.5 w-2.5 rounded-sm bg-ink" /> {lang === "th" ? "งาน" : "work"}
          </span>
          <span className="flex items-center gap-1 text-xs font-normal text-muted">
            <i className="h-2.5 w-2.5 rounded-sm bg-brand" /> {lang === "th" ? "สอบ" : "exams"}
          </span>
        </figcaption>
        {weeks.length === 0 ? (
          <p className="text-sm text-muted">{lang === "th" ? "ไม่มีกำหนดส่งหรือวันสอบในช่วงนี้" : "No deadlines or exams in this period"}</p>
        ) : (
          <ul className="flex h-32 items-end gap-1.5">
            {weeks.map(([week, x]) => (
              <li key={week} className="flex h-full min-w-0 max-w-12 flex-1 flex-col justify-end" title={`${formatDay(week, lang, false)}: ${x.a} / ${x.e}`}>
                <span className="rounded-t bg-brand" style={{ height: `${(x.e / max) * 100}%` }} />
                <span className="bg-ink" style={{ height: `${(x.a / max) * 100}%` }} />
                <span className="mt-1 truncate text-center text-[10px] text-faint">{formatDay(week, lang, false)}</span>
              </li>
            ))}
          </ul>
        )}
      </figure>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {[
            { v: work.leadAssignments, th: "แจ้งงานล่วงหน้า", en: "Work announced ahead" },
            { v: work.leadExams, th: "แจ้งสอบล่วงหน้า", en: "Exams announced ahead" },
          ].map((x) => (
            <div key={x.th} className="rounded-2xl border border-line bg-page p-3">
              <p className="font-display text-2xl font-extrabold tabular-nums text-ink">{formatValue(x.v, "days", lang)}</p>
              <p className="text-xs text-muted">{x[lang]}</p>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-line bg-page p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-ink">
            <AlertTriangle aria-hidden className={cx("h-4 w-4", work.clashes.length ? "text-warning" : "text-faint")} />
            {lang === "th" ? `วันที่สอบชนกัน (${work.clashes.length})` : `Exam clash days (${work.clashes.length})`}
          </p>
          {work.clashes.length === 0 ? (
            <p className="text-xs text-success">{lang === "th" ? "ไม่พบวันที่สอบหนักเกินไป" : "No overloaded exam days"}</p>
          ) : (
            <ul className="space-y-0.5 text-xs text-muted">
              {work.clashes.slice(0, 5).map((c) => (
                <li key={c.classroomId + c.day}>
                  <b className="text-ink">{roomText(room(c.classroomId), lang)}</b> · {formatDay(c.day, lang, false)} ·{" "}
                  {lang === "th" ? `สอบ ${c.exams} วิชา` : `${c.exams} exams`}
                  {c.majors >= 2 ? (lang === "th" ? ` (กลางภาค/ปลายภาค ${c.majors})` : ` (${c.majors} midterm/final)`) : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
        {work.heaviest[0] && (
          <p className="rounded-2xl bg-sunken px-3 py-2 text-xs text-muted">
            <b className="text-ink">{lang === "th" ? "สัปดาห์หนักที่สุด: " : "Heaviest week: "}</b>
            {roomText(room(work.heaviest[0].classroomId), lang)} · {formatDay(work.heaviest[0].week, lang, false)} ·{" "}
            {lang === "th"
              ? `สอบ ${work.heaviest[0].exams} งาน ${work.heaviest[0].assignments}`
              : `${work.heaviest[0].exams} exams, ${work.heaviest[0].assignments} assignments`}
          </p>
        )}
      </div>
    </div>
  );
}

/** Simple labelled horizontal bars. */
export function Bars({ rows, lang, empty }: { rows: { label: string; value: number }[]; lang: Lang; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length || rows.every((r) => r.value === 0)) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,8rem)_1fr_2.5rem] items-center gap-2 text-sm sm:grid-cols-[minmax(0,14rem)_1fr_3rem]">
          <span className="truncate text-ink" title={r.label}>
            {r.label}
          </span>
          <div className="h-2 overflow-hidden rounded-full bg-sunken">
            <div className="bg-brand-gradient h-full rounded-full" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="text-right text-xs font-bold tabular-nums text-muted">{num(r.value, lang)}</span>
        </li>
      ))}
    </ul>
  );
}

/** One big number with a label (and optional ▲/▼). */
export function Stat({ label, value, delta, tone }: { label: string; value: string; delta?: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="break-inside-avoid rounded-2xl border border-line bg-page p-4">
      <p
        className={cx(
          "font-display text-2xl font-extrabold tabular-nums sm:text-3xl",
          tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-ink",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
        {label} {delta}
      </p>
    </div>
  );
}

export function SparkTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 font-display font-bold text-ink">
      <Sparkles aria-hidden className="h-4 w-4 text-brand" />
      {children}
    </h3>
  );
}
