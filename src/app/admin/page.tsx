import type { Metadata } from "next";
import Link from "next/link";
import { FileUp, FileText, LogIn, Presentation, Upload, Users, UserSearch } from "lucide-react";
import { Card, Container, PageHeader, buttonStyles } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "คอนโซลผู้พัฒนา" };

const fmt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

export default async function AdminPage() {
  await requireProfile({ roles: ["admin"] });
  const supabase = await createClient();

  const head = { count: "exact" as const, head: true };
  const [students, teachers, posts, files, logins] = await Promise.all([
    supabase.from("profiles").select("*", head).eq("role", "student"),
    supabase.from("profiles").select("*", head).in("role", ["teacher", "admin"]),
    supabase.from("posts").select("*", head),
    supabase.from("attachments").select("*", head).eq("kind", "file"),
    supabase.from("login_events").select("id, login_id, success, created_at").order("created_at", { ascending: false }).limit(10),
  ]);

  const stats = [
    { label: "นักเรียน", value: students.count ?? 0, Icon: Users },
    { label: "ครูและผู้ดูแล", value: teachers.count ?? 0, Icon: Presentation },
    { label: "โพสต์ทั้งหมด", value: posts.count ?? 0, Icon: FileText },
    { label: "ไฟล์ที่อัปโหลด", value: files.count ?? 0, Icon: FileUp },
  ];

  return (
    <Container className="py-10">
      <PageHeader eyebrow="ผู้ดูแลระบบ" title="คอนโซลผู้พัฒนา" subtitle="ภาพรวมการใช้งานของระบบ">
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/roster" className={buttonStyles.primary}>
            <Upload aria-hidden className="h-4 w-4" />
            นำเข้ารายชื่อ
          </Link>
          <Link href="/admin/users" className={buttonStyles.secondary}>
            <UserSearch aria-hidden className="h-4 w-4" />
            ผู้ใช้
          </Link>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {stats.map(({ label, value, Icon }) => (
          <div
            key={label}
            className="group rounded-2xl border border-line bg-surface p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-brand-glow-lg"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-muted">{label}</span>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                <Icon aria-hidden className="h-4 w-4" strokeWidth={2.4} />
              </span>
            </div>
            <div className="mt-3 font-display text-4xl font-extrabold tabular-nums text-ink">{value.toLocaleString("th-TH")}</div>
          </div>
        ))}
      </div>

      <Card bold className="mt-6 overflow-hidden p-0 sm:p-0">
        <h2 className="flex items-center gap-2 border-b border-line bg-sunken px-5 py-4 font-display text-lg font-bold text-ink sm:px-7">
          <LogIn aria-hidden className="h-5 w-5 text-brand" />
          การเข้าสู่ระบบล่าสุด
        </h2>
        {(logins.data ?? []).length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted sm:px-7">ยังไม่มีการเข้าสู่ระบบ</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {logins.data!.map((l) => (
              <li key={l.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3 sm:grid-cols-[1fr_auto_auto] sm:px-7">
                <span className="font-mono text-xs text-ink">{l.login_id}</span>
                <span
                  className={`justify-self-end rounded-full px-2.5 py-0.5 text-xs font-semibold sm:justify-self-auto ${
                    l.success ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                  }`}
                >
                  {l.success ? "สำเร็จ" : "ไม่สำเร็จ"}
                </span>
                <span className="col-span-2 text-xs text-muted sm:col-span-1 sm:text-sm">{fmt.format(new Date(l.created_at))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Container>
  );
}
