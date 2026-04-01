/**
 * @fileoverview AI Governance Risk Score (AGRS) Engine
 *
 * Calculates a 0-100 risk score across 7 governance dimensions,
 * with optional LLM enhancement for contextual analysis.
 *
 * Dimensions: Data sovereignty, Transparency, Security, Autonomy,
 * Supply chain, License, Accuracy
 *
 * @module services/aiDetection/riskScoring
 */

import logger from "../../utils/logger/fileLogger";
import {
  DimensionKey,
  DIMENSION_DEFINITIONS,
  DEFAULT_DIMENSION_WEIGHTS,
  BASE_PENALTIES,
  CONFIDENCE_MULTIPLIERS,
  RISK_LEVEL_MULTIPLIERS,
  HIGH_RISK_PROVIDERS,
  INVENTORY_FINDING_TYPES,
  getGradeForScore,
  LLM_ADJUSTMENT_CAP,
  LLM_RISK_SCORING_PROMPT,
  RiskGrade,
} from "../../config/riskScoringConfig";
import {
  getRiskScoringConfigQuery,
  getAllFindingsForScoringQuery,
  updateScanRiskScoreQuery,
  FindingForScoring,
} from "../../utils/aiDetectionRiskScoring.utils";
import { getLLMKeysWithKeyQuery } from "../../utils/llmKey.utils";
import { IServiceContext, VULNERABILITY_FINDING_TYPES } from "../../domain.layer/interfaces/i.aiDetection";

/** Pre-built Set for O(1) lookups in buildLLMPrompt */
const VULNERABILITY_FINDING_TYPES_SET = new Set<string>(VULNERABILITY_FINDING_TYPES);

// ============================================================================
// Types
// ============================================================================

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

export interface RiskScoreResult {
  score: number;
  grade: RiskGrade;
  label: string;
  details: RiskScoreDetails;
}

// ============================================================================
// Dimension Scoring Logic
// ============================================================================

/**
 * Determine which dimensions a finding contributes to.
 * Returns the applicable dimensions for penalty calculation.
 *
 * Inventory items (library, dependency, api_call, model_ref, rag_component,
 * agent) only contribute to dimensions when they have medium or high risk
 * level. Low-risk inventory items are informational and don't penalize any
 * dimension. Actual risk indicators (secrets, vulnerabilities) always
 * contribute regardless of risk level.
 */
function getDimensionsForFinding(finding: FindingForScoring): DimensionKey[] {
  const dimensions: DimensionKey[] = [];
  const { finding_type, provider, risk_level } = finding;

  const isInventory = INVENTORY_FINDING_TYPES.has(finding_type);
  const hasElevatedRisk = risk_level === "high" || risk_level === "medium";

  // Inventory items only penalize dimensions when risk is elevated
  if (isInventory && !hasElevatedRisk) {
    return dimensions;
  }

  // Data sovereignty: api_call to cloud providers, rag_component
  if (finding_type === "api_call" && provider && HIGH_RISK_PROVIDERS.has(provider)) {
    dimensions.push("data_sovereignty");
  }
  if (finding_type === "rag_component") {
    dimensions.push("data_sovereignty");
  }

  // Transparency: model_ref, undocumented libraries
  if (finding_type === "model_ref") {
    dimensions.push("transparency");
  }
  if (finding_type === "library") {
    dimensions.push("transparency");
  }

  // Security: secrets, api_call without secure patterns
  if (finding_type === "secret") {
    dimensions.push("security");
  }
  if (finding_type === "api_call") {
    dimensions.push("security");
  }

  // Autonomy: agents
  if (finding_type === "agent") {
    dimensions.push("autonomy");
  }

  // Supply chain: dependencies, libraries, api_calls
  if (finding_type === "dependency" || finding_type === "library" || finding_type === "api_call") {
    dimensions.push("supply_chain");
  }

  // Vulnerability findings — always penalize regardless of risk level
  if (finding_type === "prompt_injection") {
    dimensions.push("security", "data_sovereignty");
  }
  if (finding_type === "pii_exposure") {
    dimensions.push("data_sovereignty", "security");
  }
  if (finding_type === "excessive_agency") {
    dimensions.push("autonomy", "security");
  }
  if (finding_type === "jailbreak_risk") {
    dimensions.push("security", "transparency");
  }
  if (finding_type === "training_data_poisoning") {
    dimensions.push("security", "supply_chain");
  }
  if (finding_type === "model_dos") {
    dimensions.push("security", "autonomy");
  }
  if (finding_type === "supply_chain") {
    dimensions.push("supply_chain", "security");
  }
  if (finding_type === "insecure_plugin") {
    dimensions.push("security", "autonomy");
  }
  if (finding_type === "overreliance") {
    dimensions.push("autonomy", "transparency");
  }
  if (finding_type === "model_theft") {
    dimensions.push("security", "data_sovereignty");
  }

  return dimensions;
}

