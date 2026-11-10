import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Lightbulb, ListChecks } from "lucide-react";
import { KIND_STYLE } from "@/components/teacher/kindStyle";
import { PostForm } from "@/components/teacher/PostForm";
import { MyPosts } from "@/components/teacher/MyPosts";
import { Card, Container, Notice, PageHeader, cx } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import type { PostKind } from "@/lib/postForm";
import { loadManagedPosts } from "@/lib/posts";
import { createClient } from "@/lib/supabase/server";
import { loadCurrentRooms, loadTeachingOptions } from "@/lib/teaching";

export const metadata: Metadata = { title: "คอนโซลครู" };

type TabId = "assign" | "material" | "exam" | "event" | "mine";

const TABS: { id: TabId; kind?: PostKind; label: string; Icon: typeof BookOpen; adminOnly?: boolean }[] = [
  { id: "assign", kind: "assignment", label: "มอบหมายงาน", Icon: KIND_STYLE.assignment.Icon },
  { id: "material", kind: "material", label: "แชร์เอกสาร", Icon: KIND_STYLE.material.Icon },
  { id: "exam", kind: "exam", label: "ประกาศวันสอบ", Icon: KIND_STYLE.exam.Icon },
  { id: "event", kind: "event", label: "กิจกรรมโรงเรียน", Icon: KIND_STYLE.event.Icon, adminOnly: true },
  { id: "mine", label: "งานของฉัน", Icon: ListChecks },
];

const TIPS: Record<PostKind, string[]> = {
  assignment: [
    "เลือกได้ทีละห้อง หรือกด “เลือกทั้ง 8 ห้อง” แล้วกำหนดส่งแต่ละห้องต่างกันได้",
    "จุดของงานในปฏิทินนักเรียนจะกะพริบเมื่อเหลือเวลาไม่ถึง 24 ชั่วโมง",
    "แนบได้ 1 อย่าง: ไฟล์ PDF ไม่เกิน 10 MB หรือลิงก์ Google Drive / Slides / Canva",
  ],
  material: [
    "เอกสารจะอยู่ในรายการ “เอกสารและสื่อการสอน” ข้างปฏิทินของนักเรียน",
    "ใส่ลำดับเนื้อหา (เช่น เลขบท) เพื่อให้นักเรียนเรียงตามลำดับที่สอนได้",
    "ไฟล์ใหญ่หรือไม่ใช่ PDF ให้แชร์เป็นลิงก์แทน",
  ],
  exam: [
    "สอบเก็บคะแนน / สอบย่อย: วันสอบสีเหลืองอำพันเข้ม และไฮไลต์สีอ่อน 3 วันก่อนสอบ",
    "สอบกลางภาค / ปลายภาค: วันสอบสีแดงเข้ม และไฮไลต์สีแดงอ่อน 5 วันก่อนสอบ",
    "แต่ละห้องสอบคนละวันได้",
  ],
  event: [
    "กิจกรรมจะแสดงเป็นสีเหลืองอำพันอ่อนลายเส้นทแยงในปฏิทิน",
    "เลือก “ทั้งโรงเรียน” เพื่อให้ทุกคนเห็น หรือเลือกเฉพาะบางห้อง",
  ],
};

const SAVED: Record<string, string> = {
  assignment: "มอบหมายงานแล้ว นักเรียนจะเห็นในปฏิทินทันที",
  material: "แชร์เอกสารแล้ว",
  exam: "ประกาศวันสอบแล้ว",
  event: "สร้างกิจกรรมแล้ว",
  edit: "บันทึกการแก้ไขแล้ว",
};

export default async function TeacherConsolePage({ searchParams }: PageProps<"/teacher">) {
  const profile = await requireProfile({ roles: ["teacher", "admin"] });
  const isAdmin = profile.role === "admin";
  const params = await searchParams;
  const tabs = TABS.filter((t) => !t.adminOnly || isAdmin).map((t) =>
    t.id === "mine" && isAdmin ? { ...t, label: "โพสต์ทั้งหมด" } : t,
  );
  const tab = tabs.find((t) => t.id === params.tab) ?? tabs[0];
  const saved = typeof params.saved === "string" ? SAVED[params.saved] : undefined;

  const supabase = await createClient();
  const [subjects, rooms, myPosts] = await Promise.all([
    tab.kind ? loadTeachingOptions(supabase, profile) : Promise.resolve([]),
    tab.kind ? loadCurrentRooms(supabase) : Promise.resolve([]),
    tab.id === "mine" ? loadManagedPosts(supabase, profile) : Promise.resolve([]),
  ]);

  return (
    <Container className="py-10">
      <PageHeader eyebrow={profile.display_name} title="คอนโซลครู" subtitle="มอบหมายงาน แชร์เอกสาร และประกาศวันสอบ" />

      <nav
        aria-label="เมนูคอนโซลครู"
        className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <ul className="inline-flex min-w-full gap-1 rounded-2xl border border-line bg-surface p-1.5 shadow-soft-sm sm:min-w-0">
          {tabs.map(({ id, label, Icon }) => {
            const on = id === tab.id;
            return (
              <li key={id} className="shrink-0">
                <Link
                  href={`/teacher?tab=${id}`}
                  aria-current={on ? "page" : undefined}
                  className={cx(
                    "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold whitespace-nowrap transition-all duration-150",
                    on ? "bg-brand text-white shadow-brand-glow" : "text-muted hover:bg-brand-soft hover:text-brand",
                  )}
                >
                  <Icon aria-hidden className="h-4 w-4" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {saved && (
        <div className="mb-5">
          <Notice tone="success">{saved}</Notice>
        </div>
      )}

      {!tab.kind ? (
        <MyPosts posts={myPosts} meId={profile.id} isAdmin={isAdmin} />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[1.65fr_1fr]">
          <Card bold className="animate-rise">
            <h2 className="mb-6 flex items-center gap-2.5 font-display text-xl font-bold text-ink">
              <span className="bg-brand-gradient grid h-9 w-9 place-items-center rounded-xl text-white shadow-brand-glow">
                <tab.Icon aria-hidden className="h-4.5 w-4.5" />
              </span>
              {tab.label}
            </h2>
            <PostForm
              key={tab.id}
              kind={tab.kind}
              userId={profile.id}
              subjects={subjects}
              rooms={rooms}
              allowSchoolWide={isAdmin && tab.kind === "event"}
            />
          </Card>

          <aside className="space-y-5">
            <Card className="animate-rise delay-1">
              <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
                <BookOpen aria-hidden className="h-5 w-5 text-brand" />
                {isAdmin ? "วิชาในระบบ" : "วิชาที่คุณสอน"}
              </h2>
              {subjects.length === 0 ? (
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  ยังไม่มีข้อมูล ผู้ดูแลระบบจะนำเข้าจากรายชื่อครูของโรงเรียน
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-line text-sm">
                  {subjects.map((s) => (
                    <li key={s.id} className="py-2.5">
                      <span className="flex min-w-0 items-center gap-2.5 text-ink">
                        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                        <span className="truncate font-bold">{s.name}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <div className="animate-rise delay-2 rounded-2xl border border-line bg-sunken p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
                <Lightbulb aria-hidden className="h-4 w-4 text-brand" />
                เคล็ดลับ
              </h2>
              <ul className="mt-2.5 space-y-2 text-sm leading-relaxed text-muted">
                {TIPS[tab.kind].map((t) => (
                  <li key={t} className="flex gap-2">
                    <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      )}
    </Container>
  );
}
