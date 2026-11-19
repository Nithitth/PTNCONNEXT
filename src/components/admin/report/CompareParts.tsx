// Comparisons for รายงาน & OKR (and the war room with `dark`): goal trend lines, room vs room, subject vs subject,
// feature use. Plain components (no hooks), hand-made SVG/CSS.
import { Crown, TrendingDown, TrendingUp } from "lucide-react";
import { cx } from "@/components/ui";
import { linePath, niceMax, yOf } from "@/lib/chart";
import { formatDay, formatValue, type Lang, type Unit } from "@/lib/report";
import { ROOM_COLUMNS, type FeatureRow, type Point, type Projection, type RoomColumn, type RoomRow, type SubjectRow } from "@/lib/reportCompare";

const num = (v: number, lang: Lang, digits = 0) => v.toLocaleString(lang === "th" ? "th-TH" : "en-US", { maximumFractionDigits: digits });

/** A key result's weekly line with its target as a dashed line. */
export function TrendSpark({
  points,
  target,
  unit,
  lower,
  className,
  w = 160,
  h = 36,
  dark,
}: {
  points: Point[];
  target: number;
  unit: Unit;
  lower?: boolean;
  className?: string;
  w?: number;
  h?: number;
  dark?: boolean;
}) {
  const values = points.map((p) => p.value);
  const known = values.filter((v): v is number => v !== null);
  if (known.length < 2) return null;
  const max = unit === "pct" ? 100 : niceMax(Math.max(target, ...known) * 1.1);
  const d = linePath(values, w, h, { max, min: 0, pad: 3 });
  const ty = yOf(target, h, { max, pad: 3 });
  const last = known[known.length - 1];
  const good = lower ? last <= target : last >= target;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cx("h-9 w-full overflow-visible", className)} role="img" aria-label={`แนวโน้ม ${known.length} สัปดาห์`}>
      <line x1="0" x2={w} y1={ty} y2={ty} stroke="currentColor" strokeDasharray="3 3" className={dark ? "text-white/30" : "text-faint"} strokeWidth="1" />
      <path d={`${d}L${w - 3} ${h - 3}L3 ${h - 3}Z`} className={good ? "fill-success/10" : "fill-brand/10"} />
      <path
        d={d}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={good ? "stroke-success" : dark ? "stroke-[#ff3b43]" : "stroke-brand"}
      />
    </svg>
  );
}

/** "ถึงเป้าแล้ว" / "ตามแนวโน้มนี้ ถึงเป้าราว 7 ธ.ค. 2569" / "ตามแนวโน้มนี้ยังไม่ถึงเป้า". */
export function projectionText(p: Projection | undefined, lang: Lang): string | null {
  if (!p || p.state === "no-data") return null;
  if (p.state === "reached") return lang === "th" ? "ถึงเป้าแล้ว" : "Target reached";
  if (p.state === "latest-week") return lang === "th" ? "สัปดาห์ล่าสุดถึงเป้าแล้ว รักษาไว้" : "Reached in the latest week: keep it up";
  if (p.state === "off-course") return lang === "th" ? "ตามแนวโน้มนี้ยังไม่ถึงเป้า" : "Not on course for the target";
  return lang === "th" ? `ตามแนวโน้มนี้ ถึงเป้าราว ${formatDay(p.week, lang)}` : `On course to reach it around ${formatDay(p.week, lang)}`;
}

// ─── Room vs room ────────────────────────────────────────────

