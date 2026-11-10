import type { Metadata } from "next";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container, EmptyState, Notice, PageHeader, cx } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatDateTime, hoursAgo } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "การเข้าสู่ระบบ" };

const LIMIT = 300;
/** This many failed tries on one ID within 24 hours gets flagged. */
const SUSPICIOUS = 5;

type Row = { id: number; login_id: string; success: boolean; created_at: string; user: { display_name: string } | null };

/** Login report: who logged in and when, plus failed tries. */
export default async function LoginReportPage({ searchParams }: PageProps<"/admin/logins">) {
  await requireProfile({ roles: ["admin"] });
  const onlyFailed = (await searchParams).show === "failed";
  const supabase = await createClient();

  const since24h = hoursAgo(24);
  let list = supabase
    .from("login_events")
    .select("id, login_id, success, created_at, user:profiles(display_name)")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (onlyFailed) list = list.eq("success", false);

  const [rows, today] = await Promise.all([
    list,
    supabase.from("login_events").select("login_id, success").gte("created_at", since24h).limit(5000),
  ]);
  if (rows.error) throw rows.error;

  const last24 = today.data ?? [];
  const ok24 = last24.filter((r) => r.success).length;
  const failCount = new Map<string, number>();
  for (const r of last24) if (!r.success) failCount.set(r.login_id, (failCount.get(r.login_id) ?? 0) + 1);
  const flagged = [...failCount].filter(([, n]) => n >= SUSPICIOUS).sort((a, b) => b[1] - a[1]);
  const events = (rows.data ?? []) as unknown as Row[];

  return (
    <Container className="py-10">
      <PageHeader eyebrow="ผู้ดูแลระบบ" title="การเข้าสู่ระบบ" subtitle={`แสดงล่าสุด ${LIMIT} ครั้ง`} />
      <AdminNav />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft-sm">
          <p className="text-xs font-bold text-muted">สำเร็จ (24 ชม.)</p>
          <p className="mt-1 font-display text-3xl font-extrabold tabular-nums text-success">{ok24.toLocaleString("th-TH")}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft-sm">
          <p className="text-xs font-bold text-muted">ไม่สำเร็จ (24 ชม.)</p>
          <p className="mt-1 font-display text-3xl font-extrabold tabular-nums text-danger">
            {(last24.length - ok24).toLocaleString("th-TH")}
          </p>
        </div>
      </div>

      {flagged.length > 0 && (
        <div className="mb-5">
          <Notice tone="warning">
            <b className="font-bold">รหัสผ่านผิดหลายครั้งใน 24 ชม.:</b>{" "}
            {flagged.map(([id, n]) => `${id} (${n} ครั้ง)`).join(", ")} — อาจลืมรหัสผ่าน (รีเซ็ตได้ที่แท็บ “ผู้ใช้”) หรือมีคนพยายามเดารหัส
          </Notice>
        </div>
      )}

      <div className="mb-3 flex gap-1 rounded-xl border border-line bg-sunken p-1 sm:inline-flex">
        {[
          { href: "/admin/logins", label: "ทั้งหมด", on: !onlyFailed },
          { href: "/admin/logins?show=failed", label: "เฉพาะไม่สำเร็จ", on: onlyFailed },
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

      {events.length === 0 ? (
        <EmptyState
          icon={<LogIn aria-hidden className="h-6 w-6" />}
          title={onlyFailed ? "ไม่มีการเข้าสู่ระบบที่ไม่สำเร็จ" : "ยังไม่มีการเข้าสู่ระบบ"}
          body="ทุกครั้งที่มีคนเข้าสู่ระบบ ไม่ว่าสำเร็จหรือไม่ จะถูกบันทึกไว้ที่นี่"
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft-sm">
          <ul className="divide-y divide-line text-sm">
            {events.map((l) => (
              <li
                key={l.id}
                className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_11rem] sm:px-5"
              >
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
                  {l.success ? "สำเร็จ" : "ไม่สำเร็จ"}
                </span>
                <span className="col-span-2 text-xs text-muted sm:col-span-1 sm:text-right">{formatDateTime(l.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Container>
  );
}
