import type { Metadata } from "next";
import Link from "next/link";
import { LogIn, PenLine, ScrollText, ShieldAlert, UserCog, UserPlus } from "lucide-react";
import { UnlockButton } from "@/components/admin/AccessControls";
import { AdminBack } from "@/components/admin/AdminBack";
import { AdminSection } from "@/components/admin/AdminMenu";
import { PostHistoryList } from "@/components/admin/PostHistoryList";
import { Container, EmptyState, Notice, PageHeader, cx } from "@/components/ui";
import { loadPostHistory } from "@/lib/activityData";
import { ACCOUNT_ACTIONS, actionLabel } from "@/lib/auditLabels";
import { requireProfile } from "@/lib/auth";
import { formatDateTime, hoursAgo } from "@/lib/calendar";
import { countedFailures, LOCK_MINUTES, type LockEvent } from "@/lib/signup";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "ประวัติ · ลงทะเบียน & เข้าสู่ระบบ" };

const LIMIT = 300;
/** This many failed tries on one ID within 24 hours gets flagged. */
const SUSPICIOUS = 5;

type Row = {
  id: number;
  login_id: string;
  success: boolean;
  reason: string | null;
  created_at: string;
  user: { display_name: string } | null;
};
type AuditRow = {
  id: number;
  action: string;
  target: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
  actor: { display_name: string } | null;
};

/** Why a log-in failed (login/actions.ts, mfa/actions.ts). */
const REASON: Record<string, string> = {
  "wrong-password": "รหัสผ่านผิด",
  "wrong-tab": "เลือกแท็บผิด",
  "no-profile": "ยังไม่ได้ลงทะเบียน",
  locked: "ถูกล็อก",
  "mfa-wrong": "รหัสสองขั้นตอนผิด",
  "two-step": "ผ่านสองขั้นตอน",
};

type SignupRow = {
  id: number;
  kind: string;
  outcome: "ok" | "fail" | "info";
  detail: string | null;
  created_at: string;
  classroom: { grade: number; room: number } | null;
  registration: {
    prefix: string;
    first_name: string;
    last_name: string;
  } | null;
};

/** Thai names for sign-up event kinds (signup/actions.ts and admin/access/actions.ts). */
const KIND: Record<string, string> = {
  room_code: "รหัสห้อง",
  personal_code: "รหัสส่วนตัวนักเรียน",
  name: "ค้นหาชื่อ",
  teacher_code: "รหัสครู",
  email_sent: "ส่งอีเมลยืนยัน",
  email_verify: "ยืนยันอีเมล",
  registered: "ลงทะเบียนสำเร็จ",
  admin_slot: "ตั้งเวลาห้อง",
  admin_qr: "สร้าง QR ใหม่",
  admin_code: "สร้างรหัสส่วนตัว",
  admin_release: "ยกเลิกการลงทะเบียน",
  admin_switch: "สวิตช์ลงทะเบียน",
};
const OUTCOME = {
  ok: { text: "สำเร็จ", tone: "bg-success-soft text-success" },
  fail: { text: "ไม่สำเร็จ", tone: "bg-danger-soft text-danger" },
  info: { text: "บันทึก", tone: "bg-sunken text-muted" },
} as const;

