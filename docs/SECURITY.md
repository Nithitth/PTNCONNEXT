# PTN Connext — Security / ความปลอดภัย

One page for school directors, partners and investors. ภาษาไทยอยู่ด้านล่าง.

## What we protect

About 600 students and their teachers: names, student IDs, classrooms, emails and phone numbers, the posts and files teachers share, and each student's private TCAS targets, Roadmap and proof files (grade reports, certificates).

## Who can see what

| Data | Student | Teacher | Admin |
|---|---|---|---|
| Their own profile | ✓ | ✓ | ✓ |
| Posts and files for their own classroom | ✓ | ✓ (posts to any of the 8 rooms) | ✓ |
| Another student's TCAS targets, Roadmap or proof | ✗ | ✗ | ✗ (only anonymous totals of 3+ people) |
| Other people's emails and phones | ✗ | ✗ | Only through the console's sign-up tools |
| Log-in history, feedback, errors, audit log | ✗ | ✗ | ✓ (after two-step verification) |

These rules are enforced **by the database itself** (PostgreSQL Row Level Security on every table), not just by the screens, so they hold even if someone calls the database directly.

## The layers

1. **Accounts are tied to real people.** Only students and teachers on the school's roster can sign up: students with a time-limited room QR code shown by a student volunteer, teachers with a personal code handed over outside the system. One person = one account, enforced by the database. Emails are checked with a code.
2. **Passwords.** At least 8 characters; birthdates, very common passwords and the student ID are refused. Supabase stores only scrambled (bcrypt) passwords.
3. **Password guessing is stopped.** 10 wrong passwords for a student ID (5 for an email, phone or staff account) lock that log-in for 15 minutes; admins can unlock it. The hidden log-in addresses are scrambled with a server secret, so nobody can skip our log-in page and guess against the database directly. Every attempt is logged.
4. **Two-step verification.** Admins must enter a 6-digit code from an authenticator app on their phone every time they log in; teachers can turn it on. An admin's first set-up also needs a code sent to their verified email. Even then, admin powers in the database work only for a session that passed two-step, so a stolen admin password alone is useless.
5. **Private files.** PDFs and proof files are in private storage. They open only through a link that works for 60 seconds, after Connext checks who is asking. Teachers' PDFs are deleted after 180 days.
   - **Teachers who connect Google Drive** keep their PDFs in their own Drive instead. Connext asks Google only for permission to the files it creates (`drive.file`), never the rest of the Drive, and keeps Google's key encrypted on the server. These files are shared "anyone with the link can view" so students need no Google account. *Honest limit:* unlike Connext's private files, a Drive link that a student forwards also works for people outside the school. After 180 days (or when the post is deleted) Connext switches the file's sharing off, so the link stops working for everyone, and moves it to the teacher's Drive trash.
