"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Cloud, CloudUpload, ShieldCheck, Unplug } from "lucide-react";
import { disconnectDriveAction } from "@/app/teacher/driveActions";
import { Notice, bigButtonStyles, cx } from "@/components/ui";
import { driveConnectHref } from "@/lib/driveCore";

// Google Drive for teachers with little computer experience: big text, few words, one thing to do at a time.


/** One numbered step with a small picture of what the teacher will see. */
function GuideStep({ n, text, children }: { n: number; text: ReactNode; children: ReactNode }) {
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft-sm">
      <p className="flex items-start gap-3 text-lg leading-snug text-ink">
        <span aria-hidden className="bg-brand-gradient grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-lg font-extrabold text-white shadow-brand-glow">
          {n}
        </span>
        <span className="pt-1">
          <span className="sr-only">ขั้นที่ {n}: </span>
          {text}
        </span>
      </p>
      <div aria-hidden className="pointer-events-none relative select-none rounded-xl bg-sunken p-3 pt-7">
        <span className="absolute left-3 top-1.5 text-xs font-bold text-muted">ตัวอย่างหน้าจอ</span>
        {children}
      </div>
    </li>
  );
}

/**
 * "วิธีเชื่อมต่อ Google Drive": 3 steps with pictures, a one-line safety note, and the big red button.
 * `onLeave` runs just before going to Google (the post form saves what was typed).
 */
export function DriveConnectGuide({ next, onLeave }: { next: string; onLeave?: () => void }) {
  return (
    // Three columns only when the guide's own box is wide (the console banner), not on a wide screen:
    // inside the narrow account card or the post form the steps stay one under the other.
    <div className="@container space-y-4">
      <ol className="grid gap-3 @3xl:grid-cols-3">
        <GuideStep n={1} text={<>กดปุ่มสีแดง <b>“เชื่อมต่อ Google Drive”</b> ด้านล่าง</>}>
          <span className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand text-base font-bold text-white">
            <CloudUpload className="h-5 w-5" />
            เชื่อมต่อ Google Drive
          </span>
        </GuideStep>
        <GuideStep n={2} text={<>เลือก<b>บัญชี Google ของคุณ</b> (อีเมลที่ใช้เป็นประจำ)</>}>
          <span className="block rounded-lg border border-line bg-surface p-2.5">
            <span className="mb-2 block text-sm font-bold text-muted">เลือกบัญชี</span>
            <span className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-base font-bold text-brand">ก</span>
              <span className="min-w-0 text-sm">
                <span className="block font-bold text-ink">ชื่อของคุณ</span>
                <span className="block break-all text-muted">yourname@gmail.com</span>
              </span>
            </span>
          </span>
        </GuideStep>
        <GuideStep
          n={3}
          text={
            <>
              Google จะถามว่าอนุญาตไหม ถ้ามีช่องให้ติ๊ก <b>ติ๊กให้ครบ</b> แล้วกด <b>“ดำเนินการต่อ”</b> หรือ <b>“อนุญาต”</b>
            </>
          }
        >
          <span className="block rounded-lg border border-line bg-surface p-2.5 text-sm">
            <span className="flex items-start gap-2 text-ink">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded bg-ink text-xs font-bold text-white">✓</span>
              ไฟล์ Google ไดรฟ์ที่ใช้กับ PTN Connext
            </span>
            <span className="mt-2.5 flex justify-end">
              <span className="rounded-full bg-ink px-4 py-1.5 font-bold text-white">ดำเนินการต่อ</span>
            </span>
          </span>
        </GuideStep>
      </ol>
      <p className="flex items-start gap-2.5 rounded-2xl bg-success-soft px-4 py-3 text-lg leading-snug text-success">
        <ShieldCheck aria-hidden className="mt-0.5 h-6 w-6 shrink-0" />
        <span>
          ปลอดภัย: ระบบเห็นเฉพาะไฟล์ที่ส่งจาก Connext เท่านั้น <b>ไม่เห็นไฟล์อื่นใน Drive ของคุณ</b>
        </span>
      </p>
      <a href={driveConnectHref(next)} onClick={() => onLeave?.()} className={bigButtonStyles.primary}>
        <CloudUpload aria-hidden className="h-6 w-6" />
        เชื่อมต่อ Google Drive
      </a>
    </div>
  );
}

// "ไว้ทีหลัง" hides the banner for this visit (sessionStorage), like the teacher guide.
const LATER_KEY = "ptn-drive-later";
const LATER_EVENT = "ptn:drive-later";
const subscribeLater = (cb: () => void) => {
  window.addEventListener(LATER_EVENT, cb);
  return () => window.removeEventListener(LATER_EVENT, cb);
};
const readLater = () => {
  try {
    return window.sessionStorage.getItem(LATER_KEY) === "1";
  } catch {
    return false;
  }
};

