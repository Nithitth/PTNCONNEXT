import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CompareToggle } from "@/components/tcas/CompareTray";
import { cx } from "@/components/ui";
import { facultyColor, isLightColor } from "@/lib/facultyColors";
import { UniversityLogo } from "@/components/tcas/UniversityLogo";
import { LAST_YEAR_LABEL, fmtNum as fmt, universityShort as shortName } from "@/lib/tcas";
import { competition, type ProgramCard, type ProgramSort } from "@/lib/tcasData";


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

/**
 * One program: logo, name, type, compare tick. Scores, competition and seats live on the program page;
 * a row only shows the value the list is sorted by.
 */
function ProgramRow({ p, showFaculty, sort }: { p: ProgramCard; showFaculty: boolean; sort: ProgramSort }) {
  const color = facultyColor(p.universityId, p.faculty);
  const ratio = competition(p);
  return (
    <li
      className="flex items-center gap-3 border-l-[3px] bg-surface px-3 py-3 transition-colors hover:bg-brand-soft/40 sm:px-4"
      style={{ borderLeftColor: isLightColor(color.hex) ? "var(--color-line-strong)" : color.hex }}
    >
      <UniversityLogo id={p.universityId} className="shadow-soft-sm" />
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
          {(sort === "low" || sort === "high") && (
            <span className="rounded-md bg-sunken px-1.5 py-0.5 font-bold tabular-nums text-ink">
              {p.lastMin !== null ? `ต่ำสุดปี ${LAST_YEAR_LABEL}: ${fmt(p.lastMin)}` : "ไม่มีคะแนนปีที่แล้ว"}
            </span>
          )}
          {sort === "competition" && (
            <span className="rounded-md bg-sunken px-1.5 py-0.5 font-bold tabular-nums text-ink">
              {ratio !== null ? `≈ ${fmt(Math.round(ratio * 10) / 10)} คน/ที่` : "ไม่มีข้อมูลการแข่งขัน"}
            </span>
          )}
        </span>
      </Link>
      <CompareToggle item={{ id: p.programId, name: p.nameTh, uni: shortName(p.universityId) }} />
      <ChevronRight aria-hidden className="hidden h-4 w-4 shrink-0 text-faint sm:block" />
    </li>
  );
}


/**
 * Programs grouped university → faculty (colour-coded, collapsible), or a flat list when sorted by score
 * or competition (each row then names its university and faculty).
 */
export function ProgramList({ programs, sort }: { programs: ProgramCard[]; sort: ProgramSort }) {
  const grouped = sort === "faculty";
  if (!grouped) {
    return (
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line shadow-soft-sm">
        {programs.map((p) => (
          <ProgramRow key={p.programId} p={p} showFaculty sort={sort} />
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
              <UniversityLogo id={uniId} size={32} />
              {university}
            </h2>
            <div className="space-y-2">
              {[...faculties].map(([faculty, list]) => {
                const color = facultyColor(uniId, faculty);
                return (
                  <details
                    key={faculty}
                    open
                    className="group/fac overflow-hidden rounded-2xl border border-line bg-surface shadow-soft-sm"
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                      <span
                        aria-hidden
                        className={cx("h-6 w-1.5 shrink-0 rounded-full", isLightColor(color.hex) && "ring-1 ring-line-strong")}
                        style={{ background: color.hex }}
                      />
                      <span className="min-w-0 flex-1 text-sm font-bold text-ink">
                        {faculty}
                        <span className="ml-2 text-xs font-normal text-muted">{list.length} หลักสูตร</span>
                      </span>
                      <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-faint transition-transform group-open/fac:rotate-180" />
                    </summary>
                    <ul className="divide-y divide-line border-t border-line">
                      {list.map((p) => (
                        <ProgramRow key={p.programId} p={p} showFaculty={false} sort={sort} />
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
