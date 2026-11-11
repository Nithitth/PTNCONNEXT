"use client";

import type { CSSProperties } from "react";
import { useId, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Gauge, Info, Lightbulb, TrendingDown, TrendingUp } from "lucide-react";
import { TargetButtons } from "@/components/tcas/TargetButtons";
import { cx, inputStyles } from "@/components/ui";
import {
  CHANCE_LABEL,
  LAST_YEAR_LABEL,
  calculate,
  examInfo,
  pickOption,
  type ChanceLevel,
  type LastYear,
  type Round3Option,
} from "@/lib/tcas";

type Props = {
  programId: string;
  /** Round 3 options the calculator supports (no `problem`). */
  options: Round3Option[];
  saved: { position: number; scores: Record<string, number> } | null;
  canSave: boolean;
};

const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

/** Codes that get a slider: weighted exams first (biggest weight), then minimum-only ones such as GPAX. */
function sliderCodes(o: Round3Option): string[] {
  const weighted = Object.entries(o.weights)
    .sort((a, b) => b[1] - a[1])
    .map(([code]) => code);
  const minOnly = Object.keys(o.minimums).filter((c) => !weighted.includes(c) && examInfo(c));
  if (o.minGpax !== null && !weighted.includes("gpax") && !minOnly.includes("gpax")) minOnly.push("gpax");
  return [...weighted, ...minOnly];
}

// Badge look per level: background + readable text (light red and amber get dark text).
const LEVEL_STYLE: Record<ChanceLevel, { bg: string; fg: string; Icon: typeof TrendingUp }> = {
  1: { bg: "var(--chance-1)", fg: "#fff", Icon: TrendingDown },
  2: { bg: "var(--chance-2)", fg: "#7a1a14", Icon: TrendingDown },
  3: { bg: "var(--chance-3)", fg: "#3d2600", Icon: Gauge },
  4: { bg: "var(--chance-4)", fg: "#fff", Icon: TrendingUp },
  5: { bg: "var(--chance-5)", fg: "#fff", Icon: TrendingUp },
};

/** The 5-level meter on a score axis around last year's range, with a marker at the student's total. */
function ChanceMeter({ total, last, level }: { total: number; last: LastYear; level: ChanceLevel }) {
  const span = Math.max(last.max - last.min, 1);
  const margin = Math.max(3, 0.15 * span);
  const lo = Math.max(0, last.min - 2 * margin);
  const hi = Math.min(100, Math.max(last.max + margin, last.min + span));
  const cuts = [lo, last.min - margin, last.min, last.min + span / 3, last.min + (2 * span) / 3, hi];
  const pct = (v: number) => `${((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100}%`;
  return (
    <div aria-hidden className="pt-6">
      <div className="relative">
        <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
          {([1, 2, 3, 4, 5] as ChanceLevel[]).map((l, i) => (
            <span
              key={l}
              className={cx("h-full transition-opacity duration-300", l === level ? "opacity-100" : "opacity-45")}
              style={{ width: `calc(${(cuts[i + 1] - cuts[i]) / (hi - lo)} * 100%)`, background: `var(--chance-${l})` }}
            />
          ))}
        </div>
        <span
          className="absolute -top-6 flex -translate-x-1/2 flex-col items-center transition-[left] duration-300 ease-out"
          style={{ left: pct(total) }}
        >
          <span className="rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">{fmt(total)}</span>
          <span className="h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-ink" />
        </span>
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] text-muted">
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pct(last.min) }}>
          ต่ำสุด {fmt(last.min)}
        </span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pct(last.max) }}>
          สูงสุด {fmt(last.max)}
        </span>
      </div>
    </div>
  );
}

/** Colour for applicants per seat: calm green, busy amber, crowded red. */
const competitionTone = (r: number) => (r <= 3 ? "var(--chance-4)" : r <= 6 ? "var(--chance-3)" : "var(--chance-1)");

