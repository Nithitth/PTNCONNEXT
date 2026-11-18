// Everything the report page and the presentation draw, built once from the loaded data.
// Pure and plain (it crosses to the browser for the presentation and the calculator).

import { connextScore, scoreOkrs, type Assumptions, type Lang, type Okr, type Range, type ReportStats, type ScoredOkr } from "./report";
import {
  computeStats,
  funnel,
  heatmap,
  impact,
  insights,
  measuredRates,
  peakOf,
  roomRanking,
  weekBuckets,
  weekDistinct,
  workload,
  type Finding,
  type FunnelStep,
  type Impact,
  type Rates,
  type ReportRaw,
  type RoomRank,
  type Workload,
} from "./reportAnalysis";
import { topThemes, withTags, type Tags } from "./reportIdeas";

export type ReportInput = {
  current: ReportRaw;
  previous: ReportRaw;
  okrs: Okr[];
  assumptions: Assumptions;
  tags: Tags;
  avgFileBytes: number | null;
  storageUse: number;
  roomLabels: Record<string, string>;
};

export type Series = { week: string; count: number }[];

export type ReportView = {
  range: Range;
  lang: Lang;
  stats: ReportStats;
  prev: ReportStats;
  okrs: ScoredOkr[];
  score: number | null;
  prevScore: number | null;
  findings: Finding[];
  impact: Impact;
  assumptions: Assumptions;
  funnel: FunnelStep[];
  rooms: RoomRank[];
  weekly: { active: Series; signups: Series; posts: Series };
  heat: { students: number[][]; staff: number[][] };
  peak: { day: number; hour: number; count: number } | null;
  work: Workload;
  roomLabels: Record<string, string>;
  postsByType: Record<string, number>;
  topTargets: { label: string; students: number }[];
  roadmapStages: Record<number, number>;
  storageUse: number;
  themes: { th: string; en: string; count: number }[];
  rates: Rates;
};

export function buildView(input: ReportInput, range: Range, lang: Lang): ReportView {
  const { current, previous } = input;
  const stats = computeStats(current);
  const prev = computeStats(previous);
  const okrs = scoreOkrs(input.okrs, stats, prev);
  const prevOkrs = scoreOkrs(input.okrs, prev, null);
  const rooms = roomRanking(current);
  const ok = current.logins.filter((l) => l.ok);
  const all = heatmap(ok.map((l) => l.at));
  const work = workload(current.dues);
  const imp = impact(current, input.assumptions);
  const label = (id: string) => input.roomLabels[id] ?? "—";
  const postsByType: Record<string, number> = { assignment: 0, exam: 0, material: 0, event: 0 };
  for (const p of current.posts) postsByType[p.type] = (postsByType[p.type] ?? 0) + 1;
  const peak = peakOf(all);
  return {
    range,
    lang,
    stats,
    prev,
    okrs,
    score: connextScore(okrs),
    prevScore: connextScore(prevOkrs),
    findings: insights({ stats, prev, okrs, rooms, peak, work, roomLabel: label, impact: imp, topTargets: current.topTargets }),
    impact: imp,
    assumptions: input.assumptions,
    funnel: funnel(stats),
    rooms,
    weekly: {
      active: weekDistinct(
        ok.filter((l) => l.userId).map((l) => ({ at: l.at, id: l.userId! })),
        current.range,
      ),
      signups: weekBuckets(current.signups, current.range),
      posts: weekBuckets(
        current.posts.map((p) => p.createdAt),
        current.range,
      ),
    },
    heat: {
      students: heatmap(ok.filter((l) => l.role === "student").map((l) => l.at)),
      staff: heatmap(ok.filter((l) => l.role === "teacher" || l.role === "admin").map((l) => l.at)),
    },
    peak,
    work,
    roomLabels: input.roomLabels,
    postsByType,
    topTargets: current.topTargets,
    roadmapStages: current.roadmapStages,
    storageUse: input.storageUse,
    themes: topThemes(withTags(current.feedback, input.tags)),
    rates: measuredRates(current, stats, input.avgFileBytes),
  };
}