6. **Browser protection.** Security headers stop other websites from showing Connext inside their pages (click-jacking), force HTTPS and limit where the page may connect. *Honest limit:* the page still allows inline scripts (needed by Next.js), so these headers are not a full defence against injected scripts; React's automatic escaping of text is the main protection there.
7. **Audit trail.** Every admin action (password resets, imports, unlocks, two-step resets, sign-up switches, TCAS publishing) is recorded with who did it and when. Logs are kept for one year, then deleted automatically (PDPA).
8. **Secrets stay on the server.** The database master key and all other secrets are only on the server (Vercel), never in the browser or in the code repository.
9. **Tested every time.** `npm run check:security` logs in as a test student, teacher and admin on a separate test database and tries 60+ things they must not be able to do (read other rooms, become admin, read other students' data, use admin powers without two-step…). The real school database never holds test accounts.

## Switched on with the paid plans

| Plan | Adds |
|---|---|
| Supabase Pro ($25/month) | Daily backups (7 days), refusing passwords found in public data leaks, automatic log-out after inactivity |
| Vercel Pro ($20/month) | Firewall limits on how fast one network can try to log in or sign up, bot protection on sign-up |

Until then, the team takes a manual encrypted backup before the pilot (docs/SETUP.md).

## If something goes wrong

docs/INCIDENT.md is the step-by-step plan: contain within the hour, then tell the PDPC (สำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล) and the people affected within 72 hours, as the PDPA requires.

---

## ภาษาไทย (สรุป)

**ข้อมูลที่ดูแล:** ชื่อ เลขประจำตัว ห้องเรียน อีเมล เบอร์โทรของนักเรียนและครูประมาณ 600 คน โพสต์และไฟล์จากครู และข้อมูล TCAS/Roadmap/หลักฐานของนักเรียนแต่ละคน

**ใครเห็นอะไร:** นักเรียนเห็นเฉพาะข้อมูลของตัวเองและห้องตัวเอง ข้อมูล TCAS และ Roadmap ของนักเรียนแต่ละคน ครูและผู้ดูแลระบบก็เปิดดูไม่ได้ (เห็นเฉพาะภาพรวมที่มีอย่างน้อย 3 คน) กฎทั้งหมดบังคับที่ตัวฐานข้อมูล ไม่ใช่แค่ที่หน้าจอ

**ชั้นป้องกัน**
1. ลงทะเบียนได้เฉพาะคนที่อยู่ในรายชื่อของโรงเรียน (นักเรียนใช้ QR ประจำห้องที่เปิดเป็นช่วงเวลา ครูใช้รหัสส่วนตัว) 1 คน = 1 บัญชี และยืนยันอีเมลด้วยรหัส
2. รหัสผ่านอย่างน้อย 8 ตัว ห้ามใช้วันเกิด รหัสยอดนิยม หรือเลขประจำตัว และเก็บแบบเข้ารหัสทางเดียว
3. ใส่รหัสผ่านผิด 10 ครั้ง (เลขประจำตัว) หรือ 5 ครั้ง (อีเมล เบอร์โทร บัญชีครู) จะถูกล็อก 15 นาที และไม่มีใครข้ามหน้าเข้าสู่ระบบไปเดารหัสที่ฐานข้อมูลโดยตรงได้
4. ผู้ดูแลระบบต้องยืนยันตัวตนสองขั้นตอนด้วยรหัส 6 หลักจากแอปในโทรศัพท์ทุกครั้ง (ครูเลือกเปิดได้) รหัสผ่านที่ถูกขโมยเพียงอย่างเดียวจึงใช้สิทธิ์ผู้ดูแลไม่ได้
5. ไฟล์เก็บแบบส่วนตัว เปิดได้ผ่านลิงก์ที่ใช้ได้ 60 วินาทีหลังตรวจสิทธิ์แล้วเท่านั้น ครูที่เชื่อมต่อ Google Drive จะเก็บ PDF ใน Drive ของตัวเอง ระบบเห็นเฉพาะไฟล์ที่ส่งจาก Connext และไฟล์เปิดได้ทุกคนที่มีลิงก์ (ถ้านักเรียนส่งลิงก์ต่อ คนนอกก็เปิดได้)
6. ป้องกันเว็บอื่นนำหน้าเว็บไปซ้อนหลอกผู้ใช้ และบังคับ HTTPS
7. บันทึกทุกการกระทำของผู้ดูแลระบบ เก็บบันทึก 1 ปีแล้วลบอัตโนมัติ (PDPA)
8. กุญแจลับอยู่บนเซิร์ฟเวอร์เท่านั้น
9. มีชุดทดสอบอัตโนมัติที่พยายามเจาะระบบกว่า 60 แบบบนฐานข้อมูลทดสอบที่แยกจากของจริง

**เมื่อใช้แพ็กเกจเสียเงิน:** สำรองข้อมูลรายวัน ตรวจรหัสผ่านที่เคยรั่ว ออกจากระบบอัตโนมัติ ไฟร์วอลล์จำกัดการลองเข้าสู่ระบบ และกันบอตที่หน้าลงทะเบียน

**ถ้าเกิดเหตุ:** ทำตาม docs/INCIDENT.md และแจ้ง สคส. และผู้ได้รับผลกระทบภายใน 72 ชั่วโมงตาม PDPA
