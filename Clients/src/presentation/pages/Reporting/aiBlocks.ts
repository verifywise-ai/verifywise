import type { AiBlocksConfig } from "../../../domain/interfaces/i.reporting";

/** The report kind of the OSFI E-23 completeness template (parameters_config.kind). */
export const E23_REPORT_KIND = "osfi_e23";

/**
 * The AI blocks the backend runs, in display order. A block with `kinds` is
 * offered only for templates of those kinds: the E-23 gap analysis reads
 * sections that exist only in an E-23 report.
 */
export const AI_BLOCKS: Array<{ key: keyof AiBlocksConfig; label: string; kinds?: string[] }> = [
  { key: "sectionSummaries", label: "Per-section summaries" },
  { key: "executiveSummary", label: "Executive summary" },
  { key: "keyFindings", label: "Key findings" },
  { key: "recommendedActions", label: "Recommended actions" },
  { key: "riskAnalysis", label: "Risk analysis" },
  { key: "complianceGap", label: "Compliance gap analysis" },
  { key: "vendorRisk", label: "Third-party risk analysis" },
  { key: "e23Gap", label: "E-23 gap analysis", kinds: [E23_REPORT_KIND] },
];

/**
 * Defaults for a template that states none. complianceGap and vendorRisk stay
 * off because each enabled block is one language-model call on every run;
 * e23Gap stays off because only the E-23 template uses it, and that template
 * turns it on itself.
 */
export const DEFAULT_AI_BLOCKS: AiBlocksConfig = {
  sectionSummaries: true,
  executiveSummary: true,
  keyFindings: true,
  recommendedActions: true,
  riskAnalysis: true,
  complianceGap: false,
  vendorRisk: false,
  e23Gap: false,
};

/** The blocks to offer for a template of this kind (none for a general template). */
export const aiBlocksForKind = (kind?: string) =>
  AI_BLOCKS.filter((block) => !block.kinds || (!!kind && block.kinds.includes(kind)));
