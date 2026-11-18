import type { Metadata } from "next";
import Link from "next/link";
import { HardDrive, ShieldCheck } from "lucide-react";
import { PdpaNotice } from "@/components/PdpaNotice";
import { Brand, Container } from "@/components/ui";

// The public privacy policy (no log-in needed). Google's OAuth review reads it, so it also explains what
// Connext does with Google Drive and ends with a short English summary. Keep it in step with PdpaNotice
// and with what src/lib/drive.ts really does.

export const metadata: Metadata = {
  title: "นโยบายความเป็นส่วนตัว",
  description: "PTN Connext เก็บ ใช้ และดูแลข้อมูลของนักเรียนและครูอย่างไร รวมถึงการใช้ Google Drive",
};

const UPDATED = "18 พฤศจิกายน 2569";

const DRIVE = [
  {
    title: "ขอสิทธิ์อะไร",
    items: [
      "ขอเพียงสิทธิ์ “ไฟล์ที่แอปนี้สร้างเท่านั้น” (drive.file) Connext จึงเห็นและแก้ได้เฉพาะไฟล์ PDF ที่ครูอัปโหลดผ่าน Connext และโฟลเดอร์ “PTN Connext” ที่สร้างให้",
      "Connext ไม่เห็น ไม่อ่าน และไม่แก้ไฟล์อื่นใดใน Google Drive ของครู",
    ],
  },
  {
    title: "ใช้ทำอะไร",
    items: [
      "อัปโหลด PDF ที่ครูเลือกเองลงในโฟลเดอร์ “PTN Connext” ใน Drive ของครู",
      "ตั้งค่าแชร์ไฟล์นั้นเป็น “ทุกคนที่มีลิงก์ดูได้” เพื่อให้นักเรียนในห้องที่ครูเลือกเปิดได้",
      "เมื่อไฟล์ครบ 180 วัน หรือครูลบหรือเปลี่ยนไฟล์ในโพสต์ Connext จะปิดการแชร์และย้ายไฟล์ไปถังขยะของ Drive ครู (ครูกู้คืนได้ภายใน 30 วัน)",
    ],
  },
  {
    title: "เก็บอะไรไว้",
    items: [
      "กุญแจเชื่อมต่อที่ Google ให้ เก็บแบบเข้ารหัส (AES-256) บนเซิร์ฟเวอร์ ไม่มีใครอ่านได้จากหน้าเว็บ",
      "รหัสโฟลเดอร์และรหัสไฟล์ที่ Connext สร้าง เพื่อเปิด ปิดการแชร์ และลบไฟล์เหล่านั้นได้",
      "ไม่เก็บอีเมล Google ชื่อบัญชี รูปโปรไฟล์ หรือข้อมูลอื่นจากบัญชี Google",
    ],
  },
  {
    title: "ไม่ทำอะไร",
    items: [
      "ไม่ขาย ไม่ส่งต่อ และไม่ให้บุคคลภายนอกใช้ข้อมูลจาก Google",
      "ไม่ใช้ข้อมูลจาก Google เพื่อโฆษณา หรือเพื่อฝึกปัญญาประดิษฐ์ (AI)",
      "ไม่ให้คนในทีมอ่านไฟล์ของครู เว้นแต่ครูขอให้ช่วยแก้ปัญหา หรือกฎหมายกำหนด",
    ],
  },
  {
    title: "ยกเลิกได้ทุกเมื่อ",
    items: [
      "กด “ยกเลิกการเชื่อมต่อ” ที่หน้า “บัญชีของฉัน” Connext จะแจ้ง Google ให้ยกเลิกกุญแจและลบกุญแจที่เก็บไว้ทันที",
      "หรือยกเลิกจากฝั่ง Google ที่ myaccount.google.com/permissions",
      "ไฟล์ที่อยู่ใน Drive แล้วยังเป็นของครูเสมอ ครูลบเองได้ตามต้องการ",
    ],
  },
];

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-muted">
      {items.map((i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-faint" />
          {i}
        </li>
      ))}
    </ul>
  );
}

