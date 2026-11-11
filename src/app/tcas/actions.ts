"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { logError } from "@/lib/logs";
import { createClient } from "@/lib/supabase/server";
import { cleanScores, isProgramId, pickOption, toRound3Option, type Round3Row } from "@/lib/tcas";

export type TargetResult = { ok?: true; error?: string };

const MAX_TARGETS = 5;

/** Saves (or updates) one of the student's target programs with their slider scores. */
export async function saveTarget(programId: string, position: number, scores: unknown): Promise<TargetResult> {
  const profile = await requireProfile({ roles: ["student"] });
  if (!isProgramId(programId) || !Number.isInteger(position)) return { error: "ไม่พบหลักสูตรนี้" };
  try {
    const supabase = await createClient();
    const { data: program } = await supabase
      .from("tcas_programs")
      .select("active, round3:tcas_round3(position, project_name, seats, min_gpax, min_total, weights, conditions, link, problem)")
      .eq("program_id", programId)
      .maybeSingle();
    if (!program || !program.active) return { error: "ไม่พบหลักสูตรนี้" };

    const options = ((program.round3 ?? []) as Round3Row[]).map(toRound3Option).filter((o) => !o.problem);
    const option = pickOption(options, position);
    // Programs without a calculator (no Round 3, or a special formula) are saved without scores.
    const clean = option ? cleanScores(option, scores) : {};
    if (!clean) return { error: "คะแนนไม่ถูกต้อง" };

    const { data: existing } = await supabase.from("tcas_targets").select("program_id");
    const already = (existing ?? []).some((t) => t.program_id === programId);
    if (!already && (existing?.length ?? 0) >= MAX_TARGETS) {
      return { error: `เก็บเป้าหมายได้สูงสุด ${MAX_TARGETS} หลักสูตร ลบเป้าหมายเดิมก่อน` };
    }

    // Update an existing target; insert a new one (the database caps new ones at 5).
    const fields = { position: option?.position ?? 0, slider_scores: clean, updated_at: new Date().toISOString() };
    const { error } = already
      ? await supabase.from("tcas_targets").update(fields).eq("program_id", programId)
      : await supabase.from("tcas_targets").insert({ ...fields, student_id: profile.id, program_id: programId });
    if (error) throw error;
    revalidatePath("/tcas");
    revalidatePath(`/tcas/${programId}`);
    return { ok: true };
  } catch (e) {
    await logError("tcas/target", e);
    return { error: "บันทึกไม่สำเร็จ ลองอีกครั้ง" };
  }
}

/** Removes one of the student's targets. */
export async function removeTarget(programId: string): Promise<TargetResult> {
  await requireProfile({ roles: ["student"] });
  if (!isProgramId(programId)) return { error: "ไม่พบหลักสูตรนี้" };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("tcas_targets").delete().eq("program_id", programId);
    if (error) throw error;
    revalidatePath("/tcas");
    revalidatePath(`/tcas/${programId}`);
    return { ok: true };
  } catch (e) {
    await logError("tcas/target", e);
    return { error: "ลบไม่สำเร็จ ลองอีกครั้ง" };
  }
}
