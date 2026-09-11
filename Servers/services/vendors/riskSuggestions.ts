import { IVendor } from "../../domain.layer/interfaces/i.vendor";
import { IVendorRisk } from "../../domain.layer/interfaces/i.vendorRisk";
import { getVendorByIdQuery } from "../../utils/vendor.utils";
import { getVendorRisksByVendorIdQuery } from "../../utils/vendorRisk.utils";
import { calculateRiskLevel } from "../../utils/validations/vendorRiskValidation.utils";

/**
 * Roadmap item 6 — Vendor questionnaire → vendor risk suggestions.
 *
 * Read-only: for one vendor, derive the vendor risks its four questionnaire
 * answers imply, suppress any the vendor already has a near-identical risk for,
 * and return the rest with the field/value that produced each. It writes
 * nothing — no `vendorrisks` row, no migration, no new query.
 */

export type VendorRiskSuggestionArchetype =
  | "data_sensitivity"
  | "business_criticality"
  | "past_issues"
  | "regulatory_exposure";

export interface VendorRiskSuggestion {
  archetype: VendorRiskSuggestionArchetype;
  risk_description: string;
  impact_description: string;
  action_plan: string;
  likelihood: string;
  risk_severity: string;
  risk_level: string;
  reasons: string[];
}

export interface VendorRiskSuggestionReport {
  vendor_id: number;
  vendor_name: string;
  questionnaire_complete: boolean;
  existing_risk_count: number;
  suggestions: VendorRiskSuggestion[];
  suppressed: { archetype: string; matched_vendor_risk_id: number }[];
}

/**
 * Bound on the existing-risks scan used for suppression. Applied here as a
 * slice — never as a LIMIT inside `getVendorRisksByVendorIdQuery`, which is
 * shared with the vendor risk controllers.
 */
export const MAX_EXISTING_VENDOR_RISKS = 200;

export const VENDOR_SUGGESTION_SUPPRESS_THRESHOLD = 0.25;

const LEVEL_RANK: Record<string, number> = {
  "Very High": 5,
  High: 4,
  Medium: 3,
  Low: 2,
  "Very Low": 1,
};

/**
 * A/B/C/D ordering from the design, used only to keep equal risk levels stable.
 */
const ARCHETYPE_ORDER: Record<VendorRiskSuggestionArchetype, number> = {
  data_sensitivity: 0,
  business_criticality: 1,
  past_issues: 2,
  regulatory_exposure: 3,
};

/**
 * Raw enum value → short display label. Used for both the suggestion text and
 * the suppression tokens: interpolating the raw value yields nested
 * parentheses and drags `hipaa` into the token set. `reasons` keeps the raw
 * value — it is the audit trail.
 */
const DISPLAY_LABELS: Record<string, string> = {
  "Personally identifiable information (PII)": "PII",
  "Financial data": "financial data",
  "Health data (e.g. HIPAA)": "health data",
  "Model weights or AI assets": "model weights or AI assets",
  "Other sensitive data": "other sensitive data",
  "Minor incident (e.g. small delay, minor bug)": "a minor incident",
  "Major incident (e.g. data breach, legal issue)": "a major incident",
  "GDPR (EU)": "GDPR",
  "HIPAA (US)": "HIPAA",
  "SOC 2": "SOC 2",
  "ISO 27001": "ISO 27001",
  "EU AI act": "the EU AI Act",
  "CCPA (california)": "CCPA",
  Other: "other regulations",
};

const SENSITIVITY_SEVERITY: Record<string, string> = {
  "Health data (e.g. HIPAA)": "Catastrophic",
  "Financial data": "Major",
  "Personally identifiable information (PII)": "Major",
  "Model weights or AI assets": "Major",
  "Other sensitive data": "Moderate",
};

interface ArchetypeCandidate {
  archetype: VendorRiskSuggestionArchetype;
  risk_severity: string;
  likelihood: string;
  risk_description: string;
  impact_description: string;
  action_plan: string;
  reasons: string[];
  level: string;
  risk_level: string;
}

/** Lowercase, strip everything but [a-z0-9 ], split, drop tokens of length <= 2. */
function tokenise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

const withDerivedLevel = (
  candidate: Omit<ArchetypeCandidate, "level" | "risk_level">,
): ArchetypeCandidate | null => {
  const level = calculateRiskLevel(candidate.risk_severity, candidate.likelihood);
  if (!level) return null;
  return { ...candidate, level, risk_level: `${level} Risk` };
};

