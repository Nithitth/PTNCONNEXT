import {
  BookOpen,
  Calculator,
  FolderOpen,
  Gauge,
  Hourglass,
  LifeBuoy,
  Link2,
  ListChecks,
  NotebookPen,
  Quote,
  Target,
  Tent,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { BoxKind } from "@/lib/roadmap";

/** One icon per box kind. Plain module (not "use client") so server components can use it too. */
export const BOX_ICONS: Record<BoxKind, LucideIcon> = {
  gpa: TrendingUp,
  scores: Calculator,
  quests: ListChecks,
  portfolio: FolderOpen,
  goal: Target,
  countdown: Hourglass,
  activities: Tent,
  notes: NotebookPen,
  motto: Quote,
  study: BookOpen,
  skills: Gauge,
  backup: LifeBuoy,
  links: Link2,
};
