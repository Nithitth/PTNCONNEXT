"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { logError } from "@/lib/logs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { TCAS_UNIVERSITIES } from "@/lib/tcas";
import { fetchCourses, fetchLastYearMinMax, fetchRounds } from "@/lib/tcasFetch";
import { mapLimit, normalizeProgram, uniqueCourses } from "@/lib/tcasSource";

export type TcasActionResult = {
  ok?: true;
  error?: string;
  pulled?: number;
  problems?: number;
  /** Programs that got last year's scores (0 when the min/max sheet couldn't be read). */
  withLastYear?: number;
  added?: number;
  changed?: number;
  removed?: number;
};

const known = (id: string) => TCAS_UNIVERSITIES.some((u) => u.id === id);

/**
 * Pulls one university from the TCAS database into tcas_staging.
 * Staging is only replaced after every request succeeded, and live data is never touched here.
 */
export async function pullUniversity(universityId: string): Promise<TcasActionResult> {
  await requireProfile({ roles: ["admin"] });
  if (!known(universityId)) return { error: "ไม่รู้จักมหาวิทยาลัยนี้" };
  try {
    const [all, lastYear] = await Promise.all([fetchCourses(universityId), fetchLastYearMinMax()]);
    const courses = uniqueCourses(all);
    if (courses.length === 0) return { error: "ไม่พบหลักสูตรของมหาวิทยาลัยนี้ในข้อมูล TCAS" };
    const programs = await mapLimit(courses, 5, async (c) =>
      normalizeProgram(c, await fetchRounds(c.program_id), undefined, lastYear ?? undefined),
    );

    const admin = createAdminClient();
    const { error: delErr } = await admin.from("tcas_staging").delete().eq("university_id", universityId);
    if (delErr) throw delErr;
    const rows = programs.map((p) => ({ university_id: universityId, program_id: p.program.program_id, payload: p }));
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await admin.from("tcas_staging").insert(rows.slice(i, i + 100));
      if (error) {
        // Never leave half a university staged: publishing it would hide every program not yet inserted.
        await admin.from("tcas_staging").delete().eq("university_id", universityId);
        throw error;
      }
    }
    revalidatePath("/admin/tcas");
    return {
      ok: true,
      pulled: programs.length,
      problems: programs.filter((p) => p.round3.some((r) => r.problem)).length,
      withLastYear: programs.filter((p) => p.program.last_min !== null).length,
    };
  } catch (e) {
    await logError("tcas/pull", e);
    return { error: "ดึงข้อมูลไม่สำเร็จ ลองอีกครั้ง" };
  }
}

/** Publishes the staged programs of one university (tcas_publish checks admin again, all-or-nothing). */
export async function publishUniversity(universityId: string): Promise<TcasActionResult> {
  await requireProfile({ roles: ["admin"] });
  if (!known(universityId)) return { error: "ไม่รู้จักมหาวิทยาลัยนี้" };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("tcas_publish", { p_university: universityId });
    if (error) throw error;
    const counts = data as { added: number; changed: number; removed: number };
    revalidatePath("/admin/tcas");
    revalidatePath("/tcas");
    return { ok: true, ...counts };
  } catch (e) {
    await logError("tcas/publish", e);
    return { error: "เผยแพร่ไม่สำเร็จ" };
  }
}
