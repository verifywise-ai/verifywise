/**
 * @fileoverview AI Governance Risk Score (AGRS) Configuration
 *
 * Constants for the 5-dimension risk scoring engine:
 * dimension definitions, base penalties, multipliers, grade thresholds,
 * and LLM prompt template.
 *
 * @module config/riskScoringConfig
 */

// ============================================================================
// Dimension Definitions
// ============================================================================

export type DimensionKey =
  | "data_sovereignty"
  | "transparency"
  | "security"
  | "autonomy"
  | "supply_chain";

export interface DimensionDefinition {
  key: DimensionKey;
  label: string;
  description: string;
  defaultWeight: number;
  relevantFindingTypes: string[];
}

export const DIMENSION_DEFINITIONS: DimensionDefinition[] = [
  {
    key: "data_sovereignty",
    label: "Data sovereignty",
    description: "Risk of data leaving the organization via cloud AI providers",
    defaultWeight: 0.25,
    relevantFindingTypes: ["api_call", "rag_component", "library", "prompt_injection", "pii_exposure", "model_theft"],
  },
  {
    key: "transparency",
    label: "Transparency",
    description: "Ability to explain and audit AI system behavior",
    defaultWeight: 0.20,
    relevantFindingTypes: ["model_ref", "library", "agent", "overreliance"],
  },
  {
    key: "security",
    label: "Security",
    description: "Credential exposure and vulnerability risk",
    defaultWeight: 0.20,
    relevantFindingTypes: ["secret", "api_call", "prompt_injection", "pii_exposure", "excessive_agency", "jailbreak_risk", "training_data_poisoning", "model_dos", "insecure_plugin", "model_theft"],
  },
  {
    key: "autonomy",
    label: "Autonomy",
    description: "Level of autonomous AI decision-making without human oversight",
    defaultWeight: 0.15,
    relevantFindingTypes: ["agent", "excessive_agency", "overreliance", "model_dos", "insecure_plugin"],
  },
  {
    key: "supply_chain",
    label: "Supply chain",
    description: "Third-party AI dependency and provider concentration risk",
    defaultWeight: 0.20,
    relevantFindingTypes: ["dependency", "library", "api_call", "supply_chain", "training_data_poisoning"],
  },
];

export const DEFAULT_DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  data_sovereignty: 0.25,
  transparency: 0.20,
  security: 0.20,
  autonomy: 0.15,
  supply_chain: 0.20,
};

// ============================================================================
// Base Penalties Per Finding Type
// ============================================================================

export const BASE_PENALTIES: Record<string, number> = {
  // Actual risk indicators — keep high penalties
  secret: 20,
  prompt_injection: 18,
  pii_exposure: 16,
  training_data_poisoning: 16,
  excessive_agency: 14,
  supply_chain: 14,
  model_theft: 14,
  jailbreak_risk: 12,
  insecure_plugin: 12,
  model_dos: 10,
  overreliance: 10,
  // Inventory items — lower penalties since presence alone is not a risk,
  // only penalize when combined with high risk_level or confidence
  agent: 5,
  api_call: 3,
  rag_component: 2,
  model_ref: 1,
  library: 0.5,
  dependency: 0.2,
};

/**
 * Finding types that are inventory items (governance-relevant but not
 * inherently risky). These are only penalized when their risk_level
 * is medium or high — low-risk inventory items are informational only.
 */
export const INVENTORY_FINDING_TYPES = new Set([
  "library",
  "dependency",
  "api_call",
  "model_ref",
  "rag_component",
  "agent",
]);

// ============================================================================
// Multipliers
// ============================================================================

export const CONFIDENCE_MULTIPLIERS: Record<string, number> = {
  high: 1.0,
  medium: 0.6,
  low: 0.3,
};

export const RISK_LEVEL_MULTIPLIERS: Record<string, number> = {
  high: 1.0,
  medium: 0.6,
  low: 0.3,
};

// ============================================================================
// High-Risk Providers (cloud AI services with data egress risk)
// ============================================================================

export const HIGH_RISK_PROVIDERS = new Set([
  "OpenAI",
  "Anthropic",
  "Google",
  "Google AI",
  "Azure",
  "Azure AI",
  "AWS",
  "Amazon",
  "Cohere",
  "AI21",
  "Mistral",
]);