/**
 * Calculate the penalty for a single finding in a given dimension.
 */
function calculatePenalty(finding: FindingForScoring): number {
  const basePenalty = BASE_PENALTIES[finding.finding_type] || 3;
  const confidenceMultiplier = CONFIDENCE_MULTIPLIERS[finding.confidence] || 0.6;
  const riskMultiplier = RISK_LEVEL_MULTIPLIERS[finding.risk_level] || 0.6;

  return basePenalty * confidenceMultiplier * riskMultiplier;
}

/**
 * Calculate dimension scores from findings.
 */
export function calculateDimensionScores(
  findings: FindingForScoring[]
): Record<DimensionKey, DimensionScore> {
  const scores: Record<DimensionKey, DimensionScore> = {} as Record<DimensionKey, DimensionScore>;

  // Initialize all dimensions at 100
  for (const dim of DIMENSION_DEFINITIONS) {
    scores[dim.key] = {
      score: 100,
      penalty_count: 0,
      top_contributors: [],
    };
  }

  // No findings = perfect score
  if (findings.length === 0) {
    return scores;
  }

  // Track penalties per dimension for contributor ranking
  const dimensionPenalties: Record<DimensionKey, { finding: FindingForScoring; penalty: number }[]> = {} as Record<
    DimensionKey,
    { finding: FindingForScoring; penalty: number }[]
  >;
  for (const dim of DIMENSION_DEFINITIONS) {
    dimensionPenalties[dim.key] = [];
  }

  // Calculate penalties for each finding
  for (const finding of findings) {
    const penalty = calculatePenalty(finding);
    const dimensions = getDimensionsForFinding(finding);

    for (const dimKey of dimensions) {
      scores[dimKey].penalty_count++;
      dimensionPenalties[dimKey].push({ finding, penalty });
    }
  }

  // Calculate final scores per dimension using diminishing returns.
  // The first findings in a dimension have the most impact; additional findings
  // contribute less. This prevents large repos from always scoring 0.
  // Formula: effective_penalty = raw_penalty * (1 / (1 + decay * index))
  // where findings are sorted by penalty descending, so highest-risk findings
  // get the full weight and lower-risk ones are dampened.
  // Decay of 0.25 ensures that after ~10 findings, each additional finding
  // contributes less than 30% of its raw penalty.
  const DIMINISHING_DECAY = 0.25;

  for (const dim of DIMENSION_DEFINITIONS) {
    const penalties = dimensionPenalties[dim.key];

    // Sort by penalty descending so the most important findings keep full weight
    const sortedPenalties = [...penalties].sort((a, b) => b.penalty - a.penalty);
    let totalPenalty = 0;
    for (let i = 0; i < sortedPenalties.length; i++) {
      const diminishingFactor = 1 / (1 + DIMINISHING_DECAY * i);
      totalPenalty += sortedPenalties[i].penalty * diminishingFactor;
    }

    // Cap the maximum penalty at 85 points — even the worst dimension keeps
    // some score so the overall picture remains meaningful
    totalPenalty = Math.min(totalPenalty, 85);
    scores[dim.key].score = Math.max(0, Math.round((100 - totalPenalty) * 100) / 100);

    // Get top 3 contributors (highest penalty findings)
    const sorted = [...penalties]
      .sort((a, b) => b.penalty - a.penalty);
    scores[dim.key].top_contributors = sorted
      .slice(0, 3)
      .map((p) => {
        const conf = p.finding.confidence;
        const provider = p.finding.provider ? ` (${p.finding.provider})` : "";
        return `${p.finding.name}${provider} [${conf}]`;
      });
  }

  return scores;
}

/**
 * Compute overall score from dimension scores and weights.
 */
function computeOverallScore(
  dimensionScores: Record<DimensionKey, DimensionScore>,
  weights: Record<DimensionKey, number>
): number {
  let total = 0;
  for (const dim of DIMENSION_DEFINITIONS) {
    const weight = weights[dim.key] ?? DEFAULT_DIMENSION_WEIGHTS[dim.key];
    total += weight * dimensionScores[dim.key].score;
  }
  return Math.round(total * 100) / 100;
}

// ============================================================================
// LLM Enhancement
// ============================================================================

