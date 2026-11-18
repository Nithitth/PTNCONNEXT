"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { resetReportSettings, saveAssumptions, saveOkrs, type ReportResult } from "@/app/admin/report/actions";
import { Notice, buttonStyles, cx, iconButtonStyles, inputStyles, smallButtonStyles } from "@/components/ui";
import { METRICS, metricOf, type Assumptions, type KeyResult, type Okr } from "@/lib/report";

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

const UNIT_HINT: Record<string, string> = { pct: "%", count: "จำนวน", perWeek: "ต่อสัปดาห์", days: "วัน", stage: "ด่าน" };

/** Edit the objectives and key results. Each key result picks a metric, so its number is always live. */
export function OkrEditor({ initial }: { initial: Okr[] }) {
  const [okrs, setOkrs] = useState<Okr[]>(initial);
  const { pending, msg, run } = useSave();
  const setO = (i: number, patch: Partial<Okr>) => setOkrs((xs) => xs.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const setK = (i: number, k: number, patch: Partial<KeyResult>) =>
    setO(i, { keyResults: okrs[i].keyResults.map((x, j) => (j === k ? { ...x, ...patch } : x)) });
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
          <ul className="space-y-2">
            {o.keyResults.map((k, j) => {
              const m = metricOf(k.metric);
              return (
                <li key={j} className="grid gap-2 rounded-xl bg-sunken/60 p-3 md:grid-cols-[minmax(0,14rem)_1fr_1fr_8rem_auto] md:items-end">
                  <label className="block text-xs">
                    <span className="mb-1 block font-bold text-muted">ตัวชี้วัด</span>
                    <select
                      value={k.metric}
                      onChange={(e) => {
                        const nm = metricOf(e.target.value)!;
                        setK(i, j, { metric: nm.key, label: nm.th, labelEn: nm.en });
                      }}
                      className={cx(inputStyles, "h-10 w-full text-sm")}
                    >
                      {METRICS.map((x) => (
                        <option key={x.key} value={x.key}>
                          {x.th}
                        </option>
                      ))}
                    </select>
                  </label>
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
                  <label className="block text-xs">
                    <span className="mb-1 block font-bold text-muted">
                      เป้า {m?.lower ? "(ไม่เกิน)" : "(อย่างน้อย)"} · {UNIT_HINT[m?.unit ?? "count"]}
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={k.target}
                      onChange={(e) => setK(i, j, { target: Number(e.target.value) })}
                      className={cx(inputStyles, "h-10 w-full text-sm tabular-nums")}
                    />
                  </label>
                  <button
                    type="button"
                    aria-label="ลบผลลัพธ์หลักนี้"
                    disabled={o.keyResults.length === 1}
                    onClick={() => setO(i, { keyResults: o.keyResults.filter((_, x) => x !== j) })}
                    className={iconButtonStyles}
                  >
                    <Trash2 aria-hidden className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          {o.keyResults.length < 5 && (
            <button
              type="button"
              onClick={() => setO(i, { keyResults: [...o.keyResults, { metric: METRICS[0].key, label: METRICS[0].th, labelEn: METRICS[0].en, target: 50 }] })}
              className={cx(smallButtonStyles, "mt-2")}
            >
              <Plus aria-hidden className="h-4 w-4" />
              เพิ่มผลลัพธ์หลัก
            </button>
          )}
        </section>
      ))}
      <div className="flex flex-wrap gap-2">
        {okrs.length < 6 && (
          <button
            type="button"
            onClick={() =>
              setOkrs((xs) => [
                ...xs,
                { objective: "", objectiveEn: "", keyResults: [{ metric: METRICS[0].key, label: METRICS[0].th, labelEn: METRICS[0].en, target: 50 }] },
              ])
            }
            className={buttonStyles.secondary}
          >
            <Plus aria-hidden className="h-4 w-4" />
            เพิ่มวัตถุประสงค์
          </button>
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
