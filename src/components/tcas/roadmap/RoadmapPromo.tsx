import Link from "next/link";
import { ArrowRight, CheckCircle2, Map as MapIcon, Sparkles } from "lucide-react";
import { Container, buttonStyles, cx } from "@/components/ui";
import { DEMO_PROGRAM, DEMO_SCORE } from "./demoCard";
import { RoadmapCard } from "./RoadmapCard";

/**
 * The big Roadmap band on /tcas (students only), right under the university showcase.
 * Without a roadmap it invites them to make one; with one it shows their level and program.
 */
export function RoadmapPromo({ mine }: { mine: { level: number; pct: number; label: string } | null }) {
  return (
    <section
      aria-labelledby="roadmap-promo-title"
      className="bg-feature-gradient speed-lines relative overflow-hidden text-white"
    >
      <Container className={cx("grid items-center gap-10 py-14 sm:py-16", !mine && "lg:grid-cols-[1.2fr_1fr]")}>
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-white/85">
            <MapIcon aria-hidden className="h-4 w-4" />
            ใหม่ · Roadmap
          </p>
          <h2 id="roadmap-promo-title" className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
            {mine ? "Roadmap ของคุณรออยู่" : "สร้าง Roadmap เข้ามหาลัยของคุณ"}
          </h2>
          <p className="mt-3 max-w-lg text-base leading-relaxed text-white/85">
            เลือกหลักสูตรที่อยากเข้า แล้วสร้างการ์ดเป้าหมายแบบเกมของคุณเอง 1 ใบต่อคน แก้หรือลบได้ทุกเมื่อ
          </p>
          <ul className="mt-5 grid gap-2 text-sm font-bold sm:grid-cols-3">
            {["เลือกกล่องที่ใช่", "ติ๊กภารกิจเก็บ XP", "เลเวลอัปเมื่อใกล้เป้า"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0" />
                {t}
              </li>
            ))}
          </ul>

          {mine ? (
            <Link
              href="/roadmap#board"
              className="mt-7 flex max-w-md items-center gap-4 rounded-2xl bg-white p-4 text-ink shadow-soft-lg transition-transform hover:-translate-y-0.5"
            >
              <span className="bg-brand-gradient grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-center text-white">
                <span>
                  <span className="block text-[9px] font-bold leading-none text-white/80">LV</span>
                  <span className="font-display text-xl font-extrabold leading-none">{mine.level}</span>
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{mine.label}</span>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
                  <span className="bg-brand-gradient block h-full rounded-full" style={{ width: `${mine.pct}%` }} />
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-brand">
                ไปต่อ
                <ArrowRight aria-hidden className="h-4 w-4" />
              </span>
            </Link>
          ) : (
            <Link href="/roadmap#make" className={cx(buttonStyles.inverse, "mt-7 h-12 px-6 text-base")}>
              <Sparkles aria-hidden className="h-5 w-5" />
              สร้าง Roadmap ของฉัน
            </Link>
          )}
        </div>

        {/* The sample card only invites; once they have their own card, the real one is shown instead. */}
        {!mine && (
          <div className="relative mx-auto hidden w-full max-w-sm sm:block">
            <div className="animate-float" style={{ animationDuration: "7s" }}>
              <div className="[transform:rotate(3deg)]">
                <RoadmapCard program={DEMO_PROGRAM} score={DEMO_SCORE} termLabel="ม.5 เทอม 2" pop={null} levelUp={null} demo />
              </div>
            </div>
          </div>
        )}
      </Container>
    </section>
  );
}
