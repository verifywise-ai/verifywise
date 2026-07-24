import type { z } from "zod";
import type { ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";
import {
  complianceGapSchema,
  executiveSummarySchema,
  keyFindingsSchema,
  recommendedActionsSchema,
  riskAnalysisSchema,
  vendorRiskSchema,
} from "./schemas";
import { GROUNDING_RULES, renderSections, SECTION_LABELS } from "./prompts";

export { ANALYZER_VERSION } from "./prompts";

export type AnalysisSectionKey =
  | "executiveSummary"
  | "keyFindings"
  | "recommendedActions"
  | "riskAnalysis"
  | "complianceGap"
  | "vendorRisk";

export const ANALYSIS_SECTION_KEYS: AnalysisSectionKey[] = [
  "executiveSummary",
  "keyFindings",
  "recommendedActions",
  "riskAnalysis",
  "complianceGap",
  "vendorRisk",
];

/**
 * Extra inputs an analyzer may need beyond ReportData.
 *
 * readiness and evidenceGaps are TWO INDEPENDENT INPUTS and must never be
 * joined (spec §4). They disagree on framework coverage, project scoping and
 * key space, so any join silently mislabels rows.
 */
export interface AnalyzerExtras {
  readiness?: {
    controlScores?: any[];
    weakestControls?: any[];
    frameworkScore?: any | null;
    stale?: boolean;
  };
  evidenceGaps?: {
    gaps: any[];
    /** True when the requested framework is outside what the gaps query covers. */
    frameworkUnsupported: boolean;
  };
  /** Per-section prose from the sectionSummaries producer. The three summary-consuming analyzers read this instead of raw section data, matching aiSummarizer's shipped architecture. */
  sectionSummaries?: Record<string, string>;
  /** Rendered output of renderFacts(). Whole-estate, so a single prompt can
   *  relate one section to another. */
  facts?: string;
}

export interface AnalyzerDefinition {
  key: AnalysisSectionKey;
  schema: z.ZodTypeAny;
  buildSystemPrompt: () => string;
  /** Returns "" when there is nothing worth spending an LLM call on. */
  buildUserPrompt: (reportData: ReportData, extras: AnalyzerExtras) => string;
}

const RISK_SECTIONS = ["projectRisks", "vendorRisks", "modelRisks"];
const VENDOR_SECTIONS = ["vendors", "vendorRisks"];

/** The two names a prompt refers to, with their fallbacks in ONE place: the
 *  header and the instruction body must never disagree about them. */
function subjectOf(reportData: ReportData): { fw: string; subject: string } {
  return {
    fw: reportData.metadata?.frameworkName ?? "AI governance",
    subject: reportData.metadata?.projectTitle ?? "the organization",
  };
}

function header(reportData: ReportData): string {
  const { fw, subject } = subjectOf(reportData);
  return `Framework: ${fw}\nSubject: ${subject}`;
}

/**
 * Renders the per-section prose produced by the sectionSummaries step.
 * executiveSummary, keyFindings and recommendedActions consume THIS, not raw
 * section data — aiSummarizer.ts's shipped generateExecutiveSummary and
 * generateFindingsAndRecommendations take sectionSummaries for the same
 * reason: raw sections run ~38k tokens per prompt vs ~6k for summaries, sent
 * three times per report.
 */
function renderSummaries(summaries: Record<string, string> | undefined): string {
  return Object.entries(summaries ?? {})
    .filter(([, v]) => v && v.length > 0)
    .map(([key, summary]) => `[${SECTION_LABELS[key] || key}]\n${summary}`)
    .join("\n\n");
}

/**
 * The deterministic facts substrate, when the caller supplied one. Rendered
 * ahead of the prose so the model reads values before wording, and handed to
 * ALL six analyzers: aggregates are exactly what the raw-section analyzers
 * lack, and a whole-estate block is what makes cross-section claims possible.
 */
function factsBlock(extras: AnalyzerExtras): string {
  return extras.facts ? `${extras.facts}\n\n` : "";
}

export const ANALYZERS: Record<AnalysisSectionKey, AnalyzerDefinition> = {
  executiveSummary: {
    key: "executiveSummary",
    schema: executiveSummarySchema,
    buildSystemPrompt: () =>
      `${GROUNDING_RULES}\n\nYou are writing the Executive Summary, in three to five paragraphs.\n\nRequired lead: open with the single most consequential finding in this report and the specific evidence that supports it — a count, a share, a date or a named item. Everything after the lead follows from it: why it matters under this framework, what else in the estate it connects to, and what the reader should do about it. Do not work through a fixed outline, and do not give a paragraph to a topic the data does not support.\n\nName the framework and the subject explicitly wherever you would otherwise write "the framework" or "the organization" — never write "the framework" when the input names it.`,
    buildUserPrompt: (rd, extras) => {
      const body = renderSummaries(extras.sectionSummaries);
      if (!body) return "";
      const { fw, subject } = subjectOf(rd);
      return `${header(rd)}\n\n${factsBlock(extras)}Section analyses:\n${body}\n\nWrite the executive summary for ${subject} against ${fw}.`;
    },
  },

  keyFindings: {
    key: "keyFindings",
    schema: keyFindingsSchema,
    buildSystemPrompt: () =>
      `${GROUNDING_RULES}\n\nYou are extracting Key Findings: five to eight of the most important observations across the supplied sections. Attribute each finding to the section key it came from.\n\nA finding must carry the evidence that makes it a finding — a count, a share, a status, a date or a named item — and must not simply restate a sentence from the section analyses. Where the estate facts show the same weakness in more than one section, say so in the finding text and name the sections it spans; one finding that connects two sections is worth more than two findings that repeat each other.\n\nEvery finding also carries three further fields, and each key must be present:\n- basis: "observed" when the supplied data states the claim directly, "inferred" when it follows from the supplied data by reasoning the data does not itself state, "absent" when the claim is that something required is missing. The label describes the CLAIM. It never licenses naming a control, vendor, risk or person that does not appear verbatim in the supplied data. Use null only when none of the three fits.\n- what_would_close_this: the specific condition under which this stops being a finding, written so the next report could check it against the same fields. Use null only when the data gives you no concrete condition to name.\n- related_sections: the other section keys this finding draws on, spelled exactly as they appear in the input. Use an empty array when the finding sits inside a single section.`,
    buildUserPrompt: (rd, extras) => {
      const body = renderSummaries(extras.sectionSummaries);
      return body ? `${header(rd)}\n\n${factsBlock(extras)}Section analyses:\n${body}` : "";
    },
  },

  recommendedActions: {
    key: "recommendedActions",
    schema: recommendedActionsSchema,
    buildSystemPrompt: () =>
      `${GROUNDING_RULES}\n\nYou are producing three to five prioritised, actionable recommendations.\n\nOwner rule: set suggestedOwner ONLY when that exact person or role name appears verbatim in the supplied data. Otherwise it MUST be null. Never infer an owner from context and never invent one.\n\nEvery action also carries basis, and the key must be present: "observed" when the supplied data states the problem this action addresses, "inferred" when the problem follows from the supplied data by reasoning the data does not itself state, "absent" when the problem is that something required is missing. The label describes the CLAIM, not the subject — an "inferred" action still may not name anything absent from the supplied data. Use null only when none of the three fits.`,
    buildUserPrompt: (rd, extras) => {
      const body = renderSummaries(extras.sectionSummaries);
      return body ? `${header(rd)}\n\n${factsBlock(extras)}Section analyses:\n${body}` : "";
    },
  },

  riskAnalysis: {
    key: "riskAnalysis",
    schema: riskAnalysisSchema,
    buildSystemPrompt: () =>
      `${GROUNDING_RULES}\n\nYou are writing the Risk Analysis narrative across use-case, vendor and model risks, and naming up to six of the most material risks. Every named risk must appear verbatim in the supplied data.`,
    buildUserPrompt: (rd, extras) => {
      const body = renderSections(rd.sections as any, RISK_SECTIONS);
      return body ? `${header(rd)}\n\n${factsBlock(extras)}Risk data:\n${body}` : "";
    },
  },

  complianceGap: {
    key: "complianceGap",
    schema: complianceGapSchema,
    buildSystemPrompt: () =>
      `${GROUNDING_RULES}\n\nYou are explaining and prioritising STORED readiness scores. You do not recalculate the readiness scores themselves — they are given. Summarising and comparing them arithmetically (shares, ranks, counts below a threshold) is expected.\n\nTwo hard constraints:\n- If the readiness input is empty or stale, say so plainly in scores_caveat. The absence of scores is NOT evidence of an absence of gaps, and must never be presented as such.\n- Some stored score dimensions are known to be recorded as zero for every control and carry no signal. Where a caveat notes this, do not interpret those zeros as findings or turn them into prose.\n\nEvery gap carries two further fields, and each key must be present:\n- basis: "observed" when the supplied scores state the gap directly, "inferred" when it follows from them by reasoning they do not state, "absent" when the gap is that something required is missing from the data. The label describes the CLAIM: the control you name must still appear verbatim in the supplied data whichever label you choose. Use null only when none of the three fits.\n- what_would_close_this: the specific condition under which this control would no longer be a gap. Use null only when the data gives you no concrete condition to name.`,
    buildUserPrompt: (rd, extras) => {
      const readiness = extras.readiness;
      const evidenceGaps = extras.evidenceGaps;
      const compliance = renderSections(rd.sections as any, ["compliance", "clausesAndAnnexes"]);
      const hasReadiness = !!(
        readiness?.controlScores?.length ||
        readiness?.weakestControls?.length ||
        readiness?.frameworkScore
      );
      if (!hasReadiness && !evidenceGaps?.gaps?.length && !compliance) return "";
      const scores = hasReadiness
        ? JSON.stringify(
            {
              frameworkScore: readiness?.frameworkScore || undefined,
              weakestControls: readiness?.weakestControls?.length
                ? readiness.weakestControls.slice(0, 20)
                : undefined,
              controlScores: readiness?.controlScores?.length ? readiness.controlScores.slice(0, 50) : undefined,
              caveats: [
                "evidence_quality_score, evidence_recency_score and risk_mitigation_score are stored as 0 for every control by the current calculator and carry no signal.",
                readiness?.stale ? "These scores may be stale — nothing recalculates them at report time." : null,
              ].filter(Boolean),
            },
            null,
            2,
          )
        : "No stored readiness scores were found for this project.";

      // Presented as a SEPARATE input, never merged with readiness: the two use
      // different key spaces (gaps emit struct ids, readiness stores per-item
      // ids discriminated by item_type), gaps is org+framework scoped rather
      // than project scoped, and it covers only eu_ai_act and iso_42001.
      const gapsBlock = evidenceGaps?.frameworkUnsupported
        ? "Evidence-gap analysis does not cover this framework, so none was retrieved. This is not evidence that no gaps exist."
        : evidenceGaps?.gaps?.length
          ? JSON.stringify(evidenceGaps.gaps.slice(0, 30), null, 2)
          : "No evidence gaps were returned for this organization.";

      return `${header(rd)}\n\n${factsBlock(extras)}Stored readiness scores (project-scoped):\n${scores}\n\nEvidence-gap analysis (organization + framework scoped — a SEPARATE dataset; do not assume a row here corresponds to a row above):\n${gapsBlock}\n\nCompliance section data:\n${compliance || "None."}`;
    },
  },

  vendorRisk: {
    key: "vendorRisk",
    schema: vendorRiskSchema,
    buildSystemPrompt: () =>
      `${GROUNDING_RULES}\n\nYou are writing the third-party risk narrative and naming specific vendor concerns. Every vendor you name must appear verbatim in the supplied data.\n\nEvery concern also carries basis, and the key must be present: "observed" when the supplied data states the concern directly, "inferred" when it follows from the supplied data by reasoning the data does not itself state, "absent" when the concern is that required vendor information is missing. The label describes the CLAIM and never relaxes the verbatim rule on the vendor name. Use null only when none of the three fits.`,
    buildUserPrompt: (rd, extras) => {
      const body = renderSections(rd.sections as any, VENDOR_SECTIONS);
      return body ? `${header(rd)}\n\n${factsBlock(extras)}Vendor data:\n${body}` : "";
    },
  },
};
