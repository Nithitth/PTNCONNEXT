import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, ChevronLeft, ChevronRight, GraduationCap, Search, Star } from "lucide-react";
import { CompareTray } from "@/components/tcas/CompareTray";
import { GroupSelect, SortSelect } from "@/components/tcas/FilterSelect";
import { ProgramList } from "@/components/tcas/ProgramList";
import { TcasCredits } from "@/components/tcas/TcasCredits";
import { UniversityShowcase } from "@/components/tcas/UniversityShowcase";
import { Container, EmptyState, PageHeader, buttonStyles, cx, inputStyles, smallButtonStyles } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCAS_UNIVERSITIES, fmtNum, paginateGroups, universityShort } from "@/lib/tcas";
import {
  PROGRAM_SORTS,
  type ProgramCard,
  type ProgramSort,
  countByUniversity,
  loadGroupFields,
  loadMyTargets,
  searchPrograms,
} from "@/lib/tcasData";

export const metadata: Metadata = { title: "TCAS" };

const param = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/**
 * Page links under the list: ← ก่อนหน้า, numbered pages, ถัดไป →. When grouped by faculty, each
 * number also says which university and faculties that page covers (shown on hover/long-press).
 */
function Pager({
  pages,
  page,
  href,
  grouped,
}: {
  pages: ProgramCard[][];
  page: number;
  href: (p: number) => string;
  grouped: boolean;
}) {
  if (pages.length < 2) return null;
  const covers = (list: ProgramCard[]) => {
    const a = list[0];
    const b = list[list.length - 1];
    const start = `${universityShort(a.universityId)} ${a.faculty}`;
    const end = `${universityShort(b.universityId)} ${b.faculty}`;
    return start === end ? start : `${start} – ${end}`;
  };
  const step = (p: number, label: string, icon: "prev" | "next") => {
    const Icon = icon === "prev" ? ChevronLeft : ChevronRight;
    const off = p < 1 || p > pages.length;
    const inner = (
      <>
        {icon === "prev" && <Icon aria-hidden className="h-4 w-4" />}
        <span className="hidden sm:inline">{label}</span>
        {icon === "next" && <Icon aria-hidden className="h-4 w-4" />}
      </>
    );
    return off ? (
      <span aria-hidden className={cx(smallButtonStyles, "pointer-events-none opacity-40")}>
        {inner}
      </span>
    ) : (
      <Link href={href(p)} aria-label={label} className={smallButtonStyles}>
        {inner}
      </Link>
    );
  };

  return (
    <nav aria-label="เลือกหน้า" className="mt-8 flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
      {step(page - 1, "ก่อนหน้า", "prev")}
      {pages.map((list, i) => {
        const n = i + 1;
        const on = n === page;
        const title = grouped ? `หน้า ${n}: ${covers(list)} (${list.length} หลักสูตร)` : `หน้า ${n} (${list.length} หลักสูตร)`;
        return (
          <Link
            key={n}
            href={href(n)}
            title={title}
            aria-label={title}
            aria-current={on ? "page" : undefined}
            className={cx(
              "grid h-9 min-w-8 place-items-center rounded-xl border px-1.5 text-sm font-bold tabular-nums transition-colors sm:min-w-9 sm:px-2",
              on
                ? "border-brand bg-brand text-white shadow-brand-glow"
                : "border-line bg-surface text-muted hover:border-brand/30 hover:text-brand",
            )}
          >
            {n}
          </Link>
        );
      })}
      {step(page + 1, "ถัดไป", "next")}
    </nav>
  );
}

export default async function TcasPage({ searchParams }: PageProps<"/tcas">) {
  const profile = await requireProfile();
  const isStudent = profile.role === "student";
  const params = await searchParams;
  const q = param(params.q).slice(0, 100);
  const u = TCAS_UNIVERSITIES.some((x) => x.id === param(params.u)) ? param(params.u) : "";
  const g = param(params.g).slice(0, 200); // some TCAS group names are over 100 characters
  const sort: ProgramSort = PROGRAM_SORTS.find((x) => x === param(params.s)) ?? "faculty";

  const supabase = await createClient();
  const [counts, groups, targets, results] = await Promise.all([
    countByUniversity(),
    loadGroupFields(),
    isStudent ? loadMyTargets(supabase) : Promise.resolve([]),
    searchPrograms({ q, university: u, group: g, sort }),
  ]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  // Pages of about 100 programs. Sorted by faculty, a faculty is never split across two pages.
  const pages = paginateGroups(results, (p) => (sort === "faculty" ? `${p.universityId}|${p.faculty}` : p.programId));
  const page = Math.min(Math.max(1, Number.parseInt(param(params.p), 10) || 1), Math.max(1, pages.length));
  const shown = pages[page - 1] ?? [];
  const from = pages.slice(0, page - 1).reduce((n, x) => n + x.length, 0) + 1;

  const href = (next: { u?: string; p?: number }) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    const uni = "u" in next ? next.u : u;
    if (uni) sp.set("u", uni);
    if (g) sp.set("g", g);
    if (sort !== "faculty") sp.set("s", sort);
    if (next.p && next.p > 1) sp.set("p", String(next.p));
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
                  <div className="relative grid grid-cols-2 gap-2 sm:contents">
                    <GroupSelect groups={groups} value={g} className="sm:w-60" />
                    <SortSelect value={sort} className="sm:w-56" />
                  </div>
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

              {results.length === 0 ? (
                <EmptyState
                  icon={<Search aria-hidden className="h-6 w-6" />}
                  title="ไม่พบหลักสูตรที่ค้นหา"
                  body="ลองใช้คำที่สั้นลงหรือชื่อเต็ม เช่น “วิศวกรรม” แทน “วิศวะ” หรือ “แพทยศาสตร์” แทน “หมอ”"
                />
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted">
                      {q || u || g ? "พบ" : "ทั้งหมด"} {fmtNum(results.length)} หลักสูตร
                      {pages.length > 1 && (
                        <>
                          {" · "}แสดงหลักสูตรที่ {fmtNum(from)}–{fmtNum(from + shown.length - 1)} (หน้า {page}/{pages.length})
                        </>
                      )}
                      {" · "}ติ๊ก “เปรียบเทียบ” ได้สูงสุด 3 หลักสูตร
                    </p>
                  </div>
                  <ProgramList programs={shown} sort={sort} />
                  <Pager pages={pages} page={page} href={(p) => href({ p })} grouped={sort === "faculty"} />
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
