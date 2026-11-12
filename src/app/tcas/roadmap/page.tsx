import { redirect } from "next/navigation";

/** The Roadmap moved to its own section at /roadmap; keep old links working. */
export default function OldRoadmapPage() {
  redirect("/roadmap");
}
