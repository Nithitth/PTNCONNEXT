"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Eye,
  FileText,
  Info,
  LogIn,
  Maximize,
  Radio,
  ShieldAlert,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { liveCounts } from "@/app/admin/report/warroom/actions";
import { cx } from "@/components/ui";
import { linePath, niceMax, polygon, radarPoints, yOf } from "@/lib/chart";
import { formatValue, PRESETS, T, type Preset } from "@/lib/report";
import { DAYS_SHORT, peakText } from "@/lib/reportAnalysis";
import { ROOM_COLUMNS, type RoomColumn } from "@/lib/reportCompare";
import type { ReportView } from "@/lib/reportView";
import { ago, alerts, defaultRadar, feedText, type Live } from "@/lib/warroom";
import { FeatureBars, RoomMatrix, SubjectBars, projectionText } from "./CompareParts";

const LIVE_MS = 60_000;
const FULL_MS = 5 * 60_000;
const RED = "#ff3b43";
const AMBER = "#f5b041";
const GREEN = "#34d399";
const RADAR_COLORS = [RED, AMBER, "#60a5fa"];

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A number that counts up to its new value (instantly under reduced motion). */
function useCountUp(target: number, ms = 900) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const instant = reduced();
    let raf = 0;
    const tick = (t: number) => {
      const k = instant ? 1 : Math.min(1, (t - start) / ms);
      const e = 1 - (1 - k) ** 3;
      setShown(a + (target - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}

function Count({ value, className }: { value: number; className?: string }) {
  const v = useCountUp(value);
  return <span className={className}>{Math.round(v).toLocaleString("th-TH")}</span>;
}

const tone = (p: number | null) => (p === null ? "rgba(255,255,255,0.25)" : p >= 1 ? GREEN : p >= 0.7 ? AMBER : RED);

/** The Connext Score in the middle, one ring per objective around it. */
function Reactor({ v }: { v: ReportView }) {
  const score = useCountUp(v.score ?? 0, 1400);
  const S = 360;
  const c = S / 2;
  return (
    <div className="grid items-center gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
      <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto w-full max-w-[22rem]" role="img" aria-label={`Connext Score ${v.score ?? "—"}`}>
        <defs>
          <radialGradient id="wr-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={RED} stopOpacity="0.35" />
            <stop offset="100%" stopColor={RED} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={c} cy={c} r={c - 4} fill="url(#wr-core)" />
        <g className="wr-spin">
          <circle cx={c} cy={c} r={c - 8} fill="none" stroke={RED} strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="2 7" />
        </g>
        <g className="wr-spin-rev">
          <circle cx={c} cy={c} r={c - 18} fill="none" stroke="#fff" strokeOpacity="0.12" strokeWidth="1" strokeDasharray="40 14 4 14" />
        </g>
        {v.okrs.slice(0, 6).map((o, i) => {
          const r = c - 38 - i * 17;
          const len = 2 * Math.PI * r;
          const p = o.progress ?? 0;
          return (
            <g key={i} transform={`rotate(-90 ${c} ${c})`}>
              <circle cx={c} cy={c} r={r} fill="none" stroke="#fff" strokeOpacity="0.06" strokeWidth="9" />
              <circle
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={tone(o.progress)}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={`${len * p} ${len}`}
                style={{ transition: "stroke-dasharray 1.2s cubic-bezier(.2,.8,.2,1)", filter: `drop-shadow(0 0 6px ${tone(o.progress)})` }}
              />
            </g>
          );
        })}
        <text x={c} y={c - 4} textAnchor="middle" className="fill-white font-display" style={{ fontSize: 64, fontWeight: 800 }}>
          {v.score === null ? "—" : Math.round(score)}
        </text>
        <text x={c} y={c + 24} textAnchor="middle" fill="rgba(255,255,255,0.5)" style={{ fontSize: 11, letterSpacing: "0.2em", fontWeight: 700 }}>
          CONNEXT SCORE
        </text>
        {v.prevScore !== null && v.score !== null && (
          <text x={c} y={c + 44} textAnchor="middle" fill={v.score >= v.prevScore ? GREEN : RED} style={{ fontSize: 12, fontWeight: 700 }}>
            {v.score >= v.prevScore ? "▲" : "▼"} {Math.abs(v.score - v.prevScore)} จากช่วงก่อน
          </text>
        )}
      </svg>
      <ol className="space-y-2.5">
        {v.okrs.map((o, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-extrabold text-black" style={{ background: tone(o.progress) }}>
              O{i + 1}
            </span>
            <span className="min-w-0 flex-1 text-sm leading-snug text-white/85">{o.objective}</span>
            <span className="shrink-0 font-display text-xl font-extrabold" style={{ color: tone(o.progress) }}>
              {o.progress === null ? "—" : `${Math.round(o.progress * 100)}%`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Up to 3 rooms plus the school average on the six room goals. */
function Radar({ v }: { v: ReportView }) {
  const start = useMemo(() => defaultRadar(v.roomRows), [v.roomRows]);
  const [ids, setIds] = useState<string[]>(start.ids);
  const S = 300;
  const c = S / 2;
  const R = 110;
  const axis = ROOM_COLUMNS.map((col) => col.key);
  const vals = (x: Record<RoomColumn, number | null>) => axis.map((k) => x[k]);
  const toggle = (id: string) => setIds((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id].slice(-3)));
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] sm:items-center">
      <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto w-full max-w-[18rem]" role="img" aria-label="เทียบห้องเรียนแบบเรดาร์">
        {[25, 50, 75, 100].map((g) => (
          <polygon
            key={g}
            points={polygon(
              radarPoints(
                axis.map(() => g),
                R,
                c,
                c,
              ),
            )}
            fill="none"
            stroke="#fff"
            strokeOpacity={g === 100 ? 0.18 : 0.07}
          />
        ))}
        {axis.map((k, i) => {
          const p = radarPoints(
            axis.map((_, j) => (j === i ? 100 : 0)),
            R,
            c,
            c,
          )[i];
          const lp = radarPoints(
            axis.map((_, j) => (j === i ? 124 : 0)),
            R,
            c,
            c,
          )[i];
          return (
            <g key={k}>
              <line x1={c} y1={c} x2={p.x} y2={p.y} stroke="#fff" strokeOpacity="0.08" />
              <text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.55)" style={{ fontSize: 10, fontWeight: 700 }}>
                {ROOM_COLUMNS[i].th}
              </text>
            </g>
          );
        })}
        <polygon
          points={polygon(radarPoints(vals(start.avg), R, c, c))}
          fill="none"
          stroke="#fff"
          strokeOpacity="0.6"
          strokeDasharray="4 4"
          strokeWidth="1.5"
        />
        {ids.map((id, n) => {
          const row = v.roomRows.find((r) => r.classroomId === id);
          if (!row) return null;
          const col = RADAR_COLORS[n % 3];
          return (
            <polygon
              key={id}
              points={polygon(radarPoints(vals(row.values), R, c, c))}
              fill={col}
              fillOpacity="0.14"
              stroke={col}
              strokeWidth="2"
              style={{ filter: `drop-shadow(0 0 6px ${col})` }}
            />
          );
        })}
      </svg>
      <div>
        <p className="wr-label mb-2">แตะเพื่อเลือกห้อง (สูงสุด 3) · เส้นประ = เฉลี่ยทั้งโรงเรียน</p>
        <div className="flex flex-wrap gap-1.5">
          {v.roomRows.map((r) => {
            const n = ids.indexOf(r.classroomId);
            return (
              <button
                key={r.classroomId}
                type="button"
                onClick={() => toggle(r.classroomId)}
                aria-pressed={n >= 0}
                className={cx(
                  "rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
                  n >= 0 ? "text-black" : "border-white/15 text-white/70 hover:border-white/40",
                )}
                style={n >= 0 ? { background: RADAR_COLORS[n % 3], borderColor: RADAR_COLORS[n % 3] } : undefined}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Each key result's weekly line against its target, with the projected finish. */
function GoalLines({ v }: { v: ReportView }) {
  const krs = v.okrs.flatMap((o, i) => o.keyResults.map((k, j) => ({ k, i, j })));
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {krs.map(({ k, i, j }) => {
        const pts = v.series[k.metric] ?? [];
        const values = pts.map((p) => p.value);
        const known = values.filter((x): x is number => x !== null);
        const max = k.unit === "pct" ? 100 : niceMax(Math.max(k.target, ...known, 1) * 1.15);
        const W = 240;
        const H = 64;
        const d = linePath(values, W, H, { max, min: 0, pad: 4 });
        const col = tone(k.progress);
        return (
          <div key={`${i}-${j}`} className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs text-white/70">
                <b className="mr-1 text-white/40">O{i + 1}</b>
                {k.label}
              </span>
              <span className="shrink-0 font-display text-lg font-extrabold" style={{ color: col }}>
                {formatValue(k.actual, k.unit, "th")}
              </span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-16 w-full" aria-hidden>
              <line
                x1="0"
                x2={W}
                y1={yOf(k.target, H, { max, pad: 4 })}
                y2={yOf(k.target, H, { max, pad: 4 })}
                stroke="#fff"
                strokeOpacity="0.35"
                strokeDasharray="4 4"
              />
              {d && (
                <>
                  <path d={`${d}L${W - 4} ${H - 4}L4 ${H - 4}Z`} fill={col} fillOpacity="0.1" />
                  <path
                    d={d}
                    fill="none"
                    stroke={col}
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ filter: `drop-shadow(0 0 4px ${col})` }}
                  />
                </>
              )}
            </svg>
            <p className="mt-1 text-[11px] text-white/45">
              เป้า {k.lower ? "≤" : "≥"} {formatValue(k.target, k.unit, "th")} ·{" "}
              {projectionText(v.projections[`${i}-${j}`], "th") ?? (known.length < 2 ? "ข้อมูลยังน้อย" : "")}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function Heat({ m }: { m: number[][] }) {
  const max = Math.max(1, ...m.flat());
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[36rem] grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-[3px]">
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="text-center text-[9px] text-white/35">
            {h % 3 === 0 ? h : ""}
          </span>
        ))}
        {m.map((row, d) => (
          <div key={d} className="contents">
            <span className="text-[11px] font-bold text-white/50">{DAYS_SHORT.th[d]}</span>
            {row.map((n, h) => (
              <span
                key={h}
                title={`${DAYS_SHORT.th[d]} ${h}:00 · ${n}`}
                className="aspect-square rounded-[3px]"
                style={{
                  background: n ? `rgba(255,59,67,${0.12 + (n / max) * 0.88})` : "rgba(255,255,255,0.04)",
                  boxShadow: n === max ? `0 0 8px ${RED}` : undefined,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
  className,
  aside,
}: {
  title: string;
  icon: typeof Activity;
  children: React.ReactNode;
  className?: string;
  aside?: React.ReactNode;
}) {
  return (
    <section className={cx("wr-panel p-4 sm:p-5", className)}>
      <header className="mb-4 flex items-center gap-2">
        <Icon aria-hidden className="h-4 w-4 text-[#ff3b43]" />
        <h2 className="wr-label !text-white/70">{title}</h2>
        {aside && <span className="ml-auto text-[11px] text-white/40">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

/** ห้องบัญชาการ: the whole report as a live dark display for a big screen. */
export function WarRoom({
  v,
  initialLive,
  preset,
  lockouts,
  schoolDriveBroken,
  generatedAt,
}: {
  v: ReportView;
  initialLive: Live;
  preset: Preset;
  lockouts: number;
  schoolDriveBroken?: boolean;
  generatedAt: string;
}) {
  const router = useRouter();
  const [live, setLive] = useState(initialLive);
  const [expired, setExpired] = useState(false);
  const [now, setNow] = useState(() => new Date(generatedAt));
  const [lastLive, setLastLive] = useState(() => new Date(generatedAt));
  const [lastFull, setLastFull] = useState(() => new Date(generatedAt));

  // Clock every second; live numbers every minute; everything else every 5 minutes.
  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000);
    const poll = setInterval(async () => {
      try {
        const r = await liveCounts();
        if (r.expired) setExpired(true);
        else if (r.live) {
          setLive(r.live);
          setLastLive(new Date());
        }
      } catch {
        /* offline for a moment: try again next minute */
      }
    }, LIVE_MS);
    const full = setInterval(() => {
      router.refresh();
      setLastFull(new Date());
    }, FULL_MS);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
      clearInterval(full);
    };
  }, [router]);

  // Keep a wall screen awake while this page is open.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const ask = async () => {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (wl && document.visibilityState === "visible") lock = await wl.request("screen");
      } catch {
        /* not allowed here: the screen may sleep */
      }
    };
    ask();
    const again = () => document.visibilityState === "visible" && ask();
    document.addEventListener("visibilitychange", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      lock?.release().catch(() => {});
    };
  }, []);

  const clock = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Bangkok" }).format(now);
  const date = new Intl.DateTimeFormat("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(now);
  const time = (d: Date) => new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(d);
  const heat = v.heat.students.map((row, d) => row.map((n, h) => n + v.heat.staff[d][h]));
  const warn = alerts({ okrs: v.okrs, live, clashes: v.work.clashes.length, storageUse: v.storageUse, lockouts, schoolDriveBroken });

  const strip = [
    { label: "ออนไลน์ตอนนี้", sub: "15 นาทีล่าสุด", value: live.online_now, Icon: Radio, hot: true },
    { label: "ผู้ใช้วันนี้", sub: `${live.visits_today.toLocaleString("th-TH")} ครั้งที่เปิด`, value: live.users_today, Icon: Users },
    { label: "เข้าสู่ระบบวันนี้", sub: "สำเร็จ", value: live.logins_today, Icon: LogIn },
    { label: "โพสต์วันนี้", sub: "งาน สอบ เอกสาร", value: live.posts_today, Icon: CalendarDays },
    { label: "เปิดดูโพสต์วันนี้", sub: `เปิดไฟล์ ${live.file_opens_today.toLocaleString("th-TH")}`, value: live.seen_today, Icon: Eye },
    { label: "ลงทะเบียนวันนี้", sub: "บัญชีใหม่", value: live.signups_today, Icon: UserPlus },
  ];

  return (
    <div className="warroom fixed inset-0 z-[60] overflow-y-auto text-white">
      <div className="relative z-10 mx-auto max-w-[120rem] space-y-4 px-4 py-4 sm:px-6 lg:py-6">
        {/* Header */}
        <header className="wr-panel flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Link
            href="/admin/report"
            aria-label="กลับไปรายงาน"
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white/70 hover:border-white/30 hover:text-white"
          >
            <ArrowLeft aria-hidden className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-lg font-bold tracking-wide">
              <span className="font-brand">PTN Connext</span> <span className="text-[#ff3b43]">·</span>{" "}
              <span className="wr-glow font-display tracking-[0.2em]">WAR ROOM</span>
            </p>
            <p className="text-xs text-white/50">ห้องบัญชาการ · {T.th.presets[preset]}</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#ff3b43]/40 bg-[#ff3b43]/10 px-3 py-1 text-xs font-bold text-[#ff8a8f]">
            <span className="wr-pulse h-2 w-2 rounded-full bg-[#ff3b43]" />
            LIVE
          </span>
          <div className="ml-auto text-right">
            <p className="font-display text-3xl font-extrabold leading-none sm:text-4xl">{clock}</p>
            <p className="text-xs text-white/50">{date}</p>
          </div>
          <nav aria-label="ช่วงเวลา" className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
            {PRESETS.map((p) => (
              <Link
                key={p}
                href={`/admin/report/warroom?preset=${p}`}
                aria-current={p === preset ? "page" : undefined}
                className={cx("rounded-lg px-3 py-1.5 text-xs font-bold", p === preset ? "bg-[#ff3b43] text-white" : "text-white/60 hover:text-white")}
              >
                {T.th.presets[p]}
              </Link>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-bold text-white/70 hover:border-white/30 hover:text-white"
          >
            <Maximize aria-hidden className="h-4 w-4" />
            เต็มจอ
          </button>
          <p className="w-full text-[11px] text-white/35">
            ตัวเลขสดอัปเดตทุก 1 นาที (ล่าสุด {time(lastLive)}) · กราฟอัปเดตทุก 5 นาที (ล่าสุด {time(lastFull)}) · แสดงเฉพาะจำนวนรวม ไม่มีชื่อ
          </p>
        </header>

        {/* Live strip · score · alerts + feed */}
        <div className="grid gap-4 xl:grid-cols-12">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:col-span-3 xl:grid-cols-1">
            {strip.map((s) => (
              <div key={s.label} className="wr-panel flex items-center gap-3 p-3.5">
                <span
                  className={cx(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                    s.hot ? "bg-[#ff3b43] text-white shadow-[0_0_18px_rgba(255,59,67,.6)]" : "bg-white/5 text-[#ff3b43]",
                  )}
                >
                  <s.Icon aria-hidden className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <Count value={s.value} className={cx("block font-display text-3xl font-extrabold leading-none", s.hot && "wr-glow")} />
                  <span className="block truncate text-xs text-white/70">{s.label}</span>
                  <span className="block truncate text-[10px] text-white/35">{s.sub}</span>
                </span>
              </div>
            ))}
          </div>

          <Panel title="Connext Score และวัตถุประสงค์" icon={Sparkles} className="xl:col-span-6">
            <Reactor v={v} />
          </Panel>

          <div className="space-y-4 xl:col-span-3">
            <Panel title="สิ่งที่ต้องดู" icon={ShieldAlert}>
              <ul className="space-y-2">
                {warn.map((a, i) => (
                  <li
                    key={i}
                    className={cx(
                      "flex gap-2 rounded-lg border px-3 py-2 text-xs leading-snug",
                      a.tone === "danger"
                        ? "border-[#ff3b43]/40 bg-[#ff3b43]/10 text-[#ffb3b6]"
                        : a.tone === "warning"
                          ? "border-[#f5b041]/30 bg-[#f5b041]/10 text-[#fcd9a0]"
                          : "border-white/10 bg-white/[0.03] text-white/70",
                    )}
                  >
                    {a.tone === "info" ? (
                      <Info aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <AlertTriangle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
                    )}
                    {a.text}
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="ความเคลื่อนไหวล่าสุด" icon={Activity} aside="ไม่ระบุชื่อ">
              {live.feed.length === 0 ? (
                <p className="text-xs text-white/40">ยังไม่มีความเคลื่อนไหว</p>
              ) : (
                <ul className="space-y-1.5">
                  {live.feed.slice(0, 10).map((e, i) => {
                    const t = feedText(e);
                    return (
                      <li key={`${e.at}-${i}`} className="wr-feed-in flex items-baseline gap-2 text-xs" style={{ animationDelay: `${i * 40}ms` }}>
                        <span className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full bg-[#ff3b43]" />
                        <span className="shrink-0 font-bold text-white">{t.where}</span>
                        <span className="min-w-0 flex-1 truncate text-white/65">{t.what}</span>
                        <span className="shrink-0 text-[10px] text-white/35">{ago(e.at, now)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>
        </div>

        {/* Goal progress over time · feature use */}
        <div className="grid gap-4 xl:grid-cols-12">
          <Panel title="ความคืบหน้าของเป้าหมายรายสัปดาห์" icon={Activity} aside="เส้นประ = เป้า" className="xl:col-span-8">
            <GoalLines v={v} />
          </Panel>
          <Panel title="การใช้ฟีเจอร์ (ต่อสัปดาห์)" icon={FileText} className="xl:col-span-4">
            <FeatureBars rows={v.features} lang="th" dark />
          </Panel>
        </div>

        {/* Room vs room · subject vs subject */}
        <div className="grid gap-4 xl:grid-cols-12">
          <Panel title="เทียบห้องเรียน" icon={Users} className="xl:col-span-7">
            <Radar v={v} />
            <div className="mt-5">
              <RoomMatrix rows={v.roomRows} avg={v.roomAvg} lang="th" dark />
            </div>
          </Panel>
          <Panel title="เทียบรายวิชา" icon={CalendarDays} className="xl:col-span-5">
            <SubjectBars rows={v.subjects} lang="th" dark />
          </Panel>
        </div>

        <Panel title="ช่วงเวลาที่ใช้งาน (เข้าสู่ระบบ ตามวันและชั่วโมง)" icon={Activity} aside={v.peak ? `มากที่สุด ${peakText(v.peak, "th")}` : undefined}>
          <Heat m={heat} />
        </Panel>
      </div>

      {expired && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="wr-panel max-w-sm p-6 text-center">
            <ShieldAlert aria-hidden className="mx-auto mb-3 h-8 w-8 text-[#ff3b43]" />
            <p className="font-display text-xl font-bold">หมดเวลาการเข้าสู่ระบบ</p>
            <p className="mt-1 text-sm text-white/60">เข้าสู่ระบบใหม่ (พร้อมรหัสสองขั้นตอน) เพื่อแสดงตัวเลขสดต่อ</p>
            <a href="/login" className="mt-4 inline-flex h-11 items-center rounded-xl bg-[#ff3b43] px-5 text-sm font-bold text-white">
              เข้าสู่ระบบใหม่
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
