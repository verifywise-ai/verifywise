import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { getLLMKeysWithKeyQuery } from "../utils/llmKey.utils";
import logger from "../utils/logger/fileLogger";

// ============================================================================
// TYPES
// ============================================================================

export interface SuggestedQuestion {
  label: string;
  fieldType: "text" | "textarea" | "select";
  category: string;
  entityFieldMapping?: string;
  guidanceText?: string;
  options?: Array<{ value: string; label: string }>;
}

// ============================================================================
// HELPERS
// ============================================================================

async function getModelFromKey(llmKeyId: number, organizationId: number) {
  const keys = await getLLMKeysWithKeyQuery(organizationId);
  const llmKey = keys.find((k: any) => k.id === llmKeyId);

  if (!llmKey) return null;

  const keyName = ((llmKey as any).name || "").toLowerCase();
  if (keyName.includes("anthropic") || keyName.includes("claude")) {
    const anthropic = createAnthropic({
      apiKey: (llmKey as any).key,
      baseURL: (llmKey as any).url || undefined,
    });
    return anthropic((llmKey as any).model || "claude-sonnet-4-20250514");
  }

  const openai = createOpenAI({
    apiKey: (llmKey as any).key,
    baseURL: (llmKey as any).url || undefined,
  });
  return openai((llmKey as any).model || "gpt-4o-mini");
}

// ============================================================================
// SUGGESTED QUESTIONS (LLM-GENERATED)
// ============================================================================

export async function generateSuggestedQuestions(
  entityType: string,
  context: string,
  llmKeyId: number,
  organizationId: number
): Promise<SuggestedQuestion[] | null> {
  try {
    const model = await getModelFromKey(llmKeyId, organizationId);
    if (!model) return null;

    const prompt = `You are an AI governance expert. Generate 5 additional intake form questions for a "${entityType}" entity type.

Context about the form: ${context || "General AI use case intake form"}

Return ONLY valid JSON array. Each question should help assess AI governance risk:
[
  {
    "label": "Question text",
    "fieldType": "text" | "textarea" | "select",
    "category": "Risks" | "Compliance" | "Operations" | "Vendors" | "Models",
    "guidanceText": "Why this question matters for AI governance",
    "options": [{"value": "opt1", "label": "Option 1"}]  // only for select type
  }
]`;

    const result = await generateText({
      model,
      prompt,
      maxOutputTokens: 1000,
      abortSignal: AbortSignal.timeout(30_000),
    });

    const jsonMatch = result.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]) as SuggestedQuestion[];
  } catch (error) {
    logger.error("Failed to generate suggested questions:", error);
    return null;
  }
}

// ============================================================================
// FIELD GUIDANCE TEXT
// ============================================================================

export async function generateFieldGuidance(
  fieldLabel: string,
  entityType: string,
  llmKeyId: number,
  organizationId: number
): Promise<string | null> {
  try {
    const model = await getModelFromKey(llmKeyId, organizationId);
    if (!model) return null;

    const prompt = `You are an AI governance expert. Write a brief guidance text (1-2 sentences, max 150 characters) explaining why this field matters for AI governance compliance.

Field: "${fieldLabel}"
Entity type: ${entityType}

Return ONLY the guidance text, no quotes or formatting.`;

    const result = await generateText({
      model,
      prompt,
      maxOutputTokens: 100,
      abortSignal: AbortSignal.timeout(15_000),
    });

    return result.text.trim();
  } catch (error) {
    logger.error("Failed to generate field guidance:", error);
    return null;
  }
}
