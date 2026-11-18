import type { Metadata } from "next";
import { PresentMode } from "@/components/admin/report/PresentMode";
import { reportFor } from "../load";

export const metadata: Metadata = { title: "โหมดนำเสนอ · รายงาน & OKR" };

/** The report as full-screen slides (same data and URL options as /admin/report). */
export default async function PresentPage({ searchParams }: PageProps<"/admin/report/present">) {
  const sp = await searchParams;
  const { view } = await reportFor(sp);
  const back = `/admin/report?${new URLSearchParams(
    Object.entries(sp).flatMap(([k, val]) => (typeof val === "string" && ["preset", "from", "to", "lang"].includes(k) ? [[k, val]] : [])),
  )}`;
  return <PresentMode v={view} back={back} />;
}
