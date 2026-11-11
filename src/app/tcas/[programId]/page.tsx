import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileText, Info } from "lucide-react";
import { Calculator } from "@/components/tcas/Calculator";
import { TargetButtons } from "@/components/tcas/TargetButtons";
import { Card, Container, Notice, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatDateTime } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";
import { examInfo, type Round3Option } from "@/lib/tcas";
import { loadMyTargets, loadProgram } from "@/lib/tcasData";

export const metadata: Metadata = { title: "หลักสูตร · TCAS" };

const PROGRAM_ID = /^[0-9A-Z]{10,20}$/;
const UNSUPPORTED = "โครงการนี้ใช้เกณฑ์พิเศษ ดูรายละเอียดที่ mytcas";
const mytcasUrl = (id: string) => `https://course.mytcas.com/programs/${id}`;
const seats = (n: number | null) => (n === null ? "" : `รับ ${n.toLocaleString("th-TH")} คน`);
const scoreLabel = (code: string) => examInfo(code)?.label ?? code;

function Round3Table({ option, programId }: { option: Round3Option; programId: string }) {
  if (option.problem) {
    return (
      <p className="text-sm text-muted">
        {UNSUPPORTED} ({option.problem}){" "}
        <a href={mytcasUrl(programId)} target="_blank" rel="noopener noreferrer" className="font-bold text-brand hover:underline">
          เปิด mytcas
        </a>
      </p>
    );
  }
  const weights = Object.entries(option.weights).sort((a, b) => b[1] - a[1]);
  const mins = Object.entries(option.minimums).filter(([code]) => code !== "gpax");
  return (
    <div className="space-y-3">
      <table className="w-full text-sm">
        <caption className="sr-only">สัดส่วนคะแนน</caption>
        <tbody className="divide-y divide-line">
          {weights.map(([code, w]) => (
            <tr key={code}>
              <th scope="row" className="py-2 pr-3 text-left font-normal text-ink">
                {scoreLabel(code)}
              </th>
              <td className="py-2 text-right font-bold tabular-nums text-ink">{w}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="space-y-1 text-sm text-muted">
        {option.minGpax !== null && <li>GPAX ขั้นต่ำ {option.minGpax.toFixed(2)}</li>}
        {option.minTotal !== null && <li>คะแนนรวมขั้นต่ำ {option.minTotal}</li>}
        {mins.map(([code, v]) => (
          <li key={code}>
            {scoreLabel(code)} ขั้นต่ำ {v}
          </li>
        ))}
        {option.extraConditions && (
          <li className="flex gap-1.5 text-ink">
            <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            มีเงื่อนไขเพิ่มเติม (เช่น คะแนนรวมบางวิชา หรือผลสอบภาษาอังกฤษ) ดูรายละเอียดที่ mytcas
          </li>
        )}
      </ul>
    </div>
  );
}

export default async function ProgramPage({ params }: PageProps<"/tcas/[programId]">) {
  const profile = await requireProfile();
  const { programId } = await params;
  if (!PROGRAM_ID.test(programId)) notFound();

  const supabase = await createClient();
  const isStudent = profile.role === "student";
  const [program, targets] = await Promise.all([
    loadProgram(supabase, programId),
    isStudent ? loadMyTargets(supabase) : Promise.resolve([]),
  ]);
  if (!program) notFound();
  const saved = targets.find((t) => t.programId === programId) ?? null;
  const usable = program.round3.filter((o) => !o.problem);

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

          <Card className="animate-rise delay-1">
            <h2 className="mb-3 font-display text-lg font-bold text-ink">
              รอบ 3 Admission <span className="text-sm font-normal text-muted">{seats(program.round3Seats)}</span>
            </h2>
            {program.round3.length === 0 ? (
              <p className="text-sm text-muted">ไม่เปิดรับรอบ 3</p>
            ) : (
              <div className="space-y-5">
                {program.round3.map((o) => (
                  <div key={o.position}>
                    {program.round3.length > 1 && (
                      <p className="mb-2 text-sm font-bold text-ink">
                        {o.projectName ?? `แบบที่ ${o.position + 1}`}{" "}
                        <span className="font-normal text-muted">{seats(o.seats)}</span>
                      </p>
                    )}
                    <Round3Table option={o} programId={program.programId} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="animate-rise delay-2">
            <h2 className="mb-3 font-display text-lg font-bold text-ink">
              รอบ 1 Portfolio <span className="text-sm font-normal text-muted">{seats(program.round1Seats)}</span>
            </h2>
            {program.round1.length === 0 ? (
              <p className="text-sm text-muted">ไม่เปิดรับรอบ 1</p>
            ) : (
              <ul className="space-y-4">
                {program.round1.map((p, i) => (
                  <li key={i} className="border-b border-line pb-4 last:border-b-0 last:pb-0">
                    <p className="text-sm font-bold text-ink">
                      {p.projectName ?? "โครงการรอบ 1"} <span className="font-normal text-muted">{seats(p.seats)}</span>
                    </p>
                    {p.portfolio && (
                      <details className="mt-2 text-sm">
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
            )}
          </Card>

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
