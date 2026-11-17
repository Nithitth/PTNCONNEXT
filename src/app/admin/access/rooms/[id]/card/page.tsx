import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Brand } from "@/components/ui";
import { loadRooms } from "@/lib/accessData";
import { requireProfile } from "@/lib/auth";
import { dayKey, formatDayLong, formatTime } from "@/lib/calendar";

export const metadata: Metadata = { title: "การ์ด QR ลงทะเบียน" };

/**
 * A printable card for the room's student volunteer: the QR (opens /signup with the room code filled
 * in), the code in large letters, and the time slot. Print with the browser (Ctrl+P).
 */
export default async function RoomCardPage({ params }: PageProps<"/admin/access/rooms/[id]/card">) {
  await requireProfile({ roles: ["admin"] });
  const { id } = await params;
  const room = (await loadRooms()).find((r) => r.classroomId === id);
  if (!room?.code || !room.startsAt || !room.endsAt) notFound();

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const url = `${origin}/signup?room=${room.code}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#140e0e", light: "#ffffff" } });

  return (
    <div className="mx-auto w-full max-w-md px-4 py-8 print:py-0">
      <div className="rounded-3xl border-2 border-brand bg-white p-6 text-center shadow-soft-lg print:shadow-none">
        <p className="font-display text-sm font-bold text-brand">
          ลงทะเบียน <Brand>PTN Connext</Brand>
        </p>
        <h1 className="mt-1 font-display text-4xl font-extrabold text-ink">ห้อง {room.label}</h1>
        <p className="mt-1 text-sm font-bold text-muted">
          {formatDayLong(dayKey(room.startsAt))} · {formatTime(room.startsAt)}–{formatTime(room.endsAt)}
        </p>
        {/* The SVG comes from the qrcode library, not from users. */}
        <div className="mx-auto mt-5 w-64 max-w-full [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-4 text-xs font-bold text-muted">หรือเข้า {origin.replace(/^https?:\/\//, "")}/signup แล้วพิมพ์รหัส</p>
        <p className="mt-1 font-mono text-4xl font-extrabold tracking-[0.3em] text-ink">{room.code}</p>
        <ol className="mt-5 space-y-1 text-left text-sm text-ink">
          <li>1. สแกน QR ด้วยกล้องมือถือ</li>
          <li>2. พิมพ์ชื่อจริงและนามสกุล แล้วตรวจเลขประจำตัวให้ถูก</li>
          <li>3. ยืนยันอีเมล แล้วตั้งรหัสผ่านของตัวเอง</li>
        </ol>
        <p className="mt-4 text-xs text-muted">ใช้ได้เฉพาะนักเรียนห้อง {room.label} ในช่วงเวลานี้เท่านั้น ห้ามลงทะเบียนแทนผู้อื่น</p>
      </div>
      <p className="mt-4 text-center text-xs text-faint print:hidden">กด Ctrl+P เพื่อพิมพ์ การ์ดนี้ให้นักเรียนอาสาของห้องเท่านั้น</p>
    </div>
  );
}
