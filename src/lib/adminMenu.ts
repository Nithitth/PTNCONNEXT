// The Developer Console's central menu (/admin): which boxes exist, in which group, and what number or
// badge each one shows. Pure, so it's tested in adminMenu.test.ts; AdminMenu.tsx draws it.

/** Everything the menu's numbers and badges are made from (counted in src/app/admin/page.tsx). */
export type MenuCounts = {
  students: number;
  staff: number;
  studentsRegistered: number;
  studentsTotal: number;
  teachersRegistered: number;
  teachersTotal: number;
  openRooms: number;
  signupsToday: number;
  templatesWaiting: number;
  posts: number;
  files: number;
  newFeedback: number;
  errors24: number;
  failedLogins24: number;
  lockedToday: number;
};

export type MenuIcon =
  "qr" | "tcas" | "roadmap" | "teacherCode" | "users" | "roster" | "overview" | "history" | "feedback" | "errors" | "limits" | "report" | "ideas";

export type MenuBox = {
  href: string;
  label: string;
  hint: string;
  icon: MenuIcon;
  /** Big boxes are two columns wide with the red gradient (the most-used parts). */
  big: boolean;
  /** On computers a tall big box spans two rows, so the two boxes after it stack beside it. */
  tall: boolean;
  /** One live number line, e.g. "240 นักเรียน · 18 ครูและผู้ดูแล". */
  stat: string | null;
  /** A red badge for something that needs a look; only when the count is above zero. */
  badge: string | null;
  /** A shortcut button inside the box. */
  action: { href: string; label: string } | null;
};

export type MenuGroup = { title: string; note: string; boxes: MenuBox[] };

const n = (v: number) => v.toLocaleString("th-TH");
const progress = (done: number, total: number) => (total ? `ลงทะเบียนแล้ว ${n(done)}/${n(total)} คน` : "ยังไม่มีรายชื่อ");
const badgeIf = (count: number, text: string) => (count > 0 ? text : null);

