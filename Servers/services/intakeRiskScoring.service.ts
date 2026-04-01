import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { getLLMKeysWithKeyQuery } from "../utils/llmKey.utils";
import logger from "../utils/logger/fileLogger";

// ============================================================================
// TYPES
// ============================================================================

export interface RiskDimension {
  key: string;
  label: string;
  weight: number;
  score: number;
  signals: string[];
}

export interface RiskResult {
  dimensions: RiskDimension[];
  overallScore: number;
  tier: string;
  tierSystem: string;
  llmEnhanced: boolean;
}

export interface RiskOverride {
  tier: string;
  dimensionOverrides: Record<string, number>;
  justification: string;
  overriddenBy: number;
  overriddenAt: string;
}

interface FormField {
  id: string;
  type: string;
  label: string;
  entityFieldMapping?: string;
  options?: Array<{ value: string; label: string }>;
}

interface FormSchema {
  version: string;
  fields: FormField[];
}

// ============================================================================
// DIMENSION CONFIGS
// ============================================================================

const DIMENSION_CONFIGS = [
  {
    key: "data_sensitivity",
    label: "Data sensitivity",
    weight: 0.20,
    keywords: {
      high: ["biometric", "health", "medical", "genetic", "racial", "ethnic", "political", "sexual", "criminal", "social security", "ssn", "passport"],
      medium: ["personal", "pii", "email", "address", "name", "phone", "location", "financial", "salary", "income"],
      low: ["anonymous", "aggregated", "public", "synthetic", "no personal data", "non-personal"],
    },
    fieldMappings: ["personal_data_type", "data_type", "data_sensitivity"],
  },
  {
    key: "autonomy_level",
    label: "Autonomy level",
    weight: 0.20,
    keywords: {
      high: ["autonomous", "automated decision", "no human", "self-driving", "auto-approve", "fully automated", "replaces human"],
      medium: ["semi-autonomous", "recommendation", "suggests", "assists", "human approval", "human review"],
      low: ["human-controlled", "tool", "advisory", "manual override", "human decides", "support only"],
    },
    fieldMappings: ["autonomy_level", "decision_making", "autonomous"],
  },
  {
    key: "impact_scope",
    label: "Impact scope",
    weight: 0.15,
    keywords: {
      high: ["enterprise", "organization-wide", "all users", "public-facing", "millions", "thousands", "critical infrastructure", "national"],
      medium: ["department", "team", "hundreds", "regional", "business unit"],
      low: ["individual", "single user", "internal", "pilot", "prototype", "poc", "few users"],
    },
    fieldMappings: ["user_count", "geographic_scope", "impact_scope"],
  },
  {
    key: "transparency",
    label: "Transparency",
    weight: 0.15,
    keywords: {
      high: ["black box", "unexplainable", "opaque", "proprietary model", "no documentation", "cannot explain"],
      medium: ["partially explainable", "some documentation", "limited transparency"],
      low: ["explainable", "interpretable", "documented", "transparent", "white box", "open source", "full documentation"],
    },
    fieldMappings: ["explainability", "transparency", "model_transparency"],
  },
  {
    key: "human_oversight",
    label: "Human oversight",
    weight: 0.15,
    keywords: {
      high: ["no oversight", "no review", "unsupervised", "no monitoring", "no human check"],
      medium: ["periodic review", "spot checks", "some oversight", "quarterly review"],
      low: ["continuous monitoring", "human-in-the-loop", "real-time review", "always supervised", "human approval required"],
    },
    fieldMappings: ["human_oversight", "human_in_the_loop", "oversight_level"],
  },
  {
    key: "domain_criticality",
    label: "Domain criticality",
    weight: 0.15,
    keywords: {
      high: ["healthcare", "medical", "legal", "judicial", "law enforcement", "military", "defense", "financial services", "banking", "insurance", "education", "hiring", "recruitment", "immigration", "border", "critical infrastructure", "energy", "transportation"],
      medium: ["marketing", "sales", "customer service", "manufacturing", "logistics", "agriculture"],
      low: ["entertainment", "gaming", "social media", "internal tools", "content generation", "research", "testing"],
    },
    fieldMappings: ["domain", "industry", "sector", "use_case_domain"],
  },
];

