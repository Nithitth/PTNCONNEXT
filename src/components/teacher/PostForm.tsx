"use client";

import { startTransition, useActionState, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, CopyCheck, FileText, Link2, Paperclip, Upload, X } from "lucide-react";
import { savePost, type SaveResult } from "@/app/teacher/actions";
import type { Attachment } from "@/lib/calendar";
import {
  EXAM_KIND_LABEL,
  EXAM_LEAD_DAYS,
  MATERIALS_BUCKET,
  MAX_DESCRIPTION,
  SCHOOL,
  fileProblem,
  validatePost,
  type AttachmentInput,
  type ExamKind,
  type PostInput,
  type PostKind,
  type RoomOption,
  type SubjectOption,
} from "@/lib/postForm";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { Button, Notice, cx, inputStyles } from "@/components/ui";

export type FormInitial = {
  subjectId: string;
  title: string;
  description: string;
  contentOrder: string;
  examKind: ExamKind;
  /** room id (or "school") → date value for that room */
  rooms: Record<string, string>;
  eventStart: string;
  eventEnd: string;
};

type Props = {
  kind: PostKind;
  userId: string;
  subjects: SubjectOption[];
  /** Admins: every classroom, for school events. */
  eventRooms: RoomOption[];
  allowSchoolWide: boolean;
  editing?: { postId: string; initial: FormInitial; current: Attachment | null };
};

