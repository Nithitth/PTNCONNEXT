import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink, FileText, FolderOpen, Info, ListOrdered, PieChart, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { Calculator } from "@/components/tcas/Calculator";
import { TargetButtons } from "@/components/tcas/TargetButtons";
import { RoadmapButton } from "@/components/tcas/roadmap/RoadmapButton";
import { Card, Container, Notice, PageHeader, cx } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatDateTime } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";
import { LAST_YEAR_LABEL, examInfo, fmtNum, isProgramId, mytcasUrl, type Round3Option } from "@/lib/tcas";
import { loadMyTargets, loadProgram } from "@/lib/tcasData";

export const metadata: Metadata = { title: "หลักสูตร · TCAS" };

const UNSUPPORTED = "โครงการนี้ใช้เกณฑ์พิเศษ ดูรายละเอียดที่ mytcas";
const seats = (n: number | null) => (n === null ? "" : `รับ ${n.toLocaleString("th-TH")} คน`);
const scoreLabel = (code: string) => examInfo(code)?.label ?? code;

// Segment colours for the weight bar (decorative; each exam is also named in the legend).
const WEIGHT_COLORS = [
  "var(--color-brand)",
  "var(--tcas-violet)",
  "var(--chance-3)",
  "var(--chance-4)",
  "var(--color-brand-deep)",
  "var(--color-exam)",
  "var(--color-muted)",
];

