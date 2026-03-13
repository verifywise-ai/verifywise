import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { getLLMKeysWithKeyQuery } from "../utils/llmKey.utils";
import { sequelize } from "../database/db";

// ============================================================================
// TYPES
// ============================================================================

export interface TaxonomyGenerationInput {
  industry: string;
  use_case: string;
  ai_system_type?: string;
  lifecycle_phase?: string;
  project_description?: string;
  existing_risks?: string[];
}

export interface MitigationGenerationInput {
  risk_summary: string;
  risk_description: string;
  risk_category?: string;
  severity?: string;
  industry?: string;
  existing_mitigations?: string[];
}

export interface AssessmentGenerationInput {
  use_case: string;
  industry: string;
  project_description?: string;
  model_type?: string;
  lifecycle_phase?: string;
}

export interface GeneratedRisk {
  summary: string;
  description: string;
  risk_type?: string;
  risk_source?: string;
  domain?: string;
  eu_ai_act_tier?: string;
  severity?: string;
  likelihood?: string;
  marginal_risk_description?: string;
  applicable_model_types?: string[];
}

export interface GeneratedMitigation {
  strategy: string;
  title: string;
  description: string;
  implementation_guidance?: string;
  evidence_requirements?: string;
  framework_ref?: string;
}

export interface GeneratedAssessment {
  risks: Array<GeneratedRisk & { mitigations: GeneratedMitigation[] }>;
  overall_risk_level: string;
  eu_ai_act_tier: string;
  summary: string;
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
      headers: (llmKey as any).custom_headers || undefined,
    });
    return anthropic((llmKey as any).model || "claude-sonnet-4-20250514");
  }

  const openai = createOpenAI({
    apiKey: (llmKey as any).key,
    baseURL: (llmKey as any).url || undefined,
    headers: (llmKey as any).custom_headers || undefined,
  });
  return openai((llmKey as any).model || "gpt-4o-mini");
}

async function getFirstAvailableKey(organizationId: number) {
  const keys = await getLLMKeysWithKeyQuery(organizationId);
  if (!keys.length) return null;
  return keys[0];
}

async function getOrgFeedbackContext(organizationId: number): Promise<string> {
  const result = (await sequelize.query(
    `SELECT rle.risk_type, rle.domain, rlf.feedback_type, COUNT(*) as cnt
     FROM risk_library_feedback rlf
     JOIN risk_library_entries rle ON rle.id = rlf.library_entry_id
     WHERE rlf.organization_id = :organizationId
     GROUP BY rle.risk_type, rle.domain, rlf.feedback_type
     ORDER BY cnt DESC
     LIMIT 20`,
    { replacements: { organizationId } }
  )) as [any[], number];

  if (!result[0].length) return "";

  const upvoted = result[0]
    .filter((r: any) => r.feedback_type === "upvote")
    .map((r: any) => `${r.risk_type || "unknown"}/${r.domain || "unknown"} (${r.cnt} upvotes)`)
    .join(", ");

  const downvoted = result[0]
    .filter((r: any) => r.feedback_type === "downvote")
    .map((r: any) => `${r.risk_type || "unknown"}/${r.domain || "unknown"} (${r.cnt} downvotes)`)
    .join(", ");

  let context = "";
  if (upvoted) context += `\nRisk types this organization found most relevant: ${upvoted}`;
  if (downvoted) context += `\nRisk types this organization found less relevant: ${downvoted}`;
  return context;
}

function parseJsonResponse(text: string): any {
  // Try to extract JSON from code blocks or raw response
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    // Try to find JSON array or object in the text
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    const match = arrayMatch || objectMatch;
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error("Failed to parse LLM response as JSON");
  }
}

async function storeGeneration(
  organizationId: number,
  userId: number,
  generationType: string,
  inputContext: object,
  outputContent: object,
  llmProvider?: string,
  llmModel?: string
): Promise<number> {
  const result = (await sequelize.query(
    `INSERT INTO risk_library_generations
       (organization_id, user_id, generation_type, input_context, output_content, llm_provider, llm_model)
     VALUES (:organizationId, :userId, :generationType, :inputContext, :outputContent, :llmProvider, :llmModel)
     RETURNING id`,
    {
      replacements: {
        organizationId,
        userId,
        generationType,
        inputContext: JSON.stringify(inputContext),
        outputContent: JSON.stringify(outputContent),
        llmProvider: llmProvider || null,
        llmModel: llmModel || null,
      },
    }
  )) as [any[], number];

  return result[0][0].id;
}

