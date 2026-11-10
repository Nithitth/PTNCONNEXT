"use client";

import type { Ref } from "react";
import { CalendarHeart, Clock, Download, ExternalLink, FileText, GraduationCap, Hourglass, Link2, X } from "lucide-react";
import {
  dayIsEmpty,
  dayKey,
  formatDayLong,
  formatDayShort,
  formatTime,
  isDueSoon,
  type Attachment,
  type CalendarItem,
  type DayInfo,
  type DayKey,
} from "@/lib/calendar";
import { EXAM_KIND_LABEL, type ExamKind } from "@/lib/postForm";
import { cx, iconButtonStyles } from "@/components/ui";

/** Blinking "due within 24 h" look. With reduced motion it's a red ring instead. */
export const BLINK = "motion-safe:animate-blink motion-reduce:ring-2 motion-reduce:ring-urgent motion-reduce:ring-offset-1";

/** Light/dark colors per exam kind: [days before, exam day, label]. */
export const EXAM_LOOK: Record<ExamKind, { tint: string; day: string; text: string; chip: string }> = {
  quiz: { tint: "bg-exam-tint", day: "bg-exam-soft", text: "text-warning", chip: "bg-exam text-ink" },
  major: { tint: "bg-major-tint", day: "bg-major-soft", text: "text-urgent", chip: "bg-urgent text-white" },
};

/** Grey for posts without a subject. */
const NO_SUBJECT = "var(--color-faint)";

/** Subject-colored dot. Due within 24 h → it turns exam-day red and blinks. */
export function DueDot({ item, now }: { item: CalendarItem; now: Date }) {
  const hot = item.dueAt ? isDueSoon(item.dueAt, now) : false;
  return (
    <span
      aria-hidden
      className={cx("h-2 w-2 shrink-0 rounded-full", hot && cx("bg-urgent", BLINK))}
      style={hot ? undefined : { background: item.subject?.color ?? NO_SUBJECT }}
    />
  );
}

export function AttachmentLinks({ attachments, compact }: { attachments: Attachment[]; compact?: boolean }) {
  if (attachments.length === 0) return null;
  const base =
    "inline-flex items-center gap-1.5 rounded-lg border font-bold transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]";
  const size = compact ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm";
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {attachments.map((a) =>
        a.kind === "file" ? (
          <span key={a.id} className="inline-flex flex-wrap gap-1.5">
            <a
              href={a.href}
              target="_blank"
              rel="noopener noreferrer"
              title={a.name}
              className={cx(base, size, "max-w-56 border-brand bg-brand text-white shadow-brand-glow hover:bg-brand-hot")}
            >
              <FileText aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{compact ? "เปิด PDF" : a.name}</span>
            </a>
            <a
              href={`${a.href}?download=1`}
              aria-label={`ดาวน์โหลด ${a.name}`}
              className={cx(base, size, "border-line bg-surface text-ink shadow-soft-sm hover:border-brand/30 hover:text-brand")}
            >
              <Download aria-hidden className="h-3.5 w-3.5" />
              {!compact && "ดาวน์โหลด"}
            </a>
          </span>
        ) : (
          <a
            key={a.id}
            href={a.href}
            target="_blank"
            rel="noopener noreferrer"
            className={cx(base, size, "max-w-full border-line bg-surface text-brand shadow-soft-sm hover:border-brand/30 hover:bg-brand-soft")}
          >
            <Link2 aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{compact ? "เปิดลิงก์" : `เปิดลิงก์ · ${a.name}`}</span>
            <ExternalLink aria-hidden className="h-3 w-3 shrink-0 opacity-60" />
          </a>
        ),
      )}
    </div>
  );
}

function SubjectLine({ item }: { item: CalendarItem }) {
  if (!item.subject && !item.room) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      {item.subject && (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: item.subject.color }} />
          {item.subject.name}
        </span>
      )}
      {item.room && <span className="rounded-md bg-sunken px-1.5 py-0.5 font-bold text-ink">{item.room}</span>}
    </p>
  );
}

function Description({ text }: { text: string }) {
  if (!text) return null;
  return <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{text}</p>;
}

type DrawerProps = {
  ref: Ref<HTMLDialogElement>;
  day: DayKey | null;
  info: DayInfo | undefined;
  now: Date;
  onClose: () => void;
};

