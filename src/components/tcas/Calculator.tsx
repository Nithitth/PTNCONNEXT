"use client";

import { useId, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Lightbulb } from "lucide-react";
import { TargetButtons } from "@/components/tcas/TargetButtons";
import { cx, inputStyles } from "@/components/ui";
import { calculate, examInfo, pickOption, type Round3Option } from "@/lib/tcas";

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

/** "What if I scored this?" sliders for one program's Round 3 formula. */
export function Calculator({ programId, options, saved, canSave }: Props) {
  const id = useId();
  const [position, setPosition] = useState(() => pickOption(options, saved?.position ?? 0)?.position ?? 0);
  const [scores, setScores] = useState<Record<string, number>>(() => saved?.scores ?? {});

  const option = pickOption(options, position)!;
  const codes = useMemo(() => sliderCodes(option), [option]);
  const result = calculate(option, scores);
  const max = Math.max(result.minTotal ?? 0, result.total, 1);

  return (
    <div className="space-y-5">
      {options.length > 1 && (
        <div>
          <label htmlFor={`${id}-option`} className="mb-1.5 block text-sm font-bold text-ink">
            เลือกโครงการ
          </label>
          <select
            id={`${id}-option`}
            value={position}
            onChange={(e) => setPosition(Number(e.target.value))}
            className={cx(inputStyles, "h-11 w-full")}
          >
            {options.map((o) => (
              <option key={o.position} value={o.position}>
                {o.projectName ?? `แบบที่ ${o.position + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      <ul className="space-y-4">
        {codes.map((code) => {
          const info = examInfo(code)!;
          const weight = option.weights[code];
          const value = scores[code] ?? 0;
          return (
            <li key={code}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <label htmlFor={`${id}-${code}`} className="min-w-0 font-bold text-ink">
                  {info.label}{" "}
                  <span className="font-normal text-muted">{weight ? `${weight}%` : "เงื่อนไขขั้นต่ำ"}</span>
                </label>
                <output htmlFor={`${id}-${code}`} className="shrink-0 font-display text-base font-bold tabular-nums text-ink">
                  {info.max === 4 ? value.toFixed(2) : value}
                  <span className="text-xs font-normal text-faint">/{info.max}</span>
                </output>
              </div>
              <input
                id={`${id}-${code}`}
                type="range"
                min={0}
                max={info.max}
                step={info.step}
                value={value}
                onChange={(e) => setScores((s) => ({ ...s, [code]: Number(e.target.value) }))}
                className="h-2 w-full cursor-pointer accent-brand"
              />
            </li>
          );
        })}
      </ul>

      <div className="rounded-2xl border border-line bg-sunken p-4" aria-live="polite">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-muted">คะแนนรวมของคุณ</p>
            <p className="font-display text-3xl font-extrabold tabular-nums text-ink">{fmt(result.total)}</p>
          </div>
          {result.minTotal !== null && (
            <div className="text-right">
              <p className="text-xs font-bold text-muted">คะแนนขั้นต่ำ</p>
              <p className="font-display text-xl font-bold tabular-nums text-muted">{fmt(result.minTotal)}</p>
            </div>
          )}
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-line" aria-hidden>
          <div
            className={cx("h-full rounded-full transition-[width] duration-300", result.passesTotal ? "bg-success" : "bg-brand")}
            style={{ width: `${Math.min(100, (result.total / max) * 100)}%` }}
          />
        </div>
        <p className={cx("mt-3 flex items-center gap-1.5 text-sm font-bold", result.passesTotal ? "text-success" : "text-brand")}>
          {result.passesTotal ? <CheckCircle2 aria-hidden className="h-4 w-4" /> : <AlertCircle aria-hidden className="h-4 w-4" />}
          {result.passesTotal ? "ผ่านเกณฑ์ขั้นต่ำแล้ว" : `ขาดอีก ${fmt(result.gap)} คะแนน`}
        </p>
        {result.hint && (
          <p className="mt-1.5 flex gap-1.5 text-sm text-ink">
            <Lightbulb aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            เพิ่ม {examInfo(result.hint.code)!.label} อีก {fmt(result.hint.points)} คะแนน = ผ่านเกณฑ์
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
        <p>คะแนนขั้นต่ำไม่ใช่คะแนนที่ติดจริง</p>
        {option.extraConditions && <p>มีเงื่อนไขเพิ่มเติมที่เครื่องคำนวณตรวจไม่ได้ ดูรายละเอียดที่ mytcas</p>}
      </div>

      {canSave && (
        <TargetButtons
          programId={programId}
          initiallySaved={Boolean(saved)}
          position={position}
          getScores={() => Object.fromEntries(codes.map((c) => [c, scores[c] ?? 0]))}
        />
      )}
    </div>
  );
}
