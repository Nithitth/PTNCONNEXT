import type { Metadata } from "next";
import { CheckCircle2, Circle, Lock } from "lucide-react";
import { AccessNav, PersonActions } from "@/components/admin/AccessControls";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container, EmptyState, Notice, PageHeader, cx } from "@/components/ui";
import { loadTeacherPeople } from "@/lib/accessData";
import { requireProfile } from "@/lib/auth";
import { dayKey, formatDateTime, formatDayShort } from "@/lib/calendar";
import { subjectByCode } from "@/lib/school";

export const metadata: Metadata = { title: "ครู · ลงทะเบียน" };

const STATE = {
  none: { text: "ยังไม่มีรหัส", tone: "bg-sunken text-muted" },
  active: { text: "ให้รหัสแล้ว", tone: "bg-warning-soft text-warning" },
  expired: { text: "รหัสหมดอายุ", tone: "bg-sunken text-faint" },
  locked: { text: "ถูกล็อก", tone: "bg-danger-soft text-danger" },
} as const;

/** ครู: pre-registered teachers, their personal sign-up code state, and who has registered. */
export default async function AccessTeachersPage() {
  await requireProfile({ roles: ["admin"] });
  const teachers = await loadTeacherPeople();

  return (
    <Container className="py-10">
      <PageHeader eyebrow="ผู้ดูแลระบบ" title="ลงทะเบียน & เข้าสู่ระบบ" subtitle="ครูลงทะเบียนด้วยชื่อ วิชา และรหัสส่วนตัวที่ผู้ดูแลระบบให้" />
      <AdminNav />
      <AccessNav />
      <Notice tone="info">
        กด “สร้างรหัสส่วนตัว” แล้วให้รหัสกับครูท่านนั้น<b> เป็นการส่วนตัวนอกระบบ</b> (กระดาษ LINE หรือโทรศัพท์) รหัสแสดงครั้งเดียว ใช้ได้ 14 วัน
        กรอกผิด 5 ครั้งจะถูกล็อก ให้สร้างรหัสใหม่
      </Notice>

      {teachers.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={<Circle aria-hidden className="h-6 w-6" />} title="ยังไม่มีรายชื่อครู" body="นำเข้ารายชื่อครูที่แท็บ “นำเข้ารายชื่อ”" />
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-soft-sm">
          {teachers.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
              {t.registered ? (
                <CheckCircle2 aria-label="ลงทะเบียนแล้ว" className="h-5 w-5 shrink-0 text-success" />
              ) : t.codeState === "locked" ? (
                <Lock aria-label="รหัสถูกล็อก" className="h-5 w-5 shrink-0 text-danger" />
              ) : (
                <Circle aria-label="ยังไม่ลงทะเบียน" className="h-5 w-5 shrink-0 text-faint" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">{t.name}</p>
                <p className="text-xs text-muted">
                  {t.subjects.map((c) => subjectByCode(c)?.name ?? c).join(", ") || "ไม่มีวิชา"}
                  {" · "}
                  {t.registered ? (
                    `ลงทะเบียน ${t.registeredAt ? formatDateTime(t.registeredAt) : ""}${t.contact ? ` · ${t.contact}` : ""}`
                  ) : (
                    <span className={cx("rounded-full px-2 py-0.5 font-bold", STATE[t.codeState].tone)}>
                      {STATE[t.codeState].text}
                      {t.codeState === "active" && t.codeExpiresAt && ` ถึง ${formatDayShort(dayKey(t.codeExpiresAt))}`}
                    </span>
                  )}
                </p>
              </div>
              <PersonActions id={t.id} name={t.name} registered={t.registered} />
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
