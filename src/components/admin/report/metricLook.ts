import { Eye, GraduationCap, LayoutGrid, Leaf, MessageSquare, Scale, ShieldCheck, Target, Users, type LucideIcon } from "lucide-react";
import type { MetricCategory } from "@/lib/report";

/** Each goal group's icon and colour (goal picker, editor, war room). */
export const CAT_LOOK: Record<MetricCategory, { Icon: LucideIcon; tile: string; text: string }> = {
  adoption: { Icon: Users, tile: "bg-brand-soft text-brand", text: "text-brand" },
  reach: { Icon: Eye, tile: "bg-success-soft text-success", text: "text-success" },
  teaching: { Icon: GraduationCap, tile: "bg-exam-tint text-exam", text: "text-exam" },
  workload: { Icon: Scale, tile: "bg-major-tint text-urgent", text: "text-urgent" },
  tcas: { Icon: Target, tile: "bg-tcas-soft text-tcas", text: "text-tcas" },
  features: { Icon: LayoutGrid, tile: "bg-feature-soft text-feature", text: "text-feature" },
  reliability: { Icon: ShieldCheck, tile: "bg-sunken text-ink", text: "text-ink" },
  voice: { Icon: MessageSquare, tile: "bg-warning-soft text-warning", text: "text-warning" },
  impact: { Icon: Leaf, tile: "bg-success-soft text-success", text: "text-success" },
};
