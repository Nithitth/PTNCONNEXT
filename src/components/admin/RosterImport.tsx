"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { readSheet } from "read-excel-file/browser";
import writeXlsxFile from "write-excel-file/browser";
import { importStudents, importTeachers, type ImportRowResult } from "@/app/admin/actions";
import { Button, Notice } from "@/components/ui";
import {
  formatClassroom,
  mapSheet,
  serializeCell,
  STUDENT_COLUMNS,
  TEACHER_COLUMNS,
  validateStudentRow,
  validateTeacherRow,
  type Cell,
} from "@/lib/roster";

type Kind = "student" | "teacher";

type PreviewRow = { rowNumber: number; loginId: string; summary: string; errors: string[]; cells: Record<string, Cell> };

const TEMPLATES: Record<Kind, { file: string; rows: string[][] }> = {
  student: {
    file: "แม่แบบ-รายชื่อนักเรียน.xlsx",
    rows: [
      STUDENT_COLUMNS.map((c) => c.header),
      ["12345", "ด.ญ.", "มีนา", "ใจดี", "ม.5", "2", "05/05/2552"],
    ],
  },
  teacher: {
    file: "แม่แบบ-รายชื่อครู.xlsx",
    rows: [
      TEACHER_COLUMNS.map((c) => c.header),
      ["somsri.k", "ครูสมศรี มีสุข", "12/03/2523", "ค32101", "คณิตศาสตร์", "ม.5/1, ม.5/2"],
      ["somsri.k", "ครูสมศรี มีสุข", "12/03/2523", "ค32201", "คณิตศาสตร์เพิ่มเติม", "ม.5/1"],
    ],
  },
};

const CHUNK = 25;

function previewStudents(data: Cell[][]) {
  const { rows, missingColumns } = mapSheet(data, STUDENT_COLUMNS);
  const out: PreviewRow[] = rows.map((r) => {
    const v = validateStudentRow(r);
    return v.ok
      ? { rowNumber: r.rowNumber, loginId: v.value.loginId, summary: `${v.value.displayName} · ${formatClassroom(v.value.classroom)}`, errors: [], cells: r.cells }
      : { rowNumber: r.rowNumber, loginId: String(r.cells.loginId ?? ""), summary: "", errors: v.errors, cells: r.cells };
  });
  return { out, missingColumns };
}

function previewTeachers(data: Cell[][]) {
  const { rows, missingColumns } = mapSheet(data, TEACHER_COLUMNS);
  const out: PreviewRow[] = rows.map((r) => {
    const v = validateTeacherRow(r);
    if (!v.ok) return { rowNumber: r.rowNumber, loginId: String(r.cells.loginId ?? ""), summary: "", errors: v.errors, cells: r.cells };
    const t = v.value;
    const summary = [t.displayName, t.subject && `${t.subject.code} ${t.subject.name}`, t.classrooms.map(formatClassroom).join(", ")]
      .filter(Boolean)
      .join(" · ");
    return { rowNumber: r.rowNumber, loginId: t.loginId, summary, errors: [], cells: r.cells };
  });
  return { out, missingColumns };
}

