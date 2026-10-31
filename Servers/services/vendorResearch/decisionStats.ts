/**
 * How the findings of the research agent were decided, by version of the prompt and by category:
 * the measure of whether a change to the agent made its findings more useful. The rate of
 * acceptance is accepted over decided (accepted plus dismissed); a finding nobody has decided yet
 * is neither a hit nor a miss.
 *
 * `getDecisionCountsQuery` (utils/vendorResearch.utils.ts) reads the counts out of the table; this
 * module folds them, so that the folding is checked without a database.
 */
import {
  DismissReason,
  FindingStatus,
  RESEARCH_CATEGORIES,
  ResearchCategory,
} from "../../domain.layer/interfaces/i.vendorResearch";

/** One group of the table: findings of a category, run with a prompt version, in a state. */
export interface DecisionCountRow {
  prompt_version: string | null;
  category: ResearchCategory;
  status: FindingStatus;
  dismissed_reason: DismissReason | null;
  count: number;
}

interface Counts {
  pending: number;
  accepted: number;
  dismissed: number;
  /** Accepted over decided; null while nothing is decided. */
  acceptanceRate: number | null;
  dismissedByReason: Partial<Record<DismissReason, number>>;
}

export interface DecisionStats extends Counts {
  /** Null for a run from before the prompt version was recorded. */
  promptVersion: string | null;
  category: ResearchCategory;
}

export interface PromptVersionStats extends Counts {
  promptVersion: string | null;
}

const emptyCounts = (): Counts => ({
  pending: 0,
  accepted: 0,
  dismissed: 0,
  acceptanceRate: null,
  dismissedByReason: {},
});

function addTo(counts: Counts, status: FindingStatus, count: number, reason: DismissReason | null) {
  counts[status] += count;
  if (status === "dismissed" && reason !== null) {
    counts.dismissedByReason[reason] = (counts.dismissedByReason[reason] ?? 0) + count;
  }
}

function withRate<T extends Counts>(counts: T): T {
  const decided = counts.accepted + counts.dismissed;
  counts.acceptanceRate = decided === 0 ? null : counts.accepted / decided;
  return counts;
}

/** Named versions in order, then the runs that have none. */
const byVersion = (a: string | null, b: string | null): number => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
};

export function foldDecisionStats(rows: DecisionCountRow[]): DecisionStats[] {
  const groups = new Map<string, DecisionStats>();
  for (const found of rows) {
    const key = JSON.stringify([found.prompt_version, found.category]);
    let group = groups.get(key);
    if (group === undefined) {
      group = { promptVersion: found.prompt_version, category: found.category, ...emptyCounts() };
      groups.set(key, group);
    }
    addTo(group, found.status, found.count, found.dismissed_reason);
  }
  return [...groups.values()]
    .map(withRate)
    .sort(
      (a, b) =>
        byVersion(a.promptVersion, b.promptVersion) ||
        RESEARCH_CATEGORIES.indexOf(a.category) - RESEARCH_CATEGORIES.indexOf(b.category),
    );
}

/** The categories of each prompt version added into one entry. */
export function sumByPromptVersion(stats: DecisionStats[]): PromptVersionStats[] {
  const versions = new Map<string | null, PromptVersionStats>();
  for (const stat of stats) {
    let version = versions.get(stat.promptVersion);
    if (version === undefined) {
      version = { promptVersion: stat.promptVersion, ...emptyCounts() };
      versions.set(stat.promptVersion, version);
    }
    version.pending += stat.pending;
    version.accepted += stat.accepted;
    version.dismissed += stat.dismissed;
    for (const [reason, count] of Object.entries(stat.dismissedByReason)) {
      version.dismissedByReason[reason as DismissReason] =
        (version.dismissedByReason[reason as DismissReason] ?? 0) + count;
    }
  }
  return [...versions.values()]
    .map(withRate)
    .sort((a, b) => byVersion(a.promptVersion, b.promptVersion));
}
