/**
 * @fileoverview AI Detection Risk Scoring Types
 *
 * Types for the AI Governance Risk Score (AGRS) feature.
 *
 * @module domain/ai-detection/riskScoringTypes
 */

export type DimensionKey =
  | "data_sovereignty"
  | "transparency"
  | "security"
  | "autonomy"
  | "supply_chain";

export type RiskGrade = "A" | "B" | "C" | "D" | "F";

export interface DimensionScore {
  score: number;
  penalty_count: number;
  top_contributors: string[];
}

export interface SuggestedRisk {
  risk_name: string;
  risk_description: string;
  risk_category: string[];
  ai_lifecycle_phase: string;
  likelihood: number;
  severity: number;
  impact: string;
  mitigation_plan: string;
  dimension: DimensionKey;
  finding_refs: string[];
}

export interface RiskScoreDetails {
  dimensions: Record<DimensionKey, DimensionScore>;
  llm_enhanced: boolean;
  llm_narrative: string | null;
  llm_recommendations: string[] | null;
  llm_adjustments: Record<DimensionKey, number> | null;
  llm_suggested_risks: SuggestedRisk[] | null;
}

export interface RiskScore {
  score: number | null;
  grade: RiskGrade | null;
  details: RiskScoreDetails | null;
  calculated_at: string | null;
}

export interface RiskScoreResult {
  score: number;
  grade: RiskGrade;
  label: string;
  details: RiskScoreDetails;
}

export type VulnerabilityTypeKey =
  | "prompt_injection"
  | "pii_exposure"
  | "excessive_agency"
  | "jailbreak_risk"
  | "training_data_poisoning"
  | "model_dos"
  | "supply_chain"
  | "insecure_plugin"
  | "overreliance"
  | "model_theft";

export interface VulnerabilityTypeInfo {
  key: VulnerabilityTypeKey;
  name: string;
  owaspId: string;
  description: string;
}

export const VULNERABILITY_TYPES: VulnerabilityTypeInfo[] = [
  {
    key: "prompt_injection",
    name: "Prompt injection",
    owaspId: "LLM01",
    description:
      "Detects untrusted user input concatenated into LLM prompts without sanitization, which can allow attackers to override system instructions or extract sensitive data.",
  },
  {
    key: "pii_exposure",
    name: "PII exposure",
    owaspId: "LLM06",
    description:
      "Detects personally identifiable information (names, emails, SSNs, financial or health data) passed to LLM APIs without redaction, risking data leakage through model providers.",
  },
  {
    key: "excessive_agency",
    name: "Excessive agency",
    owaspId: "LLM08",
    description:
      "Detects AI agents configured with overly broad tool access (filesystem, shell, network) without human-in-the-loop approval for destructive operations.",
  },
  {
    key: "jailbreak_risk",
    name: "Jailbreak risk",
    owaspId: "LLM02",
    description:
      "Detects LLM output flowing to code execution, SQL queries, HTML rendering, or system commands without validation, enabling jailbreak-to-RCE or injection attacks.",
  },
  {
    key: "training_data_poisoning",
    name: "Training data poisoning",
    owaspId: "LLM03",
    description:
      "Detects unsafe model loading patterns and models downloaded from untrusted sources without integrity checks, risking arbitrary code execution or data poisoning.",
  },
  {
    key: "model_dos",
    name: "Model denial of service",
    owaspId: "LLM04",
    description:
      "Detects missing token limits, input validation, timeouts, or rate limiting on LLM API calls, enabling resource exhaustion or unbounded generation costs.",
  },
  {
    key: "supply_chain",
    name: "Supply chain vulnerabilities",
    owaspId: "LLM05",
    description:
      "Detects unpinned AI package versions, models loaded from untrusted sources without checksum verification, and trust_remote_code enabled in dependencies.",
  },
  {
    key: "insecure_plugin",
    name: "Insecure plugin design",
    owaspId: "LLM07",
    description:
      "Detects tool or plugin definitions without input validation or schemas, MCP servers without authentication, and raw user input flowing to tool execution.",
  },
  {
    key: "overreliance",
    name: "Overreliance",
    owaspId: "LLM09",
    description:
      "Detects LLM output used for automated decisions without human review, missing confidence thresholds, and silent failure handling without fallback mechanisms.",
  },
  {
    key: "model_theft",
    name: "Model theft",
    owaspId: "LLM10",
    description:
      "Detects model weight files served over HTTP without authentication, placed in public directories, or bundled in client-side assets without access control.",
  },
];

export const DEFAULT_VULNERABILITY_TYPES_ENABLED: Record<VulnerabilityTypeKey, boolean> = {
  prompt_injection: true,
  pii_exposure: true,
  excessive_agency: true,
  jailbreak_risk: true,
  training_data_poisoning: true,
  model_dos: true,
  supply_chain: true,
  insecure_plugin: true,
  overreliance: true,
  model_theft: true,
};

export interface RiskScoringConfig {
  id: number | null;
  llm_enabled: boolean;
  llm_key_id: number | null;
  dimension_weights: Record<DimensionKey, number>;
  vulnerability_scan_enabled: boolean;
  vulnerability_types_enabled: Record<VulnerabilityTypeKey, boolean>;
  updated_by: number | null;
  updated_at: string | null;
}

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  data_sovereignty: "Data sovereignty",
  transparency: "Transparency",
  security: "Security",
  autonomy: "Autonomy",
  supply_chain: "Supply chain",
};

export const DIMENSION_DESCRIPTIONS: Record<DimensionKey, string> = {
  data_sovereignty: "Risk of data leaving the organization via cloud AI providers",
  transparency: "Ability to explain and audit AI system behavior",
  security: "Credential exposure and vulnerability risk",
  autonomy: "Level of autonomous AI decision-making without human oversight",
  supply_chain: "Third-party AI dependency and provider concentration risk",
};

export const DIMENSION_ORDER: DimensionKey[] = [
  "data_sovereignty",
  "transparency",
  "security",
  "autonomy",
  "supply_chain",
];

export const DEFAULT_DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  data_sovereignty: 0.25,
  transparency: 0.20,
  security: 0.20,
  autonomy: 0.15,
  supply_chain: 0.20,
};

export function getGradeLabel(grade: RiskGrade | null): string {
  switch (grade) {
    case "A": return "Excellent";
    case "B": return "Good";
    case "C": return "Acceptable";
    case "D": return "Needs attention";
    case "F": return "Critical";
    default: return "Not scored";
  }
}