/** ประวัติ: every sign-up step and admin action, then every log-in, newest first. */
export default async function AccessHistoryPage({ searchParams }: PageProps<"/admin/access/history">) {
  await requireProfile({ roles: ["admin"] });
  const onlyFailed = (await searchParams).show === "failed";
  const supabase = await createClient();

  const since24h = hoursAgo(24);
  let list = supabase
    .from("login_events")
    .select("id, login_id, success, reason, created_at, user:profiles(display_name)")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (onlyFailed) list = list.eq("success", false);

  let signupList = createAdminClient()
    .from("signup_events")
    .select("id, kind, outcome, detail, created_at, classroom:classrooms(grade, room), registration:registrations(prefix, first_name, last_name)")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (onlyFailed) signupList = signupList.eq("outcome", "fail");

  const db = createAdminClient();
  const sinceLock = hoursAgo(LOCK_MINUTES / 60);
  const [rows, today, signups, recent, unlocks, audit, postHistory] = await Promise.all([
    list,
    supabase.from("login_events").select("login_id, success, reason").gte("created_at", since24h).limit(5000),
    signupList,
    db
      .from("login_events")
      .select("login_id, identifier, success, reason, created_at")
      .not("identifier", "is", null)
      .gte("created_at", sinceLock)
      .order("created_at", { ascending: false })
      .limit(2000),
    db.from("login_unlocks").select("identifier, created_at").gte("created_at", sinceLock),
    db.from("audit_events").select("id, action, target, detail, created_at, actor:profiles(display_name)").order("created_at", { ascending: false }).limit(300),
    loadPostHistory(100),
  ]);
  const auditRows = (audit.data ?? []) as unknown as AuditRow[];
  const adminRows = auditRows.filter((r) => !ACCOUNT_ACTIONS.has(r.action));
  const accountRows = auditRows.filter((r) => ACCOUNT_ACTIONS.has(r.action));

  // Locked (or about to be) right now: 5+ wrong tries in the lock window since the last success/unlock.
  const byKey = new Map<string, { loginId: string; events: LockEvent[] }>();
  for (const e of recent.data ?? []) {
    const k = e.identifier as string;
    const entry = byKey.get(k) ?? { loginId: e.login_id as string, events: [] };
    entry.events.push(e as LockEvent);
    byKey.set(k, entry);
  }
  const lastUnlock = new Map<string, string>();
  for (const u of unlocks.data ?? []) if ((lastUnlock.get(u.identifier) ?? "") < u.created_at) lastUnlock.set(u.identifier, u.created_at);
  const locked = [...byKey]
    .map(([key, v]) => ({
      key,
      loginId: v.loginId,
      n: countedFailures(v.events, lastUnlock.get(key) ?? null),
    }))
    .filter((l) => l.n >= 5)
    .sort((a, b) => b.n - a.n);
  const signupEvents = (signups.data ?? []) as unknown as SignupRow[];
  if (rows.error) throw rows.error;

  const last24 = today.data ?? [];
  const ok24 = last24.filter((r) => r.success).length;
  const failCount = new Map<string, number>();
  // Only wrong passwords (older rows have no reason); locked/wrong-tab tries are not guesses.
  for (const r of last24)
    if (!r.success && (r.reason ?? "wrong-password") === "wrong-password") failCount.set(r.login_id, (failCount.get(r.login_id) ?? 0) + 1);
  const flagged = [...failCount].filter(([, n]) => n >= SUSPICIOUS).sort((a, b) => b[1] - a[1]);
  const events = (rows.data ?? []) as unknown as Row[];

  return (
    <Container className="py-10">
      <AdminBack />
      <PageHeader eyebrow="ผู้ดูแลระบบ" title="ประวัติ" subtitle={`ประวัติล่าสุด อย่างละ ${LIMIT} รายการ`}>
        <div className="flex gap-2 text-sm" aria-label="การเข้าสู่ระบบใน 24 ชั่วโมง">
          <span className="rounded-full bg-success-soft px-3 py-1 font-bold text-success">สำเร็จ {ok24.toLocaleString("th-TH")} (24 ชม.)</span>
          <span className="rounded-full bg-danger-soft px-3 py-1 font-bold text-danger">ไม่สำเร็จ {(last24.length - ok24).toLocaleString("th-TH")} (24 ชม.)</span>
        </div>
      </PageHeader>

      {flagged.length > 0 && (
        <div className="mb-4">
          <Notice tone="warning">
            <b className="font-bold">รหัสผ่านผิดหลายครั้งใน 24 ชม.:</b> {flagged.map(([id, n]) => `${id} (${n} ครั้ง)`).join(", ")} — อาจลืมรหัสผ่าน (รีเซ็ตได้ที่หน้า “ผู้ใช้”)
            หรือมีคนพยายามเดารหัส
          </Notice>
        </div>
      )}

      {locked.length > 0 && (
        <AdminSection title={`ล็อกอยู่ตอนนี้ (${LOCK_MINUTES} นาทีล่าสุด)`} icon={ShieldAlert} tone="danger" count={locked.length} open>
          <ul className="-mx-4 -mt-4 divide-y divide-line text-sm sm:-mx-5">
            {locked.map((l) => (
              <li key={l.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <span>
                  <span className="font-mono text-xs text-ink">{l.loginId === "unknown-account" ? "ไม่พบบัญชี (อาจมีคนเดา)" : l.loginId}</span>
                  <span className="ml-2 text-muted">ผิด {l.n} ครั้ง</span>
                </span>
                <UnlockButton identifier={l.key} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">นักเรียนที่ใช้เลขประจำตัวถูกล็อกเมื่อผิด 10 ครั้ง อีเมล เบอร์โทร และบัญชีครู 5 ครั้ง ปลดล็อกเองหลัง {LOCK_MINUTES} นาที</p>
        </AdminSection>
      )}

      <div className="mb-4 flex gap-1 rounded-xl border border-line bg-sunken p-1 sm:inline-flex">
        {[
          { href: "/admin/access/history", label: "ทั้งหมด", on: !onlyFailed },
          {
            href: "/admin/access/history?show=failed",
            label: "เฉพาะไม่สำเร็จ",
            on: onlyFailed,
          },
        ].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.on ? "page" : undefined}
            className={cx(
              "flex-1 whitespace-nowrap rounded-lg px-4 py-1.5 text-center text-sm font-bold transition-all duration-150",
              t.on ? "bg-surface text-brand shadow-soft-sm" : "text-muted hover:text-brand",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <AdminSection title="การลงทะเบียน" icon={UserPlus} count={signupEvents.length} open>
        {signupEvents.length === 0 ? (
          <p className="text-sm text-muted">ยังไม่มีรายการ</p>
        ) : (
          <div className="-mx-4 -my-4 sm:-mx-5">
            <ul className="divide-y divide-line text-sm">
              {signupEvents.map((e) => (
                <li key={e.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_11rem] sm:px-5">
                  <span className="min-w-0">
                    <span className="font-bold text-ink">{KIND[e.kind] ?? e.kind}</span>
                    {e.classroom && (
                      <span className="ml-2 text-muted">
                        ม.{e.classroom.grade}/{e.classroom.room}
                      </span>
                    )}
                    {e.registration && (
                      <span className="ml-2 text-muted">
                        {e.registration.prefix}
                        {e.registration.first_name} {e.registration.last_name}
                      </span>
                    )}
                    {e.detail && <span className="block truncate text-xs text-muted">{e.detail}</span>}
                  </span>
                  <span className={cx("justify-self-end rounded-full px-2.5 py-0.5 text-xs font-bold", OUTCOME[e.outcome].tone)}>
                    {OUTCOME[e.outcome].text}
                  </span>
                  <span className="col-span-2 text-xs text-muted sm:col-span-1 sm:text-right">{formatDateTime(e.created_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </AdminSection>

      <AdminSection title="การกระทำของผู้ดูแล" icon={ScrollText} count={adminRows.length}>
        <AuditList rows={adminRows} />
      </AdminSection>

      <AdminSection title="การกระทำในบัญชีผู้ใช้" icon={UserCog} count={accountRows.length}>
        <AuditList rows={accountRows} />
      </AdminSection>

      <AdminSection title="ประวัติโพสต์ (สร้าง แก้ไข ลบ)" icon={PenLine} count={postHistory.length}>
        <PostHistoryList rows={postHistory} />
      </AdminSection>

      {/* Opens by itself when coming from "เข้าสู่ระบบไม่สำเร็จ" (?show=failed). */}
      <AdminSection title="การเข้าสู่ระบบ" icon={LogIn} count={events.length} open={onlyFailed}>
        {events.length === 0 ? (
          <EmptyState
            icon={<LogIn aria-hidden className="h-6 w-6" />}
            title={onlyFailed ? "ไม่มีการเข้าสู่ระบบที่ไม่สำเร็จ" : "ยังไม่มีการเข้าสู่ระบบ"}
            body="ทุกครั้งที่มีคนเข้าสู่ระบบ ไม่ว่าสำเร็จหรือไม่ จะถูกบันทึกไว้ที่นี่"
          />
        ) : (
          <div className="-mx-4 -my-4 sm:-mx-5">
            <ul className="divide-y divide-line text-sm">
              {events.map((l) => (
                <li key={l.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_11rem] sm:px-5">
                  <span className="min-w-0 truncate">
                    <span className="font-mono text-xs text-ink">{l.login_id}</span>
                    {l.user && <span className="ml-2 text-muted">{l.user.display_name}</span>}
                  </span>
                  <span
                    className={cx(
                      "justify-self-end rounded-full px-2.5 py-0.5 text-xs font-bold",
                      l.success ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
                    )}
                  >
                    {l.success ? (l.reason ? (REASON[l.reason] ?? "สำเร็จ") : "สำเร็จ") : l.reason ? (REASON[l.reason] ?? "ไม่สำเร็จ") : "ไม่สำเร็จ"}
                  </span>
                  <span className="col-span-2 text-xs text-muted sm:col-span-1 sm:text-right">{formatDateTime(l.created_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </AdminSection>
    </Container>
  );
}

/** Audit rows: what, on what, by whom, when. */
function AuditList({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted">ยังไม่มีรายการ</p>;
  return (
    <div className="-mx-4 -my-4 sm:-mx-5">
      <ul className="divide-y divide-line text-sm">
        {rows.map((a) => (
          <li key={a.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_11rem] sm:px-5">
            <span className="min-w-0">
              <span className="font-bold text-ink">{actionLabel(a.action)}</span>
              {a.target && <span className="ml-1.5 text-ink">{a.target}</span>}
              <span className="ml-2 text-muted">โดย {a.actor?.display_name ?? "—"}</span>
              {a.detail && (
                <span className="block truncate text-xs text-muted">
                  {Object.entries(a.detail)
                    .map(([k, v]) => `${k}: ${String(v)}`)
                    .join(" · ")}
                </span>
              )}
            </span>
            <span className="text-xs text-muted sm:text-right">{formatDateTime(a.created_at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
