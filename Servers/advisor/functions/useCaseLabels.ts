/**
 * The status and risk classification values the advisor's use case tools
 * take: the console's lists, built from the enums so they cannot drift.
 *
 * Approvals filed before these lists may hold the advisor's old labels
 * (Draft, Active, In Progress, Archived, Unacceptable risk). When such an
 * approval executes, each maps to the nearest real value; a new filing takes
 * only real values.
 */
import { ProjectStatus } from "../../domain.layer/enums/project-status.enum";
import { AiRiskClassification } from "../../domain.layer/enums/ai-risk-classification.enum";

export const USE_CASE_STATUSES: string[] = Object.values(ProjectStatus);

/**
 * The classifications the use case form offers, for writes. GPAI and
 * General Risk are older values some stored use cases still hold.
 */
export const USE_CASE_CLASSIFICATIONS: string[] = [
  AiRiskClassification.PROHIBITED,
  AiRiskClassification.HIGH_RISK,
  AiRiskClassification.LIMITED_RISK,
  AiRiskClassification.MINIMAL_RISK,
  AiRiskClassification.OUT_OF_SCOPE,
];

/** Every stored classification, for filtering reads. */
export const USE_CASE_CLASSIFICATION_FILTERS: string[] = Object.values(AiRiskClassification);

const LEGACY_STATUSES: Record<string, ProjectStatus> = {
  draft: ProjectStatus.NOT_STARTED,
  active: ProjectStatus.IN_PROGRESS,
  archived: ProjectStatus.CLOSED,
};

const LEGACY_CLASSIFICATIONS: Record<string, AiRiskClassification> = {
  "unacceptable risk": AiRiskClassification.PROHIBITED,
};

const key = (value: string) => value.trim().toLowerCase();

const findIn = (list: string[], value: string): string | undefined =>
  list.find((item) => key(item) === key(value));

/** A real status, matched case-insensitively ("In Progress" is "In progress"). */
export const canonicalStatus = (value: string): string | undefined =>
  findIn(USE_CASE_STATUSES, value);

/** A classification the form offers, matched case-insensitively. */
export const canonicalClassification = (value: string): string | undefined =>
  findIn(USE_CASE_CLASSIFICATIONS, value);

type Labels = Record<string, unknown>;

const LABEL_FIELDS = [
  {
    field: "status",
    canonical: canonicalStatus,
    legacy: LEGACY_STATUSES,
    list: USE_CASE_STATUSES,
  },
  {
    field: "risk_classification",
    canonical: canonicalClassification,
    legacy: LEGACY_CLASSIFICATIONS,
    list: USE_CASE_CLASSIFICATIONS,
  },
] as const;

export interface LabelIssue {
  path: string[];
  message: string;
}

export interface LabelCheck {
  /** The parameters with each label written as the list spells it. */
  params: Labels;
  /** One per label not in its list, empty when all are valid. */
  issues: LabelIssue[];
}

/**
 * Check the labels a use case write names. `acceptLegacy` is for an approval
 * filed before these lists: its old labels map to the nearest real value.
 */
export function checkUseCaseLabels(params: Labels, { acceptLegacy = false } = {}): LabelCheck {
  const out: Labels = { ...params };
  const issues: LabelIssue[] = [];
  for (const { field, canonical, legacy, list } of LABEL_FIELDS) {
    const value = out[field];
    if (value === undefined || value === null) continue;
    const label = typeof value === "string" ? value : String(value);
    const mapped = canonical(label) ?? (acceptLegacy ? legacy[key(label)] : undefined);
    if (mapped) {
      out[field] = mapped;
    } else {
      issues.push({ path: [field], message: `"${label}" is not one of ${list.join(", ")}` });
    }
  }
  return { params: out, issues };
}
