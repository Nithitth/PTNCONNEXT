import { TCAS_UNIVERSITIES } from "@/lib/tcas";
import { UNIVERSITY_ART } from "@/lib/tcasArt";

/** Photo and emblem credits for the TCAS window (required by the CC BY / BY-SA licences). */
export function TcasCredits() {
  return (
    <details className="mt-10 text-xs text-faint">
      <summary className="cursor-pointer font-bold hover:text-brand">เครดิตภาพ</summary>
      <ul className="mt-2 space-y-1 leading-relaxed">
        {TCAS_UNIVERSITIES.flatMap((u) =>
          UNIVERSITY_ART[u.id].credits.map((c) => (
            <li key={c.url} className="break-words">
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-brand">
                {c.title}
              </a>{" "}
              โดย {c.author} · {c.licence} · ผ่าน Wikimedia Commons
            </li>
          )),
        )}
      </ul>
    </details>
  );
}
