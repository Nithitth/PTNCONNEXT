"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Copy, DoorClosed, DoorOpen, KeyRound, QrCode, RefreshCw, Sparkles, UserX } from "lucide-react";
import {
  closeNow,
  createRoomCode,
  issuePersonalCode,
  openNow,
  regenerateRoomCode,
  releaseRegistration,
  saveSlot,
  resetTwoStep,
  setSignupOpen,
  unlockLogin,
  type AccessResult,
} from "@/app/admin/access/actions";
import { DatePicker } from "@/components/DatePicker";
import { buttonStyles, cx, inputStyles, smallButtonStyles } from "@/components/ui";
import { bangkokInputToIso, dayKey, formatDayLong, formatDayShort, formatTime } from "@/lib/calendar";
import { SLOT_LABEL, slotProblem, slotStatus, type SlotStatus } from "@/lib/signup";

// Interactive pieces of the Developer Console's sign-up pages (and the switch on its front page).

/** Runs an action, shows its error, and refreshes the page on success. */
function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<AccessResult>, then?: (r: AccessResult) => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) setError(r.error);
      else {
        then?.(r);
        router.refresh();
      }
    });
  return { pending, error, run };
}

const Err = ({ error }: { error: string | null }) => (error ? <p className="mt-1 text-xs font-bold text-danger">{error}</p> : null);

/** Ends a log-in lockout. */
export function UnlockButton({ identifier }: { identifier: string }) {
  const { pending, error, run } = useAction();
  return (
    <div className="text-right">
      <button type="button" disabled={pending} onClick={() => run(() => unlockLogin(identifier))} className={smallButtonStyles}>
        <KeyRound aria-hidden className="h-4 w-4" />
        {pending ? "กำลังปลดล็อก…" : "ปลดล็อก"}
      </button>
      <Err error={error} />
    </div>
  );
}

/** Turns off someone's two-step (lost phone), two taps. */
export function TwoStepResetButton({ userId }: { userId: string }) {
  const { pending, error, run } = useAction();
  const [armed, setArmed] = useState(false);
  return (
    <div className="text-right">
      <button
        type="button"
        disabled={pending}
        onClick={() => (armed ? run(() => resetTwoStep(userId), () => setArmed(false)) : setArmed(true))}
        onBlur={() => setArmed(false)}
        className={cx(smallButtonStyles, armed && "border-danger bg-danger text-white hover:text-white")}
      >
        {armed ? "กดอีกครั้ง: ปิดการยืนยันสองขั้นตอน" : "ปิดการยืนยันสองขั้นตอน (ทำโทรศัพท์หาย)"}
      </button>
      <Err error={error} />
    </div>
  );
}

/** The master switch, with a confirm step. */
export function SignupSwitch({ open }: { open: boolean }) {
  const { pending, error, run } = useAction();
  const [armed, setArmed] = useState(false);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => (armed ? run(() => setSignupOpen(!open), () => setArmed(false)) : setArmed(true))}
        onBlur={() => setArmed(false)}
        className={armed ? buttonStyles.danger : open ? buttonStyles.secondary : buttonStyles.primary}
      >
        {open ? <DoorClosed aria-hidden className="h-4 w-4" /> : <DoorOpen aria-hidden className="h-4 w-4" />}
        {armed ? `กดอีกครั้งเพื่อ${open ? "ปิด" : "เปิด"}รับลงทะเบียน` : open ? "ปิดรับลงทะเบียน" : "เปิดรับลงทะเบียน"}
      </button>
      <Err error={error} />
    </div>
  );
}

export const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 4) + 6).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);

