import type { Metadata } from "next";
import { Users } from "lucide-react";
import { AdminBack } from "@/components/admin/AdminBack";
import {
  Bars,
  Delta,
  Findings,
  Funnel,
  Heatmap,
  ImpactCards,
  ObjectiveCard,
  ReportSection,
  RoomRanking,
  ScoreGauge,
  SparkTitle,
  Stat,
  WeeklyBars,
  WorkloadView,
} from "@/components/admin/report/ReportParts";
import { ReportControls, SchoolCalculator } from "@/components/admin/report/ReportClient";
import { Brand, Container } from "@/components/ui";
import { dayKey } from "@/lib/calendar";
import { formatDay, formatRange, formatValue, T } from "@/lib/report";
import { peakText } from "@/lib/reportAnalysis";
import { reportFor } from "./load";

export const metadata: Metadata = { title: "รายงาน & OKR · คอนโซลผู้พัฒนา" };

const POST_TYPES = {
  assignment: { th: "มอบหมายงาน", en: "Assignments" },
  exam: { th: "ประกาศวันสอบ", en: "Exams" },
  material: { th: "แชร์เอกสาร", en: "Materials" },
  event: { th: "กิจกรรมโรงเรียน", en: "School events" },
} as const;

/** รายงาน & OKR: everything a report about Connext needs, for one date range, printable as A4. */
export default async function ReportPage({ searchParams }: PageProps<"/admin/report">) {
  const { view: v } = await reportFor(await searchParams);
  const lang = v.lang;
  const t = T[lang];
  const s = v.stats;
  const p = v.prev;
  const th = lang === "th";
  const stagesTotal = Object.values(v.roadmapStages).reduce((a, b) => a + b, 0);

  return (
    <Container className="py-10 print:py-0">
      <div className="print:hidden">
        <AdminBack />
      </div>
      <ReportControls range={v.range} lang={lang} />

      <div lang={lang} className="space-y-5">
        {/* Cover */}
        <section className="bg-brand-gradient speed-lines relative overflow-hidden rounded-3xl p-6 text-white shadow-brand-glow sm:p-10 print:shadow-none">
          <div className="grid items-center gap-6 lg:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white/80">
                <Brand className="text-white">PTN Connext</Brand> · {t.title}
              </p>
              <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight sm:text-5xl">{formatRange(v.range, lang)}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/85 sm:text-base">{t.about}</p>
              <p className="mt-4 text-xs text-white/70">
                {t.generated} {formatDay(dayKey(new Date()), lang)} · {t.presets[v.range.preset]}
              </p>
            </div>
            <div className="justify-self-center rounded-3xl bg-white/10 p-4 backdrop-blur-sm">
              <ScoreGauge score={v.score} prev={v.prevScore} lang={lang} light />
              <p className="mt-1 max-w-[14rem] text-center text-xs text-white/75">{t.scoreNote}</p>
            </div>
          </div>
        </section>

        <ReportSection n={1} title={t.findings}>
          <Findings items={v.findings} lang={lang} />
          {v.themes.length > 0 && (
            <p className="mt-4 rounded-2xl bg-sunken px-4 py-3 text-sm text-muted">
              <b className="text-ink">{th ? "สิ่งที่ผู้ใช้พูดถึงมากที่สุด: " : "What users raise most: "}</b>
              {v.themes.map((x) => `${x[lang]} (${x.count})`).join(" · ")}
            </p>
          )}
        </ReportSection>

        <ReportSection n={2} title={t.okrs}>
          <div className="grid gap-3 lg:grid-cols-2">
            {v.okrs.map((o, i) => (
              <ObjectiveCard key={i} o={o} i={i} lang={lang} />
            ))}
          </div>
        </ReportSection>

        <ReportSection n={3} title={t.impact} note={t.impactNote}>
          <ImpactCards impact={v.impact} lang={lang} />
          <p className="mt-3 text-xs leading-relaxed text-faint">
            {th
              ? `สมมติฐาน: ครูใช้เวลาแจ้งงานห้องละ ${v.assumptions.minutesPerRoom} นาทีถ้าไม่มี Connext · เอกสารละ ${v.assumptions.pagesPerFile} หน้า · ${v.assumptions.bahtPerPage} บาทต่อหน้า · นับเฉพาะนักเรียนที่ลงทะเบียนแล้ว`
              : `Assumptions: ${v.assumptions.minutesPerRoom} minutes per class to announce work without Connext · ${v.assumptions.pagesPerFile} pages per document · ฿${v.assumptions.bahtPerPage} per page · signed-up students only`}
          </p>
        </ReportSection>

        <ReportSection n={4} title={t.adoption}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={th ? "บัญชีทั้งหมด" : "Accounts"} value={formatValue(s.accounts, "count", lang)} />
            <Stat
              label={th ? "ผู้ใช้งานในช่วงนี้" : "Active in period"}
              value={formatValue(s.activeUsers, "count", lang)}
              delta={<Delta now={s.activeUsers} before={p.activeUsers} lang={lang} />}
            />
            <Stat
              label={th ? "ลงทะเบียนใหม่" : "New sign-ups"}
              value={formatValue(s.signups, "count", lang)}
              delta={<Delta now={s.signups} before={p.signups} lang={lang} />}
            />
            <Stat
              label={th ? "เข้าใช้ต่อสัปดาห์ (จากบัญชีทั้งหมด)" : "Weekly active (of accounts)"}
              value={formatValue(s.weeklyActivePct, "pct", lang)}
              delta={<Delta now={s.weeklyActivePct} before={p.weeklyActivePct} lang={lang} />}
            />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <SparkTitle>{t.funnel}</SparkTitle>
              <Funnel steps={v.funnel} lang={lang} />
              <p className="mt-2 text-xs text-faint">{th ? "ตัวเลขด้านขวา = % ที่ไปต่อจากขั้นก่อนหน้า" : "Right-hand % = share who continued from the step before"}</p>
            </div>
            <div>
              <SparkTitle>{t.rooms}</SparkTitle>
              <RoomRanking rooms={v.rooms} lang={lang} />
            </div>
          </div>
          <h3 className="mb-3 mt-6 font-display font-bold text-ink">{t.trends}</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <WeeklyBars title={th ? "ผู้ใช้งานต่อสัปดาห์" : "Active users per week"} series={v.weekly.active} lang={lang} />
            <WeeklyBars title={th ? "ลงทะเบียนใหม่" : "New sign-ups"} series={v.weekly.signups} lang={lang} tone="ink" />
            <WeeklyBars title={th ? "โพสต์ของครู" : "Teacher posts"} series={v.weekly.posts} lang={lang} />
          </div>
        </ReportSection>

        <ReportSection
          n={5}
          title={t.heatmap}
          note={v.peak ? (th ? `ช่วงที่ใช้มากที่สุด: ${peakText(v.peak, "th")}` : `Busiest: ${peakText(v.peak, "en")}`) : undefined}
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <Heatmap title={th ? "นักเรียน" : "Students"} m={v.heat.students} lang={lang} />
            <Heatmap title={th ? "ครูและผู้ดูแล" : "Teachers & admins"} m={v.heat.staff} lang={lang} />
          </div>
          <p className="mt-2 text-xs text-faint">
            {th ? "การเข้าสู่ระบบที่สำเร็จ ตามวันและชั่วโมง (เวลาไทย) ยิ่งเข้มยิ่งมาก" : "Successful log-ins by day and hour (Thai time); darker = more"}
          </p>
        </ReportSection>

        <ReportSection n={6} title={t.workload} note={th ? "กำหนดส่งและวันสอบในช่วงนี้ รวมถึง 14 วันข้างหน้า" : "Deadlines and exams in this period and the next 14 days"}>
          <WorkloadView work={v.work} labels={v.roomLabels} lang={lang} />
        </ReportSection>

        <ReportSection n={7} title={t.teaching}>
          <div className="grid gap-6 lg:grid-cols-3">
            <div>
              <SparkTitle>{th ? "โพสต์ตามประเภท" : "Posts by type"}</SparkTitle>
              <Bars
                lang={lang}
                empty={th ? "ยังไม่มีโพสต์ในช่วงนี้" : "No posts in this period"}
                rows={(Object.keys(POST_TYPES) as (keyof typeof POST_TYPES)[]).map((k) => ({ label: POST_TYPES[k][lang], value: v.postsByType[k] ?? 0 }))}
              />
              <p className="mt-3 text-xs text-muted">
                {th
                  ? `ครูที่โพสต์ ${s.teachersPosting} คน · ไฟล์ ${s.files} · อยู่ใน Google Drive ${s.driveFiles}`
                  : `${s.teachersPosting} teachers posted · ${s.files} files · ${s.driveFiles} in Google Drive`}
              </p>
            </div>
            <div>
              <SparkTitle>{th ? "เป้าหมาย TCAS ยอดนิยม" : "Most-chosen TCAS targets"}</SparkTitle>
              <Bars
                lang={lang}
                empty={th ? "ยังไม่มีกลุ่มที่มีนักเรียน 3 คนขึ้นไป" : "No group of 3+ students yet"}
                rows={v.topTargets.map((x) => ({ label: x.label, value: x.students }))}
              />
            </div>
            <div>
              <SparkTitle>{th ? `ด่าน Roadmap (${stagesTotal} คน)` : `Roadmap stages (${stagesTotal} students)`}</SparkTitle>
              <Bars
                lang={lang}
                empty={th ? "ยังไม่มีด่านที่มีนักเรียน 3 คนขึ้นไป" : "No stage with 3+ students yet"}
                rows={[1, 2, 3, 4, 5, 6].map((n) => ({ label: th ? `ด่าน ${n}` : `Stage ${n}`, value: v.roadmapStages[n] ?? 0 }))}
              />
            </div>
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-faint">
            <Users aria-hidden className="h-3.5 w-3.5" />
            {th ? "แสดงเฉพาะจำนวนรวม กลุ่มที่มีน้อยกว่า 3 คนจะไม่แสดง เพื่อความเป็นส่วนตัว" : "Totals only; groups under 3 students are hidden for privacy"}
          </p>
        </ReportSection>

        <ReportSection n={8} title={t.voice}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat
              label={th ? "ความคิดเห็น" : "Feedback"}
              value={formatValue(s.feedback, "count", lang)}
              delta={<Delta now={s.feedback} before={p.feedback} lang={lang} />}
            />
            <Stat
              label={th ? "เข้าสู่ระบบสำเร็จ" : "Log-in success"}
              value={formatValue(s.loginSuccessPct, "pct", lang)}
              tone={(s.loginSuccessPct ?? 100) >= 95 ? "good" : "bad"}
            />
            <Stat
              label={th ? "ข้อผิดพลาดต่อสัปดาห์" : "Errors per week"}
              value={formatValue(s.errorsPerWeek, "perWeek", lang)}
              delta={<Delta now={s.errorsPerWeek} before={p.errorsPerWeek} lower lang={lang} />}
            />
            <Stat label={th ? "พื้นที่ฟรีที่ใช้" : "Free storage used"} value={`${Math.round(v.storageUse * 100)}%`} tone={v.storageUse >= 0.8 ? "bad" : undefined} />
            <Stat label={th ? "ครูที่ใช้ Google Drive" : "Teachers on Drive"} value={formatValue(s.driveTeachersPct, "pct", lang)} />
          </div>
        </ReportSection>

        <ReportSection
          n={9}
          title={t.calculator}
          note={th ? "สำหรับโรงเรียนที่สนใจ: ใส่ขนาดโรงเรียนเพื่อดูประมาณการต่อปี" : "For interested schools: enter your size to see a yearly estimate"}
        >
          <SchoolCalculator rates={v.rates} assumptions={v.assumptions} lang={lang} />
        </ReportSection>

        <p className="pb-4 text-center text-xs text-faint">
          <Brand>PTN Connext</Brand> · {th ? "ข้อมูลทั้งหมดเป็นจำนวนรวม ไม่ระบุตัวบุคคล" : "All figures are aggregates; no individual is identified"}
        </p>
      </div>
    </Container>
  );
}
