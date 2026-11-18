import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles, Users } from "lucide-react";
import { CodeGenerator, SlotEditor } from "@/components/admin/AccessControls";
import { AdminBack } from "@/components/admin/AdminBack";
import { Card, Container, Notice, PageHeader, cx } from "@/components/ui";
import { loadRooms } from "@/lib/accessData";
import { requireProfile } from "@/lib/auth";
import { dayKey, formatDayShort, formatTime, isoToBangkokInput } from "@/lib/calendar";
import { SLOT_LABEL } from "@/lib/signup";

export const metadata: Metadata = { title: "ห้องเรียน & QR · ลงทะเบียน" };

const STATUS_TONE = {
  none: "bg-sunken text-muted",
  upcoming: "bg-warning-soft text-warning",
  open: "bg-success-soft text-success",
  closed: "bg-sunken text-faint",
} as const;

/** ห้องเรียน & QR: each room's sign-up time slot, its QR card, and progress. */
export default async function AccessRoomsPage({ searchParams }: PageProps<"/admin/access/rooms">) {
  await requireProfile({ roles: ["admin"] });
  const [rooms, sp] = await Promise.all([loadRooms(), searchParams]);
  const initialRoom = typeof sp.room === "string" ? sp.room : undefined;

  return (
    <Container className="py-10">
      <AdminBack />
      <PageHeader eyebrow="ผู้ดูแลระบบ" title="ห้องเรียน & QR" subtitle="ตั้งเวลาลงทะเบียนของแต่ละห้อง แล้วพิมพ์การ์ด QR ให้นักเรียนอาสาของห้อง" />

      <Notice tone="info">
        เลือกห้อง วันที่ และเวลา แล้วกด “สร้างรหัส” จากนั้นพิมพ์การ์ด QR ให้นักเรียนอาสาของห้อง รหัสใช้ได้เฉพาะช่วงเวลานั้น และเฉพาะชื่อนักเรียนในห้องนั้น ห้องหนึ่งมีรหัสได้ครั้งละ 1 รหัส
      </Notice>

      {rooms.length > 0 && (
        <Card bold className="mt-6">
          <div id="generate" className="scroll-mt-24">
            <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-extrabold text-ink">
              <Sparkles aria-hidden className="h-5 w-5 text-brand" />
              สร้างรหัสลงทะเบียน
            </h2>
            <CodeGenerator
              key={initialRoom ?? "none"}
              rooms={rooms.map(({ classroomId, label, code, startsAt, endsAt, status }) => ({ classroomId, label, code, startsAt, endsAt, status }))}
              initialRoom={initialRoom}
            />
          </div>
        </Card>
      )}

      {rooms.length > 0 && <h2 className="mt-10 font-display text-lg font-extrabold text-ink">รหัสของแต่ละห้อง</h2>}

      {rooms.length === 0 ? (
        <p className="mt-6 text-sm text-muted">ยังไม่มีห้องเรียน นำเข้ารายชื่อนักเรียนก่อน (แท็บ “นำเข้ารายชื่อ”)</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rooms.map((r) => {
            const start = r.startsAt ? isoToBangkokInput(r.startsAt) : "";
            const end = r.endsAt ? isoToBangkokInput(r.endsAt) : "";
            return (
              <li key={r.classroomId} className="rounded-2xl border border-line bg-surface p-4 shadow-soft-sm sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl font-extrabold text-ink">{r.label}</h2>
                    <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_TONE[r.status])}>{SLOT_LABEL[r.status]}</span>
                    {r.startsAt && r.endsAt && (
                      <span className="text-sm text-muted">
                        {formatDayShort(dayKey(r.startsAt))} {formatTime(r.startsAt)}–{formatTime(r.endsAt)}
                      </span>
                    )}
                    {r.code && <span className="rounded-md bg-sunken px-2 py-0.5 font-mono text-sm font-bold tracking-widest text-ink">{r.code}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Link href={`/admin/access/rooms?room=${r.classroomId}#generate`} className="inline-flex items-center gap-1.5 text-sm font-bold text-brand hover:underline">
                      <Sparkles aria-hidden className="h-4 w-4" />
                      สร้างรหัส
                    </Link>
                    <Link href={`/admin/access/rooms/${r.classroomId}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-brand hover:underline">
                      <Users aria-hidden className="h-4 w-4" />
                      ลงทะเบียนแล้ว {r.registered}/{r.total}
                    </Link>
                  </div>
                </div>
                <SlotEditor
                  key={`${r.startsAt}-${r.endsAt}`}
                  classroomId={r.classroomId}
                  label={r.label}
                  date={start.slice(0, 10)}
                  start={start.slice(11, 16)}
                  end={end.slice(11, 16)}
                  hasSlot={Boolean(r.code)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}