// Module-level cached dynamic imports to avoid re-importing on every call (Fix 8)
let _generateText: typeof import("ai")["generateText"] | null = null;
async function getGenerateText() {
  if (!_generateText) {
    const mod = await import("ai");
    _generateText = mod.generateText;
  }
  return _generateText;
}

let _createOpenAI: typeof import("@ai-sdk/openai")["createOpenAI"] | null = null;
async function getCreateOpenAI() {
  if (!_createOpenAI) {
    const mod = await import("@ai-sdk/openai");
    _createOpenAI = mod.createOpenAI;
  }
  return _createOpenAI;
}

let _createAnthropic: typeof import("@ai-sdk/anthropic")["createAnthropic"] | null = null;
async function getCreateAnthropic() {
  if (!_createAnthropic) {
    const mod = await import("@ai-sdk/anthropic");
    _createAnthropic = mod.createAnthropic;
  }
  return _createAnthropic;
}

// Validation sets for LLM suggested risks (Fix 7 -- hoisted to module scope)
const VALID_CATEGORIES = new Set([
  "Strategic risk", "Operational risk", "Compliance risk", "Financial risk",
  "Cybersecurity risk", "Reputational risk", "Legal risk", "Technological risk",
  "Third-party/vendor risk", "Environmental risk", "Human resources risk",
  "Geopolitical risk", "Fraud risk", "Data privacy risk", "Health and safety risk",
]);
const VALID_PHASES = new Set([
  "Problem definition & planning", "Data collection & processing",
  "Model development & training", "Model validation & testing",
  "Deployment & integration", "Monitoring & maintenance",
  "Decommissioning & retirement",
]);
const VALID_DIMENSIONS = new Set<string>(DIMENSION_DEFINITIONS.map(d => d.key));

/**
 * Build the LLM prompt from findings and dimension scores.
 */
function buildLLMPrompt(
  repositoryName: string,
  findings: FindingForScoring[],
  dimensionScores: Record<DimensionKey, DimensionScore>
): string {
  // Summary by type
  const byType: Record<string, number> = {};
  const byConfidence: Record<string, number> = {};
  const byRiskLevel: Record<string, number> = {};
  for (const f of findings) {
    byType[f.finding_type] = (byType[f.finding_type] || 0) + 1;
    byConfidence[f.confidence] = (byConfidence[f.confidence] || 0) + 1;
    byRiskLevel[f.risk_level] = (byRiskLevel[f.risk_level] || 0) + 1;
  }

  const findingsSummary = [
    `By type: ${Object.entries(byType).map(([k, v]) => `${k}=${v}`).join(", ")}`,
    `By confidence: ${Object.entries(byConfidence).map(([k, v]) => `${k}=${v}`).join(", ")}`,
    `By risk level: ${Object.entries(byRiskLevel).map(([k, v]) => `${k}=${v}`).join(", ")}`,
  ].join("\n");

  // Top 10 findings
  const topFindings = findings
    .slice(0, 10)
    .map((f, i) => {
      const provider = f.provider ? ` (provider: ${f.provider})` : "";
      const license = f.license_risk ? ` [license_risk: ${f.license_risk}]` : "";
      return `${i + 1}. [${f.finding_type}] ${f.name}${provider} - confidence: ${f.confidence}, risk: ${f.risk_level}${license}`;
    })
    .join("\n");

  // Dimension scores
  const dimScores = DIMENSION_DEFINITIONS
    .map((d) => `${d.label}: ${dimensionScores[d.key].score}/100 (${dimensionScores[d.key].penalty_count} penalties)`)
    .join("\n");

  // Vulnerability findings summary -- use the canonical VULNERABILITY_FINDING_TYPES set
  const vulnFindings = findings.filter((f) => VULNERABILITY_FINDING_TYPES_SET.has(f.finding_type));
  const vulnerabilityFindings = vulnFindings.length > 0
    ? vulnFindings
        .map((f, i) => `${i + 1}. [${f.finding_type}] ${f.name} - confidence: ${f.confidence}, risk: ${f.risk_level}`)
        .join("\n")
    : "No LLM vulnerability findings detected.";

  return LLM_RISK_SCORING_PROMPT
    .replace("{{repository_name}}", repositoryName)
    .replace("{{total_findings}}", String(findings.length))
    .replace("{{findings_summary}}", findingsSummary)
    .replace("{{top_findings}}", topFindings)
    .replace("{{vulnerability_findings}}", vulnerabilityFindings)
    .replace("{{dimension_scores}}", dimScores);
}

/**
 * Resolve the LLM key and create the appropriate SDK model instance. (Fix 7)
 * Exported so vulnerabilityAnalyzer can reuse the same provider resolution logic.
 */
