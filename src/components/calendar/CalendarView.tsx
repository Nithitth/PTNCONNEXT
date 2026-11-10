"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, CalendarClock, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import {
  WEEKDAYS_SHORT,
  dayKey,
  daysBetween,
  formatDayLong,
  formatMonth,
  formatMonthShort,
  formatTime,
  isDueSoon,
  isInMonth,
  monthParam,
  placeItems,
  shiftMonth,
  sortMaterials,
  upcoming,
  type CalendarItem,
  type DayInfo,
  type DayKey,
  type MaterialSort,
  type MonthRef,
} from "@/lib/calendar";
import { SUBJECTS } from "@/lib/school";
import { cx, iconButtonStyles, smallButtonStyles } from "@/components/ui";
import { BLINK, DayDrawer, AttachmentLinks, DueDot, EXAM_LOOK } from "./DayDrawer";

type Props = {
  month: MonthRef;
  /** The 42 days on screen (the server already worked them out to load the right posts). */
  days: DayKey[];
  items: CalendarItem[];
  materials: CalendarItem[];
  nowIso: string;
};

const MAX_ROWS_DESKTOP = 2;
const monthHref = (m: MonthRef) => `/calendar?m=${monthParam(m)}`;

export function CalendarView({ month, days, items, materials, nowIso }: Props) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const today = dayKey(now);
  const monthLabel = formatMonth(month);
  const isCurrentMonth = today.startsWith(monthParam(month));
  const placed = useMemo(() => placeItems(items, days), [items, days]);
  const soon = useMemo(() => upcoming(items, now), [items, now]);

  const [openDay, setOpenDay] = useState<DayKey | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const openDrawer = (key: DayKey) => {
    setOpenDay(key);
    if (!dialog.current?.open) dialog.current?.showModal();
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section
        aria-label={`ปฏิทินเดือน${monthLabel}`}
        className="animate-rise overflow-hidden rounded-3xl border border-line bg-surface shadow-soft-lg"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{monthLabel}</h2>
          <div className="flex items-center gap-1.5">
            {!isCurrentMonth && (
              <Link href="/calendar" className={smallButtonStyles}>
                วันนี้
              </Link>
            )}
            <Link href={monthHref(shiftMonth(month, -1))} aria-label="เดือนก่อน" className={iconButtonStyles}>
              <ChevronLeft aria-hidden className="h-5 w-5" />
            </Link>
            <Link href={monthHref(shiftMonth(month, 1))} aria-label="เดือนถัดไป" className={iconButtonStyles}>
              <ChevronRight aria-hidden className="h-5 w-5" />
            </Link>
          </div>
        </header>

        <div className="select-none">
          <div aria-hidden className="grid grid-cols-7 border-b border-line bg-sunken/60">
            {WEEKDAYS_SHORT.map((d, i) => (
              <div key={d} className={cx("py-2 text-center text-xs font-bold", i === 0 ? "text-brand" : "text-muted")}>
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-line">
            {days.map((key) => (
              <DayCell
                key={key}
                dayKeyValue={key}
                info={placed.get(key)!}
                inMonth={isInMonth(key, month)}
                isToday={key === today}
                isSelected={key === openDay}
                now={now}
                onOpen={() => openDrawer(key)}
              />
            ))}
          </div>
        </div>

        <Legend />
      </section>

      <aside className="space-y-5">
        <UpcomingCard items={soon} today={today} now={now} onOpenDay={openDrawer} />
        <MaterialsCard items={materials} />
      </aside>

      <DayDrawer
        ref={dialog}
        day={openDay}
        info={openDay ? placed.get(openDay) : undefined}
        now={now}
        onClose={() => setOpenDay(null)}
      />
    </div>
  );
}

// ─── One day in the grid ─────────────────────────────────────

function DayCell({
  dayKeyValue,
  info,
  inMonth,
  isToday,
  isSelected,
  now,
  onOpen,
}: {
  dayKeyValue: DayKey;
  info: DayInfo;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  now: Date;
  onOpen: () => void;
}) {
  const dayNumber = Number(dayKeyValue.slice(8));
  const isExam = info.exams.length > 0;
  const isLeadUp = !isExam && info.leadUp.length > 0;
  const event = info.events[0];
  // Midterm/final (red) wins over a quiz (amber) when both fall on one day.
  const exam = info.exams.find((e) => e.examKind === "major") ?? info.exams[0];
  const leadUpLook = EXAM_LOOK[info.leadUp.some((l) => l.item.examKind === "major") ? "major" : "quiz"];
  // Day color: exam day > school activity (striped) > days before an exam > plain.
  const background = exam
    ? EXAM_LOOK[exam.examKind].day
    : event
      ? "bg-event-stripes"
      : isLeadUp
        ? leadUpLook.tint
        : inMonth
          ? "bg-surface"
          : "bg-page";
  // Show the event name on its first day, and again at the start of each week.
  const eventLabelHere =
    event &&
    (dayKey(event.dueAt!) === dayKeyValue || new Date(`${dayKeyValue}T00:00:00Z`).getUTCDay() === 0);

  const summary = [
    info.events.length && `กิจกรรม ${info.events.map((e) => e.title).join(", ")}`,
    isExam && `วันสอบ ${info.exams.map((e) => e.subject?.name ?? e.title).join(", ")}`,
    isLeadUp && `อีก ${info.leadUp[0].daysLeft} วันสอบ`,
    info.due.length && `งานส่ง ${info.due.length} งาน`,
  ]
    .filter(Boolean)
    .join(" · ");

  const extra = info.due.length - MAX_ROWS_DESKTOP;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${formatDayLong(dayKeyValue)}${summary ? ` — ${summary}` : ""}`}
      aria-current={isToday ? "date" : undefined}
      className={cx(
        "group relative flex h-16 min-w-0 flex-col items-stretch gap-1 overflow-hidden p-1 text-left outline-none transition-colors duration-150 sm:h-28 sm:p-1.5 lg:h-32",
        background,
        "hover:brightness-[0.97] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
        isSelected && "z-10 ring-2 ring-inset ring-brand",
      )}
    >

      <span className="flex items-center justify-between gap-1">
        <span
          className={cx(
            "grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-bold tabular-nums sm:text-sm",
            isToday ? "bg-brand text-white shadow-brand-glow" : inMonth ? "text-ink" : "text-faint",
          )}
        >
          {dayNumber}
        </span>
        {exam && (
          <span className={cx("hidden truncate rounded-md px-1.5 py-0.5 text-[11px] font-bold sm:inline", EXAM_LOOK[exam.examKind].chip)}>
            สอบ
          </span>
        )}
      </span>

      {/* Tablet/desktop: short labels */}
      <span className={cx("hidden min-w-0 flex-col gap-0.5 sm:flex", !inMonth && "opacity-60")}>
        {eventLabelHere && (
          <span className="truncate rounded-md bg-surface/85 px-1.5 py-0.5 text-[11px] font-bold text-event-ink">{event.title}</span>
        )}
        {exam && (
          <span className={cx("truncate text-[11px] font-bold", EXAM_LOOK[exam.examKind].text)}>
            {exam.subject?.name ?? exam.title}
          </span>
        )}
        {info.due.slice(0, MAX_ROWS_DESKTOP).map((d) => (
          <span key={d.key} className="flex min-w-0 items-center gap-1 text-[11px] leading-tight text-ink">
            <DueDot item={d} now={now} />
            <span className="truncate">{d.title}</span>
          </span>
        ))}
        {extra > 0 && <span className="text-[11px] font-bold text-muted">+{extra} งาน</span>}
      </span>

      {/* Phone: dots only */}
      {info.due.length > 0 && (
        <span className="mt-auto flex flex-wrap gap-1 sm:hidden">
          {info.due.slice(0, 4).map((d) => (
            <DueDot key={d.key} item={d} now={now} />
          ))}
          {info.due.length > 4 && <span className="text-[9px] font-bold leading-none text-muted">+</span>}
        </span>
      )}
    </button>
  );
}

function Swatch({ className }: { className: string }) {
  return <span aria-hidden className={cx("h-3 w-3 rounded border border-ink/10", className)} />;
}

function Legend() {
  return (
    <div className="space-y-2.5 border-t border-line px-4 py-3 text-xs text-muted sm:px-6">
      {/* Subject colors: each deadline dot uses its subject's color */}
      <ul aria-label="สีของแต่ละวิชา" className="flex flex-wrap gap-1.5">
        {SUBJECTS.map((s) => (
          <li
            key={s.code}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pl-1.5 pr-2.5 font-bold text-ink"
          >
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            {s.name}
          </li>
        ))}
      </ul>
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className={cx("h-2 w-2 rounded-full bg-urgent", BLINK)} />
          ส่งภายใน 24 ชม.
        </li>
        <li className="flex items-center gap-1.5">
          <Swatch className="bg-exam-tint" />
          <Swatch className="bg-exam-soft" />
          สอบเก็บคะแนน / สอบย่อย (ก่อนสอบ · วันสอบ)
        </li>
        <li className="flex items-center gap-1.5">
          <Swatch className="bg-major-tint" />
          <Swatch className="bg-major-soft" />
          สอบกลางภาค / ปลายภาค (ก่อนสอบ · วันสอบ)
        </li>
        <li className="flex items-center gap-1.5">
          <Swatch className="bg-event-stripes" />
          กิจกรรมโรงเรียน
        </li>
      </ul>
    </div>
  );
}

// ─── Side panel ──────────────────────────────────────────────

function relativeDay(today: DayKey, key: DayKey) {
  const n = daysBetween(today, key);
  if (n === 0) return "วันนี้";
  if (n === 1) return "พรุ่งนี้";
  return `อีก ${n} วัน`;
}

function UpcomingCard({
  items,
  today,
  now,
  onOpenDay,
}: {
  items: CalendarItem[];
  today: DayKey;
  now: Date;
  onOpenDay: (k: DayKey) => void;
}) {
  return (
    <section className="animate-rise delay-1 overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
      <h2 className="flex items-center justify-between gap-2 border-b border-line px-5 py-4">
        <span className="flex items-center gap-2 font-display text-base font-bold text-ink">
          <CalendarClock aria-hidden className="h-5 w-5 text-brand" />
          ใกล้ถึงกำหนด
        </span>
        <span className="text-xs font-normal text-muted">14 วันข้างหน้า</span>
      </h2>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-6 text-sm text-muted">
          <Inbox aria-hidden className="h-4 w-4 text-faint" />
          ไม่มีงานหรือวันสอบใน 14 วันนี้
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {items.slice(0, 8).map((item) => {
            const key = dayKey(item.dueAt!);
            const isExam = item.type === "exam";
            const hot = !isExam && isDueSoon(item.dueAt!, now);
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onOpenDay(key)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-brand-soft/50"
                >
                  <span
                    className={cx(
                      "grid h-12 w-12 shrink-0 place-items-center rounded-xl leading-none",
                      isExam
                        ? cx(EXAM_LOOK[item.examKind].day, EXAM_LOOK[item.examKind].text)
                        : hot
                          ? "bg-urgent text-white"
                          : "bg-sunken text-ink",
                    )}
                  >
                    <span className="text-center">
                      <span className="block font-display text-lg font-extrabold tabular-nums">{Number(key.slice(8))}</span>
                      <span className="block text-[10px] font-bold">{formatMonthShort(key)}</span>
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">
                      {isExam && (
                        <span className={EXAM_LOOK[item.examKind].text}>
                          {item.examKind === "major" ? "สอบกลางภาค/ปลายภาค" : "สอบ"} ·{" "}
                        </span>
                      )}
                      {item.title}
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                      {item.subject && (
                        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.subject.color }} />
                      )}
                      <span className="truncate">
                        {[item.subject?.name, !isExam && `ส่ง ${formatTime(item.dueAt!)}`, item.room].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </span>
                  <span className={cx("shrink-0 text-xs font-bold", hot ? "text-urgent" : "text-muted")}>
                    {relativeDay(today, key)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const SORTS: { value: MaterialSort; label: string }[] = [
  { value: "subject", label: "วิชา" },
  { value: "name", label: "ก–ฮ" },
  { value: "order", label: "ลำดับเนื้อหา" },
];

function MaterialsCard({ items }: { items: CalendarItem[] }) {
  const [sort, setSort] = useState<MaterialSort>("subject");
  const sorted = useMemo(() => sortMaterials(items, sort), [items, sort]);

  return (
    <section className="animate-rise delay-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
      <div className="border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
          <BookOpen aria-hidden className="h-5 w-5 text-brand" />
          เอกสารและสื่อการสอน
        </h2>
        {items.length > 1 && (
          <div role="radiogroup" aria-label="เรียงตาม" className="mt-3 flex gap-1 rounded-xl border border-line bg-sunken p-1">
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={sort === s.value}
                onClick={() => setSort(s.value)}
                className={cx(
                  "flex-1 rounded-lg px-2 py-1.5 text-xs font-bold transition-all duration-150",
                  sort === s.value ? "bg-surface text-brand shadow-soft-sm" : "text-muted hover:text-brand",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-6 text-sm text-muted">
          <Inbox aria-hidden className="h-4 w-4 text-faint" />
          ยังไม่มีเอกสารจากครู
        </p>
      ) : (
        <ul className="max-h-[34rem] divide-y divide-line overflow-y-auto">
          {sorted.map((m, i) => {
            const groupStart = sort === "subject" && (i === 0 || sorted[i - 1].subject?.code !== m.subject?.code);
            return (
              <li key={m.key}>
                {groupStart && (
                  <p className="flex items-center gap-2 bg-sunken/70 px-5 py-1.5 text-[11px] font-bold text-muted">
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: m.subject?.color ?? "var(--color-faint)" }} />
                    {m.subject?.name ?? "อื่น ๆ"}
                  </p>
                )}
                <div className="px-5 py-3">
                  <p className="text-sm font-bold leading-snug text-ink">{m.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {[sort !== "subject" && m.subject?.name, m.contentOrder > 0 && `ลำดับ ${m.contentOrder}`, m.room]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {m.description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{m.description}</p>}
                  <AttachmentLinks attachments={m.attachments} compact />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
