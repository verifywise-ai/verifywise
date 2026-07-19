import type { AISummaries } from "../../../domain.layer/interfaces/i.reportGeneration";
import type { AnalyzedKey, AnalyzerResults } from "./runAnalyzers";

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
  }

  const actions = take("recommendedActions");
  if (actions?.actions?.length) {
    out.recommendedActions = actions.actions.map((a: any) => ({
      action: a.action,
      suggestedOwner: a.suggestedOwner ?? undefined,
      priority: a.priority,
      sourceSignal: a.rationale,
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

  return out;
}