/** A room's slot: date, start and end time (Thai time), plus quick open/close and a new code. */
export function SlotEditor({
  classroomId,
  label,
  date: initialDate,
  start: initialStart,
  end: initialEnd,
  hasSlot,
}: {
  classroomId: string;
  label: string;
  date: string;
  start: string;
  end: string;
  hasSlot: boolean;
}) {
  const { pending, error, run } = useAction();
  const [date, setDate] = useState(initialDate);
  const [start, setStart] = useState(initialStart || "08:30");
  const [end, setEnd] = useState(initialEnd || "09:00");
  const select = cx(inputStyles, "h-9 w-24 text-sm");
  // Times on a 15-minute grid, plus a saved time that is off the grid (e.g. after "เปิดตอนนี้").
  const times = [...new Set([...TIMES, initialStart, initialEnd].filter(Boolean))].sort();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker value={date} onChange={setDate} label={`วันลงทะเบียน ${label}`} size="sm" />
        <select aria-label={`เวลาเริ่ม ${label}`} value={start} onChange={(e) => setStart(e.target.value)} className={select}>
          {times.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <span className="text-sm text-muted">ถึง</span>
        <select aria-label={`เวลาสิ้นสุด ${label}`} value={end} onChange={(e) => setEnd(e.target.value)} className={select}>
          {times.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button type="button" disabled={pending || !date} onClick={() => run(() => saveSlot(classroomId, date, start, end))} className={cx(smallButtonStyles, "border-brand text-brand")}>
          บันทึกเวลา
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={pending} onClick={() => run(() => openNow(classroomId, 15))} className={smallButtonStyles}>
          <DoorOpen aria-hidden className="h-4 w-4" />
          เปิดตอนนี้ 15 นาที
        </button>
        {hasSlot && (
          <>
            <button type="button" disabled={pending} onClick={() => run(() => closeNow(classroomId))} className={smallButtonStyles}>
              <DoorClosed aria-hidden className="h-4 w-4" />
              ปิดทันที
            </button>
            <button type="button" disabled={pending} onClick={() => run(() => regenerateRoomCode(classroomId))} className={smallButtonStyles}>
              <RefreshCw aria-hidden className="h-4 w-4" />
              สร้าง QR ใหม่
            </button>
            <Link href={`/admin/access/rooms/${classroomId}/card`} target="_blank" className={smallButtonStyles}>
              <QrCode aria-hidden className="h-4 w-4" />
              ดู / พิมพ์การ์ด QR
            </Link>
          </>
        )}
      </div>
      <Err error={error} />
    </div>
  );
}

export type GeneratorRoom = { classroomId: string; label: string; code: string | null; startsAt: string | null; endsAt: string | null; status: SlotStatus };

const STATUS_CHIP: Record<SlotStatus, string> = {
  none: "bg-sunken text-muted",
  upcoming: "bg-warning-soft text-warning",
  open: "bg-success-soft text-success",
  closed: "bg-sunken text-faint",
};

const GenStep = ({ n, label, children }: { n: number; label: string; children: ReactNode }) => (
  <div className="flex gap-3">
    <span aria-hidden className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-extrabold text-brand">
      {n}
    </span>
    <div className="min-w-0 flex-1">
      <p className="mb-1.5 text-sm font-bold text-ink">{label}</p>
      {children}
    </div>
  </div>
);

/**
 * "สร้างรหัสลงทะเบียน": pick a room, a date and a time → a new room code (and QR card) that works only
 * then. A room has one code at a time, so making one for a room that has a code replaces it (two taps).
 */
export function CodeGenerator({ rooms, initialRoom }: { rooms: GeneratorRoom[]; initialRoom?: string }) {
  const { pending, error, run } = useAction();
  const today = dayKey(new Date());
  const [roomId, setRoomId] = useState(rooms.some((r) => r.classroomId === initialRoom) ? initialRoom! : "");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("08:30");
  const [end, setEnd] = useState("09:00");
  const [armed, setArmed] = useState(false);
  const [made, setMade] = useState<{ roomId: string; label: string; code: string; date: string; start: string; end: string } | null>(null);
  const room = rooms.find((r) => r.classroomId === roomId) ?? null;
  // A code that can still be used would be replaced: ask for a second tap.
  const replaces = Boolean(room?.code && room.status !== "closed");
  const problem = date ? slotProblem(date, start, end) : null;
  const select = cx(inputStyles, "h-11 w-full text-base sm:w-auto");

  if (made) {
    const startsAt = bangkokInputToIso(`${made.date}T${made.start}`)!;
    const endsAt = bangkokInputToIso(`${made.date}T${made.end}`)!;
    const status = slotStatus({ startsAt, endsAt });
    return (
      <div className="rounded-2xl border border-brand/30 bg-brand-soft p-4 sm:p-5" role="status">
        <p className="text-sm font-bold text-brand">สร้างรหัสสำหรับห้อง {made.label} แล้ว</p>
        <p className="mt-2 flex flex-wrap items-center gap-2 font-mono text-4xl font-extrabold tracking-[0.3em] text-ink">
          {made.code}
          <button type="button" aria-label="คัดลอกรหัส" onClick={() => navigator.clipboard?.writeText(made.code)} className="rounded-lg p-1.5 text-brand hover:bg-white">
            <Copy aria-hidden className="h-5 w-5" />
          </button>
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink">
          <span>
            ใช้ได้ {formatDayLong(made.date)} เวลา {formatTime(startsAt)}–{formatTime(endsAt)}
          </span>
          <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_CHIP[status])}>{SLOT_LABEL[status]}</span>
        </p>
        <p className="mt-1 text-xs text-muted">รหัสใช้ได้เฉพาะช่วงเวลานี้ และเฉพาะชื่อนักเรียนในห้องนี้ พิมพ์การ์ด QR ให้นักเรียนอาสาของห้องนำไปแสดง</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Link href={`/admin/access/rooms/${made.roomId}/card`} target="_blank" className={buttonStyles.primary}>
            <QrCode aria-hidden className="h-4 w-4" />
            ดู / พิมพ์การ์ด QR
          </Link>
          <button
            type="button"
            onClick={() => {
              setMade(null);
              setRoomId("");
            }}
            className={buttonStyles.secondary}
          >
            สร้างรหัสห้องอื่น
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <GenStep n={1} label="เลือกห้อง">
        <select
          aria-label="ห้องที่จะสร้างรหัส"
          value={roomId}
          onChange={(e) => {
            setRoomId(e.target.value);
            setArmed(false);
          }}
          className={select}
        >
          <option value="">— เลือกห้อง —</option>
          {rooms.map((r) => (
            <option key={r.classroomId} value={r.classroomId}>
              {r.label} · {SLOT_LABEL[r.status]}
            </option>
          ))}
        </select>
        {room && replaces && room.startsAt && room.endsAt && (
          <p className="mt-2 flex gap-1.5 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
            <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              ห้องนี้มีรหัส <b className="font-mono tracking-widest">{room.code}</b> ({formatDayShort(dayKey(room.startsAt))} {formatTime(room.startsAt)}–
              {formatTime(room.endsAt)}) อยู่แล้ว สร้างใหม่จะแทนที่ รหัสและ QR เดิมใช้ไม่ได้ทันที
            </span>
          </p>
        )}
      </GenStep>
      <GenStep n={2} label="วันที่ใช้รหัส">
        <DatePicker value={date} onChange={setDate} label="วันที่ใช้รหัสลงทะเบียน" min={today} />
      </GenStep>
      <GenStep n={3} label="ช่วงเวลา (เวลาไทย)">
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="เวลาเริ่ม" value={start} onChange={(e) => setStart(e.target.value)} className={cx(inputStyles, "h-11 w-28 text-base")}>
            {TIMES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <span className="text-sm text-muted">ถึง</span>
          <select aria-label="เวลาสิ้นสุด" value={end} onChange={(e) => setEnd(e.target.value)} className={cx(inputStyles, "h-11 w-28 text-base")}>
            {TIMES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        {problem && <p className="mt-1.5 text-xs font-bold text-danger">{problem}</p>}
      </GenStep>
      <div className="sm:pl-10">
        <button
          type="button"
          disabled={pending || !room || !date || Boolean(problem)}
          onClick={() => {
            if (!room) return;
            if (replaces && !armed) return setArmed(true);
            const at = { roomId: room.classroomId, label: room.label, date, start, end };
            run(
              () => createRoomCode(at.roomId, at.date, at.start, at.end),
              (r) => {
                setArmed(false);
                if (r.code) setMade({ ...at, code: r.code });
              },
            );
          }}
          onBlur={() => setArmed(false)}
          className={cx(armed ? buttonStyles.danger : buttonStyles.primary, "w-full sm:w-auto")}
        >
          <Sparkles aria-hidden className="h-4 w-4" />
          {pending ? "กำลังสร้าง…" : armed ? "กดอีกครั้ง: แทนที่รหัสเดิม" : "สร้างรหัส"}
        </button>
        <Err error={error} />
      </div>
    </div>
  );
}

/** Per-person buttons: undo a registration, or make a personal code (shown once). */
export function PersonActions({ id, name, registered }: { id: string; name: string; registered: boolean }) {
  const { pending, error, run } = useAction();
  const [armed, setArmed] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  if (code) {
    return (
      <div className="rounded-xl border border-brand/30 bg-brand-soft p-3 text-sm">
        <p className="text-xs text-muted">รหัสส่วนตัวของ {name} (แสดงครั้งเดียว ให้เป็นการส่วนตัวนอกระบบ เช่น กระดาษหรือ LINE)</p>
        <p className="mt-1 flex items-center gap-2 font-display text-2xl font-extrabold tracking-widest text-brand">
          {code}
          <button type="button" aria-label="คัดลอกรหัส" onClick={() => navigator.clipboard?.writeText(code)} className="rounded-lg p-1 text-brand hover:bg-white">
            <Copy aria-hidden className="h-4 w-4" />
          </button>
        </p>
        <button type="button" onClick={() => setCode(null)} className="mt-1 text-xs font-bold text-muted hover:text-ink">
          ส่งให้แล้ว ปิด
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {registered ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => (armed ? run(() => releaseRegistration(id), () => setArmed(false)) : setArmed(true))}
          onBlur={() => setArmed(false)}
          className={cx(smallButtonStyles, armed && "border-danger bg-danger text-white hover:text-white")}
        >
          <UserX aria-hidden className="h-4 w-4" />
          {armed ? "กดอีกครั้ง: ลบบัญชีนี้" : "ยกเลิกการลงทะเบียน"}
        </button>
      ) : (
        <button type="button" disabled={pending} onClick={() => run(() => issuePersonalCode(id), (r) => setCode(r.code ?? null))} className={smallButtonStyles}>
          <KeyRound aria-hidden className="h-4 w-4" />
          สร้างรหัสส่วนตัว
        </button>
      )}
      <Err error={error} />
    </div>
  );
}
