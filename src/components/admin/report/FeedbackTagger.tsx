"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, RotateCcw } from "lucide-react";
import { tagFeedback } from "@/app/admin/report/actions";
import { cx, inputStyles, smallButtonStyles } from "@/components/ui";
import { KINDS, TOPICS, type FeedbackKind, type FeedbackTopic } from "@/lib/reportIdeas";

/** Shows a message's theme, and lets the team correct it by hand (saved for everyone). */
export function FeedbackTagger({ id, kind, topics, manual }: { id: string; kind: FeedbackKind; topics: FeedbackTopic[]; manual: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [k, setK] = useState(kind);
  const [ts, setTs] = useState<FeedbackTopic[]>(topics);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (tag: { kind: FeedbackKind; topics: FeedbackTopic[] } | null) =>
    start(async () => {
      setError(null);
      const r = await tagFeedback(id, tag);
      if (r.error) setError(r.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });

  if (!open)
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-white">{KINDS[kind].th}</span>
        {topics.map((t) => (
          <span key={t} className="rounded-full bg-sunken px-2 py-0.5 text-[11px] font-bold text-muted">
            {TOPICS[t].th}
          </span>
        ))}
        {manual && <span className="text-[11px] text-faint">(แก้ด้วยมือ)</span>}
        <button type="button" onClick={() => setOpen(true)} aria-label="แก้หมวด" className="ml-1 rounded-md p-1 text-faint hover:bg-sunken hover:text-brand">
          <Pencil aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>
    );

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-line bg-surface p-3">
      <label className="block text-xs">
        <span className="mb-1 block font-bold text-muted">ประเภท</span>
        <select value={k} onChange={(e) => setK(e.target.value as FeedbackKind)} className={cx(inputStyles, "h-9 w-full text-sm sm:w-56")}>
          {(Object.keys(KINDS) as FeedbackKind[]).map((x) => (
            <option key={x} value={x}>
              {KINDS[x].th}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className="mb-1 text-xs font-bold text-muted">เรื่อง (เลือกได้หลายข้อ)</legend>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(TOPICS) as FeedbackTopic[]).map((t) => {
            const on = ts.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => setTs((xs) => (on ? xs.filter((x) => x !== t) : [...xs, t]))}
                className={cx(
                  "rounded-full border px-2.5 py-1 text-xs font-bold",
                  on ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-muted hover:text-brand",
                )}
              >
                {TOPICS[t].th}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => run({ kind: k, topics: ts.length ? ts : ["other"] })} className={smallButtonStyles}>
          <Check aria-hidden className="h-4 w-4" />
          {pending ? "กำลังบันทึก…" : "บันทึก"}
        </button>
        {manual && (
          <button type="button" disabled={pending} onClick={() => run(null)} className={smallButtonStyles}>
            <RotateCcw aria-hidden className="h-4 w-4" />
            ใช้หมวดอัตโนมัติ
          </button>
        )}
        <button type="button" onClick={() => setOpen(false)} className="px-2 text-sm text-muted hover:text-brand">
          ยกเลิก
        </button>
      </div>
      {error && <p className="text-xs font-bold text-danger">{error}</p>}
    </div>
  );
}
