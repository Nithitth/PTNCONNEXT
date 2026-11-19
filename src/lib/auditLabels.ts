// Thai names for audit_events actions (logAudit calls), shared by ประวัติ and a person's activity page.
// Add a label here whenever a new logAudit action is added.

export const ACTION: Record<string, string> = {
  // Admin actions
  "reset-password": "รีเซ็ตรหัสผ่าน",
  "report-settings": "แก้ไขการตั้งค่ารายงาน",
  "feedback-tag": "แก้หมวดความคิดเห็น",
  "import-students": "นำเข้ารายชื่อนักเรียน",
  "import-teachers": "นำเข้ารายชื่อครู",
  "personal-code": "สร้างรหัสส่วนตัว",
  "room-code": "สร้างรหัสลงทะเบียนห้อง",
  "school-drive-connect": "ลงชื่อเข้าใช้ Drive ของโรงเรียน",
  "school-drive-choose": "เลือก Shared Drive ของโรงเรียน",
  "school-drive-disconnect": "ยกเลิกการเชื่อมต่อ Drive ของโรงเรียน",
  "release-registration": "ยกเลิกการลงทะเบียน",
  "signup-open": "เปิดรับลงทะเบียน",
  "signup-close": "ปิดรับลงทะเบียน",
  "unlock-login": "ปลดล็อกการเข้าสู่ระบบ",
  "two-step-reset": "ปิดการยืนยันสองขั้นตอนให้ผู้อื่น",
  "tcas-publish": "เผยแพร่ข้อมูล TCAS",
  "roadmap-template": "แก้แม่แบบ Roadmap",
  "view-activity": "เปิดดูประวัติการใช้งานของผู้ใช้",
  // A person's own account
  logout: "ออกจากระบบ",
  "password-change": "เปลี่ยนรหัสผ่าน",
  "pdpa-accept": "ยอมรับนโยบายข้อมูลส่วนบุคคล",
  "pdpa-decline": "ไม่ยอมรับนโยบายข้อมูลส่วนบุคคล",
  "two-step-on": "เปิดการยืนยันสองขั้นตอน",
  "two-step-off": "ปิดการยืนยันสองขั้นตอน (ตัวเอง)",
  "two-step-email": "ขอรหัสทางอีเมลเพื่อตั้งค่าสองขั้นตอน",
  "two-step-leave": "ออกจากหน้ายืนยันสองขั้นตอน",
  "roadmap-delete": "ลบ Roadmap ของตัวเอง",
  "drive-connect": "เชื่อมต่อ Google Drive",
  "drive-disconnect": "ยกเลิกการเชื่อมต่อ Google Drive",
};

/** Actions a person does to their own account (the rest are admin actions). */
export const ACCOUNT_ACTIONS = new Set([
  "logout",
  "password-change",
  "pdpa-accept",
  "pdpa-decline",
  "two-step-on",
  "two-step-off",
  "two-step-email",
  "two-step-leave",
  "roadmap-delete",
  "drive-connect",
  "drive-disconnect",
]);

export const actionLabel = (action: string) => ACTION[action] ?? action;
