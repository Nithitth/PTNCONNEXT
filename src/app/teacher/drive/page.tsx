import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, CloudOff, RotateCcw } from "lucide-react";
import { Container, bigButtonStyles, cx } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { driveConnectHref, safeNext } from "@/lib/driveCore";

export const metadata: Metadata = { title: "เชื่อมต่อ Google Drive" };

/**
 * The full-size page a teacher lands on after Google's permission page: a big tick when it worked,
 * a calm message (never an error page) when they cancelled, and one big button back to where they were.
 */
const RESULT: Record<string, { tone: "ok" | "info" | "warn"; title: string; lines: string[]; retry: boolean }> = {
  ok: {
    tone: "ok",
    title: "เชื่อมต่อสำเร็จ!",
    lines: [
      "จากนี้ PDF ที่คุณแชร์จะไปอยู่ในโฟลเดอร์ “PTN Connext” ใน Google Drive ของคุณโดยอัตโนมัติ",
      "ไม่ต้องทำอะไรเพิ่ม เลือกไฟล์ PDF ได้ตามปกติ",
    ],
    retry: false,
  },
  cancelled: {
    tone: "info",
    title: "ยังไม่ได้เชื่อมต่อ",
    lines: ["ไม่เป็นไร คุณกด “ยกเลิก” ที่หน้าของ Google", "แชร์ PDF ได้ตามปกติ หรือกด “ลองอีกครั้ง” เมื่อพร้อม"],
    retry: true,
  },
  noscope: {
    tone: "warn",
    title: "ยังเชื่อมต่อไม่ครบ",
    lines: ["ตอนที่ Google ถามว่าอนุญาตไหม ต้องติ๊กช่องเรื่อง Google ไดรฟ์ด้วย", "กด “ลองอีกครั้ง” แล้วติ๊กให้ครบทุกช่อง"],
    retry: true,
  },
  expired: {
    tone: "warn",
    title: "หมดเวลา ลองใหม่อีกครั้ง",
    lines: ["การเชื่อมต่อใช้เวลานานเกินไป หรือเปิดจากหน้าเก่า", "กด “ลองอีกครั้ง” แล้วทำต่อให้เสร็จภายใน 15 นาที"],
    retry: true,
  },
  failed: {
    tone: "warn",
    title: "เชื่อมต่อไม่สำเร็จ",
    lines: ["ระบบหรือ Google ขัดข้องชั่วคราว", "กด “ลองอีกครั้ง” ถ้ายังไม่ได้ แจ้งผู้ดูแลระบบ"],
    retry: true,
  },
  off: {
    tone: "info",
    title: "ยังเปิดใช้ Google Drive ไม่ได้",
    lines: ["ผู้ดูแลระบบยังไม่ได้ตั้งค่า Google Drive ของโรงเรียน", "แชร์ PDF ได้ตามปกติ ไฟล์จะเก็บในระบบ Connext"],
    retry: false,
  },
};

const LOOK = {
  ok: { Icon: CheckCircle2, ring: "bg-success-soft text-success" },
  info: { Icon: CloudOff, ring: "bg-sunken text-muted" },
  warn: { Icon: AlertCircle, ring: "bg-warning-soft text-warning" },
};

export default async function DriveResultPage({ searchParams }: PageProps<"/teacher/drive">) {
  await requireProfile({ roles: ["teacher", "admin"] });
  const q = await searchParams;
  const status = typeof q.status === "string" && q.status in RESULT ? q.status : "failed";
  const next = safeNext(typeof q.next === "string" ? q.next : null);
  const r = RESULT[status];
  const { Icon, ring } = LOOK[r.tone];

  return (
    <Container className="py-12 sm:py-16">
      <div className="mx-auto max-w-xl text-center">
        <span className={cx("mx-auto grid h-28 w-28 animate-rise place-items-center rounded-full", ring)}>
          <Icon aria-hidden className="h-16 w-16" strokeWidth={2.2} />
        </span>
        <h1 className="mt-6 font-display text-4xl font-extrabold text-ink">{r.title}</h1>
        <div className="mt-4 space-y-2 text-xl leading-relaxed text-ink">
          {r.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
        <div className="mt-8 flex flex-col items-stretch gap-3 sm:items-center">
          <Link href={next} className={bigButtonStyles.primary}>
            กลับไปทำต่อ
            <ArrowRight aria-hidden className="h-6 w-6" />
          </Link>
          {r.retry && (
            <a href={driveConnectHref(next)} className={bigButtonStyles.secondary}>
              <RotateCcw aria-hidden className="h-6 w-6" />
              ลองอีกครั้ง
            </a>
          )}
        </div>
      </div>
    </Container>
  );
}
