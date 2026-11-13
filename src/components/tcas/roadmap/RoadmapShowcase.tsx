import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowDown, Award, LayoutGrid, Search, Sparkles } from "lucide-react";
import { Container, Eyebrow, buttonStyles, cx } from "@/components/ui";
import { BOX_PRESETS, ROADMAP_MAX_BOXES, BOX_KINDS, type BoxKind } from "@/lib/roadmap";
import { BOX_ICONS } from "./boxIcons";
import { DEMO_PROGRAM, DEMO_SCORE, DEMO_STAGE } from "./demoCard";
import { RoadmapCard } from "./RoadmapCard";

// Box chips floating around the sample card (lg screens only, so they never cover the text).
const CHIPS: { kind: BoxKind; className: string; delay: string }[] = [
  { kind: "gpa", className: "-left-20 -top-8", delay: "0s" },
  { kind: "quests", className: "-right-6 -top-14", delay: "-1.4s" },
  { kind: "countdown", className: "-left-14 bottom-[22%]", delay: "-2.6s" },
  { kind: "portfolio", className: "-right-12 bottom-[30%]", delay: "-0.7s" },
  { kind: "activities", className: "right-[18%] -bottom-6", delay: "-3.3s" },
];

/**
 * The Roadmap landing window: a full first screen, like TCAS's "Top University" one.
 * Students without a roadmap are pointed at #make; with one, at their card (#board).
 */
export function RoadmapShowcase({ stage }: { stage: number | null }) {
  const has = stage !== null;
  return (
    <section className="mesh-tcas relative isolate overflow-hidden" aria-labelledby="roadmap-title">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="tcas-blob -left-24 top-10 h-72 w-72 bg-brand/25" />
        <div className="tcas-blob right-[-6rem] top-[-4rem] h-80 w-80 bg-[#8a4fd8]/25 [animation-delay:-7s]" />
        <div className="tcas-blob bottom-[-6rem] left-1/3 h-72 w-96 bg-brand-hot/20 [animation-delay:-13s]" />
      </div>

      <Container className="relative grid min-h-[calc(100svh-4rem)] items-center gap-12 pb-12 pt-12 sm:pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div>
          <Eyebrow className="animate-rise">TCAS · Roadmap</Eyebrow>
          <h1
            id="roadmap-title"
            className="animate-rise delay-1 mt-4 font-display text-4xl font-extrabold leading-[1.15] tracking-tight text-ink sm:text-5xl lg:text-6xl"
          >
            วางแผนเข้ามหาลัย
            <br />
            ให้สนุกเหมือน<span className="text-tcas-gradient whitespace-nowrap font-extrabold">เล่นเกม</span>
          </h1>
          <p className="animate-rise delay-2 mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            การ์ดเป้าหมาย 1 ใบต่อคน เลือกหลักสูตรที่อยากเข้า สร้างแผนจากกล่องที่ชอบ เก็บ XP แนบหลักฐาน แล้วผ่านทีละด่านจนพร้อมสมัคร
          </p>

          <div className="animate-rise delay-3 mt-8 flex flex-wrap items-center gap-3">
            <a href={has ? "#board" : "#make"} className={cx(buttonStyles.primary, "h-12 px-6 text-base shadow-brand-glow-lg")}>
              <Sparkles aria-hidden className="h-5 w-5" />
              {has ? `เปิด Roadmap ของฉัน · ด่าน ${stage}` : "สร้าง Roadmap ของฉัน"}
            </a>
            <Link href="/tcas#search" className={buttonStyles.ghost}>
              <Search aria-hidden className="h-4 w-4" />
              ค้นหาหลักสูตรใน TCAS
            </Link>
          </div>

          <ul className="animate-rise delay-4 mt-8 flex flex-wrap gap-2 text-sm font-bold text-ink">
            {[
              { Icon: LayoutGrid, text: `${BOX_KINDS.length} แบบกล่อง` },
              { Icon: Sparkles, text: `สูงสุด ${ROADMAP_MAX_BOXES} กล่อง` },
              { Icon: Award, text: "6 ด่าน · กรอบและธีมให้สะสม" },
            ].map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-1.5 rounded-full border border-line bg-surface/80 px-3.5 py-1.5 shadow-soft-sm backdrop-blur">
                <Icon aria-hidden className="h-4 w-4 text-brand" />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div className="animate-float" style={{ animationDuration: "7s" } as CSSProperties}>
            <div className="[transform:rotate(-3deg)]">
              <RoadmapCard program={DEMO_PROGRAM} score={DEMO_SCORE} stage={DEMO_STAGE} streak={5} frame="holo" termLabel="ม.5 เทอม 2" pop={null} levelUp={null} demo />
            </div>
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
            {CHIPS.map(({ kind, className, delay }) => {
              const Icon = BOX_ICONS[kind];
              return (
                <div key={kind} className={cx("absolute", className)}>
                  <div className="animate-float" style={{ animationDelay: delay }}>
                    <span className="flex items-center gap-1.5 rounded-2xl border border-line bg-surface px-3 py-2 text-sm font-bold text-ink shadow-soft-lg">
                      <span className="bg-brand-gradient grid h-7 w-7 place-items-center rounded-lg text-white">
                        <Icon className="h-4 w-4" />
                      </span>
                      {BOX_PRESETS[kind].name}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <a
          href={has ? "#board" : "#make"}
          className="mx-auto flex flex-col items-center gap-1 rounded-xl px-4 py-2 text-sm font-bold text-muted transition-colors hover:text-brand lg:col-span-2"
        >
          <ArrowDown aria-hidden className="h-5 w-5 animate-float" />
          {has ? "เลื่อนลงไปที่การ์ดของฉัน" : "เลื่อนลงเพื่อเริ่มสร้าง"}
        </a>
      </Container>
    </section>
  );
}