/** The menu, grouped by who each part is about. Pages about everyone live under ระบบ. */
export function buildMenu(c: MenuCounts): MenuGroup[] {
  const box = (b: Omit<MenuBox, "big" | "tall" | "stat" | "badge" | "action"> & Partial<MenuBox>): MenuBox => ({
    big: false,
    tall: false,
    stat: null,
    badge: null,
    action: null,
    ...b,
  });
  return [
    {
      title: "นักเรียน",
      note: "การลงทะเบียนตามห้อง และข้อมูลเรียนต่อ",
      boxes: [
        box({
          href: "/admin/access/rooms",
          label: "ห้องเรียน & QR",
          hint: "ตั้งเวลาลงทะเบียนของแต่ละห้อง พิมพ์การ์ด QR และดูรายชื่อในห้อง",
          icon: "qr",
          big: true,
          tall: true,
          stat: progress(c.studentsRegistered, c.studentsTotal),
          badge: badgeIf(c.openRooms, `เปิดอยู่ ${n(c.openRooms)} ห้อง`),
          action: {
            href: "/admin/access/rooms#generate",
            label: "สร้างรหัสลงทะเบียน",
          },
        }),
        box({
          href: "/admin/tcas",
          label: "ข้อมูล TCAS",
          hint: "ดึงและเผยแพร่หลักสูตรจาก mytcas ทีละมหาวิทยาลัย",
          icon: "tcas",
        }),
        box({
          href: "/admin/roadmap",
          label: "แม่แบบ Roadmap",
          hint: "ภารกิจแนะนำและวันสำคัญ TCAS",
          icon: "roadmap",
          badge: badgeIf(c.templatesWaiting, `รอตรวจ ${n(c.templatesWaiting)}`),
        }),
      ],
    },
    {
      title: "ครู",
      note: "รหัสส่วนตัวสำหรับลงทะเบียนครู",
      boxes: [
        box({
          href: "/admin/access/teachers",
          label: "รหัสครู",
          hint: "สร้างรหัสส่วนตัว 9 ตัวให้ครูแต่ละคน และดูว่าใครลงทะเบียนแล้ว",
          icon: "teacherCode",
          stat: progress(c.teachersRegistered, c.teachersTotal),
        }),
      ],
    },
    {
      title: "ระบบ",
      note: "บัญชีทุกคน ความปลอดภัย และสุขภาพของระบบ",
      boxes: [
        box({
          href: "/admin/users",
          label: "ผู้ใช้",
          hint: "ค้นหาบัญชี รีเซ็ตรหัสผ่าน และปิดการยืนยันสองขั้นตอน",
          icon: "users",
          big: true,
          stat: `${n(c.students)} นักเรียน · ${n(c.staff)} ครูและผู้ดูแล`,
        }),
        box({
          href: "/admin/access",
          label: "ภาพรวมการลงทะเบียน",
          hint: "ความคืบหน้าทุกห้อง และสิ่งที่เกิดขึ้นวันนี้",
          icon: "overview",
          stat: `วันนี้ลงทะเบียน ${n(c.signupsToday)} คน`,
        }),
        box({
          href: "/admin/roster",
          label: "นำเข้ารายชื่อ",
          hint: "อัปโหลดไฟล์รายชื่อนักเรียนและครู (.xlsx) เพื่อเตรียมลงทะเบียน",
          icon: "roster",
          big: true,
        }),
        box({
          href: "/admin/access/history",
          label: "ประวัติ",
          hint: "การลงทะเบียน การเข้าสู่ระบบ และการกระทำของผู้ดูแล",
          icon: "history",
          badge: badgeIf(c.failedLogins24, `ไม่สำเร็จ ${n(c.failedLogins24)}`),
        }),
        box({
          href: "/admin/feedback",
          label: "ความคิดเห็น",
          hint: "ข้อความจากครูและนักเรียน",
          icon: "feedback",
          badge: badgeIf(c.newFeedback, `ใหม่ ${n(c.newFeedback)}`),
        }),
        box({
          href: "/admin/errors",
          label: "ข้อผิดพลาด",
          hint: "ปัญหาที่ระบบบันทึกไว้",
          icon: "errors",
          badge: badgeIf(c.errors24, `${n(c.errors24)} ใน 24 ชม.`),
        }),
        box({
          href: "/admin/limits",
          label: "ขีดจำกัดระบบ",
          hint: "พื้นที่ ฐานข้อมูล และโควตาฟรี",
          icon: "limits",
          stat: `โพสต์ ${n(c.posts)} · ไฟล์ ${n(c.files)}`,
        }),
      ],
    },
    {
      title: "รายงาน",
      note: "OKR สถิติ และข้อค้นพบ สำหรับผู้บริหาร กรรมการ และโรงเรียนที่สนใจ",
      boxes: [
        box({
          href: "/admin/report",
          label: "รายงาน & OKR",
          hint: "Connext Score ความคืบหน้า OKR ผลกระทบ และข้อค้นพบ พิมพ์เป็น PDF ได้ทั้งไทยและอังกฤษ",
          icon: "report",
          big: true,
          stat: "เลือกช่วงเวลาได้ · เทียบกับช่วงก่อน",
          action: { href: "/admin/report/present", label: "โหมดนำเสนอ" },
        }),
        box({
          href: "/admin/report/ideas",
          label: "ไอเดียโครงการถัดไป",
          hint: "จัดหมวดความคิดเห็น และไอเดียจากรูปแบบการใช้งาน (สำหรับทีม)",
          icon: "ideas",
          badge: badgeIf(c.newFeedback, `ความเห็นใหม่ ${n(c.newFeedback)}`),
        }),
      ],
    },
  ];
}

export type AlertItem = { href: string; label: string; count: number };

/** The strip above the menu: only the things that need a look right now (empty = all clear). */
export function alertItems(c: MenuCounts): AlertItem[] {
  return [
    {
      href: "/admin/feedback",
      label: "ความคิดเห็นใหม่ (7 วัน)",
      count: c.newFeedback,
    },
    { href: "/admin/errors", label: "ข้อผิดพลาด (24 ชม.)", count: c.errors24 },
    {
      href: "/admin/access/history?show=failed",
      label: "เข้าสู่ระบบไม่สำเร็จ (24 ชม.)",
      count: c.failedLogins24,
    },
    { href: "/admin/access/history", label: "ถูกล็อกวันนี้", count: c.lockedToday },
  ].filter((a) => a.count > 0);
}
