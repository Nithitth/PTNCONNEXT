import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Columns3 } from "lucide-react";
import { CompareTray } from "@/components/tcas/CompareTray";
import { FacultyDot } from "@/components/tcas/ProgramList";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { facultyColor } from "@/lib/facultyColors";
import { UniversityLogo } from "@/components/tcas/UniversityLogo";
import { LAST_YEAR_LABEL, examInfo, fmtNum, isProgramId, universityShort as short } from "@/lib/tcas";
import { competition, loadPrograms, type ProgramDetail } from "@/lib/tcasData";

export const metadata: Metadata = { title: "เปรียบเทียบหลักสูตร · TCAS" };

const fmt = (n: number | null | undefined) => (n == null ? "–" : fmtNum(n));

/** Side-by-side comparison of up to 3 programs (ids from the compare tray). */
export default async function ComparePage({ searchParams }: PageProps<"/tcas/compare">) {
  await requireProfile();
  const raw = (await searchParams).ids;
  const ids = [...new Set((typeof raw === "string" ? raw : "").split(",").filter(isProgramId))].slice(0, 3);
  const programs = ids.length ? await loadPrograms(ids) : [];

  // Round 3 option 0 of each program; the weight rows are the union of their exams (biggest weights first).
  const first = (p: ProgramDetail) => p.round3.find((o) => !o.problem) ?? null;
  const examCodes = [
    ...new Set(
      programs.flatMap((p) =>
        Object.entries(first(p)?.weights ?? {})
          .sort((a, b) => b[1] - a[1])
          .map(([c]) => c),
      ),
    ),
  ];

  const rows: { label: string; cell: (p: ProgramDetail) => ReactNode }[] = [
    { label: "ประเภท", cell: (p) => p.programType },
    { label: "รอบ 3 รับ", cell: (p) => (p.round3Seats === null ? "–" : `${fmt(p.round3Seats)} คน`) },
    { label: `คะแนนต่ำสุด ปี ${LAST_YEAR_LABEL}`, cell: (p) => <b className="tabular-nums">{fmt(p.lastMin)}</b> },
    { label: `คะแนนสูงสุด ปี ${LAST_YEAR_LABEL}`, cell: (p) => <span className="tabular-nums">{fmt(p.lastMax)}</span> },
    {
      label: `การแข่งขัน ปี ${LAST_YEAR_LABEL}`,
      cell: (p) => {
        const r = competition(p);
        return r === null ? "–" : `สมัคร ${fmt(p.lastApplicants)} · รับ ${fmt(p.lastSeats)} (≈ ${fmt(Math.round(r * 10) / 10)} คน/ที่)`;
      },
    },
    ...examCodes.map((code) => ({
      label: examInfo(code)?.label ?? code,
      cell: (p: ProgramDetail) => {
        const w = first(p)?.weights[code];
        return w ? <b className="tabular-nums">{w}%</b> : <span className="text-faint">–</span>;
      },
    })),
    { label: "GPAX ขั้นต่ำ", cell: (p) => (first(p)?.minGpax != null ? first(p)!.minGpax!.toFixed(2) : "–") },
    { label: "คะแนนรวมขั้นต่ำ", cell: (p) => fmt(first(p)?.minTotal) },
    { label: "รอบ 1 รับ", cell: (p) => (p.round1Seats === null ? "ไม่เปิดรับ" : `${fmt(p.round1Seats)} คน`) },
    { label: "ค่าใช้จ่าย", cell: (p) => <span className="line-clamp-4 text-xs">{p.cost || "–"}</span> },
  ];

  return (
    <Container className="pb-28 pt-10">
      <Link
        href="/tcas#search"
        className="-ml-2 mb-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold text-muted transition-colors hover:bg-surface hover:text-brand"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        TCAS
      </Link>
      <PageHeader eyebrow="TCAS70" title="เปรียบเทียบหลักสูตร" subtitle="เทียบเกณฑ์รอบ 3 คะแนนปีที่แล้ว และการแข่งขัน แบบเคียงข้างกัน" />

      {programs.length < 2 ? (
        <EmptyState
          icon={<Columns3 aria-hidden className="h-6 w-6" />}
          title="เลือกอย่างน้อย 2 หลักสูตร"
          body="ติ๊ก “เปรียบเทียบ” ที่หลักสูตรในหน้า TCAS ได้สูงสุด 3 หลักสูตร"
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-soft-sm">
          {/* Fixed layout: equal program columns that fit the box; on phones it scrolls and the label column stays pinned. */}
          <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: `${7 + programs.length * 10.5}rem` }}>
            <colgroup>
              <col className="w-28 sm:w-40" />
              {programs.map((p) => (
                <col key={p.programId} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-sunken p-3 text-left text-xs font-bold text-muted">
                  หลักสูตร
                </th>
                {programs.map((p) => {
                  const c = facultyColor(p.universityId, p.faculty);
                  return (
                    <th key={p.programId} scope="col" className="break-words border-l border-line p-3 text-left align-top">
                      <div className="flex items-center gap-2">
                        <UniversityLogo id={p.universityId} size={36} />
                        <span className="text-xs font-bold text-muted">{short(p.universityId)}</span>
                      </div>
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                        <FacultyDot hex={c.hex} /> {p.faculty}
                      </p>
                      <Link href={`/tcas/${p.programId}`} className="mt-1 block font-bold leading-snug text-ink hover:text-brand">
                        {p.nameTh}
                      </Link>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="sticky left-0 z-10 break-words bg-sunken p-3 text-left text-xs font-bold text-muted">
                    {r.label}
                  </th>
                  {programs.map((p) => (
                    <td key={p.programId} className="break-words border-l border-line p-3 align-top text-ink">
                      {r.cell(p)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-muted">
        สัดส่วนคะแนนแสดงจากโครงการแรกของแต่ละหลักสูตร · คะแนนปี {LAST_YEAR_LABEL} คิดจากเกณฑ์ปีนั้น ใช้เป็นแนวทาง · ข้อมูลจาก
        mytcas.com (ทปอ.)
      </p>
      <CompareTray />
    </Container>
  );
}
