"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Check, GraduationCap, Mail, Phone, Presentation } from "lucide-react";
import {
  checkTeacher,
  enterStudentCode,
  findStudent,
  finishSignup,
  restartSignup,
  sendCode,
  setPhone,
  verifyCode,
  type SignupResult,
} from "@/app/signup/actions";
import { Button, Field, Notice, cx, inputStyles } from "@/components/ui";
import { NO_SUBJECT } from "@/lib/signup";

type Kind = "student" | "teacher";
type Stage = "code" | "name" | "teacher" | "contact" | "verify" | "password";

const STUDENT_STEPS: { stage: Stage[]; label: string }[] = [
  { stage: ["code"], label: "รหัสห้อง" },
  { stage: ["name"], label: "ชื่อ" },
  { stage: ["contact", "verify"], label: "อีเมล" },
  { stage: ["password"], label: "รหัสผ่าน" },
];
const TEACHER_STEPS: { stage: Stage[]; label: string }[] = [
  { stage: ["teacher"], label: "ชื่อและรหัส" },
  { stage: ["contact", "verify"], label: "อีเมล/เบอร์" },
  { stage: ["password"], label: "รหัสผ่าน" },
];

/** Sign-up in short numbered steps. Each step calls a server action; the server keeps the progress. */
export function SignupForm({ subjects, roomCode }: { subjects: { code: string; name: string }[]; roomCode: string }) {
  const [kind, setKind] = useState<Kind>("student");
  const [stage, setStage] = useState<Stage>("code");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [found, setFound] = useState<{ room?: string; studentId?: string; name?: string }>({});
  const [confirmed, setConfirmed] = useState(false);
  const [contact, setContact] = useState<"email" | "phone">("email");
  const [sentTo, setSentTo] = useState("");

  const steps = kind === "student" ? STUDENT_STEPS : TEACHER_STEPS;
  const current = steps.findIndex((s) => s.stage.includes(stage));

  /** Runs a step's action with the form's fields; moves on when it succeeds. */
  const run = (action: (f: FormData) => Promise<SignupResult>, next?: (r: SignupResult) => void) => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    start(async () => {
      setError(null);
      const r = await action(form);
      if (r.error) setError(r.error);
      if (r.ok && !r.error) next?.(r);
    });
  };

  const switchKind = (k: Kind) => {
    if (k === kind) return;
    start(async () => {
      await restartSignup();
      setKind(k);
      setStage(k === "student" ? "code" : "teacher");
      setFound({});
      setConfirmed(false);
      setContact("email");
      setError(null);
    });
  };

  const restart = () =>
    start(async () => {
      await restartSignup();
      setStage(kind === "student" ? "code" : "teacher");
      setFound({});
      setConfirmed(false);
      setError(null);
    });

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">ลงทะเบียนในฐานะ</legend>
        <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-line bg-sunken p-1">
          {(["student", "teacher"] as const).map((k) => {
            const Icon = k === "student" ? GraduationCap : Presentation;
            const on = kind === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                disabled={pending}
                onClick={() => switchKind(k)}
                className={cx(
                  "flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-bold transition-all duration-150",
                  on ? "border-brand bg-brand text-white shadow-soft-sm" : "border-transparent text-muted hover:text-brand",
                )}
              >
                <Icon aria-hidden className="h-4 w-4" />
                {k === "student" ? "นักเรียน" : "ครู"}
              </button>
            );
          })}
        </div>
      </fieldset>

      <ol aria-label="ขั้นตอนการลงทะเบียน" className="flex gap-1.5">
        {steps.map((s, i) => (
          <li key={s.label} className="min-w-0 flex-1">
            <div className={cx("h-1.5 rounded-full", i < current ? "bg-success" : i === current ? "bg-brand" : "bg-sunken")} />
            <p className={cx("mt-1 truncate text-[11px] font-bold", i === current ? "text-brand" : "text-faint")}>
              {i + 1}. {s.label}
              <span className="sr-only">{i < current ? " (เสร็จแล้ว)" : i === current ? " (ขั้นนี้)" : ""}</span>
            </p>
          </li>
        ))}
      </ol>

      {/* ── Student 1: room code ── */}
      {stage === "code" && (
        <form onSubmit={run((f) => enterStudentCode(String(f.get("code"))), (r) => (setFound({ room: r.room }), setStage("name")))} className="space-y-4">
          <Field
            label="รหัสห้อง"
            name="code"
            defaultValue={roomCode}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="เช่น K7P4QX"
            required
            hint="สแกน QR จากเพื่อนอาสาของห้อง หรือพิมพ์รหัส 6 ตัวใต้ QR (ถ้าได้รหัสส่วนตัว 9 ตัวจากผู้ดูแลระบบ ใส่ที่นี่ได้เลย)"
          />
          <Submit pending={pending}>ถัดไป</Submit>
        </form>
      )}

      {/* ── Student 2: first + last name → student ID ── */}
      {stage === "name" && !found.studentId && (
        <form onSubmit={run((f) => findStudent(String(f.get("first")), String(f.get("last"))), (r) => setFound(r))} className="space-y-4">
          <p className="rounded-xl bg-sunken px-3 py-2 text-sm text-muted">
            ห้อง <b className="text-ink">{found.room}</b> · พิมพ์ชื่อจริงตามทะเบียนโรงเรียน
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ชื่อจริง" name="first" autoComplete="given-name" required />
            <Field label="นามสกุล" name="last" autoComplete="family-name" required />
          </div>
          <Submit pending={pending}>ค้นหาเลขประจำตัว</Submit>
        </form>
      )}
      {stage === "name" && found.studentId && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft-sm">
            <p className="text-sm text-muted">{found.name}</p>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-sm font-bold text-ink">เลขประจำตัวนักเรียน</span>
              <input readOnly value={found.studentId} className={cx(inputStyles, "h-12 w-full bg-sunken font-bold tabular-nums")} />
            </label>
            <p className="mt-2 text-sm text-muted">ห้อง {found.room}</p>
          </div>
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
            นี่คือฉันจริง ๆ และฉันเข้าใจว่าการลงทะเบียนแทนผู้อื่นเป็นความผิด
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" disabled={!confirmed || pending} onClick={() => setStage("contact")}>
              <Check aria-hidden className="h-4 w-4" />
              ใช่ ฉันเอง
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={restart}>
              ไม่ใช่ฉัน เริ่มใหม่
            </Button>
          </div>
        </div>
      )}

      {/* ── Teacher 1: full name + subject + personal code ── */}
      {stage === "teacher" && (
        <form
          onSubmit={run(
            (f) => checkTeacher(String(f.get("fullName")), String(f.get("subject")), String(f.get("code"))),
            (r) => (setFound({ name: r.name }), setStage("contact")),
          )}
          className="space-y-4"
        >
          <Field label="ชื่อ-นามสกุล" name="fullName" autoComplete="name" placeholder="เช่น สมศรี รักเรียน" required />
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-ink">วิชาที่สอน</span>
            <select name="subject" required defaultValue="" className={cx(inputStyles, "h-12 w-full")}>
              <option value="" disabled>
                เลือกวิชา
              </option>
              {subjects.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
              <option value={NO_SUBJECT}>ไม่ได้สอนวิชาเหล่านี้</option>
            </select>
          </label>
          <Field
            label="รหัสลงทะเบียน"
            name="code"
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="เช่น K7P-4QX-9MD"
            required
            hint="รหัส 9 ตัวที่ผู้ดูแลระบบให้คุณเป็นการส่วนตัว (ใช้ได้ครั้งเดียว)"
          />
          <Submit pending={pending}>ถัดไป</Submit>
        </form>
      )}

      {/* ── Contact: email (anyone) or phone (teachers) ── */}
      {stage === "contact" && (
        <div className="space-y-4">
          {found.name && <p className="rounded-xl bg-sunken px-3 py-2 text-sm text-muted">ลงทะเบียนให้ <b className="text-ink">{found.name}</b></p>}
          {kind === "teacher" && (
            <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-line bg-sunken p-1">
              {(["email", "phone"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={contact === c}
                  onClick={() => (setContact(c), setError(null))}
                  className={cx(
                    "flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-bold",
                    contact === c ? "bg-surface text-brand shadow-soft-sm" : "text-muted hover:text-brand",
                  )}
                >
                  {c === "email" ? <Mail aria-hidden className="h-4 w-4" /> : <Phone aria-hidden className="h-4 w-4" />}
                  {c === "email" ? "อีเมล" : "เบอร์โทร"}
                </button>
              ))}
            </div>
          )}
          {contact === "email" || kind === "student" ? (
            <form onSubmit={run((f) => sendCode(String(f.get("email"))), (r) => (setSentTo(r.sentTo ?? ""), setStage("verify")))} className="space-y-4">
              <Field
                label="อีเมลของคุณ"
                name="email"
                type="email"
                autoComplete="email"
                required
                hint="เราจะส่งรหัส 6 หลักไปยืนยัน ใช้เข้าสู่ระบบและกู้บัญชีได้ (1 อีเมลต่อ 1 บัญชี)"
              />
              <Submit pending={pending}>ส่งรหัสยืนยัน</Submit>
            </form>
          ) : (
            <form onSubmit={run((f) => setPhone(String(f.get("phone")), String(f.get("phone2"))), () => setStage("password"))} className="space-y-4">
              <Field label="เบอร์มือถือ" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="081-234-5678" required />
              <Field label="พิมพ์เบอร์อีกครั้ง" name="phone2" type="tel" inputMode="tel" autoComplete="off" required hint="ใช้เบอร์นี้เข้าสู่ระบบ (1 เบอร์ต่อ 1 บัญชี)" />
              <Submit pending={pending}>ถัดไป</Submit>
            </form>
          )}
        </div>
      )}

      {stage === "verify" && (
        <form onSubmit={run((f) => verifyCode(String(f.get("code"))), () => setStage("password"))} className="space-y-4">
          <p className="rounded-xl bg-sunken px-3 py-2 text-sm text-muted">
            ส่งรหัส 6 หลักไปที่ <b className="text-ink">{sentTo}</b> แล้ว (ดูในกล่องจดหมายขยะด้วย)
          </p>
          <Field label="รหัสยืนยัน" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" required />
          <div className="flex flex-wrap gap-2">
            <Submit pending={pending}>ยืนยัน</Submit>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => (setStage("contact"), setError(null))}>
              ส่งรหัสอีกครั้ง / เปลี่ยนอีเมล
            </Button>
          </div>
        </form>
      )}

      {stage === "password" && (
        <form onSubmit={run((f) => finishSignup(String(f.get("password")), String(f.get("confirm"))))} className="space-y-4">
          <Field
            label="ตั้งรหัสผ่าน"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            hint="อย่างน้อย 8 ตัวอักษร ห้ามใช้ตัวเลข 8 หลัก (เช่น วันเกิด)"
          />
          <Field label="ยืนยันรหัสผ่าน" name="confirm" type="password" autoComplete="new-password" required />
          <Submit pending={pending}>สร้างบัญชี</Submit>
        </form>
      )}

      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

function Submit({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <Button type="submit" variant="primary" className="h-12 w-full" disabled={pending}>
      {pending ? "กำลังตรวจสอบ…" : children}
    </Button>
  );
}