/** Rooms × goals as a heat matrix (darker = higher), the best room in each column crowned. */
export function RoomMatrix({ rows, avg, lang, dark }: { rows: RoomRow[]; avg: Record<RoomColumn, number | null>; lang: Lang; dark?: boolean }) {
  const best = Object.fromEntries(
    ROOM_COLUMNS.map((c) => {
      const vals = rows.map((r) => r.values[c.key]).filter((v): v is number => v !== null);
      return [c.key, vals.length ? Math.max(...vals) : null];
    }),
  ) as Record<RoomColumn, number | null>;
  const cell = (key: string, v: number | null, top: boolean) => (
    <td key={key} className="p-1">
      <div
        className={cx(
          "relative flex h-10 items-center justify-center rounded-lg text-sm font-bold tabular-nums",
          v === null ? (dark ? "text-white/25" : "text-faint") : v >= 55 ? "text-white" : dark ? "text-white" : "text-ink",
        )}
        style={
          v === null
            ? { background: dark ? "rgba(255,255,255,0.03)" : "var(--color-sunken)" }
            : { background: `color-mix(in oklab, ${dark ? "#ff3b43" : "var(--color-brand)"} ${Math.round(12 + v * 0.8)}%, ${dark ? "#0d0f14" : "white"})` }
        }
      >
        {v === null ? "—" : `${Math.round(v)}%`}
        {top && v !== null && <Crown aria-label="สูงสุด" className="absolute -right-1 -top-1.5 h-3.5 w-3.5 text-exam drop-shadow" />}
      </div>
    </td>
  );
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-left">
        <thead>
          <tr>
            <th className={cx("p-1 text-xs font-bold", dark ? "text-white/50" : "text-muted")}>{lang === "th" ? "ห้อง" : "Room"}</th>
            {ROOM_COLUMNS.map((c) => (
              <th key={c.key} className={cx("p-1 text-center text-xs font-bold", dark ? "text-white/50" : "text-muted")}>
                {lang === "th" ? c.th : c.en}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.classroomId}>
              <th scope="row" className={cx("whitespace-nowrap p-1 pr-3 font-display text-sm font-bold", dark ? "text-white" : "text-ink")}>
                {r.label}
                <span className={cx("ml-1.5 text-[11px] font-normal", dark ? "text-white/40" : "text-faint")}>{r.students}</span>
              </th>
              {ROOM_COLUMNS.map((c) => cell(c.key, r.values[c.key], best[c.key] !== null && r.values[c.key] === best[c.key] && rows.length > 1))}
            </tr>
          ))}
          <tr>
            <th scope="row" className={cx("p-1 pr-3 text-xs font-bold", dark ? "text-white/60" : "text-muted")}>
              {lang === "th" ? "เฉลี่ย" : "Average"}
            </th>
            {ROOM_COLUMNS.map((c) => (
              <td key={c.key} className={cx("p-1 text-center text-xs font-bold tabular-nums", dark ? "text-white/60" : "text-muted")}>
                {avg[c.key] === null ? "—" : `${Math.round(avg[c.key]!)}%`}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className={cx("mt-2 text-xs", dark ? "text-white/40" : "text-faint")}>
        {lang === "th"
          ? "ตัวเลขเล็กข้างชื่อห้อง = นักเรียนที่ลงทะเบียน · TCAS และ Roadmap ซ่อนเมื่อมีไม่ถึง 3 คน"
          : "Small number = signed-up students · TCAS and Roadmap hidden under 3 students"}
      </p>
    </div>
  );
}

// ─── Subject vs subject ──────────────────────────────────────

const SUBJECT_COLUMNS: { key: keyof Pick<SubjectRow, "posts" | "seenPct" | "leadDays" | "clashExams">; th: string; en: string; unit: Unit | "n" }[] = [
  { key: "posts", th: "โพสต์", en: "Posts", unit: "n" },
  { key: "seenPct", th: "เปิดดู", en: "Opened", unit: "pct" },
  { key: "leadDays", th: "แจ้งล่วงหน้า", en: "Notice", unit: "days" },
  { key: "clashExams", th: "สอบในวันชน", en: "Clash exams", unit: "n" },
];

/** Each subject in its colour: posts, % opened, notice (days) and exams on clash days, as bars. */
export function SubjectBars({ rows, lang, dark }: { rows: SubjectRow[]; lang: Lang; dark?: boolean }) {
  const max = Object.fromEntries(
    SUBJECT_COLUMNS.map((c) => [c.key, c.unit === "pct" ? 100 : Math.max(1, ...rows.map((r) => (r[c.key] as number | null) ?? 0))]),
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {SUBJECT_COLUMNS.map((c) => (
        <div key={c.key}>
          <p className={cx("mb-2 text-xs font-bold", dark ? "text-white/60" : "text-muted")}>{lang === "th" ? c.th : c.en}</p>
          <ul className="space-y-1.5">
            {rows.map((r) => {
              const v = r[c.key] as number | null;
              return (
                <li key={r.subject} className="flex items-center gap-2 text-xs">
                  <span className={cx("w-20 shrink-0 truncate", dark ? "text-white/80" : "text-ink")}>{r.subject}</span>
                  <span className={cx("relative h-4 min-w-0 flex-1 overflow-hidden rounded", dark ? "bg-white/5" : "bg-sunken")}>
                    {v !== null && (
                      <span className="absolute inset-y-0 left-0 rounded" style={{ width: `${Math.max(2, (v / max[c.key]) * 100)}%`, background: r.color }} />
                    )}
                  </span>
                  <span className={cx("w-14 shrink-0 text-right font-bold tabular-nums", dark ? "text-white" : "text-ink")}>
                    {v === null ? "—" : c.unit === "n" ? num(v, lang) : formatValue(v, c.unit, lang)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ─── Feature use ─────────────────────────────────────────────

/** Every feature's weekly users %, with its line and trend; the least used are flagged. */
export function FeatureBars({ rows, lang, dark }: { rows: FeatureRow[]; lang: Lang; dark?: boolean }) {
  if (rows.every((r) => r.pct === null))
    return (
      <p className={cx("text-sm", dark ? "text-white/50" : "text-muted")}>
        {lang === "th" ? "ยังไม่มีข้อมูลการใช้งานรายฟีเจอร์ (เริ่มเก็บหลังเปิดประวัติการใช้งาน)" : "No feature data yet (collected once activity logs are on)."}
      </p>
    );
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const low = r.pct !== null && r.pct < 20;
        return (
          <li
            key={r.key}
            className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4rem] items-center gap-3 text-sm sm:grid-cols-[12rem_minmax(0,1fr)_5rem_4.5rem]"
          >
            <span className={cx("truncate", dark ? "text-white/85" : "text-ink")}>
              {lang === "th" ? r.th : r.en}
              {low && (
                <span className="ml-1.5 rounded-full bg-warning-soft px-1.5 py-px text-[10px] font-bold text-warning">{lang === "th" ? "ใช้น้อย" : "low"}</span>
              )}
            </span>
            <span className={cx("relative h-3 overflow-hidden rounded-full", dark ? "bg-white/5" : "bg-sunken")}>
              <span
                className={cx("absolute inset-y-0 left-0 rounded-full", low ? "bg-exam" : dark ? "bg-[#ff3b43]" : "bg-brand-gradient")}
                style={{ width: `${Math.max(1, r.pct ?? 0)}%` }}
              />
            </span>
            <span className={cx("hidden h-5 sm:block", dark ? "text-white/60" : "text-muted")}>
              <svg viewBox="0 0 80 20" className="h-5 w-full" aria-hidden>
                <path
                  d={linePath(
                    r.series.map((p) => p.value),
                    80,
                    20,
                    { max: 100, min: 0, pad: 2 },
                  )}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            </span>
            <span className={cx("flex items-center justify-end gap-1 font-bold tabular-nums", dark ? "text-white" : "text-ink")}>
              {r.pct === null ? "—" : `${Math.round(r.pct)}%`}
              {r.trend !== null &&
                Math.abs(r.trend) >= 1 &&
                (r.trend > 0 ? (
                  <TrendingUp aria-label="เพิ่มขึ้น" className="h-3.5 w-3.5 text-success" />
                ) : (
                  <TrendingDown aria-label="ลดลง" className="h-3.5 w-3.5 text-danger" />
                ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
