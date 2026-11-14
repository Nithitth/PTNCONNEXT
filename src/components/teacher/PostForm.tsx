"use client";

import { startTransition, useActionState, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, CopyCheck, FileText, Link2, ListOrdered, Paperclip, Upload, X, type LucideIcon } from "lucide-react";
import { DatePicker } from "@/components/DatePicker";
import { savePost, type SaveResult } from "@/app/teacher/actions";
import type { Attachment } from "@/lib/calendar";
import { CompressError, compressPdf, type CompressProgress } from "@/lib/compressFile";
import {
  EXAM_KIND_LABEL,
  EXAM_LEAD_DAYS,
  FILE_LIFETIME_DAYS,
  MATERIALS_BUCKET,
  MAX_DESCRIPTION,
  MAX_FILE_BYTES,
  SCHOOL,
  fileProblem,
  pickProblem,
  validatePost,
  type AttachmentInput,
  type ExamKind,
  type PostInput,
  type PostKind,
  type RoomOption,
  type SubjectOption,
} from "@/lib/postForm";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { ExpiryChip } from "@/components/FileExpiry";
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
  /** The 8 classrooms; any of them can be picked, one by one or all at once. */
  rooms: RoomOption[];
  /** Admins on school events: also offer "ทั้งโรงเรียน". */
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

