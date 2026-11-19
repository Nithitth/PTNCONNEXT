import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Eye, FileText, History, LogIn, MousePointerClick, PenLine, UserCog } from "lucide-react";
import { AdminBack } from "@/components/admin/AdminBack";
import { AdminSection } from "@/components/admin/AdminMenu";
import { Container, Notice, PageHeader, cx } from "@/components/ui";
import { PostHistoryList } from "@/components/admin/PostHistoryList";
import { loadPersonActivity } from "@/lib/activityData";
import { actionLabel } from "@/lib/auditLabels";
import { requireProfile } from "@/lib/auth";
import { formatDateTime } from "@/lib/calendar";
import { featureOf } from "@/lib/features";
import { logAudit } from "@/lib/logs";
import { isUuid } from "@/lib/postForm";

export const metadata: Metadata = { title: "ประวัติการใช้งาน · คอนโซลผู้พัฒนา" };

const DAYS = 60;
const ROLE: Record<string, string> = { student: "นักเรียน", teacher: "ครู", admin: "ผู้ดูแลระบบ" };
const TYPE: Record<string, string> = { assignment: "งาน", exam: "สอบ", material: "เอกสาร", event: "กิจกรรม" };
const REASON: Record<string, string> = {
  "wrong-password": "รหัสผ่านผิด",
  "wrong-tab": "เลือกแท็บผิด",
  "no-profile": "ยังไม่ได้ลงทะเบียน",
  locked: "ถูกล็อก",
  "mfa-wrong": "รหัสสองขั้นตอนผิด",
  "two-step": "ผ่านสองขั้นตอน",
};
const thaiDay = new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
const timeOnly = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

