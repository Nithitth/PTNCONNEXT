import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  Check,
  FileDown,
  GraduationCap,
  Layers,
  Map as MapIcon,
  Presentation,
  ShieldCheck,
  Smartphone,
  Users,
} from "lucide-react";
import { FeedbackForm } from "@/components/FeedbackForm";
import { LoginForm } from "@/components/LoginForm";
import { Brand, Container, Eyebrow, Notice, buttonStyles } from "@/components/ui";
import { getCurrentProfile } from "@/lib/auth";
import { SUBJECTS } from "@/lib/school";

const GOALS = [
  { title: "ข้อมูลไม่กระจัดกระจาย", body: "งาน วันสอบ สไลด์ และประกาศ อยู่ในที่เดียว ไม่ต้องไล่หาในหลายกลุ่มแชต" },
  { title: "ครูทำงานน้อยลง", body: "มอบหมายงานครั้งเดียว เลือกได้หลายห้อง กำหนดส่งแต่ละห้องต่างกันได้" },
  { title: "วางแผนเรียนต่อได้เร็วขึ้น", body: "ข้อมูล TCAS เกณฑ์คะแนน และแผนเตรียมตัวเข้ามหาวิทยาลัยในที่เดียว" },
];

// The three tools, as equal-size cards (same layout, so no card leaves empty space).
const FEATURES = [
  {
    Icon: CalendarDays,
    title: "ปฏิทินอัจฉริยะ",
    tag: "ใช้งานได้แล้ว",
    body: "ทุกงานและวันสอบของห้องคุณ ในปฏิทินเดียว พร้อมสื่อการสอนให้ดาวน์โหลด",
    points: ["จุดสีบอกกำหนดส่งงานแต่ละวิชา", "งานใกล้ครบกำหนดจะกะพริบเตือน", "แถบสีบอกวันสอบและช่วงเตรียมสอบ"],
    href: "/calendar",
    cta: "เปิดปฏิทิน",
  },
  {
    Icon: GraduationCap,
    title: "TCAS",
    tag: "ใช้งานได้แล้ว",
    body: "ข้อมูลและเครื่องมือวางแผนเข้ามหาวิทยาลัย 5 มหาวิทยาลัยชั้นนำ",
    points: ["เกณฑ์รับสมัคร TCAS รอบ 1 และรอบ 3", "คำนวณคะแนนเป้าหมายและโอกาสติด", "เปรียบเทียบหลักสูตรได้ 3 หลักสูตร"],
    href: "/tcas",
    cta: "เปิด TCAS",
  },
  {
    Icon: MapIcon,
    title: "Roadmap",
    tag: "ใช้งานได้แล้ว · ใหม่",
    body: "การ์ดเป้าหมายแบบเกมของคุณเอง 1 ใบต่อคน ทำสำเร็จได้ XP และเลเวลอัป",
    points: ["เลือกกล่องที่ใช่ได้ถึง 10 กล่อง", "ภารกิจแนะนำจากเกณฑ์จริงของหลักสูตร", "เกรด เป้าหมาย และนับถอยหลังในที่เดียว"],
    href: "/roadmap",
    cta: "เปิด Roadmap",
  },
];

