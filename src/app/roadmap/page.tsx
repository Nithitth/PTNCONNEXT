import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, Sparkles, Star } from "lucide-react";
import { RoadmapButton } from "@/components/tcas/roadmap/RoadmapButton";
import { RoadmapShowcase } from "@/components/tcas/roadmap/RoadmapShowcase";
import { RoadmapBoard, StartRoadmap, type TargetChoice } from "@/components/tcas/roadmap/RoadmapBoard";
import { UniversityLogo } from "@/components/tcas/UniversityLogo";
import { Container, PageHeader, buttonStyles, cx, inputStyles } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { dayKey } from "@/lib/calendar";
import { facultyColor } from "@/lib/facultyColors";
import { currentTerm, portfolioItems, scoreRoadmap, targetChance, toRoadmapProgram } from "@/lib/roadmap";
import { loadKeyDates, loadMyRoadmap } from "@/lib/roadmapData";
import { createClient } from "@/lib/supabase/server";
import { universityShort } from "@/lib/tcas";
import { loadMyTargets, loadProgram, searchPrograms } from "@/lib/tcasData";

export const metadata: Metadata = { title: "Roadmap · TCAS" };

const SHOWN = 30;

/** Search box + results for picking the roadmap's program right here (GET ?q=…#pick). */
async function ProgramPicker({ q, current, currentName }: { q: string; current: string | null; currentName?: string }) {
  const results = q ? await searchPrograms({ q }) : [];
  return (
    <section id="pick" className="scroll-mt-20">
      <form action="/roadmap#pick" className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="roadmap-q">
          ค้นหาหลักสูตรสำหรับ Roadmap
        </label>
        <input
          id="roadmap-q"
          name="q"
          defaultValue={q}
          maxLength={100}
          placeholder="ค้นหาหลักสูตร เช่น วิศวกรรม แพทย์ บัญชี"
          className={cx(inputStyles, "h-11 w-full sm:flex-1")}
        />
        <button type="submit" className={buttonStyles.primary}>
          <Search aria-hidden className="h-4 w-4" />
          ค้นหา
        </button>
      </form>
      {q && (
        <div className="mt-4">
          <p className="mb-3 text-sm text-muted">
            {results.length === 0
              ? "ไม่พบหลักสูตร ลองใช้คำที่สั้นลง เช่น “วิศวกรรม” แทน “วิศวะ”"
              : `พบ ${results.length.toLocaleString("th-TH")} หลักสูตร${results.length > SHOWN ? ` · แสดง ${SHOWN} รายการแรก พิมพ์ให้เจาะจงขึ้นเพื่อดูเพิ่ม` : ""}`}
          </p>
          <ul className="grid gap-2 md:grid-cols-2">
            {results.slice(0, SHOWN).map((p) => (
              <li
                key={p.programId}
                className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3 shadow-soft-sm"
              >
                <UniversityLogo id={p.universityId} size={40} />
                <div className="min-w-0 flex-1">
                  <Link href={`/tcas/${p.programId}`} className="block text-sm font-bold leading-snug text-ink hover:text-brand">
                    {p.nameTh}
                  </Link>
                  <p className="mb-2 text-xs text-muted">
                    {universityShort(p.universityId)} · {p.faculty}
                  </p>
                  <RoadmapButton
                    programId={p.programId}
                    position={0}
                    state={!current ? "none" : current === p.programId ? "this" : "other"}
                    currentName={currentName}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** The Roadmap tab: make (or switch) the student's one roadmap, then build it from boxes. */
export default async function RoadmapPage({ searchParams }: PageProps<"/roadmap">) {
  const profile = await requireProfile();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 100).trim() : "";

  const supabase = await createClient();
  const [roadmap, targets] = await Promise.all([loadMyRoadmap(supabase), loadMyTargets(supabase)]);

  // Saved targets (still offered) with their chance level, for starting, switching and backups.
  const details = await Promise.all(targets.filter((t) => t.active).map((t) => loadProgram(t.programId)));
  const choices: TargetChoice[] = targets
    .filter((t) => t.active)
    .map((t, i) => ({
      programId: t.programId,
      label: `${universityShort(t.universityId)} · ${t.nameTh}`,
      position: t.position,
      chance: details[i] ? targetChance(details[i]!.round3, t) : null,
    }));

  if (!roadmap) {
    return (
      <>
        <RoadmapShowcase level={null} />
        <section id="make" className="scroll-mt-16">
          <Container className="py-12">
            <PageHeader eyebrow="เริ่มเลย" title="สร้าง Roadmap ของฉัน" subtitle="3 ขั้นตอนง่าย ๆ ใช้เวลาไม่ถึงนาที" as="h2" />

            <ol className="mb-8 grid gap-3 sm:grid-cols-3">
              {[
                ["1", "เลือกหลักสูตร", "จากเป้าหมายที่บันทึกไว้ หรือค้นหาด้านล่าง"],
                ["2", "เลือกกล่อง", "เกรด ภารกิจ เป้าหมาย นับถอยหลัง และอีกมาก สูงสุด 10 กล่อง"],
                ["3", "เก็บ XP", "ติ๊กภารกิจ ทำเป้าให้สำเร็จ แล้วดูการ์ดเลเวลอัป"],
              ].map(([n, title, body]) => (
                <li key={n} className="flex gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft-sm">
                  <span className="bg-brand-gradient grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold text-white shadow-brand-glow">
                    {n}
                  </span>
                  <span>
                    <span className="block font-display font-bold text-ink">{title}</span>
                    <span className="block text-sm text-muted">{body}</span>
                  </span>
                </li>
              ))}
            </ol>

            {choices.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-ink">
                  <Star aria-hidden className="h-5 w-5 text-brand" />
                  จากเป้าหมายที่บันทึกไว้
                </h2>
                <StartRoadmap choices={choices} />
              </section>
            )}

            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-ink">
              <Search aria-hidden className="h-5 w-5 text-brand" />
              {choices.length > 0 ? "หรือค้นหาหลักสูตรอื่น" : "ค้นหาหลักสูตรที่อยากเข้า"}
            </h2>
            <ProgramPicker q={q} current={null} />
          </Container>
        </section>
      </>
    );
  }

  const [program, keyDates] = await Promise.all([loadProgram(roadmap.programId), loadKeyDates(supabase)]);
  if (!program) redirect("/tcas");
  const rp = toRoadmapProgram(program, roadmap.position);
  const target = targets.find((t) => t.programId === roadmap.programId) ?? null;
  const chance = targetChance(program.round3, target);
  const today = dayKey(new Date());
  const { level } = scoreRoadmap(roadmap.boxes, { program: rp, chance, today });

  return (
    <>
      <RoadmapShowcase level={level} />
      <section id="board" className="scroll-mt-16">
        <Container className="py-12">
          {q && (
            <section className="mb-10 rounded-3xl border border-line bg-page p-4 sm:p-6">
              <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-ink">
                <Sparkles aria-hidden className="h-5 w-5 text-brand" />
                เปลี่ยนเป้าหมายของ Roadmap
              </h2>
              <ProgramPicker q={q} current={roadmap.programId} currentName={program.nameTh} />
              <Link href="/roadmap" className="mt-4 inline-block text-sm font-bold text-muted hover:text-brand">
                ปิดการค้นหา
              </Link>
            </section>
          )}
          <RoadmapBoard
            key={`${roadmap.programId}-${roadmap.updatedAt}`}
            initialBoxes={roadmap.boxes}
            program={{
              programId: program.programId,
              universityId: program.universityId,
              universityShort: universityShort(program.universityId),
              faculty: program.faculty,
              nameTh: program.nameTh,
              active: program.active,
              color: facultyColor(program.universityId, program.faculty).hex,
            }}
            ctx={{
              program: rp,
              portfolio: portfolioItems(rp),
              chance,
              savedScores: target?.sliderScores ?? null,
              targets: choices.map((c) => ({
                programId: c.programId,
                label: c.label,
                chance: c.chance,
              })),
              keyDates,
              today,
              term: currentTerm(profile.classroom?.grade),
            }}
            choices={choices}
          />
        </Container>
      </section>
    </>
  );
}
