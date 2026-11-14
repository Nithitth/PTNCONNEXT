"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, DoorOpen, ExternalLink, Flag, Link2, Lock, Paperclip, PartyPopper, Pencil, Trash2, Users, X } from "lucide-react";
import { removeProof, saveProof, type RoadmapResult } from "@/app/roadmap/actions";
import { cx } from "@/components/ui";
import { CompressError, compressImage, compressPdf } from "@/lib/compressFile";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import {
  PROOF_BUCKET,
  PROOF_MAX_BYTES,
  PROOF_MAX_PICK_BYTES,
  REWARDS,
  STAGES,
  isUnlocked,
  needText,
  universityTheme,
  type LevelState,
  type Proof,
  type StageId,
} from "@/lib/roadmapLevels";
import { fieldStyles } from "./boxParts";

// The level system's pieces on the board: proof buttons, the stage panel, the stage-up moment,
// the rewards cabinet and the class strip. Rules live in src/lib/roadmapLevels.ts.

export type ProofApi = { proofs: Proof[]; userId: string; onResult: (res: RoadmapResult) => void };

const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const chip =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-bold text-ink transition-colors hover:border-brand/40 hover:text-brand disabled:opacity-50";
const iconChip =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-brand/40 hover:text-danger disabled:opacity-50";

/** Attach / view / remove the proof for one gate step (a photo/PDF, a link or a score). */
export function ProofControl({ api, step, kinds, label }: { api: ProofApi; step: string; kinds: Proof["kind"][]; label: string }) {
  const existing = api.proofs.find((p) => p.step === step) ?? null;
  const [mode, setMode] = useState<"link" | "number" | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [shrinking, setShrinking] = useState(false);

  const done = (res: RoadmapResult) => {
    if (res.error) return setError(res.error);
    setError(null);
    setMode(null);
    setText("");
    api.onResult(res);
  };

  // Photos and PDFs are shrunk in the browser first (compressFile.ts), so phone photos over 5 MB still fit.
  const upload = (picked: File) =>
    start(async () => {
      setError(null);
      if (!EXT[picked.type]) return setError("รองรับเฉพาะ PDF, JPG, PNG หรือ WEBP");
      if (picked.size > PROOF_MAX_PICK_BYTES) return setError("ไฟล์ใหญ่เกิน 20 MB");
      let file: File;
      setShrinking(true);
      try {
        const opts = { maxBytes: PROOF_MAX_BYTES };
        file = (picked.type === "application/pdf" ? await compressPdf(picked, opts) : await compressImage(picked, opts)).file;
      } catch (e) {
        return setError(e instanceof CompressError ? e.message : "ย่อไฟล์ไม่สำเร็จ ลองอีกครั้ง");
      } finally {
        setShrinking(false);
      }
      if (file.size > PROOF_MAX_BYTES) return setError("ไฟล์ใหญ่เกิน 5 MB แม้ย่อแล้ว");
      const ext = EXT[file.type];
      const path = `${api.userId}/${crypto.randomUUID()}.${ext}`;
      const sb = createBrowserSupabase();
      const { error: upError } = await sb.storage.from(PROOF_BUCKET).upload(path, file, { contentType: file.type });
      if (upError) return setError("อัปโหลดไม่สำเร็จ ลองอีกครั้ง");
      const res = await saveProof(step, { kind: "file", path });
      if (res.error) await sb.storage.from(PROOF_BUCKET).remove([path]);
      done(res);
    });

  const submit = () =>
    start(async () => {
      if (mode === "link") done(await saveProof(step, { kind: "link", url: text }));
      if (mode === "number") {
        const value = Number(text.replace(",", "."));
        if (text.trim() === "" || !Number.isFinite(value)) return setError("ใส่ตัวเลข 0–100");
        done(await saveProof(step, { kind: "number", value }));
      }
    });

  const remove = () => start(async () => done(await removeProof(step)));

  if (mode) {
    return (
      <div className="mt-2 space-y-1.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex gap-1.5"
        >
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            inputMode={mode === "number" ? "decimal" : "url"}
            placeholder={mode === "number" ? "คะแนน 0–100" : "https://"}
            maxLength={mode === "number" ? 6 : 500}
            aria-label={mode === "number" ? `คะแนน ${label}` : `ลิงก์หลักฐาน ${label}`}
            className={cx(fieldStyles, "h-9 min-w-0 flex-1")}
          />
          <button type="submit" disabled={busy} className={"inline-flex h-9 items-center rounded-lg bg-brand px-3 text-xs font-bold text-white hover:bg-brand-hover disabled:opacity-50"}>
            {busy ? "กำลังบันทึก…" : "บันทึก"}
          </button>
          <button type="button" onClick={() => setMode(null)} aria-label="ยกเลิก" className={iconChip}>
            <X aria-hidden className="h-4 w-4" />
          </button>
        </form>
        {error && <p className="text-xs font-bold text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {existing ? (
          <>
            <span className="inline-flex h-8 items-center gap-1 rounded-lg bg-success/10 px-2.5 text-xs font-bold text-success">
              <Check aria-hidden className="h-3.5 w-3.5" />
              {existing.kind === "number" ? `คะแนน ${existing.value}` : existing.kind === "link" ? "แนบลิงก์แล้ว" : "แนบไฟล์แล้ว"}
            </span>
            {existing.kind === "number" ? (
              <button
                type="button"
                onClick={() => {
                  setText(String(existing.value ?? ""));
                  setMode("number");
                }}
                className={chip}
              >
                <Pencil aria-hidden className="h-3.5 w-3.5" />
                แก้คะแนน
              </button>
            ) : (
              <a href={`/roadmap/proof/${existing.id}`} target="_blank" rel="noopener noreferrer" className={chip}>
                <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                ดูหลักฐาน
              </a>
            )}
            <button type="button" onClick={remove} disabled={busy} aria-label={`ลบหลักฐาน ${label}`} className={iconChip}>
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            {kinds.includes("file") && (
              <label className={cx(chip, "cursor-pointer has-[:disabled]:opacity-50")}>
                <Paperclip aria-hidden className="h-3.5 w-3.5" />
                {shrinking ? "กำลังย่อไฟล์…" : busy ? "กำลังอัปโหลด…" : "แนบรูป/PDF"}
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  disabled={busy}
                  className="sr-only"
                  aria-label={`แนบรูปหรือ PDF เป็นหลักฐาน ${label}`}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) upload(f);
                  }}
                />
              </label>
            )}
            {kinds.includes("link") && (
              <button type="button" onClick={() => setMode("link")} className={chip}>
                <Link2 aria-hidden className="h-3.5 w-3.5" />
                แนบลิงก์
              </button>
            )}
            {kinds.includes("number") && (
              <button type="button" onClick={() => setMode("number")} className={chip}>
                <Pencil aria-hidden className="h-3.5 w-3.5" />
                ใส่คะแนน
              </button>
            )}
          </>
        )}
      </div>
      {error && <p className="text-xs font-bold text-danger">{error}</p>}
    </div>
  );
}

