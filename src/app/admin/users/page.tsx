import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { ResetPasswordButton } from "@/components/admin/ResetPasswordButton";
import { Button, Card, Container, PageHeader } from "@/components/ui";
import { PROFILE_CLASSROOM, requireProfile } from "@/lib/auth";
import { formatClassroom } from "@/lib/roster";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "ผู้ใช้" };

const ROLE_LABEL = { student: "นักเรียน", teacher: "ครู", admin: "ผู้ดูแล" } as const;

type Row = {
  id: string;
  role: keyof typeof ROLE_LABEL;
  login_id: string;
  display_name: string;
  must_change_password: boolean;
  classroom: { grade: number; room: number } | null;
};

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requireProfile({ roles: ["admin"] });
  const { q } = await searchParams;
  const query = (typeof q === "string" ? q : "").trim().slice(0, 60);

  let users: Row[] = [];
  if (query) {
    const supabase = await createClient();
    // Strip characters that have meaning in PostgREST filters.
    const safe = query.replace(/[%,()*]/g, "");
    const { data } = await supabase
      .from("profiles")
      .select(`id, role, login_id, display_name, must_change_password, ${PROFILE_CLASSROOM}`)
      .or(`login_id.ilike.%${safe}%,display_name.ilike.%${safe}%`)
      .order("login_id")
      .limit(25);
    users = (data ?? []) as unknown as Row[];
  }

  return (
    <Container className="py-10">
      <PageHeader eyebrow="ผู้ดูแลระบบ" title="ผู้ใช้" subtitle="ค้นหาด้วยเลขประจำตัว ชื่อผู้ใช้ หรือชื่อ เพื่อรีเซ็ตรหัสผ่าน" />
      <AdminNav />
      <form className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="12345 หรือ มีนา"
          aria-label="ค้นหาผู้ใช้"
          className="h-11 w-full max-w-sm rounded-xl border border-line bg-surface px-3.5 text-sm transition-colors hover:border-line-strong focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
        />
        <Button type="submit">ค้นหา</Button>
      </form>

      {query && (
        <Card className="p-0 sm:p-0">
          {users.length === 0 ? (
            <p className="p-5 text-sm text-muted">ไม่พบผู้ใช้ที่ตรงกับ “{query}”</p>
          ) : (
            <ul className="divide-y divide-line">
              {users.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="font-medium text-ink">{u.display_name}</div>
                    <div className="text-xs text-muted">
                      {u.login_id} · {ROLE_LABEL[u.role]}
                      {u.classroom && ` · ${formatClassroom(u.classroom)}`}
                      {u.must_change_password && " · ยังไม่ได้ตั้งรหัสผ่านใหม่"}
                    </div>
                  </div>
                  <ResetPasswordButton userId={u.id} name={u.display_name} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </Container>
  );
}