// ============================================================================
// GENERATION FUNCTIONS
// ============================================================================

/**
 * Generate a risk taxonomy for a given industry/use case.
 */
export async function generateRiskTaxonomy(
  input: TaxonomyGenerationInput,
  llmKeyId: number,
  organizationId: number,
  userId: number
): Promise<{ generationId: number; risks: GeneratedRisk[] }> {
  const model = await getModelFromKey(llmKeyId, organizationId);
  if (!model) throw new Error("LLM key not found or invalid");

  const feedbackContext = await getOrgFeedbackContext(organizationId);

  const prompt = `You are an expert AI risk management advisor with deep knowledge of the EU AI Act, NIST AI RMF, ISO 42001, and industry-specific AI risks.

Generate a comprehensive risk taxonomy for the following context:
- Industry: ${input.industry}
- Use Case: ${input.use_case}
${input.ai_system_type ? `- AI System Type: ${input.ai_system_type}` : ""}
${input.lifecycle_phase ? `- Lifecycle Phase: ${input.lifecycle_phase}` : ""}
${input.project_description ? `- Project Description: ${input.project_description}` : ""}
${input.existing_risks?.length ? `- Existing Risks (avoid duplicating): ${input.existing_risks.join("; ")}` : ""}
${feedbackContext}

Return ONLY a valid JSON array of risk objects. Each risk should include:
[
  {
    "summary": "Brief risk title (max 100 chars)",
    "description": "Detailed description of the risk scenario",
    "risk_type": "One of: legal, cybersecurity, environmental, technical, trust, fundamental_rights, privacy, societal, third_party, business, health_safety",
    "risk_source": "One of: data, model, product, use, context, regulation, other",
    "domain": "One of: Discrimination & Toxicity, Privacy & Security, Misinformation, Malicious Actors & Misuse, Human-Computer Interaction, Socioeconomic & Environmental, AI System Safety & Reliability",
    "eu_ai_act_tier": "One of: prohibited, high, limited, minimal",
    "severity": "One of: Negligible, Minor, Moderate, Major, Catastrophic",
    "likelihood": "One of: Rare, Unlikely, Possible, Likely, Almost Certain",
    "marginal_risk_description": "How does AI specifically change or introduce this risk compared to non-AI alternatives?",
    "applicable_model_types": ["LLM", "Computer Vision", etc.]
  }
]

Generate 8-12 risks that are specific, actionable, and relevant to the given industry and use case. Prioritize risks by severity.`;

  const result = await generateText({
    model,
    prompt,
    maxOutputTokens: 4096,
    abortSignal: AbortSignal.timeout(60_000),
  });

  const risks = parseJsonResponse(result.text) as GeneratedRisk[];

  const keyInfo = await getFirstAvailableKey(organizationId);
  const generationId = await storeGeneration(
    organizationId,
    userId,
    "taxonomy",
    input,
    risks,
    (keyInfo as any)?.name,
    (keyInfo as any)?.model
  );

  return { generationId, risks };
}

/**
 * Generate mitigations for a specific risk.
 */
export async function generateRiskMitigations(
  input: MitigationGenerationInput,
  llmKeyId: number,
  organizationId: number,
  userId: number
): Promise<{ generationId: number; mitigations: GeneratedMitigation[] }> {
  const model = await getModelFromKey(llmKeyId, organizationId);
  if (!model) throw new Error("LLM key not found or invalid");

  const feedbackContext = await getOrgFeedbackContext(organizationId);

  const prompt = `You are an expert AI risk management advisor. Generate specific, actionable mitigations for the following risk:

- Risk: ${input.risk_summary}
- Description: ${input.risk_description}
${input.risk_category ? `- Category: ${input.risk_category}` : ""}
${input.severity ? `- Severity: ${input.severity}` : ""}
${input.industry ? `- Industry: ${input.industry}` : ""}
${input.existing_mitigations?.length ? `- Existing Mitigations (avoid duplicating): ${input.existing_mitigations.join("; ")}` : ""}
${feedbackContext}

Return ONLY a valid JSON array of mitigation objects. Include mitigations across different strategies:
[
  {
    "strategy": "One of: avoid, transfer, mitigate, accept",
    "title": "Short mitigation title",
    "description": "Detailed description of the mitigation approach",
    "implementation_guidance": "Step-by-step guidance for implementing this mitigation",
    "evidence_requirements": "What evidence demonstrates this mitigation is effective",
    "framework_ref": "Reference to relevant framework control (e.g., NIST-MS-2.3, ISO42001-A.6) or null"
  }
]

Generate 4-6 mitigations covering different strategies. Focus on practical, implementable controls.`;

  const result = await generateText({
    model,
    prompt,
    maxOutputTokens: 4096,
    abortSignal: AbortSignal.timeout(60_000),
  });

  const mitigations = parseJsonResponse(result.text) as GeneratedMitigation[];

  const keyInfo = await getFirstAvailableKey(organizationId);
  const generationId = await storeGeneration(
    organizationId,
    userId,
    "mitigation",
    input,
    mitigations,
    (keyInfo as any)?.name,
    (keyInfo as any)?.model
  );

  return { generationId, mitigations };
}

