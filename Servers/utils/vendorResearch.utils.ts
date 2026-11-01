import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  CategorySummaryEntry,
  DismissReason,
  EvidenceSource,
  FindingStatus,
  IVendorResearchRun,
  IVendorRiskFinding,
  LEGACY_CONFIDENCE_RULE,
  NewFinding,
  ResearchCategory,
  ResearchTrigger,
  RunCoverage,
  RunProgress,
  RunSearchEngine,
  SnapshotWrite,
  StoredSnapshot,
  VendorResearchSettings,
} from "../domain.layer/interfaces/i.vendorResearch";
import type { DecisionCountRow } from "../services/vendorResearch/decisionStats";
import type { RunTrace } from "../services/vendorResearch/trace";

/**
 * Queries for the vendor research agent: `vendor_research_runs` (one row per run),
 * `vendor_risk_findings` (the risk candidates a run produced), `vendor_research_settings` (what an
 * organization chose), `vendor_research_sources` (the documents a vendor's runs have shown to the
 * model) and `vendor_research_snapshots` (the text of the pages where a vendor states its terms,
 * as the last run read them). Every statement filters on `organization_id`, except `listScanOrganizationsQuery`, which
 * the scheduled scan uses to find the organizations that turned the scan on; the vendor an id
 * refers to must already have been checked against the caller's organization.
 */

const RUN_COLUMNS = `id, organization_id, vendor_id, trigger_type, status, categories,
  category_summary, evidence, model, prompt_version, searches_used, pages_read,
  duplicates_dropped, error, progress, requested_by, coverage, registry_version, search_engine,
  created_at, started_at, finished_at`;

const FINDING_COLUMN_NAMES: Array<keyof IVendorRiskFinding> = [
  "id",
  "organization_id",
  "vendor_id",
  "run_id",
  "category",
  "risk_description",
  "impact_description",
  "action_plan",
  "likelihood",
  "risk_severity",
  "risk_level",
  "confidence",
  "credibility",
  "credibility_basis",
  "rationale",
  "sources",
  "snippet_only",
  "status",
  "dismissed_reason",
  "dismissed_note",
  "accepted_vendor_risk_id",
  "decided_by",
  "decided_at",
  "created_at",
];

/** The basis of a finding with only a confidence: the rule that says so, and nothing else. */
const LEGACY_BASIS = `'{"rule":"${LEGACY_CONFIDENCE_RULE}"}'::jsonb`;

/**
 * A column of a finding as the queries read it. `confidence` is still read, but no run writes it
 * any more (M3, Part B1), and the label and its basis come with the legacy fallback: a finding of a
 * run before the credibility rule has a `confidence` and no `credibility`, and reads as a label of
 * that level on the basis `{ "rule": "legacy_confidence" }` until the backfill gives it its own.
 * A finding with a label reads as stored, and a row with neither reads null. `table` is the alias
 * a query joins the table under, with its dot.
 */
function findingColumn(column: keyof IVendorRiskFinding, table = ""): string {
  const own = (name: string) => `${table}${name}`;
  if (column === "credibility") {
    return `COALESCE(${own("credibility")}, ${own("confidence")}) AS credibility`;
  }
  if (column === "credibility_basis") {
    return (
      `CASE WHEN ${own("credibility")} IS NULL AND ${own("confidence")} IS NOT NULL ` +
      `THEN ${LEGACY_BASIS} ELSE ${own("credibility_basis")} END AS credibility_basis`
    );
  }
  return own(column);
}

const FINDING_COLUMNS = FINDING_COLUMN_NAMES.map((column) => findingColumn(column)).join(", ");
/** For queries that join `vendors`, where `id`, `organization_id` and `created_at` are ambiguous. */
const FINDING_COLUMNS_QUALIFIED = FINDING_COLUMN_NAMES.map((column) =>
  findingColumn(column, "f."),
).join(", ");

/** The error of a failed run is cut to this many characters. */
const ERROR_MAX_LENGTH = 500;

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

/**
 * Creates a queued run. Rejects with a unique violation on
 * `vendor_research_runs_active_uniq` when the vendor already has a queued or
 * running run.
 */
export const createRunQuery = async (input: {
  organizationId: number;
  vendorId: number;
  triggerType: ResearchTrigger;
  requestedBy: number | null;
}): Promise<IVendorResearchRun> => {
  const rows = (await sequelize.query(
    `INSERT INTO vendor_research_runs (organization_id, vendor_id, trigger_type, status, requested_by)
     VALUES (:organizationId, :vendorId, :triggerType, 'queued', :requestedBy)
     RETURNING ${RUN_COLUMNS}`,
    { replacements: input, type: QueryTypes.SELECT },
  )) as IVendorResearchRun[];
  return rows[0];
};