/** Big, colour-coded facts for the chosen option: last year's lowest/highest, competition, seats. */
function StatTiles({ last, seats }: { last: LastYear | null; seats: number | null }) {
  const ratio = last && last.applicants !== null && last.seats ? last.applicants / last.seats : null;
  const tiles: { label: string; value: string; sub?: string; tone: string }[] = [
    { label: `คะแนนต่ำสุด ปี ${LAST_YEAR_LABEL}`, value: last ? fmt(last.min) : "–", sub: "คนสุดท้ายที่ติด", tone: "var(--chance-1)" },
    { label: `คะแนนสูงสุด ปี ${LAST_YEAR_LABEL}`, value: last ? fmt(last.max) : "–", sub: "คนแรกที่ติด", tone: "var(--chance-5)" },
    {
      label: `อัตราการแข่งขัน ปี ${LAST_YEAR_LABEL}`,
      value: ratio !== null ? `1 : ${fmt(Math.round(ratio * 10) / 10)}` : "–",
      sub: ratio !== null ? `สมัคร ${fmt(last!.applicants!)} · รับ ${fmt(last!.seats!)}` : undefined,
      tone: ratio !== null ? competitionTone(ratio) : "var(--color-faint)",
    },
    { label: "รับรอบ 3 ปีนี้", value: seats !== null ? `${fmt(seats)} คน` : "–", sub: "TCAS70", tone: "var(--color-brand)" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/75 p-3.5 shadow-soft-sm"
          style={{ boxShadow: `inset 0 3px 0 ${t.tone}` }}
        >
          <p className="text-[11px] font-bold leading-tight text-muted">{t.label}</p>
          <p className="mt-1.5 font-display text-2xl font-extrabold tabular-nums leading-none sm:text-[1.65rem]" style={{ color: t.tone }}>
            {t.value}
          </p>
          {t.sub && <p className="mt-1 text-[11px] text-muted">{t.sub}</p>}
        </div>
      ))}
    </div>
  );
}