function Round3Table({ option, programId }: { option: Round3Option; programId: string }) {
  if (option.problem) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong bg-sunken px-4 py-3 text-sm text-muted">
        {UNSUPPORTED} ({option.problem}){" "}
        <a href={mytcasUrl(programId)} target="_blank" rel="noopener noreferrer" className="font-bold text-brand hover:underline">
          เปิด mytcas
        </a>
      </p>
    );
  }
  const weights = Object.entries(option.weights).sort((a, b) => b[1] - a[1]);
  const mins = Object.entries(option.minimums).filter(([code]) => code !== "gpax");
  const hasMinimums = option.minGpax !== null || option.minTotal !== null || mins.length > 0;
  return (
    <div className="space-y-4">
      {/* How the total is made: one bar, one segment per exam */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink">
          <PieChart aria-hidden className="h-4 w-4 text-brand" />
          คะแนนรวมคิดจาก
        </p>
        <div aria-hidden className="flex h-3.5 overflow-hidden rounded-full bg-sunken">
          {weights.map(([code, w], i) => (
            <span key={code} style={{ width: `${w}%`, background: WEIGHT_COLORS[i % WEIGHT_COLORS.length] }} />
          ))}
        </div>
        <table className="mt-3 w-full text-sm">
          <caption className="sr-only">สัดส่วนคะแนน</caption>
          <tbody className="divide-y divide-line">
            {weights.map(([code, w], i) => (
              <tr key={code}>
                <th scope="row" className="py-2 pr-3 text-left font-normal text-ink">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: WEIGHT_COLORS[i % WEIGHT_COLORS.length] }} />
                    {scoreLabel(code)}
                  </span>
                </th>
                <td className="py-2 text-right font-bold tabular-nums text-ink">{w}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMinimums && (
        <div className="rounded-2xl border border-line bg-page p-3.5">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink">
            <ShieldCheck aria-hidden className="h-4 w-4 text-brand" />
            เกณฑ์ขั้นต่ำ (ต้องผ่านทุกข้อจึงจะสมัครได้)
          </p>
          <ul className="flex flex-wrap gap-1.5 text-xs font-bold">
            {option.minGpax !== null && <li className="rounded-lg bg-surface px-2.5 py-1 text-ink shadow-soft-sm">GPAX ≥ {option.minGpax.toFixed(2)}</li>}
            {option.minTotal !== null && <li className="rounded-lg bg-surface px-2.5 py-1 text-ink shadow-soft-sm">คะแนนรวม ≥ {option.minTotal}</li>}
            {mins.map(([code, v]) => (
              <li key={code} className="rounded-lg bg-surface px-2.5 py-1 text-ink shadow-soft-sm">
                {scoreLabel(code)} ≥ {v}
              </li>
            ))}
          </ul>
        </div>
      )}

      {option.lastYear && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: `ต่ำสุดปี ${LAST_YEAR_LABEL}`, value: fmtNum(option.lastYear.min) },
            { label: `สูงสุดปี ${LAST_YEAR_LABEL}`, value: fmtNum(option.lastYear.max) },
            { label: "รับ", value: option.lastYear.seats !== null ? `${fmtNum(option.lastYear.seats)} คน` : "–" },
            { label: "ผู้สมัคร", value: option.lastYear.applicants !== null ? `${fmtNum(option.lastYear.applicants)} คน` : "–" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-line bg-surface px-3 py-2">
              <p className="text-[11px] font-bold text-muted">{s.label}</p>
              <p className="font-display text-lg font-extrabold tabular-nums text-ink">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {option.extraConditions && (
        <p className="flex gap-1.5 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
          <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          มีเงื่อนไขเพิ่มเติม (เช่น คะแนนรวมบางวิชา หรือผลสอบภาษาอังกฤษ) ดูรายละเอียดที่ mytcas
        </p>
      )}
    </div>
  );
}

/** "How Round 3 works" for this program: the steps in order, naming the exams it actually uses. */
function Round3Steps({ option }: { option: Round3Option | null }) {
  const exams = option ? Object.keys(option.weights).filter((c) => examInfo(c)?.max === 100) : [];
  const steps = [
    {
      title: "สอบให้ครบทุกวิชาที่หลักสูตรใช้",
      body: exams.length ? exams.map(scoreLabel).join(" · ") : "TGAT / TPAT / A-Level ตามที่หลักสูตรกำหนด",
    },
    { title: "ตรวจว่าผ่านเกณฑ์ขั้นต่ำ", body: "เกรดเฉลี่ยและคะแนนแต่ละวิชาต้องไม่ต่ำกว่าที่กำหนด" },
    { title: "ลองคำนวณคะแนนรวม", body: "ใช้เครื่องคำนวณด้านบน เทียบกับคะแนนต่ำสุดของปีที่แล้ว" },
    { title: "สมัครที่ mytcas ในช่วงรับสมัครรอบ 3", body: "เรียงอันดับหลักสูตรที่อยากเข้า ดูวันที่และจำนวนอันดับที่ mytcas" },
  ];
  return (
    <ol className="grid gap-2 sm:grid-cols-2">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3 rounded-2xl border border-line bg-page p-3">
          <span className="bg-brand-gradient grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold text-white shadow-brand-glow">
            {i + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-ink">{s.title}</span>
            <span className="block text-xs leading-relaxed text-muted">{s.body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default async function ProgramPage({ params }: PageProps<"/tcas/[programId]">) {
  const profile = await requireProfile();
  const { programId } = await params;
  if (!isProgramId(programId)) notFound();

  const supabase = await createClient();
  const isStudent = profile.role === "student";
  const [program, targets, roadmap] = await Promise.all([
    loadProgram(programId),
    isStudent ? loadMyTargets(supabase) : Promise.resolve([]),
    // Everyone can have a roadmap (students, teachers, admins); RLS returns only your own.
    supabase.from("tcas_roadmaps").select("program_id, program:tcas_programs(name_th)").maybeSingle().then((r) => r.data),
  ]);
  if (!program) notFound();
  const saved = targets.find((t) => t.programId === programId) ?? null;
  const usable = program.round3.filter((o) => !o.problem);
  const roadmapState = !roadmap ? "none" : roadmap.program_id === programId ? "this" : "other";
  const roadmapName = (roadmap?.program as { name_th?: string } | null | undefined)?.name_th;

  return (
    <Container className="py-10">
      <Link
        href="/tcas"
        className="-ml-2 mb-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold text-muted transition-colors hover:bg-surface hover:text-brand"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        TCAS
      </Link>
      <PageHeader eyebrow={`${program.universityName} · ${program.faculty}`} title={program.nameTh} subtitle={program.nameEn} />

      {!program.active && (
        <div className="mb-5 space-y-3">
          <Notice tone="warning">หลักสูตรนี้ไม่มีในข้อมูลล่าสุด</Notice>
          {/* A dead target must stay removable (the PDPA notice promises it). */}
          {saved && <TargetButtons programId={program.programId} initiallySaved removeOnly />}
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
        <span>{program.programType}</span>
        {program.campus && <span>{program.campus}</span>}
        {program.field && <span>สาขา {program.field}</span>}
        <a
          href={mytcasUrl(program.programId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-bold text-brand hover:underline"
        >
          ดูต้นฉบับที่ mytcas
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Which rounds this program is open in, at a glance */}
      <div className="mb-5 flex flex-wrap gap-2">
        {program.round1.length > 0 ? (
          <a
            href="#round1"
            className="inline-flex items-center gap-2 rounded-xl border border-brand/40 bg-surface px-3.5 py-2 text-sm font-bold text-brand transition-colors hover:bg-brand-soft"
          >
            <CheckCircle2 aria-hidden className="h-4 w-4" />
            เปิดรับรอบ 1 Portfolio · {program.round1.length} โครงการ
          </a>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-xl border border-line bg-sunken px-3.5 py-2 text-sm font-bold text-muted">
            <XCircle aria-hidden className="h-4 w-4" />
            ไม่เปิดรับรอบ 1
          </span>
        )}
        {program.round3.length > 0 ? (
          <a
            href="#round3"
            className="inline-flex items-center gap-2 rounded-xl border border-brand/40 bg-surface px-3.5 py-2 text-sm font-bold text-brand transition-colors hover:bg-brand-soft"
          >
            <CheckCircle2 aria-hidden className="h-4 w-4" />
            เปิดรับรอบ 3 Admission
          </a>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-xl border border-line bg-sunken px-3.5 py-2 text-sm font-bold text-muted">
            <XCircle aria-hidden className="h-4 w-4" />
            ไม่เปิดรับรอบ 3
          </span>
        )}
      </div>

      {program.round1.length > 0 && (
        <section
          id="round1"
          aria-labelledby="round1-title"
          className="animate-rise mb-6 scroll-mt-20 rounded-2xl border border-line bg-surface p-5 sm:p-7"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="round1-title" className="flex items-center gap-2.5 font-display text-lg font-bold text-ink">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand">
                <FolderOpen aria-hidden className="h-4 w-4" />
              </span>
              รอบ 1 Portfolio
            </h2>
            <span className="rounded-lg bg-sunken px-2.5 py-1 text-xs font-bold text-muted">
              {program.round1.length} โครงการ{program.round1Seats ? ` · ${seats(program.round1Seats)}` : ""}
            </span>
          </div>
          <ul className={cx("grid gap-3", program.round1.length > 1 && "md:grid-cols-2")}>
            {program.round1.map((p, i) => (
              <li key={i} className="rounded-xl border border-line bg-page p-4">
                <p className="font-display text-base font-bold leading-snug text-ink">
                  {p.projectName ?? "โครงการรอบ 1"}
                </p>
                {p.seats !== null && (
                  <p className="mt-1 inline-flex rounded-md bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand">{seats(p.seats)}</p>
                )}
                {p.portfolio && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer font-bold text-brand">
                      <FileText aria-hidden className="mr-1 inline h-4 w-4" />
                      สิ่งที่ต้องใช้ในแฟ้มสะสมผลงาน
                    </summary>
                    <p className="mt-2 whitespace-pre-line leading-relaxed text-muted">{p.portfolio}</p>
                  </details>
                )}
                {p.criteria && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer font-bold text-brand">เกณฑ์การคัดเลือก</summary>
                    <p className="mt-2 whitespace-pre-line leading-relaxed text-muted">{p.criteria}</p>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(program.active || roadmapState === "this") && (
        <div className="mb-5">
          <RoadmapButton
            programId={program.programId}
            position={saved?.position ?? usable[0]?.position ?? 0}
            state={roadmapState}
            currentName={roadmapName}
          />
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          {usable.length > 0 ? (
            <section className="mesh-tcas animate-rise relative overflow-hidden rounded-3xl p-2 sm:p-3">
              <div aria-hidden className="tcas-blob -right-16 -top-16 h-56 w-56 bg-[#8a4fd8]/20" />
              <div aria-hidden className="tcas-blob -bottom-20 -left-10 h-56 w-56 bg-brand/15 [animation-delay:-9s]" />
              <div className="glass rounded-[22px] p-5 sm:p-6">
                <h2 className="mb-5 font-display text-xl font-bold text-ink">ลองคำนวณคะแนนรอบ 3</h2>
                <Calculator
                  programId={program.programId}
                  options={usable}
                  saved={saved ? { position: saved.position, scores: saved.sliderScores } : null}
                  canSave={isStudent && program.active}
                />
              </div>
            </section>
          ) : (
            isStudent &&
            program.active && (
              <Card className="animate-rise">
                <p className="mb-3 text-sm text-muted">หลักสูตรนี้ไม่มีเครื่องคำนวณคะแนน แต่บันทึกเป็นเป้าหมายไว้ดูภายหลังได้</p>
                <TargetButtons programId={program.programId} initiallySaved={Boolean(saved)} />
              </Card>
            )
          )}

          <section
            id="round3"
            aria-labelledby="round3-title"
            className="animate-rise delay-1 scroll-mt-20 overflow-hidden rounded-3xl border border-line bg-surface shadow-soft-lg"
          >
            <div className="bg-feature-gradient speed-lines px-5 py-5 text-white sm:px-7">
              <p className="flex items-center gap-1.5 text-xs font-bold text-white/85">
                <Sparkles aria-hidden className="h-3.5 w-3.5" />
                ใช้คะแนนสอบกลาง TGAT · TPAT · A-Level
              </p>
              <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
                <h2 id="round3-title" className="font-display text-2xl font-extrabold">
                  รอบ 3 Admission
                </h2>
                {program.round3Seats !== null && (
                  <span className="rounded-xl bg-white/15 px-3 py-1.5 text-sm font-bold">{seats(program.round3Seats)}</span>
                )}
              </div>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/85">
                หลักสูตรนำคะแนนแต่ละวิชามาคิดตามสัดส่วนด้านล่าง เป็นคะแนนรวมเต็ม 100 แล้วเรียงคนที่ได้คะแนนสูงสุดจนครบจำนวนที่รับ
              </p>
            </div>

            <div className="space-y-6 p-5 sm:p-7">
              {program.round3.length === 0 ? (
                <p className="text-sm text-muted">หลักสูตรนี้ไม่เปิดรับรอบ 3</p>
              ) : (
                <>
                  <div>
                    <h3 className="mb-2.5 flex items-center gap-1.5 font-display text-base font-bold text-ink">
                      <ListOrdered aria-hidden className="h-4 w-4 text-brand" />
                      ขั้นตอนรอบ 3 ของหลักสูตรนี้
                    </h3>
                    <Round3Steps option={usable[0] ?? null} />
                  </div>
                  {program.round3.map((o) => (
                    <div key={o.position} className={cx(program.round3.length > 1 && "border-t border-line pt-5")}>
                      {program.round3.length > 1 && (
                        <p className="mb-3 font-display text-base font-bold text-ink">
                          {o.projectName ?? `แบบที่ ${o.position + 1}`}{" "}
                          <span className="text-sm font-normal text-muted">{seats(o.seats)}</span>
                        </p>
                      )}
                      <Round3Table option={o} programId={program.programId} />
                    </div>
                  ))}
                  <p className="text-xs text-muted">
                    เกณฑ์ TCAS70 — ปีที่น้องสมัครอาจเปลี่ยน ตรวจรายละเอียดล่าสุดที่{" "}
                    <a href={mytcasUrl(program.programId)} target="_blank" rel="noopener noreferrer" className="font-bold text-brand hover:underline">
                      mytcas
                    </a>
                  </p>
                </>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-5">
          {program.round1.length === 0 && (
            <Card className="animate-rise delay-2">
              <h2 className="mb-2 font-display text-lg font-bold text-ink">รอบ 1 Portfolio</h2>
              <p className="text-sm text-muted">หลักสูตรนี้ไม่เปิดรับรอบ 1</p>
            </Card>
          )}

          {program.cost && (
            <Card className="animate-rise delay-3">
              <h2 className="mb-2 font-display text-base font-bold text-ink">ค่าใช้จ่าย</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{program.cost}</p>
            </Card>
          )}
        </div>
      </div>

      <p className="mt-8 text-xs text-faint">
        ข้อมูล TCAS70 จาก{" "}
        <a href={mytcasUrl(program.programId)} target="_blank" rel="noopener noreferrer" className="underline hover:text-brand">
          mytcas.com (ทปอ.)
        </a>{" "}
        · อัปเดต {program.publishedAt ? formatDateTime(program.publishedAt) : "-"}
      </p>
    </Container>
  );
}
