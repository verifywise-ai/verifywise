import { generateObjectWithSelfCorrection, GenerateObjectImpl } from "../../advisor/llmSelfCorrect";
import { createModelFromKey } from "../../advisor/llmModelFactory";
import { MIT_RISK_CATALOG } from "../../structures/risk-catalogs/mit";
import { IBM_RISK_CATALOG } from "../../structures/risk-catalogs/ibm";
import { RiskCatalogEntry } from "../../structures/risk-catalogs/types";
import logger from "../../utils/logger/fileLogger";
import { PROJECT_RISK_CATEGORIES_SET } from "../../utils/risk.utils";
import { AI_LIFECYCLE_PHASE_ENUM } from "../../utils/validations/riskValidation.utils";
import { VENDOR_SUGGESTION_SUPPRESS_THRESHOLD } from "../vendors/riskSuggestions";
import { rankCatalogCandidates } from "./candidates";
import { buildRiskSuggestionSystemPrompt, buildRiskSuggestionUserPrompt } from "./prompts";
import { RiskSuggestionOutput, riskSuggestionOutputSchema } from "./schema";

/**
 * Suggest risks for a use case from the built-in MIT and IBM risk catalogs
 * plus free-form model output.
 *
 * Read-only: derives a suggestion set and writes nothing. The controller
 * (Step 2) resolves the org's LLM key into `model` and passes existing risk
 * names for dedup; this service never touches llmKey.utils or the database.
 */

/** Wall-clock bound for one suggestion pass, mirroring DIRECTION_LLM_TIMEOUT_MS. */
export const RISK_SUGGESTION_LLM_TIMEOUT_MS = 120_000;

const AI_LIFECYCLE_PHASE_SET: Set<string> = new Set(AI_LIFECYCLE_PHASE_ENUM);

/**
 * Catalog category strings that do not match PROJECT_RISK_CATEGORIES
 * verbatim. MIT's vocabulary is exactly the enum; IBM's is not. `null` means
 * no enum equivalent exists — the category is dropped from the entry's
 * normalized list. The catalog-integrity test asserts every distinct category
 * string in both catalogs is either an enum member or listed here, so adding
 * a catalog entry without updating this map fails CI.
 */
export const CATALOG_CATEGORY_NORMALIZATION: Record<string, string | null> = {
  "Third-party or vendor risk": "Third-party/vendor risk",
  "Safety risk": "Health and safety risk",
  "Societal risk": null,
  "Educational risk": null,
};

/** Typed failure for the whole pass; the controller maps it to a 502. */
export class RiskSuggestionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    // `super(message, options)` needs ES2022; this package targets ES6, so the
    // cause is assigned by hand.
    super(message);
    this.name = "RiskSuggestionError";
    if (options && "cause" in options) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export interface UseCaseInput {
  name: string;
  purpose?: string;
  technology?: string;
}

export interface MatchedCatalogRisk {
  source: "mit" | "ibm";
  id: number;
  summary: string;
  description: string;
  /** Normalized onto PROJECT_RISK_CATEGORIES; unmappable catalog categories dropped. */
  risk_category: string[];
  /** Catalog strings, verbatim — NOT necessarily the likelihood/severity enums. */
  likelihood: string;
  severity: string;
  /** The model's reason, sanitized; the only model-authored text kept. */
  reason: string;
  ai_lifecycle_phase?: string;
}

export interface SuggestedRisk {
  risk_name: string;
  risk_description: string;
  /** Filtered to PROJECT_RISK_CATEGORIES; may be empty — the frontend defaults. */
  risk_category: string[];
  ai_lifecycle_phase?: string;
  /** 1-5 integer scale, clamped. */
  likelihood: number;
  severity: number;
  impact: string;
  mitigation_plan: string;
}

export interface RiskSuggestionResult {
  matched: MatchedCatalogRisk[];
  suggested: SuggestedRisk[];
  suppressed_count: number;
}

/**
 * The same normalization as direction.service's sanitizeDirectionReason,
 * generalized past the 120-char reason bound: collapse line breaks and strip
 * control characters so model text cannot smuggle multi-line content into
 * stored or rendered fields. Length is already bounded by the Zod schema;
 * the slice is defense in depth.
 */
const sanitizeLlmText = (text: string, maxChars: number): string =>
  text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
    .slice(0, maxChars);

const clamp1to5 = (value: number): number => Math.min(5, Math.max(1, Math.round(value)));

/**
 * Map a catalog entry's categories onto PROJECT_RISK_CATEGORIES. Verbatim
 * enum members pass through; mapped entries are rewritten; anything else
 * (including explicit `null` mappings) is dropped. Deduped — an entry tagged
 * with both "Safety risk" and "Health and safety risk" collapses to one.
 */
export function normalizeCatalogCategories(categories: string[]): string[] {
  const normalized = new Set<string>();
  for (const category of categories) {
    if (PROJECT_RISK_CATEGORIES_SET.has(category)) {
      normalized.add(category);
      continue;
    }
    const mapped = CATALOG_CATEGORY_NORMALIZATION[category];
    if (mapped) normalized.add(mapped);
  }
  return [...normalized];
}

/**
 * Lowercase, strip everything but [a-z0-9 ], split, drop tokens of length <= 2.
 * Identical to the tokenise in vendors/riskSuggestions.ts so the suppression
 * threshold below means the same thing in both features.
 */
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

/** True when `name` is a near-duplicate of an existing risk name. */
const isSuppressed = (name: string, existingTokenSets: Set<string>[]): boolean => {
  const tokens = tokenise(name);
  return existingTokenSets.some(
    (existing) => jaccard(tokens, existing) >= VENDOR_SUGGESTION_SUPPRESS_THRESHOLD,
  );
};