/** "What if I scored this?" sliders for one program's Round 3 formula. */
export function Calculator({ programId, options, saved, canSave }: Props) {
  const id = useId();
  const [position, setPosition] = useState(() => pickOption(options, saved?.position ?? 0)?.position ?? 0);
  const [scores, setScores] = useState<Record<string, number>>(() => saved?.scores ?? {});

  const option = pickOption(options, position)!;
  const codes = useMemo(() => sliderCodes(option), [option]);
  const result = calculate(option, scores);
  const valueOf = (code: string) => scores[code] ?? examInfo(code)!.min;
  const last = option.lastYear;
  const chance = result.chance;

  return (
    <div className="space-y-6">
      {options.length > 1 && (
        <div>
          <label htmlFor={`${id}-option`} className="mb-1.5 block text-sm font-bold text-ink">
            เลือกโครงการ
          </label>
          <select
            id={`${id}-option`}
            value={position}
            onChange={(e) => setPosition(Number(e.target.value))}
            className={cx(inputStyles, "h-11 w-full bg-white/80")}
          >
            {options.map((o) => (
              <option key={o.position} value={o.position}>
                {o.projectName ?? `แบบที่ ${o.position + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      <StatTiles last={last} seats={option.seats} />
      {!last && <p className="-mt-3 text-xs text-muted">ยังไม่มีคะแนนปีที่แล้วสำหรับหลักสูตรนี้</p>}

      <ul className="space-y-5">
        {codes.map((code) => {
          const info = examInfo(code)!;
          const weight = option.weights[code];
          const value = valueOf(code);
          const fill = ((value - info.min) / (info.max - info.min)) * 100;
          return (
            <li key={code}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label htmlFor={`${id}-${code}`} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-ink">
                  {info.label}
                  <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand">
                    {weight ? `${weight}%` : "เงื่อนไขขั้นต่ำ"}
                  </span>
                </label>
                <output
                  htmlFor={`${id}-${code}`}
                  className="shrink-0 rounded-lg border border-white/80 bg-white/80 px-2.5 py-1 font-display text-sm font-bold tabular-nums text-ink shadow-soft-sm"
                >
                  {info.max === 4 ? value.toFixed(2) : value}
                  <span className="text-xs font-normal text-faint">/{info.max}</span>
                </output>
              </div>
              <input
                id={`${id}-${code}`}
                type="range"
                min={info.min}
                max={info.max}
                step={info.step}
                value={value}
                onChange={(e) => setScores((s) => ({ ...s, [code]: Number(e.target.value) }))}
                className="tcas-range w-full"
                style={{ "--fill": `${fill}%` } as CSSProperties}
              />
            </li>
          );
        })}
      </ul>

      {/* Result */}
      <div className="glass rounded-2xl p-4 sm:p-5" aria-live="polite">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-muted">คะแนนรวมของคุณ</p>
            <p className="font-display text-4xl font-extrabold tabular-nums text-ink">{fmt(result.total)}</p>
          </div>
          {chance ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold shadow-soft-sm"
              style={{ background: LEVEL_STYLE[chance.level].bg, color: LEVEL_STYLE[chance.level].fg }}
            >
              {(() => {
                const Icon = LEVEL_STYLE[chance.level].Icon;
                return <Icon aria-hidden className="h-4 w-4" />;
              })()}
              {CHANCE_LABEL[chance.level]}
            </span>
          ) : (
            result.minTotal !== null && (
              <div className="text-right">
                <p className="text-xs font-bold text-muted">คะแนนขั้นต่ำ</p>
                <p className="font-display text-xl font-bold tabular-nums text-muted">{fmt(result.minTotal)}</p>
              </div>
            )
          )}
        </div>

        {last && chance ? (
          <>
            <ChanceMeter total={result.total} last={last} level={chance.level} />
            {chance.reason === "minimum" && (
              <p className="mt-3 flex gap-1.5 text-sm font-bold text-danger">
                <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                ยังไม่ผ่านเกณฑ์ขั้นต่ำของหลักสูตร จึงยังสมัครไม่ได้
              </p>
            )}
          </>
        ) : (
          <>
            <p
              className={cx(
                "mt-3 flex items-center gap-1.5 text-sm font-bold",
                result.status === "pass" ? "text-success" : "text-brand",
              )}
            >
              {result.status === "pass" ? <CheckCircle2 aria-hidden className="h-4 w-4" /> : <AlertCircle aria-hidden className="h-4 w-4" />}
              {result.status === "pass"
                ? "ผ่านเกณฑ์ขั้นต่ำแล้ว"
                : result.status === "short"
                  ? `ขาดอีก ${fmt(result.gap)} คะแนน`
                  : result.status === "minimums"
                    ? "คะแนนรวมถึงเกณฑ์แล้ว แต่ยังไม่ผ่านเงื่อนไขขั้นต่ำ"
                    : "หลักสูตรนี้ไม่ได้ประกาศคะแนนรวมขั้นต่ำ"}
            </p>
            <p className="mt-1 flex gap-1.5 text-xs text-muted">
              <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ยังไม่มีคะแนนปีที่แล้วสำหรับหลักสูตรนี้ จึงประเมินโอกาสติดไม่ได้
            </p>
          </>
        )}

        {result.hint && (
          <p className="mt-3 flex gap-1.5 rounded-xl bg-white/70 px-3 py-2 text-sm text-ink">
            <Lightbulb aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            เพิ่ม {examInfo(result.hint.code)!.label} อีก {fmt(result.hint.points)} คะแนน ={" "}
            {last && last.min >= (result.minTotal ?? 0) ? "ถึงคะแนนต่ำสุดปีที่แล้ว" : "ผ่านเกณฑ์ขั้นต่ำ"}
          </p>
        )}
        {result.failedMinimums.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-danger">
            {result.failedMinimums.map((code) => (
              <li key={code} className="flex gap-1.5">
                <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                {examInfo(code)?.label ?? code} ยังไม่ถึงขั้นต่ำ (
                {code === "gpax" ? (option.minGpax ?? option.minimums.gpax)?.toFixed(2) : option.minimums[code]})
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1 text-xs text-muted">
        <p>เกณฑ์ TCAS70 — ปีที่น้องสมัครอาจเปลี่ยน ใช้เป็นแนวทาง</p>
        {last && <p>คะแนนปีที่แล้วคิดจากเกณฑ์ TCAS{LAST_YEAR_LABEL} ใช้เป็นแนวทาง</p>}
        {option.extraConditions && <p>มีเงื่อนไขเพิ่มเติมที่เครื่องคำนวณตรวจไม่ได้ ดูรายละเอียดที่ mytcas</p>}
      </div>

      {canSave && (
        <TargetButtons
          programId={programId}
          initiallySaved={Boolean(saved)}
          position={position}
          getScores={() => Object.fromEntries(codes.map((c) => [c, valueOf(c)]))}
        />
      )}
    </div>
  );
}