// Outline button for red backgrounds: white outline, fills white on hover.
const onRedOutline =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white px-5 text-sm font-bold text-white transition-all duration-150 hover:-translate-y-0.5 hover:bg-white hover:text-brand hover:shadow-soft active:translate-y-0 active:scale-[0.98] active:shadow-soft-sm";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const profile = await getCurrentProfile();
  const { denied, pdpa } = await searchParams;

  return (
    <>
      {(denied || pdpa === "declined") && (
        <Container className="pt-6">
          {denied && <Notice tone="warning">บัญชีของคุณไม่มีสิทธิ์เข้าหน้านั้น</Notice>}
          {pdpa === "declined" && (
            <Notice tone="info">
              คุณยังไม่ได้ยอมรับนโยบายข้อมูลส่วนบุคคล ระบบจึงออกจากระบบให้แล้ว เข้าสู่ระบบใหม่ได้ทุกเมื่อเมื่อพร้อม
            </Notice>
          )}
        </Container>
      )}

      {/* ── Hero ─────────────────────────────────────────── */}
      <section
        className="bg-brand-gradient speed-lines relative overflow-hidden text-white"
        style={{ clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 56px), 0 100%)" }}
      >
        <Image
          src="/brand/arrow-white.png"
          alt=""
          aria-hidden
          width={185}
          height={272}
          className="animate-float pointer-events-none absolute -right-10 top-6 w-[340px] opacity-[0.09] sm:w-[460px] lg:-right-4 lg:w-[560px]"
        />
        <Container className="relative grid items-center gap-14 pb-28 pt-12 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-32 lg:pt-20">
          <div>
            <Eyebrow light className="animate-rise">
              แพลตฟอร์มการเรียนของโรงเรียน
            </Eyebrow>
            <h1 className="animate-rise delay-1 mt-5 font-display text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-5xl lg:text-[3.6rem]">
              งาน วันสอบ และ<span className="whitespace-nowrap">สื่อการสอน</span>
              <br />
              <span className="whitespace-nowrap">
                รวมไว้ใน{" "}
                <span className="relative inline-block border border-white bg-white px-3 text-brand shadow-soft">
                  ที่เดียว
                </span>
              </span>
            </h1>
            <p className="animate-rise delay-2 mt-7 max-w-xl text-base leading-relaxed text-white/90 sm:text-lg">
              ครูโพสต์ครั้งเดียว นักเรียนทุกห้องที่เกี่ยวข้องเห็นทันที พร้อมข้อมูล TCAS สำหรับวางแผนเข้ามหาวิทยาลัย
            </p>
            <div className="animate-rise delay-3 mt-8 flex flex-wrap gap-3">
              {profile ? (
                <Link href="/calendar" className={buttonStyles.inverse}>
                  ไปที่ปฏิทินของฉัน
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </Link>
              ) : (
                <a href="#login" className={buttonStyles.inverse}>
                  เข้าสู่ระบบ
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </a>
              )}
              <a href="#features" className={onRedOutline}>
                ดูว่าทำอะไรได้บ้าง
              </a>
            </div>
            <ul className="animate-rise delay-4 mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold text-white/90">
              {[
                { Icon: Layers, text: "โพสต์ครั้งเดียว ทุกห้องเห็น" },
                { Icon: Smartphone, text: "ใช้ได้ทั้งมือถือและคอม" },
                { Icon: ShieldCheck, text: "คุ้มครองข้อมูลตาม PDPA" },
              ].map(({ Icon, text }) => (
                <li key={text} className="flex items-center gap-2">
                  <Icon aria-hidden className="h-4 w-4" strokeWidth={2.4} />
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <div className="animate-rise delay-2">
            <HeroVisual />
          </div>
        </Container>
      </section>

      {/* ── Goals ────────────────────────────────────────── */}
      <section>
        <Container className="pb-16 pt-10 sm:pb-24 sm:pt-14">
          <Eyebrow>เป้าหมายของเรา</Eyebrow>
          <h2 className="mt-3 max-w-3xl text-balance font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            ทำให้เรื่องเรียนในแต่ละวันง่ายขึ้น <span className="whitespace-nowrap">ทั้งสำหรับครูและนักเรียน</span>
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {GOALS.map((g, i) => (
              <div
                key={g.title}
                className="group rounded-2xl border border-line bg-surface p-6 shadow-soft transition-all duration-200 hover:-translate-y-1 hover:shadow-brand-glow-lg"
              >
                <span className="text-gradient font-display text-5xl font-extrabold leading-none">0{i + 1}</span>
                <h3 className="mt-4 font-display text-lg font-bold text-ink transition-colors group-hover:text-brand">{g.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{g.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Features ─────────────────────────────────────── */}
      <section id="features" className="scroll-mt-20 border-y-2 border-line bg-surface">
        <Container className="py-16 sm:py-24">
          <Eyebrow>ฟังก์ชันหลัก</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">สามเครื่องมือในที่เดียว</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ Icon, title, tag, body, points, href, cta }) => (
              <article
                key={title}
                className="bg-feature-gradient speed-lines group relative flex flex-col overflow-hidden rounded-3xl p-6 text-white shadow-soft-lg transition-transform duration-200 hover:-translate-y-1 sm:p-7"
              >
                <Image
                  src="/brand/arrow-white.png"
                  alt=""
                  aria-hidden
                  width={185}
                  height={272}
                  className="pointer-events-none absolute -bottom-10 -right-6 w-36 opacity-15 transition-transform duration-500 group-hover:-translate-y-4"
                />
                <div className="relative flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-xl border border-white bg-white text-brand shadow-soft-sm">
                    <Icon aria-hidden className="h-6 w-6" strokeWidth={2.4} />
                  </span>
                  <span className="rounded-md bg-ink px-2.5 py-1 text-xs font-bold text-white">{tag}</span>
                </div>
                <h3 className="relative mt-5 font-display text-2xl font-extrabold sm:text-3xl">{title}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-white/85">{body}</p>
                <ul className="relative mt-5 space-y-2.5 text-sm font-bold">
                  {points.map((p) => (
                    <li key={p} className="flex gap-2.5">
                      <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={3} />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
                <Link href={href} className={`${buttonStyles.inverse} relative mt-auto self-start`}>
                  {cta}
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <RoleCard
              icon={<Users aria-hidden className="h-5 w-5" strokeWidth={2.4} />}
              title="สำหรับนักเรียน"
              points={["ดูงานและวันสอบของห้องตัวเอง", "ดาวน์โหลดสื่อการสอน", "วางแผนเรียนต่อด้วย TCAS"]}
            />
            <RoleCard
              icon={<Presentation aria-hidden className="h-5 w-5" strokeWidth={2.4} />}
              title="สำหรับครู"
              points={["มอบหมายงานหลายห้องในครั้งเดียว", "กำหนดส่งแต่ละห้องต่างกันได้", "ประกาศวันสอบและแชร์เอกสาร"]}
            />
          </div>
        </Container>
      </section>

      {/* ── Login ────────────────────────────────────────── */}
      <section id="login" className="relative isolate scroll-mt-16 overflow-hidden bg-ink">
        {/* Backdrop: red→purple sweep, soft glows, dot grid and the school's arrow, all decorative */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="bg-feature-gradient speed-lines absolute -left-1/4 top-0 h-full w-[85%] -skew-x-12 lg:-left-[8%] lg:w-[58%]" />
          <div className="absolute -left-20 -top-24 h-80 w-80 rounded-full bg-brand-hot/40 blur-3xl" />
          <div className="absolute -bottom-32 right-[10%] h-96 w-96 rounded-full bg-[#8a4fd8]/35 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.09)_1px,transparent_1px)] [background-size:22px_22px]" />
          <Image
            src="/brand/arrow-white.png"
            alt=""
            width={185}
            height={272}
            className="animate-float absolute -bottom-16 left-[38%] hidden w-56 opacity-[0.12] lg:block"
          />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        </div>
        <Container className="relative grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-2">
          <div className="text-white">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-bold text-white/90 backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              {profile ? "เข้าสู่ระบบแล้ว" : "เริ่มใช้งาน"}
            </p>
            <h2 className="mt-4 font-display text-3xl font-extrabold leading-tight sm:text-5xl">
              {profile ? (
                <>
                  สวัสดี
                  <br />
                  <span className="whitespace-nowrap">{profile.display_name}</span>
                </>
              ) : (
                <>
                  เข้าสู่ระบบ <Brand className="whitespace-nowrap">Connext</Brand>
                </>
              )}
            </h2>
            {profile && (
              <p className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-lg bg-white px-2.5 py-1 text-brand">
                  {profile.role === "student" ? "นักเรียน" : profile.role === "teacher" ? "ครู" : "ผู้ดูแลระบบ"}
                </span>
                {profile.classroom && (
                  <span className="rounded-lg border border-white/40 bg-white/10 px-2.5 py-1">
                    ห้อง ม.{profile.classroom.grade}/{profile.classroom.room}
                  </span>
                )}
              </p>
            )}
            <p className="mt-4 max-w-md leading-relaxed text-white/85">
              {profile
                ? "ไปต่อได้เลย เลือกสิ่งที่อยากทำวันนี้"
                : "นักเรียนใช้เลขประจำตัว ครูใช้ชื่อผู้ใช้ที่ได้รับจากโรงเรียน เข้าครั้งแรกใช้วันเกิดเป็นรหัสผ่าน"}
            </p>
            {profile && (
              <ul className={`mt-7 grid max-w-md gap-2.5 ${profile.role === "student" ? "sm:grid-cols-3" : "grid-cols-2"}`}>
                {[
                  { href: "/calendar", label: "ปฏิทิน", Icon: CalendarDays },
                  { href: "/tcas", label: "TCAS", Icon: GraduationCap },
                  { href: "/roadmap", label: "Roadmap", Icon: MapIcon },
                  ...(profile.role === "student" ? [] : [{ href: "/teacher", label: "คอนโซลครู", Icon: Presentation }]),
                ].map(({ href, label, Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="group flex items-center gap-2.5 rounded-2xl border border-white/25 bg-white/10 px-3.5 py-3 text-sm font-bold text-white backdrop-blur transition-all duration-150 hover:-translate-y-0.5 hover:bg-white hover:text-brand"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                        <Icon aria-hidden className="h-4 w-4" />
                      </span>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div
            id={profile ? "feedback" : undefined}
            className="w-full max-w-md scroll-mt-20 justify-self-center rounded-3xl border border-line bg-surface p-6 shadow-brand-glow-lg sm:p-8 lg:justify-self-end"
          >
            {/* Guests log in here; logged-in users get the feedback box instead. */}
            {profile ? <FeedbackForm /> : <LoginForm />}
          </div>
        </Container>
      </section>
    </>
  );
}

function RoleCard({ icon, title, points }: { icon: ReactNode; title: string; points: string[] }) {
  return (
    <div className="group flex gap-4 rounded-2xl border border-line bg-page p-6 transition-all duration-200 hover:border-line-strong hover:bg-surface hover:shadow-soft">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-surface text-brand transition-colors duration-200 group-hover:bg-brand group-hover:text-white">
        {icon}
      </span>
      <div>
        <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Decorative: the calendar card with a sample reminder and file. */
function HeroVisual() {
  const color = (code: string) => SUBJECTS.find((s) => s.code === code)!.color;
  const dots: Record<number, string[]> = {
    3: [color("english")], 6: [color("math")], 11: [color("science"), color("thai")],
    13: [color("pat")], 17: [color("math")], 24: [color("social")],
  };
  const band = (d: number) =>
    d === 20 ? "bg-exam-soft" : d >= 16 && d <= 19 ? "bg-exam-tint" : d === 26 || d === 27 ? "bg-event-stripes" : "bg-surface";

  return (
    <div aria-hidden className="relative text-ink">
      <div className="relative rounded-[26px] border border-line bg-surface p-4 shadow-soft-lg transition-transform duration-300 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-display text-base font-bold">พฤศจิกายน 2569</p>
            <p className="text-xs text-muted">ห้อง ม.5/2</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-md border border-brand bg-brand px-2.5 py-1 text-xs font-bold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />3 งานสัปดาห์นี้
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-faint">
          {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d) => (
            <span key={d} className="pb-1">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
            <div
              key={d}
              className={`flex h-10 flex-col justify-between rounded-md border p-1 text-[11px] sm:h-12 ${band(d)} ${
                d === 10 ? "border border-brand" : "border-line"
              }`}
            >
              <span className={d === 10 ? "font-extrabold text-brand" : d === 20 ? "font-bold text-[#633806]" : ""}>{d}</span>
              <span className="flex gap-0.5">
                {(dots[d] ?? []).map((c, i) => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="animate-float absolute -bottom-8 -left-3 hidden w-64 items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-soft sm:flex lg:-left-10">
        <span className="bg-brand-gradient grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white">
          <BellRing className="h-4 w-4" strokeWidth={2.4} />
        </span>
        <div className="min-w-0 text-xs">
          <p className="font-bold">แบบฝึกหัดลำดับเลขคณิต</p>
          <p className="mt-0.5 text-muted">คณิตศาสตร์ · ส่งพรุ่งนี้ 16:30</p>
        </div>
      </div>
      <div
        className="animate-float absolute -right-2 -top-6 hidden items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-soft sm:flex lg:-right-6"
        style={{ animationDelay: "-2.5s" }}
      >
        <FileDown className="h-4 w-4 text-brand" strokeWidth={2.4} />
        <span className="font-bold">บทที่ 3 ลำดับและอนุกรม.pdf</span>
      </div>
    </div>
  );
}