export default function PrivacyPage() {
  return (
    <Container className="py-10 sm:py-14">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-line bg-surface shadow-soft-lg">
        <header className="bg-brand-gradient speed-lines px-6 py-8 text-white sm:px-10">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15">
            <ShieldCheck aria-hidden className="h-5 w-5" />
          </span>
          <h1 className="mt-5 font-display text-2xl font-extrabold leading-tight sm:text-3xl">นโยบายความเป็นส่วนตัว</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/80">
            <Brand className="whitespace-nowrap">PTN Connext</Brand> คือเว็บไซต์ของโรงเรียนที่รวมงาน วันสอบ สื่อการสอน และข้อมูลเรียนต่อมหาวิทยาลัย
            สำหรับครูและนักเรียนของโรงเรียน หน้านี้อธิบายว่าเราเก็บและใช้ข้อมูลอย่างไร ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล (PDPA)
          </p>
          <p className="mt-3 text-xs text-white/70">ปรับปรุงล่าสุด {UPDATED}</p>
        </header>

        <div className="space-y-10 p-6 sm:p-10">
          <section>
            <h2 className="font-display text-xl font-bold text-ink">ข้อมูลของผู้ใช้</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              ผู้เยี่ยมชมที่ยังไม่เข้าสู่ระบบ: เราไม่เก็บข้อมูลส่วนบุคคลใด ๆ เมื่อเข้าสู่ระบบครั้งแรก ระบบจะแสดงรายละเอียดนี้และขอความยินยอมก่อน
            </p>
            <div className="mt-5">
              <PdpaNotice />
            </div>
          </section>

          <section id="google-drive">
            <h2 className="flex items-center gap-2.5 font-display text-xl font-bold text-ink">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-brand-soft text-brand">
                <HardDrive aria-hidden className="h-4 w-4" />
              </span>
              การใช้ Google Drive (เฉพาะครูที่เลือกเชื่อมต่อ)
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              ครูเลือกได้ว่าจะเก็บ PDF ที่แชร์ให้นักเรียนไว้ใน Google Drive ของตัวเองแทนการเก็บใน Connext การเชื่อมต่อทำได้เฉพาะเมื่อครูกดยินยอมในหน้าของ
              Google เอง นักเรียนไม่ต้องใช้บัญชี Google
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {DRIVE.map((s) => (
                <section key={s.title} className="rounded-2xl border border-line bg-page p-5">
                  <h3 className="font-display font-bold text-ink">{s.title}</h3>
                  <List items={s.items} />
                </section>
              ))}
            </div>
            <p className="mt-4 rounded-xl bg-sunken px-4 py-3 text-sm leading-relaxed text-muted">
              การใช้และส่งต่อข้อมูลที่ได้รับจาก Google API ของ PTN Connext เป็นไปตาม{" "}
              <a href="https://developers.google.com/terms/api-services-user-data-policy" className="font-bold text-brand underline-offset-2 hover:underline">
                Google API Services User Data Policy
              </a>{" "}
              รวมถึงข้อกำหนดเรื่องการใช้งานแบบจำกัด (Limited Use)
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink">ความปลอดภัยและการเก็บรักษา</h2>
            <List
              items={[
                "ข้อมูลเก็บในฐานข้อมูลที่กำหนดสิทธิ์ทุกตาราง แต่ละคนเห็นได้เฉพาะข้อมูลที่ตนมีสิทธิ์ และรับส่งผ่านการเชื่อมต่อที่เข้ารหัส (HTTPS)",
                "ผู้ดูแลระบบต้องยืนยันตัวตนสองขั้นตอนทุกครั้ง",
                "ไฟล์ PDF ของครูเปิดได้ 180 วันแล้วถูกลบ บันทึกการใช้งานเก็บไว้ไม่เกิน 365 วัน",
              ]}
            />
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-ink">ติดต่อเรา</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              ขอดู แก้ไข ลบข้อมูล หรือถอนความยินยอม ติดต่อผู้ดูแลระบบของโรงเรียน หรือส่งข้อความผ่านกล่องความคิดเห็นในหน้าแรกหลังเข้าสู่ระบบ
            </p>
            <Link href="/" className="mt-3 inline-block text-sm font-bold text-brand underline-offset-2 hover:underline">
              กลับหน้าแรก
            </Link>
          </section>

          {/* Google's reviewers read English, so the Google part is summarised in English too. */}
          <section lang="en" className="rounded-2xl border border-line bg-page p-5">
            <h2 className="font-display font-bold text-ink">English summary: Google user data</h2>
            <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
              <p>
                PTN Connext is a school website for the teachers and students of one school. Teachers may choose to connect their own Google Drive so the PDFs
                they share with their classes are stored in their Drive instead of on our servers.
              </p>
              <p>
                We request only the <code>drive.file</code> scope, so we can access only the files and the &quot;PTN Connext&quot; folder that the app creates.
                We use it to upload the PDF the teacher picks, share that file as &quot;anyone with the link can view&quot; so their students can open it, and,
                after 180 days or when the teacher deletes or replaces it, turn sharing off and move it to the teacher&apos;s Drive trash.
              </p>
              <p>
                We store only an encrypted (AES-256) refresh token and the IDs of the files and folder we created. We do not store the Google email address or
                any other account data. We do not sell or transfer Google user data, use it for advertising, or use it to train AI models, and no person reads it
                except at the teacher&apos;s request or where the law requires.
              </p>
              <p>
                Teachers can disconnect at any time on their account page, which revokes the token with Google and deletes it from our database, or at
                myaccount.google.com/permissions.
              </p>
              <p>
                PTN Connext&apos;s use and transfer of information received from Google APIs will adhere to the Google API Services User Data Policy, including the
                Limited Use requirements.
              </p>
            </div>
          </section>
        </div>
      </article>
    </Container>
  );
}
