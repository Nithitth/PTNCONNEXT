"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, Plus, Wand2 } from "lucide-react";
import { DatePicker } from "@/components/DatePicker";
import { fillQuestSuggestions } from "@/app/roadmap/actions";
import { cx, smallButtonStyles } from "@/components/ui";
import { daysBetween, formatDayLong } from "@/lib/calendar";
import {
  BOX_MAX_ITEMS,
  GPA_TERMS,
  TERMS,
  daysLeft,
  goalReached,
  latestGpax,
  newItemId,
  termLabel,
  type Term,
} from "@/lib/roadmap";
import { CHANCE_LABEL, examInfo, type ChanceLevel } from "@/lib/tcas";
import { CheckRow, Empty, Meter, fieldStyles, type BodyProps } from "./boxParts";

/** A 1–5 chance chip in the calculator's colours. */
export function ChanceChip({ level }: { level: number }) {
  const lv = level as ChanceLevel;
  return (
    <span
      className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold", lv === 2 || lv === 3 ? "text-ink" : "text-white")}
      style={{ background: `var(--chance-${lv})` }}
    >
      ระดับ {lv} · {CHANCE_LABEL[lv]}
    </span>
  );
}

// ─── เกรดเฉลี่ย ───
export function GpaBox({ data, set, ctx }: BodyProps<"gpa">) {
  const min = ctx.program.minGpax;
  const last = latestGpax(data);
  const setTerm = (t: Term, raw: string) => {
    const terms = { ...data.terms };
    const v = Number.parseFloat(raw);
    if (raw === "" || !Number.isFinite(v)) delete terms[t];
    else terms[t] = Math.min(4, Math.max(1, Math.round(v * 100) / 100));
    set({ terms });
    return terms[t];
  };
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-1.5" aria-hidden>
        {GPA_TERMS.map((t) => {
          const v = data.terms[t];
          return (
            <div key={t} className="relative flex h-16 flex-1 items-end rounded-md bg-sunken">
              {min !== null && <span className="absolute inset-x-0 border-t border-dashed border-brand" style={{ bottom: `${((min - 1) / 3) * 100}%` }} />}
              {v !== undefined && (
                <span
                  className={cx("w-full rounded-md transition-[height] duration-500", min !== null && v >= min ? "bg-success" : "bg-brand-gradient")}
                  style={{ height: `${((v - 1) / 3) * 100}%` }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {GPA_TERMS.map((t) => (
          <label key={t} className="text-center text-[11px] font-bold text-muted">
            {termLabel(t).replace(" เทอม ", "/")}
            <input
              type="number"
              inputMode="decimal"
              min={1}
              max={4}
              step={0.01}
              defaultValue={data.terms[t] ?? ""}
              onBlur={(e) => {
                const v = setTerm(t, e.target.value);
                e.target.value = v === undefined ? "" : String(v); // show the value actually kept (e.g. 9 → 4)
              }}
              placeholder="–"
              className={cx(fieldStyles, "mt-1 h-9 px-1 text-center tabular-nums")}
            />
          </label>
        ))}
      </div>
      <p className="text-xs text-muted">
        {min !== null ? `เส้นประ = GPAX ขั้นต่ำ ${min.toFixed(2)}` : "หลักสูตรนี้ไม่ได้กำหนด GPAX ขั้นต่ำ"}
        {last !== null && min !== null && (last >= min ? " · ผ่านเกณฑ์แล้ว 🎉" : ` · ขาดอีก ${(min - last).toFixed(2)}`)}
      </p>
    </div>
  );
}

// ─── คะแนนสอบ ───
export function ScoresBox({ ctx }: BodyProps<"scores">) {
  const codes = Object.entries(ctx.program.weights).sort((a, b) => b[1] - a[1]);
  const link = `/tcas/${ctx.program.programId}`;
  if (codes.length === 0) return <Empty>หลักสูตรนี้ไม่มีเครื่องคำนวณคะแนนรอบ 3</Empty>;
  return (
    <div className="space-y-3">
      {ctx.chance !== null ? (
        <ChanceChip level={ctx.chance} />
      ) : (
        <p className="text-sm text-muted">{ctx.savedScores ? "ยังไม่มีคะแนนปีก่อนให้เทียบ" : "ยังไม่ได้บันทึกคะแนนของหลักสูตรนี้"}</p>
      )}
      <ul className="space-y-1.5 text-sm">
        {codes.map(([code, w]) => {
          const v = ctx.savedScores?.[code];
          const info = examInfo(code);
          return (
            <li key={code} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-ink">
                {info?.label ?? code} <span className="text-faint">({w}%)</span>
              </span>
              <span className="shrink-0 font-bold tabular-nums text-ink">{v ?? "–"}</span>
            </li>
          );
        })}
      </ul>
      <Link href={link} className={smallButtonStyles}>
        {ctx.savedScores ? "ปรับคะแนนในเครื่องคำนวณ" : "ลองคำนวณแล้วบันทึกเป็นเป้าหมาย"}
      </Link>
    </div>
  );
}

// ─── ภารกิจ ───
export function QuestsBox({ boxId, data, set, ctx, replaceBox }: BodyProps<"quests">) {
  const [title, setTitle] = useState("");
  const [term, setTerm] = useState<Term | "">(ctx.term ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const groups: (Term | null)[] = [null, ...TERMS];
  const full = data.items.length >= BOX_MAX_ITEMS;

  const add = () => {
    const t = title.trim().slice(0, 100);
    if (!t || full) return;
    set({ items: [...data.items, { key: `own:${newItemId()}`, title: t, term: term || null, done: false, xp: 10 }] });
    setTitle("");
  };
  const fill = () =>
    start(async () => {
      setError(null);
      const res = await fillQuestSuggestions(boxId);
      if (res.error) setError(res.error);
      else if (res.box) replaceBox(res.box);
    });

  return (
    <div className="space-y-3">
      {data.items.length === 0 && <Empty>ยังไม่มีภารกิจ กด “เติมภารกิจแนะนำ” หรือพิมพ์เพิ่มเอง</Empty>}
      {groups.map((g) => {
        const items = data.items.filter((q) => q.term === g);
        if (!items.length) return null;
        const now = g !== null && g === ctx.term;
        return (
          <section key={g ?? "any"}>
            <h4 className={cx("mb-1.5 text-xs font-bold", now ? "text-brand" : "text-muted")}>
              {g ? termLabel(g) : "ทุกเทอม"}
              {now && " · เทอมนี้"}
            </h4>
            <ul className="space-y-1.5">
              {items.map((q) => (
                <CheckRow
                  key={q.key}
                  done={q.done}
                  highlight={now}
                  onToggle={() => set({ items: data.items.map((x) => (x.key === q.key ? { ...x, done: !x.done } : x)) })}
                  onRemove={() => set({ items: data.items.filter((x) => x.key !== q.key) })}
                  removeLabel={`ลบภารกิจ ${q.title}`}
                  extra={<span className="ml-1.5 text-[11px] font-bold text-faint">+{q.xp} XP</span>}
                >
                  {q.title}
                </CheckRow>
              ))}
            </ul>
          </section>
        );
      })}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex flex-col gap-1.5 sm:flex-row"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          disabled={full}
          placeholder={full ? `ครบ ${BOX_MAX_ITEMS} ภารกิจแล้ว` : "เพิ่มภารกิจของฉัน"}
          aria-label="ชื่อภารกิจใหม่"
          className={cx(fieldStyles, "sm:flex-1")}
        />
        <select value={term} onChange={(e) => setTerm(e.target.value as Term | "")} aria-label="เทอม" className={cx(fieldStyles, "sm:w-32")}>
          <option value="">ทุกเทอม</option>
          {TERMS.map((t) => (
            <option key={t} value={t}>
              {termLabel(t)}
            </option>
          ))}
        </select>
        <button type="submit" disabled={full || !title.trim()} className={smallButtonStyles}>
          <Plus aria-hidden className="h-4 w-4" />
          เพิ่ม
        </button>
      </form>
      <button type="button" onClick={fill} disabled={pending || full} className={cx(smallButtonStyles, "w-full")}>
        <Wand2 aria-hidden className="h-4 w-4" />
        {pending ? "กำลังเติม…" : "เติมภารกิจแนะนำจากหลักสูตร"}
      </button>
      {error && <p className="text-xs font-bold text-danger">{error}</p>}
    </div>
  );
}

// ─── พอร์ตโฟลิโอ ───
export function PortfolioBox({ data, set, ctx }: BodyProps<"portfolio">) {
  const [open, setOpen] = useState<string | null>(null);
  if (ctx.portfolio.length === 0) return <Empty>หลักสูตรนี้ไม่มีรอบ 1 Portfolio</Empty>;
  const done = new Set(data.done);
  const count = ctx.portfolio.filter((p) => done.has(p.key)).length;
  return (
    <div className="space-y-3">
      <Meter value={count / ctx.portfolio.length} label="ความพร้อมของพอร์ต" tone={count === ctx.portfolio.length ? "success" : "brand"} />
      <ul className="space-y-1.5">
        {ctx.portfolio.map((p) => (
          <CheckRow
            key={p.key}
            done={done.has(p.key)}
            onToggle={() => set({ done: done.has(p.key) ? data.done.filter((k) => k !== p.key) : [...data.done, p.key] })}
            extra={
              p.detail && (
                <>
                  <button
                    type="button"
                    onClick={() => setOpen(open === p.key ? null : p.key)}
                    aria-expanded={open === p.key}
                    className="mt-1 flex items-center gap-0.5 text-xs font-bold text-brand"
                  >
                    ดูเกณฑ์
                    <ChevronDown aria-hidden className={cx("h-3.5 w-3.5 transition-transform", open === p.key && "rotate-180")} />
                  </button>
                  {open === p.key && <p className="mt-1.5 max-h-56 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-muted">{p.detail}</p>}
                </>
              )
            }
          >
            {p.title}
          </CheckRow>
        ))}
      </ul>
    </div>
  );
}

// ─── เป้าหมาย ───
export function GoalBox({ data, set, ctx }: BodyProps<"goal">) {
  const reached = goalReached(data);
  const left = daysLeft(data.deadline, ctx.today);
  const num = (raw: string) => {
    const v = Number.parseFloat(raw);
    return Number.isFinite(v) ? Math.min(100000, Math.max(0, v)) : 0;
  };
  return (
    <div className="space-y-3">
      <input
        defaultValue={data.title}
        onBlur={(e) => set({ ...data, title: e.target.value.trim().slice(0, 80) })}
        maxLength={80}
        placeholder="เป้าหมายคืออะไร เช่น TGAT ให้ได้ 70"
        aria-label="เป้าหมาย"
        className={fieldStyles}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-bold text-muted">
          ตอนนี้ได้
          <input type="number" inputMode="decimal" min={0} step="any" defaultValue={data.current} onBlur={(e) => {
              const n = num(e.target.value);
              e.target.value = String(n);
              set({ ...data, current: n });
            }} className={cx(fieldStyles, "mt-1 tabular-nums")} />
        </label>
        <label className="text-xs font-bold text-muted">
          เป้าหมาย
          <input type="number" inputMode="decimal" min={0} step="any" defaultValue={data.target} onBlur={(e) => {
              const n = num(e.target.value);
              e.target.value = String(n);
              set({ ...data, target: n });
            }} className={cx(fieldStyles, "mt-1 tabular-nums")} />
        </label>
      </div>
      <Meter value={data.target > 0 ? data.current / data.target : 0} label="ความคืบหน้าของเป้าหมาย" tone={reached ? "success" : "brand"} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={cx("font-bold", reached ? "text-success" : "text-muted")}>
          {reached ? "สำเร็จแล้ว! +30 XP" : data.target > 0 ? `อีก ${Math.max(0, Math.round((data.target - data.current) * 100) / 100)} จะถึงเป้า` : "ตั้งตัวเลขเป้าหมายก่อน"}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-muted">
          ภายใน
          <DatePicker
            size="sm"
            label="ทำเป้าหมายให้สำเร็จภายใน"
            placeholder="ไม่กำหนด"
            value={data.deadline ?? ""}
            onChange={(v) => set({ ...data, deadline: v || null })}
            clearable
            className="w-48"
          />
        </span>
      </div>
      {left !== null && !reached && <p className="text-xs text-muted">{left >= 0 ? `เหลือ ${left} วัน` : `เลยกำหนดมา ${-left} วัน`}</p>}
    </div>
  );
}

// ─── นับถอยหลัง ───
export function CountdownBox({ data, set, ctx }: BodyProps<"countdown">) {
  const left = daysLeft(data.date, ctx.today);
  const upcoming = ctx.keyDates.filter((k) => k.date >= ctx.today).slice(0, 4);
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-sunken px-4 py-4 text-center">
        {left === null ? (
          <p className="text-sm text-muted">เลือกวันที่ด้านล่าง</p>
        ) : (
          <>
            <p className="text-tcas-gradient font-display text-5xl font-extrabold tabular-nums leading-none">{Math.abs(left)}</p>
            <p className="mt-1.5 text-sm font-bold text-ink">
              {left > 0 ? `วันก่อน${data.label || "วันสำคัญ"}` : left === 0 ? `วันนี้คือ${data.label || "วันสำคัญ"}!` : `วันหลัง${data.label || "วันสำคัญ"}`}
            </p>
            {data.date && <p className="text-xs text-muted">{formatDayLong(data.date)}</p>}
          </>
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          key={`l-${data.label}`}
          defaultValue={data.label}
          onBlur={(e) => set({ ...data, label: e.target.value.trim().slice(0, 60) })}
          maxLength={60}
          placeholder="นับถอยหลังถึงอะไร"
          aria-label="ชื่อวันสำคัญ"
          className={fieldStyles}
        />
        <DatePicker
          size="sm"
          label="นับถอยหลังถึงวันที่"
          value={data.date ?? ""}
          onChange={(v) => set({ ...data, date: v || null })}
          className="w-44"
        />
      </div>
      {upcoming.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {upcoming.map((k) => (
            <button
              key={`${k.label}-${k.date}`}
              type="button"
              onClick={() => set({ label: k.label.slice(0, 60), date: k.date })}
              className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-bold text-muted hover:border-brand/30 hover:text-brand"
            >
              {k.label} · อีก {daysBetween(ctx.today, k.date)} วัน
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
