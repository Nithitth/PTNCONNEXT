import { redirect } from "next/navigation";

/** The log-in report moved into ลงทะเบียน & เข้าสู่ระบบ → ประวัติ. */
export default async function OldLoginsPage({ searchParams }: PageProps<"/admin/logins">) {
  const show = (await searchParams).show;
  redirect(show === "failed" ? "/admin/access/history?show=failed" : "/admin/access/history");
}
