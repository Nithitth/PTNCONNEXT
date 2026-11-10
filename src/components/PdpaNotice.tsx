// The PDPA notice text, shared by the consent page and the home page.
// DRAFT: have the school's PDPA officer review this wording before launch,
// and bump PDPA_VERSION in src/lib/auth.ts whenever it changes.
import { Database, Eye, Scale, Target } from "lucide-react";

const SECTIONS = [
  {
    Icon: Database,
    title: "ข้อมูลที่เราเก็บ",
    items: [
      "ข้อมูลบัญชี: เลขประจำตัวหรือชื่อผู้ใช้ ชื่อ-นามสกุล ชั้นและห้องเรียน",
      "ประวัติการเข้าสู่ระบบ (วันเวลา และสำเร็จหรือไม่)",
      "ความคิดเห็นที่คุณส่งถึงทีมพัฒนา",
      "ในอนาคต (ระบบ TCAS): เป้าหมายมหาวิทยาลัยและแผนการเตรียมตัว (Roadmap) ที่คุณสร้าง",
    ],
  },
  {
    Icon: Target,
    title: "เราใช้ข้อมูลเพื่อ",
    items: [
      "ให้คุณเข้าสู่ระบบและเห็นงาน วันสอบ และสื่อการสอนของห้องเรียนของคุณ",
      "พัฒนาเว็บไซต์ เช่น นับจำนวนผู้ใช้ แยกตามชั้นและห้องเรียน",
      "ตรวจสอบความปลอดภัยและแก้ไขข้อผิดพลาดของระบบ",
    ],
  },
  {
    Icon: Eye,
    title: "ใครเห็นข้อมูลได้",
    items: [
      "ข้อมูลสถิติและประวัติการใช้งานเห็นได้เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น",
      "ครูและนักเรียนคนอื่นไม่เห็นข้อมูลของคุณ",
      "เราไม่ขายหรือส่งต่อข้อมูลให้บุคคลภายนอก",
    ],
  },
  {
    Icon: Scale,
    title: "สิทธิ์ของคุณ",
    items: ["ขอดู แก้ไข หรือลบข้อมูลของคุณ และถอนความยินยอมได้ทุกเมื่อ โดยติดต่อผู้ดูแลระบบของโรงเรียน"],
  },
];

export function PdpaNotice() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {SECTIONS.map(({ Icon, title, items }) => (
        <section
          key={title}
          className="group rounded-2xl border border-line bg-page p-5 transition-all duration-200 hover:border-line-strong hover:bg-surface hover:shadow-soft"
        >
          <h2 className="flex items-center gap-2.5 font-display font-bold text-ink">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-brand-soft text-brand transition-colors group-hover:bg-brand group-hover:text-white">
              <Icon aria-hidden className="h-4 w-4" />
            </span>
            {title}
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-muted">
            {items.map((i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-faint" />
                {i}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
