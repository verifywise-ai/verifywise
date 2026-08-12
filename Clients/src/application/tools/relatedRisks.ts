import { RiskModel } from "../../domain/models/Common/risks/risk.model";

/**
 * A risk that shares one or more signals with the risk the user just saved,
 * together with why it matched and what to do about it.
 */
export interface RelatedRisk {
  risk: RiskModel;
  score: number;
  /** Human-readable badges naming the values that matched. */
  reasons: string[];
  /** Never empty: the related risk's mitigation plan, or a template sentence. */
  recommendation: string;
}

const MAX_RESULTS = 5;

/** Higher wins when two candidates score the same. */
const RISK_LEVEL_RANK: Record<string, number> = {
  "Very high risk": 6,
  "High risk": 5,
  "Medium risk": 4,
  "Low risk": 3,
  "Very low risk": 2,
  "No risk": 1,
};

const norm = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

/** Values present on both sides, in the subject's original casing. */
const sharedCategories = (a?: string[], b?: string[]): string[] => {
  if (!Array.isArray(a) || !Array.isArray(b)) return [];
  const other = new Set(b.map(norm).filter(Boolean));
  return a.filter((value) => norm(value) !== "" && other.has(norm(value)));
};

const sharesProject = (a?: number[], b?: number[]): boolean => {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  const other = new Set(b);
  return a.some((id) => other.has(id));
};

/** Equal and non-empty. Two blanks are not a match. */
const sameText = (a?: string, b?: string): boolean => norm(a) !== "" && norm(a) === norm(b);

const rank = (risk: RiskModel): number => RISK_LEVEL_RANK[risk.risk_level_autocalculated] ?? 0;

/**
 * Scores one candidate against the subject. Signals are evaluated in
 * recommendation-priority order, so the first template collected is the one
 * belonging to the highest-weight matched signal.
 */
const scoreCandidate = (subject: RiskModel, candidate: RiskModel): RelatedRisk | null => {
  const reasons: string[] = [];
  const templates: string[] = [];
  let score = 0;

  const categories = sharedCategories(subject.risk_category, candidate.risk_category);
  if (categories.length > 0) {
    const list = categories.join(", ");
    score += 3;
    reasons.push(`Shared category: ${list}`);
    templates.push(
      `Same category (${list}) — re-check this risk's likelihood and severity for consistency.`,
    );
  }

  if (sameText(subject.controls_mapping, candidate.controls_mapping)) {
    score += 2;
    reasons.push(`Shared control: ${candidate.controls_mapping}`);
    templates.push(
      `Shared control ${candidate.controls_mapping} — if that control changed, re-assess this risk.`,
    );
  }

  if (sameText(subject.assessment_mapping, candidate.assessment_mapping)) {
    score += 2;
    reasons.push(`Shared assessment: ${candidate.assessment_mapping}`);
    templates.push(
      `Shared assessment ${candidate.assessment_mapping} — confirm the answer still holds.`,
    );
  }

  if (sameText(subject.ai_lifecycle_phase, candidate.ai_lifecycle_phase)) {
    score += 2;
    reasons.push(`Same lifecycle phase: ${candidate.ai_lifecycle_phase}`);
    templates.push(
      `Same lifecycle phase (${candidate.ai_lifecycle_phase}) — verify the mitigation plans do not conflict.`,
    );
  }

  if (sharesProject(subject.projects, candidate.projects)) {
    score += 1;
    reasons.push("Same project");
    templates.push("Same project — review the project's risk profile as a whole.");
  }

  if (score === 0) return null;

  const plan = typeof candidate.mitigation_plan === "string" ? candidate.mitigation_plan.trim() : "";

  return {
    risk: candidate,
    score,
    reasons,
    recommendation: plan !== "" ? plan : templates[0],
  };
};

/**
 * Returns up to 5 risks related to `subject`, best match first.
 *
 * The relation is derived, not stored: risks are related when they overlap on
 * category (3), control mapping (2), assessment mapping (2), lifecycle phase
 * (2), or project (1). Ties break on risk level, then on id so the order is
 * deterministic.
 */
export function findRelatedRisks(subject: RiskModel, all: RiskModel[]): RelatedRisk[] {
  return all
    .filter((candidate) => candidate.id !== subject.id)
    .map((candidate) => scoreCandidate(subject, candidate))
    .filter((match): match is RelatedRisk => match !== null)
    .sort(
      (a, b) =>
        b.score - a.score || rank(b.risk) - rank(a.risk) || (a.risk.id ?? 0) - (b.risk.id ?? 0),
    )
    .slice(0, MAX_RESULTS);
}
