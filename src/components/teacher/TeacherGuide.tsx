"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock,
  CopyCheck,
  Download,
  FileText,
  GraduationCap,
  Home,
  KeyRound,
  Link2,
  ListChecks,
  LogOut,
  Map as MapIcon,
  MousePointerClick,
  PartyPopper,
  Paperclip,
  Pencil,
  Presentation,
  Send,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { KIND_STYLE } from "@/components/teacher/kindStyle";
import { cx } from "@/components/ui";

// A step-by-step "how to use" guide for teachers, in a pop-up.
// - Teachers: it opens by itself once per visit (sessionStorage), until they tick "ไม่ต้องแสดงอีก" (localStorage, this device only).
// - Everyone with the guide (teachers + admins) can open it again with <GuideButton>.
// To add a step: add an entry to STEPS. `buttons` explains each button on that screen, drawn like the real one.

const OFF_KEY = "ptn-teacher-guide-off";
const SEEN_KEY = "ptn-teacher-guide-seen";
const OPEN_EVENT = "ptn:open-guide";
/** Fired when the guide closes, so other pop-ups (ExpiringFilesWindow) can wait their turn. */
export const GUIDE_CLOSED_EVENT = "ptn:guide-closed";

/** Glowing, blinking look shared by the "วิธีใช้งาน" buttons (same as the highlighted tiles inside the guide). */
const GLOW = "bg-feature-gradient border-transparent text-white shadow-brand-glow-lg motion-safe:animate-pulse";

