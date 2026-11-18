import type { Metadata } from "next";
import { Search } from "lucide-react";
import { SignupSwitch } from "@/components/admin/AccessControls";
import { AdminAlerts, AdminMenu } from "@/components/admin/AdminMenu";
import { Container, PageHeader, buttonStyles, cx, inputStyles } from "@/components/ui";
import { loadOverview } from "@/lib/accessData";
import { alertItems, buildMenu, type MenuCounts } from "@/lib/adminMenu";
import { requireProfile } from "@/lib/auth";
import { hoursAgo } from "@/lib/calendar";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "คอนโซลผู้พัฒนา" };

/** The Developer Console's front page: a people search, the sign-up switch, what needs a look, and the box menu. */
export default async function AdminPage() {
  await requireProfile({ roles: ["admin"] });
  const supabase = await createClient();

  const head = { count: "exact" as const, head: true };
  const [students, staff, posts, files, newFeedback, errors24, failed24, waiting, overview] = await Promise.all([
    supabase.from("profiles").select("*", head).eq("role", "student"),
    supabase.from("profiles").select("*", head).in("role", ["teacher", "admin"]),
    supabase.from("posts").select("*", head),
    supabase.from("attachments").select("*", head).eq("kind", "file"),
    supabase
      .from("feedback")
      .select("*", head)
      .gte("created_at", hoursAgo(24 * 7)),
    supabase.from("error_logs").select("*", head).gte("created_at", hoursAgo(24)),
    supabase.from("login_events").select("*", head).eq("success", false).gte("created_at", hoursAgo(24)),
    createAdminClient().from("tcas_roadmap_templates").select("*", head).eq("approved", false),
    loadOverview(),
  ]);

  const counts: MenuCounts = {
    students: students.count ?? 0,
    staff: staff.count ?? 0,
    studentsRegistered: overview.students.registered,
    studentsTotal: overview.students.total,
    teachersRegistered: overview.teachers.registered,
    teachersTotal: overview.teachers.total,
    openRooms: overview.rooms.filter((r) => r.status === "open").length,
    signupsToday: overview.today.signups,
    templatesWaiting: waiting.count ?? 0,
    posts: posts.count ?? 0,
    files: files.count ?? 0,
    newFeedback: newFeedback.count ?? 0,
    errors24: errors24.count ?? 0,
    failedLogins24: failed24.count ?? 0,
    lockedToday: overview.today.lockedLogins,
  };

  return (
    <Container className="py-10">
      <PageHeader eyebrow="ผู้ดูแลระบบ" title="คอนโซลผู้พัฒนา" subtitle="เลือกส่วนที่ต้องการจัดการ" />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-stretch">
        <form action="/admin/users" role="search" className="flex min-w-0 flex-1 items-center gap-2">
          <label htmlFor="admin-search" className="sr-only">
            ค้นหาผู้ใช้
          </label>
          <input
            id="admin-search"
            name="q"
            type="search"
            maxLength={60}
            placeholder="ค้นหาผู้ใช้: ชื่อ เลขประจำตัว หรืออีเมล"
            className={cx(inputStyles, "h-11 min-w-0 flex-1 shadow-soft-sm")}
          />
          <button type="submit" className={buttonStyles.primary}>
            <Search aria-hidden className="h-4 w-4" />
            <span className="hidden sm:inline">ค้นหา</span>
          </button>
        </form>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2 shadow-soft-sm">
          <span className="flex items-center gap-2 text-sm font-bold text-ink">
            <span aria-hidden className={cx("h-2.5 w-2.5 rounded-full", overview.open ? "animate-pulse bg-success" : "bg-faint")} />
            {overview.open ? "เปิดรับลงทะเบียน" : "ปิดรับลงทะเบียน"}
          </span>
          <SignupSwitch open={overview.open} />
        </div>
      </div>

      <AdminAlerts items={alertItems(counts)} checkedAt={new Date().toISOString()} />
      <AdminMenu groups={buildMenu(counts)} />
    </Container>
  );
}
