"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Map as MapIcon, RefreshCw } from "lucide-react";
import { changeRoadmapTarget, createRoadmap } from "@/app/roadmap/actions";
import { Notice, smallButtonStyles } from "@/components/ui";

/**
 * On a program page (students): start a roadmap with this program, switch the roadmap to it
 * (asks once more first), or open it when it already points here.
 */
export function RoadmapButton({
  programId,
  position,
  state,
  currentName,
}: {
  programId: string;
  position: number;
  state: "none" | "this" | "other";
  /** The program the roadmap points at now (for the "switch" confirmation). */
  currentName?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state === "this") {
    return (
      <Link href="/roadmap" className={smallButtonStyles}>
        <MapIcon aria-hidden className="h-4 w-4" />
        Roadmap ของฉัน
        <ArrowRight aria-hidden className="h-4 w-4" />
      </Link>
    );
  }

  const go = () =>
    start(async () => {
      if (state === "other" && !confirming) return setConfirming(true);
      setError(null);
      const res = state === "none" ? await createRoadmap(programId, position) : await changeRoadmapTarget(programId, position);
      if (res.error) return setError(res.error);
      router.push("/roadmap");
    });

  return (
    <div className="space-y-2">
      <button type="button" onClick={go} disabled={pending} className={smallButtonStyles}>
        {state === "none" ? <MapIcon aria-hidden className="h-4 w-4" /> : <RefreshCw aria-hidden className="h-4 w-4" />}
        {pending ? "กำลังบันทึก…" : state === "none" ? "สร้าง Roadmap ด้วยหลักสูตรนี้" : confirming ? "ยืนยันเปลี่ยน Roadmap" : "เปลี่ยน Roadmap มาที่หลักสูตรนี้"}
      </button>
      {confirming && !pending && (
        <p className="text-xs text-muted">
          ตอนนี้ Roadmap ตั้งไว้ที่ {currentName ?? "หลักสูตรอื่น"} กล่องและข้อมูลทั้งหมดจะยังอยู่{" "}
          <button type="button" onClick={() => setConfirming(false)} className="font-bold text-brand hover:underline">
            ยกเลิก
          </button>
        </p>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
