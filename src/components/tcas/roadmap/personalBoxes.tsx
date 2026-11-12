"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus, X } from "lucide-react";
import { DatePicker } from "@/components/DatePicker";
import { cx, smallButtonStyles } from "@/components/ui";
import { formatDayShort } from "@/lib/calendar";
import {
  ACTIVITY_TYPES,
  BOX_MAX_BACKUPS,
  BOX_MAX_ITEMS,
  BOX_MAX_LINKS,
  newItemId,
  studyDone,
  weekStart,
  type ActivityType,
} from "@/lib/roadmap";
import { examInfo } from "@/lib/tcas";
import { CheckRow, Empty, fieldStyles, type BodyProps } from "./boxParts";
import { ChanceChip } from "./progressBoxes";

const RemoveButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button type="button" onClick={onClick} aria-label={label} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-faint hover:bg-sunken hover:text-danger">
    <X aria-hidden className="h-4 w-4" />
  </button>
);

// ─── กิจกรรม/ค่าย/แข่งขัน ───
export function ActivitiesBox({ data, set }: BodyProps<"activities">) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ActivityType>("camp");
  const [date, setDate] = useState("");
  const full = data.items.length >= BOX_MAX_ITEMS;
  const add = () => {
    const n = name.trim().slice(0, 100);
    if (!n || full) return;
    set({ items: [{ id: newItemId(), name: n, type, date: date || null, note: "" }, ...data.items] });
    setName("");
    setDate("");
  };
  return (
    <div className="space-y-3">
      {data.items.length === 0 ? (
        <Empty>ยังไม่มีกิจกรรม เพิ่มค่าย การแข่งขัน หรือเกียรติบัตรที่ได้ (+15 XP ต่อรายการ)</Empty>
      ) : (
        <ul className="space-y-1.5">
          {data.items.map((a) => (
            <li key={a.id} className="flex items-start gap-2 rounded-xl border border-line px-2.5 py-2 text-sm">
              <span className="shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-bold text-brand">{ACTIVITY_TYPES[a.type]}</span>
              <span className="min-w-0 flex-1 leading-snug text-ink">
                {a.name}
                {a.date && <span className="block text-xs text-muted">{formatDayShort(a.date)}</span>}
              </span>
              <RemoveButton label={`ลบ ${a.name}`} onClick={() => set({ items: data.items.filter((x) => x.id !== a.id) })} />
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="grid grid-cols-2 gap-1.5"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} disabled={full} placeholder="ชื่อกิจกรรม" aria-label="ชื่อกิจกรรม" className={cx(fieldStyles, "col-span-2")} />
        <select value={type} onChange={(e) => setType(e.target.value as ActivityType)} aria-label="ประเภท" className={fieldStyles}>
          {Object.entries(ACTIVITY_TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <DatePicker size="sm" label="วันที่ทำกิจกรรม" placeholder="วันที่ (ไม่บังคับ)" value={date} onChange={setDate} clearable />
        <button type="submit" disabled={full || !name.trim()} className={cx(smallButtonStyles, "col-span-2")}>
          <Plus aria-hidden className="h-4 w-4" />
          เพิ่มกิจกรรม
        </button>
      </form>
    </div>
  );
}

// ─── บันทึก ───
export function NotesBox({ data, set }: BodyProps<"notes">) {
  const [text, setText] = useState(data.text);
  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== data.text && set({ text })}
        maxLength={2000}
        rows={6}
        placeholder="จดอะไรก็ได้ เช่น สิ่งที่ได้จากวันเปิดบ้าน คำแนะนำจากรุ่นพี่"
        aria-label="บันทึก"
        className={cx(fieldStyles, "h-auto resize-y py-2.5 leading-relaxed")}
      />
      <p className="mt-1 text-right text-[11px] text-faint tabular-nums">{text.length.toLocaleString("th-TH")}/2,000 · บันทึกเมื่อกดออกจากช่อง</p>
    </div>
  );
}

// ─── แรงบันดาลใจ ───
export function MottoBox({ data, set }: BodyProps<"motto">) {
  return (
    <div className="space-y-3">
      {data.text ? (
        <p className="text-tcas-gradient py-2 text-center font-display text-2xl font-extrabold leading-snug">“{data.text}”</p>
      ) : (
        <Empty>เขียนประโยคเตือนใจ ว่าทำไมถึงอยากเข้าที่นี่ (+10 XP)</Empty>
      )}
      <input
        defaultValue={data.text}
        onBlur={(e) => set({ text: e.target.value.trim().slice(0, 120) })}
        maxLength={120}
        placeholder="เช่น อยากเป็นวิศวกรที่สร้างหุ่นยนต์ช่วยคน"
        aria-label="ประโยคแรงบันดาลใจ"
        className={fieldStyles}
      />
    </div>
  );
}

// ─── ตารางอ่านหนังสือ ───
const DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"]; // index 0 = Monday
export function StudyBox({ data, set, ctx }: BodyProps<"study">) {
  const [day, setDay] = useState(0);
  const [subject, setSubject] = useState("");
  const [minutes, setMinutes] = useState(60);
  const thisWeek = studyDone(data, ctx.today);
  const slots = thisWeek ? data.slots : data.slots.map((s) => ({ ...s, done: false }));
  const full = slots.length >= BOX_MAX_ITEMS;
  const save = (next: typeof slots) => set({ week: weekStart(ctx.today), slots: next });
  const exams = Object.keys(ctx.program.weights)
    .map((c) => examInfo(c)?.label)
    .filter(Boolean) as string[];
  const total = slots.reduce((s, x) => s + x.minutes, 0);
  const doneCount = slots.filter((s) => s.done).length;
  return (
    <div className="space-y-3">
      {slots.length === 0 ? (
        <Empty>วางแผนว่าจะอ่านอะไรวันไหน แล้วติ๊กเมื่ออ่านแล้ว (+5 XP) ติ๊กจะเริ่มใหม่ทุกวันจันทร์</Empty>
      ) : (
        <>
          <p className="text-xs text-muted">
            สัปดาห์นี้ทำแล้ว {doneCount}/{slots.length} ช่วง · รวม {total.toLocaleString("th-TH")} นาที
          </p>
          <ul className="space-y-1.5">
            {[...slots]
              .sort((a, b) => a.day - b.day)
              .map((s) => (
                <CheckRow
                  key={s.id}
                  done={s.done}
                  onToggle={() => save(slots.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))}
                  onRemove={() => save(slots.filter((x) => x.id !== s.id))}
                  removeLabel={`ลบ ${s.subject}`}
                  extra={<span className="block text-xs text-muted">{s.minutes} นาที</span>}
                >
                  <b className="font-bold">{DAYS[s.day]}</b> · {s.subject}
                </CheckRow>
              ))}
          </ul>
        </>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const sub = subject.trim().slice(0, 60);
          if (!sub || full) return;
          save([...slots, { id: newItemId(), day, subject: sub, minutes, done: false }]);
          setSubject("");
        }}
        className="grid grid-cols-2 gap-1.5"
      >
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          list="study-subjects"
          maxLength={60}
          disabled={full}
          placeholder="อ่านอะไร เช่น TGAT1"
          aria-label="วิชา"
          className={cx(fieldStyles, "col-span-2")}
        />
        <datalist id="study-subjects">
          {exams.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        <select value={day} onChange={(e) => setDay(Number(e.target.value))} aria-label="วัน" className={fieldStyles}>
          {DAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
        <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="กี่นาที" className={fieldStyles}>
          {[15, 30, 45, 60, 90, 120, 180].map((m) => (
            <option key={m} value={m}>
              {m} นาที
            </option>
          ))}
        </select>
        <button type="submit" disabled={full || !subject.trim()} className={cx(smallButtonStyles, "col-span-2")}>
          <Plus aria-hidden className="h-4 w-4" />
          เพิ่มช่วงอ่านหนังสือ
        </button>
      </form>
    </div>
  );
}

// ─── ทักษะที่ต้องพัฒนา ───
export function SkillsBox({ data, set }: BodyProps<"skills">) {
  const [name, setName] = useState("");
  const full = data.items.length >= BOX_MAX_ITEMS;
  const update = (id: string, now: number) => set({ items: data.items.map((x) => (x.id === id ? { ...x, now } : x)) });
  return (
    <div className="space-y-3">
      {data.items.length === 0 && <Empty>เพิ่มทักษะที่อยากพัฒนา แล้วให้คะแนนตัวเอง 1–5</Empty>}
      <ul className="space-y-2.5">
        {data.items.map((s) => (
          <li key={s.id}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-bold text-ink">{s.name}</span>
              <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                {s.now > s.start && <b className="text-success">+{s.now - s.start}</b>}
                <RemoveButton label={`ลบ ${s.name}`} onClick={() => set({ items: data.items.filter((x) => x.id !== s.id) })} />
              </span>
            </div>
            <div role="radiogroup" aria-label={`ระดับ ${s.name} ตอนนี้`} className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={s.now === n}
                  aria-label={`ระดับ ${n}`}
                  onClick={() => update(s.id, n)}
                  className={cx(
                    "h-7 flex-1 rounded-md border text-xs font-bold transition-colors",
                    n <= s.now ? "border-brand bg-brand text-white" : "border-line bg-surface text-faint hover:border-brand/40",
                    n === s.start && "ring-2 ring-ink/15 ring-offset-1",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {data.items.length > 0 && <p className="text-[11px] text-faint">กรอบเทา = ระดับตอนเริ่ม · พัฒนาขึ้น 1 ขั้น = +5 XP</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim().slice(0, 60);
          if (!n || full) return;
          set({ items: [...data.items, { id: newItemId(), name: n, start: 1, now: 1 }] });
          setName("");
        }}
        className="flex gap-1.5"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} disabled={full} placeholder="ทักษะใหม่ เช่น พูดภาษาอังกฤษ" aria-label="ชื่อทักษะ" className={fieldStyles} />
        <button type="submit" disabled={full || !name.trim()} aria-label="เพิ่มทักษะ" className={smallButtonStyles}>
          <Plus aria-hidden className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

// ─── แผนสำรอง ───
export function BackupBox({ data, set, ctx }: BodyProps<"backup">) {
  const options = ctx.targets.filter((t) => t.programId !== ctx.program.programId);
  const picked = data.programIds.map((id) => options.find((o) => o.programId === id)).filter(Boolean) as typeof options;
  const rest = options.filter((o) => !data.programIds.includes(o.programId));
  const full = data.programIds.length >= BOX_MAX_BACKUPS;
  return (
    <div className="space-y-3">
      {picked.length === 0 ? (
        <Empty>
          {options.length === 0 ? (
            <>
              บันทึกหลักสูตรอื่นเป็นเป้าหมายก่อน{" "}
              <Link href="/tcas#search" className="font-bold text-brand hover:underline">
                ค้นหาหลักสูตร
              </Link>
            </>
          ) : (
            "เลือกหลักสูตรสำรองจากเป้าหมายที่บันทึกไว้ (สูงสุด 3)"
          )}
        </Empty>
      ) : (
        <ol className="space-y-1.5">
          {picked.map((t, i) => (
            <li key={t.programId} className="flex items-center gap-2 rounded-xl border border-line px-2.5 py-2 text-sm">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sunken text-xs font-bold text-muted">{i + 1}</span>
              <Link href={`/tcas/${t.programId}`} className="min-w-0 flex-1 leading-snug text-ink hover:text-brand">
                {t.label}
                {t.chance !== null && (
                  <span className="mt-1 block">
                    <ChanceChip level={t.chance} />
                  </span>
                )}
              </Link>
              <RemoveButton label={`เอา ${t.label} ออก`} onClick={() => set({ programIds: data.programIds.filter((x) => x !== t.programId) })} />
            </li>
          ))}
        </ol>
      )}
      {!full && rest.length > 0 && (
        <select
          value=""
          onChange={(e) => e.target.value && set({ programIds: [...data.programIds, e.target.value] })}
          aria-label="เพิ่มหลักสูตรสำรอง"
          className={fieldStyles}
        >
          <option value="">+ เพิ่มหลักสูตรสำรอง</option>
          {rest.map((o) => (
            <option key={o.programId} value={o.programId}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// ─── คลังลิงก์ ───
export function LinksBox({ data, set }: BodyProps<"links">) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const full = data.items.length >= BOX_MAX_LINKS;
  return (
    <div className="space-y-3">
      {data.items.length === 0 ? (
        <Empty>เก็บลิงก์คลิปติว ข้อสอบเก่า หรือเว็บที่ใช้บ่อย</Empty>
      ) : (
        <ul className="space-y-1.5">
          {data.items.map((l) => (
            <li key={l.id} className="flex items-center gap-2 rounded-xl border border-line px-2.5 py-1.5 text-sm">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-1.5 font-bold text-brand hover:underline">
                <span className="truncate">{l.title}</span>
                <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />
              </a>
              <RemoveButton label={`ลบลิงก์ ${l.title}`} onClick={() => set({ items: data.items.filter((x) => x.id !== l.id) })} />
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const t = title.trim().slice(0, 80);
          let u = url.trim();
          if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
          try {
            const p = new URL(u);
            if (p.protocol !== "http:" && p.protocol !== "https:") throw new Error();
          } catch {
            return setError("ลิงก์ไม่ถูกต้อง");
          }
          if (!t || full || u.length > 500) return;
          set({ items: [...data.items, { id: newItemId(), title: t, url: u }] });
          setTitle("");
          setUrl("");
        }}
        className="grid gap-1.5"
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} disabled={full} placeholder="ชื่อลิงก์" aria-label="ชื่อลิงก์" className={fieldStyles} />
        <div className="flex gap-1.5">
          <input value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} disabled={full} inputMode="url" placeholder="https://…" aria-label="ที่อยู่ลิงก์" className={fieldStyles} />
          <button type="submit" disabled={full || !title.trim() || !url.trim()} aria-label="เพิ่มลิงก์" className={smallButtonStyles}>
            <Plus aria-hidden className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="text-xs font-bold text-danger">{error}</p>}
      </form>
    </div>
  );
}
