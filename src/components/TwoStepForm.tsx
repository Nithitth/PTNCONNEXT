"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Mail, Smartphone } from "lucide-react";
import {
  checkSetupEmail,
  finishSetup,
  leaveTwoStep,
  sendSetupEmail,
  startSetup,
  turnOffTwoStep,
  verifyTwoStep,
  type TwoStepResult,
} from "@/app/mfa/actions";
import { Button, Field, Notice } from "@/components/ui";

const CODE_FIELD = { name: "code", inputMode: "numeric", autoComplete: "one-time-code", maxLength: 7, placeholder: "123456", required: true } as const;

function useStep() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<TwoStepResult>, then?: (r: TwoStepResult) => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r?.error) setError(r.error);
      else if (r) then?.(r);
    });
  return { error, pending, run };
}

const codeOf = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return String(new FormData(e.currentTarget).get("code") ?? "");
};

function LeaveButton() {
  return (
    <form action={leaveTwoStep} className="mt-3">
      <Button type="submit" variant="ghost" className="w-full">
        <LogOut aria-hidden className="h-4 w-4" />
        ออกจากระบบ
      </Button>
    </form>
  );
}

/** Log-in step 2. */
export function TwoStepVerify() {
  const { error, pending, run } = useStep();
  return (
    <>
      <form onSubmit={(e) => { const code = codeOf(e); run(() => verifyTwoStep(code)); }} className="space-y-4">
        <Field label="รหัส 6 หลักจากแอป" {...CODE_FIELD} autoFocus />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? "กำลังตรวจ…" : "ยืนยัน"}
        </Button>
      </form>
      <p className="mt-4 text-xs leading-relaxed text-muted">ทำโทรศัพท์หาย หรือลบแอปไปแล้ว? ติดต่อผู้ดูแลระบบให้ปิดการยืนยันสองขั้นตอน แล้วตั้งค่าใหม่</p>
      <LeaveButton />
    </>
  );
}

/**
 * Setting up an authenticator: (admins: email check) → QR code → first code.
 * `done` runs after it worked (default: go to the calendar).
 */
