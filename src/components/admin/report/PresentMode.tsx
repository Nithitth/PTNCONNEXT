"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { Brand, cx } from "@/components/ui";
import { T, formatRange } from "@/lib/report";
import { peakText } from "@/lib/reportAnalysis";
import type { ReportView } from "@/lib/reportView";
import { Findings, Funnel, Heatmap, ImpactCards, ObjectiveCard, RoomRanking, ScoreGauge, WorkloadView } from "./ReportParts";
import { SchoolCalculator } from "./ReportClient";

type Slide = { key: string; dark?: boolean; title?: string; body: ReactNode };

/**
 * โหมดนำเสนอ: the report as full-screen slides for meetings (director, other schools, judges).
 * ← → / Space to move, F for full screen, Esc to leave. Same numbers as the report page.
 */
export function PresentMode({ v, back }: { v: ReportView; back: string }) {
  const router = useRouter();
  const lang = v.lang;
  const t = T[lang];
  const th = lang === "th";

  const slides: Slide[] = [
    {
      key: "cover",
      dark: true,
      body: (
        <div className="grid h-full items-center gap-10 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="text-lg font-bold text-white/80 sm:text-2xl">
              <Brand className="text-white">PTN Connext</Brand> · {t.title}
            </p>
            <h1 className="mt-4 font-display text-5xl font-extrabold leading-tight text-white sm:text-7xl">{formatRange(v.range, lang)}</h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-white/85 sm:text-2xl">{t.about}</p>
          </div>
          <div className="justify-self-center rounded-[2rem] bg-white/10 p-8">
            <ScoreGauge score={v.score} prev={v.prevScore} lang={lang} light size={340} />
          </div>
        </div>
      ),
    },
    { key: "findings", title: t.findings, body: <Findings items={v.findings} lang={lang} big /> },
    ...v.okrs.map((o, i) => ({ key: `okr-${i}`, title: `OKR ${i + 1} / ${v.okrs.length}`, body: <ObjectiveCard o={o} i={i} lang={lang} big /> })),
    {
      key: "impact",
      title: t.impact,
      body: (
        <div className="space-y-6">
          <ImpactCards impact={v.impact} lang={lang} big />
          <p className="text-base text-muted">{t.impactNote}</p>
        </div>
      ),
    },
    {
      key: "adoption",
      title: t.adoption,
      body: (
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h3 className="mb-4 font-display text-2xl font-bold text-ink">{t.funnel}</h3>
            <Funnel steps={v.funnel} lang={lang} big />
          </div>
          <div>
            <h3 className="mb-4 font-display text-2xl font-bold text-ink">{t.rooms}</h3>
            <RoomRanking rooms={v.rooms.slice(0, 8)} lang={lang} />
          </div>
        </div>
      ),
    },
    {
      key: "heatmap",
      title: t.heatmap,
      body: (
        <div className="space-y-6">
          {v.peak && (
            <p className="font-display text-3xl font-extrabold text-brand sm:text-4xl">
              {th ? `ช่วงที่ใช้มากที่สุด: ${peakText(v.peak, "th")}` : `Busiest: ${peakText(v.peak, "en")}`}
            </p>
          )}
          <Heatmap title={th ? "นักเรียน" : "Students"} m={v.heat.students} lang={lang} />
        </div>
      ),
    },
    { key: "workload", title: t.workload, body: <WorkloadView work={v.work} labels={v.roomLabels} lang={lang} /> },
    ...(v.themes.length
      ? [
          {
            key: "voice",
            title: th ? "สิ่งที่ผู้ใช้พูดถึงมากที่สุด" : "What users raise most",
            body: (
              <ol className="space-y-4">
                {v.themes.map((x, i) => (
                  <li key={x.th} className="flex items-center gap-5">
                    <span className="bg-brand-gradient grid h-16 w-16 shrink-0 place-items-center rounded-2xl font-display text-3xl font-extrabold text-white">
                      {i + 1}
                    </span>
                    <span className="font-display text-3xl font-bold text-ink sm:text-4xl">{x[lang]}</span>
                    <span className="text-2xl text-muted">{th ? `${x.count} ข้อความ` : `${x.count} messages`}</span>
                  </li>
                ))}
              </ol>
            ),
          },
        ]
      : []),
    { key: "calculator", title: t.calculator, body: <SchoolCalculator rates={v.rates} assumptions={v.assumptions} lang={lang} /> },
    {
      key: "thanks",
      dark: true,
      body: (
        <div className="grid h-full place-items-center text-center">
          <div>
            <p className="font-display text-6xl font-extrabold text-white sm:text-8xl">{th ? "ขอบคุณครับ/ค่ะ" : "Thank you"}</p>
            <p className="mt-6 text-2xl text-white/85">
              <Brand className="text-white">PTN Connext</Brand> · {th ? "โดยนักเรียน เพื่อครูและนักเรียน" : "Built by students, for teachers and students"}
            </p>
          </div>
        </div>
      ),
    },
  ];

  const [i, setI] = useState(0);
  const go = useCallback((d: number) => setI((x) => Math.max(0, Math.min(slides.length - 1, x + d))), [slides.length]);
  const full = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const step = e.key === "ArrowRight" || e.key === " " || e.key === "PageDown" ? 1 : e.key === "ArrowLeft" || e.key === "PageUp" ? -1 : 0;
      if (step) {
        e.preventDefault();
        go(step);
      } else if (e.key === "f" || e.key === "F") full();
      else if (e.key === "Escape" && !document.fullscreenElement) router.push(back);
      else if (e.key === "Home") setI(0);
      else if (e.key === "End") setI(slides.length - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, back, router, slides.length]);

  const s = slides[i];
  return (
    <div
      lang={lang}
      className={cx("fixed inset-0 z-[60] flex flex-col", s.dark ? "bg-brand-gradient speed-lines" : "bg-page")}
      role="region"
      aria-roledescription="งานนำเสนอ"
      aria-label={t.present}
    >
      <div className="flex items-center justify-between gap-3 px-5 py-3 sm:px-8">
        <span className={cx("text-sm font-bold", s.dark ? "text-white/80" : "text-muted")}>
          <Brand className={s.dark ? "text-white" : "text-brand"}>Connext</Brand> · {i + 1} / {slides.length}
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={full}
            aria-label={th ? "เต็มจอ (F)" : "Full screen (F)"}
            className={cx("rounded-lg p-2", s.dark ? "text-white hover:bg-white/15" : "text-muted hover:bg-sunken")}
          >
            <Expand aria-hidden className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => router.push(back)}
            aria-label={th ? "ออกจากโหมดนำเสนอ (Esc)" : "Leave (Esc)"}
            className={cx("rounded-lg p-2", s.dark ? "text-white hover:bg-white/15" : "text-muted hover:bg-sunken")}
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div key={s.key} className="min-h-0 flex-1 animate-rise overflow-y-auto px-5 pb-6 sm:px-16">
        <div className="mx-auto flex h-full max-w-6xl flex-col">
          {s.title && <h2 className="mb-8 font-display text-3xl font-extrabold text-ink sm:text-5xl">{s.title}</h2>}
          <div className="min-h-0 flex-1">{s.body}</div>
        </div>
      </div>

      <div className="flex items-center gap-3 px-5 pb-4 sm:px-8">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={i === 0}
          aria-label={th ? "สไลด์ก่อนหน้า" : "Previous slide"}
          className={cx("rounded-full p-2 disabled:opacity-30", s.dark ? "text-white hover:bg-white/15" : "text-ink hover:bg-sunken")}
        >
          <ChevronLeft aria-hidden className="h-6 w-6" />
        </button>
        <div className={cx("h-1.5 flex-1 overflow-hidden rounded-full", s.dark ? "bg-white/20" : "bg-sunken")}>
          <div
            className={cx("h-full rounded-full transition-[width] duration-300", s.dark ? "bg-white" : "bg-brand")}
            style={{ width: `${((i + 1) / slides.length) * 100}%` }}
          />
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={i === slides.length - 1}
          aria-label={th ? "สไลด์ถัดไป" : "Next slide"}
          className={cx("rounded-full p-2 disabled:opacity-30", s.dark ? "text-white hover:bg-white/15" : "text-ink hover:bg-sunken")}
        >
          <ChevronRight aria-hidden className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
