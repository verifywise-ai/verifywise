import type {
  ReportData,
  ReportGenerationRequest,
} from "../../../domain.layer/interfaces/i.reportGeneration";
import {
  getControlScoresQuery,
  getFrameworkScoreByTypeQuery,
  getWeakestControlsQuery,
} from "../../../utils/readiness.utils";
import { getEvidenceGapsQuery } from "../../../utils/evidenceAi.utils";
import { getPriorFactsSnapshotQuery } from "../../../utils/reportRunAnalysis.utils";
import logger from "../../../utils/logger/fileLogger";
import type { AiBlocks } from "./runAnalyzers";
import { collectFacts, renderFacts, type FactsSnapshot } from "./facts";

/**
 * frameworks.id -> readiness framework_type.
 *
 * Deliberately local, not imported from readiness.utils: an equivalent const
 * lives there only in uncommitted working-tree changes, so importing it would
 * make this file fail to compile on a clean checkout. Values match the
 * committed frameworks seed (20260226234301-public-schema-tables.js:208-211):
 * 1 EU AI Act, 2 ISO 42001, 3 ISO 27001, 4 NIST AI RMF.
 */
const READINESS_FRAMEWORK_IDS: Record<string, number> = {
  eu_ai_act: 1,
  iso_42001: 2,
  iso_27001: 3,
  nist_ai_rmf: 4,
};

/**
 * Manual runs carry no template, so aiEnhanced maps to the blocks that
 * reproduce today's aiSummarizer output exactly: per-section summaries, an
 * executive summary, findings + recommendations, and risk highlights.
 *
 * complianceGap and vendorRisk stay off — they are the new, project-scoped
 * analyzers, and enabling them here would add unbudgeted spend to every manual
 * report. Phase 3 lets the wizard choose.
 */
const LEGACY_BLOCKS: AiBlocks = {
  sectionSummaries: true,
  executiveSummary: true,
  keyFindings: true,
  recommendedActions: true,
  riskAnalysis: true,
  complianceGap: false,
  vendorRisk: false,
};

const NO_BLOCKS: AiBlocks = {
  sectionSummaries: false,
  executiveSummary: false,
  keyFindings: false,
  recommendedActions: false,
  riskAnalysis: false,
  complianceGap: false,
  vendorRisk: false,
};

export function resolveBlocks(request: ReportGenerationRequest): AiBlocks {
  if (!request.aiEnhanced) return { ...NO_BLOCKS };
  if (request.aiBlocks) return { ...request.aiBlocks };
  return { ...LEGACY_BLOCKS };
}

export interface ReadinessInput {
  controlScores: any[];
  weakestControls: any[];
  frameworkScore: any | null;
  stale: boolean;
}

const EMPTY_READINESS: ReadinessInput = {
  controlScores: [],
  weakestControls: [],
  frameworkScore: null,
  stale: true,
};

// HEAD's getWeakestControlsQuery takes 5 params and cannot filter by framework
// (the 6th frameworkType param exists only in uncommitted work). Its SELECT
// does return framework_type per row, so we over-fetch and narrow here.
// Over-fetch rather than requesting 10: the query returns the weakest across
// ALL frameworks, so taking 10 and then filtering could leave two or three
// rows and read as "almost no weak controls" for this framework.
const WEAKEST_LIMIT = 10;
const WEAKEST_FETCH = 100;

/**
 * Read STORED readiness scores for the complianceGap analyzer.
 *
 * Deliberately returns nothing when projectId is falsy. Every readiness query
 * falls back to `AND project_id IS NULL` when projectId is null, and no stored
 * row ever has a null project_id — so a project-less call returns [] while
 * looking like a successful lookup. Better to hand the analyzer an explicit
 * "not project-scoped" signal than a silent empty set it would read as "no gaps".
 */
export async function collectReadinessInput(
  projectId: number | undefined,
  frameworkId: number | undefined,
  organizationId: number,
  userId: number | null,
): Promise<ReadinessInput> {
  if (!projectId) return { ...EMPTY_READINESS };

  const frameworkType = Object.keys(READINESS_FRAMEWORK_IDS).find(
    (k) => READINESS_FRAMEWORK_IDS[k] === frameworkId,
  );
  if (!frameworkType) return { ...EMPTY_READINESS };

  try {
    const [controlScores, weakestAll, frameworkScore] = await Promise.all([
      getControlScoresQuery(frameworkType, organizationId, projectId, userId),
      getWeakestControlsQuery(organizationId, WEAKEST_FETCH, projectId, userId),
      getFrameworkScoreByTypeQuery(frameworkType, organizationId, projectId, userId),
    ]);
    return {
      controlScores: controlScores ?? [],
      weakestControls: (weakestAll ?? [])
        .filter((r: any) => r.framework_type === frameworkType)
        .slice(0, WEAKEST_LIMIT),
      frameworkScore: frameworkScore ?? null,
      // Nothing recalculates readiness at report time, so stored rows may
      // predate the data in this report. Always flag it.
      stale: true,
    };
  } catch (error) {
    logger.warn("Report analyzers: readiness lookup failed, degrading to empty", error);
    return { ...EMPTY_READINESS };
  }
}