export async function resolveLLMModel(
  llmKeyId: number,
  organizationId: number
): Promise<{ model: Parameters<typeof import("ai")["generateText"]>[0]["model"]; } | null> {
  const keys = await getLLMKeysWithKeyQuery(organizationId);
  const llmKey = keys.find((k: { id: number }) => k.id === llmKeyId);
  if (!llmKey || !llmKey.key) {
    logger.warn(`LLM key ${llmKeyId} not found for tenant ${organizationId}, skipping enhancement`);
    return null;
  }

  const providerName = (llmKey.name || "").toLowerCase();
  const apiKey = llmKey.key;
  let baseURL: string;

  if (providerName.includes("anthropic")) {
    baseURL = llmKey.url || "https://api.anthropic.com/v1";
  } else if (providerName.includes("openrouter")) {
    baseURL = llmKey.url || "https://openrouter.ai/api/v1/";
  } else {
    baseURL = llmKey.url || "https://api.openai.com/v1/";
  }

  if (providerName.includes("anthropic")) {
    const createAnthropic = await getCreateAnthropic();
    const anthropic = createAnthropic({ apiKey, baseURL: baseURL || undefined });
    return { model: anthropic(llmKey.model || "claude-sonnet-4-5-20250514") };
  } else {
    const createOpenAI = await getCreateOpenAI();
    const openai = createOpenAI({ apiKey, baseURL });
    return { model: openai(llmKey.model || "gpt-4") };
  }
}

/**
 * Parse and validate the LLM's JSON scoring response. (Fix 7)
 * Returns null if the response is invalid or cannot be parsed.
 */
function parseLLMScoringResponse(text: string): {
  adjustments: Record<DimensionKey, number>;
  narrative: string;
  recommendations: string[];
  correlations: string[];
  suggested_risks: SuggestedRisk[];
} | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.warn("LLM response did not contain valid JSON for risk scoring");
    return null;
  }

  // Fix 6: Validate the parsed structure before using it
  const parsed: unknown = JSON.parse(jsonMatch[0]);

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).adjustments !== "object"
  ) {
    logger.warn("LLM response JSON does not match expected structure for risk scoring");
    return null;
  }

  const response = parsed as Record<string, unknown>;

  // Validate and cap adjustments
  const adjustments: Record<DimensionKey, number> = {} as Record<DimensionKey, number>;
  const rawAdjustments = response.adjustments as Record<string, unknown>;
  for (const dim of DIMENSION_DEFINITIONS) {
    const adj = Number(rawAdjustments?.[dim.key]) || 0;
    adjustments[dim.key] = Math.max(-LLM_ADJUSTMENT_CAP, Math.min(LLM_ADJUSTMENT_CAP, adj));
  }

  // Parse and validate suggested risks
  const suggestedRisks: SuggestedRisk[] = [];
  const rawSuggestedRisks = response.suggested_risks;
  if (Array.isArray(rawSuggestedRisks)) {
    for (const raw of rawSuggestedRisks.slice(0, 5)) {
      try {
        const name = String(raw.risk_name || "").trim();
        const description = String(raw.risk_description || "").trim();
        if (name.length < 5 || name.length > 255 || !description) continue;

        const categories = Array.isArray(raw.risk_category)
          ? raw.risk_category.map(String).filter((c: string) => VALID_CATEGORIES.has(c))
          : [];
        if (categories.length === 0) continue;

        const phase = String(raw.ai_lifecycle_phase || "");
        if (!VALID_PHASES.has(phase)) continue;

        const dimension = String(raw.dimension || "");
        if (!VALID_DIMENSIONS.has(dimension)) continue;

        suggestedRisks.push({
          risk_name: name,
          risk_description: description,
          risk_category: categories,
          ai_lifecycle_phase: phase,
          likelihood: Math.max(1, Math.min(5, Math.round(Number(raw.likelihood) || 3))),
          severity: Math.max(1, Math.min(5, Math.round(Number(raw.severity) || 3))),
          impact: String(raw.impact || ""),
          mitigation_plan: String(raw.mitigation_plan || ""),
          dimension: dimension as DimensionKey,
          finding_refs: Array.isArray(raw.finding_refs) ? raw.finding_refs.map(String) : [],
        });
      } catch {
        // Skip invalid suggestion
      }
    }
  }

  const rawRecommendations = response.recommendations;
  const rawCorrelations = response.correlations;

  return {
    adjustments,
    narrative: String(response.narrative || ""),
    recommendations: Array.isArray(rawRecommendations)
      ? rawRecommendations.map(String).slice(0, 5)
      : [],
    correlations: Array.isArray(rawCorrelations)
      ? rawCorrelations.map(String).slice(0, 5)
      : [],
    suggested_risks: suggestedRisks,
  };
}