export function RosterImport() {
  const [kind, setKind] = useState<Kind>("student");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [fileError, setFileError] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<ImportRowResult[] | null>(null);
  const [importError, setImportError] = useState("");

  const reset = () => {
    setPreview(null);
    setFileError("");
    setResults(null);
    setImportError("");
    setProgress(null);
    setFileName("");
  };

  async function onFile(file: File | undefined) {
    reset();
    if (!file) return;
    setFileName(file.name);
    if (!/\.xlsx$/i.test(file.name)) {
      setFileError("ใช้ไฟล์ Excel นามสกุล .xlsx เท่านั้น (ถ้าเป็น .xls ให้เปิดใน Excel แล้ว Save As เป็น .xlsx)");
      return;
    }
    try {
      const data = (await readSheet(file)) as unknown as Cell[][];
      const { out, missingColumns } = kind === "student" ? previewStudents(data) : previewTeachers(data);
      if (missingColumns.length) {
        setFileError(`ไม่พบคอลัมน์: ${missingColumns.join(", ")} — ใช้แม่แบบด้านบนเพื่อให้หัวคอลัมน์ตรงกัน`);
        return;
      }
      if (out.length === 0) {
        setFileError("ไม่พบข้อมูลในไฟล์");
        return;
      }

      // Students: the same ID twice in one file is a mistake. (Teachers repeat once per subject.)
      if (kind === "student") {
        const count = new Map<string, number>();
        out.forEach((r) => r.loginId && count.set(r.loginId, (count.get(r.loginId) ?? 0) + 1));
        out.forEach((r) => {
          if ((count.get(r.loginId) ?? 0) > 1) r.errors.push("เลขประจำตัวซ้ำในไฟล์");
        });
      }
      setPreview(out);
    } catch {
      setFileError("อ่านไฟล์ไม่ได้ ตรวจว่าเป็นไฟล์ Excel (.xlsx) ที่ไม่ได้ตั้งรหัสผ่านไว้");
    }
  }

  async function runImport() {
    if (!preview) return;
    const valid = preview.filter((r) => r.errors.length === 0);
    // Keep all rows of one teacher in the same batch.
    const groups: PreviewRow[][] = [];
    if (kind === "teacher") {
      const byId = new Map<string, PreviewRow[]>();
      valid.forEach((r) => byId.set(r.loginId, [...(byId.get(r.loginId) ?? []), r]));
      let current: PreviewRow[] = [];
      for (const g of byId.values()) {
        if (current.length + g.length > CHUNK && current.length) {
          groups.push(current);
          current = [];
        }
        current.push(...g);
      }
      if (current.length) groups.push(current);
    } else {
      for (let i = 0; i < valid.length; i += CHUNK) groups.push(valid.slice(i, i + CHUNK));
    }

    setImportError("");
    setResults([]);
    setProgress({ done: 0, total: valid.length });
    const all: ImportRowResult[] = [];
    try {
      for (const group of groups) {
        const payload = group.map((r) => ({
          rowNumber: r.rowNumber,
          cells: Object.fromEntries(Object.entries(r.cells).map(([k, v]) => [k, serializeCell(v)])),
        }));
        const res = kind === "student" ? await importStudents(payload) : await importTeachers(payload);
        all.push(...res);
        setResults([...all]);
        setProgress({ done: all.length, total: valid.length });
      }
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ");
    }
  }

  const validCount = preview?.filter((r) => r.errors.length === 0).length ?? 0;
  const errorRows = preview?.filter((r) => r.errors.length > 0) ?? [];
  const importing = progress !== null && progress.done < progress.total && !importError;
  const created = results?.filter((r) => r.status === "created").length ?? 0;
  const updated = results?.filter((r) => r.status === "updated").length ?? 0;
  const failed = results?.filter((r) => r.status === "error") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-line bg-sunken p-1" role="tablist">
          {(["student", "teacher"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              onClick={() => {
                setKind(k);
                reset();
              }}
              className={`rounded-lg border px-4 py-2 text-sm font-bold transition-all duration-150 ${kind === k ? "border-brand bg-brand text-white shadow-soft-sm" : "border-transparent text-muted hover:text-brand"}`}
            >
              {k === "student" ? "รายชื่อนักเรียน" : "รายชื่อครู"}
            </button>
          ))}
        </div>
        <Button
          type="button"
          onClick={() => writeXlsxFile(TEMPLATES[kind].rows, { sheet: "รายชื่อ" }).toFile(TEMPLATES[kind].file)}
        >
          ดาวน์โหลดแม่แบบ
        </Button>
      </div>

      <ColumnGuide kind={kind} />

      <label className="flex cursor-pointer flex-col items-center rounded-2xl border border-dashed border-line-strong bg-page px-6 py-10 text-center transition-colors hover:border-brand/50 hover:bg-brand-soft/40 has-[:focus-visible]:border-brand">
        <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">
          <FileSpreadsheet aria-hidden className="h-6 w-6" />
        </span>
        <span className="block text-sm font-semibold text-ink">{fileName || "เลือกไฟล์ Excel (.xlsx)"}</span>
        <span className="mt-1 block text-xs text-muted">ระบบจะตรวจข้อมูลทุกแถวก่อน ยังไม่บันทึกจนกว่าจะกดนำเข้า</span>
        <input
          key={kind + (preview ? "1" : "0")}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </label>

      {fileError && <Notice tone="error">{fileError}</Notice>}

      {preview && !results && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Notice tone={errorRows.length ? "warning" : "success"}>
              พร้อมนำเข้า {validCount} แถว{errorRows.length > 0 && ` · มีปัญหา ${errorRows.length} แถว (จะถูกข้าม)`}
            </Notice>
            <Button variant="primary" onClick={runImport} disabled={validCount === 0}>
              นำเข้า {validCount} แถว
            </Button>
          </div>
          <PreviewTable rows={preview} />
        </div>
      )}

      {results && (
        <div className="space-y-3">
          {progress && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-muted">
                <span>{importing ? "กำลังนำเข้า…" : "นำเข้าเสร็จแล้ว"}</span>
                <span>
                  {progress.done}/{progress.total}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-page">
                <div
                  className="h-full bg-brand transition-all"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
          {importError && <Notice tone="error">{importError}</Notice>}
          <Notice tone={failed.length ? "warning" : "success"}>
            สร้างบัญชีใหม่ {created} · อัปเดต {updated} · ไม่สำเร็จ {failed.length}
          </Notice>
          {failed.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-line bg-surface p-4 text-sm">
              {failed.map((f) => (
                <li key={f.rowNumber} className="text-danger">
                  แถว {f.rowNumber} {f.loginId && `(${f.loginId})`}: {f.message}
                </li>
              ))}
            </ul>
          )}
          {!importing && (
            <Button onClick={reset}>นำเข้าไฟล์อื่น</Button>
          )}
        </div>
      )}
    </div>
  );
}

