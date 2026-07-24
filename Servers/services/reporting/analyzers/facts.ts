/**
 * Deterministic facts substrate for the report analyzers (design §1).
 *
 * No LLM, no database: every value here is computed from ReportData, so it
 * cannot be hallucinated. Because it names identifiers it also STRENGTHENS
 * sanitizeProvenance — a control id or vendor name the model cites is now
 * present in the prompt that guard checks it against, where today it is
 * dropped for being absent.
 */
import type { ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";
import { isoDate } from "../dataCollector";
import { isTerminalStatus, levelRank } from "./prompts";

/** Structured, storable snapshot. Persisted to report_run_analyses.audit_metadata
 *  so a later run can diff against it without a second LLM call. */
export interface FactsSnapshot {
  /** The report's reference DAY, `YYYY-MM-DD`. Day granularity on purpose:
   *  every date the collector emits is day-granular, and every comparison the
   *  model is asked to make against this value is a day comparison. */
  generatedAt: string;
  framework: string;
  subject: string;
  /** section key -> flat map of aggregate name to value. Flat on purpose: a
   *  flat map diffs numerically without a tree walk. */
  sections: Record<string, Record<string, number | string>>;
}

type Agg = Record<string, number | string>;

/** Ranked items kept per section. The block's ceiling is TOP_N x
 *  MAX_LABEL_CHARS per section; a typical six-section report renders near
 *  2,000 characters against the 60,000-character prompt budget.
 *  ponytail: fixed N, not a per-section knob. Tune here if a section needs more. */
const TOP_N = 3;
const MAX_LABEL_CHARS = 80;
/** A field with more distinct values than this is a name column, not an enum —
 *  keep the heaviest buckets and drop the tail rather than blow the budget. */
const MAX_BUCKETS = 8;

const text = (v: unknown): string => {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : "unset";
};

/** True for the placeholders dataCollector writes when a lookup found nobody. */
const missing = (v: unknown): boolean => {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return s === "" || s === "unassigned" || s === "unknown" || s === "undefined" || s === "null";
};

/**
 * Materiality of a level/severity value, HIGHER IS MORE MATERIAL — the sign
 * inverse of prompts.ts's `levelRank`, which is a sort index where LOWER is
 * more material. The polarities differ because the two callers sort in opposite
 * directions; the VOCABULARY must not, so this reads the shared table rather
 * than keeping a second one. That table covers all three level vocabularies
 * that reach here: project/vendor risks carry the `risk_level_autocalculated`
 * labels WITH a " risk" suffix, model risks the bare words, incidents their own
 * 'Minor' | 'Serious' | 'Very serious' — see the comment on `levelRank`.
 *
 * Unrecognised values fall to -99, behind every ranked one.
 */
const materialityScore = (v: unknown): number => -levelRank(v);

/**
 * 1 for open work, 0 for finished, so the sort surfaces the open rows.
 *
 * Every status vocabulary that reaches this file has its own terminal token —
 * "Done" for compliance controls only (dataCollector.ts:404, :660), but
 * 'Implemented'/'Audited' for ISO sub-clauses and NIST subcategories and
 * 'Completed' for training records. prompts.ts enumerates all of them off the
 * enums; matching only "Done" here would make the sort a no-op for every
 * section except compliance.
 */
const incomplete = (v: unknown): number => (isTerminalStatus(v) ? 0 : 1);

/**
 * The report's reference day, `YYYY-MM-DD`.
 *
 * One line over dataCollector's isoDate, which is the SAME helper that
 * produced every dueDate, reviewDate and targetDate in this report. That is
 * the point: isoDate builds from LOCAL components, so a locally-midnight due
 * date and this "today" are on the same calendar. A second normalisation via
 * toISOString() would put them a day apart west of Greenwich — on the one
 * comparison §3 exists to enable.
 *
 * Exported: Stage 1 (sectionSummaries) needs the same "today" the facts block
 * declares. This is a fourth export beyond the three the contract froze, and
 * it is deliberate — the alternative is two date helpers.
 */
export const referenceDay = (value: unknown): string => isoDate(value) ?? isoDate(new Date())!;

interface SectionSpec {
  /** The rows to aggregate, flattened here for the nested sections. */
  rows: (section: any) => any[];
  /** Numeric fields already sitting on the section object — copied, never recomputed. */
  totals?: string[];
  /** Row fields to bucket by value. */
  counts?: string[];
  /** Row field carrying an owner; rows missing it are counted as ownerless. */
  owner?: string;
  /** Higher = more material. Applied BEFORE truncation, so the top-N is the
   *  worst N rather than the oldest N — the queries order by id/name ASC. */
  rank?: (row: any) => number;
  label: (row: any) => string;
}

const SPECS: Record<string, SectionSpec> = {
  projectRisks: {
    rows: (s) => s.risks ?? [],
    totals: ["totalRisks"],
    counts: ["riskLevel", "mitigationStatus"],
    owner: "owner",
    rank: (r) => materialityScore(r.riskLevel),
    label: (r) =>
      `${text(r.name)} (${text(r.riskLevel)}, ${text(r.mitigationStatus)}, owner ${text(r.owner)})`,
  },
  vendorRisks: {
    rows: (s) => s.risks ?? [],
    totals: ["totalRisks"],
    counts: ["riskLevel"],
    owner: "actionOwner",
    rank: (r) => materialityScore(r.riskLevel),
    label: (r) =>
      `${text(r.riskName)} (${text(r.vendorName)}, ${text(r.riskLevel)}, owner ${text(r.actionOwner)})`,
  },
  modelRisks: {
    rows: (s) => s.risks ?? [],
    totals: ["totalRisks"],
    counts: ["riskLevel", "mitigationStatus"],
    rank: (r) => materialityScore(r.riskLevel),
    label: (r) =>
      `${text(r.riskName)} (${text(r.modelName)}, ${text(r.riskLevel)}, ${text(r.mitigationStatus)})`,
  },
  compliance: {
    rows: (s) => s.controls ?? [],
    totals: ["totalControls", "completedControls", "overallProgress"],
    counts: ["status"],
    owner: "owner",
    rank: (r) => incomplete(r.status),
    label: (r) => `${text(r.controlId)} ${text(r.title)} (${text(r.status)}, owner ${text(r.owner)})`,
  },
  assessment: {
    rows: (s) => s.topics ?? [],
    totals: ["totalQuestions", "answeredQuestions"],
    rank: (r) => 100 - (typeof r.progress === "number" ? r.progress : 0),
    label: (r) => `${text(r.title)} (${typeof r.progress === "number" ? r.progress : 0}% answered)`,
  },
  clausesAndAnnexes: {
    // Leaves only, and symmetrically so: the top-level clause and annex rows
    // are both skipped because neither carries a status to bucket or rank on.
    // `clauses_struct_iso` / `annex_struct_iso` have no status column
    // (reporting.utils.ts:276), so dataCollector's `clause.status || "Unknown"`
    // is always literally "Unknown" — counting those rows would put a large
    // fabricated status_Unknown bucket in front of the model and let stateless
    // rows outrank real open work in the top-3. The clause id is not lost: it
    // is carried onto each sub-clause row below.
    rows: (s) => [
      ...(s.clauses ?? []).flatMap((c: any) =>
        (c.subClauses ?? []).map((sc: any) => ({
          _id: text(c.clauseId),
          _title: text(sc.title),
          status: sc.status,
        })),
      ),
      ...(s.annexes ?? []).flatMap((a: any) =>
        (a.controls ?? []).map((ac: any) => ({
          _id: text(ac.controlId),
          _title: text(ac.title),
          status: ac.status,
        })),
      ),
    ],
    counts: ["status"],
    rank: (r) => incomplete(r.status),
    label: (r) => `${r._id} ${r._title} (${text(r.status)})`,
  },
  nistSubcategories: {
    rows: (s) =>
      (s.functions ?? []).flatMap((f: any) =>
        (f.categories ?? []).flatMap((c: any) =>
          (c.subcategories ?? []).map((sub: any) => ({ ...sub, _fn: text(f.name) })),
        ),
      ),
    counts: ["status", "_fn"],
    rank: (r) => incomplete(r.status),
    label: (r) =>
      `${text(r.subcategoryId)} (${r._fn}, ${text(r.status)}, ${(r.risks ?? []).length} linked risks)`,
  },
  vendors: {
    rows: (s) => s.vendors ?? [],
    totals: ["totalVendors"],
    counts: ["riskStatus"],
    owner: "assignee",
    rank: (r) => (missing(r.assignee) ? 1 : 0),
    label: (r) => `${text(r.name)} (${text(r.riskStatus)}, assignee ${text(r.assignee)})`,
  },
  models: {
    rows: (s) => s.models ?? [],
    totals: ["totalModels"],
    // owner is bucketed deliberately: "all 25 models are owned by one person"
    // is a finding, and MAX_BUCKETS bounds the cost of a high-cardinality column.
    counts: ["status", "owner"],
    owner: "owner",
    rank: (r) => (missing(r.owner) ? 1 : 0),
    label: (r) => `${text(r.name)} ${text(r.version)} (${text(r.status)}, owner ${text(r.owner)})`,
  },
  trainingRegistry: {
    rows: (s) => s.records ?? [],
    totals: ["totalRecords"],
    counts: ["status"],
    owner: "assignee",
    rank: (r) => incomplete(r.status),
    label: (r) => `${text(r.trainingName)} (${text(r.status)}, completed ${text(r.completionDate)})`,
  },
  policyManager: {
    rows: (s) => s.policies ?? [],
    totals: ["totalPolicies"],
    counts: ["status"],
    owner: "owner",
    rank: (r) => (missing(r.reviewDate) ? 1 : 0),
    label: (r) =>
      `${text(r.policyName)} (${text(r.status)}, review ${text(r.reviewDate)}, owner ${text(r.owner)})`,
  },
  incidentManagement: {
    rows: (s) => s.incidents ?? [],
    totals: ["totalIncidents"],
    counts: ["severity", "status"],
    owner: "assignee",
    rank: (r) => materialityScore(r.severity),
    label: (r) =>
      `${text(r.incidentId)} ${text(r.type)} (${text(r.severity)}, ${text(r.status)}, reported ${text(r.reportedDate)})`,
  },
};

export function collectFacts(reportData: ReportData): FactsSnapshot {
  const meta: any = reportData?.metadata ?? {};
  const sections: Record<string, Agg> = {};

  const put = (key: string, name: string, value: number | string) => {
    if (!sections[key]) sections[key] = {};
    sections[key][name] = value;
  };

  for (const key of Object.keys(SPECS)) {
    const data: any = (reportData?.sections as any)?.[key];
    if (!data) continue;
    const spec = SPECS[key];
    const rows: any[] = (spec.rows(data) ?? []).filter(Boolean);

    for (const field of spec.totals ?? []) {
      if (typeof data[field] === "number") put(key, field, data[field]);
    }
    // Kept alongside the collector's own total on purpose: when the two
    // disagree, rows were dropped somewhere and the model can see that.
    put(key, "items", rows.length);

    for (const field of spec.counts ?? []) {
      const buckets: Record<string, number> = {};
      rows.forEach((row) => {
        const bucket = text(row?.[field]);
        buckets[bucket] = (buckets[bucket] ?? 0) + 1;
      });
      Object.entries(buckets)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_BUCKETS)
        .forEach(([bucket, count]) => put(key, `${field}_${bucket}`, count));
    }

    const ownerField = spec.owner;
    if (ownerField) {
      put(key, "ownerless", rows.filter((row) => missing(row?.[ownerField])).length);
    }

    const rank = spec.rank;
    const ranked = rank ? [...rows].sort((a, b) => rank(b) - rank(a)) : rows;
    ranked
      .slice(0, TOP_N)
      .forEach((row, i) => put(key, `top${i + 1}`, spec.label(row).slice(0, MAX_LABEL_CHARS)));
    if (rows.length > TOP_N) put(key, "top_showing", `showing ${TOP_N} of ${rows.length}`);
  }

  // The three rollups collectChartData already computed (dataCollector.ts:111)
  // and which were then discarded before any analyzer ran. No recomputation.
  const charts: any = reportData?.charts ?? {};
  // Same key namespace as the row-derived buckets on purpose: the chart is the
  // authoritative whole-set rollup, so it overwrites rather than duplicating.
  (charts.riskDistribution ?? []).forEach((d: any) =>
    put("projectRisks", `riskLevel_${text(d?.level)}`, Number(d?.count) || 0),
  );
  const progress = [...(charts.complianceProgress ?? [])].sort(
    (a: any, b: any) => (a?.percentage ?? 0) - (b?.percentage ?? 0),
  );
  progress
    .slice(0, TOP_N)
    .forEach((c: any, i: number) =>
      put(
        "compliance",
        `weakestCategory${i + 1}`,
        `${text(c?.category)} ${c?.completed ?? 0}/${c?.total ?? 0} (${c?.percentage ?? 0}%)`,
      ),
    );
  if (progress.length > TOP_N) {
    put("compliance", "weakestCategory_showing", `showing ${TOP_N} of ${progress.length}`);
  }
  (charts.assessmentStatus ?? []).forEach((a: any) =>
    put("assessment", `questions_${text(a?.status)}`, Number(a?.count) || 0),
  );

  return {
    generatedAt: referenceDay(meta.generatedAt),
    framework: meta.frameworkName ?? "AI governance",
    subject: meta.projectTitle ?? "the organization",
    sections,
  };
}