const CATALOGS: Record<"mit" | "ibm", Map<number, RiskCatalogEntry>> = {
  mit: new Map(MIT_RISK_CATALOG.map((entry) => [entry.id, entry])),
  ibm: new Map(IBM_RISK_CATALOG.map((entry) => [entry.id, entry])),
};

/**
 * Turn the model's matched ids into hydrated catalog rows. Rule 1 of the
 * direction filter applies here too: an id the model was never shown — or one
 * it invented — is dropped, and every catalog field comes from OUR data, not
 * the answer. Repeated ids keep their first occurrence.
 */
export function hydrateMatched(matched: RiskSuggestionOutput["matched"]): MatchedCatalogRisk[] {
  const seen = new Set<string>();
  const hydrated: MatchedCatalogRisk[] = [];

  for (const match of matched) {
    const key = `${match.source}:${match.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const entry = CATALOGS[match.source].get(match.id);
    if (!entry) continue;

    const result: MatchedCatalogRisk = {
      source: match.source,
      id: entry.id,
      summary: entry.summary,
      description: entry.description,
      risk_category: normalizeCatalogCategories(entry.riskCategories),
      likelihood: entry.likelihood,
      severity: entry.riskSeverity,
      reason: sanitizeLlmText(match.reason, 300),
    };
    if (match.ai_lifecycle_phase && AI_LIFECYCLE_PHASE_SET.has(match.ai_lifecycle_phase)) {
      result.ai_lifecycle_phase = match.ai_lifecycle_phase;
    }
    hydrated.push(result);
  }

  return hydrated;
}

/** Sanitize, enum-filter and clamp one model-proposed risk. */
export function processSuggested(suggested: RiskSuggestionOutput["suggested"]): SuggestedRisk[] {
  const processed: SuggestedRisk[] = [];

  for (const risk of suggested) {
    const risk_name = sanitizeLlmText(risk.risk_name, 200);
    if (!risk_name) continue;

    const result: SuggestedRisk = {
      risk_name,
      risk_description: sanitizeLlmText(risk.risk_description, 1000),
      risk_category: [
        ...new Set(risk.risk_category.filter((c) => PROJECT_RISK_CATEGORIES_SET.has(c))),
      ],
      likelihood: clamp1to5(risk.likelihood),
      severity: clamp1to5(risk.severity),
      impact: sanitizeLlmText(risk.impact, 1000),
      mitigation_plan: sanitizeLlmText(risk.mitigation_plan, 1000),
    };
    if (AI_LIFECYCLE_PHASE_SET.has(risk.ai_lifecycle_phase)) {
      result.ai_lifecycle_phase = risk.ai_lifecycle_phase;
    }
    processed.push(result);
  }

  return processed;
}

export async function suggestRisksForUseCase(params: {
  /** AI SDK model from createModelFromKey; the controller resolves the key. */
  model: ReturnType<typeof createModelFromKey>;
  useCase: UseCaseInput;
  /** Names of risks the project already has, for dedup. */
  existingRiskNames: string[];
  /** Test seam forwarded to generateObjectWithSelfCorrection. */
  generateImpl?: GenerateObjectImpl;
}): Promise<RiskSuggestionResult> {
  const { model, useCase, existingRiskNames, generateImpl } = params;

  const useCaseText = [useCase.name, useCase.purpose, useCase.technology].filter(Boolean).join(" ");
  const mitCandidates = rankCatalogCandidates(MIT_RISK_CATALOG, useCaseText);

  let output: RiskSuggestionOutput;
  try {
    const result = await generateObjectWithSelfCorrection(
      {
        model,
        schema: riskSuggestionOutputSchema,
        system: buildRiskSuggestionSystemPrompt(),
        prompt: buildRiskSuggestionUserPrompt({
          useCase,
          mitCandidates,
          ibmCandidates: IBM_RISK_CATALOG,
          existingRiskNames,
        }),
        temperature: 0,
        innerMaxRetries: 2,
        maxSelfCorrectionAttempts: 2,
        timeoutMs: RISK_SUGGESTION_LLM_TIMEOUT_MS,
      },
      generateImpl,
    );
    output = result.object;
  } catch (error) {
    // The message only — never the prompt, the raw completion, or the key.
    logger.warn(
      `risk suggestions: model call failed for use case "${sanitizeLlmText(useCase.name, 100)}": ${(error as Error).message}`,
    );
    throw new RiskSuggestionError("Risk suggestion generation failed", { cause: error });
  }

  // Suppression runs on the same Jaccard name-overlap as vendor risk
  // suggestions: matched entries by summary, suggested risks by name.
  const existingTokenSets = existingRiskNames.map((name) => tokenise(name));
  let suppressed = 0;

  const matched: MatchedCatalogRisk[] = [];
  for (const match of hydrateMatched(output.matched)) {
    if (isSuppressed(match.summary, existingTokenSets)) {
      suppressed += 1;
      continue;
    }
    matched.push(match);
  }

  const suggested: SuggestedRisk[] = [];
  for (const risk of processSuggested(output.suggested)) {
    if (isSuppressed(risk.risk_name, existingTokenSets)) {
      suppressed += 1;
      continue;
    }
    suggested.push(risk);
  }

  logger.info(
    `risk suggestions: use case "${sanitizeLlmText(useCase.name, 100)}" — ` +
      `${matched.length} catalog matches, ${suggested.length} suggested, ${suppressed} suppressed`,
  );

  return { matched, suggested, suppressed_count: suppressed };
}
