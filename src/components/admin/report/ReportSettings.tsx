"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, LayoutTemplate, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { resetReportSettings, saveAssumptions, saveOkrs, type ReportResult } from "@/app/admin/report/actions";
import { Notice, buttonStyles, cx, iconButtonStyles, inputStyles, smallButtonStyles } from "@/components/ui";
import { METRICS, OKR_TEMPLATES, formatValue, krProgress, metricOf, statusOf, type Assumptions, type KeyResult, type Okr } from "@/lib/report";
import { MetricPicker, type MetricNow } from "./MetricPicker";
import { CAT_LOOK } from "./metricLook";

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const run = (fn: () => Promise<ReportResult>) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (r.error) setMsg({ tone: "error", text: r.error });
      else {
        setMsg({ tone: "success", text: "บันทึกแล้ว รายงานใช้ค่าใหม่ทันที" });
        router.refresh();
      }
    });
  return { pending, msg, run };
}

const UNIT_HINT: Record<string, string> = { pct: "%", count: "จำนวน", perWeek: "ต่อสัปดาห์", days: "วัน", stage: "ด่าน", hours: "ชั่วโมง", baht: "บาท" };

const newKr = (key = "seen_pct"): KeyResult => {
  const m = metricOf(key) ?? METRICS[0];
  return { metric: m.key, label: m.th, labelEn: m.en, target: m.suggest };
};

/** The live bar under a key result while editing: this term's value against the target typed. */
function LivePreview({ k, now }: { k: KeyResult; now: MetricNow }) {
  const m = metricOf(k.metric);
  if (!m) return null;
  const value = now[m.key]?.value ?? null;
  const p = krProgress(value, k.target, m.lower);
  const s = statusOf(p);
  const tone = { on: "bg-success", close: "bg-exam", behind: "bg-brand", none: "bg-line-strong" }[s];
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface" aria-hidden>
        <span
          className={cx("absolute inset-y-0 left-0 rounded-full transition-[width] duration-300", tone)}
          style={{ width: `${Math.round((p ?? 0) * 100)}%` }}
        />
      </span>
      <span className="shrink-0 tabular-nums text-muted">
        ตอนนี้ <b className="text-ink">{formatValue(value, m.unit, "th")}</b> · เป้า {m.lower ? "≤" : "≥"} {formatValue(k.target, m.unit, "th")}
        {p !== null && <span className="ml-1 font-bold text-ink">({Math.round(p * 100)}%)</span>}
      </span>
    </div>
  );
}