/** Everything on one day. A side sheet on desktop, a bottom sheet on phones. */
export function DayDrawer({ ref, day, info, now, onClose }: DrawerProps) {
  const count = info ? info.due.length + info.exams.length + info.events.length : 0;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close(); // tap outside to close
      }}
      aria-labelledby="day-drawer-title"
      className={cx(
        "fixed m-0 max-h-none max-w-none overflow-hidden bg-surface p-0 text-ink shadow-soft-lg outline-none focus-visible:outline-none",
        "backdrop:bg-ink/35 backdrop:backdrop-blur-[2px]",
        // phone: bottom sheet
        "inset-x-0 bottom-0 top-auto h-auto max-h-[85dvh] w-full rounded-t-3xl open:animate-sheet-up",
        // tablet/desktop: right side sheet
        "sm:inset-y-0 sm:left-auto sm:right-0 sm:h-dvh sm:max-h-none sm:w-[28rem] sm:rounded-none sm:rounded-l-3xl sm:open:animate-sheet-right",
      )}
    >
      {day && info && (
        <div className="flex h-full max-h-[85dvh] flex-col sm:max-h-none">
          <header className="flex items-start justify-between gap-3 border-b border-line px-5 pb-4 pt-5 sm:px-6">
            <div>
              <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-line-strong sm:hidden" />
              <h2 id="day-drawer-title" className="font-display text-xl font-extrabold leading-snug text-ink">
                {formatDayLong(day)}
              </h2>
              <p className="mt-0.5 text-sm text-muted">{count ? `${count} รายการ` : "ไม่มีรายการ"}</p>
            </div>
            <form method="dialog">
              <button aria-label="ปิด" className={iconButtonStyles}>
                <X aria-hidden className="h-5 w-5" />
              </button>
            </form>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
            {info.events.map((e) => (
              <article key={e.key} className="bg-event-stripes rounded-2xl border border-exam/40 p-4">
                <p className="flex items-center gap-1.5 text-xs font-bold text-event-ink">
                  <CalendarHeart aria-hidden className="h-4 w-4" />
                  กิจกรรมโรงเรียน
                  {e.endsAt && dayKey(e.endsAt) !== dayKey(e.dueAt!) && (
                    <span className="font-normal">
                      · {formatDayShort(dayKey(e.dueAt!))} – {formatDayShort(dayKey(e.endsAt))}
                    </span>
                  )}
                </p>
                <h3 className="mt-1.5 font-display text-lg font-bold text-ink">{e.title}</h3>
                {e.room && e.room !== "ทั้งโรงเรียน" && <p className="text-xs text-event-ink">{e.room}</p>}
                <Description text={e.description} />
              </article>
            ))}

            {info.exams.map((e) => (
              <article key={e.key} className={cx("rounded-2xl border border-ink/10 p-4", EXAM_LOOK[e.examKind].day)}>
                <p className={cx("flex items-center gap-1.5 text-xs font-bold", EXAM_LOOK[e.examKind].text)}>
                  <GraduationCap aria-hidden className="h-4 w-4" />
                  วันสอบ · {EXAM_KIND_LABEL[e.examKind]}
                </p>
                <h3 className="mb-1 mt-1.5 font-display text-lg font-bold text-ink">{e.title}</h3>
                <SubjectLine item={e} />
                <Description text={e.description} />
                <AttachmentLinks attachments={e.attachments} />
              </article>
            ))}

            {info.leadUp.map(({ item, daysLeft }) => (
              <p
                key={item.key}
                className={cx(
                  "flex items-center gap-2.5 rounded-xl border border-ink/5 px-3.5 py-2.5 text-sm text-ink",
                  EXAM_LOOK[item.examKind].tint,
                )}
              >
                <Hourglass aria-hidden className={cx("h-4 w-4 shrink-0", EXAM_LOOK[item.examKind].text)} />
                <span className="min-w-0">
                  <b className="font-bold">อีก {daysLeft} วัน</b> สอบ{item.subject ? `${item.subject.name} ` : " "}
                  <span className="text-muted">— {item.title}</span>
                </span>
              </p>
            ))}

            {info.due.length > 0 && (
              <section>
                <h3 className="mb-2.5 text-xs font-bold text-muted">งานที่ต้องส่ง</h3>
                <ul className="space-y-3">
                  {info.due.map((d) => {
                    const hot = isDueSoon(d.dueAt!, now);
                    const late = Date.parse(d.dueAt!) < now.getTime();
                    return (
                      <li
                        key={d.key}
                        className="relative overflow-hidden rounded-2xl border border-line bg-surface p-4 pl-5 shadow-soft-sm"
                      >
                        <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: d.subject?.color ?? NO_SUBJECT }} />
                        <p
                          className={cx(
                            "flex items-center gap-1.5 text-xs font-bold",
                            hot ? "text-urgent" : late ? "text-faint" : "text-muted",
                          )}
                        >
                          {hot ? <DueDot item={d} now={now} /> : <Clock aria-hidden className="h-3.5 w-3.5" />}
                          ส่งภายใน {formatTime(d.dueAt!)}
                          {hot && " · เหลือไม่ถึง 24 ชม."}
                          {late && " · เลยกำหนดแล้ว"}
                        </p>
                        <h4 className="mb-1 mt-1 font-display text-base font-bold leading-snug text-ink">{d.title}</h4>
                        <SubjectLine item={d} />
                        <Description text={d.description} />
                        <AttachmentLinks attachments={d.attachments} />
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {dayIsEmpty(info) && (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
                <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-sunken text-faint">
                  <CalendarHeart aria-hidden className="h-6 w-6" />
                </span>
                <p className="font-display font-bold text-ink">วันว่าง</p>
                <p className="mt-1 text-sm text-muted">ไม่มีงานส่ง วันสอบ หรือกิจกรรม</p>
              </div>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
