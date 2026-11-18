import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import { PersonActions } from "@/components/admin/AccessControls";
import { AdminBack } from "@/components/admin/AdminBack";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { loadRoomPeople, loadRooms } from "@/lib/accessData";
import { requireProfile } from "@/lib/auth";
import { formatDateTime } from "@/lib/calendar";
import { SLOT_LABEL } from "@/lib/signup";

export const metadata: Metadata = { title: "รายชื่อห้อง · ลงทะเบียน" };

/** One room's students: who has registered (with masked email) and who hasn't. */
export default async function AccessRoomPage({ params }: PageProps<"/admin/access/rooms/[id]">) {
  await requireProfile({ roles: ["admin"] });
  const { id } = await params;
  const room = (await loadRooms()).find((r) => r.classroomId === id);
  if (!room) notFound();
  const people = await loadRoomPeople(id);
  const waiting = people.filter((p) => !p.registered);

  return (
    <Container className="py-10">
      <AdminBack parent={{ href: "/admin/access/rooms", label: "ห้องเรียน & QR" }} />
      <PageHeader eyebrow="ผู้ดูแลระบบ" title={`ห้อง ${room.label}`} subtitle={`ลงทะเบียนแล้ว ${room.registered}/${room.total} · ${SLOT_LABEL[room.status]}`} />
      <Link href="/admin/access/rooms" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-brand">
        <ArrowLeft aria-hidden className="h-4 w-4" />
        ทุกห้อง
      </Link>

      {people.length === 0 ? (
        <EmptyState icon={<Circle aria-hidden className="h-6 w-6" />} title="ยังไม่มีรายชื่อในห้องนี้" body="นำเข้ารายชื่อนักเรียนที่แท็บ “นำเข้ารายชื่อ”" />
      ) : (
        <>
          {waiting.length > 0 && (
            <p className="mb-3 text-sm text-muted">
              ยังไม่ลงทะเบียน {waiting.length} คน · นักเรียนที่ขาดในวันนั้น กด “สร้างรหัสส่วนตัว” แล้วให้รหัสเป็นการส่วนตัว
            </p>
          )}
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-soft-sm">
            {people.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                {p.registered ? (
                  <CheckCircle2 aria-label="ลงทะเบียนแล้ว" className="h-5 w-5 shrink-0 text-success" />
                ) : (
                  <Circle aria-label="ยังไม่ลงทะเบียน" className="h-5 w-5 shrink-0 text-faint" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">
                    {p.name} <span className="ml-1 font-mono text-xs font-normal text-muted">{p.loginId}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {p.registered
                      ? `ลงทะเบียน ${p.registeredAt ? formatDateTime(p.registeredAt) : ""}${p.contact ? ` · ${p.contact}` : ""}`
                      : p.codeState === "active"
                        ? "มีรหัสส่วนตัวที่ยังใช้ได้"
                        : "ยังไม่ลงทะเบียน"}
                  </p>
                </div>
                <PersonActions id={p.id} name={p.name} registered={p.registered} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Container>
  );
}
