// The parts of Connext whose visits are counted (migration 0020, usage_daily). Pure: shared by the server
// (tracking) and the report/war room (labels). A page passes its key to requireProfile({ feature }).

export type FeatureKey =
  "home" | "calendar" | "tcas" | "tcas_program" | "tcas_compare" | "roadmap" | "account" | "teacher" | "teacher_form" | "admin" | "report";

/** Who the feature is for: its weekly-use % is counted against students, staff (teachers + admins) or everyone. */
export type Audience = "student" | "staff" | "all";

export type Feature = { key: FeatureKey; th: string; en: string; audience: Audience; icon: string };

export const FEATURES: Feature[] = [
  { key: "home", th: "หน้าแรก", en: "Home", audience: "all", icon: "home" },
  { key: "calendar", th: "ปฏิทินอัจฉริยะ", en: "Smart Calendar", audience: "student", icon: "calendar" },
  { key: "tcas", th: "ค้นหาหลักสูตร TCAS", en: "TCAS search", audience: "student", icon: "search" },
  { key: "tcas_program", th: "หน้าหลักสูตร + คำนวณคะแนน", en: "Program page + calculator", audience: "student", icon: "calculator" },
  { key: "tcas_compare", th: "เทียบหลักสูตร", en: "Compare programs", audience: "student", icon: "columns" },
  { key: "roadmap", th: "Roadmap", en: "Roadmap", audience: "student", icon: "map" },
  { key: "account", th: "บัญชีของฉัน", en: "My account", audience: "all", icon: "user" },
  { key: "teacher", th: "คอนโซลครู", en: "Teacher's Console", audience: "staff", icon: "layout" },
  { key: "teacher_form", th: "สร้าง/แก้ไขโพสต์", en: "Post form", audience: "staff", icon: "pen" },
  { key: "admin", th: "คอนโซลผู้พัฒนา", en: "Developer Console", audience: "staff", icon: "settings" },
  { key: "report", th: "รายงาน & OKR", en: "Report & OKR", audience: "staff", icon: "chart" },
];

export const FEATURE_KEYS = FEATURES.map((f) => f.key);
export const isFeatureKey = (k: string): k is FeatureKey => (FEATURE_KEYS as string[]).includes(k);
export const featureOf = (k: string) => FEATURES.find((f) => f.key === k);
