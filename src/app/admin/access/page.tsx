import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, KeyRound, LogIn, Mail, ShieldAlert, Sparkles, UserPlus, Users } from "lucide-react";
import { AccessNav, SignupSwitch } from "@/components/admin/AccessControls";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container, PageHeader, buttonStyles, cx } from "@/components/ui";
import { loadOverview } from "@/lib/accessData";
import { requireProfile } from "@/lib/auth";
import { formatDayShort, dayKey, formatTime } from "@/lib/calendar";
import { SLOT_LABEL } from "@/lib/signup";
import { usageLevel } from "@/lib/usage";

export const metadata: Metadata = { title: "ลงทะเบียน & เข้าสู่ระบบ · คอนโซลผู้พัฒนา" };

/** Gmail's daily sending limit (see src/lib/mail.ts). */
const EMAIL_LIMIT = 500;
const BAR = { ok: "bg-success", watch: "bg-exam", high: "bg-brand" } as const;

function Bar({ value, total, label }: { value: number; total: number; label: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2.5 overflow-hidden rounded-full bg-sunken">
      <div className="h-full rounded-full bg-brand-gradient transition-[width] duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** ลงทะเบียน & เข้าสู่ระบบ → ภาพรวม: progress, today's activity, warnings and the master switch. */
export default async function AccessOverviewPage() {
  await requireProfile({ roles: ["admin"] });
  const o = await loadOverview();
  const openRooms = o.rooms.filter((r) => r.status === "open");
  const nextRoom = o.rooms
    .filter((r) => r.status === "upcoming")
    .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""))[0];
  const unscheduled = o.rooms.filter((r) => r.status === "none");
  const emailLevel = usageLevel(o.today.emailsSent, EMAIL_LIMIT);
  const warnings = [
    { label: "รหัสห้อง/รหัสส่วนตัวผิด", value: o.today.wrongRoomCodes, Icon: KeyRound },
    { label: "รหัสครูผิด", value: o.today.wrongTeacherCodes, Icon: KeyRound },
    { label: "รหัสครูถูกล็อก", value: o.today.lockedCodes, Icon: ShieldAlert },
    { label: "มีคนพยายามใช้ชื่อที่ลงทะเบียนแล้ว", value: o.today.takenNames, Icon: AlertTriangle },
    { label: "เข้าสู่ระบบพร้อมกันเกินขีด", value: o.today.rateLimited, Icon: LogIn },
    { label: "ถูกล็อกเพราะใส่รหัสผ่านผิดหลายครั้ง", value: o.today.lockedLogins, Icon: ShieldAlert },
  ];

  return (
    <Container className="py-10">
      <PageHeader eyebrow="ผู้ดูแลระบบ" title="ลงทะเบียน & เข้าสู่ระบบ" subtitle="ควบคุมและติดตามการลงทะเบียนและการเข้าสู่ระบบ" />
      <AdminNav />
      <AccessNav />

      <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-5 shadow-soft-sm">
        <div className="flex items-center gap-3">
          <span className={cx("h-3 w-3 rounded-full", o.open ? "animate-pulse bg-success" : "bg-faint")} aria-hidden />
          <div>
            <p className="font-display text-lg font-bold text-ink">{o.open ? "เปิดรับลงทะเบียนอยู่" : "ปิดรับลงทะเบียน"}</p>
            <p className="text-sm text-muted">{o.open ? "ปิดได้ทันทีเมื่อมีปัญหาหรือลงทะเบียนครบแล้ว" : "ทุกขั้นตอนลงทะเบียนถูกปิดอยู่"}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Link href="/admin/access/rooms#generate" className={buttonStyles.primary}>
            <Sparkles aria-hidden className="h-4 w-4" />
            สร้างรหัสลงทะเบียน
          </Link>
          <SignupSwitch open={o.open} />
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 md:gap-4">
        {[
          { label: "นักเรียนลงทะเบียนแล้ว", Icon: UserPlus, ...o.students },
          { label: "ครูลงทะเบียนแล้ว", Icon: Users, ...o.teachers },
        ].map(({ label, Icon, total, registered }) => (
          <div key={label} className="rounded-2xl border border-line bg-surface p-5 shadow-soft-sm">
            <p className="flex items-center gap-2 text-sm font-bold text-muted">
              <Icon aria-hidden className="h-4 w-4 text-brand" />
              {label}
            </p>
            <p className="mt-2 text-sm text-muted">
              <b className="font-display text-3xl font-extrabold tabular-nums text-ink">{registered.toLocaleString("th-TH")}</b> / {total.toLocaleString("th-TH")}{" "}
              {total > 0 && `(${Math.round((registered / total) * 100)}%)`}
            </p>
            <div className="mt-3">
              <Bar value={registered} total={total} label={label} />
            </div>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-soft-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-ink">แต่ละห้อง</h2>
          <Link href="/admin/access/rooms" className="text-sm font-bold text-brand hover:underline">
            ตั้งเวลาและ QR
          </Link>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {o.rooms.map((r) => (
            <li key={r.classroomId}>
              <Link href={`/admin/access/rooms/${r.classroomId}`} className="block rounded-xl px-2 py-1.5 hover:bg-sunken">
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="font-bold text-ink">{r.label}</span>
                  <span className="text-xs text-muted">
                    {r.registered}/{r.total} ·{" "}
                    <span className={cx(r.status === "open" && "font-bold text-success")}>{SLOT_LABEL[r.status]}</span>
                  </span>
                </div>
                <Bar value={r.registered} total={r.total} label={`ความคืบหน้า ${r.label}`} />
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-2 border-t border-line pt-4 text-sm text-muted sm:grid-cols-3">
          <p>
            <b className="text-ink">เปิดอยู่ตอนนี้:</b>{" "}
            {openRooms.length ? openRooms.map((r) => `${r.label} ถึง ${formatTime(r.endsAt!)}`).join(", ") : "ไม่มี"}
          </p>
          <p>
            <b className="text-ink">รอบถัดไป:</b> {nextRoom ? `${nextRoom.label} · ${formatDayShort(dayKey(nextRoom.startsAt!))} ${formatTime(nextRoom.startsAt!)}` : "ไม่มี"}
          </p>
          <p>
            <b className="text-ink">ยังไม่ตั้งเวลา:</b> {unscheduled.length ? unscheduled.map((r) => r.label).join(", ") : "ครบทุกห้อง"}
          </p>
        </div>
      </section>

      <h2 className="mb-3 mt-8 font-display text-lg font-bold text-ink">วันนี้</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "ลงทะเบียนสำเร็จ", value: o.today.signups, Icon: CheckCircle2, tone: "text-success" },
          { label: "เข้าสู่ระบบสำเร็จ", value: o.today.loginsOk, Icon: LogIn, tone: "text-success" },
          { label: "เข้าสู่ระบบไม่สำเร็จ", value: o.today.loginsFailed, Icon: LogIn, tone: "text-danger" },
        ].map(({ label, value, Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-line bg-surface p-4 shadow-soft-sm">
            <p className="flex items-center gap-1.5 text-xs font-bold text-muted">
              <Icon aria-hidden className="h-3.5 w-3.5" />
              {label}
            </p>
            <p className={cx("mt-1 font-display text-3xl font-extrabold tabular-nums", tone)}>{value.toLocaleString("th-TH")}</p>
          </div>
        ))}
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft-sm">
          <p className="flex items-center gap-1.5 text-xs font-bold text-muted">
            <Mail aria-hidden className="h-3.5 w-3.5" />
            อีเมลยืนยันที่ส่ง
          </p>
          <p className="mt-1 text-sm text-muted">
            <b className="font-display text-3xl font-extrabold tabular-nums text-ink">{o.today.emailsSent}</b> / {EMAIL_LIMIT}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken">
            <div className={cx("h-full rounded-full", BAR[emailLevel])} style={{ width: `${Math.min(100, (o.today.emailsSent / EMAIL_LIMIT) * 100)}%` }} />
          </div>
        </div>
      </div>

      <h2 className="mb-3 mt-8 font-display text-lg font-bold text-ink">ควรตรวจดู (วันนี้)</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {warnings.map(({ label, value, Icon }) => (
          <li key={label}>
            <Link
              href="/admin/access/history?show=failed"
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft-sm transition-transform hover:-translate-y-0.5"
            >
              <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl", value ? "bg-brand text-white shadow-brand-glow" : "bg-sunken text-faint")}>
                <Icon aria-hidden className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-bold text-ink">{label}</span>
              <span className={cx("font-display text-2xl font-extrabold tabular-nums", value ? "text-brand" : "text-faint")}>{value}</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-xs text-faint">
        ตัวเลขเป็นของวันนี้ (เวลาไทย) ·{" "}
        <Link href="/admin/access" className="font-bold text-brand hover:underline">
          รีเฟรช
        </Link>
      </p>
    </Container>
  );
}
