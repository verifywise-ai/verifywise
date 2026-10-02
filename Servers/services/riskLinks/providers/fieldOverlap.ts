import {
  LinkCandidate,
  LinkSignal,
  LinkSignalProvider,
  RecomputeContext,
  RiskScoringRow,
} from "../types";

const norm = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

/** Values present on both sides, in the subject's original casing. */
const sharedCategories = (a?: string[] | null, b?: string[] | null): string[] => {
  if (!Array.isArray(a) || !Array.isArray(b)) return [];
  const other = new Set(b.map(norm).filter(Boolean));
  return a.filter((value) => norm(value) !== "" && other.has(norm(value)));
};

const sharesProject = (a?: number[] | null, b?: number[] | null): boolean => {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  const other = new Set(b);
  return a.some((id) => other.has(id));
};

/**
 * Equal and non-empty. Two blanks are not a match, and neither is "0": the risk
 * form has no control/assessment picker, so it always sends 0, which lands in
 * these text columns as "0". That is "nothing mapped", not a shared mapping.
 */
const sameText = (a?: string | null, b?: string | null): boolean => {
  const left = norm(a);
  return left !== "" && left !== "0" && left === norm(b);
};

const scoreCandidate = (
  subject: RiskScoringRow,
  candidate: RiskScoringRow,
): LinkCandidate | null => {
  const reasons: LinkSignal[] = [];
  let score = 0;

  const categories = sharedCategories(subject.risk_category, candidate.risk_category);
  if (categories.length > 0) {
    score += 3;
    reasons.push({ signal: "shared_category", weight: 3, detail: categories.join(", ") });
  }

  if (sameText(subject.controls_mapping, candidate.controls_mapping)) {
    score += 2;
    reasons.push({ signal: "shared_control", weight: 2, detail: candidate.controls_mapping! });
  }

  if (sameText(subject.assessment_mapping, candidate.assessment_mapping)) {
    score += 2;
    reasons.push({ signal: "shared_assessment", weight: 2, detail: candidate.assessment_mapping! });
  }

  if (sameText(subject.ai_lifecycle_phase, candidate.ai_lifecycle_phase)) {
    score += 2;
    reasons.push({
      signal: "same_lifecycle_phase",
      weight: 2,
      detail: candidate.ai_lifecycle_phase!,
    });
  }

  if (sharesProject(subject.projects, candidate.projects)) {
    score += 1;
    reasons.push({ signal: "shared_project", weight: 1 });
  }

  if (score === 0) return null;
  return { targetRiskId: candidate.id, score, reasons };
};

/**
 * Tier 0: two risks are related when they overlap on the fields a human would
 * eyeball. Uncapped and unsorted on purpose — recompute.ts merges every
 * provider's output before applying the threshold, the cap, and the ordering.
 */
export const fieldOverlapProvider: LinkSignalProvider = {
  name: "field_overlap",
  tier: 0,
  async score(ctx: RecomputeContext): Promise<LinkCandidate[]> {
    return ctx.candidates
      .filter((candidate) => candidate.id !== ctx.subject.id)
      .map((candidate) => scoreCandidate(ctx.subject, candidate))
      .filter((match): match is LinkCandidate => match !== null);
  },
};