/**
 * Minutes after which a **queued** run counts as lost; pass it to `failStaleRunsQuery` as the
 * queued limit. A queued run older than this also stops counting toward the cooldown and the daily
 * cap (see `COUNTS_AS_A_RUN`) and is no longer started by a worker (see `markRunRunningQuery`),
 * which is why the start, the cooldown, the cap and the sweep of queued runs share this one number.
 * A running run has a limit of its own (`STALE_RUNNING_RUN_MINUTES`).
 */
export const STALE_RUN_MINUTES = 15;

/** The longest a run may run: the pipeline fails it as timed out at this age (see runVendorResearch). */
export const RUN_TIME_LIMIT_MINUTES = 20;

/** Room for the pipeline to write that failure before the sweep would. */
export const RUN_SWEEP_GRACE_MINUTES = 5;

/**
 * The age at which the sweep fails a **running** run: derived from the run's own limit, never
 * written as a number of its own, so the sweep can only reach a run that is already past its limit.
 */
export const STALE_RUNNING_RUN_MINUTES = RUN_TIME_LIMIT_MINUTES + RUN_SWEEP_GRACE_MINUTES;

/** The error of a run that ran or waited too long; the sweep and the pipeline write the same phrase. */
export const TIMED_OUT_ERROR = "timed out";

/**
 * Fails the vendor's lost runs, counted from the start (or from creation when they never started):
 * a queued run older than `queuedOlderThanMinutes` (its job was lost) and a running run older than
 * `runningOlderThanMinutes` (its worker died; a live run ends itself at RUN_TIME_LIMIT_MINUTES,
 * well before). Returns the number of runs failed.
 */