/** One person's activity: log-ins, what they opened, account changes and post history (last 60 days). */
export default async function PersonActivityPage({ params }: PageProps<"/admin/users/[id]/activity">) {
  const me = await requireProfile({ roles: ["admin"] });
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const a = await loadPersonActivity(id, DAYS);
  if (!a.person) notFound();
  // Looking at someone's activity is itself recorded, so staff can't quietly watch students.
  await logAudit(me.id, "view-activity", id, { name: a.person.name });

  const failed = a.logins.filter((l) => !l.ok).length;
  const fileOpens = a.seen.filter((s) => s.fileOpens > 0).length;

  return (
    <Container className="py-10">
      <AdminBack parent={{ href: `/admin/users?q=${encodeURIComponent(a.person.loginId)}`, label: "ผู้ใช้" }} />
      <PageHeader
        eyebrow="ประวัติการใช้งาน"
        title={a.person.name}
        subtitle={`${ROLE[a.person.role] ?? a.person.role}${a.person.room ? ` · ${a.person.room}` : ""} · ${a.person.loginId} · ${DAYS} วันล่าสุด`}
      />
      <div className="mb-5">
        <Notice tone="info">ข้อมูลนี้ใช้เพื่อความปลอดภัยและตรวจสอบข้อเท็จจริงเท่านั้น การเปิดดูหน้านี้ถูกบันทึกไว้ในประวัติของผู้ดูแล</Notice>
      </div>

      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "เข้าสู่ระบบ", value: a.logins.length - failed, note: failed ? `ไม่สำเร็จ ${failed}` : "ไม่มีครั้งที่ผิด" },
          { label: "วันที่ใช้งาน", value: a.days.length, note: `จาก ${DAYS} วัน` },
          { label: "โพสต์ที่เปิดดู", value: a.seen.length, note: `เปิดไฟล์ ${fileOpens} โพสต์` },
          { label: "การเปลี่ยนแปลงบัญชี", value: a.account.length, note: `โพสต์ที่แก้ ${a.posts.length}` },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-surface p-4 shadow-soft-sm">
            <dt className="text-xs font-bold text-muted">{s.label}</dt>
            <dd className="font-display text-3xl font-extrabold tabular-nums text-ink">{s.value.toLocaleString("th-TH")}</dd>
            <dd className="text-xs text-faint">{s.note}</dd>
          </div>
        ))}
      </dl>

      <AdminSection title="ใช้ส่วนไหนของระบบ (รายวัน)" icon={MousePointerClick} count={a.days.length} open>
        {a.days.length === 0 ? (
          <p className="text-sm text-muted">ยังไม่มีการใช้งานที่บันทึกไว้ (เริ่มบันทึกเมื่อเปิดใช้ประวัติการใช้งาน)</p>
        ) : (
          <ul className="-mx-4 -my-4 divide-y divide-line text-sm sm:-mx-5">
            {a.days.map((d) => (
              <li key={d.day} className="px-4 py-3 sm:px-5">
                <p className="mb-1.5 font-bold text-ink">{thaiDay.format(new Date(`${d.day}T12:00:00+07:00`))}</p>
                <div className="flex flex-wrap gap-1.5">
                  {d.features.map((f) => (
                    <span key={f.feature} className="rounded-full bg-sunken px-2.5 py-1 text-xs text-ink">
                      {featureOf(f.feature)?.th ?? f.feature} · {f.visits} ครั้ง · {timeOnly.format(new Date(f.first))}–{timeOnly.format(new Date(f.last))}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      {a.person.role === "student" && (
        <AdminSection title="โพสต์และไฟล์ที่เปิดดู" icon={Eye} count={a.seen.length}>
          {a.seen.length === 0 ? (
            <p className="text-sm text-muted">ยังไม่ได้เปิดดูโพสต์ใด</p>
          ) : (
            <ul className="-mx-4 -my-4 divide-y divide-line text-sm sm:-mx-5">
              {a.seen.map((s) => (
                <li key={s.postId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-4 py-3 sm:px-5">
                  <span className="min-w-0">
                    <span className="mr-2 text-xs font-bold text-muted">{TYPE[s.type] ?? ""}</span>
                    <span className="font-bold text-ink">{s.title}</span>
                    <span className="block text-xs text-muted">
                      เปิดครั้งแรก {formatDateTime(s.first)} · ล่าสุด {formatDateTime(s.last)} · {s.views} ครั้ง
                    </span>
                    {s.fileFirst && (
                      <span className="flex items-center gap-1 text-xs text-success">
                        <FileText aria-hidden className="h-3.5 w-3.5" />
                        เปิดไฟล์ครั้งแรก {formatDateTime(s.fileFirst)} · {s.fileOpens} ครั้ง
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AdminSection>
      )}

      <AdminSection title="การเปลี่ยนแปลงบัญชี" icon={UserCog} count={a.account.length}>
        {a.account.length === 0 ? (
          <p className="text-sm text-muted">ยังไม่มีรายการ</p>
        ) : (
          <ul className="-mx-4 -my-4 divide-y divide-line text-sm sm:-mx-5">
            {a.account.map((x, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-4 py-3 sm:px-5">
                <span className="min-w-0">
                  <span className="font-bold text-ink">{actionLabel(x.action)}</span>
                  {x.target && <span className="ml-1.5 text-ink">{x.target}</span>}
                  {x.byOther && <span className="ml-2 text-muted">โดย {x.byOther}</span>}
                </span>
                <span className="text-xs text-muted">{formatDateTime(x.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      {a.person.role !== "student" && (
        <AdminSection title="ประวัติโพสต์ (สร้าง แก้ไข ลบ)" icon={PenLine} count={a.posts.length}>
          <PostHistoryList rows={a.posts} showWho={false} />
        </AdminSection>
      )}

      <AdminSection title="การเข้าสู่ระบบ" icon={LogIn} count={a.logins.length}>
        {a.logins.length === 0 ? (
          <p className="text-sm text-muted">ไม่มีการเข้าสู่ระบบใน {DAYS} วัน</p>
        ) : (
          <ul className="-mx-4 -my-4 divide-y divide-line text-sm sm:-mx-5">
            {a.logins.map((l, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-bold", l.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
                  {l.ok ? "สำเร็จ" : (REASON[l.reason ?? ""] ?? "ไม่สำเร็จ")}
                </span>
                <span className="text-xs text-muted">{formatDateTime(l.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-faint">
        <History aria-hidden className="h-3.5 w-3.5" />
        ระบบเก็บประวัติเหล่านี้ 365 วัน แล้วลบอัตโนมัติ
      </p>
    </Container>
  );
}