/** Opens the guide from anywhere on the page. */
export function openTeacherGuide() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function storage(kind: "local" | "session") {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}
function read(kind: "local" | "session", key: string) {
  try {
    return storage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function write(kind: "local" | "session", key: string, value: string | null) {
  try {
    const s = storage(kind);
    if (value === null) s?.removeItem(key);
    else s?.setItem(key, value);
  } catch {}
}

type Picture =
  | { type: "icon"; Icon: typeof Home }
  | { type: "nav"; on: "calendar" | "teacher" | null }
  | { type: "home" }
  | { type: "tiles"; on: "assign" | "material" | "exam" | "mine" | null }
  | { type: "calendar" }
  | { type: "account" };

/** How a button is drawn in the guide, to match the real one. */
type Look = "red" | "plain" | "danger" | "tile" | "icon" | "room" | "field" | "check" | "glow";
type GuideButtonInfo = { look: Look; label?: string; Icon?: typeof Home; does: string };

type Step = {
  title: string;
  lines: string[];
  picture: Picture;
  buttons?: GuideButtonInfo[];
  go?: { href: string; label: string };
};

const STEPS: Step[] = [
  {
    title: "ยินดีต้อนรับสู่ PTN Connext",
    lines: [
      "ที่นี่ครูสั่งงาน แชร์เอกสาร และประกาศวันสอบได้ในที่เดียว",
      "นักเรียนจะเห็นทุกอย่างในปฏิทินของห้องทันที",
      "คู่มือนี้จะพาดูทีละหน้า ว่าแต่ละปุ่มทำอะไร",
    ],
    picture: { type: "icon", Icon: PartyPopper },
    buttons: [
      { look: "red", label: "ถัดไป", Icon: ArrowRight, does: "ไปขั้นต่อไปของคู่มือ" },
      { look: "plain", label: "ย้อนกลับ", Icon: ArrowLeft, does: "กลับไปดูขั้นก่อนหน้า" },
      { look: "icon", Icon: X, does: "ปิดคู่มือ (เปิดใหม่ได้ทุกเมื่อ)" },
      { look: "check", label: "ไม่ต้องแสดงคู่มือนี้อีก", does: "ติ๊กถ้าไม่อยากให้คู่มือเด้งขึ้นมาเองอีก" },
    ],
  },
  {
    title: "เมนูด้านบนของจอ",
    lines: [
      "แถบเมนูด้านบนพาไปได้ทุกหน้า กดชื่อหน้าที่อยากไป",
      "หน้าที่เปิดอยู่จะเป็นสีแดง",
      "ในมือถือ ถ้าเห็นเมนูไม่ครบ ให้ใช้นิ้วเลื่อนแถบเมนูไปทางซ้าย",
    ],
    picture: { type: "nav", on: "teacher" },
    buttons: [
      { look: "plain", label: "หน้าแรก", Icon: Home, does: "กลับหน้าแรก" },
      { look: "plain", label: "ปฏิทิน", Icon: CalendarDays, does: "ดูงาน วันสอบ และเอกสารของทุกห้อง" },
      { look: "plain", label: "TCAS", Icon: GraduationCap, does: "ข้อมูลเข้ามหาวิทยาลัย (สำหรับแนะแนวนักเรียน)" },
      { look: "plain", label: "Roadmap", Icon: MapIcon, does: "การ์ดเป้าหมายแบบเกมของนักเรียน" },
      { look: "plain", label: "คอนโซลครู", Icon: Presentation, does: "ที่สั่งงาน แชร์เอกสาร และประกาศวันสอบ" },
      { look: "plain", label: "ชื่อของคุณ", Icon: UserRound, does: "มุมขวาบน: ดูบัญชี เปลี่ยนรหัสผ่าน ออกจากระบบ" },
    ],
  },
  {
    title: "หน้าแรก",
    lines: ["หน้าแรกมีปุ่มใหญ่พาไปหน้าที่ใช้บ่อย", "เลื่อนลงไปจะมีกล่องส่งความคิดเห็นถึงทีมพัฒนา"],
    picture: { type: "home" },
    buttons: [
      { look: "tile", label: "คอนโซลครู", Icon: Presentation, does: "ไปสั่งงาน แชร์เอกสาร ประกาศวันสอบ" },
      { look: "plain", label: "ปฏิทิน", Icon: CalendarDays, does: "ไปดูปฏิทินของทุกห้อง" },
      { look: "glow", label: "วิธีใช้งาน", Icon: CircleHelp, does: "เปิดคู่มือนี้อีกครั้ง" },
      { look: "red", label: "ส่งความคิดเห็น", Icon: Send, does: "ส่งปัญหาหรือคำแนะนำให้ทีมพัฒนา (วันละไม่เกิน 3 ครั้ง)" },
    ],
    go: { href: "/", label: "ไปหน้าแรก" },
  },
  {
    title: "คอนโซลครู: เลือกสิ่งที่จะทำ",
    lines: ["ด้านบนของคอนโซลครูมีช่องใหญ่ 4 ช่อง", "กดช่องไหน ด้านล่างจะเปลี่ยนเป็นฟอร์มของเรื่องนั้น"],
    picture: { type: "tiles", on: null },
    buttons: [
      { look: "plain", label: "มอบหมายงาน", Icon: KIND_STYLE.assignment.Icon, does: "สั่งการบ้านหรืองาน พร้อมวันกำหนดส่ง" },
      { look: "plain", label: "แชร์เอกสาร", Icon: KIND_STYLE.material.Icon, does: "ส่งไฟล์ PDF หรือลิงก์ให้นักเรียน" },
      { look: "plain", label: "ประกาศวันสอบ", Icon: KIND_STYLE.exam.Icon, does: "บอกวันสอบ ให้นักเรียนเห็นล่วงหน้า" },
      { look: "plain", label: "งานของฉัน", Icon: ListChecks, does: "ดู แก้ไข หรือลบสิ่งที่โพสต์ไปแล้ว" },
      { look: "plain", label: "วิธีใช้งาน", Icon: CircleHelp, does: "มุมขวาบนของคอนโซล: เปิดคู่มือนี้" },
    ],
    go: { href: "/teacher", label: "ไปคอนโซลครู" },
  },
  {
    title: "มอบหมายงาน (1/3): บอกว่างานอะไร",
    lines: [
      "กดช่อง “มอบหมายงาน” แล้วกรอกทีละขั้นตามหมายเลข 1, 2, 3 …",
      "ขั้นที่มีป้าย “ไม่บังคับ” จะข้ามก็ได้",
    ],
    picture: { type: "tiles", on: "assign" },
    buttons: [
      { look: "field", label: "เลือกวิชา", does: "กดแล้วเลือกวิชาที่คุณสอน" },
      { look: "field", label: "ตั้งชื่อเรื่อง", does: "พิมพ์ชื่องาน เช่น แบบฝึกหัดบทที่ 3" },
      { look: "field", label: "เขียนรายละเอียด", does: "(ไม่บังคับ) เช่น ทำข้อ 1–10 ส่งในสมุด" },
    ],
    go: { href: "/teacher?tab=assign", label: "ไปหน้ามอบหมายงาน" },
  },
  {
    title: "มอบหมายงาน (2/3): เลือกห้องและวันส่ง",
    lines: ["เลือกได้หลายห้องพร้อมกัน แต่ละห้องให้ส่งคนละวันได้", "นักเรียนส่งได้ถึง 23:59 น. ของวันที่เลือก"],
    picture: { type: "tiles", on: "assign" },
    buttons: [
      { look: "room", label: "ม.5/1", does: "แตะเพื่อเลือกห้อง แตะอีกครั้งเพื่อยกเลิก" },
      { look: "plain", label: "เลือกทั้ง 8 ห้อง", Icon: Check, does: "เลือกทุกห้องในครั้งเดียว (ไม่บังคับ)" },
      { look: "field", label: "เลือกวัน", Icon: CalendarDays, does: "กดแล้วจะมีปฏิทินเล็กขึ้นมา แตะวันที่ต้องการ" },
      { look: "plain", label: "วันนี้ / พรุ่งนี้ / อีก 1 สัปดาห์", does: "ปุ่มลัดในปฏิทินเล็ก เลือกวันได้ในแตะเดียว" },
      { look: "plain", label: "ใช้วันเดียวกันทุกห้อง", Icon: CopyCheck, does: "เลือกวันครั้งเดียว ใช้กับทุกห้องที่เลือก" },
    ],
    go: { href: "/teacher?tab=assign", label: "ไปหน้ามอบหมายงาน" },
  },
  {
    title: "มอบหมายงาน (3/3): แนบไฟล์แล้วกดส่ง",
    lines: ["จะแนบไฟล์หรือไม่ก็ได้", "ตรวจชื่อเรื่อง ห้อง และวันอีกครั้ง แล้วกดปุ่มสีแดงด้านล่างสุด"],
    picture: { type: "tiles", on: "assign" },
    buttons: [
      { look: "plain", label: "ไม่แนบ", Icon: X, does: "ไม่มีไฟล์หรือลิงก์" },
      { look: "plain", label: "ไฟล์ PDF", Icon: Paperclip, does: "แนบไฟล์ PDF ไม่เกิน 10 MB" },
      { look: "plain", label: "ลิงก์", Icon: Link2, does: "วางลิงก์ เช่น Google Drive, Slides, Canva" },
      { look: "red", label: "มอบหมายงาน", does: "ส่งงานให้นักเรียน นักเรียนเห็นในปฏิทินทันที" },
    ],
    go: { href: "/teacher?tab=assign", label: "ไปหน้ามอบหมายงาน" },
  },
  {
    title: "แชร์เอกสารหรือสไลด์",
    lines: [
      "กดช่อง “แชร์เอกสาร” แล้วเลือกวิชา ตั้งชื่อ และเลือกห้อง",
      "ไฟล์ PDF ใหญ่ได้ถึง 50 MB ระบบจะย่อขนาดให้เองก่อนอัปโหลด รอจนขึ้นว่า “ย่อแล้ว”",
      "นักเรียนดาวน์โหลดได้ 180 วัน แล้วระบบจะลบไฟล์อัตโนมัติ",
    ],
    picture: { type: "tiles", on: "material" },
    buttons: [
      { look: "field", label: "ใส่ลำดับเนื้อหา", does: "(ไม่บังคับ) เช่น เลขบท ใช้เรียงเอกสารตามลำดับที่สอน" },
      { look: "field", label: "เลือกไฟล์ PDF หรือลากมาวางที่นี่", Icon: Upload, does: "กดเพื่อเลือกไฟล์จากเครื่อง ระบบย่อขนาดให้อัตโนมัติ" },
      { look: "plain", label: "ใช้ไฟล์ต้นฉบับ (ไม่ย่อ)", does: "ใช้เมื่ออยากให้นักเรียนเลือกหรือค้นหาข้อความในไฟล์ได้ (ไฟล์ต้องไม่เกิน 10 MB)" },
      { look: "icon", Icon: X, does: "เอาไฟล์ที่เลือกผิดออก แล้วเลือกใหม่" },
      { look: "red", label: "แชร์เอกสาร", does: "ส่งเอกสารให้นักเรียน" },
    ],
    go: { href: "/teacher?tab=material", label: "ไปหน้าแชร์เอกสาร" },
  },
  {
    title: "ประกาศวันสอบ",
    lines: ["กดช่อง “ประกาศวันสอบ”", "เลือกประเภทการสอบ ห้อง และวันสอบของแต่ละห้อง"],
    picture: { type: "tiles", on: "exam" },
    buttons: [
      { look: "plain", label: "สอบเก็บคะแนน / สอบย่อย", does: "สีเหลือง ปฏิทินนักเรียนไฮไลต์ล่วงหน้า 3 วัน" },
      { look: "plain", label: "สอบกลางภาค / ปลายภาค", does: "สีแดง ปฏิทินนักเรียนไฮไลต์ล่วงหน้า 5 วัน" },
      { look: "plain", label: "ใช้วันเดียวกันทุกห้อง", Icon: CopyCheck, does: "ทุกห้องสอบวันเดียวกัน เลือกครั้งเดียว" },
      { look: "red", label: "ประกาศวันสอบ", does: "ประกาศให้นักเรียนเห็นทันที" },
    ],
    go: { href: "/teacher?tab=exam", label: "ไปหน้าประกาศวันสอบ" },
  },
  {
    title: "แก้ไขหรือลบสิ่งที่โพสต์ไปแล้ว",
    lines: [
      "กดช่อง “งานของฉัน” จะเห็นทุกอย่างที่โพสต์ไว้ รวมถึงของครูท่านอื่นในวิชาเดียวกัน",
      "ลบต้องกด 2 ครั้ง เพื่อกันกดพลาด",
    ],
    picture: { type: "tiles", on: "mine" },
    buttons: [
      { look: "plain", label: "แก้ไข", Icon: Pencil, does: "เปิดฟอร์มเดิมขึ้นมาแก้ เปลี่ยนห้อง วัน หรือไฟล์ได้" },
      { look: "red", label: "บันทึกการแก้ไข", does: "ในหน้าแก้ไข: กดเพื่อบันทึก" },
      { look: "danger", label: "ลบ", Icon: Trash2, does: "กดครั้งแรก ปุ่มจะเปลี่ยนเป็น “ยืนยันลบ”" },
      { look: "danger", label: "ยืนยันลบ", does: "กดอีกครั้งเพื่อลบจริง (ลบแล้วกู้คืนไม่ได้)" },
      { look: "plain", label: "ไม่ลบ", does: "เปลี่ยนใจ ไม่ลบแล้ว" },
      { look: "plain", label: "ดาวน์โหลดได้อีก 12 วัน", Icon: Clock, does: "นับถอยหลังก่อนระบบลบไฟล์ PDF (เป็นสีแดงเมื่อเหลือไม่ถึง 14 วัน)" },
      { look: "red", label: "อัปโหลดไฟล์ใหม่", Icon: Upload, does: "อยู่ในหน้าต่างเตือนไฟล์ใกล้ถูกลบ: อัปโหลดไฟล์เดิมอีกครั้งเพื่อเริ่มนับ 180 วันใหม่" },
    ],
    go: { href: "/teacher?tab=mine", label: "ไปหน้างานของฉัน" },
  },
  {
    title: "ดูปฏิทิน",
    lines: [
      "จุดสีในแต่ละวันคืองานที่ต้องส่ง สีบอกวิชา จุดกะพริบแปลว่าใกล้ครบกำหนด",
      "แถบสีเหลืองหรือแดงคือวันสอบและช่วงก่อนสอบ",
    ],
    picture: { type: "calendar" },
    buttons: [
      { look: "room", label: "12", does: "แตะที่วัน เพื่อดูงาน วันสอบ และไฟล์ของวันนั้น" },
      { look: "icon", Icon: ChevronLeft, does: "ไปเดือนก่อน" },
      { look: "icon", Icon: ChevronRight, does: "ไปเดือนถัดไป" },
      { look: "plain", label: "วันนี้", does: "กลับมาเดือนปัจจุบัน (มีเมื่อดูเดือนอื่นอยู่)" },
      { look: "plain", label: "ดาวน์โหลด", Icon: Download, does: "บันทึกไฟล์ PDF ลงเครื่อง (ได้ภายใน 180 วันหลังอัปโหลด)" },
      { look: "plain", label: "วิชา / ก–ฮ / ลำดับเนื้อหา", does: "เรียงรายการ “เอกสารและสื่อการสอน”" },
    ],
    go: { href: "/calendar", label: "ไปหน้าปฏิทิน" },
  },
  {
    title: "บัญชีและรหัสผ่าน",
    lines: ["กดที่ชื่อของคุณ มุมขวาบนของจอ", "ควรเปลี่ยนรหัสผ่าน เพราะวันเกิดคนอื่นอาจเดาได้"],
    picture: { type: "account" },
    buttons: [
      { look: "plain", label: "เปลี่ยนรหัสผ่าน", Icon: KeyRound, does: "ตั้งรหัสผ่านใหม่แทนวันเกิด" },
      { look: "danger", label: "ออกจากระบบ", Icon: LogOut, does: "ใช้เมื่อใช้เครื่องร่วมกับคนอื่น" },
    ],
    go: { href: "/account", label: "ไปหน้าบัญชีของฉัน" },
  },
  {
    title: "พร้อมใช้งานแล้ว",
    lines: ["ถ้าลืมวิธีใช้ เปิดคู่มือนี้ได้ทุกเมื่อ", "ปุ่มอยู่ที่หน้าแรก และมุมขวาบนของคอนโซลครู"],
    picture: { type: "icon", Icon: Check },
    buttons: [
      { look: "glow", label: "วิธีใช้งาน", Icon: CircleHelp, does: "ปุ่มเรืองแสงนี้ เปิดคู่มืออีกครั้ง" },
      { look: "red", label: "เริ่มใช้งาน", Icon: Check, does: "ปิดคู่มือ แล้วเริ่มใช้งานได้เลย" },
    ],
  },
];

/** The pop-up itself. Rendered once, in the root layout, for teachers and admins. */
export function TeacherGuide({ autoOpen }: { autoOpen: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const path = usePathname();
  const [step, setStep] = useState(0);
  const [off, setOff] = useState(false);

  // Opened with a button: start from the first step.
  useEffect(() => {
    const show = () => {
      setStep(0);
      setOff(read("local", OFF_KEY) === "1");
      if (!ref.current?.open) ref.current?.showModal();
    };
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  // Teachers: once per visit, until they opt out. Not on the PDPA / password pages.
  useEffect(() => {
    if (!autoOpen || path === "/pdpa" || path === "/change-password") return;
    if (read("local", OFF_KEY) === "1" || read("session", SEEN_KEY)) return;
    write("session", SEEN_KEY, "1");
    if (!ref.current?.open) ref.current?.showModal();
  }, [autoOpen, path]);

  const close = () => ref.current?.close();
  const goTo = (n: number) => {
    setStep(n);
    body.current?.scrollTo({ top: 0 });
  };
  const toggleOff = (value: boolean) => {
    setOff(value);
    write("local", OFF_KEY, value ? "1" : null);
  };

  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <dialog
      ref={ref}
      onClose={() => window.dispatchEvent(new Event(GUIDE_CLOSED_EVENT))}
      aria-labelledby="teacher-guide-title"
      className={cx(
        "fixed m-0 max-h-none max-w-none overflow-hidden bg-surface p-0 text-ink shadow-soft-lg outline-none",
        "backdrop:bg-ink/45 backdrop:backdrop-blur-[2px]",
        "inset-x-0 bottom-0 top-auto w-full rounded-t-3xl open:animate-sheet-up",
        "sm:inset-0 sm:m-auto sm:h-fit sm:w-[36rem] sm:rounded-3xl sm:open:animate-pop",
      )}
    >
      <div className="flex max-h-[92dvh] flex-col">
        {/* Header: title of the guide, step counter, close */}
        <div className="bg-feature-gradient speed-lines px-5 pb-4 pt-4 text-white">
          <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-white/50 sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-base font-bold">
              <CircleHelp aria-hidden className="h-5 w-5" />
              วิธีใช้งานสำหรับครู
            </p>
            <button
              type="button"
              aria-label="ปิดคู่มือ"
              onClick={close}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 text-white hover:bg-white/25"
            >
              <X aria-hidden className="h-6 w-6" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div aria-hidden className="flex flex-1 gap-1">
              {STEPS.map((_, i) => (
                <span key={i} className={cx("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-white" : "bg-white/30")} />
              ))}
            </div>
            <p className="shrink-0 text-sm font-bold text-white/90">
              ขั้นที่ {step + 1} จาก {STEPS.length}
            </p>
          </div>
        </div>

        {/* Body: picture, title, numbered lines, then what each button does */}
        <div ref={body} className="flex-1 overflow-y-auto px-5 pb-4 pt-5" aria-live="polite">
          <StepPicture picture={s.picture} />
          <h2 id="teacher-guide-title" className="mt-5 font-display text-2xl font-extrabold leading-snug text-ink">
            {s.title}
          </h2>
          <ol className="mt-3 space-y-2.5">
            {s.lines.map((line, i) => (
              <li key={line} className="flex gap-3 text-lg leading-relaxed text-ink">
                <span
                  aria-hidden
                  className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand"
                >
                  {i + 1}
                </span>
                {line}
              </li>
            ))}
          </ol>

          {s.buttons && (
            <div className="mt-5 rounded-2xl border border-line bg-sunken p-3.5 sm:p-4">
              <p className="mb-3 flex items-center gap-2 text-base font-bold text-ink">
                <MousePointerClick aria-hidden className="h-5 w-5 text-brand" />
                ปุ่มในหน้านี้ กดแล้วเกิดอะไร
              </p>
              <ul className="space-y-3">
                {s.buttons.map((b) => (
                  <li key={`${b.label ?? ""}${b.does}`} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    <span className="shrink-0 sm:w-44">
                      <MockButton {...b} />
                    </span>
                    <span className="text-base leading-snug text-ink">{b.does}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {s.go && (
            <Link
              href={s.go.href}
              onClick={close}
              className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-brand bg-surface text-lg font-bold text-brand transition-colors hover:bg-brand-soft"
            >
              <MousePointerClick aria-hidden className="h-5 w-5" />
              {s.go.label}
            </Link>
          )}
        </div>

        {/* Footer: back / next, and opt-out */}
        <div className="border-t border-line bg-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          <div className="flex gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => goTo(step - 1)}
                className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border border-line-strong bg-surface text-lg font-bold text-ink transition-colors hover:bg-sunken"
              >
                <ArrowLeft aria-hidden className="h-5 w-5" />
                ย้อนกลับ
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? close() : goTo(step + 1))}
              className="flex h-14 flex-[2] items-center justify-center gap-2 rounded-2xl border border-brand bg-brand text-lg font-bold text-white shadow-brand-glow transition-all hover:bg-brand-hot hover:shadow-brand-glow-lg active:scale-[0.98]"
            >
              {last ? "เริ่มใช้งาน" : "ถัดไป"}
              {last ? <Check aria-hidden className="h-5 w-5" /> : <ArrowRight aria-hidden className="h-5 w-5" />}
            </button>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl px-1 py-2 text-base text-muted">
            <input
              type="checkbox"
              checked={off}
              onChange={(e) => toggleOff(e.target.checked)}
              className="h-6 w-6 shrink-0 accent-brand"
            />
            ไม่ต้องแสดงคู่มือนี้อีก (ในเครื่องนี้)
          </label>
        </div>
      </div>
    </dialog>
  );
}

/**
 * The glowing, blinking "วิธีใช้งาน" button that opens the guide (server pages can use it).
 * `onRed` adds a white ring so it stands out on the red hero.
 */
export function GuideButton({ className, onRed }: { className?: string; onRed?: boolean }) {
  return (
    <button
      type="button"
      onClick={openTeacherGuide}
      className={cx(
        "inline-flex h-12 items-center justify-center gap-2 rounded-xl border px-5 text-base font-bold transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]",
        GLOW,
        onRed ? "ring-4 ring-white/60" : "ring-4 ring-brand/35",
        className,
      )}
    >
      <CircleHelp aria-hidden className="h-5 w-5" />
      วิธีใช้งาน
    </button>
  );
}

// ── Pictures: tiny mock-ups of the real screens, with the part to tap glowing ──

const RING = "ring-4 ring-brand/35 motion-safe:animate-pulse";

/** A small drawing of a real button, for the "what each button does" list. */
function MockButton({ look, label, Icon }: GuideButtonInfo) {
  if (look === "check") {
    return (
      <span aria-hidden className="inline-flex items-center gap-2 text-sm font-bold text-muted">
        <span className="h-5 w-5 rounded border-2 border-line-strong bg-surface" />
        {label}
      </span>
    );
  }
  if (look === "icon") {
    return (
      <span aria-hidden className="inline-grid h-10 w-10 place-items-center rounded-xl border border-line-strong bg-surface text-ink">
        {Icon && <Icon className="h-5 w-5" />}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold leading-snug",
        look === "red" && "border-brand bg-brand text-white shadow-brand-glow",
        look === "plain" && "border-line-strong bg-surface text-ink",
        look === "danger" && "border-brand/40 bg-surface text-brand",
        look === "tile" && "bg-feature-gradient border-transparent text-white shadow-brand-glow",
        look === "room" && "border-line-strong bg-surface px-4 text-ink",
        look === "field" && "border-dashed border-line-strong bg-surface font-normal text-muted",
        look === "glow" && cx(GLOW, "ring-4 ring-brand/35"),
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      {label}
    </span>
  );
}

function StepPicture({ picture }: { picture: Picture }) {
  if (picture.type === "icon") {
    const Icon = picture.Icon;
    return (
      <div className="grid place-items-center py-2">
        <span className="bg-brand-gradient grid h-24 w-24 place-items-center rounded-full text-white shadow-brand-glow-lg">
          <Icon aria-hidden className="h-11 w-11" />
        </span>
      </div>
    );
  }

  if (picture.type === "nav") {
    const items = [
      { id: null, label: "หน้าแรก", Icon: Home },
      { id: "calendar", label: "ปฏิทิน", Icon: CalendarDays },
      { id: "teacher", label: "คอนโซลครู", Icon: Presentation },
    ] as const;
    return (
      <Frame>
        <div className="flex flex-wrap gap-2">
          {items.map(({ id, label, Icon }) => (
            <span
              key={label}
              className={cx(
                "flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold",
                id === picture.on ? cx("bg-brand text-white", RING) : "bg-surface text-muted",
              )}
            >
              <Icon aria-hidden className="h-4 w-4" />
              {label}
            </span>
          ))}
        </div>
      </Frame>
    );
  }

  if (picture.type === "home") {
    return (
      <Frame label="หน้าแรก">
        <div className="bg-brand-gradient space-y-2 rounded-xl p-3">
          <span className={cx("flex items-center gap-2 rounded-xl bg-white p-2.5 text-sm font-bold text-brand", RING)}>
            <Presentation aria-hidden className="h-4 w-4" />
            คอนโซลครู
          </span>
          <span className="flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 p-2.5 text-sm font-bold text-white">
            <CalendarDays aria-hidden className="h-4 w-4" />
            ปฏิทิน
          </span>
        </div>
      </Frame>
    );
  }

  if (picture.type === "tiles") {
    const tiles = [
      { id: "assign", label: "มอบหมายงาน", Icon: KIND_STYLE.assignment.Icon },
      { id: "material", label: "แชร์เอกสาร", Icon: KIND_STYLE.material.Icon },
      { id: "exam", label: "ประกาศวันสอบ", Icon: KIND_STYLE.exam.Icon },
      { id: "mine", label: "งานของฉัน", Icon: ListChecks },
    ] as const;
    return (
      <Frame label="คอนโซลครู">
        <div className="grid grid-cols-2 gap-2">
          {tiles.map(({ id, label, Icon }) => (
            <span
              key={id}
              className={cx(
                "flex items-center gap-2 rounded-xl border p-2.5 text-sm font-bold",
                id === picture.on ? cx("bg-feature-gradient border-transparent text-white", RING) : "border-line bg-surface text-muted",
              )}
            >
              <span
                className={cx(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                  id === picture.on ? "bg-white text-brand" : "bg-brand-soft text-brand",
                )}
              >
                <Icon aria-hidden className="h-4 w-4" />
              </span>
              {label}
            </span>
          ))}
        </div>
      </Frame>
    );
  }

  if (picture.type === "calendar") {
    return (
      <Frame label="ปฏิทิน">
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 14 }, (_, i) => (
            <span
              key={i}
              className={cx(
                "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border text-xs font-bold",
                i === 11 ? cx("border-brand bg-brand-soft text-brand", RING) : "border-line bg-surface text-muted",
              )}
            >
              {i + 1}
              {(i === 3 || i === 11 || i === 12) && (
                <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", i === 11 ? "bg-brand" : "bg-exam")} />
              )}
            </span>
          ))}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <FileText aria-hidden className="h-3.5 w-3.5" />
          ด้านข้าง: ใกล้ถึงกำหนด และ เอกสารและสื่อการสอน
        </p>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="flex items-center justify-between gap-3">
        <span className="font-brand text-lg font-bold text-brand">PTN Connext</span>
        <span className={cx("flex items-center gap-2 rounded-xl border border-line bg-surface py-1 pl-1 pr-3 text-sm font-bold", RING)}>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white">
            <UserRound aria-hidden className="h-4 w-4" />
          </span>
          ชื่อของคุณ
        </span>
      </div>
    </Frame>
  );
}

function Frame({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div aria-hidden className="rounded-2xl border border-line bg-sunken p-3 sm:p-4">
      {label && <p className="mb-2 text-xs font-bold text-muted">{label}</p>}
      {children}
    </div>
  );
}
