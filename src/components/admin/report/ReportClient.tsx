"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarRange, Languages, Lightbulb, MonitorDot, Presentation, Printer, Settings2 } from "lucide-react";
import { DatePicker } from "@/components/DatePicker";
import { buttonStyles, cx, inputStyles } from "@/components/ui";
import { PRESETS, T, type Assumptions, type Lang, type Range } from "@/lib/report";
import { projectSchool, type Rates } from "@/lib/reportAnalysis";

const qs = (o: Record<string, string | undefined>) =>
  "?" +
  Object.entries(o)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join("&");

/** The range, language and action bar (hidden in print). Everything is kept in the URL. */
export function ReportControls({ range, lang }: { range: Range; lang: Lang }) {
  const router = useRouter();
  const t = T[lang];
  const [custom, setCustom] = useState(range.preset === "custom");
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const keep = range.preset === "custom" ? { from: range.from, to: range.to } : { preset: range.preset };
  const en = lang === "en" ? "en" : undefined;
  return (
    <div className="mb-6 space-y-3 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-bold text-muted">
          <CalendarRange aria-hidden className="h-4 w-4" />
          {t.period}
        </span>
        <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-sunken p-1">
          {PRESETS.map((p) => (
            <Link
              key={p}
              href={`/admin/report${qs({ preset: p, lang: en })}`}
              aria-current={range.preset === p ? "page" : undefined}
              className={cx(
                "rounded-lg px-3 py-1.5 text-sm font-bold transition-colors",
                range.preset === p ? "bg-surface text-brand shadow-soft-sm" : "text-muted hover:text-brand",
              )}
            >
              {t.presets[p]}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setCustom((v) => !v)}
            aria-expanded={custom}
            className={cx(
              "rounded-lg px-3 py-1.5 text-sm font-bold transition-colors",
              range.preset === "custom" ? "bg-surface text-brand shadow-soft-sm" : "text-muted hover:text-brand",
            )}
          >
            {t.presets.custom}
          </button>
        </div>
        <div className="flex gap-1 rounded-xl border border-line bg-sunken p-1" aria-label="ภาษา / Language">
          <Languages aria-hidden className="mx-1 h-4 w-4 self-center text-muted" />
          {(["th", "en"] as Lang[]).map((l) => (
            <Link
              key={l}
              href={`/admin/report${qs({ ...keep, lang: l === "en" ? "en" : undefined })}`}
              aria-current={lang === l ? "true" : undefined}
              className={cx("rounded-lg px-3 py-1.5 text-sm font-bold", lang === l ? "bg-surface text-brand shadow-soft-sm" : "text-muted hover:text-brand")}
            >
              {l === "th" ? "ไทย" : "EN"}
            </Link>
          ))}
        </div>
      </div>
      {custom && (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-surface p-3 shadow-soft-sm">
          {(
            [
              [from, setFrom, lang === "th" ? "ตั้งแต่" : "From"],
              [to, setTo, lang === "th" ? "ถึง" : "To"],
            ] as const
          ).map(([value, set, label]) => (
            <div key={label} className="w-44">
              <span className="mb-1 block text-xs font-bold text-muted">{label}</span>
              <DatePicker value={value} onChange={set} label={label} size="sm" />
            </div>
          ))}
          <button
            type="button"
            disabled={!from || !to}
            onClick={() => router.push(`/admin/report${qs({ from, to, lang: en })}`)}
            className={buttonStyles.primary}
          >
            {lang === "th" ? "ดูรายงาน" : "Show report"}
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => window.print()} className={buttonStyles.primary}>
          <Printer aria-hidden className="h-4 w-4" />
          {t.print}
        </button>
        <Link href={`/admin/report/present${qs({ ...keep, lang: en })}`} className={buttonStyles.secondary}>
          <Presentation aria-hidden className="h-4 w-4" />
          {t.present}
        </Link>
        <Link href={`/admin/report/warroom${qs({ preset: keep.preset })}`} className={buttonStyles.secondary}>
          <MonitorDot aria-hidden className="h-4 w-4" />
          {lang === "th" ? "ห้องบัญชาการ" : "War room"}
        </Link>
        <Link href="/admin/report/ideas" className={buttonStyles.secondary}>
          <Lightbulb aria-hidden className="h-4 w-4" />
          {t.ideas}
        </Link>
        <Link href="/admin/report/settings" className={buttonStyles.ghost}>
          <Settings2 aria-hidden className="h-4 w-4" />
          {t.settings}
        </Link>
      </div>
    </div>
  );
}

const VERDICT = {
  free: { th: "แพ็กเกจฟรีเพียงพอ", en: "The free plans are enough", cls: "bg-success-soft text-success" },
  drive: { th: "ควรให้ครูเก็บ PDF ใน Google Drive", en: "Have teachers keep PDFs in Google Drive", cls: "bg-warning-soft text-warning" },
  upgrade: { th: "ควรใช้แพ็กเกจเสียเงิน", en: "A paid plan is needed", cls: "bg-danger-soft text-danger" },
};

/** "What your school would gain": a prospective school types its size and sees a year's projection. */
export function SchoolCalculator({ rates, assumptions, lang }: { rates: Rates; assumptions: Assumptions; lang: Lang }) {
  const [students, setStudents] = useState(1200);
  const [teachers, setTeachers] = useState(60);
  const p = projectSchool(students, teachers, rates, assumptions);
  const n = (v: number, d = 0) => v.toLocaleString(lang === "th" ? "th-TH" : "en-US", { maximumFractionDigits: d });
  const v = VERDICT[p.verdict];
  const field = (label: string, value: number, set: (v: number) => void, max: number) => (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-ink">{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => set(Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
        className={cx(inputStyles, "h-11 w-full tabular-nums print:border-0 print:p-0 print:font-bold")}
      />
    </label>
  );
  return (
    <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
      <div className="space-y-3">
        {field(lang === "th" ? "จำนวนนักเรียน" : "Students", students, setStudents, 100_000)}
        {field(lang === "th" ? "จำนวนครู" : "Teachers", teachers, setTeachers, 5_000)}
        <p className="text-xs leading-relaxed text-muted">
          {lang === "th"
            ? `${rates.measured ? "คำนวณจากการใช้งานจริงของเรา" : "ค่าเริ่มต้น (ยังมีข้อมูลการใช้งานน้อย)"}: ครูโพสต์ ${n(rates.postsPerTeacherWeek, 1)} ครั้ง/สัปดาห์ แต่ละโพสต์ถึง ${n(rates.roomsPerPost, 1)} ห้อง ห้องละ ${assumptions.classSize} คน ${assumptions.schoolWeeks} สัปดาห์ต่อปี`
            : `${rates.measured ? "Based on our real usage" : "Default rates (not enough usage data yet)"}: ${n(rates.postsPerTeacherWeek, 1)} posts per teacher per week, ${n(rates.roomsPerPost, 1)} classes per post, ${assumptions.classSize} students per class, ${assumptions.schoolWeeks} school weeks a year`}
        </p>
      </div>
      <div className="space-y-3">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { v: n(p.postsYear), th: "โพสต์ต่อปี", en: "posts a year" },
            { v: n(p.reachYear), th: "ครั้งที่นักเรียนได้รับข้อมูล", en: "times students are informed" },
            { v: n(p.hoursYear), th: "ชั่วโมงที่ครูประหยัด", en: "teacher hours saved" },
            { v: `฿${n(p.bahtYear)}`, th: `ค่ากระดาษ (${n(p.pagesYear)} แผ่น)`, en: `paper (${n(p.pagesYear)} pages)` },
          ].map((c) => (
            <li key={c.th} className="rounded-2xl border border-line bg-page p-4">
              <p className="font-display text-2xl font-extrabold tabular-nums text-brand sm:text-3xl">{c.v}</p>
              <p className="text-xs text-muted">{c[lang]}</p>
            </li>
          ))}
        </ul>
        <div className={cx("flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3", v.cls)}>
          <b>{v[lang]}</b>
          <span className="text-xs">
            {lang === "th"
              ? `ดาวน์โหลด ≈ ${n(p.downloadsGBMonth, 1)}/5 GB ต่อเดือน · พื้นที่ ≈ ${n(p.storageGB, 2)}/1 GB · ${n(p.accounts)} บัญชี`
              : `Downloads ≈ ${n(p.downloadsGBMonth, 1)}/5 GB a month · storage ≈ ${n(p.storageGB, 2)}/1 GB · ${n(p.accounts)} accounts`}
          </span>
        </div>
      </div>
    </div>
  );
}
