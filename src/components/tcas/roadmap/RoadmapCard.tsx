"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Award, Lock, Sparkles, Star } from "lucide-react";
import { UniversityLogo } from "@/components/tcas/UniversityLogo";
import { cx } from "@/components/ui";
import type { RoadmapScore } from "@/lib/roadmap";

export type CardProgram = {
  programId: string;
  universityId: string;
  universityShort: string;
  faculty: string;
  nameTh: string;
  active: boolean;
  color: string;
};

/**
 * The game card: faculty-coloured holographic frame, red→purple face, level, XP bar and badges.
 * It tilts gently toward the pointer (not under reduced motion). `pop` shows a "+XP" float,
 * `levelUp` a short burst; both are keyed by the parent so they replay.
 */
export function RoadmapCard({
  program,
  score,
  termLabel,
  pop,
  levelUp,
  actions,
  demo = false,
}: {
  program: CardProgram;
  score: RoadmapScore;
  termLabel: string | null;
  pop: { id: number; xp: number } | null;
  levelUp: number | null;
  actions?: ReactNode;
  /** A static sample card (hero/promo art): no tilt, no buttons, hidden from screen readers. */
  demo?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || demo || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--ry", `${(x * 8).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${(-y * 8).toFixed(2)}deg`);
    };
    const leave = () => {
      el.style.setProperty("--ry", "0deg");
      el.style.setProperty("--rx", "0deg");
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [demo]);

  const inLevel = score.xp - score.levelStart;
  const pct = Math.min(100, (inLevel / (score.nextLevelXp - score.levelStart)) * 100);
  const earned = score.badges.filter((b) => b.earned).length;

  return (
    <div
      ref={ref}
      className="roadmap-card relative mx-auto w-full max-w-md rounded-[30px] p-[3px] shadow-brand-glow-lg"
      style={{ ["--fc" as string]: program.color }}
      aria-hidden={demo || undefined}
    >
      <article
        aria-label={`การ์ด Roadmap: ${program.nameTh} เลเวล ${score.level}`}
        className="bg-feature-gradient speed-lines relative overflow-hidden rounded-[27px] p-5 text-white sm:p-6"
      >
        <div aria-hidden className="roadmap-card-shine pointer-events-none absolute inset-0" />

        <header className="relative flex items-start gap-3">
          <span className="rounded-full p-[3px]" style={{ background: program.color }}>
            <UniversityLogo id={program.universityId} size={52} className="border-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white/80">
              {program.universityShort} · {program.faculty}
            </p>
            <h2 className="mt-0.5 font-display text-lg font-bold leading-snug">{program.nameTh}</h2>
          </div>
          <div
            key={levelUp ?? "lv"}
            className={cx(
              "grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/40 bg-white/15 text-center backdrop-blur",
              levelUp !== null && "level-ring",
            )}
          >
            <span className="text-[10px] font-bold leading-none text-white/80">LEVEL</span>
            <span className="font-display text-2xl font-extrabold leading-none tabular-nums">{score.level}</span>
          </div>
        </header>

        {!program.active && (
          <p className="relative mt-3 rounded-xl bg-white px-3 py-2 text-xs font-bold text-brand">หลักสูตรนี้ไม่มีในข้อมูลล่าสุด</p>
        )}

        <div className="relative mt-5">
          <div className="mb-1.5 flex items-baseline justify-between text-xs font-bold">
            <span className="flex items-center gap-1">
              <Sparkles aria-hidden className="h-3.5 w-3.5" />
              XP {score.xp.toLocaleString("th-TH")}
            </span>
            <span className="text-white/80">
              อีก {(score.nextLevelXp - score.xp).toLocaleString("th-TH")} XP ถึง Lv {score.level + 1}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="ความคืบหน้าสู่เลเวลถัดไป"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            className="h-3 overflow-hidden rounded-full bg-black/20"
          >
            <div
              className="h-full rounded-full bg-white shadow-[0_0_12px_rgb(255_255_255/0.8)] transition-[width] duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          {pop && (
            <span
              key={pop.id}
              aria-hidden
              className="xp-pop pointer-events-none absolute -top-5 right-0 rounded-full bg-white px-2.5 py-0.5 text-sm font-extrabold text-brand shadow-soft"
            >
              +{pop.xp} XP
            </span>
          )}
        </div>

        <div className="relative mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/85">
          {termLabel && (
            <span className="flex items-center gap-1">
              <Star aria-hidden className="h-3.5 w-3.5" />
              ตอนนี้ {termLabel}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Award aria-hidden className="h-3.5 w-3.5" />
            เหรียญ {earned}/{score.badges.length}
          </span>
          {score.cappedXp > 0 && <span>XP จากรายการที่พิมพ์เองนับได้ไม่เกิน 40%</span>}
        </div>

        <ul aria-label="เหรียญรางวัล" className="relative mt-3 flex flex-wrap gap-1.5">
          {score.badges.map((b) => (
            <li
              key={b.key}
              title={b.earned ? b.label : `ยังไม่ได้: ${b.hint}`}
              className={cx(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
                b.earned ? "bg-white text-brand shadow-soft-sm" : "border border-white/25 bg-white/10 text-white/60",
              )}
            >
              {b.earned ? <Award aria-hidden className="h-3 w-3" /> : <Lock aria-hidden className="h-3 w-3" />}
              {b.label}
              <span className="sr-only">{b.earned ? "(ได้แล้ว)" : `(ยังไม่ได้ — ${b.hint})`}</span>
            </li>
          ))}
        </ul>

        {actions && <div className="relative mt-5 flex flex-wrap gap-2">{actions}</div>}

        {levelUp !== null && (
          <div key={levelUp} aria-hidden className="level-burst pointer-events-none absolute inset-0 grid place-items-center">
            <span className="rounded-3xl bg-white px-6 py-3 text-center shadow-soft-lg">
              <span className="block text-xs font-bold text-muted">เลเวลอัป!</span>
              <span className="text-tcas-gradient block font-display text-4xl font-extrabold">Lv {levelUp}</span>
            </span>
          </div>
        )}
      </article>
    </div>
  );
}
