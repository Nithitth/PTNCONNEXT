"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ComponentType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Gift,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { addBox, changeRoadmapTarget, createRoadmap, deleteBox, deleteRoadmap, moveBox, setLook, updateBox, type RoadmapResult } from "@/app/roadmap/actions";
import { buttonStyles, cx, iconButtonStyles, inputStyles, smallButtonStyles } from "@/components/ui";
import {
  BOX_KINDS,
  BOX_PRESETS,
  ROADMAP_MAX_BOXES,
  scoreRoadmap,
  termLabel,
  type AnyBox,
  type BoxKind,
} from "@/lib/roadmap";
import type { LevelSaved } from "@/lib/roadmapData";
import { STAGES, currentStreak, stageOf, type Proof, type StageId } from "@/lib/roadmapLevels";
import type { Round3Option } from "@/lib/tcas";
import type { BodyProps, BoxCtx } from "./boxParts";
import { ClassStrip, ProofControl, RewardsCabinet, StagePanel, StageUp, type ProofApi } from "./levelParts";
import { ActivitiesBox, BackupBox, LinksBox, MottoBox, NotesBox, SkillsBox, StudyBox } from "./personalBoxes";
import { CountdownBox, GoalBox, GpaBox, PortfolioBox, QuestsBox, ScoresBox } from "./progressBoxes";
import { RoadmapCard, type CardProgram } from "./RoadmapCard";
import { BOX_ICONS } from "./boxIcons";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BODIES: Record<BoxKind, ComponentType<BodyProps<any>>> = {
  gpa: GpaBox,
  scores: ScoresBox,
  quests: QuestsBox,
  portfolio: PortfolioBox,
  goal: GoalBox,
  countdown: CountdownBox,
  activities: ActivitiesBox,
  notes: NotesBox,
  motto: MottoBox,
  study: StudyBox,
  skills: SkillsBox,
  backup: BackupBox,
  links: LinksBox,
};

type SaveState = "saving" | "saved" | { error: string };
export type TargetChoice = { programId: string; label: string; position: number; chance: number | null };