function buildCandidates(vendor: IVendor): ArchetypeCandidate[] {
  const candidates: ArchetypeCandidate[] = [];

  const sensitivity = vendor.data_sensitivity;
  if (sensitivity && sensitivity !== "None" && sensitivity !== "Internal only") {
    const candidate = withDerivedLevel({
      archetype: "data_sensitivity",
      risk_severity: SENSITIVITY_SEVERITY[sensitivity] ?? "Moderate",
      likelihood: "Possible",
      risk_description: `Sensitive data (${DISPLAY_LABELS[sensitivity] ?? sensitivity}) is processed by this vendor without evidenced safeguards`,
      impact_description:
        "Sensitive data handled by this vendor could be exposed, misused, or transferred without the safeguards the organization's obligations require.",
      action_plan:
        "Confirm the vendor's safeguards for this data type in writing, attach the evidence, and record the review date.",
      reasons: [`data_sensitivity: ${sensitivity}`],
    });
    if (candidate) candidates.push(candidate);
  }

  if (vendor.business_criticality === "High (critical to core services or products)") {
    const candidate = withDerivedLevel({
      archetype: "business_criticality",
      risk_severity: "Major",
      likelihood: "Unlikely",
      risk_description:
        "Service continuity exposure: this vendor is critical to core services or products",
      impact_description:
        "An outage or failure at this vendor would interrupt core services or products with no immediate fallback.",
      action_plan:
        "Document the continuity plan, confirm the recovery objectives, and validate a fallback arrangement.",
      reasons: [`business_criticality: ${vendor.business_criticality}`],
    });
    if (candidate) candidates.push(candidate);
  }

  const pastIssues = vendor.past_issues;
  if (
    pastIssues === "Minor incident (e.g. small delay, minor bug)" ||
    pastIssues === "Major incident (e.g. data breach, legal issue)"
  ) {
    const candidate = withDerivedLevel({
      archetype: "past_issues",
      risk_severity: pastIssues.startsWith("Minor") ? "Minor" : "Major",
      likelihood: "Likely",
      risk_description: `Recurrence of ${DISPLAY_LABELS[pastIssues] ?? pastIssues} previously recorded against this vendor`,
      impact_description:
        "The conditions that produced the previous incident remain in place, so a recurrence would repeat the same operational or contractual exposure.",
      action_plan:
        "Review the vendor's corrective actions from the earlier incident and confirm they still hold.",
      reasons: [`past_issues: ${pastIssues}`],
    });
    if (candidate) candidates.push(candidate);
  }

  const regulatoryExposure = vendor.regulatory_exposure;
  if (regulatoryExposure && regulatoryExposure !== "None") {
    const candidate = withDerivedLevel({
      archetype: "regulatory_exposure",
      risk_severity: "Moderate",
      likelihood: "Possible",
      risk_description: `Compliance obligations under ${DISPLAY_LABELS[regulatoryExposure] ?? regulatoryExposure} are not evidenced for this vendor`,
      impact_description:
        "The organization cannot evidence that the vendor meets the obligations this regime imposes.",
      action_plan:
        "Request the vendor's compliance evidence for this regime and record it against the risk.",
      reasons: [`regulatory_exposure: ${regulatoryExposure}`],
    });
    if (candidate) candidates.push(candidate);
  }

  return candidates.sort(
    (a, b) =>
      (LEVEL_RANK[b.level] ?? 0) - (LEVEL_RANK[a.level] ?? 0) ||
      ARCHETYPE_ORDER[a.archetype] - ARCHETYPE_ORDER[b.archetype],
  );
}

export async function getVendorRiskSuggestions(
  vendorId: number,
  organizationId: number,
): Promise<VendorRiskSuggestionReport | null> {
  const vendor = await getVendorByIdQuery(vendorId, organizationId);
  if (!vendor) return null;

  const existingRisks = (
    await getVendorRisksByVendorIdQuery(vendorId, organizationId, "active")
  ).slice(0, MAX_EXISTING_VENDOR_RISKS);

  const existingTokenSets = existingRisks
    .filter((risk): risk is IVendorRisk & { id: number } => typeof risk.id === "number")
    .map((risk) => ({ id: risk.id, tokens: tokenise(risk.risk_description ?? "") }));

  const suggestions: VendorRiskSuggestion[] = [];
  const suppressed: { archetype: string; matched_vendor_risk_id: number }[] = [];

  for (const candidate of buildCandidates(vendor)) {
    const candidateTokens = tokenise(candidate.risk_description);
    const match = existingTokenSets.find(
      (existing) =>
        jaccard(candidateTokens, existing.tokens) >= VENDOR_SUGGESTION_SUPPRESS_THRESHOLD,
    );

    if (match) {
      suppressed.push({
        archetype: candidate.archetype,
        matched_vendor_risk_id: match.id,
      });
      continue;
    }

    suggestions.push({
      archetype: candidate.archetype,
      risk_description: candidate.risk_description,
      impact_description: candidate.impact_description,
      action_plan: candidate.action_plan,
      likelihood: candidate.likelihood,
      risk_severity: candidate.risk_severity,
      risk_level: candidate.risk_level,
      reasons: candidate.reasons,
    });
  }

  return {
    vendor_id: vendor.id!,
    vendor_name: vendor.vendor_name,
    questionnaire_complete:
      vendor.data_sensitivity != null &&
      vendor.business_criticality != null &&
      vendor.past_issues != null &&
      vendor.regulatory_exposure != null,
    existing_risk_count: existingRisks.length,
    suggestions,
    suppressed,
  };
}
