"use client";

import { useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cx, iconButtonStyles } from "@/components/ui";
import {
  WEEKDAYS_SHORT,
  addDays,
  dayKey,
  formatDayLong,
  formatMonth,
  isInMonth,
  monthGrid,
  shiftMonth,
  type DayKey,
  type MonthRef,
} from "@/lib/calendar";

const SHORT = new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** "พฤ. 12 พ.ย. 2569" */
export const formatPickerDay = (key: DayKey) => SHORT.format(new Date(`${key}T00:00:00Z`));

const toMonth = (key: DayKey): MonthRef => ({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) });
const isKey = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * The app's date box: a button showing the Thai date (พ.ศ.) that opens a month calendar in the
 * school theme (a bottom sheet on phones, a centred card from sm up). Dates only, no time.
 * `value` and `onChange` use "YYYY-MM-DD" ("" = no date).
 */
export function DatePicker({
  value,
  onChange,
  label,
  placeholder = "เลือกวันที่",
  min,
  clearable = false,
  size = "md",
  className,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Read by screen readers and shown as the sheet's title. */
  label: string;
  placeholder?: string;
  /** Earliest day that can be picked. */
  min?: string;
  /** Offer "ล้างวันที่" (for optional dates). */
  clearable?: boolean;
  size?: "sm" | "md";
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const today = dayKey(new Date());
  const selected = isKey(value) ? value : null;
  const [month, setMonth] = useState<MonthRef>(toMonth(selected ?? (min && min > today ? min : today)));
  const days = monthGrid(month);
  const blocked = (d: DayKey) => Boolean(min && d < min);

  const open = () => {
    setMonth(toMonth(selected ?? (min && min > today ? min : today)));
    ref.current?.showModal();
  };
  const pick = (d: DayKey) => {
    if (blocked(d)) return;
    onChange(d);
    ref.current?.close();
  };

  return (
    <>
      <button
        id={id}
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        aria-label={selected ? `${label}: ${formatDayLong(selected)} (เปลี่ยน)` : `${label}: ${placeholder}`}
        className={cx(
          "group inline-flex w-full items-center gap-2.5 rounded-xl border bg-surface text-left transition-[border-color,box-shadow,background-color] duration-150",
          "hover:border-brand/40 hover:bg-brand-soft/40 focus-visible:border-brand focus-visible:shadow-brand-glow focus-visible:outline-none",
          selected ? "border-line text-ink" : "border-dashed border-line-strong text-faint",
          size === "sm" ? "h-10 px-3 text-sm" : "h-12 px-3.5 text-base",
          className,
        )}
      >
        <span
          aria-hidden
          className={cx(
            "grid shrink-0 place-items-center rounded-lg transition-colors",
            size === "sm" ? "h-6 w-6" : "h-7 w-7",
            selected ? "bg-brand-gradient text-white shadow-brand-glow" : "bg-sunken text-muted group-hover:text-brand",
          )}
        >
          <CalendarDays className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </span>
        <span className={cx("min-w-0 flex-1 truncate", selected && "font-bold")}>{selected ? formatPickerDay(selected) : placeholder}</span>
      </button>

      <dialog
        ref={ref}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close(); // tap outside to close
        }}
        aria-label={label}
        className={cx(
          "fixed m-0 max-h-none max-w-none overflow-hidden bg-surface p-0 text-ink shadow-soft-lg outline-none",
          "backdrop:bg-ink/35 backdrop:backdrop-blur-[2px]",
          "inset-x-0 bottom-0 top-auto w-full rounded-t-3xl open:animate-sheet-up",
          "sm:inset-0 sm:m-auto sm:h-fit sm:w-[22rem] sm:rounded-3xl sm:open:animate-pop",
        )}
      >
        <div className="bg-feature-gradient speed-lines px-5 pb-4 pt-5 text-white">
          <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-white/50 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-white/80">{label}</p>
              <p className="mt-1 font-display text-xl font-extrabold leading-tight">
                {selected ? formatDayLong(selected) : "ยังไม่ได้เลือกวัน"}
              </p>
            </div>
            {/* A plain button, not <form method="dialog">: the picker often sits inside another form. */}
            <button
              type="button"
              aria-label="ปิด"
              onClick={() => ref.current?.close()}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15 text-white hover:bg-white/25"
            >
              <X aria-hidden className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="px-4 pb-5 pt-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button type="button" aria-label="เดือนก่อน" onClick={() => setMonth(shiftMonth(month, -1))} className={iconButtonStyles}>
              <ChevronLeft aria-hidden className="h-5 w-5" />
            </button>
            <p className="font-display text-base font-bold text-ink" aria-live="polite">
              {formatMonth(month)}
            </p>
            <button type="button" aria-label="เดือนถัดไป" onClick={() => setMonth(shiftMonth(month, 1))} className={iconButtonStyles}>
              <ChevronRight aria-hidden className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold" aria-hidden>
            {WEEKDAYS_SHORT.map((d, i) => (
              <span key={d} className={cx("py-1", i === 0 ? "text-brand" : "text-muted")}>
                {d}
              </span>
            ))}
          </div>
          <div role="grid" aria-label={formatMonth(month)} className="grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              const inMonth = isInMonth(d, month);
              const on = d === selected;
              const isToday = d === today;
              const off = blocked(d);
              return (
                <button
                  key={d}
                  type="button"
                  role="gridcell"
                  aria-selected={on}
                  aria-label={`${formatDayLong(d)}${isToday ? " (วันนี้)" : ""}`}
                  disabled={off}
                  autoFocus={on}
                  onClick={() => pick(d)}
                  className={cx(
                    "grid aspect-square place-items-center rounded-xl text-sm font-bold tabular-nums transition-all duration-100 active:scale-90",
                    on
                      ? "bg-brand-gradient text-white shadow-brand-glow"
                      : off
                        ? "cursor-not-allowed text-faint/50 line-through"
                        : cx(
                            "hover:bg-brand-soft hover:text-brand",
                            !inMonth ? "text-faint/70" : i % 7 === 0 ? "text-brand" : "text-ink",
                          ),
                    isToday && !on && "ring-2 ring-inset ring-brand/50",
                  )}
                >
                  {Number(d.slice(8))}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-4">
            {[
              { label: "วันนี้", day: today },
              { label: "พรุ่งนี้", day: addDays(today, 1) },
              { label: "อีก 1 สัปดาห์", day: addDays(today, 7) },
            ]
              .filter((q) => !blocked(q.day))
              .map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => pick(q.day)}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold text-ink transition-colors hover:border-brand/30 hover:bg-brand-soft hover:text-brand"
                >
                  {q.label}
                </button>
              ))}
            {clearable && selected && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  ref.current?.close();
                }}
                className="ml-auto rounded-full px-3 py-1.5 text-xs font-bold text-muted hover:bg-sunken hover:text-danger"
              >
                ล้างวันที่
              </button>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
