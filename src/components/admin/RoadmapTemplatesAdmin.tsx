"use client";

import { useState, useTransition } from "react";
import { CalendarDays, CheckCircle2, Circle, Pencil, Plus, Trash2 } from "lucide-react";
import { DatePicker } from "@/components/DatePicker";
import { deleteKeyDate, deleteTemplate, saveKeyDate, saveTemplate, setTemplateApproved } from "@/app/admin/roadmap/actions";
import { Card, Notice, buttonStyles, cx, inputStyles, smallButtonStyles } from "@/components/ui";
import { formatDayLong } from "@/lib/calendar";
import { TERMS, termLabel, type Term } from "@/lib/roadmap";

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-ink">{text}</span>
      {children}
    </label>
  );
}

export type AdminTemplate = { id: number; groupField: string; term: Term; title: string; detail: string; xp: number; approved: boolean };
type Draft = Omit<AdminTemplate, "id" | "approved"> & { id?: number };

/** Template quests per field group (checked by the guidance teacher) and the TCAS key dates. */
export function RoadmapTemplatesAdmin({
  templates,
  groups,
  keyDates,
}: {
  templates: AdminTemplate[];
  groups: string[];
  keyDates: { id: number; label: string; date: string }[];
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const empty: Draft = { groupField: groups[0] ?? "", term: "m5t1", title: "", detail: "", xp: 10 };
  const [draft, setDraft] = useState<Draft>(empty);
  const [filter, setFilter] = useState("");
  const [day, setDay] = useState({ label: "", date: "" });

  const run = (fn: () => Promise<{ ok?: true; error?: string }>, done: string, after?: () => void) =>
    start(async () => {
      setMessage(null);
      const res = await fn();
      if (res.error) setMessage({ tone: "error", text: res.error });
      else {
        setMessage({ tone: "success", text: done });
        after?.();
      }
    });

  const shown = templates.filter((t) => !filter || t.groupField === filter);
  const byGroup = [...new Set(shown.map((t) => t.groupField))].sort((a, b) => a.localeCompare(b, "th"));

  return (
    <div className="space-y-6">
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.3fr]">
        <Card>
          <h2 className="mb-1 font-display text-lg font-bold text-ink">{draft.id ? "แก้ไขภารกิจแนะนำ" : "เพิ่มภารกิจแนะนำ"}</h2>
          <p className="mb-4 text-sm text-muted">
            นักเรียนจะเห็นเมื่อกด “เติมภารกิจแนะนำ” ในกล่องภารกิจ และเฉพาะที่ครูแนะแนวตรวจแล้ว การแก้ไขจะต้องตรวจใหม่
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => saveTemplate(draft), draft.id ? "บันทึกการแก้ไขแล้ว (รอครูแนะแนวตรวจ)" : "เพิ่มแล้ว (รอครูแนะแนวตรวจ)", () => setDraft({ ...empty, groupField: draft.groupField, term: draft.term }));
            }}
            className="space-y-3"
          >
            <Label text="กลุ่มสาขา">
              <select id="tpl-group" value={draft.groupField} onChange={(e) => setDraft({ ...draft, groupField: e.target.value })} className={cx(inputStyles, "h-11 w-full")}>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <Label text="เทอม">
                <select id="tpl-term" value={draft.term} onChange={(e) => setDraft({ ...draft, term: e.target.value as Term })} className={cx(inputStyles, "h-11 w-full")}>
                  {TERMS.map((t) => (
                    <option key={t} value={t}>
                      {termLabel(t)}
                    </option>
                  ))}
                </select>
              </Label>
              <Label text="XP">
                <select id="tpl-xp" value={draft.xp} onChange={(e) => setDraft({ ...draft, xp: Number(e.target.value) })} className={cx(inputStyles, "h-11 w-full")}>
                  {[10, 20, 30].map((x) => (
                    <option key={x} value={x}>
                      {x} XP
                    </option>
                  ))}
                </select>
              </Label>
            </div>
            <Label text="ชื่อภารกิจ">
              <input id="tpl-title" value={draft.title} maxLength={100} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="เช่น เข้าค่ายวิศวะช่วงปิดเทอม" className={cx(inputStyles, "h-11 w-full")} />
            </Label>
            <Label text="รายละเอียด (ไม่บังคับ)">
              <textarea id="tpl-detail" value={draft.detail} maxLength={500} rows={3} onChange={(e) => setDraft({ ...draft, detail: e.target.value })} className={cx(inputStyles, "w-full py-2.5")} />
            </Label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={pending || !draft.title.trim() || !draft.groupField} className={buttonStyles.primary}>
                <Plus aria-hidden className="h-4 w-4" />
                {draft.id ? "บันทึกการแก้ไข" : "เพิ่มภารกิจ"}
              </button>
              {draft.id && (
                <button type="button" onClick={() => setDraft(empty)} className={buttonStyles.ghost}>
                  ยกเลิก
                </button>
              )}
            </div>
          </form>
        </Card>

        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-ink">ภารกิจแนะนำทั้งหมด ({templates.length})</h2>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="กรองตามกลุ่มสาขา" className={cx(inputStyles, "h-9 max-w-full text-sm sm:w-56")}>
              <option value="">ทุกกลุ่มสาขา</option>
              {[...new Set(templates.map((t) => t.groupField))].map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-muted">ยังไม่มีภารกิจแนะนำ</p>
          ) : (
            <div className="space-y-5">
              {byGroup.map((g) => (
                <section key={g}>
                  <h3 className="mb-2 text-sm font-bold text-muted">{g}</h3>
                  <ul className="space-y-2">
                    {shown
                      .filter((t) => t.groupField === g)
                      .sort((a, b) => TERMS.indexOf(a.term) - TERMS.indexOf(b.term))
                      .map((t) => (
                        <li key={t.id} className="flex flex-wrap items-start gap-2 rounded-xl border border-line px-3 py-2.5 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-ink">{t.title}</p>
                            <p className="text-xs text-muted">
                              {termLabel(t.term)} · {t.xp} XP{t.detail && ` · ${t.detail}`}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => setTemplateApproved(t.id, !t.approved), t.approved ? "ยกเลิกการตรวจแล้ว" : "ตรวจแล้ว นักเรียนเห็นภารกิจนี้แล้ว")}
                            className={cx(smallButtonStyles, t.approved && "!border-success/40 !text-success")}
                          >
                            {t.approved ? <CheckCircle2 aria-hidden className="h-4 w-4" /> : <Circle aria-hidden className="h-4 w-4" />}
                            {t.approved ? "ครูแนะแนวตรวจแล้ว" : "ยังไม่ตรวจ"}
                          </button>
                          <button type="button" aria-label={`แก้ไข ${t.title}`} onClick={() => setDraft({ id: t.id, groupField: t.groupField, term: t.term, title: t.title, detail: t.detail, xp: t.xp })} className={smallButtonStyles}>
                            <Pencil aria-hidden className="h-4 w-4" />
                          </button>
                          <button type="button" aria-label={`ลบ ${t.title}`} disabled={pending} onClick={() => run(() => deleteTemplate(t.id), "ลบแล้ว")} className={smallButtonStyles}>
                            <Trash2 aria-hidden className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold text-ink">
          <CalendarDays aria-hidden className="h-5 w-5 text-brand" />
          วันสำคัญ TCAS
        </h2>
        <p className="mb-4 text-sm text-muted">แสดงเป็นตัวเลือกในกล่อง “นับถอยหลัง” ของนักเรียน เช่น วันสอบ TGAT/TPAT วันสมัครรอบ 1</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveKeyDate(day), "เพิ่มวันสำคัญแล้ว", () => setDay({ label: "", date: "" }));
          }}
          className="mb-4 flex flex-col gap-2 sm:flex-row"
        >
          <input value={day.label} maxLength={60} onChange={(e) => setDay({ ...day, label: e.target.value })} placeholder="ชื่อวัน เช่น สอบ TGAT/TPAT" aria-label="ชื่อวันสำคัญ" className={cx(inputStyles, "h-11 w-full sm:flex-1")} />
          <DatePicker size="sm" label="วันสำคัญ TCAS" value={day.date} onChange={(v) => setDay({ ...day, date: v })} className="sm:w-56" />
          <button type="submit" disabled={pending || !day.label.trim() || !day.date} className={buttonStyles.primary}>
            <Plus aria-hidden className="h-4 w-4" />
            เพิ่ม
          </button>
        </form>
        {keyDates.length === 0 ? (
          <p className="text-sm text-muted">ยังไม่มีวันสำคัญ</p>
        ) : (
          <ul className="divide-y divide-line">
            {keyDates.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  <b className="font-bold text-ink">{d.label}</b> <span className="text-muted">· {formatDayLong(d.date)}</span>
                </span>
                <button type="button" aria-label={`ลบ ${d.label}`} disabled={pending} onClick={() => run(() => deleteKeyDate(d.id), "ลบแล้ว")} className={smallButtonStyles}>
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