/** Frameworks getEvidenceGapsQuery actually covers (evidenceAi.utils.ts:161). */
const GAP_SUPPORTED_FRAMEWORKS = ["eu_ai_act", "iso_42001"];

/**
 * Read the evidence-gap analysis — the SECOND, independent complianceGap input
 * required by spec §3. Never joined with readiness (spec §4).
 *
 * The framework guard is load-bearing: passing an unsupported framework_type
 * makes the query return EU rows mislabeled with the requested type
 * (`evidenceAi.utils.ts:170-172`). Rather than feed the analyzer wrong-framework
 * rows, we skip the call and tell it the framework is uncovered.
 */
export async function collectEvidenceGapsInput(
  frameworkId: number | undefined,
  organizationId: number,
): Promise<{ gaps: any[]; frameworkUnsupported: boolean }> {
  const frameworkType = Object.keys(READINESS_FRAMEWORK_IDS).find(
    (k) => READINESS_FRAMEWORK_IDS[k] === frameworkId,
  );
  if (!frameworkType || !GAP_SUPPORTED_FRAMEWORKS.includes(frameworkType)) {
    return { gaps: [], frameworkUnsupported: true };
  }

  try {
    const gaps = await getEvidenceGapsQuery(organizationId, frameworkType);
    return { gaps: gaps ?? [], frameworkUnsupported: false };
  } catch (error) {
    logger.warn("Report analyzers: evidence-gap lookup failed, degrading to empty", error);
    return { gaps: [], frameworkUnsupported: false };
  }
}

/**
 * Names that may legitimately appear as a suggestedOwner: only people already
 * named in the report's own data. An owner the model produces from anywhere
 * else is invented, and gets nulled.
 */
export function collectAllowedOwners(reportData: ReportData): string[] {
  const owners = new Set<string>();
  const sections: any = reportData?.sections ?? {};

  const harvest = (rows: any[] | undefined, fields: string[]) => {
    (rows ?? []).forEach((row) => {
      fields.forEach((f) => {
        const v = row?.[f];
        if (typeof v === "string" && v.trim() && v.toLowerCase() !== "unassigned") {
          owners.add(v.trim());
        }
      });
    });
  };

  harvest(sections.projectRisks?.risks, ["owner"]);
  harvest(sections.vendorRisks?.risks, ["owner", "actionOwner"]);
  harvest(sections.modelRisks?.risks, ["owner"]);
  harvest(sections.vendors?.vendors, ["assignee", "reviewer"]);
  // The models section was omitted here, which is why every recommended
  // action in the live corpus came back with suggestedOwner: null.
  harvest(sections.models?.models, ["owner"]);
  harvest(sections.compliance?.controls, ["owner", "approver"]);
  harvest(sections.trainingRegistry?.records, ["owner"]);
  harvest(sections.policyManager?.policies, ["owner", "reviewer"]);

  return Array.from(owners);
}

/**
 * The deterministic facts substrate every analyzer receives (design §1).
 *
 * Returns the snapshot alongside its rendered form: §10 persists the snapshot
 * to report_run_analyses.audit_metadata and diffs the next run against it, so
 * the caller needs both. `prior` is that stored snapshot; with none supplied
 * the rendered block simply carries no change lines. The parameter exists from
 * the start so §10 is a one-argument change at the call site, not a rewrite.
 */
export function collectFactsInput(
  reportData: ReportData,
  prior?: FactsSnapshot | null,
): { snapshot: FactsSnapshot; facts: string } {
  const snapshot = collectFacts(reportData);
  return { snapshot, facts: renderFacts(snapshot, prior) };
}

/**
 * audit_metadata is unconstrained JSONB, written by whatever analyzer version
 * produced that run. Check the shape before handing it to renderFacts — an
 * older or partial object must read as "no prior", not blow up inside the
 * analysis path.
 */
function isFactsSnapshot(value: any): value is FactsSnapshot {
  return (
    !!value &&
    typeof value === "object" &&
    typeof value.generatedAt === "string" &&
    !!value.sections &&
    typeof value.sections === "object"
  );
}

/**
 * The previous run's facts snapshot for this schedule (design §10), or null.
 *
 * Null, never a throw. This is one extra read on the report path, and the
 * standing invariant is that analysis must not become a way to lose a report —
 * generateReport's catch would otherwise drop every analysis because a
 * comparison could not be made.
 *
 * A run with no schedule (a manual report) has no predecessor, so the query is
 * skipped entirely and the caller renders exactly what it renders today.
 */
export async function collectPriorFacts(
  scheduledReportId: number | undefined,
  organizationId: number,
): Promise<FactsSnapshot | null> {
  if (!scheduledReportId) return null;

  try {
    const stored = await getPriorFactsSnapshotQuery(scheduledReportId, organizationId);
    return isFactsSnapshot(stored) ? stored : null;
  } catch (error) {
    logger.warn("Report analyzers: prior facts lookup failed, degrading to no comparison", error);
    return null;
  }
}