/**
 * Generate a full risk assessment for a use case.
 */
export async function generateRiskAssessment(
  input: AssessmentGenerationInput,
  llmKeyId: number,
  organizationId: number,
  userId: number
): Promise<{ generationId: number; assessment: GeneratedAssessment }> {
  const model = await getModelFromKey(llmKeyId, organizationId);
  if (!model) throw new Error("LLM key not found or invalid");

  const feedbackContext = await getOrgFeedbackContext(organizationId);

  const prompt = `You are an expert AI risk management advisor with deep knowledge of the EU AI Act, NIST AI RMF, and ISO 42001.

Generate a comprehensive risk assessment for the following AI use case:
- Use Case: ${input.use_case}
- Industry: ${input.industry}
${input.project_description ? `- Project Description: ${input.project_description}` : ""}
${input.model_type ? `- Model Type: ${input.model_type}` : ""}
${input.lifecycle_phase ? `- Lifecycle Phase: ${input.lifecycle_phase}` : ""}
${feedbackContext}

Return ONLY valid JSON with this structure:
{
  "summary": "Executive summary of the risk assessment (2-3 sentences)",
  "overall_risk_level": "One of: Low, Medium, High, Critical",
  "eu_ai_act_tier": "One of: prohibited, high, limited, minimal",
  "risks": [
    {
      "summary": "Risk title",
      "description": "Risk description",
      "risk_type": "One of: legal, cybersecurity, environmental, technical, trust, fundamental_rights, privacy, societal, third_party, business, health_safety",
      "risk_source": "One of: data, model, product, use, context, regulation, other",
      "domain": "One of: Discrimination & Toxicity, Privacy & Security, Misinformation, Malicious Actors & Misuse, Human-Computer Interaction, Socioeconomic & Environmental, AI System Safety & Reliability",
      "eu_ai_act_tier": "prohibited, high, limited, or minimal",
      "severity": "Negligible, Minor, Moderate, Major, or Catastrophic",
      "likelihood": "Rare, Unlikely, Possible, Likely, or Almost Certain",
      "marginal_risk_description": "How AI specifically changes this risk vs non-AI",
      "mitigations": [
        {
          "strategy": "avoid, transfer, mitigate, or accept",
          "title": "Mitigation title",
          "description": "Mitigation description",
          "implementation_guidance": "How to implement",
          "evidence_requirements": "What evidence to collect",
          "framework_ref": "e.g., NIST-MS-2.3 or null"
        }
      ]
    }
  ]
}

Identify 5-8 key risks with 2-3 mitigations each. Be specific to the industry and use case.`;

  const result = await generateText({
    model,
    prompt,
    maxOutputTokens: 8192,
    abortSignal: AbortSignal.timeout(90_000),
  });

  const assessment = parseJsonResponse(result.text) as GeneratedAssessment;

  const keyInfo = await getFirstAvailableKey(organizationId);
  const generationId = await storeGeneration(
    organizationId,
    userId,
    "assessment",
    input,
    assessment,
    (keyInfo as any)?.name,
    (keyInfo as any)?.model
  );

  return { generationId, assessment };
}

/**
 * Submit feedback on an AI generation.
 */
export async function submitGenerationFeedback(
  generationId: number,
  organizationId: number,
  feedbackType: string
): Promise<void> {
  await sequelize.query(
    `UPDATE risk_library_generations
     SET feedback_type = :feedbackType
     WHERE id = :generationId AND organization_id = :organizationId`,
    {
      replacements: { generationId, organizationId, feedbackType },
    }
  );
}
