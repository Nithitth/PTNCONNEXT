import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ProgramCard } from "@/lib/tcasData";

/** Programs grouped university → faculty, each linking to its page. */
export function ProgramList({ programs }: { programs: ProgramCard[] }) {
  const byUniversity = new Map<string, Map<string, ProgramCard[]>>();
  for (const p of programs) {
    const faculties = byUniversity.get(p.universityName) ?? new Map<string, ProgramCard[]>();
    faculties.set(p.faculty, [...(faculties.get(p.faculty) ?? []), p]);
    byUniversity.set(p.universityName, faculties);
  }

  return (
    <div className="space-y-6">
      {[...byUniversity].map(([university, faculties]) => (
        <section key={university}>
          <h2 className="mb-2 font-display text-lg font-bold text-ink">{university}</h2>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft-sm">
            {[...faculties].map(([faculty, list]) => (
              <div key={faculty} className="border-b border-line last:border-b-0">
                <p className="bg-sunken px-4 py-2 text-xs font-bold text-muted sm:px-5">{faculty}</p>
                <ul className="divide-y divide-line">
                  {list.map((p) => (
                    <li key={p.programId}>
                      <Link
                        href={`/tcas/${p.programId}`}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-brand-soft sm:px-5"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold leading-snug text-ink">{p.nameTh}</span>
                          <span className="mt-0.5 block text-xs text-muted">
                            {p.programType}
                            {p.round3Seats !== null && ` · รอบ 3 รับ ${p.round3Seats.toLocaleString("th-TH")} คน`}
                          </span>
                        </span>
                        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-faint" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
