import type { Metadata } from "next";
import Link from "next/link";
import { Lightbulb, MessageSquareQuote, MessagesSquare, Target, TrendingUp } from "lucide-react";
import { AdminBack } from "@/components/admin/AdminBack";
import { FeedbackTagger } from "@/components/admin/report/FeedbackTagger";
import { Delta, ReportSection } from "@/components/admin/report/ReportParts";
import { Container, EmptyState, PageHeader, cx } from "@/components/ui";
import { formatDateTime } from "@/lib/calendar";
import { PRESETS, T, formatRange, metricOf } from "@/lib/report";
import { DAYS } from "@/lib/reportAnalysis";
import { ideaCards, themeSummary, withTags } from "@/lib/reportIdeas";
import { reportFor } from "../load";

export const metadata: Metadata = { title: "ไอเดียโครงการถัดไป · คอนโซลผู้พัฒนา" };

const ROLE = { student: "นักเรียน", teacher: "ครู", admin: "ผู้ดูแล" } as const;

/**
 * Team-only: feedback sorted into themes, plus idea cards built from the feedback and usage patterns,
 * to help decide the next projects. Never printed with the report.
 */
export default async function IdeasPage({ searchParams }: PageProps<"/admin/report/ideas">) {
  const { view: v, bundle } = await reportFor(await searchParams);
  const fb = withTags(bundle.current.feedback, bundle.tags);
  const prevFb = withTags(bundle.previous.feedback, bundle.tags);
  const themes = themeSummary(fb, prevFb);
  const ideas = ideaCards({
    stats: v.stats,
    funnel: v.funnel,
    rooms: v.rooms,
    work: v.work,
    roomLabel: (id) => v.roomLabels[id] ?? "—",
    peak: v.peak,
    feedback: fb,
    subjectPosts: bundle.subjectPosts,
    storageUse: bundle.storageUse,
    schoolDrive: bundle.schoolDrive,
  });
  const maxTopic = Math.max(1, ...themes.topics.map((t) => t.count));

  return (
    <Container className="py-10">
      <AdminBack parent={{ href: "/admin/report", label: "รายงาน & OKR" }} />
      <PageHeader
        eyebrow="สำหรับทีมพัฒนา"
        title="ไอเดียโครงการถัดไป"
        subtitle={`จากความคิดเห็นและรูปแบบการใช้งาน · ${formatRange(v.range, "th")} · หน้านี้ไม่ถูกพิมพ์ไปกับรายงาน`}
      />
      <nav aria-label="ช่วงเวลา" className="mb-6 flex flex-wrap gap-1 rounded-xl border border-line bg-sunken p-1 sm:inline-flex">
        {PRESETS.map((p) => (
          <Link
            key={p}
            href={`/admin/report/ideas?preset=${p}`}
            aria-current={v.range.preset === p ? "page" : undefined}
            className={cx(
              "rounded-lg px-3 py-1.5 text-sm font-bold",
              v.range.preset === p ? "bg-surface text-brand shadow-soft-sm" : "text-muted hover:text-brand",
            )}
          >
            {T.th.presets[p]}
          </Link>
        ))}
      </nav>

      <div className="space-y-5">
        <ReportSection title="ไอเดียจากข้อมูล" note="เรียงจากหลักฐานที่ชัดที่สุด แต่ละข้อบอกปัญหา หลักฐาน และ OKR ที่จะขยับ">
          {ideas.length === 0 ? (
            <EmptyState icon={<Lightbulb aria-hidden className="h-6 w-6" />} title="ยังไม่พบสัญญาณที่ชัดพอ" body="เมื่อมีผู้ใช้และความคิดเห็นมากขึ้น ไอเดียจะปรากฏที่นี่เอง" />
          ) : (
            <ol className="grid gap-4 lg:grid-cols-2">
              {ideas.map((idea, i) => (
                <li key={idea.key} className="flex flex-col rounded-2xl border border-line bg-page p-5">
                  <div className="flex items-start gap-3">
                    <span
                      className={cx(
                        "grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display font-extrabold",
                        i === 0 ? "bg-brand-gradient text-white shadow-brand-glow" : "bg-brand-soft text-brand",
                      )}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-display text-lg font-bold leading-snug text-ink">{idea.th.title}</h3>
                      <p className="mt-0.5 text-sm text-muted">{idea.th.problem}</p>
                    </div>
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {idea.evidence.map((e) => (
                      <li key={e.th} className="rounded-full bg-sunken px-2.5 py-1 text-xs font-bold text-ink">
                        {e.th}
                      </li>
                    ))}
                  </ul>
                  {idea.quotes.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {idea.quotes.map((q) => (
                        <li key={q} className="flex gap-2 text-sm italic text-muted">
                          <MessageSquareQuote aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-faint" />“{q}”
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-auto space-y-1.5 pt-4 text-sm">
                    <p className="rounded-xl bg-success-soft px-3 py-2 text-success">
                      <b>ก้าวแรก:</b> {idea.th.step}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <Target aria-hidden className="h-3.5 w-3.5 text-brand" />
                      ขยับ OKR: <b className="text-ink">{metricOf(idea.metric)?.th ?? idea.metric}</b>
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </ReportSection>

        <ReportSection title="ความคิดเห็นตามหมวด" note={`${fb.length} ข้อความในช่วงนี้ · จัดหมวดอัตโนมัติ แก้ได้ด้วยปุ่มดินสอ`}>
          {fb.length === 0 ? (
            <EmptyState icon={<MessagesSquare aria-hidden className="h-6 w-6" />} title="ยังไม่มีความคิดเห็นในช่วงนี้" body="ความคิดเห็นจากกล่องในหน้าแรกจะถูกจัดหมวดที่นี่" />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 font-display font-bold text-ink">ประเภท</h3>
                <ul className="grid grid-cols-2 gap-2">
                  {themes.kinds.map((k) => (
                    <li key={k.key} className="rounded-2xl border border-line bg-page p-3">
                      <p className="flex items-baseline justify-between gap-2">
                        <b className="font-display text-2xl tabular-nums text-ink">{k.count}</b>
                        <Delta now={k.count} before={k.previous} lower={k.key === "bug"} lang="th" />
                      </p>
                      <p className="text-sm text-ink">{k.th}</p>
                      <p className="text-xs text-muted">
                        นักเรียน {k.students} · ครู {k.staff}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-display font-bold text-ink">เรื่องที่พูดถึง</h3>
                <ul className="space-y-1.5">
                  {themes.topics.map((t) => (
                    <li key={t.key} className="grid grid-cols-[8rem_1fr_auto] items-center gap-2 text-sm">
                      <span className="text-ink">{t.th}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-sunken">
                        <div className="bg-brand-gradient h-full rounded-full" style={{ width: `${(t.count / maxTopic) * 100}%` }} />
                      </div>
                      <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted">
                        {t.count} <Delta now={t.count} before={t.previous} lang="th" />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {themes.requests.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 flex items-center gap-2 font-display font-bold text-ink">
                <TrendingUp aria-hidden className="h-4 w-4 text-brand" />
                “อยากให้มี” ({themes.requests.length})
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {themes.requests.slice(0, 10).map((r) => (
                  <li key={r.id} className="rounded-xl bg-sunken/60 px-3 py-2 text-sm text-ink">
                    {r.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ReportSection>

        {fb.length > 0 && (
          <ReportSection title="ข้อความทั้งหมด" note="ตรวจและแก้หมวดได้ การแก้จะใช้กับทุกคนในทีม">
            <ul className="divide-y divide-line">
              {fb.map((f) => (
                <li key={f.id} className="py-3">
                  <p className="whitespace-pre-line text-sm text-ink">{f.message}</p>
                  <p className="mb-1.5 mt-1 text-xs text-muted">
                    {f.role ? ROLE[f.role] : "—"} · {formatDateTime(f.at)}
                  </p>
                  <FeedbackTagger id={f.id} kind={f.kind} topics={f.topics} manual={f.manual} />
                </li>
              ))}
            </ul>
          </ReportSection>
        )}
        <p className="text-xs text-faint">
          ไอเดียคำนวณจากกฎง่าย ๆ (เช่น ห้องที่ลงทะเบียนไม่ถึงครึ่ง วันที่สอบชนกัน คำที่พูดถึงบ่อย) ไม่ได้ส่งข้อมูลออกไปนอกระบบ · ช่วงที่ใช้มากที่สุด:{" "}
          {v.peak ? `วัน${DAYS.th[v.peak.day]} ${v.peak.hour}:00` : "—"}
        </p>
      </div>
    </Container>
  );
}