/**
 * Call the LLM for enhanced scoring.
 * Delegates to resolveLLMModel for key/SDK setup and parseLLMScoringResponse for response validation.
 */
async function enhanceWithLLM(
  repositoryName: string,
  findings: FindingForScoring[],
  dimensionScores: Record<DimensionKey, DimensionScore>,
  llmKeyId: number,
  organizationId: number
): Promise<{
  adjustments: Record<DimensionKey, number>;
  narrative: string;
  recommendations: string[];
  correlations: string[];
  suggested_risks: SuggestedRisk[];
} | null> {
  try {
    const resolved = await resolveLLMModel(llmKeyId, organizationId);
    if (!resolved) return null;

    const prompt = buildLLMPrompt(repositoryName, findings, dimensionScores);
    const generateText = await getGenerateText();

    const result = await generateText({
      model: resolved.model,
      prompt,
    });

    return parseLLMScoringResponse(result.text.trim());
  } catch (error) {
    logger.error("LLM enhancement failed for risk scoring:", error);
    return null;
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Calculate and store the risk score for a completed scan.
 * Called as fire-and-forget after scan completion.
 */
export async function calculateAndStoreRiskScore(
  scanId: number,
  repositoryName: string,
  ctx: IServiceContext
): Promise<RiskScoreResult | null> {
  try {
    logger.info(`Calculating risk score for scan ${scanId}, tenant ${ctx.organizationId}`);

    // 1. Get all findings
    const findings = await getAllFindingsForScoringQuery(scanId, ctx.organizationId);
    if (findings.length === 0) {
      // No findings = perfect score
      const details: RiskScoreDetails = {
        dimensions: {} as Record<DimensionKey, DimensionScore>,
        llm_enhanced: false,
        llm_narrative: null,
        llm_recommendations: null,
        llm_adjustments: null,
        llm_suggested_risks: null,
      };
      for (const dim of DIMENSION_DEFINITIONS) {
        details.dimensions[dim.key] = { score: 100, penalty_count: 0, top_contributors: [] };
      }
      const { grade, label } = getGradeForScore(100);
      await updateScanRiskScoreQuery(scanId, 100, grade, details as unknown as Record<string, unknown>, ctx.organizationId);
      return { score: 100, grade, label, details };
    }

    // 2. Get scoring config
    const config = await getRiskScoringConfigQuery(ctx.organizationId);
    const weights = config?.dimension_weights ?? DEFAULT_DIMENSION_WEIGHTS;

    // 3. Calculate dimension scores
    const dimensionScores = calculateDimensionScores(findings);

    // 4. Optional LLM enhancement
    let llmResult: {
      adjustments: Record<DimensionKey, number>;
      narrative: string;
      recommendations: string[];
      correlations: string[];
      suggested_risks: SuggestedRisk[];
    } | null = null;

    if (config?.llm_enabled && config.llm_key_id) {
      llmResult = await enhanceWithLLM(
        repositoryName,
        findings,
        dimensionScores,
        config.llm_key_id,
        ctx.organizationId
      );

      // Apply LLM adjustments (subtract adjustments from scores - positive adjustment = more risk = lower score)
      if (llmResult) {
        for (const dim of DIMENSION_DEFINITIONS) {
          const adj = llmResult.adjustments[dim.key] || 0;
          dimensionScores[dim.key].score = Math.max(
            0,
            Math.min(100, dimensionScores[dim.key].score - adj)
          );
        }
      }
    }

    // 5. Compute overall score
    const overallScore = computeOverallScore(dimensionScores, weights);
    const { grade, label } = getGradeForScore(overallScore);

    // 6. Build details object
    const details: RiskScoreDetails = {
      dimensions: dimensionScores,
      llm_enhanced: !!llmResult,
      llm_narrative: llmResult?.narrative ?? null,
      llm_recommendations: llmResult?.recommendations ?? null,
      llm_adjustments: llmResult?.adjustments ?? null,
      llm_suggested_risks: llmResult?.suggested_risks ?? null,
    };

    // 7. Store in database
    await updateScanRiskScoreQuery(scanId, overallScore, grade, details as unknown as Record<string, unknown>, ctx.organizationId);

    logger.info(`Risk score calculated for scan ${scanId}: ${overallScore} (${grade})`);

    return { score: overallScore, grade, label, details };
  } catch (error) {
    logger.error(`Failed to calculate risk score for scan ${scanId}:`, error);
    return null;
  }
}