export function TwoStepSetup({ email, emailChecked, needsEmail, onDone }: { email: string | null; emailChecked: boolean; needsEmail: boolean; onDone?: () => void }) {
  const router = useRouter();
  const { error, pending, run } = useStep();
  const [stage, setStage] = useState<"email" | "emailCode" | "start" | "scan">(needsEmail && !emailChecked ? "email" : "start");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ factorId: string; qr: string; secret: string } | null>(null);

  return (
    <div className="space-y-4">
      {stage === "email" &&
        (email ? (
          <>
            <Notice tone="info">ก่อนอื่น ยืนยันว่าเป็นคุณจริง: ระบบจะส่งรหัส 6 หลักไปที่ {email}</Notice>
            <Button type="button" variant="primary" className="w-full" disabled={pending} onClick={() => run(sendSetupEmail, (r) => { setSentTo(r.sentTo ?? email); setStage("emailCode"); })}>
              <Mail aria-hidden className="h-4 w-4" />
              {pending ? "กำลังส่ง…" : "ส่งรหัสไปที่อีเมล"}
            </Button>
          </>
        ) : (
          <Notice tone="warning">บัญชีนี้ยังไม่มีอีเมลที่ยืนยันแล้ว จึงตั้งค่าเองไม่ได้ ให้ผู้ดูแลระบบอีกคนช่วย</Notice>
        ))}

      {stage === "emailCode" && (
        <form onSubmit={(e) => { const code = codeOf(e); run(() => checkSetupEmail(code), () => setStage("start")); }} className="space-y-4">
          <Notice tone="success">ส่งรหัสไปที่ {sentTo} แล้ว (ดูในกล่องจดหมายขยะด้วย)</Notice>
          <Field label="รหัสจากอีเมล" {...CODE_FIELD} autoFocus />
          <Button type="submit" variant="primary" className="w-full" disabled={pending}>
            {pending ? "กำลังตรวจ…" : "ยืนยันอีเมล"}
          </Button>
          <Button type="button" variant="ghost" className="w-full" disabled={pending} onClick={() => run(sendSetupEmail, (r) => setSentTo(r.sentTo ?? sentTo))}>
            ส่งรหัสอีกครั้ง
          </Button>
        </form>
      )}

      {stage === "start" && (
        <>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink">
            <li>ติดตั้งแอปยืนยันตัวตนในโทรศัพท์ เช่น Google Authenticator หรือ Microsoft Authenticator (ฟรี)</li>
            <li>กด “เริ่มตั้งค่า” แล้วสแกน QR ด้วยแอป</li>
            <li>กรอกรหัส 6 หลักที่แอปแสดง</li>
          </ol>
          <Button type="button" variant="primary" className="w-full" disabled={pending} onClick={() => run(startSetup, (r) => { setSetup({ factorId: r.factorId!, qr: r.qr!, secret: r.secret! }); setStage("scan"); })}>
            <Smartphone aria-hidden className="h-4 w-4" />
            {pending ? "กำลังเตรียม…" : "เริ่มตั้งค่า"}
          </Button>
        </>
      )}

      {stage === "scan" && setup && (
        <form onSubmit={(e) => { const code = codeOf(e); run(() => finishSetup(setup.factorId, code), () => { if (onDone) onDone(); else { router.push("/calendar"); router.refresh(); } }); }} className="space-y-4">
          <p className="text-sm leading-relaxed text-ink">
            เปิดแอป Google Authenticator หรือ Microsoft Authenticator ในโทรศัพท์ กด <b>+</b> แล้ว<b>สแกน QR นี้</b>
          </p>
          <div className="grid place-items-center rounded-xl border border-line bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- a PNG data: URL drawn by our server (qrcode) */}
            <img src={setup.qr} alt="QR สำหรับแอปยืนยันตัวตน" width={240} height={240} className="h-60 w-60" />
          </div>
          <details className="text-sm text-muted">
            <summary className="cursor-pointer font-bold text-brand">สแกนไม่ได้? พิมพ์รหัสนี้ในแอปแทน</summary>
            <code className="mt-2 block break-all rounded-lg bg-sunken p-2 font-mono text-base tracking-wider text-ink">{setup.secret}</code>
          </details>
          <div className="rounded-xl bg-sunken px-3.5 py-3 text-sm leading-relaxed text-muted">
            <b className="text-ink">แอปขึ้นรหัสแล้ว แต่ระบบบอกว่าไม่ถูกต้อง?</b>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>ใช้รหัสจาก<b>แอปในโทรศัพท์</b> ไม่ใช่รหัสที่ส่งไปทางอีเมล</li>
              <li>ลบรายการ “PTN Connext” เก่าในแอปทิ้ง แล้วสแกน QR ที่อยู่บนหน้าจอนี้ใหม่</li>
              <li>ตั้งวันที่และเวลาของโทรศัพท์เป็น “อัตโนมัติ” รหัสจะตรงกับระบบ</li>
            </ul>
          </div>
          <Field label="รหัส 6 หลักจากแอป" {...CODE_FIELD} autoFocus />
          <Button type="submit" variant="primary" className="w-full" disabled={pending}>
            {pending ? "กำลังตรวจ…" : "เปิดใช้การยืนยันสองขั้นตอน"}
          </Button>
        </form>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      {needsEmail && <LeaveButton />}
    </div>
  );
}

/** /account: turn two-step on (teachers) or off (teachers; admins can't). */
export function TwoStepAccount({ on, canTurnOff }: { on: boolean; canTurnOff: boolean }) {
  const router = useRouter();
  const { error, pending, run } = useStep();
  const [open, setOpen] = useState(false);
  if (!on) {
    return open ? (
      <TwoStepSetup email={null} emailChecked needsEmail={false} onDone={() => { setOpen(false); router.refresh(); }} />
    ) : (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Smartphone aria-hidden className="h-4 w-4" />
        เปิดใช้การยืนยันสองขั้นตอน
      </Button>
    );
  }
  if (!canTurnOff) return <Notice tone="success">เปิดใช้อยู่ (ผู้ดูแลระบบต้องใช้เสมอ)</Notice>;
  return open ? (
    <form onSubmit={(e) => { const code = codeOf(e); run(() => turnOffTwoStep(code), () => { setOpen(false); router.refresh(); }); }} className="space-y-3">
      <Field label="รหัส 6 หลักจากแอป เพื่อยืนยันการปิด" {...CODE_FIELD} autoFocus />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? "กำลังปิด…" : "ปิดการยืนยันสองขั้นตอน"}
      </Button>
    </form>
  ) : (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Notice tone="success">เปิดใช้อยู่</Notice>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        ปิดการใช้งาน
      </Button>
    </div>
  );
}