// ============================================================================
// TIER THRESHOLDS
// ============================================================================

const TIER_THRESHOLDS: Record<string, Array<{ max: number; tier: string }>> = {
  eu_ai_act: [
    { max: 25, tier: "Minimal" },
    { max: 50, tier: "Limited" },
    { max: 75, tier: "High" },
    { max: 100, tier: "Unacceptable" },
  ],
};

// ============================================================================
// RULE-BASED SCORING
// ============================================================================

function scoreDimension(
  config: typeof DIMENSION_CONFIGS[0],
  submissionData: Record<string, unknown>,
  schema: FormSchema
): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 50; // Default neutral

  // Collect all text from submission fields
  const allText: string[] = [];
  const mappedFieldValues: string[] = [];

  for (const field of schema.fields) {
    const value = submissionData[field.id];
    if (value === undefined || value === null) continue;

    const textValue = Array.isArray(value) ? value.join(" ") : String(value);
    allText.push(textValue.toLowerCase());

    // Check if this field is mapped to a relevant entity field
    const fieldMapping = field.entityFieldMapping?.toLowerCase() || "";
    if (config.fieldMappings.some(m => fieldMapping.includes(m))) {
      mappedFieldValues.push(textValue.toLowerCase());
    }
  }

  const combinedText = [...mappedFieldValues, ...allText].join(" ");

  // Score based on keyword matching
  let highMatches = 0;
  let mediumMatches = 0;
  let lowMatches = 0;

  for (const keyword of config.keywords.high) {
    if (combinedText.includes(keyword.toLowerCase())) {
      highMatches++;
      signals.push(`High-risk signal: "${keyword}"`);
    }
  }

  for (const keyword of config.keywords.medium) {
    if (combinedText.includes(keyword.toLowerCase())) {
      mediumMatches++;
    }
  }

  for (const keyword of config.keywords.low) {
    if (combinedText.includes(keyword.toLowerCase())) {
      lowMatches++;
      signals.push(`Low-risk signal: "${keyword}"`);
    }
  }

  // Calculate score based on match distribution
  if (highMatches > 0 && lowMatches === 0) {
    score = 70 + Math.min(highMatches * 5, 30);
  } else if (highMatches > 0 && lowMatches > 0) {
    score = 50 + (highMatches - lowMatches) * 10;
  } else if (mediumMatches > 0 && lowMatches === 0) {
    score = 40 + Math.min(mediumMatches * 5, 20);
  } else if (lowMatches > 0 && highMatches === 0) {
    score = 10 + Math.max(20 - lowMatches * 5, 0);
  }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  return { score, signals };
}

export function scoreSubmissionRuleBased(
  submissionData: Record<string, unknown>,
  schema: FormSchema
): RiskDimension[] {
  return DIMENSION_CONFIGS.map(config => {
    const { score, signals } = scoreDimension(config, submissionData, schema);
    return {
      key: config.key,
      label: config.label,
      weight: config.weight,
      score,
      signals,
    };
  });
}

// ============================================================================
// LLM ENHANCEMENT
// ============================================================================

