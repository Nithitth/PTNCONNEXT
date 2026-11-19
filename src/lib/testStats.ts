// Test helper: the ReportStats fields added with the bigger goal catalogue, all "nothing yet".
// Spread into a test's fixture: { ...MORE_STATS, studentsTotal: 100, … }.
import type { ReportStats } from "./report";

export const MORE_STATS: Omit<
  ReportStats,
  | "studentsTotal"
  | "studentsRegistered"
  | "teachersTotal"
  | "teachersRegistered"
  | "accounts"
  | "studentAccounts"
  | "teacherAccounts"
  | "signups"
  | "activeUsers"
  | "activeStudents"
  | "weeklyActivePct"
  | "logins"
  | "loginSuccessPct"
  | "posts"
  | "postsPerWeek"
  | "teachersPosting"
  | "teachersPostingPct"
  | "materials"
  | "files"
  | "driveFiles"
  | "leadTimeDays"
  | "studentsWithTarget"
  | "studentsWithTargetPct"
  | "studentsWithRoadmap"
  | "studentsWithRoadmapPct"
  | "avgRoadmapStage"
  | "errors"
  | "errorsPerWeek"
  | "feedback"
  | "driveTeachers"
  | "driveTeachersPct"
> = {
  signupsPerWeek: 0,
  roomsFull: 0,
  activeStudentsPct: null,
  activeTeachers: 0,
  activeTeachersPct: null,
  failedLoginPct: null,
  lockouts: 0,
  postsWithFilePct: null,
  subjectsCovered: 0,
  roomsPerPost: null,
  notice3Pct: null,
  clashDays: 0,
  heaviestWeekItems: 0,
  roadmapStage3Pct: null,
  bugReports: 0,
  praisePct: null,
  storageUsePct: null,
  hoursSaved: 0,
  pagesSaved: 0,
  bahtSaved: 0,
  usageWeeklyPct: null,
  seenPct: null,
  seen24hPct: null,
  fileOpensPerStudent: null,
  returningPct: null,
  featuresPerPerson: null,
  featureWeekly: {},
  trackingSince: null,
};
