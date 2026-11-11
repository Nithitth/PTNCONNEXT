import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, GraduationCap, Search, Star } from "lucide-react";
import { CompareTray } from "@/components/tcas/CompareTray";
import { FacultyMenu } from "@/components/tcas/FacultyMenu";
import { ProgramList, facultyMenuItems } from "@/components/tcas/ProgramList";
import { TcasCredits } from "@/components/tcas/TcasCredits";
import { UniversityShowcase } from "@/components/tcas/UniversityShowcase";
import { Container, EmptyState, Notice, PageHeader, buttonStyles, cx, inputStyles, smallButtonStyles } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCAS_UNIVERSITIES } from "@/lib/tcas";
import {
  PROGRAM_SORTS,
  type ProgramSort,
  countByUniversity,
  loadGroupFields,
  loadMyTargets,
  searchPrograms,
} from "@/lib/tcasData";

export const metadata: Metadata = { title: "TCAS" };

const param = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function TcasPage({ searchParams }: PageProps<"/tcas">) {
  const profile = await requireProfile();
  const isStudent = profile.role === "student";
  const params = await searchParams;
  const q = param(params.q).slice(0, 100);
  const u = TCAS_UNIVERSITIES.some((x) => x.id === param(params.u)) ? param(params.u) : "";
  const g = param(params.g).slice(0, 100);
  const searching = Boolean(q || u || g);
  const sort: ProgramSort = PROGRAM_SORTS.find((x) => x === param(params.s)) ?? "faculty";

  const supabase = await createClient();
  const [counts, groups, targets, results] = await Promise.all([
    countByUniversity(supabase),
    loadGroupFields(supabase),
    isStudent ? loadMyTargets(supabase) : Promise.resolve([]),
    searching ? searchPrograms(supabase, { q, university: u, group: g, sort }) : Promise.resolve([]),
  ]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const href = (next: { u?: string }) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (next.u) sp.set("u", next.u);
    if (g) sp.set("g", g);
    if (sort !== "faculty") sp.set("s", sort);
    const s = sp.toString();
    return `${s ? `/tcas?${s}` : "/tcas"}#search`;
  };

  return (
    <>
      {total > 0 && <UniversityShowcase counts={counts} />}
      <section id="search" className="scroll-mt-16">
        <Container className="pb-28 pt-10">
          <div data-reveal>
            <PageHeader
              as={total > 0 ? "h2" : "h1"}
              eyebrow="TCAS70"
              title="TCAS"
              subtitle="ค้นหาหลักสูตร ดูเกณฑ์รอบ 1 และรอบ 3 แล้วลองคำนวณคะแนนของตัวเอง"
            />
          </div>

          {profile.role !== "student" && (
            <div className="mb-5">
              <Link href="/tcas/stats" className={smallButtonStyles}>
                <BarChart3 aria-hidden className="h-4 w-4" />
                สถิติเป้าหมายของนักเรียน
              </Link>
            </div>
          )}

          {total === 0 ? (
            <EmptyState
              icon={<GraduationCap aria-hidden className="h-6 w-6" />}
              title="ยังไม่มีข้อมูล TCAS"
              body="ผู้ดูแลระบบกำลังเตรียมข้อมูล"
            />
          ) : (
            <>
              {isStudent && (
                <section data-reveal className="mb-8">
                  <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-bold text-ink">
                    <Star aria-hidden className="h-5 w-5 text-brand" />
                    เป้าหมายของฉัน
                  </h2>
                  {targets.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-line-strong bg-surface px-5 py-4 text-sm text-muted">
                      ยังไม่มีเป้าหมาย เปิดหลักสูตรที่สนใจแล้วกด “บันทึกเป็นเป้าหมาย” (สูงสุด 5 หลักสูตร)
                    </p>
                  ) : (
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {targets.map((t) => (
                        <li key={t.programId}>
                          <Link
                            href={`/tcas/${t.programId}`}
                            className="block h-full rounded-2xl border border-line bg-surface p-4 shadow-soft-sm transition-shadow hover:shadow-soft"
                          >
                            <span className="text-xs font-bold text-muted">
                              {t.universityName} · {t.faculty}
                            </span>
                            <span className="mt-1 block text-sm font-bold leading-snug text-ink">{t.nameTh}</span>
                            {!t.active && (
                              <span className="mt-2 block text-xs font-bold text-danger">หลักสูตรนี้ไม่มีในข้อมูลล่าสุด</span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {/* Sticky filter bar: stays under the nav while scrolling the results */}
              <div
                data-reveal
                className="sticky top-16 z-20 -mx-4 mb-6 border-b border-line bg-page/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-4"
              >
                <form action="/tcas#search" className="mb-2.5 flex flex-col gap-2 sm:flex-row">
                  {u && <input type="hidden" name="u" value={u} />}
                  <label className="sr-only" htmlFor="tcas-q">
                    ค้นหาหลักสูตร
                  </label>
                  <input
                    id="tcas-q"
                    name="q"
                    defaultValue={q}
                    placeholder="ค้นหา เช่น วิศวกรรม แพทย์ บัญชี"
                    className={cx(inputStyles, "h-11 w-full sm:flex-1")}
                  />
                  <label className="sr-only" htmlFor="tcas-g">
                    กลุ่มสาขา
                  </label>
                  <select id="tcas-g" name="g" defaultValue={g} className={cx(inputStyles, "h-11 w-full sm:w-56")}>
                    <option value="">ทุกกลุ่มสาขา</option>
                    {groups.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                  <label className="sr-only" htmlFor="tcas-s">
                    เรียงตาม
                  </label>
                  <select id="tcas-s" name="s" defaultValue={sort} className={cx(inputStyles, "h-11 w-full sm:w-52")}>
                    <option value="faculty">เรียงตามคณะ</option>
                    <option value="low">คะแนนต่ำสุดปีที่แล้ว น้อย→มาก</option>
                    <option value="high">คะแนนต่ำสุดปีที่แล้ว มาก→น้อย</option>
                    <option value="competition">การแข่งขัน น้อย→มาก</option>
                  </select>
                  <button type="submit" className={buttonStyles.primary}>
                    <Search aria-hidden className="h-4 w-4" />
                    ค้นหา
                  </button>
                </form>

                <nav aria-label="เลือกมหาวิทยาลัย" className="flex flex-wrap gap-1.5">
                  {[{ id: "", short: "ทุกมหาวิทยาลัย" }, ...TCAS_UNIVERSITIES].map((x) => {
                    const on = x.id === u;
                    return (
                      <Link
                        key={x.id || "all"}
                        href={href({ u: x.id })}
                        aria-current={on ? "page" : undefined}
                        className={cx(
                          "rounded-full border px-3.5 py-1.5 text-sm font-bold transition-colors",
                          on
                            ? "border-brand bg-brand text-white"
                            : "border-line bg-surface text-muted hover:border-brand/30 hover:text-brand",
                        )}
                      >
                        {x.short}
                      </Link>
                    );
                  })}
                </nav>
              </div>

              {!searching ? (
                <Notice tone="info">
                  มีข้อมูล {total.toLocaleString("th-TH")} หลักสูตรจาก 5 มหาวิทยาลัย พิมพ์คำค้นหา เลือกกลุ่มสาขา
                  หรือเลือกมหาวิทยาลัยเพื่อเริ่ม
                </Notice>
              ) : results.length === 0 ? (
                <EmptyState
                  icon={<Search aria-hidden className="h-6 w-6" />}
                  title="ไม่พบหลักสูตรที่ค้นหา"
                  body="ลองใช้คำที่สั้นลงหรือชื่อเต็ม เช่น “วิศวกรรม” แทน “วิศวะ” หรือ “แพทยศาสตร์” แทน “หมอ”"
                />
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted">
                      พบ {results.length.toLocaleString("th-TH")} หลักสูตร
                      {results.length === 120 && " (แสดง 120 รายการแรก ค้นหาให้เจาะจงขึ้นเพื่อดูเพิ่ม)"}
                      {" · "}ติ๊ก “เปรียบเทียบ” ได้สูงสุด 3 หลักสูตร
                    </p>
                    {sort === "faculty" && <FacultyMenu items={facultyMenuItems(results)} />}
                  </div>
                  <ProgramList programs={results} sort={sort} />
                </>
              )}
            </>
          )}
          {total > 0 && <TcasCredits />}
        </Container>
        <CompareTray />
      </section>
    </>
  );
}