// ============================================================================
// Grade Thresholds
// ============================================================================

export type RiskGrade = "A" | "B" | "C" | "D" | "F";

export interface GradeThreshold {
  grade: RiskGrade;
  minScore: number;
  label: string;
}

export const GRADE_THRESHOLDS: GradeThreshold[] = [
  { grade: "A", minScore: 90, label: "Excellent" },
  { grade: "B", minScore: 80, label: "Good" },
  { grade: "C", minScore: 70, label: "Acceptable" },
  { grade: "D", minScore: 60, label: "Needs attention" },
  { grade: "F", minScore: 0, label: "Critical" },
];

export function getGradeForScore(score: number): { grade: RiskGrade; label: string } {
  for (const threshold of GRADE_THRESHOLDS) {
    if (score >= threshold.minScore) {
      return { grade: threshold.grade, label: threshold.label };
    }
  }
  return { grade: "F", label: "Critical" };
}

// ============================================================================
// LLM Enhancement Config
// ============================================================================

export const LLM_ADJUSTMENT_CAP = 15;

export const LLM_RISK_SCORING_PROMPT = `You are an AI governance risk analyst. Analyze the following repository scan findings and provide risk scoring adjustments.

## Repository
Name: {{repository_name}}
Total findings: {{total_findings}}

## Findings Summary
{{findings_summary}}

## Top 10 Highest-Risk Findings
{{top_findings}}

## Vulnerability Findings
{{vulnerability_findings}}

## Current Rule-Based Dimension Scores
{{dimension_scores}}

## Instructions
Analyze the findings holistically and provide:
1. Per-dimension score adjustments (-15 to +15 points). Positive means the rule-based score underestimates risk (lower the score), negative means it overestimates risk (raise the score).
2. A narrative summary (2-3 paragraphs) of the overall AI governance posture. Use **bold** markdown for key risk areas, provider names, and critical findings to highlight important parts.
3. Top 3-5 prioritized mitigation recommendations with specific file/finding references.
4. Cross-finding correlation insights (e.g., "API calls to OpenAI combined with no auth patterns suggest...").
5. Suggest 3-5 concrete risks that should be added to the organization's risk register based on these findings. Each risk must include:
   - risk_name (concise title, 5-15 words)
   - risk_description (1-2 sentences explaining the risk)
   - risk_category (array from: "Strategic risk", "Operational risk", "Compliance risk", "Financial risk", "Cybersecurity risk", "Reputational risk", "Legal risk", "Technological risk", "Third-party/vendor risk", "Environmental risk", "Human resources risk", "Geopolitical risk", "Fraud risk", "Data privacy risk", "Health and safety risk")
   - ai_lifecycle_phase (one of: "Deployment & integration", "Monitoring & maintenance", "Data collection & processing", "Model development & training", "Model validation & testing", "Problem definition & planning", "Decommissioning & retirement")
   - likelihood (1-5: 1=Rare, 2=Unlikely, 3=Possible, 4=Likely, 5=Almost Certain)
   - severity (1-5: 1=Negligible, 2=Minor, 3=Moderate, 4=Major, 5=Catastrophic)
   - impact (1-2 sentences describing potential impact)
   - mitigation_plan (2-3 actionable steps)
   - dimension (which AGRS dimension this relates to: "data_sovereignty", "transparency", "security", "autonomy", or "supply_chain")
   - finding_refs (array of specific finding names that support this risk)

Respond with valid JSON only:
{
  "adjustments": {
    "data_sovereignty": <number>,
    "transparency": <number>,
    "security": <number>,
    "autonomy": <number>,
    "supply_chain": <number>
  },
  "narrative": "<string>",
  "recommendations": ["<string>", ...],
  "correlations": ["<string>", ...],
  "suggested_risks": [
    {
      "risk_name": "<string>",
      "risk_description": "<string>",
      "risk_category": ["<string>", ...],
      "ai_lifecycle_phase": "<string>",
      "likelihood": <number>,
      "severity": <number>,
      "impact": "<string>",
      "mitigation_plan": "<string>",
      "dimension": "<string>",
      "finding_refs": ["<string>", ...]
    }
  ]
}`;