const COPY: Record<PostKind, { submit: string; titlePlaceholder: string; dateLabel?: string; roomsLabel: string }> = {
  assignment: {
    submit: "มอบหมายงาน",
    titlePlaceholder: "เช่น แบบฝึกหัดบทที่ 3",
    dateLabel: "กำหนดส่ง",
    roomsLabel: "ห้องและกำหนดส่ง",
  },
  material: { submit: "แชร์เอกสาร", titlePlaceholder: "เช่น สไลด์บทที่ 2 เรื่องเวกเตอร์", roomsLabel: "แชร์ให้ห้อง" },
  exam: { submit: "ประกาศวันสอบ", titlePlaceholder: "เช่น สอบกลางภาค", dateLabel: "วันสอบ", roomsLabel: "ห้องและวันสอบ" },
  event: { submit: "สร้างกิจกรรม", titlePlaceholder: "เช่น กีฬาสี", roomsLabel: "ใครเข้าร่วม" },
};

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function PostForm({ kind, userId, subjects, eventRooms, allowSchoolWide, editing }: Props) {
  const router = useRouter();
  const uid = useId();
  const copy = COPY[kind];
  const init = editing?.initial;
  const datedPerRoom = kind === "assignment" || kind === "exam";

  const [subjectId, setSubjectId] = useState(init?.subjectId ?? (subjects.length === 1 ? subjects[0].id : ""));
  const [title, setTitle] = useState(init?.title ?? "");
  const [description, setDescription] = useState(init?.description ?? "");
  const [contentOrder, setContentOrder] = useState(init?.contentOrder ?? "");
  const [examKind, setExamKind] = useState<ExamKind>(init?.examKind ?? "quiz");
  const [rooms, setRooms] = useState<Record<string, string>>(init?.rooms ?? {});
  const [eventStart, setEventStart] = useState(init?.eventStart ?? "");
  const [eventEnd, setEventEnd] = useState(init?.eventEnd ?? "");
  const [lastDate, setLastDate] = useState("");

  const [mode, setMode] = useState<AttachmentInput["mode"]>(
    editing?.current ? "keep" : kind === "material" ? "file" : "none",
  );
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const subject = subjects.find((s) => s.id === subjectId);
  const roomOptions = useMemo<RoomOption[]>(() => {
    const base = kind === "event" ? eventRooms : (subject?.rooms ?? []);
    return allowSchoolWide ? [{ id: SCHOOL, label: "ทั้งโรงเรียน" }, ...base] : base;
  }, [kind, eventRooms, subject, allowSchoolWide]);

  function chooseSubject(id: string) {
    setSubjectId(id);
    // Keep only rooms that the new subject is taught in.
    const allowed = new Set((subjects.find((s) => s.id === id)?.rooms ?? []).map((r) => r.id));
    setRooms((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k === SCHOOL || allowed.has(k))));
  }

  function toggleRoom(id: string) {
    setRooms((prev) => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = lastDate; // new rooms start with the date you typed last
      return next;
    });
  }

  function setRoomDate(id: string, value: string) {
    setRooms((prev) => ({ ...prev, [id]: value }));
    if (value) setLastDate(value);
  }

  function sameForAll() {
    const first = roomOptions.map((r) => rooms[r.id]).find(Boolean);
    if (!first) return;
    setRooms((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, first])));
  }

  function pickFile(f: File | null) {
    setFile(f);
    setFileError(f ? fileProblem(f) : null);
  }

  const checkedIds = roomOptions.map((r) => r.id).filter((id) => id in rooms);

  function buildInput(attachment: AttachmentInput): PostInput {
    return {
      kind,
      subjectId: kind === "event" ? null : subjectId || null,
      title,
      description,
      contentOrder,
      examKind,
      targets: checkedIds.map((id) => ({
        classroomId: id === SCHOOL ? null : id,
        due: kind === "event" ? eventStart : datedPerRoom ? rooms[id] : "",
        end: kind === "event" ? eventEnd : undefined,
      })),
      attachment,
    };
  }

  const [state, run, pending] = useActionState<SaveResult>(async () => {
    // 1) Check everything before uploading anything.
    if (mode === "file" && !file) return { error: "เลือกไฟล์ PDF ที่จะแนบ" };
    let attachment: AttachmentInput =
      mode === "file" && file
        ? { mode: "file", storagePath: "pending", fileName: file.name, size: file.size }
        : mode === "link"
          ? { mode: "link", url }
          : { mode: mode === "keep" ? "keep" : "none" };
    const precheck = validatePost(buildInput(attachment));
    if (!precheck.ok) return { error: precheck.error };

    // 2) Upload the PDF straight to Supabase Storage (into this teacher's own folder).
    const storage = createBrowserSupabase().storage.from(MATERIALS_BUCKET);
    let uploaded: string | null = null;
    if (mode === "file" && file) {
      uploaded = `${userId}/${crypto.randomUUID()}.pdf`;
      const { error } = await storage.upload(uploaded, file, { contentType: "application/pdf", upsert: false });
      if (error) return { error: "อัปโหลดไฟล์ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง" };
      attachment = { mode: "file", storagePath: uploaded, fileName: file.name, size: file.size };
    }

    // 3) Save. If saving fails, remove the file we just uploaded.
    let result: SaveResult;
    try {
      result = await savePost(editing?.postId ?? null, buildInput(attachment));
    } catch {
      result = { error: "เชื่อมต่อไม่สำเร็จ ลองอีกครั้ง" };
    }
    if (result.error && uploaded) await storage.remove([uploaded]);
    if (result.ok) {
      router.push(`/teacher?tab=mine&saved=${editing ? "edit" : kind}`);
      router.refresh();
    }
    return result;
  }, {});

  const noSubjects = kind !== "event" && subjects.length === 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(() => run());
      }}
      className="space-y-6"
      noValidate
    >
      {noSubjects && (
        <Notice tone="warning">
          ยังไม่มีวิชาที่คุณสอนในระบบ ผู้ดูแลระบบต้องนำเข้ารายชื่อครูพร้อมวิชาและห้องที่สอนก่อน
        </Notice>
      )}

      {kind !== "event" && (
        <Section label="วิชา" htmlFor={`${uid}-subject`}>
          <select
            id={`${uid}-subject`}
            value={subjectId}
            onChange={(e) => chooseSubject(e.target.value)}
            className={cx(inputStyles, "h-12 w-full")}
            disabled={noSubjects}
            required
          >
            <option value="" disabled>
              เลือกวิชา
            </option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Section>
      )}

      {kind === "exam" && (
        <Section label="ประเภทการสอบ">
          <div role="radiogroup" aria-label="ประเภทการสอบ" className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(EXAM_KIND_LABEL) as ExamKind[]).map((k) => {
              const on = examKind === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setExamKind(k)}
                  className={cx(
                    "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm font-bold transition-all duration-150",
                    on ? "border-brand bg-brand-soft text-ink shadow-soft-sm" : "border-line bg-surface text-muted hover:border-brand/30",
                  )}
                >
                  {/* light = days before, dark = exam day */}
                  <span aria-hidden className="flex shrink-0 overflow-hidden rounded-md border border-line">
                    <span className={cx("h-6 w-4", k === "major" ? "bg-major-tint" : "bg-exam-tint")} />
                    <span className={cx("h-6 w-4", k === "major" ? "bg-major-soft" : "bg-exam-soft")} />
                  </span>
                  <span>
                    {EXAM_KIND_LABEL[k]}
                    <span className="block text-xs font-normal text-muted">
                      ไฮไลต์ล่วงหน้า {EXAM_LEAD_DAYS[k]} วันก่อนสอบ
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      <Section label="ชื่อเรื่อง" htmlFor={`${uid}-title`}>
        <input
          id={`${uid}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={copy.titlePlaceholder}
          maxLength={200}
          className={cx(inputStyles, "h-12 w-full")}
          required
        />
      </Section>

      <Section label="รายละเอียด" optional htmlFor={`${uid}-desc`}>
        <textarea
          id={`${uid}-desc`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={MAX_DESCRIPTION}
          placeholder={kind === "assignment" ? "เช่น ทำข้อ 1–10 ส่งในสมุด" : "รายละเอียดเพิ่มเติม"}
          className={cx(inputStyles, "min-h-24 w-full resize-y py-3 leading-relaxed")}
        />
      </Section>

      {kind === "event" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Section label="วันเริ่ม" htmlFor={`${uid}-start`}>
            <input id={`${uid}-start`} type="date" value={eventStart} onChange={(e) => setEventStart(e.target.value)} className={cx(inputStyles, "h-12 w-full")} />
          </Section>
          <Section label="วันสิ้นสุด" optional htmlFor={`${uid}-end`}>
            <input
              id={`${uid}-end`}
              type="date"
              value={eventEnd}
              min={eventStart || undefined}
              onChange={(e) => setEventEnd(e.target.value)}
              className={cx(inputStyles, "h-12 w-full")}
            />
          </Section>
        </div>
      )}

      <Section
        label={copy.roomsLabel}
        aside={
          datedPerRoom && checkedIds.length > 1 ? (
            <button
              type="button"
              onClick={sameForAll}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-brand transition-colors hover:bg-brand-soft"
            >
              <CopyCheck aria-hidden className="h-3.5 w-3.5" />
              ใช้วันเดียวกันทุกห้อง
            </button>
          ) : null
        }
      >
        {roomOptions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm text-muted">
            {kind === "event" ? "ยังไม่มีห้องเรียนในปีการศึกษานี้" : "เลือกวิชาก่อน แล้วห้องที่คุณสอนจะแสดงที่นี่"}
          </p>
        ) : datedPerRoom ? (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {roomOptions.map((r) => {
              const on = r.id in rooms;
              return (
                <li key={r.id} className={cx("flex flex-wrap items-center gap-3 px-3 py-2.5 transition-colors", on && "bg-brand-soft/50")}>
                  <RoomToggle label={r.label} on={on} onToggle={() => toggleRoom(r.id)} />
                  {on ? (
                    <input
                      type={kind === "assignment" ? "datetime-local" : "date"}
                      aria-label={`${copy.dateLabel} ${r.label}`}
                      value={rooms[r.id]}
                      onChange={(e) => setRoomDate(r.id, e.target.value)}
                      className={cx(inputStyles, "h-10 min-w-0 flex-1 basis-48 text-sm")}
                    />
                  ) : (
                    <span className="text-xs text-faint">แตะเพื่อเลือกห้องนี้</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-wrap gap-2">
            {roomOptions.map((r) => (
              <RoomToggle key={r.id} label={r.label} on={r.id in rooms} onToggle={() => toggleRoom(r.id)} />
            ))}
          </div>
        )}
      </Section>

      {kind === "material" && (
        <Section label="ลำดับเนื้อหา" optional htmlFor={`${uid}-order`}>
          <div className="flex items-center gap-3">
            <input
              id={`${uid}-order`}
              type="number"
              min={0}
              max={9999}
              inputMode="numeric"
              value={contentOrder}
              onChange={(e) => setContentOrder(e.target.value)}
              placeholder="เช่น 2"
              className={cx(inputStyles, "h-12 w-24 text-center tabular-nums")}
            />
            <span className="text-sm text-muted">เช่น บทที่ ใช้เรียงเอกสารให้นักเรียน</span>
          </div>
        </Section>
      )}

      {kind !== "event" && (
        <Section label="ไฟล์หรือลิงก์" optional={kind !== "material"}>
          <div role="radiogroup" aria-label="แนบไฟล์หรือลิงก์" className="mb-3 flex flex-wrap gap-1.5 rounded-xl border border-line bg-sunken p-1 sm:inline-flex">
            {(
              [
                editing?.current && { value: "keep", label: "ใช้ของเดิม", Icon: Check },
                kind !== "material" && { value: "none", label: "ไม่แนบ", Icon: X },
                { value: "file", label: "ไฟล์ PDF", Icon: Paperclip },
                { value: "link", label: "ลิงก์", Icon: Link2 },
              ].filter(Boolean) as { value: typeof mode; label: string; Icon: typeof Check }[]
            ).map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={cx(
                  "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition-all duration-150 sm:flex-none",
                  mode === value ? "bg-surface text-brand shadow-soft-sm" : "text-muted hover:text-brand",
                )}
              >
                <Icon aria-hidden className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {mode === "keep" && editing?.current && (
            <p className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink">
              {editing.current.kind === "file" ? (
                <FileText aria-hidden className="h-4 w-4 shrink-0 text-brand" />
              ) : (
                <Link2 aria-hidden className="h-4 w-4 shrink-0 text-brand" />
              )}
              <span className="truncate">{editing.current.name}</span>
            </p>
          )}

          {mode === "link" && (
            <input
              aria-label="ลิงก์"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/…"
              className={cx(inputStyles, "h-12 w-full")}
            />
          )}

          {mode === "file" && (
            <div>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                id="post-file"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                    <FileText aria-hidden className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">{file.name}</span>
                    <span className="text-xs text-muted">{sizeLabel(file.size)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      pickFile(null);
                      if (fileInput.current) fileInput.current.value = "";
                    }}
                    className="rounded-lg p-2 text-muted transition-colors hover:bg-sunken hover:text-brand"
                    aria-label="เอาไฟล์ออก"
                  >
                    <X aria-hidden className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="post-file"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    pickFile(e.dataTransfer.files?.[0] ?? null);
                  }}
                  className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-line-strong bg-surface px-4 py-6 text-center transition-colors hover:border-brand/40 hover:bg-brand-soft/40"
                >
                  <Upload aria-hidden className="h-5 w-5 text-brand" />
                  <span className="text-sm font-bold text-ink">เลือกไฟล์ PDF หรือลากมาวางที่นี่</span>
                  <span className="text-xs text-muted">ไม่เกิน 10 MB · ไฟล์อื่น ๆ ให้แชร์เป็นลิงก์</span>
                </label>
              )}
              {fileError && (
                <div className="mt-2">
                  <Notice tone="error">{fileError}</Notice>
                </div>
              )}
            </div>
          )}
        </Section>
      )}

      {state.error && <Notice tone="error">{state.error}</Notice>}

      <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-end">
        {editing && (
          <Button type="button" variant="ghost" onClick={() => router.push("/teacher?tab=mine")}>
            ยกเลิก
          </Button>
        )}
        <Button type="submit" variant="primary" className="sm:min-w-44" disabled={pending || noSubjects || Boolean(fileError)}>
          {pending ? (mode === "file" && file ? "กำลังอัปโหลด…" : "กำลังบันทึก…") : editing ? "บันทึกการแก้ไข" : copy.submit}
        </Button>
      </div>
    </form>
  );
}

function Section({
  label,
  htmlFor,
  optional,
  aside,
  children,
}: {
  label: string;
  htmlFor?: string;
  optional?: boolean;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <Label htmlFor={htmlFor} className="text-sm font-bold text-ink">
          {label}
          {optional && <span className="ml-1.5 font-normal text-faint">(ไม่บังคับ)</span>}
        </Label>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** A <label> when it points at one control, otherwise plain text. */
function Label({ htmlFor, className, children }: { htmlFor?: string; className: string; children: ReactNode }) {
  return htmlFor ? (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  ) : (
    <span className={className}>{children}</span>
  );
}

function RoomToggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onToggle}
      className={cx(
        "inline-flex h-10 min-w-24 items-center justify-center gap-1.5 rounded-xl border px-3.5 text-sm font-bold transition-all duration-150 active:scale-[0.97]",
        on
          ? "border-brand bg-brand text-white shadow-brand-glow"
          : "border-line bg-surface text-ink hover:border-brand/30 hover:bg-brand-soft hover:text-brand",
      )}
    >
      <span
        aria-hidden
        className={cx(
          "grid h-4 w-4 place-items-center rounded-[5px] border transition-colors",
          on ? "border-white bg-white text-brand" : "border-line-strong bg-surface",
        )}
      >
        {on && <Check className="h-3 w-3" strokeWidth={3.2} />}
      </span>
      {label}
    </button>
  );
}
