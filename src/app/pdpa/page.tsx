import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { PdpaNotice } from "@/components/PdpaNotice";
import { Brand, Button, Container, Notice } from "@/components/ui";
import { needsPdpa, requireProfile } from "@/lib/auth";
import { acceptPdpa, declinePdpa } from "./actions";

export const metadata: Metadata = { title: "การคุ้มครองข้อมูลส่วนบุคคล" };

export default async function PdpaPage({ searchParams }: PageProps<"/pdpa">) {
  const profile = await requireProfile({ skipPdpa: true });
  if (!needsPdpa(profile)) redirect("/calendar");
  const { error } = await searchParams;

  return (
    <Container className="py-10 sm:py-14">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-line bg-surface shadow-soft-lg">
        <div className="bg-brand-gradient speed-lines px-6 py-8 text-white sm:px-10">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15">
              <ShieldCheck aria-hidden className="h-5 w-5" />
            </span>
            <p className="text-sm text-white/75">สวัสดี {profile.display_name}</p>
          </div>
          <h1 className="mt-5 font-display text-3xl font-extrabold leading-tight">
            ก่อนเริ่มใช้งาน <Brand className="whitespace-nowrap">PTN Connext</Brand>
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/75">
            ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล (PDPA) โปรดอ่านว่าเราเก็บและใช้ข้อมูลของคุณอย่างไร
          </p>
        </div>
        <div className="p-6 sm:p-10">
          <PdpaNotice />
          {error && (
            <div className="mt-6">
              <Notice tone="error">บันทึกความยินยอมไม่สำเร็จ ลองอีกครั้ง</Notice>
            </div>
          )}
          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:justify-end">
            <form action={declinePdpa}>
              <Button type="submit" variant="ghost" className="w-full sm:w-auto">
                ไม่ยอมรับและออกจากระบบ
              </Button>
            </form>
            <form action={acceptPdpa}>
              <Button type="submit" variant="primary" className="w-full sm:w-auto">
                ยอมรับและเข้าใช้งาน
              </Button>
            </form>
          </div>
        </div>
      </div>
    </Container>
  );
}