/** The big banner at the top of the Teacher's Console, until the teacher connects (or presses "ไว้ทีหลัง"). */
export function DriveBanner({ next }: { next: string }) {
  const later = useSyncExternalStore(subscribeLater, readLater, () => false);
  const [open, setOpen] = useState(false);
  if (later) return null;
  return (
    <section aria-labelledby="drive-banner-title" className="mb-8 rounded-3xl border border-brand/25 bg-brand-soft/50 p-5 shadow-soft-sm sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="bg-brand-gradient grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white shadow-brand-glow">
          <Cloud aria-hidden className="h-7 w-7" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="drive-banner-title" className="font-display text-2xl font-extrabold leading-tight text-ink">
            ใหม่! เก็บไฟล์ PDF ใน Google Drive ของคุณเอง
          </h2>
          <p className="mt-2 text-lg leading-relaxed text-ink">
            เชื่อมต่อครั้งเดียว ใช้เวลาไม่ถึง 1 นาที จากนั้น PDF ที่คุณแชร์จะไปเก็บใน Google Drive ของคุณ<b>โดยอัตโนมัติ</b>{" "}
            ช่วยประหยัดพื้นที่ของโรงเรียน
          </p>
          {!open && (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => setOpen(true)} className={bigButtonStyles.primary}>
                <ChevronDown aria-hidden className="h-6 w-6" />
                ดูวิธีเชื่อมต่อ
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    window.sessionStorage.setItem(LATER_KEY, "1");
                  } catch {}
                  window.dispatchEvent(new Event(LATER_EVENT));
                }}
                className={bigButtonStyles.secondary}
              >
                ไว้ทีหลัง
              </button>
            </div>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-5">
          <DriveConnectGuide next={next} />
        </div>
      )}
    </section>
  );
}

/** Inside the post form's PDF step, for teachers who haven't connected yet: a short offer that opens the guide. */
export function DriveOffer({ next, onLeave }: { next: string; onLeave: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 rounded-2xl border border-brand/25 bg-brand-soft/40 p-4">
      <p className="flex items-start gap-2.5 text-lg leading-snug text-ink">
        <Cloud aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-brand" />
        <span>
          อยากประหยัดพื้นที่? <b>เก็บ PDF ใน Google Drive ของคุณ</b> (ทำครั้งเดียว)
        </span>
      </p>
      {open ? (
        <div className="mt-4 space-y-3">
          <p className="rounded-xl bg-surface px-4 py-3 text-base leading-relaxed text-muted">
            ข้อมูลที่กรอกไว้ในฟอร์มนี้จะถูกเก็บไว้ให้ เมื่อกลับมาแล้ว<b className="text-ink">เลือกไฟล์ PDF อีกครั้ง</b>เท่านั้น
          </p>
          <DriveConnectGuide next={next} onLeave={onLeave} />
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={cx(bigButtonStyles.secondary, "mt-3")}>
          <ChevronDown aria-hidden className="h-6 w-6" />
          ดูวิธีเชื่อมต่อ
        </button>
      )}
    </div>
  );
}

/** "Google Drive" on the account page: connected or not, and disconnect (two taps). */
export function DriveAccountCard({ connected, school = false }: { connected: boolean; school?: boolean }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The school's Shared Drive is connected: nothing for the teacher to do.
  if (school)
    return (
      <p className="mt-4 flex items-start gap-3 rounded-2xl bg-success-soft px-4 py-4 text-lg leading-snug text-success">
        <CheckCircle2 aria-hidden className="mt-0.5 h-7 w-7 shrink-0" />
        <span>
          <b className="block text-xl">PDF ของคุณเก็บใน Drive ของโรงเรียนให้อัตโนมัติ</b>
          ไม่ต้องเชื่อมต่ออะไร เลือกไฟล์ PDF ได้ตามปกติ
        </span>
      </p>
    );
  if (!connected) return <DriveConnectGuide next="/account" />;
  return (
    <div className="space-y-4">
      <p className="flex items-start gap-3 rounded-2xl bg-success-soft px-4 py-4 text-lg leading-snug text-success">
        <CheckCircle2 aria-hidden className="mt-0.5 h-7 w-7 shrink-0" />
        <span>
          <b className="block text-xl">เชื่อมต่อ Google Drive แล้ว</b>
          PDF ที่คุณแชร์จะไปอยู่ในโฟลเดอร์ “PTN Connext” ใน Google Drive ของคุณโดยอัตโนมัติ
        </span>
      </p>
      <p className="text-base leading-relaxed text-muted">
        ถ้ายกเลิกการเชื่อมต่อ ไฟล์ที่ส่งไปแล้วยังอยู่ใน Drive ของคุณ และนักเรียนยังเปิดได้จนครบ 180 วัน แต่ระบบจะลบไฟล์เหล่านั้นให้ไม่ได้
        ต้องลบเองใน Google Drive
      </p>
      <button
        type="button"
        disabled={pending}
        onBlur={() => setArmed(false)}
        onClick={async () => {
          if (!armed) return setArmed(true);
          setPending(true);
          setError(null);
          const r = await disconnectDriveAction();
          setPending(false);
          setArmed(false);
          if (r.error) setError(r.error);
          else router.refresh();
        }}
        className={armed ? bigButtonStyles.danger : bigButtonStyles.secondary}
      >
        <Unplug aria-hidden className="h-6 w-6" />
        {pending ? "กำลังยกเลิก…" : armed ? "กดอีกครั้งเพื่อยืนยัน" : "ยกเลิกการเชื่อมต่อ"}
      </button>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