/** "ด่าน N · name": the 6-stage track, this stage's gate checklist (with proof), and all stages folded below. */
export function StagePanel({ level, api }: { level: LevelState; api: ProofApi }) {
  const info = STAGES[level.stage - 1];
  const steps = level.gates[level.stage];
  const left = steps.filter((s) => !s.done).length;
  return (
    <section aria-labelledby="stage-title" className="rounded-3xl border border-line bg-surface p-4 shadow-soft sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-brand">{level.finished ? "ผ่านครบทุกด่านแล้ว" : `ด่าน ${level.stage} จาก 6`}</p>
          <h2 id="stage-title" className="font-display text-2xl font-extrabold text-ink">
            {info.name}
          </h2>
          <p className="text-sm text-muted">{info.goal}</p>
        </div>
        {!level.finished && (
          <span className="flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand">
            <DoorOpen aria-hidden className="h-4 w-4" />
            เหลืออีก {left} ข้อเพื่อผ่านด่าน
          </span>
        )}
      </div>

      <ol aria-label="ด่านทั้ง 6" className="mt-5 grid grid-cols-6 gap-1.5">
        {STAGES.map((s) => {
          const passed = s.id < level.stage || level.finished;
          const here = s.id === level.stage && !level.finished;
          return (
            <li key={s.id} className="min-w-0">
              <div className={cx("h-2 rounded-full", passed ? "bg-brand-gradient" : here ? "bg-brand/30" : "bg-sunken")}>
                {here && <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${(level.xpInStage / level.stageSize) * 100}%` }} />}
              </div>
              <p className={cx("mt-1.5 truncate text-center text-[10px] font-bold sm:text-xs", here ? "text-brand" : passed ? "text-ink" : "text-faint")}>
                <span className="sm:hidden">{s.id}</span>
                <span className="hidden sm:inline">{s.name}</span>
                <span className="sr-only">{passed ? " (ผ่านแล้ว)" : here ? " (ตอนนี้)" : ""}</span>
              </p>
            </li>
          );
        })}
      </ol>

      {level.gateWaiting && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm font-bold text-brand">
          <Flag aria-hidden className="h-4 w-4 shrink-0" />
          XP ด่านนี้เต็มแล้ว! ทำเช็กลิสต์ด้านล่างให้ครบเพื่อผ่านประตูด่าน
        </p>
      )}

      {!level.finished && (
        <>
          <h3 className="mb-2 mt-5 text-sm font-bold text-ink">เช็กลิสต์ผ่านด่าน</h3>
          <GateList steps={steps} api={api} />
        </>
      )}

      <details className="group mt-5 border-t border-line pt-4">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-muted hover:text-brand">
          <ChevronDown aria-hidden className="h-4 w-4 transition-transform group-open:rotate-180" />
          ดูเช็กลิสต์ทุกด่าน
        </summary>
        <ol className="mt-3 space-y-4">
          {STAGES.map((s) => (
            <li key={s.id}>
              <p className="mb-1.5 text-sm font-bold text-ink">
                ด่าน {s.id} · {s.name}
                {(s.id < level.stage || level.finished) && <span className="ml-1.5 text-xs text-success">ผ่านแล้ว</span>}
              </p>
              <GateList steps={level.gates[s.id as StageId]} api={api} withProof={s.id !== level.stage || level.finished} />
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

function GateList({ steps, api, withProof = true }: { steps: LevelState["gates"][StageId]; api: ProofApi; withProof?: boolean }) {
  return (
    <ul className="space-y-1.5">
      {steps.map((s) => (
        <li
          key={s.key}
          className={cx("flex items-start gap-2.5 rounded-xl border px-3 py-2.5", s.done ? "border-success/25 bg-success/5" : "border-line bg-surface")}
        >
          <span
            className={cx(
              "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border",
              s.done ? "border-success bg-success text-white" : "border-line-strong",
            )}
          >
            {s.done && <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />}
            <span className="sr-only">{s.done ? "เสร็จแล้ว" : "ยังไม่เสร็จ"}</span>
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className={cx("leading-snug", s.done ? "text-muted" : "text-ink")}>
              {s.label}
              {s.na && <span className="ml-1.5 text-xs text-faint">ไม่ต้องทำ</span>}
              {s.progress && !s.na && <span className="ml-1.5 text-xs font-bold text-brand">{s.progress}</span>}
            </p>
            {s.key === "activities" && !s.done && <p className="text-xs text-muted">กด “แนบหลักฐาน” ที่กิจกรรมแต่ละรายการในกล่องกิจกรรม</p>}
            {s.proof && !s.na && withProof && <ProofControl api={api} step={s.proof.step} kinds={s.proof.kinds} label={s.proof.label} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The full-screen "passed a stage" moment, with the rewards it unlocked. Tap anywhere to close. */
export function StageUp({ stage, onClose }: { stage: StageId; onClose: () => void }) {
  const info = STAGES[stage - 1];
  const prevInfo = STAGES[stage - 2];
  const unlocked = REWARDS.filter((r) => r.need.stage === stage);
  return (
    <div role="alertdialog" aria-label={`ผ่านด่าน ${stage - 1} แล้ว ตอนนี้อยู่ด่าน ${stage}`} onClick={onClose} className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4 backdrop-blur-sm">
      <div className="stage-up bg-feature-gradient speed-lines relative w-full max-w-sm overflow-hidden rounded-[28px] px-6 py-8 text-center text-white shadow-brand-glow-lg">
        <div aria-hidden className="stage-rays pointer-events-none absolute inset-[-50%]" />
        <div className="relative">
          <PartyPopper aria-hidden className="mx-auto h-10 w-10" />
          <p className="mt-3 text-sm font-bold text-white/85">ผ่านด่าน {prevInfo?.name ?? ""} แล้ว!</p>
          <p className="mt-1 text-xs font-bold text-white/70">ตอนนี้อยู่</p>
          <p className="font-display text-4xl font-extrabold">ด่าน {stage}</p>
          <p className="font-display text-2xl font-bold">{info.name}</p>
          {unlocked.length > 0 && (
            <p className="mx-auto mt-4 w-fit rounded-full bg-white px-3 py-1 text-xs font-bold text-brand">
              ปลดล็อก: {unlocked.map((r) => `กรอบ${r.name}`).join(" · ")}
            </p>
          )}
          <button type="button" onClick={onClose} className="mt-6 h-11 rounded-xl bg-white px-6 text-sm font-bold text-brand shadow-soft">
            ไปต่อ
          </button>
        </div>
      </div>
    </div>
  );
}

/** Card frames to pick from (locked ones say how to get them). The card's colours follow the target university. */
export function RewardsCabinet({
  universityId,
  universityName,
  color,
  maxStage,
  bestStreak,
  frame,
  onPick,
  busy,
}: {
  universityId: string;
  universityName: string;
  /** The target faculty's colour (the glass frame uses it). */
  color: string;
  maxStage: number;
  bestStreak: number;
  frame: string;
  onPick: (id: string) => void;
  busy: boolean;
}) {
  const face = universityTheme(universityId);
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-sunken px-3 py-2 text-xs leading-relaxed text-muted">
        สีการ์ดเป็นสีของ{universityName ? ` ${universityName} ` : "มหาวิทยาลัยเป้าหมาย"}เสมอ และเปลี่ยนตามเมื่อเปลี่ยนเป้าหมาย กรอบกระจกใสเป็นสีของคณะ
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {REWARDS.map((r) => {
          const open = isUnlocked(r, maxStage, bestStreak);
          const on = frame === r.id;
          return (
            <li key={r.id}>
              <button
                type="button"
                disabled={!open || busy}
                onClick={() => onPick(r.id)}
                aria-pressed={on}
                className={cx(
                  "flex h-full w-full flex-col items-stretch gap-2 rounded-2xl border p-2 text-left transition-[border-color,box-shadow]",
                  on ? "border-brand shadow-brand-glow" : "border-line hover:border-brand/40",
                  !open && "cursor-not-allowed",
                )}
              >
                <span data-frame={r.id} className="roadmap-card block rounded-xl p-[3px]" style={{ ["--fc" as string]: color }}>
                  <span data-theme={face} className="roadmap-face bg-feature-gradient speed-lines relative block h-10 overflow-hidden rounded-[9px]" />
                </span>
                <span className="px-1 text-sm font-bold text-ink">
                  {r.name}
                  {on && <span className="ml-1 text-xs text-brand">ใช้อยู่</span>}
                </span>
                {!open && (
                  <span className="flex items-start gap-1 px-1 text-[11px] leading-snug text-muted">
                    <Lock aria-hidden className="mt-px h-3 w-3 shrink-0" />
                    {needText(r)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Anonymous room comparison (students only; the database hides it under 3 classmates). */
export function ClassStrip({ stats }: { stats: { students: number; avgStage: number; behind: number } }) {
  return (
    <p className="flex items-start gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted shadow-soft-sm">
      <Users aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
      <span>
        ในห้องของคุณ <b className="text-ink">{stats.students.toLocaleString("th-TH")} คน</b> มี Roadmap · ด่านเฉลี่ย{" "}
        <b className="text-ink">{stats.avgStage.toLocaleString("th-TH", { maximumFractionDigits: 1 })}</b>
        {stats.behind > 0 ? (
          <>
            {" "}
            · คุณนำหน้า <b className="text-brand">{stats.behind.toLocaleString("th-TH")} คน</b>
          </>
        ) : (
          " · ค่อย ๆ ไปทีละด่าน ทุกคนเริ่มจากจุดเดียวกัน"
        )}
        <span className="block text-xs text-faint">ไม่มีใครเห็นชื่อหรือข้อมูลของคุณ</span>
      </span>
    </p>
  );
}