export async function enhanceWithLLM(
  dimensions: RiskDimension[],
  submissionData: Record<string, unknown>,
  schema: FormSchema,
  llmKeyId: number,
  organizationId: number
): Promise<RiskDimension[]> {
  try {
    const keys = await getLLMKeysWithKeyQuery(organizationId);
    const llmKey = keys.find((k: any) => k.id === llmKeyId);

    if (!llmKey) {
      logger.warn(`LLM key ${llmKeyId} not found for organization ${organizationId}`);
      return dimensions;
    }

    // Build context from submission
    const fieldSummary = schema.fields
      .filter(f => submissionData[f.id] !== undefined)
      .map(f => `${f.label}: ${JSON.stringify(submissionData[f.id])}`)
      .join("\n");

    const dimensionSummary = dimensions
      .map(d => `${d.label}: ${d.score}/100 (signals: ${d.signals.join(", ") || "none"})`)
      .join("\n");

    const prompt = `You are an AI risk assessment analyst. Analyze this AI use case submission and refine the risk scores.

## Submission data
${fieldSummary}

## Current rule-based scores (0-100, higher = riskier)
${dimensionSummary}

## Instructions
For each dimension, provide a refined score adjustment (-15 to +15). Respond ONLY with valid JSON:
{
  "adjustments": {
    "data_sensitivity": 0,
    "autonomy_level": 0,
    "impact_scope": 0,
    "transparency": 0,
    "human_oversight": 0,
    "domain_criticality": 0
  },
  "reasoning": "Brief explanation"
}`;

    // Create model based on key config
    let model;
    const keyName = (llmKey as any).name?.toLowerCase() || "";
    if (keyName.includes("anthropic") || keyName.includes("claude")) {
      const anthropic = createAnthropic({
        apiKey: (llmKey as any).key,
        baseURL: (llmKey as any).url || undefined,
      });
      model = anthropic((llmKey as any).model || "claude-sonnet-4-20250514");
    } else {
      const openai = createOpenAI({
        apiKey: (llmKey as any).key,
        baseURL: (llmKey as any).url || undefined,
      });
      model = openai((llmKey as any).model || "gpt-4o-mini");
    }

    const result = await generateText({
      model,
      prompt,
      maxOutputTokens: 500,
    });

    // Parse response
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return dimensions;

    const parsed = JSON.parse(jsonMatch[0]);
    const adjustments = parsed.adjustments;

    if (!adjustments || typeof adjustments !== "object") return dimensions;

    // Apply adjustments with ±15 cap
    return dimensions.map(dim => {
      const adj = adjustments[dim.key];
      if (typeof adj !== "number") return dim;

      const clampedAdj = Math.max(-15, Math.min(15, adj));
      const newScore = Math.max(0, Math.min(100, dim.score + clampedAdj));

      return {
        ...dim,
        score: newScore,
        signals: clampedAdj !== 0
          ? [...dim.signals, `LLM adjustment: ${clampedAdj > 0 ? "+" : ""}${clampedAdj}`]
          : dim.signals,
      };
    });
  } catch (error) {
    logger.error("LLM risk enhancement failed (returning rule-based scores):", error);
    return dimensions;
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

function getTierFromScore(score: number, tierSystem: string): string {
  const thresholds = TIER_THRESHOLDS[tierSystem] || TIER_THRESHOLDS.eu_ai_act;
  for (const threshold of thresholds) {
    if (score <= threshold.max) return threshold.tier;
  }
  return thresholds[thresholds.length - 1].tier;
}

export async function calculateSubmissionRisk(
  submissionData: Record<string, unknown>,
  schema: FormSchema,
  tierSystem: string = "eu_ai_act",
  llmKeyId?: number | null,
  organizationId?: number
): Promise<RiskResult> {
  // Step 1: Rule-based scoring
  let dimensions = scoreSubmissionRuleBased(submissionData, schema);

  let llmEnhanced = false;

  // Step 2: LLM enhancement (optional, non-blocking)
  if (llmKeyId && organizationId) {
    try {
      dimensions = await enhanceWithLLM(dimensions, submissionData, schema, llmKeyId, organizationId);
      llmEnhanced = true;
    } catch (error) {
      logger.error("LLM enhancement failed, using rule-based scores:", error);
    }
  }

  // Step 3: Calculate weighted average
  const overallScore = Math.round(
    dimensions.reduce((sum, d) => sum + d.score * d.weight, 0)
  );

  // Step 4: Determine tier
  const tier = getTierFromScore(overallScore, tierSystem);

  return {
    dimensions,
    overallScore,
    tier,
    tierSystem,
    llmEnhanced,
  };
}