export const failStaleRunsQuery = async (
  organizationId: number,
  vendorId: number,
  queuedOlderThanMinutes: number = STALE_RUN_MINUTES,
  runningOlderThanMinutes: number = STALE_RUNNING_RUN_MINUTES,
): Promise<number> => {
  const failed = (await sequelize.query(
    `UPDATE vendor_research_runs
     SET status = 'failed', error = :timedOut, progress = NULL, finished_at = NOW()
     WHERE organization_id = :organizationId
       AND vendor_id = :vendorId
       AND (
         (status = 'queued'
           AND COALESCE(started_at, created_at) < NOW() - (:queuedOlderThanMinutes * INTERVAL '1 minute'))
         OR (status = 'running'
           AND COALESCE(started_at, created_at) < NOW() - (:runningOlderThanMinutes * INTERVAL '1 minute'))
       )
     RETURNING id`,
    {
      replacements: {
        organizationId,
        vendorId,
        queuedOlderThanMinutes,
        runningOlderThanMinutes,
        timedOut: TIMED_OUT_ERROR,
      },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ id: number }>;
  return failed.length;
};

/** The newest run matching `condition`; `id DESC` breaks ties between runs created in one transaction. */
const findRun = async (
  condition: string,
  replacements: { organizationId: number; vendorId?: number; runId?: number },
): Promise<IVendorResearchRun | null> => {
  const rows = (await sequelize.query(
    `SELECT ${RUN_COLUMNS} FROM vendor_research_runs
     WHERE organization_id = :organizationId AND ${condition}
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    { replacements, type: QueryTypes.SELECT },
  )) as IVendorResearchRun[];
  return rows[0] ?? null;
};

/** The vendor's queued or running run, if any. */
export const getActiveRunQuery = (
  organizationId: number,
  vendorId: number,
): Promise<IVendorResearchRun | null> =>
  findRun("vendor_id = :vendorId AND status IN ('queued', 'running')", {
    organizationId,
    vendorId,
  });

/** The vendor's newest run, whatever its status. */
export const getLatestRunQuery = (
  organizationId: number,
  vendorId: number,
): Promise<IVendorResearchRun | null> =>
  findRun("vendor_id = :vendorId", { organizationId, vendorId });

/** A run by id, whatever its status; null when it does not exist or belongs to another organization. */
export const getRunByIdQuery = (
  organizationId: number,
  runId: number,
): Promise<IVendorResearchRun | null> => findRun("id = :runId", { organizationId, runId });

/**
 * The trace of a run of the vendor (see services/vendorResearch/trace.ts); null when the run does
 * not exist, when it belongs to another vendor or organization, and when it has no trace: a run
 * that has not finished, and a run from before traces were kept. It is a query of its own because
 * the trace holds queries and addresses, so no column list that every role reads includes it.
 */
export const getRunTraceQuery = async (
  organizationId: number,
  vendorId: number,
  runId: number,
): Promise<RunTrace | null> => {
  const rows = (await sequelize.query(
    `SELECT trace FROM vendor_research_runs
     WHERE organization_id = :organizationId AND vendor_id = :vendorId AND id = :runId`,
    { replacements: { organizationId, vendorId, runId }, type: QueryTypes.SELECT },
  )) as Array<{ trace: RunTrace | null }>;
  return rows[0]?.trace ?? null;
};

/**
 * Moves a queued run to running. Returns false when the run is not queued (or not found), and when
 * it has been queued for longer than STALE_RUN_MINUTES.
 *
 * The age limit is the one of the cooldown and the daily cap: a queued run that old no longer
 * counts toward them (see `COUNTS_AS_A_RUN`), so a worker that picks its job up this late, after
 * an outage in which the jobs survived, must not start it either. Otherwise every such run would
 * search and call a model as soon as the worker came back, beyond a cap that no longer sees them.
 * It is left queued, and the sweep (`failStaleRunsQuery`) ends it as "timed out" without it ever
 * having started, which counts for nothing. The pipeline treats the `false` as a skipped run.
 */
export const markRunRunningQuery = async (
  organizationId: number,
  runId: number,
): Promise<boolean> => {
  const started = (await sequelize.query(
    `UPDATE vendor_research_runs SET status = 'running', started_at = NOW()
     WHERE organization_id = :organizationId AND id = :runId AND status = 'queued'
       AND created_at >= NOW() - (${STALE_RUN_MINUTES} * INTERVAL '1 minute')
     RETURNING id`,
    { replacements: { organizationId, runId }, type: QueryTypes.SELECT },
  )) as Array<{ id: number }>;
  return started.length > 0;
};

/**
 * Writes where a running run is (see `RunProgress`), replacing what it wrote before. It touches
 * only a run that is running, in the organization it is given: a write that comes late, after the
 * run ended (the queries that end a run empty the progress), finds no row and changes nothing, so
 * it can never bring a finished run back to life. It reports nothing when it writes nothing.
 */
export const updateRunProgressQuery = async (
  organizationId: number,
  runId: number,
  progress: RunProgress,
): Promise<void> => {
  await sequelize.query(
    `UPDATE vendor_research_runs SET progress = CAST(:progress AS JSONB)
     WHERE organization_id = :organizationId AND id = :runId AND status = 'running'`,
    {
      replacements: { organizationId, runId, progress: JSON.stringify(progress) },
      type: QueryTypes.UPDATE,
    },
  );
};

export interface FinishRunInput {
  organizationId: number;
  runId: number;
  status: "completed" | "failed";
  categories: ResearchCategory[];
  categorySummary: CategorySummaryEntry[];
  evidence: EvidenceSource[] | null;
  model: string | null;
  promptVersion: string | null;
  searchesUsed: number;
  pagesRead: number;
  duplicatesDropped: number;
  error: string | null;
  /** What the run did (see services/vendorResearch/trace.ts); null for a run that did nothing. */
  trace: RunTrace | null;
  /** What a run of the vendor risk database checked; null for a run that has no coverage. */
  coverage: RunCoverage | null;
  /** The version of the source registry that classified the sources; null as `coverage`. */
  registryVersion: string | null;
  /**
   * The search the run's searches went to (see `RunSearchEngine`); null, or left out, for a run
   * that searched nothing and for a run none of whose searches was answered. A caller that never searched, such as the start that could not queue its
   * job, leaves it out.
   */
  searchEngine?: RunSearchEngine | null;
}

/**
 * Records how a run ended. `error` is cut to 500 characters.
 *
 * It ends only a run that has not ended: a queued or running run. A run that is completed or
 * failed, including one that the stale sweep (`failStaleRunsQuery`) failed, is never overwritten,
 * so the first end of a run stands and a late finish changes nothing. It returns true when it
 * wrote the run and false when it wrote nothing, because the run had ended, belongs to another
 * organization or does not exist; a caller that saves findings with the finish rolls them back on
 * false (see `completeRun`).
 *
 * It matches on organization and run id.
 */
export const finishRunQuery = async (
  input: FinishRunInput,
  transaction?: Transaction,
): Promise<boolean> => {
  const written = (await sequelize.query(
    `UPDATE vendor_research_runs
     SET status = :status,
         categories = ARRAY[:categories]::text[],
         category_summary = CAST(:categorySummary AS JSONB),
         evidence = CAST(:evidence AS JSONB),
         model = :model,
         prompt_version = :promptVersion,
         searches_used = :searchesUsed,
         pages_read = :pagesRead,
         duplicates_dropped = :duplicatesDropped,
         error = LEFT(:error, ${ERROR_MAX_LENGTH}),
         trace = CAST(:trace AS JSONB),
         coverage = CAST(:coverage AS JSONB),
         registry_version = :registryVersion,
         search_engine = :searchEngine,
         progress = NULL,
         finished_at = NOW()
     WHERE organization_id = :organizationId AND id = :runId AND status IN ('queued', 'running')
     RETURNING id`,
    {
      replacements: {
        ...input,
        categorySummary: JSON.stringify(input.categorySummary),
        evidence: input.evidence === null ? null : JSON.stringify(input.evidence),
        trace: input.trace ? JSON.stringify(input.trace) : null,
        coverage: input.coverage === null ? null : JSON.stringify(input.coverage),
        // Always named, or a caller that leaves it out would leave the replacement without a value.
        searchEngine: input.searchEngine ?? null,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{ id: number }>;
  return written.length > 0;
};

/**
 * Which runs count toward the cooldown and the daily cap: all of them but two kinds, which
 * searched nothing and called no model, so they must not hold the vendor back or use up a slot.
 *
 * - A run that failed before it started: its job could not be queued, or it was swept as stuck
 *   while still queued. A start refused with 503 can therefore be tried again at once. Only
 *   `markRunRunningQuery` sets `started_at`, so a null one means the run never started.
 * - A run that is still queued after STALE_RUN_MINUTES, the limit of the sweep
 *   (`failStaleRunsQuery`): its job was lost, for example because every API start empties the
 *   queue of waiting jobs. The sweep only looks at the vendor that is started or whose latest run
 *   is read, so such a run can stay queued for as long as nobody opens its vendor, and would use
 *   up a slot of the daily cap for the whole 24 hours. When the sweep does reach it, it fails
 *   without having started, which is the first kind. A worker whose job for the run turns up late
 *   does not start it either (`markRunRunningQuery` has the same age limit), so a run that has
 *   stopped counting can only end that way and never searches.
 *
 * A running run counts however long it has run, and so do a completed run and a run that failed
 * after it started: they searched, or may still be searching.
 */
const COUNTS_AS_A_RUN = `NOT (
  (status = 'failed' AND started_at IS NULL)
  OR (status = 'queued' AND created_at < NOW() - (${STALE_RUN_MINUTES} * INTERVAL '1 minute'))
)`;

/**
 * When the vendor's newest run was created, whatever its status and trigger type, except the runs
 * that do not count (see `COUNTS_AS_A_RUN`); null when it has no such run.
 */
export const getLastRunCreatedAtQuery = async (
  organizationId: number,
  vendorId: number,
): Promise<Date | null> => {
  const rows = (await sequelize.query(
    `SELECT MAX(created_at) AS created_at FROM vendor_research_runs
     WHERE organization_id = :organizationId AND vendor_id = :vendorId AND ${COUNTS_AS_A_RUN}`,
    { replacements: { organizationId, vendorId }, type: QueryTypes.SELECT },
  )) as Array<{ created_at: Date | null }>;
  return rows[0]?.created_at ?? null;
};

/**
 * The organization's runs created at or after `since`, whatever their status and trigger type,
 * except the runs that do not count (see `COUNTS_AS_A_RUN`).
 */
export const countRunsSinceQuery = async (organizationId: number, since: Date): Promise<number> => {
  const rows = (await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM vendor_research_runs
     WHERE organization_id = :organizationId AND created_at >= :since AND ${COUNTS_AS_A_RUN}`,
    { replacements: { organizationId, since }, type: QueryTypes.SELECT },
  )) as Array<{ count: number }>;
  return rows[0].count;
};

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

/**
 * Stores a run's findings as pending, in input order. Run it in the transaction that finishes the
 * run. It writes no confidence: the column stays, nullable, until the contract migration (M3, Part
 * B2), and the rows it writes leave it null.
 */
export const insertFindingsQuery = async (
  input: { organizationId: number; vendorId: number; runId: number; findings: NewFinding[] },
  transaction: Transaction,
): Promise<IVendorRiskFinding[]> => {
  const inserted: IVendorRiskFinding[] = [];
  // A run yields a handful of findings at most; one insert each keeps the returned order.
  for (const finding of input.findings) {
    const rows = (await sequelize.query(
      `INSERT INTO vendor_risk_findings
         (organization_id, vendor_id, run_id, category, risk_description, impact_description,
          action_plan, likelihood, risk_severity, risk_level, credibility,
          credibility_basis, rationale, sources, snippet_only)
       VALUES
         (:organizationId, :vendorId, :runId, :category, :riskDescription, :impactDescription,
          :actionPlan, :likelihood, :riskSeverity, :riskLevel, :credibility,
          CAST(:credibilityBasis AS JSONB), :rationale, CAST(:sources AS JSONB), :snippetOnly)
       RETURNING ${FINDING_COLUMNS}`,
      {
        replacements: {
          organizationId: input.organizationId,
          vendorId: input.vendorId,
          runId: input.runId,
          category: finding.category,
          riskDescription: finding.risk_description,
          impactDescription: finding.impact_description,
          actionPlan: finding.action_plan,
          likelihood: finding.likelihood,
          riskSeverity: finding.risk_severity,
          riskLevel: finding.risk_level,
          credibility: finding.credibility ?? null,
          credibilityBasis: finding.credibility_basis
            ? JSON.stringify(finding.credibility_basis)
            : null,
          rationale: finding.rationale ?? null,
          sources: JSON.stringify(finding.sources),
          snippetOnly: finding.snippet_only === true,
        },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as IVendorRiskFinding[];
    inserted.push(rows[0]);
  }
  return inserted;
};

/**
 * One page of the organization's findings, with the vendor's name: the newest run first, and the
 * findings of one run in the order they were stored, which is most severe first. The findings of
 * a run share their `created_at` (one transaction stores them), so `id ASC` is what keeps that
 * order, and the pair is a total order, so pages neither repeat nor skip a finding.
 */
export const listFindingsQuery = async (
  organizationId: number,
  filter: { status?: FindingStatus; vendorId?: number; limit: number; offset: number },
): Promise<{ rows: Array<IVendorRiskFinding & { vendor_name: string }>; total: number }> => {
  const conditions = ["f.organization_id = :organizationId"];
  const replacements: Record<string, string | number> = {
    organizationId,
    limit: filter.limit,
    offset: filter.offset,
  };
  if (filter.status !== undefined) {
    conditions.push("f.status = :status");
    replacements.status = filter.status;
  }
  if (filter.vendorId !== undefined) {
    conditions.push("f.vendor_id = :vendorId");
    replacements.vendorId = filter.vendorId;
  }
  // The join is scoped to the organization too, so a finding stamped with the wrong
  // organization can never return another organization's vendor name.
  const fromWhere = `FROM vendor_risk_findings f
     JOIN vendors v ON v.id = f.vendor_id AND v.organization_id = :organizationId
     WHERE ${conditions.join(" AND ")}`;

  const [rows, totals] = await Promise.all([
    sequelize.query(
      `SELECT ${FINDING_COLUMNS_QUALIFIED}, v.vendor_name
       ${fromWhere}
       ORDER BY f.created_at DESC, f.id ASC
       LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    ),
    sequelize.query(`SELECT COUNT(*)::int AS total ${fromWhere}`, {
      replacements,
      type: QueryTypes.SELECT,
    }),
  ]);
  return {
    rows: rows as Array<IVendorRiskFinding & { vendor_name: string }>,
    total: (totals as Array<{ total: number }>)[0].total,
  };
};

/**
 * `forUpdate` locks the row until the transaction ends; it only means something with a transaction.
 *
 * `noWait` only means something together with `forUpdate`: a row that another transaction holds is
 * then not waited for, and Postgres refuses at once with error 55P03 (lock_not_available), which
 * Sequelize raises as a database error. A transaction that waits keeps its pooled connection, so
 * a caller that must not queue for a row asks for it.
 */
export const getFindingByIdQuery = async (
  organizationId: number,
  id: number,
  options: { transaction?: Transaction; forUpdate?: boolean; noWait?: boolean } = {},
): Promise<IVendorRiskFinding | null> => {
  const lock = options.forUpdate ? ` FOR UPDATE${options.noWait ? " NOWAIT" : ""}` : "";
  const rows = (await sequelize.query(
    `SELECT ${FINDING_COLUMNS} FROM vendor_risk_findings
     WHERE organization_id = :organizationId AND id = :id${lock}`,
    {
      replacements: { organizationId, id },
      type: QueryTypes.SELECT,
      transaction: options.transaction,
    },
  )) as IVendorRiskFinding[];
  return rows[0] ?? null;
};

/**
 * All the vendor's findings, whatever their status: the newest run first, and the findings of one
 * run in the order they were stored (see `listFindingsQuery`).
 */
export const getFindingsForVendorQuery = async (
  organizationId: number,
  vendorId: number,
): Promise<IVendorRiskFinding[]> =>
  (await sequelize.query(
    `SELECT ${FINDING_COLUMNS} FROM vendor_risk_findings
     WHERE organization_id = :organizationId AND vendor_id = :vendorId
     ORDER BY created_at DESC, id ASC`,
    { replacements: { organizationId, vendorId }, type: QueryTypes.SELECT },
  )) as IVendorRiskFinding[];

/**
 * Marks a pending finding accepted into the register as `vendorRiskId`.
 * Returns null when the finding is not pending (or not found).
 */
export const markFindingAcceptedQuery = async (
  input: { organizationId: number; id: number; vendorRiskId: number; userId: number },
  transaction: Transaction,
): Promise<IVendorRiskFinding | null> => {
  const rows = (await sequelize.query(
    `UPDATE vendor_risk_findings
     SET status = 'accepted', accepted_vendor_risk_id = :vendorRiskId,
         decided_by = :userId, decided_at = NOW()
     WHERE organization_id = :organizationId AND id = :id AND status = 'pending'
     RETURNING ${FINDING_COLUMNS}`,
    { replacements: input, type: QueryTypes.SELECT, transaction },
  )) as IVendorRiskFinding[];
  return rows[0] ?? null;
};

/**
 * How many findings of the organization are in each state, by the prompt version of the run that
 * produced them, the category, and (for a dismissed one) the reason. The rows are folded by
 * services/vendorResearch/decisionStats.ts into the rate of acceptance of each prompt version.
 */
export const getDecisionCountsQuery = async (organizationId: number): Promise<DecisionCountRow[]> =>
  (await sequelize.query(
    `SELECT r.prompt_version, f.category, f.status, f.dismissed_reason, COUNT(*)::int AS count
     FROM vendor_risk_findings f
     JOIN vendor_research_runs r
       ON r.id = f.run_id AND r.organization_id = f.organization_id
     WHERE f.organization_id = :organizationId
     GROUP BY r.prompt_version, f.category, f.status, f.dismissed_reason`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as DecisionCountRow[];

/** Marks a pending finding dismissed. Returns null when the finding is not pending (or not found). */
export const markFindingDismissedQuery = async (
  input: {
    organizationId: number;
    id: number;
    reason: DismissReason;
    note: string | null;
    userId: number;
  },
  transaction?: Transaction,
): Promise<IVendorRiskFinding | null> => {
  const rows = (await sequelize.query(
    `UPDATE vendor_risk_findings
     SET status = 'dismissed', dismissed_reason = :reason, dismissed_note = :note,
         decided_by = :userId, decided_at = NOW()
     WHERE organization_id = :organizationId AND id = :id AND status = 'pending'
     RETURNING ${FINDING_COLUMNS}`,
    { replacements: input, type: QueryTypes.SELECT, transaction },
  )) as IVendorRiskFinding[];
  return rows[0] ?? null;
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

interface SettingsRow {
  research_llm_key_id: number | null;
  analysis_llm_key_id: number | null;
  scan_interval_days: number | null;
}

const settingsOf = (row: SettingsRow | undefined): VendorResearchSettings => ({
  researchKeyId: row?.research_llm_key_id ?? null,
  analysisKeyId: row?.analysis_llm_key_id ?? null,
  scanIntervalDays: row?.scan_interval_days ?? null,
});

/** What the organization chose for its runs; nothing chosen (no row) is three nulls. */
export const getVendorResearchSettingsQuery = async (
  organizationId: number,
): Promise<VendorResearchSettings> => {
  const rows = (await sequelize.query(
    `SELECT research_llm_key_id, analysis_llm_key_id, scan_interval_days
     FROM vendor_research_settings
     WHERE organization_id = :organizationId`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as SettingsRow[];
  return settingsOf(rows[0]);
};

/**
 * Stores the organization's choices, replacing the earlier ones. A key is stored only when it is
 * one of the organization's own, even if the caller did not check (the sub-select turns another
 * organization's key into null); the service checks first and says so to the user.
 *
 * The scan interval is replaced only when the input names it: `undefined` leaves what is stored (a
 * page that does not know the setting saves the keys and must not turn the scan off), `null` turns
 * the scan off.
 */
export const saveVendorResearchSettingsQuery = async (
  input: {
    organizationId: number;
    userId: number;
    researchKeyId: number | null;
    analysisKeyId: number | null;
    scanIntervalDays?: number | null;
  },
  transaction?: Transaction,
): Promise<VendorResearchSettings> => {
  const { scanIntervalDays, ...rest } = input;
  const rows = (await sequelize.query(
    `INSERT INTO vendor_research_settings
       (organization_id, research_llm_key_id, analysis_llm_key_id, scan_interval_days,
        updated_by, updated_at)
     VALUES (
       :organizationId,
       (SELECT id FROM llm_keys WHERE organization_id = :organizationId AND id = :researchKeyId),
       (SELECT id FROM llm_keys WHERE organization_id = :organizationId AND id = :analysisKeyId),
       :scanIntervalDays,
       :userId,
       NOW()
     )
     ON CONFLICT (organization_id) DO UPDATE SET
       research_llm_key_id = EXCLUDED.research_llm_key_id,
       analysis_llm_key_id = EXCLUDED.analysis_llm_key_id,
       scan_interval_days = CASE
         WHEN :changesScanInterval THEN EXCLUDED.scan_interval_days
         ELSE vendor_research_settings.scan_interval_days
       END,
       updated_by = EXCLUDED.updated_by,
       updated_at = EXCLUDED.updated_at
     RETURNING research_llm_key_id, analysis_llm_key_id, scan_interval_days`,
    {
      replacements: {
        ...rest,
        scanIntervalDays: scanIntervalDays ?? null,
        changesScanInterval: scanIntervalDays !== undefined,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as SettingsRow[];
  return settingsOf(rows[0]);
};

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/**
 * The keys (see `sourceKey` in services/webResearch/urlCanon.ts) of the documents that the runs of
 * the vendor showed to the model. A scheduled run analyses the sources whose key is not among them.
 */
export const getKnownSourceKeysQuery = async (
  organizationId: number,
  vendorId: number,
): Promise<Set<string>> => {
  const rows = (await sequelize.query(
    `SELECT source_key FROM vendor_research_sources
     WHERE organization_id = :organizationId AND vendor_id = :vendorId`,
    { replacements: { organizationId, vendorId }, type: QueryTypes.SELECT },
  )) as Array<{ source_key: string }>;
  return new Set(rows.map((row) => row.source_key));
};

/**
 * Remembers the sources of a run. A key that is known keeps the run that first saw it and has its
 * time of last sight moved. Nothing is written for a vendor that is not in the organization, and a
 * run of another organization is not pointed at (the sub-select turns it into null). The same key
 * twice in `keys` is one row.
 */
export const rememberSourcesQuery = async (
  input: { organizationId: number; vendorId: number; runId: number; keys: readonly string[] },
  transaction?: Transaction,
): Promise<void> => {
  if (input.keys.length === 0) return;
  await sequelize.query(
    `INSERT INTO vendor_research_sources (organization_id, vendor_id, source_key, first_seen_run_id)
     SELECT v.organization_id, v.id, wanted.source_key,
            (SELECT r.id FROM vendor_research_runs r
             WHERE r.id = :runId AND r.organization_id = :organizationId)
     FROM vendors v
     CROSS JOIN (
       SELECT DISTINCT source_key FROM unnest(ARRAY[:keys]::text[]) AS keys(source_key)
     ) wanted
     WHERE v.organization_id = :organizationId AND v.id = :vendorId
     ON CONFLICT (organization_id, vendor_id, source_key) DO UPDATE SET last_seen_at = NOW()`,
    { replacements: { ...input, keys: [...input.keys] }, type: QueryTypes.INSERT, transaction },
  );
};

// ---------------------------------------------------------------------------
// Snapshots of the pages where a vendor states its terms
// ---------------------------------------------------------------------------

/** A page that no run has read for this many days is forgotten: it moved, or it is gone. */
const SNAPSHOT_FORGET_AFTER_DAYS = 365;

/**
 * The pages of the vendor that were kept, among those with the given keys (see `sourceKey` in
 * services/webResearch/urlCanon.ts), by key: the hash and the lines of the text, and the last time
 * a run read the page with that text.
 */
export const getSnapshotsQuery = async (
  organizationId: number,
  vendorId: number,
  pageKeys: readonly string[],
): Promise<Map<string, StoredSnapshot>> => {
  if (pageKeys.length === 0) return new Map();
  const rows = (await sequelize.query(
    `SELECT page_key, text_hash, body, last_seen_at
     FROM vendor_research_snapshots
     WHERE organization_id = :organizationId AND vendor_id = :vendorId
       AND page_key IN (:pageKeys)`,
    {
      replacements: { organizationId, vendorId, pageKeys: [...pageKeys] },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ page_key: string; text_hash: string; body: string; last_seen_at: Date }>;
  return new Map(
    rows.map((row) => [
      row.page_key,
      { hash: row.text_hash, body: row.body, lastSeenAt: row.last_seen_at },
    ]),
  );
};

/**
 * Keeps the pages a completed run read, all or none. A page that is known has its time of last
 * sight moved; when its text changed it also takes the new text, the run that read it, and the
 * time of the change. Nothing is written for a vendor that is not in the organization, and a run of
 * another organization is not pointed at (the sub-select turns it into null). Afterwards the pages
 * of the vendor that no run has read for SNAPSHOT_FORGET_AFTER_DAYS are forgotten.
 */
export const saveSnapshotsQuery = async (
  input: {
    organizationId: number;
    vendorId: number;
    runId: number;
    writes: readonly SnapshotWrite[];
  },
  transaction?: Transaction,
): Promise<void> => {
  const { organizationId, vendorId, runId, writes } = input;
  if (writes.length === 0) return;
  const saveAll = async (inside: Transaction) => {
    for (const write of writes) {
      await sequelize.query(
        `INSERT INTO vendor_research_snapshots
           (organization_id, vendor_id, page_key, url, kind, title, text_hash, body, captured_run_id)
         SELECT v.organization_id, v.id, :pageKey, :url, :kind, :title, :hash, :body,
                (SELECT r.id FROM vendor_research_runs r
                 WHERE r.id = :runId AND r.organization_id = :organizationId)
         FROM vendors v
         WHERE v.organization_id = :organizationId AND v.id = :vendorId
         ON CONFLICT (organization_id, vendor_id, page_key) DO UPDATE SET
           url = EXCLUDED.url,
           kind = EXCLUDED.kind,
           title = EXCLUDED.title,
           captured_run_id = CASE
             WHEN vendor_research_snapshots.text_hash <> EXCLUDED.text_hash
               THEN EXCLUDED.captured_run_id
             ELSE vendor_research_snapshots.captured_run_id
           END,
           captured_at = CASE
             WHEN vendor_research_snapshots.text_hash <> EXCLUDED.text_hash THEN NOW()
             ELSE vendor_research_snapshots.captured_at
           END,
           body = EXCLUDED.body,
           text_hash = EXCLUDED.text_hash,
           last_seen_at = NOW()`,
        {
          replacements: { organizationId, vendorId, runId, ...write },
          type: QueryTypes.INSERT,
          transaction: inside,
        },
      );
    }
    await sequelize.query(
      `DELETE FROM vendor_research_snapshots
       WHERE organization_id = :organizationId AND vendor_id = :vendorId
         AND last_seen_at < NOW() - (:days * INTERVAL '1 day')`,
      {
        replacements: { organizationId, vendorId, days: SNAPSHOT_FORGET_AFTER_DAYS },
        type: QueryTypes.DELETE,
        transaction: inside,
      },
    );
  };
  if (transaction) await saveAll(transaction);
  else await sequelize.transaction(saveAll);
};

// ---------------------------------------------------------------------------
// The scheduled scan
// ---------------------------------------------------------------------------

/**
 * The organizations that turned the scheduled scan on, with the days between two scans of a
 * vendor. The one query of this file that is not scoped to an organization: the scan has to find
 * them first, and it reads two numbers.
 */
export const listScanOrganizationsQuery = async (): Promise<
  Array<{ organizationId: number; intervalDays: number }>
> => {
  const rows = (await sequelize.query(
    `SELECT organization_id, scan_interval_days FROM vendor_research_settings
     WHERE scan_interval_days IS NOT NULL
     ORDER BY organization_id`,
    { type: QueryTypes.SELECT },
  )) as Array<{ organization_id: number; scan_interval_days: number }>;
  return rows.map((row) => ({
    organizationId: row.organization_id,
    intervalDays: row.scan_interval_days,
  }));
};

/**
 * The vendors of the organization whose scan is due, at most `limit` of them: the vendors with no
 * run that counts (see `COUNTS_AS_A_RUN`) first, in the order they were added, then those whose
 * newest run, of any trigger, is older than the interval, the one researched longest ago first.
 * A demo vendor is never researched.
 */
export const listDueVendorsQuery = async (input: {
  organizationId: number;
  intervalDays: number;
  limit: number;
}): Promise<number[]> => {
  const rows = (await sequelize.query(
    `SELECT v.id
     FROM vendors v
     LEFT JOIN LATERAL (
       SELECT MAX(r.created_at) AS last_at
       FROM vendor_research_runs r
       WHERE r.organization_id = v.organization_id AND r.vendor_id = v.id AND ${COUNTS_AS_A_RUN}
     ) newest ON TRUE
     WHERE v.organization_id = :organizationId
       AND v.is_demo = false
       AND (newest.last_at IS NULL
            OR newest.last_at < NOW() - (:intervalDays * INTERVAL '1 day'))
     ORDER BY newest.last_at ASC NULLS FIRST, v.id ASC
     LIMIT :limit`,
    { replacements: input, type: QueryTypes.SELECT },
  )) as Array<{ id: number }>;
  return rows.map((row) => row.id);
};
