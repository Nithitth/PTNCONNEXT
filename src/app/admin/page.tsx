import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, FileText, FileUp, LogIn, MessageSquareText, Presentation, Users } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, Container, PageHeader, cx } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatDateTime, hoursAgo } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "คอนโซลผู้พัฒนา" };

export default async function AdminPage() {
  await requireProfile({ roles: ["admin"] });
  const supabase = await createClient();

  const head = { count: "exact" as const, head: true };
  const [students, teachers, posts, files, newFeedback, errors24, failed24, latestFeedback] = await Promise.all([
    supabase.from("profiles").select("*", head).eq("role", "student"),
    supabase.from("profiles").select("*", head).in("role", ["teacher", "admin"]),
    supabase.from("posts").select("*", head),
    supabase.from("attachments").select("*", head).eq("kind", "file"),
    supabase.from("feedback").select("*", head).gte("created_at", hoursAgo(24 * 7)),
    supabase.from("error_logs").select("*", head).gte("created_at", hoursAgo(24)),
    supabase.from("login_events").select("*", head).eq("success", false).gte("created_at", hoursAgo(24)),
    supabase.from("feedback").select("id, message, created_at").order("created_at", { ascending: false }).limit(3),
  ]);

  const stats = [
    { label: "นักเรียน", value: students.count ?? 0, Icon: Users },
    { label: "ครูและผู้ดูแล", value: teachers.count ?? 0, Icon: Presentation },
    { label: "โพสต์ทั้งหมด", value: posts.count ?? 0, Icon: FileText },
    { label: "ไฟล์ที่อัปโหลด", value: files.count ?? 0, Icon: FileUp },
  ];

  // Things worth a look. Each turns red when its number isn't zero.
  const watch = [
    { href: "/admin/feedback", label: "ความคิดเห็นใหม่", hint: "7 วันที่ผ่านมา", value: newFeedback.count ?? 0, Icon: MessageSquareText },
    { href: "/admin/errors", label: "ข้อผิดพลาดของระบบ", hint: "24 ชั่วโมงที่ผ่านมา", value: errors24.count ?? 0, Icon: AlertTriangle },
    { href: "/admin/logins", label: "เข้าสู่ระบบไม่สำเร็จ", hint: "24 ชั่วโมงที่ผ่านมา", value: failed24.count ?? 0, Icon: LogIn },
  ];

  return (
    <Container className="py-10">
      <PageHeader eyebrow="ผู้ดูแลระบบ" title="คอนโซลผู้พัฒนา" subtitle="ภาพรวมการใช้งานของระบบ" />
      <AdminNav />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {stats.map(({ label, value, Icon }) => (
          <div key={label} className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-muted">{label}</span>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand">
                <Icon aria-hidden className="h-4 w-4" strokeWidth={2.4} />
              </span>
            </div>
            <div className="mt-3 font-display text-4xl font-extrabold tabular-nums text-ink">{value.toLocaleString("th-TH")}</div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-8 font-display text-lg font-bold text-ink">ควรตรวจดู</h2>
      <div className="grid gap-3 md:grid-cols-3 md:gap-4">
        {watch.map(({ href, label, hint, value, Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 shadow-soft-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft"
          >
            <span
              className={cx(
                "grid h-12 w-12 shrink-0 place-items-center rounded-xl",
                value ? "bg-brand text-white shadow-brand-glow" : "bg-sunken text-faint",
              )}
            >
              <Icon aria-hidden className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-ink">{label}</span>
              <span className="block text-xs text-muted">{hint}</span>
            </span>
            <span className={cx("font-display text-3xl font-extrabold tabular-nums", value ? "text-brand" : "text-faint")}>
              {value.toLocaleString("th-TH")}
            </span>
            <ArrowRight aria-hidden className="h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
          </Link>
        ))}
      </div>

      <Card bold className="mt-8 overflow-hidden p-0 sm:p-0">
        <h2 className="flex items-center justify-between gap-2 border-b border-line bg-sunken px-5 py-4 sm:px-7">
          <span className="flex items-center gap-2 font-display text-lg font-bold text-ink">
            <MessageSquareText aria-hidden className="h-5 w-5 text-brand" />
            ความคิดเห็นล่าสุด
          </span>
          <Link href="/admin/feedback" className="text-sm font-bold text-brand hover:underline">
            ดูทั้งหมด
          </Link>
        </h2>
        {(latestFeedback.data ?? []).length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted sm:px-7">ยังไม่มีความคิดเห็น</p>
        ) : (
          <ul className="divide-y divide-line">
            {latestFeedback.data!.map((f) => (
              <li key={f.id} className="px-5 py-3.5 sm:px-7">
                <p className="line-clamp-2 text-sm text-ink">{f.message}</p>
                <p className="mt-1 text-xs text-muted">{formatDateTime(f.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Container>
  );
}
