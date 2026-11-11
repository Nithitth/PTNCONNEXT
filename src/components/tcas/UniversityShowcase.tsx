import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ShowcaseMotion } from "@/components/tcas/ShowcaseMotion";
import { Container, Eyebrow, cx } from "@/components/ui";
import { TCAS_UNIVERSITIES } from "@/lib/tcas";
import { UNIVERSITY_ART } from "@/lib/tcasArt";

const SECTION_ID = "tcas-top";

// Decorative emblems floating around the big "t" (xl screens only, so they never cover the heading).
const PROPS: { id: string; className: string; size: number; depth: number; delay: string }[] = [
  { id: "001", className: "right-[30%] top-[14%]", size: 76, depth: 0.45, delay: "0s" },
  { id: "005", className: "right-[6%] top-[10%]", size: 64, depth: 0.7, delay: "-1.6s" },
  { id: "006", className: "right-[34%] top-[46%]", size: 56, depth: 0.3, delay: "-3.1s" },
  { id: "002", className: "right-[3%] top-[44%]", size: 60, depth: 0.55, delay: "-2.2s" },
  { id: "009", className: "right-[20%] top-[64%]", size: 52, depth: 0.85, delay: "-0.8s" },
];

const depth = (d: number) => ({ "--depth": d }) as CSSProperties;

/**
 * The TCAS landing window: "อยากเข้า Top University ต้องทำยังไง?" with the 5 universities
 * over their campus photos. Each card opens that university's programs further down (#search).
 */
export function UniversityShowcase({ counts }: { counts: Record<string, number> }) {
  return (
    <section id={SECTION_ID} className="mesh-tcas relative isolate overflow-hidden" aria-labelledby="tcas-top-title">
      {/* Colour blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="tcas-blob -left-24 top-10 h-72 w-72 bg-brand/25" />
        <div className="tcas-blob right-[-6rem] top-[-4rem] h-80 w-80 bg-[#8a4fd8]/25 [animation-delay:-7s]" />
        <div className="tcas-blob bottom-[-6rem] left-1/3 h-72 w-96 bg-brand-hot/20 [animation-delay:-13s]" />
      </div>

      {/* The big gradient "t", launching upward and taking off as you scroll */}
      {/* Faint behind the text on smaller screens; full colour beside it from xl, where there's room. */}
      <div aria-hidden className="tcas-parallax pointer-events-none absolute -right-12 top-4 -z-10 xl:right-[8%] xl:top-10" style={depth(0.6)}>
        <div className="[animation:t-launch_1.2s_cubic-bezier(0.2,0.8,0.2,1)_both]">
          <div className="animate-float">
            <div className="t-mark h-[340px] w-[231px] opacity-[0.14] sm:h-[460px] sm:w-[313px] xl:h-[500px] xl:w-[340px] xl:opacity-90" />
            <div className="mx-auto -mt-6 hidden h-40 w-1/3 bg-gradient-to-b from-brand/30 to-transparent blur-xl xl:block" />
          </div>
        </div>
      </div>

      {/* Floating emblem props (wide screens only, beside the heading) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 hidden xl:block">
        {PROPS.map((p) => (
          <div key={p.id} className={cx("tcas-parallax absolute", p.className)} style={depth(p.depth)}>
            <div className="animate-float" style={{ animationDelay: p.delay, animationDuration: `${5 + p.depth * 3}s` }}>
              <div
                className="grid place-items-center rounded-full border border-white bg-white shadow-soft-lg"
                style={{ width: p.size, height: p.size }}
              >
                <Image src={UNIVERSITY_ART[p.id].emblem} alt="" width={p.size} height={p.size} className="h-[68%] w-[68%] object-contain" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <Container className="relative flex min-h-[calc(100svh-4rem)] flex-col justify-center pb-10 pt-14 sm:pt-16">
        <div className="max-w-2xl">
          <Eyebrow className="animate-rise">TCAS70</Eyebrow>
          <h1
            id="tcas-top-title"
            className="animate-rise delay-1 mt-4 font-display text-4xl font-extrabold leading-[1.15] tracking-tight text-ink sm:text-5xl lg:text-6xl"
          >
            อยากเข้า <span className="text-tcas-gradient whitespace-nowrap font-extrabold">Top University</span>
            <br />
            ต้องทำยังไง?
          </h1>
          <p className="animate-rise delay-2 mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            เลือกมหาวิทยาลัยเพื่อดูทุกหลักสูตร เกณฑ์รอบ 1 และรอบ 3 แล้วลองคำนวณคะแนนของตัวเอง
          </p>
        </div>

        <ul className="mt-10 flex flex-wrap justify-center gap-3 sm:gap-4">
          {TCAS_UNIVERSITIES.map((u, i) => {
            const art = UNIVERSITY_ART[u.id];
            const count = counts[u.id] ?? 0;
            return (
              <li
                key={u.id}
                data-reveal
                style={{ "--reveal-delay": `${i * 90}ms` } as CSSProperties}
                className="w-[calc(50%-0.375rem)] sm:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-4rem)/5)]"
              >
                <Link
                  href={`/tcas?u=${u.id}#search`}
                  aria-label={`${u.name} · ${count.toLocaleString("th-TH")} หลักสูตร`}
                  className="group relative isolate block rounded-3xl p-[2px] transition-transform duration-300 ease-out hover:-translate-y-1.5 focus-visible:-translate-y-1.5 motion-reduce:hover:translate-y-0"
                >
                  {/* Gradient edge, shown on hover */}
                  <span
                    aria-hidden
                    className="tcas-edge absolute inset-0 -z-10 rounded-3xl opacity-0 shadow-brand-glow transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
                  />
                  <span className="card-shine relative flex h-44 flex-col items-center justify-end overflow-hidden rounded-[22px] bg-ink pb-4 sm:h-52 lg:h-64">
                    <Image
                      src={art.campus}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 220px, (min-width: 640px) 33vw, 50vw"
                      className="object-cover grayscale transition-[filter,transform] duration-700 ease-out group-hover:scale-105 group-hover:grayscale-0 group-focus-visible:scale-105 group-focus-visible:grayscale-0 motion-reduce:group-hover:scale-100"
                    />
                    <span
                      aria-hidden
                      className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/25 transition-opacity duration-500 group-hover:opacity-60 group-focus-visible:opacity-60"
                    />
                    <span className="tcas-ring relative grid h-[72px] w-[72px] place-items-center rounded-full bg-white shadow-soft-lg transition-transform duration-300 group-hover:scale-110 sm:h-20 sm:w-20 lg:h-[88px] lg:w-[88px]">
                      <Image src={art.emblem} alt="" width={88} height={88} className="h-[70%] w-[70%] object-contain" />
                    </span>
                    <span className="relative mt-3 text-center font-display text-base font-bold leading-tight text-white sm:text-lg">
                      {u.short}
                    </span>
                    <span className="relative mt-0.5 text-xs font-bold text-white/80">
                      {count.toLocaleString("th-TH")} หลักสูตร
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <a
          href="#search"
          className="group mx-auto mt-10 flex flex-col items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-muted transition-colors hover:text-brand"
        >
          <span aria-hidden className="t-mark block h-9 w-6 rotate-180 animate-float" />
          เลื่อนลงเพื่อค้นหาหลักสูตร
        </a>
      </Container>

      <ShowcaseMotion sectionId={SECTION_ID} />
    </section>
  );
}
