import type { AISummaries } from "../../../domain.layer/interfaces/i.reportGeneration";
import type { AnalyzedKey, AnalyzerResults } from "./runAnalyzers";

/**
 * Display names for the seven analyzer keys, in ONE place. docxGenerator
 * imports this; pdfGenerator passes it into the EJS render data as
 * `analysisLabels`. Two hand-kept copies drift the first time a renderer gains
 * a block, and the mismatch is invisible until someone diffs a PDF against a
 * DOCX of the same run.
 */
export const ANALYSIS_LABELS: Record<string, string> = {
  sectionSummaries: "Section summaries",
  executiveSummary: "Executive summary",
  keyFindings: "Key findings",
  recommendedActions: "Recommended actions",
  riskAnalysis: "Risk analysis",
  complianceGap: "Compliance gap analysis",
  vendorRisk: "Third-party risk analysis",
};

/**
 * Two of the abstain_reason strings runAnalyzers can produce describe the
 * SERVICE, not the data (runAnalyzers.ts:332 and :212). In a regulator-facing
 * document "the AI service call failed" says nothing about the organization's
 * governance posture; the neutral sentence below is the honest amount of
 * information. Every other reason — "insufficient data for this section", "no
 * section produced a summary", and anything the model itself stated in
 * abstain_reason — IS a finding about the data and prints verbatim.
 *
 * The literals stay verbatim so they grep against runAnalyzers.ts, and are
 * lowercased on the way in so the case-insensitive lookup below still matches
 * the "AI" and "LLM" capitals these strings carry.
 */
const OPERATIONAL_ABSTAIN_REASONS = new Set(
  [
    "this analysis could not be produced because the AI service call failed",
    "no LLM key is configured for this organization",
  ].map((r) => r.toLowerCase()),
);

export const OPERATIONAL_ABSTENTION_TEXT = "This analysis was not produced.";

export function isOperationalAbstention(reason: string): boolean {
  return OPERATIONAL_ABSTAIN_REASONS.has(reason.trim().toLowerCase());
}

/**
 * Flatten structured analyzer output onto the AISummaries shape both renderers
 * already consume. Abstained sections contribute nothing, so an abstention
 * renders as an absent block rather than as an empty heading.
 */
export function mapAnalysesToSummaries(
  analyses: AnalyzerResults,
  existing?: AISummaries,
): AISummaries {
  const out: AISummaries = {
    ...existing,
    sectionSummaries: existing?.sectionSummaries ?? {},
  };

  // Per-section prose from the ported summarizer. This is what keeps the 24
  // sectionSummaries render blocks alive after aiSummarizer is deleted — drop
  // it and twelve AI boxes silently vanish from every report.
  // No cast: AnalyzerResults is keyed by AnalyzedKey, which includes this key.
  const sectionResult = analyses?.sectionSummaries;
  if (sectionResult && !sectionResult.abstained && sectionResult.payload?.summaries) {
    out.sectionSummaries = { ...out.sectionSummaries, ...sectionResult.payload.summaries };
  }

  // Returns the payload only when the analyzer actually produced one — an
  // abstained section contributes nothing rather than an empty heading.
  const take = (key: AnalyzedKey): any => {
    const r = analyses?.[key];
    return r && !r.abstained && r.payload ? r.payload : undefined;
  };

  const exec = take("executiveSummary");
  if (exec?.summary) out.executiveSummary = exec.summary;

  const findings = take("keyFindings");
  if (findings?.findings?.length) {
    out.keyFindings = findings.findings.map((f: { text: string }) => f.text);
    // Structured copy for the renderers. related_sections and
    // what_would_close_this normalise to empty ("nothing to say"); basis
    // normalises null to undefined and is never defaulted, so a payload that
    // never stated one renders no label rather than a fabricated claim.
    out.keyFindingsDetailed = findings.findings.map((f: any) => ({
      text: f.text,
      section: f.section,
      severity: f.severity,
      basis: f.basis ?? undefined,
      related_sections: f.related_sections ?? [],
      what_would_close_this: f.what_would_close_this ?? "",
    }));
  }

  const actions = take("recommendedActions");
  if (actions?.actions?.length) {
    out.recommendedActions = actions.actions.map((a: any) => ({
      action: a.action,
      suggestedOwner: a.suggestedOwner ?? undefined,
      priority: a.priority,
      sourceSignal: a.rationale,
      basis: a.basis ?? undefined,
    }));
    // Keep the plain-string list the existing renderers already read.
    out.recommendations = actions.actions.map((a: any) => a.action);
  }

  const risk = take("riskAnalysis");
  if (risk) {
    out.riskAnalysis = risk;
    out.riskHighlights = risk.narrative;
  }

  const gap = take("complianceGap");
  if (gap) out.complianceGap = gap;

  const vendor = take("vendorRisk");
  if (vendor) out.vendorRisk = vendor;

  // Why a block is missing. Only reasons the analyzer actually stated — an
  // abstention with no reason has nothing to tell the reader, so it stays out.
  // Operational failures are neutralised here rather than in each renderer, so
  // the two formats cannot disagree about what a reader is told.
  const abstentions: Record<string, string> = {};
  for (const [key, result] of Object.entries(analyses ?? {})) {
    const reason = result?.abstained ? result.abstain_reason : null;
    if (!reason) continue;
    abstentions[key] = isOperationalAbstention(reason) ? OPERATIONAL_ABSTENTION_TEXT : reason;
  }
  if (Object.keys(abstentions).length > 0) out.abstentions = abstentions;

  return out;
}