export function PostForm({ kind, userId, subjects, rooms: classrooms, allowSchoolWide, editing }: Props) {
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
  // `original` is what the teacher picked; `file` is the compressed copy (or the original when it was small enough).
  const [original, setOriginal] = useState<File | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [useOriginal, setUseOriginal] = useState(false);
  const [progress, setProgress] = useState<CompressProgress | "start" | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pickCount = useRef(0); // ignores a slow compression when another file was picked meanwhile
  const chosen = useOriginal ? original : file;

  const roomOptions = useMemo<RoomOption[]>(
    () => (allowSchoolWide ? [{ id: SCHOOL, label: "ทั้งโรงเรียน" }, ...classrooms] : classrooms),
    [classrooms, allowSchoolWide],
  );
  const allPicked = classrooms.length > 0 && classrooms.every((r) => r.id in rooms);

  /** "เลือกทั้ง 8 ห้อง": tick every classroom (each keeps its own date box), or untick them all. */
  function toggleAllRooms() {
    setRooms((prev) => {
      if (allPicked) return SCHOOL in prev ? { [SCHOOL]: prev[SCHOOL] } : {};
      const next = { ...prev };
      for (const r of classrooms) if (!(r.id in next)) next[r.id] = lastDate;
      return next;
    });
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

  /** "ใช้วันเดียวกันทุกห้อง": one date for every room picked so far. */
  function setAllDates(value: string) {
    setRooms((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, value])));
    if (value) setLastDate(value);
  }

  /** A PDF was picked or dropped: check it, then compress it in the browser (compressFile.ts). */
  async function pickFile(f: File | null) {
    const mine = ++pickCount.current;
    const current = () => pickCount.current === mine;
    setOriginal(f);
    setFile(null);
    setUseOriginal(false);
    setProgress(null);
    setFileError(null);
    if (!f) return;
    const problem = pickProblem(f);
    if (problem) return setFileError(problem);

    setProgress("start");
    try {
      const result = await compressPdf(f, { maxBytes: MAX_FILE_BYTES, onProgress: (p) => current() && setProgress(p) });
      if (!current()) return;
      setFile(result.file);
      setFileError(fileProblem(result.file));
    } catch (e) {
      if (current()) setFileError(e instanceof CompressError ? e.message : "ย่อขนาดไฟล์ไม่สำเร็จ ลองเลือกไฟล์อีกครั้ง");
    } finally {
      if (current()) setProgress(null);
    }
  }

  const checkedIds = roomOptions.map((r) => r.id).filter((id) => id in rooms);
  // The shared date box shows a date only while every picked room has that same date.
  const pickedDates = new Set(checkedIds.map((id) => rooms[id]));
  const allSameDate = pickedDates.size === 1 ? [...pickedDates][0] : "";
  // Step numbers follow the steps actually shown for this kind of post.
  let stepCount = 0;
  const step = () => ++stepCount;

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
    if (mode === "file" && progress) return { error: "รอให้ย่อขนาดไฟล์เสร็จก่อน" };
    if (mode === "file" && !chosen) return { error: "เลือกไฟล์ PDF ที่จะแนบ" };
    const upload = mode === "file" ? chosen : null;
    let attachment: AttachmentInput =
      upload
        ? { mode: "file", storagePath: "pending", fileName: upload.name, size: upload.size }
        : mode === "link"
          ? { mode: "link", url }
          : { mode: mode === "keep" ? "keep" : "none" };
    const precheck = validatePost(buildInput(attachment));
    if (!precheck.ok) return { error: precheck.error };

    // 2) Upload the PDF straight to Supabase Storage (into this teacher's own folder).
    const storage = createBrowserSupabase().storage.from(MATERIALS_BUCKET);
    let uploaded: string | null = null;
    if (upload) {
      uploaded = `${userId}/${crypto.randomUUID()}.pdf`;
      const { error } = await storage.upload(uploaded, upload, { contentType: "application/pdf", upsert: false });
      if (error) return { error: "อัปโหลดไฟล์ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง" };
      attachment = { mode: "file", storagePath: uploaded, fileName: upload.name, size: upload.size };
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

      <p className="flex items-center gap-2 rounded-xl bg-sunken px-3.5 py-2.5 text-sm text-muted">
        <ListOrdered aria-hidden className="h-4 w-4 shrink-0 text-brand" />
        ทำตามขั้นตอนจากบนลงล่าง ขั้นที่เขียนว่า “ไม่บังคับ” ข้ามได้
      </p>

      <ol className="space-y-0">
        {kind !== "event" && (
          <Step n={step()} label="เลือกวิชา" htmlFor={`${uid}-subject`}>
            <select
              id={`${uid}-subject`}
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
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
          </Step>
        )}

        {kind === "exam" && (
          <Step n={step()} label="เลือกประเภทการสอบ">
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
                      <span className="block text-xs font-normal text-muted">ไฮไลต์ล่วงหน้า {EXAM_LEAD_DAYS[k]} วันก่อนสอบ</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Step>
        )}

        <Step n={step()} label="ตั้งชื่อเรื่อง" htmlFor={`${uid}-title`}>
          <input
            id={`${uid}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={copy.titlePlaceholder}
            maxLength={200}
            className={cx(inputStyles, "h-12 w-full")}
            required
          />
        </Step>

        <Step n={step()} label="เขียนรายละเอียด" optional htmlFor={`${uid}-desc`}>
          <textarea
            id={`${uid}-desc`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={MAX_DESCRIPTION}
            placeholder={kind === "assignment" ? "เช่น ทำข้อ 1–10 ส่งในสมุด" : "รายละเอียดเพิ่มเติม"}
            className={cx(inputStyles, "min-h-24 w-full resize-y py-3 leading-relaxed")}
          />
        </Step>

        {kind === "event" && (
          <Step n={step()} label="เลือกวันจัดกิจกรรม">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs font-bold text-muted">วันเริ่ม</p>
                <DatePicker label="วันเริ่มกิจกรรม" value={eventStart} onChange={setEventStart} />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-bold text-muted">
                  วันสิ้นสุด <span className="font-normal text-faint">(ไม่บังคับ)</span>
                </p>
                <DatePicker
                  label="วันสิ้นสุดกิจกรรม"
                  value={eventEnd}
                  onChange={setEventEnd}
                  min={eventStart || undefined}
                  placeholder="วันเดียวจบ"
                  clearable
                />
              </div>
            </div>
          </Step>
        )}

        <Step n={step()} label={kind === "event" ? "เลือกผู้เข้าร่วม" : "เลือกห้อง"} hint="แตะห้องเพื่อเลือก เลือกได้หลายห้อง">
          {roomOptions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm text-muted">
              ยังไม่มีห้องเรียนในปีการศึกษานี้ ผู้ดูแลระบบต้องสร้างห้องก่อน
            </p>
          ) : (
            <div className="space-y-3">
              {classrooms.length > 1 && (
                <BigOptionButton
                  on={allPicked}
                  onClick={toggleAllRooms}
                  Icon={CheckCheck}
                  title={allPicked ? `เลือกครบทั้ง ${classrooms.length} ห้องแล้ว (แตะเพื่อยกเลิก)` : `เลือกทั้ง ${classrooms.length} ห้อง`}
                  note="ไม่บังคับ · ทางลัดแทนการแตะทีละห้อง"
                />
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {roomOptions.map((r) => (
                  <RoomToggle key={r.id} label={r.label} on={r.id in rooms} onToggle={() => toggleRoom(r.id)} />
                ))}
              </div>
              <p className="text-xs text-muted" aria-live="polite">
                {checkedIds.length === 0 ? "ยังไม่ได้เลือกห้อง" : `เลือกแล้ว ${checkedIds.length} ห้อง`}
              </p>
            </div>
          )}
        </Step>

        {datedPerRoom && (
          <Step n={step()} label={kind === "assignment" ? "เลือกวันกำหนดส่ง" : "เลือกวันสอบ"} hint={kind === "assignment" ? "ส่งได้ถึง 23:59 น. ของวันที่เลือก" : undefined}>
            {checkedIds.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm text-muted">
                เลือกห้องในขั้นก่อนหน้า แล้วกำหนดวันของแต่ละห้องที่นี่
              </p>
            ) : (
              <div className="space-y-3">
                {checkedIds.length > 1 && (
                  <div className="rounded-2xl border-2 border-dashed border-brand/30 bg-brand-soft/40 p-3.5">
                    <p className="mb-2 flex flex-wrap items-center gap-x-2 text-sm font-bold text-ink">
                      <CopyCheck aria-hidden className="h-4 w-4 text-brand" />
                      ใช้วันเดียวกันทุกห้อง
                      <span className="text-xs font-normal text-muted">(ไม่บังคับ · เลือกครั้งเดียว ใช้กับ {checkedIds.length} ห้องที่เลือก)</span>
                    </p>
                    <DatePicker label={`${copy.dateLabel}ทุกห้อง`} value={allSameDate} onChange={setAllDates} placeholder="เลือกวันเดียวให้ทุกห้อง" />
                  </div>
                )}
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {checkedIds.map((id) => {
                    const r = roomOptions.find((x) => x.id === id)!;
                    return (
                      <li key={id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                        <span className="w-20 shrink-0 text-sm font-bold text-ink">{r.label}</span>
                        <DatePicker
                          size="sm"
                          label={`${copy.dateLabel} ${r.label}`}
                          value={rooms[id]}
                          onChange={(v) => setRoomDate(id, v)}
                          className="min-w-0 flex-1 basis-48"
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Step>
        )}

        {kind === "material" && (
          <Step n={step()} label="ใส่ลำดับเนื้อหา" optional htmlFor={`${uid}-order`}>
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
          </Step>
        )}

        {kind !== "event" && (
          <Step n={step()} label="แนบไฟล์หรือลิงก์" optional={kind !== "material"}>
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
                <span className="min-w-0 flex-1 truncate">{editing.current.name}</span>
                <ExpiryChip expiresAt={editing.current.expiresAt} expired={editing.current.expired} />
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
                  onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
                />
                {original ? (
                  <div className="rounded-xl border border-line bg-surface px-3.5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                        <FileText aria-hidden className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-ink">{original.name}</span>
                        <span className="text-xs text-muted">{sizeLabel(chosen?.size ?? original.size)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          void pickFile(null);
                          if (fileInput.current) fileInput.current.value = "";
                        }}
                        className="rounded-lg p-2 text-muted transition-colors hover:bg-sunken hover:text-brand"
                        aria-label="เอาไฟล์ออก"
                      >
                        <X aria-hidden className="h-4 w-4" />
                      </button>
                    </div>
                    <CompressStatus
                      progress={progress}
                      original={original}
                      file={file}
                      useOriginal={useOriginal}
                      onUseOriginal={setUseOriginal}
                    />
                  </div>
                ) : (
                  <label
                    htmlFor="post-file"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      void pickFile(e.dataTransfer.files?.[0] ?? null);
                    }}
                    className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-line-strong bg-surface px-4 py-6 text-center transition-colors hover:border-brand/40 hover:bg-brand-soft/40"
                  >
                    <Upload aria-hidden className="h-5 w-5 text-brand" />
                    <span className="text-sm font-bold text-ink">เลือกไฟล์ PDF หรือลากมาวางที่นี่</span>
                    <span className="text-xs text-muted">
                      ไม่เกิน 50 MB · ระบบย่อขนาดให้อัตโนมัติ · ไฟล์อื่น ๆ ให้แชร์เป็นลิงก์
                    </span>
                    <span className="text-xs text-muted">
                      นักเรียนดาวน์โหลดได้ {FILE_LIFETIME_DAYS} วัน แล้วระบบจะลบไฟล์อัตโนมัติ
                    </span>
                  </label>
                )}
                {fileError && (
                  <div className="mt-2">
                    <Notice tone="error">{fileError}</Notice>
                  </div>
                )}
              </div>
            )}
          </Step>
        )}

        <Step n={step()} label={editing ? "ตรวจแล้วกดบันทึก" : `ตรวจแล้วกด “${copy.submit}”`} last>
          <p className="text-sm text-muted">ตรวจชื่อเรื่อง ห้อง และวันอีกครั้ง แล้วกดปุ่มสีแดงด้านล่าง</p>
        </Step>
      </ol>

      {state.error && <Notice tone="error">{state.error}</Notice>}

      <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-end">
        {editing && (
          <Button type="button" variant="ghost" onClick={() => router.push("/teacher?tab=mine")}>
            ยกเลิก
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          className="sm:min-w-44"
          disabled={pending || noSubjects || (mode === "file" && (Boolean(fileError) || Boolean(progress)))}
        >
          {mode === "file" && progress
            ? "กำลังย่อขนาดไฟล์…"
            : pending
              ? mode === "file" && chosen
                ? "กำลังอัปโหลด…"
                : "กำลังบันทึก…"
              : editing
                ? "บันทึกการแก้ไข"
                : copy.submit}
        </Button>
      </div>
    </form>
  );
}

/** One numbered step of the form, joined to the next by a thin line. */
function Step({
  n,
  label,
  htmlFor,
  optional,
  hint,
  last,
  children,
}: {
  n: number;
  label: string;
  htmlFor?: string;
  optional?: boolean;
  hint?: string;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="relative pb-7 pl-12 last:pb-0">
      {!last && <span aria-hidden className="absolute bottom-0 left-[17px] top-10 w-0.5 rounded-full bg-line" />}
      <span
        aria-hidden
        className={cx(
          "absolute left-0 top-0 grid h-9 w-9 place-items-center rounded-full font-display text-sm font-extrabold",
          optional ? "border-2 border-dashed border-brand/40 bg-surface text-brand" : "bg-brand-gradient text-white shadow-brand-glow",
        )}
      >
        {n}
      </span>
      <div className="mb-2 min-h-9 pt-1.5">
        <Label htmlFor={htmlFor} className="block font-display text-base font-bold text-ink">
          <span className="sr-only">ขั้นที่ {n}: </span>
          {label}
          {optional && <span className="ml-2 rounded-md bg-sunken px-1.5 py-0.5 align-middle text-xs font-bold text-muted">ไม่บังคับ</span>}
        </Label>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </li>
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

/** A large shortcut button ("เลือกทั้ง 8 ห้อง"), clearly marked as optional. */
function BigOptionButton({
  on,
  onClick,
  Icon,
  title,
  note,
}: {
  on: boolean;
  onClick: () => void;
  Icon: LucideIcon;
  title: string;
  note: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cx(
        "flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-all duration-150 active:scale-[0.99]",
        on
          ? "border-brand bg-brand text-white shadow-brand-glow"
          : "border-dashed border-brand/40 bg-brand-soft/40 text-ink hover:border-brand hover:bg-brand-soft",
      )}
    >
      <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl", on ? "bg-white text-brand" : "bg-brand-gradient text-white")}>
        <Icon aria-hidden className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-base font-bold">{title}</span>
        <span className={cx("block text-xs", on ? "text-white/85" : "text-muted")}>{note}</span>
      </span>
    </button>
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
        "inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border px-3.5 text-sm font-bold transition-all duration-150 active:scale-[0.97]",
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

/** Under the picked file: a progress bar while compressing, then how much was saved and the "use original" choice. */
function CompressStatus({
  progress,
  original,
  file,
  useOriginal,
  onUseOriginal,
}: {
  progress: CompressProgress | "start" | null;
  original: File;
  file: File | null;
  useOriginal: boolean;
  onUseOriginal: (v: boolean) => void;
}) {
  if (progress) {
    const p = progress === "start" ? null : progress;
    const pct = p && p.pages ? Math.round((p.page / p.pages) * 100) : 0;
    return (
      <div className="mt-3" aria-live="polite">
        <p className="text-sm font-bold text-ink">
          {!p ? "กำลังเปิดไฟล์…" : p.pass === 1 ? `กำลังย่อขนาดไฟล์… หน้า ${p.page} จาก ${p.pages}` : `ไฟล์ยังใหญ่ ย่อเพิ่มอีกรอบ… หน้า ${p.page} จาก ${p.pages}`}
        </p>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken">
          <div className="bg-brand-gradient h-full rounded-full transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }
  if (!file) return null;

  const compressed = file !== original;
  const originalFits = original.size <= MAX_FILE_BYTES;
  return (
    <div className="mt-3 space-y-1.5 text-sm" aria-live="polite">
      {compressed && !useOriginal && (
        <p className="flex items-start gap-2 rounded-lg bg-success-soft px-3 py-2 font-bold text-success">
          <CheckCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          ย่อแล้ว จาก {sizeLabel(original.size)} เหลือ {sizeLabel(file.size)}
        </p>
      )}
      {compressed && useOriginal && (
        <p className="rounded-lg bg-sunken px-3 py-2 text-muted">ใช้ไฟล์ต้นฉบับ {sizeLabel(original.size)} (ไม่ย่อ ข้อความในไฟล์เลือกและค้นหาได้)</p>
      )}
      {!compressed && <p className="text-muted">ไฟล์เล็กพอแล้ว ไม่ต้องย่อ</p>}
      {compressed && originalFits && (
        <button
          type="button"
          onClick={() => onUseOriginal(!useOriginal)}
          className="text-sm font-bold text-brand underline underline-offset-2 hover:no-underline"
        >
          {useOriginal ? `ใช้ไฟล์ที่ย่อแล้ว (${sizeLabel(file.size)})` : "ใช้ไฟล์ต้นฉบับ (ไม่ย่อ)"}
        </button>
      )}
    </div>
  );
}
