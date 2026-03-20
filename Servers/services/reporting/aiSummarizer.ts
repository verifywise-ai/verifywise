/**
 * AI Summarizer Service for Report Generation
 * Generates executive summaries, section analyses, key findings,
 * and recommendations using tenant-configured LLM keys.
 *
 * Follows the proven generateText() pattern from intakeLLM.service.ts
 */

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { getLLMKeysWithKeyQuery } from "../../utils/llmKey.utils";
import {
  ReportData,
  AISummaries,
} from "../../domain.layer/interfaces/i.reportGeneration";
import logger from "../../utils/logger/fileLogger";

// ============================================================================
// CONSTANTS
// ============================================================================

const LLM_TIMEOUT_MS = 30_000;
const MAX_DATA_ITEMS = 50;
const MAX_CONCURRENT = 3;

// ============================================================================
// MODEL RESOLUTION (follows intakeLLM.service.ts pattern)
// ============================================================================

async function getModelFromKey(llmKeyId: number | undefined, organizationId: number) {
  const keys = await getLLMKeysWithKeyQuery(organizationId);
  if (!keys || keys.length === 0) return null;

  let llmKey: any;
  if (llmKeyId !== undefined) {
    llmKey = keys.find((k: any) => k.id === llmKeyId);
    if (!llmKey) {
      logger.warn(
        `AI Summarizer: LLM key ID ${llmKeyId} not found, falling back to first key`
      );
    }
  }
  if (!llmKey) {
    llmKey = keys[0];
  }

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

// ============================================================================
// DATA TRUNCATION
// ============================================================================

function truncateArray<T>(arr: T[] | undefined, max: number = MAX_DATA_ITEMS): T[] {
  if (!arr) return [];
  return arr.slice(0, max);
}

function prepareSectionData(key: string, data: any): string {
  if (!data) return "No data available for this section.";

  const clone = { ...data };

  // Truncate arrays to respect context windows
  switch (key) {
    case "projectRisks":
      clone.risks = truncateArray(clone.risks);
      break;
    case "vendorRisks":
      clone.risks = truncateArray(clone.risks);
      break;
    case "modelRisks":
      clone.risks = truncateArray(clone.risks);
      break;
    case "compliance":
      clone.controls = truncateArray(clone.controls);
      break;
    case "assessment":
      if (clone.topics) {
        clone.topics = truncateArray(clone.topics, 10);
      }
      break;
    case "clausesAndAnnexes":
      clone.clauses = truncateArray(clone.clauses, 30);
      clone.annexes = truncateArray(clone.annexes, 30);
      break;
    case "nistSubcategories":
      if (clone.functions) {
        clone.functions = truncateArray(clone.functions, 10);
      }
      break;
    case "vendors":
      clone.vendors = truncateArray(clone.vendors);
      break;
    case "models":
      clone.models = truncateArray(clone.models);
      break;
    case "trainingRegistry":
      clone.records = truncateArray(clone.records);
      break;
    case "policyManager":
      clone.policies = truncateArray(clone.policies);
      break;
    case "incidentManagement":
      clone.incidents = truncateArray(clone.incidents);
      break;
  }

  return JSON.stringify(clone, null, 2);
}

// ============================================================================
// SECTION LABEL MAP
// ============================================================================

const SECTION_LABELS: Record<string, string> = {
  projectRisks: "Use Case Risks",
  vendorRisks: "Vendor Risks",
  modelRisks: "Model Risks",
  compliance: "Compliance Controls",
  assessment: "Assessment Tracker",
  clausesAndAnnexes: "Clauses & Annexes",
  nistSubcategories: "NIST AI RMF Subcategories",
  vendors: "Vendors",
  models: "AI Models",
  trainingRegistry: "Training Registry",
  policyManager: "Policy Manager",
  incidentManagement: "Incident Management",
};

// ============================================================================
// CONCURRENCY LIMITER
// ============================================================================

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const currentIndex = index++;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

// ============================================================================
// SECTION SUMMARY GENERATION
// ============================================================================

async function generateSectionSummary(
  sectionKey: string,
  sectionData: any,
  frameworkName: string,
  projectTitle: string,
  model: any
): Promise<string> {
  try {
    const sectionLabel = SECTION_LABELS[sectionKey] || sectionKey;
    const dataStr = prepareSectionData(sectionKey, sectionData);

    const prompt = `You are an AI governance analyst writing the "${sectionLabel}" section analysis for a ${frameworkName} compliance report on the project "${projectTitle}".

Analyze the following data and write a concise summary (150-250 words) that:
- Highlights key observations and patterns
- Identifies areas of concern or non-compliance
- Notes strengths and areas of good practice
- Provides context for decision-makers

Write in professional third-person tone. Do not use markdown formatting. Do not include headers or bullet points — write flowing paragraphs only.

Data:
${dataStr}`;

    const result = await generateText({
      model,
      prompt,
      maxOutputTokens: 500,
      abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });

    return result.text.trim();
  } catch (error) {
    logger.warn(
      `AI Summarizer: Failed to generate summary for section "${sectionKey}":`,
      error
    );
    return "";
  }
}

// ============================================================================
// EXECUTIVE SUMMARY GENERATION
// ============================================================================

async function generateExecutiveSummary(
  sectionSummaries: Record<string, string>,
  frameworkName: string,
  projectTitle: string,
  model: any
): Promise<string> {
  try {
    const summariesText = Object.entries(sectionSummaries)
      .filter(([, v]) => v.length > 0)
      .map(
        ([key, summary]) =>
          `[${SECTION_LABELS[key] || key}]\n${summary}`
      )
      .join("\n\n");

    if (!summariesText) return "";

    const prompt = `You are an AI governance analyst writing the Executive Summary for a ${frameworkName} compliance report on the project "${projectTitle}".

Based on the following section analyses, write a comprehensive executive summary (3-5 paragraphs) that covers:
1. Overall compliance and governance posture
2. Critical findings that require immediate attention
3. Top areas needing improvement
4. Recommended next steps

Write in professional third-person tone. Do not use markdown formatting, bullet points, or headers — write flowing paragraphs only.

Section Analyses:
${summariesText}`;

    const result = await generateText({
      model,
      prompt,
      maxOutputTokens: 1000,
      abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });

    return result.text.trim();
  } catch (error) {
    logger.warn("AI Summarizer: Failed to generate executive summary:", error);
    return "";
  }
}

// ============================================================================
// KEY FINDINGS & RECOMMENDATIONS
// ============================================================================

async function generateFindingsAndRecommendations(
  sectionSummaries: Record<string, string>,
  frameworkName: string,
  projectTitle: string,
  model: any
): Promise<{ keyFindings: string[]; recommendations: string[] }> {
  try {
    const summariesText = Object.entries(sectionSummaries)
      .filter(([, v]) => v.length > 0)
      .map(
        ([key, summary]) =>
          `[${SECTION_LABELS[key] || key}]\n${summary}`
      )
      .join("\n\n");

    if (!summariesText) return { keyFindings: [], recommendations: [] };

    const prompt = `You are an AI governance analyst reviewing a ${frameworkName} compliance report for the project "${projectTitle}".

Based on the following section analyses, produce:
1. Key Findings: 5-8 concise bullet points summarizing the most important observations
2. Recommendations: 3-5 actionable items that the organization should prioritize

Return ONLY valid JSON in this exact format:
{
  "keyFindings": ["finding 1", "finding 2", ...],
  "recommendations": ["recommendation 1", "recommendation 2", ...]
}

Section Analyses:
${summariesText}`;

    const result = await generateText({
      model,
      prompt,
      maxOutputTokens: 800,
      abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { keyFindings: [], recommendations: [] };

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      keyFindings: Array.isArray(parsed.keyFindings)
        ? parsed.keyFindings
        : [],
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations
        : [],
    };
  } catch (error) {
    logger.warn(
      "AI Summarizer: Failed to generate findings and recommendations:",
      error
    );
    return { keyFindings: [], recommendations: [] };
  }
}

// ============================================================================
// RISK HIGHLIGHTS GENERATION
// ============================================================================

async function generateRiskHighlights(
  reportData: ReportData,
  frameworkName: string,
  model: any
): Promise<string> {
  try {
    const riskSections: string[] = [];

    if (reportData.sections.projectRisks) {
      riskSections.push(
        `Use Case Risks (${reportData.sections.projectRisks.totalRisks} total): ${JSON.stringify(truncateArray(reportData.sections.projectRisks.risks, 20))}`
      );
    }
    if (reportData.sections.vendorRisks) {
      riskSections.push(
        `Vendor Risks (${reportData.sections.vendorRisks.totalRisks} total): ${JSON.stringify(truncateArray(reportData.sections.vendorRisks.risks, 20))}`
      );
    }
    if (reportData.sections.modelRisks) {
      riskSections.push(
        `Model Risks (${reportData.sections.modelRisks.totalRisks} total): ${JSON.stringify(truncateArray(reportData.sections.modelRisks.risks, 20))}`
      );
    }

    if (riskSections.length === 0) return "";

    const prompt = `You are an AI governance analyst writing a Risk Highlights section for a ${frameworkName} compliance report on the project "${reportData.metadata.projectTitle}".

Analyze the following risk data and write a concise summary (100-200 words) highlighting:
- The most critical risks requiring immediate attention
- Risk concentration patterns (by level, by source)
- Any systemic risk concerns

Write in professional third-person tone. Do not use markdown formatting — write flowing paragraphs only.

Risk Data:
${riskSections.join("\n\n")}`;

    const result = await generateText({
      model,
      prompt,
      maxOutputTokens: 400,
      abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });

    return result.text.trim();
  } catch (error) {
    logger.warn("AI Summarizer: Failed to generate risk highlights:", error);
    return "";
  }
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export async function generateAISummaries(
  reportData: ReportData,
  organizationId: number,
  llmKeyId?: number
): Promise<AISummaries> {
  const result: AISummaries = {
    sectionSummaries: {},
  };

  try {
    // 1. Resolve LLM model
    const model = await getModelFromKey(llmKeyId, organizationId);
    if (!model) {
      logger.warn(
        "AI Summarizer: No LLM keys configured, skipping AI summaries"
      );
      return result;
    }

    const frameworkName = reportData.metadata.frameworkName;
    const projectTitle = reportData.metadata.projectTitle;

    // 2. Generate section summaries in parallel (concurrency limited)
    const sectionEntries = Object.entries(reportData.sections).filter(
      ([, data]) => data !== undefined && data !== null
    );

    const sectionTasks = sectionEntries.map(
      ([key, data]) => () =>
        generateSectionSummary(key, data, frameworkName, projectTitle, model)
    );

    const sectionResults = await runWithConcurrency(
      sectionTasks,
      MAX_CONCURRENT
    );

    sectionEntries.forEach(([key], index) => {
      const summary = sectionResults[index];
      if (summary) {
        result.sectionSummaries[key] = summary;
      }
    });

    // 3. Generate executive summary (depends on section summaries)
    result.executiveSummary = await generateExecutiveSummary(
      result.sectionSummaries,
      frameworkName,
      projectTitle,
      model
    );

    // 4. Generate key findings and recommendations (parallel with risk highlights)
    const [findingsResult, riskHighlights] = await Promise.all([
      generateFindingsAndRecommendations(
        result.sectionSummaries,
        frameworkName,
        projectTitle,
        model
      ),
      generateRiskHighlights(reportData, frameworkName, model),
    ]);

    result.keyFindings = findingsResult.keyFindings;
    result.recommendations = findingsResult.recommendations;
    result.riskHighlights = riskHighlights;

    logger.info(
      `AI Summarizer: Generated summaries for ${Object.keys(result.sectionSummaries).length} sections`
    );

    return result;
  } catch (error) {
    logger.error("AI Summarizer: Unexpected error:", error);
    return result;
  }
}
