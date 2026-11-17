import "server-only";
import nodemailer from "nodemailer";
import { EMAIL_CODE_MINUTES } from "@/lib/signup";

// Sends the 6-digit email check code from the school's Gmail account (SMTP_USER + an app password in
// SMTP_PASS; see docs/SETUP.md). Gmail allows about 500 emails a day. Without SMTP settings, local
// development prints the code in the dev-server log instead, so sign-up can still be tested.

export const isMailConfigured = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

const PURPOSE = {
  signup: { subject: "รหัสยืนยันอีเมล PTN Connext", where: "หน้าลงทะเบียน PTN Connext", ignore: "ถ้าคุณไม่ได้ลงทะเบียน ไม่ต้องทำอะไร" },
  "two-step": {
    subject: "รหัสตั้งค่าการยืนยันสองขั้นตอน PTN Connext",
    where: "หน้าตั้งค่าการยืนยันสองขั้นตอน",
    ignore: "ถ้าคุณไม่ได้เป็นคนขอ มีคนรู้รหัสผ่านของคุณ: เปลี่ยนรหัสผ่านทันทีและแจ้งผู้ดูแลระบบ",
  },
};

export async function sendEmailCode(to: string, code: string, purpose: keyof typeof PURPOSE = "signup"): Promise<void> {
  const p = PURPOSE[purpose];
  if (!isMailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[dev email] code for ${to}: ${code}`);
      return;
    }
    throw new Error("SMTP_USER / SMTP_PASS are not set");
  }
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({
    from: `"PTN Connext" <${process.env.SMTP_USER}>`,
    to,
    subject: `${p.subject}: ${code}`,
    text:
      `รหัสยืนยันอีเมลของคุณคือ ${code}\n\n` +
      `นำรหัสนี้ไปกรอกใน${p.where} ภายใน ${EMAIL_CODE_MINUTES} นาที\n` +
      `${p.ignore} และอย่าบอกรหัสนี้กับใคร`,
    html:
      `<div style="font-family:sans-serif;font-size:16px;color:#140e0e">` +
      `<p>รหัสยืนยันอีเมลของคุณคือ</p>` +
      `<p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#db2931">${code}</p>` +
      `<p>นำรหัสนี้ไปกรอกใน${p.where} ภายใน ${EMAIL_CODE_MINUTES} นาที</p>` +
      `<p style="color:#5c5352;font-size:13px">${p.ignore} และอย่าบอกรหัสนี้กับใคร</p></div>`,
  });
}
