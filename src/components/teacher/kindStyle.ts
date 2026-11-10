import { BookOpen, CalendarHeart, ClipboardList, GraduationCap } from "lucide-react";
import type { PostKind } from "@/lib/postForm";

/** One icon + chip color per post kind (Teacher's Console tabs and "งานของฉัน"). */
export const KIND_STYLE: Record<PostKind, { Icon: typeof BookOpen; chip: string }> = {
  assignment: { Icon: ClipboardList, chip: "bg-brand-soft text-brand" },
  material: { Icon: BookOpen, chip: "bg-sunken text-ink" },
  exam: { Icon: GraduationCap, chip: "bg-exam-soft text-warning" },
  event: { Icon: CalendarHeart, chip: "bg-event-stripes text-event-ink" },
};