function ColumnGuide({ kind }: { kind: Kind }) {
  const cols = kind === "student" ? STUDENT_COLUMNS : TEACHER_COLUMNS;
  return (
    <div className="rounded-xl border border-line bg-surface p-4 text-sm">
      <p className="font-medium text-ink">หัวคอลัมน์ที่ต้องมี (แถวแรกของไฟล์)</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {cols.map((c) => (
          <span key={c.key} className={`rounded-md px-2 py-1 text-xs ${c.required ? "bg-brand-soft text-brand-ink" : "bg-page text-muted"}`}>
            {c.header}
            {!c.required && " (ไม่บังคับ)"}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        {kind === "student"
          ? "วันเกิดใช้เป็นรหัสผ่านครั้งแรก (วว ดด ปปปป ค.ศ.) ระบบแปลงปี พ.ศ. ให้อัตโนมัติ และไม่เก็บวันเกิดไว้หลังสร้างบัญชี นักเรียนที่มีบัญชีอยู่แล้วจะถูกอัปเดตชื่อและห้อง รหัสผ่านเดิมไม่เปลี่ยน"
          : "ครูหนึ่งคนสอนหลายวิชาได้ ใส่หนึ่งแถวต่อหนึ่งวิชา ห้องที่สอนคั่นด้วยจุลภาค เช่น ม.5/1, ม.5/2"}
      </p>
    </div>
  );
}

function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  const shown = rows.slice(0, 300);
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-page text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">แถว</th>
            <th className="px-3 py-2 font-medium">รหัส</th>
            <th className="px-3 py-2 font-medium">ข้อมูล</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.rowNumber} className="border-t border-line">
              <td className="px-3 py-2 text-muted">{r.rowNumber}</td>
              <td className="px-3 py-2 font-mono text-xs">{r.loginId || "-"}</td>
              <td className="px-3 py-2">
                {r.errors.length ? <span className="text-danger">{r.errors.join(" · ")}</span> : <span className="text-ink">{r.summary}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && (
        <p className="border-t border-line px-3 py-2 text-xs text-muted">แสดง {shown.length} จาก {rows.length} แถว</p>
      )}
    </div>
  );
}
