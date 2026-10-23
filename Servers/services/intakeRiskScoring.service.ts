import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { getLLMKeysWithKeyQuery } from "../utils/llmKey.utils";
import logger from "../utils/logger/fileLogger";
import { isEmptyAnswer } from "./intakeFormLogic";

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
  riskDimension?: string;
}

export interface FormSchema {
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
    weight: 0.2,
    keywords: {
      high: [
        "biometric",
        "health",
        "medical",
        "telehealth",
        "telemedicine",
        "biomedical",
        "genetic",
        "racial",
        "ethnic",
        "political",
        "sexual",
        "criminal",
        "social security",
        "ssn",
        "passport",
      ],
      medium: [
        "personal",
        "pii",
        "email",
        "address",
        "name",
        "phone",
        "location",
        "financial",
        "salary",
        "income",
      ],
      low: ["anonymous", "aggregated", "public", "synthetic", "no personal data", "non-personal"],
    },
  },
  {
    key: "autonomy_level",
    label: "Autonomy level",
    weight: 0.2,
    keywords: {
      high: [
        "autonomous",
        "automated decision",
        "no human",
        "self-driving",
        "auto-approve",
        "fully automated",
        "replaces human",
      ],
      medium: [
        "semi-autonomous",
        "recommendation",
        "suggests",
        "assists",
        "human approval",
        "human review",
      ],
      low: [
        "human-controlled",
        "tool",
        "advisory",
        "manual override",
        "human decides",
        "support only",
      ],
    },
  },
  {
    key: "impact_scope",
    label: "Impact scope",
    weight: 0.15,
    keywords: {
      high: [
        "enterprise",
        "organization-wide",
        "all users",
        "public-facing",
        "millions",
        "thousands",
        "critical infrastructure",
        "national",
      ],
      medium: ["department", "team", "hundreds", "regional", "business unit"],
      low: ["individual", "single user", "internal", "pilot", "prototype", "poc", "few users"],
    },
  },
  {
    key: "transparency",
    label: "Transparency",
    weight: 0.15,
    keywords: {
      high: [
        "black box",
        "unexplainable",
        "opaque",
        "proprietary model",
        "no documentation",
        "cannot explain",
      ],
      medium: ["partially explainable", "some documentation", "limited transparency"],
      low: [
        "explainable",
        "interpretable",
        "documented",
        "transparent",
        "white box",
        "open source",
        "full documentation",
      ],
    },
  },
  {
    key: "human_oversight",
    label: "Human oversight",
    weight: 0.15,
    keywords: {
      high: ["no oversight", "no review", "unsupervised", "no monitoring", "no human check"],
      medium: ["periodic review", "spot checks", "some oversight", "quarterly review"],
      low: [
        "continuous monitoring",
        "human-in-the-loop",
        "real-time review",
        "always supervised",
        "human approval required",
      ],
    },
  },
  {
    key: "domain_criticality",
    label: "Domain criticality",
    weight: 0.15,
    keywords: {
      high: [
        "healthcare",
        "medical",
        "telehealth",
        "telemedicine",
        "biomedical",
        "legal",
        "judicial",
        "law enforcement",
        "military",
        "defense",
        "financial services",
        "banking",
        "insurance",
        "education",
        "hiring",
        "recruitment",
        "immigration",
        "border",
        "critical infrastructure",
        "energy",
        "transportation",
      ],
      medium: [
        "marketing",
        "sales",
        "customer service",
        "manufacturing",
        "logistics",
        "agriculture",
      ],
      low: [
        "entertainment",
        "gaming",
        "social media",
        "internal tools",
        "content generation",
        "research",
        "testing",
      ],
    },
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

interface ScoringAnswer {
  label: string;
  text: string;
  riskDimension?: string;
}

/** A select option's label for a stored value; the value itself when unknown. */
function optionLabelOf(field: FormSchema["fields"][number], value: unknown): string {
  return field.options?.find((option) => option.value === value)?.label ?? String(value);
}

/**
 * The scorable text of one answered field (see answersForScoring). Shared with
 * the AI scoring input so both read select answers the same way.
 */
export function answerTextOf(field: FormSchema["fields"][number], value: unknown): string {
  const optionLabel = (v: unknown) => optionLabelOf(field, v);
  switch (field.type) {
    case "text":
    case "textarea":
    case "email":
    case "url":
      return typeof value === "string" ? value : "";
    case "select":
      return optionLabel(value);
    case "multiselect":
      return Array.isArray(value) ? value.map(optionLabel).join(", ") : "";
    case "checkbox":
      return value === true ? field.label : "";
    default:
      return "";
  }
}

/**
 * The text each answer contributes to keyword scoring. Selects contribute
 * their option labels (stored values default to "option1", "option2", ...),
 * a checked checkbox contributes its field label, and number, date and
 * calculated values contribute nothing.
 */
export function answersForScoring(
  submissionData: Record<string, unknown>,
  schema: FormSchema,
): ScoringAnswer[] {
  const answers: ScoringAnswer[] = [];
  for (const field of schema.fields) {
    const value = submissionData[field.id];
    // Same notion of blank as the show/hide rules: whitespace and [] are not answers.
    if (isEmptyAnswer(value)) continue;
    const text = answerTextOf(field, value);
    // Every answered field is listed, even with no scorable text. One with no
    // text (an unchecked checkbox) matches no keyword, so if it is a
    // dimension's only tagged answer, that dimension falls back to all answers.
    answers.push({ label: field.label, text, riskDimension: field.riskDimension });
  }
  return answers;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Keywords match at the start of a word, so plurals and compounds count
 * ("biometrics", "healthcare"), but a keyword inside a word does not
 * ("name" in "renamed"). Compiled once per keyword.
 */
const KEYWORD_PATTERNS = new Map<string, RegExp>();
const keywordPattern = (keyword: string): RegExp => {
  let pattern = KEYWORD_PATTERNS.get(keyword);
  if (!pattern) {
    pattern = new RegExp(`\\b${escapeRegExp(keyword.toLowerCase())}`, "i");
    KEYWORD_PATTERNS.set(keyword, pattern);
  }
  return pattern;
};

interface KeywordMatches {
  highMatches: number;
  mediumMatches: number;
  lowMatches: number;
  signals: string[];
}

function matchKeywords(
  config: (typeof DIMENSION_CONFIGS)[0],
  pool: ScoringAnswer[],
): KeywordMatches {
  const firstMatch = (keyword: string) => {
    const pattern = keywordPattern(keyword);
    return pool.find((answer) => pattern.test(answer.text));
  };
  const result: KeywordMatches = { highMatches: 0, mediumMatches: 0, lowMatches: 0, signals: [] };
  for (const keyword of config.keywords.high) {
    const hit = firstMatch(keyword);
    if (hit) {
      result.highMatches++;
      result.signals.push(`High-risk signal: "${keyword}" (${hit.label})`);
    }
  }
  for (const keyword of config.keywords.medium) {
    if (firstMatch(keyword)) result.mediumMatches++;
  }
  for (const keyword of config.keywords.low) {
    const hit = firstMatch(keyword);
    if (hit) {
      result.lowMatches++;
      result.signals.push(`Low-risk signal: "${keyword}" (${hit.label})`);
    }
  }
  return result;
}

function scoreDimension(
  config: (typeof DIMENSION_CONFIGS)[0],
  answers: ScoringAnswer[],
): { score: number; signals: string[] } {
  // Tagged answers decide the dimension when they match any keyword; when
  // nothing is tagged, or the tagged answers match nothing, every answer counts.
  const tagged = answers.filter((answer) => answer.riskDimension === config.key);
  const taggedMatches = tagged.length > 0 ? matchKeywords(config, tagged) : null;
  const usesTagged =
    taggedMatches !== null &&
    taggedMatches.highMatches + taggedMatches.mediumMatches + taggedMatches.lowMatches > 0;
  const matches = usesTagged ? taggedMatches! : matchKeywords(config, answers);
  let { score } = scoreFromMatches(matches);
  let signals = matches.signals;

  // Tags refine a score but never hide risk found elsewhere: high-risk keywords
  // in the untagged answers keep the dimension at least where those keywords
  // alone would put it. The tagged answers' own keywords are already scored
  // above, so tagging a field never changes that field's own score.
  const otherMatches = usesTagged
    ? matchKeywords(
        config,
        answers.filter((answer) => answer.riskDimension !== config.key),
      )
    : null;
  if (otherMatches && otherMatches.highMatches > 0) {
    const floor = scoreFromMatches({ ...otherMatches, mediumMatches: 0, lowMatches: 0 }).score;
    if (score < floor) {
      score = floor;
      const highSignals = otherMatches.signals.filter((signal) => signal.startsWith("High-risk"));
      signals = [...new Set([...highSignals, ...signals])];
    }
  }

  return { score, signals };
}

function scoreFromMatches(matches: KeywordMatches): { score: number } {
  const { highMatches, mediumMatches, lowMatches } = matches;
  let score = 50; // Default neutral
  if (highMatches > 0 && lowMatches === 0) {
    score = 70 + Math.min(highMatches * 5, 30);
  } else if (highMatches > 0 && lowMatches > 0) {
    score = 50 + (highMatches - lowMatches) * 10;
  } else if (mediumMatches > 0 && lowMatches === 0) {
    score = 40 + Math.min(mediumMatches * 5, 20);
  } else if (lowMatches > 0 && highMatches === 0) {
    score = 10 + Math.max(20 - lowMatches * 5, 0);
  }
  return { score: Math.max(0, Math.min(100, score)) };
}

export function scoreSubmissionRuleBased(
  submissionData: Record<string, unknown>,
  schema: FormSchema,
): RiskDimension[] {
  const answers = answersForScoring(submissionData, schema);
  return DIMENSION_CONFIGS.map((config) => {
    const { score, signals } = scoreDimension(config, answers);
    return { key: config.key, label: config.label, weight: config.weight, score, signals };
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
  organizationId: number,
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
      // A calculated field stored as null had no result; leave it out.
      .filter((f) => submissionData[f.id] !== undefined && submissionData[f.id] !== null)
      // Selects show their option labels, as keyword scoring reads them.
      .map((f) => {
        const value = submissionData[f.id];
        const shown =
          f.type === "select"
            ? optionLabelOf(f, value)
            : f.type === "multiselect" && Array.isArray(value)
              ? value.map((v) => optionLabelOf(f, v))
              : value;
        return `${f.label}: ${JSON.stringify(shown)}`;
      })
      .join("\n");

    const dimensionSummary = dimensions
      .map((d) => `${d.label}: ${d.score}/100 (signals: ${d.signals.join(", ") || "none"})`)
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
      const customBaseURL = (llmKey as any).url || undefined;
      const openai = createOpenAI({
        apiKey: (llmKey as any).key,
        baseURL: customBaseURL,
      });
      const modelId = (llmKey as any).model || "gpt-4o-mini";
      // Only native OpenAI implements the Responses API. Any custom baseURL
      // (OpenRouter, vLLM, Together, etc.) must use Chat Completions.
      model = customBaseURL ? openai.chat(modelId) : openai(modelId);
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
    return dimensions.map((dim) => {
      const adj = adjustments[dim.key];
      if (typeof adj !== "number") return dim;

      const clampedAdj = Math.max(-15, Math.min(15, adj));
      const newScore = Math.max(0, Math.min(100, dim.score + clampedAdj));

      return {
        ...dim,
        score: newScore,
        signals:
          clampedAdj !== 0
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
  organizationId?: number,
): Promise<RiskResult> {
  // Step 1: Rule-based scoring
  let dimensions = scoreSubmissionRuleBased(submissionData, schema);

  let llmEnhanced = false;

  // Step 2: LLM enhancement (optional, non-blocking)
  if (llmKeyId && organizationId) {
    try {
      dimensions = await enhanceWithLLM(
        dimensions,
        submissionData,
        schema,
        llmKeyId,
        organizationId,
      );
      llmEnhanced = true;
    } catch (error) {
      logger.error("LLM enhancement failed, using rule-based scores:", error);
    }
  }

  // Step 3: Calculate weighted average
  const overallScore = Math.round(dimensions.reduce((sum, d) => sum + d.score * d.weight, 0));

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