/** The whole roadmap: the game card on top, the student's boxes below. Saves each box as it changes. */
export function RoadmapBoard({
  initialBoxes,
  initialProofs,
  saved: initialSaved,
  option,
  userId,
  classStats,
  program,
  ctx: baseCtx,
  choices,
}: {
  initialBoxes: AnyBox[];
  initialProofs: Proof[];
  /** Stage, streak and rewards as the server last saved them. */
  saved: LevelSaved;
  option: Round3Option | null;
  userId: string;
  classStats: { students: number; avgStage: number; behind: number } | null;
  program: CardProgram;
  ctx: BoxCtx;
  /** Saved targets the roadmap can switch to. */
  choices: TargetChoice[];
}) {
  const router = useRouter();
  const [boxes, setBoxes] = useState(initialBoxes);
  const latest = useRef(initialBoxes);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [saves, setSaves] = useState<Record<string, SaveState>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const addRef = useRef<HTMLDialogElement>(null);
  const switchRef = useRef<HTMLDialogElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const rewardsRef = useRef<HTMLDialogElement>(null);
  const [proofs, setProofs] = useState(initialProofs);
  const [saved, setSaved] = useState(initialSaved);
  const [frame, setFrame] = useState(initialSaved.frame);

  /** Takes in what an action sent back: the saved stage/streak and the proof list. */
  const onResult = useCallback((res: RoadmapResult) => {
    if (res.level) setSaved(res.level);
    if (res.proofs) setProofs(res.proofs);
  }, []);
  const api: ProofApi = useMemo(() => ({ proofs, userId, onResult }), [proofs, userId, onResult]);
  const ctx: BoxCtx = useMemo(
    () => ({ ...baseCtx, proof: (step, kinds, label) => <ProofControl api={api} step={step} kinds={kinds} label={label} /> }),
    [baseCtx, api],
  );

  const score = useMemo(() => scoreRoadmap(boxes, { program: ctx.program, chance: ctx.chance, today: ctx.today }), [boxes, ctx]);
  const level = useMemo(() => stageOf({ boxes, program: ctx.program, option, proofs }, score.xp), [boxes, ctx.program, option, proofs, score.xp]);
  const streak = currentStreak(saved.lastActiveWeek, saved.streak, ctx.today);
  const maxStage = Math.max(saved.maxStage, level.stage);

  // "+XP" float, a burst for a new step, and the full stage-up moment (not on first render).
  const prev = useRef({ xp: score.xp, step: level.stage * 10 + level.subLevel, stage: level.stage });
  const [pop, setPop] = useState<{ id: number; xp: number } | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [stageUp, setStageUp] = useState<StageId | null>(null);
  useEffect(() => {
    const p = prev.current;
    const step = level.stage * 10 + level.subLevel;
    if (score.xp > p.xp) setPop({ id: Date.now(), xp: score.xp - p.xp });
    if (level.stage > p.stage) setStageUp(level.stage);
    else if (step > p.step) setLevelUp(level.subLevel);
    prev.current = { xp: score.xp, step, stage: level.stage };
  }, [score.xp, level.stage, level.subLevel]);
  useEffect(() => {
    if (levelUp === null) return;
    const t = setTimeout(() => setLevelUp(null), 1500);
    return () => clearTimeout(t);
  }, [levelUp]);

  const apply = useCallback((fn: (bs: AnyBox[]) => AnyBox[]) => {
    setBoxes((bs) => {
      const next = fn(bs);
      latest.current = next;
      return next;
    });
  }, []);

  /** Updates a box locally now and saves it half a second after the last change. */
  const commit = useCallback(
    (id: string, patch: { title?: string; data?: unknown }) => {
      apply((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...patch } as AnyBox) : b)));
      clearTimeout(timers.current.get(id));
      setSaves((s) => ({ ...s, [id]: "saving" }));
      timers.current.set(
        id,
        setTimeout(async () => {
          timers.current.delete(id);
          const b = latest.current.find((x) => x.id === id);
          if (!b) return;
          const res = await updateBox(id, b.title, b.data);
          setSaves((s) => ({ ...s, [id]: res.error ? { error: res.error } : "saved" }));
          onResult(res);
        }, 500),
      );
    },
    [apply, onResult],
  );

  // Warn before leaving while a save is still waiting.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (timers.current.size) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const add = (kind: BoxKind) =>
    start(async () => {
      setError(null);
      const res = await addBox(kind);
      if (res.error) return setError(res.error);
      if (res.box) apply((bs) => [...bs, res.box!]);
      onResult(res);
      addRef.current?.close();
      requestAnimationFrame(() => document.getElementById(`box-${res.box?.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    });

  const move = (id: string, dir: -1 | 1) => {
    const i = boxes.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= boxes.length) return;
    apply((bs) => {
      const next = [...bs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    start(async () => {
      const res = await moveBox(id, dir);
      if (res.error) setError(res.error);
    });
  };

  const remove = (id: string) =>
    start(async () => {
      setError(null);
      clearTimeout(timers.current.get(id));
      timers.current.delete(id);
      const res = await deleteBox(id);
      if (res.error) return setError(res.error);
      apply((bs) => bs.filter((b) => b.id !== id));
      onResult(res);
    });

  const switchTo = (c: TargetChoice) =>
    start(async () => {
      setError(null);
      const res = await changeRoadmapTarget(c.programId, c.position);
      if (res.error) return setError(res.error);
      switchRef.current?.close();
      router.refresh();
    });

  const removeRoadmap = () => {
    // First tap only arms the button (outside the transition, so it isn't disabled and blurred).
    if (!confirmDelete) return setConfirmDelete(true);
    start(async () => {
      const res = await deleteRoadmap();
      if (res.error) return setError(res.error);
      router.refresh();
    });
  };

  const pickFrame = (id: string) => {
    setFrame(id);
    start(async () => {
      const res = await setLook(id);
      if (res.error) setError(res.error);
    });
  };

  const full = boxes.length >= ROADMAP_MAX_BOXES;

  return (
    <div className="space-y-8">
      <RoadmapCard
        program={program}
        score={score}
        stage={{ ...level, name: STAGES[level.stage - 1].name }}
        streak={streak}
        frame={frame}
        termLabel={ctx.term ? termLabel(ctx.term) : null}
        pop={pop}
        levelUp={levelUp}
        actions={
          <>
            <button type="button" onClick={() => switchRef.current?.showModal()} className={buttonStyles.inverse}>
              <RefreshCw aria-hidden className="h-4 w-4" />
              เปลี่ยนเป้าหมาย
            </button>
            <button type="button" onClick={() => rewardsRef.current?.showModal()} className={buttonStyles.inverse}>
              <Gift aria-hidden className="h-4 w-4" />
              ตู้รางวัล
            </button>
            <Link href={`/tcas/${program.programId}`} className="inline-flex h-11 items-center rounded-xl px-3 text-sm font-bold text-white/90 hover:bg-white/10">
              ดูหลักสูตร
            </Link>
          </>
        }
      />

      {error && (
        <p role="alert" className="mx-auto max-w-md rounded-xl bg-danger-soft px-4 py-2.5 text-center text-sm font-bold text-danger">
          {error}
        </p>
      )}

      <StagePanel level={level} api={api} />

      {classStats && <ClassStrip stats={classStats} />}

      <section aria-labelledby="boxes-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="boxes-title" className="font-display text-xl font-bold text-ink">
              กล่องของฉัน
            </h2>
            <p className="text-sm text-muted">
              {boxes.length}/{ROADMAP_MAX_BOXES} กล่อง · เลือกกล่องที่ใช่ จัดลำดับเองได้
            </p>
          </div>
          <button type="button" onClick={() => addRef.current?.showModal()} disabled={full} className={buttonStyles.primary}>
            <Plus aria-hidden className="h-4 w-4" />
            {full ? "ครบ 10 กล่องแล้ว" : "เพิ่มกล่อง"}
          </button>
        </div>

        {boxes.length === 0 ? (
          <button
            type="button"
            onClick={() => addRef.current?.showModal()}
            className="grid w-full place-items-center rounded-3xl border-2 border-dashed border-line-strong bg-surface px-6 py-12 text-center text-muted transition-colors hover:border-brand/40 hover:text-brand"
          >
            <Plus aria-hidden className="mb-2 h-8 w-8" />
            <span className="font-bold">เพิ่มกล่องแรก เช่น เกรดเฉลี่ย ภารกิจ หรือนับถอยหลัง</span>
          </button>
        ) : (
          <ul className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
            {boxes.map((b, i) => (
              <BoxShell
                key={b.id}
                box={b}
                xp={score.boxXp[b.id] ?? 0}
                save={saves[b.id]}
                first={i === 0}
                last={i === boxes.length - 1}
                busy={pending}
                onRename={(title) => commit(b.id, { title })}
                onMove={(dir) => move(b.id, dir)}
                onDelete={() => remove(b.id)}
              >
                {(() => {
                  const Body = BODIES[b.kind];
                  return (
                    <Body
                      boxId={b.id}
                      data={b.data}
                      set={(data: unknown) => commit(b.id, { data })}
                      ctx={ctx}
                      replaceBox={(nb: AnyBox) => apply((bs) => bs.map((x) => (x.id === nb.id ? nb : x)))}
                    />
                  );
                })()}
              </BoxShell>
            ))}
          </ul>
        )}
      </section>

      <div className="flex justify-center border-t border-line pt-6">
        <button type="button" onClick={removeRoadmap} onBlur={() => setConfirmDelete(false)} disabled={pending} className={confirmDelete ? buttonStyles.danger : buttonStyles.ghost}>
          <Trash2 aria-hidden className="h-4 w-4" />
          {confirmDelete ? "กดอีกครั้งเพื่อลบ Roadmap และทุกกล่อง" : "ลบ Roadmap"}
        </button>
      </div>

      <Sheet ref={addRef} title="เลือกกล่อง" subtitle={`ใส่ได้อีก ${ROADMAP_MAX_BOXES - boxes.length} กล่อง · ใส่กล่องแบบเดียวกันซ้ำได้`}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {BOX_KINDS.map((kind) => {
            const Icon = BOX_ICONS[kind];
            const used = boxes.filter((b) => b.kind === kind).length;
            return (
              <li key={kind}>
                <button
                  type="button"
                  onClick={() => add(kind)}
                  disabled={pending || full}
                  className="flex h-full w-full items-start gap-3 rounded-2xl border border-line bg-surface p-3 text-left shadow-soft-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-soft disabled:opacity-50"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                    <Icon aria-hidden className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-ink">
                      {BOX_PRESETS[kind].name}
                      {used > 0 && <span className="ml-1.5 text-xs font-normal text-faint">มีแล้ว {used}</span>}
                    </span>
                    <span className="block text-xs leading-snug text-muted">{BOX_PRESETS[kind].description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>

      <Sheet ref={rewardsRef} title="ตู้รางวัล" subtitle="ผ่านด่านหรือทำต่อเนื่องทุกสัปดาห์ เพื่อปลดล็อกกรอบการ์ด ได้แล้วไม่หายไป">
        <RewardsCabinet
          universityId={program.universityId}
          universityName={program.universityShort}
          color={program.color}
          maxStage={maxStage}
          bestStreak={Math.max(saved.bestStreak, streak)}
          frame={frame}
          onPick={pickFrame}
          busy={pending}
        />
      </Sheet>

      {stageUp !== null && <StageUp stage={stageUp} onClose={() => setStageUp(null)} />}

      <Sheet ref={switchRef} title="เปลี่ยนเป้าหมายของ Roadmap" subtitle="กล่องและข้อมูลทั้งหมดยังอยู่ ภารกิจที่ตรงกันยังติ๊กไว้เหมือนเดิม">
        <form action="/roadmap#pick" className="mb-5 flex gap-2">
          <input
            name="q"
            maxLength={100}
            placeholder="ค้นหาหลักสูตร เช่น วิศวกรรม แพทย์"
            aria-label="ค้นหาหลักสูตรสำหรับ Roadmap"
            className={cx(inputStyles, "h-11 w-full flex-1")}
          />
          <button type="submit" className={buttonStyles.primary}>
            <Search aria-hidden className="h-4 w-4" />
            <span className="hidden sm:inline">ค้นหา</span>
          </button>
        </form>
        {choices.filter((c) => c.programId !== program.programId).length === 0 ? (
          <p className="text-sm text-muted">ยังไม่มีเป้าหมายอื่นที่บันทึกไว้ ค้นหาหลักสูตรด้านบนได้เลย</p>
        ) : (
          <ul className="space-y-2">
            <li className="text-xs font-bold text-muted">หรือเลือกจากเป้าหมายที่บันทึกไว้</li>
            {choices
              .filter((c) => c.programId !== program.programId)
              .map((c) => (
                <li key={c.programId}>
                  <button
                    type="button"
                    onClick={() => switchTo(c)}
                    disabled={pending}
                    className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-left text-sm font-bold text-ink transition-colors hover:border-brand/30 hover:bg-brand-soft hover:text-brand disabled:opacity-50"
                  >
                    {c.label}
                  </button>
                </li>
              ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}

function BoxShell({
  box,
  xp,
  save,
  first,
  last,
  busy,
  onRename,
  onMove,
  onDelete,
  children,
}: {
  box: AnyBox;
  xp: number;
  save: SaveState | undefined;
  first: boolean;
  last: boolean;
  busy: boolean;
  onRename: (title: string) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const Icon = BOX_ICONS[box.kind];
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  return (
    <li id={`box-${box.id}`} className="animate-rise min-w-0 scroll-mt-24 rounded-3xl border border-line bg-surface p-4 shadow-soft-sm sm:p-5">
      <header className="mb-4 flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white shadow-brand-glow">
          <Icon aria-hidden className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              defaultValue={box.title}
              maxLength={60}
              aria-label="ชื่อกล่อง"
              onBlur={(e) => {
                onRename(e.target.value.trim() || BOX_PRESETS[box.kind].name);
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setEditing(false);
              }}
              className="h-8 w-full rounded-lg border border-brand px-2 font-display text-base font-bold text-ink focus:outline-none"
            />
          ) : (
            <h3 className="flex items-center gap-1.5 font-display text-base font-bold text-ink">
              <span className="truncate">{box.title}</span>
              <button type="button" onClick={() => setEditing(true)} aria-label={`เปลี่ยนชื่อกล่อง ${box.title}`} className="rounded-md p-1 text-faint hover:bg-sunken hover:text-brand">
                <Pencil aria-hidden className="h-3.5 w-3.5" />
              </button>
            </h3>
          )}
          <p className="flex items-center gap-1.5 text-[11px] text-faint">
            {box.title !== BOX_PRESETS[box.kind].name && <span>{BOX_PRESETS[box.kind].name} ·</span>}
            <span className="font-bold text-brand">{xp} XP</span>
            {save === "saving" && <span>· กำลังบันทึก…</span>}
            {save === "saved" && (
              <span className="flex items-center gap-0.5 text-success">
                · <Check aria-hidden className="h-3 w-3" /> บันทึกแล้ว
              </span>
            )}
            {typeof save === "object" && <span className="font-bold text-danger">· {save.error}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          <button type="button" onClick={() => onMove(-1)} disabled={first || busy} aria-label="เลื่อนขึ้น" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink disabled:opacity-30">
            <ArrowUp aria-hidden className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={last || busy} aria-label="เลื่อนลง" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink disabled:opacity-30">
            <ArrowDown aria-hidden className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => (confirming ? onDelete() : setConfirming(true))}
            onBlur={() => setConfirming(false)}
            disabled={busy}
            aria-label={confirming ? `ยืนยันลบกล่อง ${box.title}` : `ลบกล่อง ${box.title}`}
            className={cx(
              "grid h-8 place-items-center rounded-lg text-muted transition-colors disabled:opacity-30",
              confirming ? "bg-danger px-2 text-xs font-bold text-white" : "w-8 hover:bg-danger-soft hover:text-danger",
            )}
          >
            {confirming ? "ลบ?" : <Trash2 aria-hidden className="h-4 w-4" />}
          </button>
        </div>
      </header>
      {children}
    </li>
  );
}

/** A bottom sheet on phones, a centred panel from sm up (native <dialog>). */
function Sheet({ ref, title, subtitle, children }: { ref: React.Ref<HTMLDialogElement>; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <dialog
      ref={ref}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      aria-label={title}
      className={cx(
        "fixed m-0 max-h-none max-w-none overflow-hidden bg-surface p-0 text-ink shadow-soft-lg outline-none",
        "backdrop:bg-ink/35 backdrop:backdrop-blur-[2px]",
        "inset-x-0 bottom-0 top-auto w-full rounded-t-3xl open:animate-sheet-up",
        "sm:inset-0 sm:m-auto sm:h-fit sm:w-[40rem] sm:rounded-3xl sm:open:animate-pop",
      )}
    >
      <div className="flex max-h-[85dvh] flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 pb-4 pt-5">
          <div>
            <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-line-strong sm:hidden" />
            <h2 className="font-display text-xl font-extrabold text-ink">{title}</h2>
            <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
          </div>
          <form method="dialog">
            <button aria-label="ปิด" className={iconButtonStyles}>
              <X aria-hidden className="h-5 w-5" />
            </button>
          </form>
        </header>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </dialog>
  );
}

/** "Start a roadmap" for students who have none: pick one of the saved targets. */
export function StartRoadmap({ choices }: { choices: TargetChoice[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <ul className="grid gap-2 sm:grid-cols-2">
        {choices.map((c) => (
          <li key={c.programId}>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setPicked(c.programId);
                  setError(null);
                  const res = await createRoadmap(c.programId, c.position);
                  if (res.error) setError(res.error);
                  else router.refresh();
                })
              }
              className="flex h-full w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left text-sm font-bold text-ink shadow-soft-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-soft disabled:opacity-60"
            >
              <span>{c.label}</span>
              <span className={cx(smallButtonStyles, "pointer-events-none shrink-0")}>{pending && picked === c.programId ? "กำลังสร้าง…" : "สร้าง Roadmap"}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm font-bold text-danger">{error}</p>}
    </div>
  );
}