/** Edit the objectives and key results. Each key result picks a goal from the catalogue, so its number is always live. */
export function OkrEditor({ initial, now }: { initial: Okr[]; now: MetricNow }) {
  const [okrs, setOkrs] = useState<Okr[]>(initial);
  const [templates, setTemplates] = useState(false);
  const { pending, msg, run } = useSave();
  const setO = (i: number, patch: Partial<Okr>) => setOkrs((xs) => xs.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const setK = (i: number, k: number, patch: Partial<KeyResult>) =>
    setOkrs((xs) => xs.map((o, j) => (j === i ? { ...o, keyResults: o.keyResults.map((x, n) => (n === k ? { ...x, ...patch } : x)) } : o)));
  const move = <T,>(xs: T[], i: number, d: number) => {
    const ys = [...xs];
    const [x] = ys.splice(i, 1);
    ys.splice(Math.max(0, Math.min(ys.length, i + d)), 0, x);
    return ys;
  };

  return (
    <div className="space-y-4">
      {okrs.map((o, i) => (
        <section key={i} className="rounded-2xl border border-line bg-surface p-4 shadow-soft-sm sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="bg-brand-gradient grid h-9 w-9 shrink-0 place-items-center rounded-xl font-display text-sm font-extrabold text-white">
              O{i + 1}
            </span>
            <h2 className="flex-1 font-display font-bold text-ink">วัตถุประสงค์ {i + 1}</h2>
            <button type="button" aria-label="เลื่อนขึ้น" disabled={i === 0} onClick={() => setOkrs((xs) => move(xs, i, -1))} className={iconButtonStyles}>
              <ArrowUp aria-hidden className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="เลื่อนลง"
              disabled={i === okrs.length - 1}
              onClick={() => setOkrs((xs) => move(xs, i, 1))}
              className={iconButtonStyles}
            >
              <ArrowDown aria-hidden className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="ลบวัตถุประสงค์นี้"
              disabled={okrs.length === 1}
              onClick={() => setOkrs((xs) => xs.filter((_, j) => j !== i))}
              className={iconButtonStyles}
            >
              <Trash2 aria-hidden className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-bold text-ink">ชื่อ (ไทย)</span>
              <input value={o.objective} maxLength={120} onChange={(e) => setO(i, { objective: e.target.value })} className={cx(inputStyles, "h-11 w-full")} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-bold text-ink">ชื่อ (อังกฤษ)</span>
              <input
                value={o.objectiveEn}
                maxLength={120}
                onChange={(e) => setO(i, { objectiveEn: e.target.value })}
                className={cx(inputStyles, "h-11 w-full")}
              />
            </label>
          </div>
          <h3 className="mb-2 mt-4 text-sm font-bold text-muted">ผลลัพธ์หลัก</h3>
          <ol className="space-y-2">
            {o.keyResults.map((k, j) => {
              const m = metricOf(k.metric);
              const current = m ? (now[m.key]?.value ?? null) : null;
              const chips = m
                ? [
                    { label: "แนะนำ", v: m.suggest },
                    ...(current !== null ? [{ label: "ค่าปัจจุบัน", v: Math.round(current * 10) / 10 }] : []),
                    ...(current !== null && current > 0
                      ? [{ label: m.lower ? "−10%" : "+10%", v: Math.round(current * (m.lower ? 0.9 : 1.1) * 10) / 10 }]
                      : []),
                  ]
                : [];
              return (
                <li key={j} className="space-y-2.5 rounded-xl bg-sunken/60 p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-3 w-7 shrink-0 text-center font-display text-xs font-extrabold text-muted">KR{j + 1}</span>
                    <div className="min-w-0 flex-1">
                      <MetricPicker
                        value={k.metric}
                        now={now}
                        onChange={(nm) => {
                          const untouched = !m || k.target === m.suggest;
                          setK(i, j, { metric: nm.key, label: nm.th, labelEn: nm.en, ...(untouched ? { target: nm.suggest } : {}) });
                        }}
                      />
                    </div>
                    <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                      <button
                        type="button"
                        aria-label="เลื่อนผลลัพธ์หลักขึ้น"
                        disabled={j === 0}
                        onClick={() => setO(i, { keyResults: move(o.keyResults, j, -1) })}
                        className={iconButtonStyles}
                      >
                        <ArrowUp aria-hidden className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="ลบผลลัพธ์หลักนี้"
                        disabled={o.keyResults.length === 1}
                        onClick={() => setO(i, { keyResults: o.keyResults.filter((_, x) => x !== j) })}
                        className={iconButtonStyles}
                      >
                        <Trash2 aria-hidden className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end gap-2 sm:pl-9">
                    <label className="block text-xs">
                      <span className="mb-1 block font-bold text-muted">เป้า {m?.lower ? "(ไม่เกิน)" : "(อย่างน้อย)"}</span>
                      <span className="flex items-center overflow-hidden rounded-xl border border-line bg-surface focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={k.target}
                          onChange={(e) => setK(i, j, { target: Number(e.target.value) })}
                          className="h-10 w-24 bg-transparent px-3 text-sm font-bold tabular-nums text-ink focus:outline-none"
                        />
                        <span className="border-l border-line bg-sunken px-2.5 py-2.5 text-xs text-muted">{UNIT_HINT[m?.unit ?? "count"]}</span>
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-1 pb-1">
                      {chips.map((c) => (
                        <button
                          key={c.label}
                          type="button"
                          onClick={() => setK(i, j, { target: c.v })}
                          className={cx(
                            "rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums transition-colors",
                            k.target === c.v
                              ? "border-brand bg-brand-soft text-brand"
                              : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
                          )}
                        >
                          {c.label} {c.v.toLocaleString("th-TH")}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="sm:pl-9">
                    <LivePreview k={k} now={now} />
                  </div>
                  <details className="sm:pl-9">
                    <summary className="cursor-pointer text-xs font-bold text-muted hover:text-brand">แก้ข้อความที่แสดงในรายงาน</summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="block text-xs">
                        <span className="mb-1 block font-bold text-muted">ข้อความ (ไทย)</span>
                        <input
                          value={k.label}
                          maxLength={120}
                          onChange={(e) => setK(i, j, { label: e.target.value })}
                          className={cx(inputStyles, "h-10 w-full text-sm")}
                        />
                      </label>
                      <label className="block text-xs">
                        <span className="mb-1 block font-bold text-muted">ข้อความ (อังกฤษ)</span>
                        <input
                          value={k.labelEn}
                          maxLength={120}
                          onChange={(e) => setK(i, j, { labelEn: e.target.value })}
                          className={cx(inputStyles, "h-10 w-full text-sm")}
                        />
                      </label>
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
          {o.keyResults.length < 5 && (
            <button type="button" onClick={() => setO(i, { keyResults: [...o.keyResults, newKr()] })} className={cx(smallButtonStyles, "mt-2")}>
              <Plus aria-hidden className="h-4 w-4" />
              เพิ่มผลลัพธ์หลัก
            </button>
          )}
        </section>
      ))}

      {templates && okrs.length < 6 && (
        <section aria-label="แม่แบบวัตถุประสงค์" className="rounded-2xl border border-dashed border-line-strong bg-page p-4">
          <p className="mb-3 text-sm font-bold text-ink">เพิ่มจากแม่แบบ (แก้ได้ภายหลัง)</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {OKR_TEMPLATES.map((t) => (
              <li key={t.objective}>
                <button
                  type="button"
                  onClick={() => {
                    setOkrs((xs) => [...xs, structuredClone(t)]);
                    setTemplates(false);
                  }}
                  className="h-full w-full rounded-xl border border-line bg-surface p-3 text-left shadow-soft-sm transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft"
                >
                  <span className="block font-display font-bold text-ink">{t.objective}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {t.keyResults.map((k) => {
                      const m = metricOf(k.metric);
                      const L = m ? CAT_LOOK[m.cat] : null;
                      return (
                        <span key={k.metric} className={cx("rounded-full px-2 py-0.5 text-[11px] font-bold", L?.tile)}>
                          {k.label}
                        </span>
                      );
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {okrs.length < 6 && (
          <>
            <button
              type="button"
              onClick={() => setOkrs((xs) => [...xs, { objective: "", objectiveEn: "", keyResults: [newKr()] }])}
              className={buttonStyles.secondary}
            >
              <Plus aria-hidden className="h-4 w-4" />
              เพิ่มวัตถุประสงค์
            </button>
            <button type="button" aria-expanded={templates} onClick={() => setTemplates((v) => !v)} className={buttonStyles.secondary}>
              <LayoutTemplate aria-hidden className="h-4 w-4" />
              เพิ่มจากแม่แบบ
            </button>
          </>
        )}
        <button type="button" disabled={pending} onClick={() => run(() => saveOkrs(okrs))} className={buttonStyles.primary}>
          <Save aria-hidden className="h-4 w-4" />
          {pending ? "กำลังบันทึก…" : "บันทึก OKR"}
        </button>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}

const FIELDS: { key: keyof Assumptions; label: string; hint: string; step: string }[] = [
  { key: "minutesPerRoom", label: "นาทีที่ครูใช้แจ้งงาน 1 ห้อง (ถ้าไม่มี Connext)", hint: "เช่น ส่งในกลุ่ม LINE เขียนกระดาน ประกาศหน้าห้อง", step: "1" },
  { key: "pagesPerFile", label: "จำนวนหน้าของเอกสาร 1 ชิ้น", hint: "ใช้คำนวณกระดาษที่ประหยัดได้", step: "1" },
  { key: "bahtPerPage", label: "ค่าพิมพ์ต่อหน้า (บาท)", hint: "กระดาษ + หมึก", step: "0.05" },
  { key: "classSize", label: "นักเรียนต่อห้อง", hint: "ใช้ในเครื่องคำนวณสำหรับโรงเรียนอื่น", step: "1" },
  { key: "schoolWeeks", label: "สัปดาห์เรียนต่อปี", hint: "ใช้ในเครื่องคำนวณสำหรับโรงเรียนอื่น", step: "1" },
];

export function AssumptionsEditor({ initial }: { initial: Assumptions }) {
  const [a, setA] = useState<Assumptions>(initial);
  const { pending, msg, run } = useSave();
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block text-sm">
            <span className="mb-1 block font-bold text-ink">{f.label}</span>
            <input
              type="number"
              min={0}
              step={f.step}
              value={a[f.key]}
              onChange={(e) => setA({ ...a, [f.key]: Number(e.target.value) })}
              className={cx(inputStyles, "h-11 w-full tabular-nums")}
            />
            <span className="mt-1 block text-xs text-muted">{f.hint}</span>
          </label>
        ))}
      </div>
      <button type="button" disabled={pending} onClick={() => run(() => saveAssumptions(a))} className={buttonStyles.primary}>
        <Save aria-hidden className="h-4 w-4" />
        {pending ? "กำลังบันทึก…" : "บันทึกสมมติฐาน"}
      </button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}

/** Back to the drafted OKRs and assumptions (two taps). */
export function ResetReportSettings() {
  const [armed, setArmed] = useState(false);
  const { pending, msg, run } = useSave();
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onBlur={() => setArmed(false)}
        onClick={() => (armed ? run(async () => (setArmed(false), resetReportSettings())) : setArmed(true))}
        className={armed ? buttonStyles.danger : buttonStyles.ghost}
      >
        <RotateCcw aria-hidden className="h-4 w-4" />
        {armed ? "กดอีกครั้งเพื่อกลับไปใช้ค่าเริ่มต้น" : "กลับไปใช้ค่าเริ่มต้น"}
      </button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
