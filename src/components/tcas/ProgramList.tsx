import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CompareToggle } from "@/components/tcas/CompareTray";
import { cx } from "@/components/ui";
import { facultyColor, isLightColor } from "@/lib/facultyColors";
import { LAST_YEAR_LABEL, TCAS_UNIVERSITIES } from "@/lib/tcas";
import { UNIVERSITY_ART } from "@/lib/tcasArt";
import { competition, type ProgramCard } from "@/lib/tcasData";

const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const shortName = (id: string) => TCAS_UNIVERSITIES.find((u) => u.id === id)?.short ?? "";

/** Faculty colour dot (outlined when the colour is white/cream). */
export function FacultyDot({ hex, className }: { hex: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block shrink-0 rounded-full", isLightColor(hex) && "ring-1 ring-line-strong", className ?? "h-2.5 w-2.5")}
      style={{ background: hex }}
    />
  );
}

/** One program: logo, name, last year's range and competition, compare tick. */
function ProgramRow({ p, showFaculty }: { p: ProgramCard; showFaculty: boolean }) {
  const color = facultyColor(p.universityId, p.faculty);
  const ratio = competition(p);
  return (
    <li
      className="flex items-center gap-3 border-l-[3px] bg-surface px-3 py-3 transition-colors hover:bg-brand-soft/40 sm:px-4"
      style={{ borderLeftColor: isLightColor(color.hex) ? "var(--color-line-strong)" : color.hex }}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-white shadow-soft-sm">
        <Image src={UNIVERSITY_ART[p.universityId]?.emblem ?? "/brand/arrow-white.png"} alt={shortName(p.universityId)} width={40} height={40} className="h-[70%] w-[70%] object-contain" />
      </span>
      <Link href={`/tcas/${p.programId}`} className="group min-w-0 flex-1">
        <span className="block text-sm font-bold leading-snug text-ink group-hover:text-brand">{p.nameTh}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {showFaculty && (
            <span className="inline-flex items-center gap-1.5">
              <FacultyDot hex={color.hex} className="h-2 w-2" />
              {shortName(p.universityId)} · {p.faculty}
            </span>
          )}
          <span>{p.programType}</span>
          {p.lastMin !== null && p.lastMax !== null ? (
            <span className="rounded-md bg-sunken px-1.5 py-0.5 font-bold tabular-nums text-ink">
              ปี {LAST_YEAR_LABEL}: {fmt(p.lastMin)}–{fmt(p.lastMax)}
            </span>
          ) : (
            <span className="text-faint">ไม่มีคะแนนปีที่แล้ว</span>
          )}
          {ratio !== null && (
            <span title={`สมัคร ${p.lastApplicants?.toLocaleString("th-TH")} · รับ ${p.lastSeats?.toLocaleString("th-TH")}`}>
              ≈ {fmt(Math.round(ratio * 10) / 10)} คน/ที่
            </span>
          )}
          {p.round3Seats !== null && <span>รอบ 3 รับ {p.round3Seats.toLocaleString("th-TH")}</span>}
        </span>
      </Link>
      <CompareToggle item={{ id: p.programId, name: p.nameTh, uni: shortName(p.universityId) }} />
      <ChevronRight aria-hidden className="hidden h-4 w-4 shrink-0 text-faint sm:block" />
    </li>
  );
}

const facultyKey = (p: ProgramCard) => `${p.universityId}|${p.faculty}`;
export const facultyAnchor = (key: string) => `fac-${Math.abs([...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7))}`;

/**
 * Programs grouped university → faculty (colour-coded, collapsible), or a flat list when sorted by score
 * or competition (each row then names its university and faculty).
 */
export function ProgramList({ programs, grouped }: { programs: ProgramCard[]; grouped: boolean }) {
  if (!grouped) {
    return (
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line shadow-soft-sm">
        {programs.map((p) => (
          <ProgramRow key={p.programId} p={p} showFaculty />
        ))}
      </ul>
    );
  }

  const byUniversity = new Map<string, Map<string, ProgramCard[]>>();
  for (const p of programs) {
    const faculties = byUniversity.get(p.universityName) ?? new Map<string, ProgramCard[]>();
    faculties.set(p.faculty, [...(faculties.get(p.faculty) ?? []), p]);
    byUniversity.set(p.universityName, faculties);
  }

  return (
    <div className="space-y-6">
      {[...byUniversity].map(([university, faculties]) => {
        const uniId = [...faculties.values()][0][0].universityId;
        return (
          <section key={university}>
            <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-bold text-ink">
              <span className="grid h-8 w-8 place-items-center rounded-full border border-line bg-white">
                <Image src={UNIVERSITY_ART[uniId]?.emblem ?? "/brand/arrow-white.png"} alt="" width={32} height={32} className="h-[70%] w-[70%] object-contain" />
              </span>
              {university}
            </h2>
            <div className="space-y-2">
              {[...faculties].map(([faculty, list]) => {
                const color = facultyColor(uniId, faculty);
                const key = facultyKey(list[0]);
                return (
                  <details
                    key={faculty}
                    id={facultyAnchor(key)}
                    open
                    className="group/fac scroll-mt-40 overflow-hidden rounded-2xl border border-line bg-surface shadow-soft-sm"
                    style={{ "--fac": color.hex } as CSSProperties}
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                      <span
                        aria-hidden
                        className={cx("h-6 w-1.5 shrink-0 rounded-full", isLightColor(color.hex) && "ring-1 ring-line-strong")}
                        style={{ background: color.hex }}
                      />
                      <span className="min-w-0 flex-1 text-sm font-bold text-ink">
                        {faculty}
                        <span className="ml-2 text-xs font-normal text-muted">
                          สี{color.name} · {list.length} หลักสูตร
                        </span>
                      </span>
                      <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-faint transition-transform group-open/fac:rotate-180" />
                    </summary>
                    <ul className="divide-y divide-line border-t border-line">
                      {list.map((p) => (
                        <ProgramRow key={p.programId} p={p} showFaculty={false} />
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Coloured chips that jump to each faculty section in the grouped list. */
export function FacultyJump({ programs }: { programs: ProgramCard[] }) {
  const seen = new Map<string, ProgramCard>();
  for (const p of programs) if (!seen.has(facultyKey(p))) seen.set(facultyKey(p), p);
  if (seen.size < 2) return null;
  const manyUnis = new Set(programs.map((p) => p.universityId)).size > 1;
  return (
    <nav aria-label="ไปที่คณะ" className="mb-4 flex flex-wrap gap-1.5">
      {[...seen].map(([key, p]) => (
        <a
          key={key}
          href={`#${facultyAnchor(key)}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-bold text-muted transition-colors hover:border-brand/30 hover:text-brand"
        >
          <FacultyDot hex={facultyColor(p.universityId, p.faculty).hex} />
          {manyUnis ? `${shortName(p.universityId)} ` : ""}
          {p.faculty.replace(/^คณะ/, "")}
        </a>
      ))}
    </nav>
  );
}
