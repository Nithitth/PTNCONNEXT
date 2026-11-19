import type { Metadata } from "next";
import { AlertTriangle, Archive, CheckCircle2, FolderTree, HardDrive, Link2, RefreshCw, School, Users } from "lucide-react";
import { AdminBack } from "@/components/admin/AdminBack";
import { SchoolDriveActions, SharedDrivePicker } from "@/components/admin/SchoolDriveControls";
import { Container, Notice, PageHeader, bigButtonStyles, cx } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatDateTime } from "@/lib/calendar";
import { DriveError, listSharedDrives, schoolDriveStatus, type SharedDriveChoice } from "@/lib/drive";
import { EXPIRED_FOLDER_NAME, schoolDriveConnectHref, termFolderName } from "@/lib/driveCore";
import { FILE_LIFETIME_DAYS } from "@/lib/postForm";

export const metadata: Metadata = { title: "Drive ของโรงเรียน · คอนโซลผู้พัฒนา" };

/** What came back from Google's sign-in (?status=). */
const RESULT: Record<string, { tone: "success" | "info" | "warning" | "error"; text: string }> = {
  ok: { tone: "success", text: "ลงชื่อเข้าใช้สำเร็จ เลือก Shared Drive ที่จะใช้ด้านล่าง" },
  cancelled: { tone: "info", text: "ยังไม่ได้เชื่อมต่อ (กดยกเลิกที่หน้าของ Google)" },
  noscope: { tone: "warning", text: "ต้องอนุญาตสิทธิ์เรื่อง Google Drive ด้วย กดเชื่อมต่ออีกครั้งแล้วติ๊กให้ครบ" },
  expired: { tone: "warning", text: "หมดเวลา กดเชื่อมต่ออีกครั้ง" },
  failed: { tone: "error", text: "เชื่อมต่อไม่สำเร็จ ลองอีกครั้ง" },
  off: { tone: "warning", text: "ยังไม่ได้ตั้งค่ากุญแจ Google ของระบบ (ดู docs/SETUP.md ข้อ 3c)" },
};

function HowItWorks() {
  const rows = [
    { Icon: Users, text: "ครูไม่ต้องเชื่อมต่ออะไร เลือกไฟล์ PDF ตามปกติ ไฟล์จะไปอยู่ใน Shared Drive ของโรงเรียนเอง" },
    { Icon: FolderTree, text: `จัดเป็นโฟลเดอร์ ภาคเรียน / วิชา เช่น ${termFolderName(new Date())} / คณิตศาสตร์ / ม.5-1 · ใบงานบทที่ 3.pdf` },
    { Icon: Link2, text: "แชร์แบบ “ทุกคนที่มีลิงก์ดูได้” นักเรียนเปิดได้โดยไม่ต้องมีบัญชี Google" },
    {
      Icon: Archive,
      text: `ครบ ${FILE_LIFETIME_DAYS} วัน ระบบปิดลิงก์และย้ายไฟล์ไปโฟลเดอร์ “${EXPIRED_FOLDER_NAME}” เก็บไว้เป็นคลังของโรงเรียน ลบโพสต์แล้วไฟล์ไปถังขยะ (กู้คืนได้ 30 วัน)`,
    },
    { Icon: HardDrive, text: "ถ้า Google ขัดข้องหรือการเชื่อมต่อหลุด PDF ใหม่จะเก็บในระบบ Connext แทน ลิงก์เดิมยังเปิดได้" },
  ];
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {rows.map(({ Icon, text }) => (
        <li key={text} className="flex gap-3 rounded-xl bg-sunken/60 p-3 text-sm leading-relaxed text-ink">
          <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          {text}
        </li>
      ))}
    </ul>
  );
}

