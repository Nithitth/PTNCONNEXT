import type { RoadmapScore } from "@/lib/roadmap";
import type { CardProgram, CardStage } from "./RoadmapCard";

// Sample data for the decorative game card on the Roadmap hero and the /tcas promo.

export const DEMO_PROGRAM: CardProgram = {
  programId: "demo",
  universityId: "001",
  universityShort: "จุฬาฯ",
  faculty: "คณะวิศวกรรมศาสตร์",
  nameTh: "วิศวกรรมคอมพิวเตอร์",
  active: true,
  color: "#8B2332", // Chula engineering, from facultyColors.ts
};

const badge = (key: string, label: string, earned: boolean) => ({ key, label, hint: "", earned });

export const DEMO_SCORE: RoadmapScore = {
  xp: 335,
  level: 7,
  levelStart: 300,
  nextLevelXp: 350,
  cappedXp: 0,
  boxXp: {},
  badges: [
    badge("first", "ก้าวแรก", true),
    badge("goal", "ตั้งเป้า", true),
    badge("goal-done", "เป้าสำเร็จ", true),
    badge("exam", "สายสอบ", true),
    badge("portfolio", "พอร์ตพร้อม", false),
    badge("activities", "นักกิจกรรม", true),
    badge("backup", "มีแผนสำรอง", false),
    badge("lv5", "200 XP", true),
  ],
};

export const DEMO_STAGE: CardStage = { stage: 4, name: "สะสมผลงาน", subLevel: 3, xpInStage: 130, stageSize: 250, gateWaiting: false, finished: false };