/** Drive ของโรงเรียน: connect the school's Shared Drive once; every teacher's PDF then goes there. */
export default async function SchoolDrivePage({ searchParams }: PageProps<"/admin/drive">) {
  await requireProfile({ roles: ["admin"] });
  const { status } = await searchParams;
  const result = typeof status === "string" ? RESULT[status] : undefined;
  const s = await schoolDriveStatus();

  let drives: SharedDriveChoice[] | null = null;
  let listError: string | null = null;
  if (s.state === "pick") {
    try {
      drives = await listSharedDrives();
    } catch (e) {
      listError = e instanceof DriveError && e.reason === "school-broken" ? "การเชื่อมต่อหลุด กดเชื่อมต่อใหม่" : "ดึงรายชื่อ Shared Drive ไม่สำเร็จ ลองรีเฟรชหน้านี้";
    }
  }
  const connect = (label: string) => (
    <a href={schoolDriveConnectHref()} className={bigButtonStyles.primary}>
      <School aria-hidden className="h-6 w-6" />
      {label}
    </a>
  );

  return (
    <Container className="py-10">
      <AdminBack />
      <PageHeader eyebrow="ผู้ดูแลระบบ" title="Drive ของโรงเรียน" subtitle="เก็บ PDF ของครูทุกคนใน Shared Drive ของโรงเรียน เชื่อมต่อครั้งเดียว" />
      {result && (
        <div className="mb-5">
          <Notice tone={result.tone}>{result.text}</Notice>
        </div>
      )}

      <section
        className={cx(
          "mb-6 rounded-3xl border p-5 shadow-soft-sm sm:p-7",
          s.state === "on" ? "border-success/30 bg-success-soft" : s.state === "broken" ? "border-danger/30 bg-danger-soft" : "border-line bg-surface",
        )}
      >
        {!s.configured && (
          <Notice tone="warning">ยังไม่ได้ตั้งค่ากุญแจ Google ของระบบ (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_TOKEN_SECRET) ดู docs/SETUP.md ข้อ 3c</Notice>
        )}

        {s.configured && s.state === "off" && (
          <div className="space-y-4">
            <h2 className="font-display text-2xl font-extrabold text-ink">ยังไม่ได้เชื่อมต่อ</h2>
            <p className="text-ink">
              ลงชื่อเข้าใช้ด้วยบัญชี Google ของโรงเรียน (@…ac.th) ที่เป็นผู้จัดการ (Manager) ของ Shared Drive แล้วเลือก Shared Drive ที่จะใช้ ตอนนี้ PDF ของครูเก็บในระบบ Connext หรือใน
              Drive ของครูแต่ละคน
            </p>
            {connect("เชื่อมต่อ Drive ของโรงเรียน")}
          </div>
        )}

        {s.state === "pick" && (
          <div className="space-y-4">
            <h2 className="font-display text-2xl font-extrabold text-ink">เลือก Shared Drive ที่จะใช้</h2>
            <p className="text-sm text-muted">ลงชื่อเข้าใช้โดย {s.connectedByName}. เลือก Shared Drive ที่บัญชีนี้เป็นผู้จัดการ (Manager)</p>
            {listError && <Notice tone="error">{listError}</Notice>}
            {drives && drives.length === 0 && <Notice tone="warning">บัญชีนี้ยังไม่มี Shared Drive สร้างใน Google Drive: “ไดรฟ์ที่แชร์” → “ใหม่” แล้วกลับมารีเฟรชหน้านี้</Notice>}
            {drives && drives.length > 0 && <SharedDrivePicker drives={drives} />}
            <div className="pt-1">{connect("ลงชื่อเข้าใช้ด้วยบัญชีอื่น")}</div>
          </div>
        )}

        {s.state === "on" && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 font-display text-2xl font-extrabold text-success">
              <CheckCircle2 aria-hidden className="h-7 w-7" />
              เชื่อมต่อแล้ว: “{s.driveName}”
            </h2>
            <p className="text-sm text-ink">
              โดย {s.connectedByName}
              {s.connectedAt && ` · ตั้งแต่ ${formatDateTime(s.connectedAt)}`}
              {s.lastOkAt && ` · ตรวจล่าสุด ${formatDateTime(s.lastOkAt)}`}
            </p>
            <SchoolDriveActions />
          </div>
        )}

        {s.state === "broken" && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 font-display text-2xl font-extrabold text-danger">
              <AlertTriangle aria-hidden className="h-7 w-7" />
              การเชื่อมต่อหลุด
            </h2>
            <p className="text-ink">
              Google ไม่ยอมรับกุญแจของ {s.connectedByName} แล้ว (บัญชีถูกปิด หรือยกเลิกสิทธิ์) ลิงก์ PDF เดิมยังเปิดได้ตามปกติ แต่ PDF ใหม่จะเก็บในระบบ Connext จนกว่าจะเชื่อมต่อใหม่
              ผู้จัดการคนใดก็ได้ของ Shared Drive “{s.driveName}” กดเชื่อมต่อใหม่ได้
            </p>
            <div className="flex flex-wrap gap-2">
              {connect("เชื่อมต่อใหม่")}
              <SchoolDriveActions />
            </div>
          </div>
        )}
      </section>

      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-ink">
        <RefreshCw aria-hidden className="h-4 w-4 text-brand" />
        ทำงานอย่างไร
      </h2>
      <HowItWorks />
      <p className="mt-4 text-xs leading-relaxed text-faint">
        แนะนำ: ให้ฝ่าย IT สร้างบัญชีเฉพาะของระบบ (เช่น connext@…ac.th) เป็นผู้จัดการของ Shared Drive แล้วเชื่อมต่อด้วยบัญชีนั้น เพื่อไม่ให้ระบบผูกกับบัญชีของคนใดคนหนึ่ง ไฟล์ทั้งหมดเป็นของ
        Shared Drive ไม่ใช่ของผู้เชื่อมต่อ
      </p>
    </Container>
  );
}
