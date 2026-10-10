import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  CategorySummaryEntry,
  DismissReason,
  EvidenceSource,
  FindingStatus,
  IVendorResearchRun,
  IVendorRiskFinding,
  NewFinding,
  ResearchCategory,
  ResearchTrigger,
} from "../domain.layer/interfaces/i.vendorResearch";

/**
 * Queries for the vendor research agent: `vendor_research_runs` (one row per run)
 * and `vendor_risk_findings` (the risk candidates a run produced). Every
 * statement filters on `organization_id`; the vendor an id refers to must
 * already have been checked against the caller's organization.
 */

const RUN_COLUMNS = `id, organization_id, vendor_id, trigger_type, status, categories,
  category_summary, evidence, search_provider, model, prompt_version, searches_used,
  duplicates_dropped, error, requested_by, created_at, started_at, finished_at`;

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
  "sources",
  "status",
  "dismissed_reason",
  "dismissed_note",
  "accepted_vendor_risk_id",
  "decided_by",
  "decided_at",
  "created_at",
];
const FINDING_COLUMNS = FINDING_COLUMN_NAMES.join(", ");
/** For queries that join `vendors`, where `id`, `organization_id` and `created_at` are ambiguous. */
const FINDING_COLUMNS_QUALIFIED = FINDING_COLUMN_NAMES.map((column) => `f.${column}`).join(", ");

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
 * Fails the vendor's queued or running runs whose age, counted from the start
 * (or from creation when they never started), exceeds the limit.
 * Returns the number of runs failed.
 */
export const failStaleRunsQuery = async (
  organizationId: number,
  vendorId: number,
  olderThanMinutes: number,
): Promise<number> => {
  const failed = (await sequelize.query(
    `UPDATE vendor_research_runs
     SET status = 'failed', error = 'timed out', finished_at = NOW()
     WHERE organization_id = :organizationId
       AND vendor_id = :vendorId
       AND status IN ('queued', 'running')
       AND COALESCE(started_at, created_at) < NOW() - (:olderThanMinutes * INTERVAL '1 minute')
     RETURNING id`,
    { replacements: { organizationId, vendorId, olderThanMinutes }, type: QueryTypes.SELECT },
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

/** Moves a queued run to running. Returns false when the run is not queued (or not found). */
export const markRunRunningQuery = async (
  organizationId: number,
  runId: number,
): Promise<boolean> => {
  const started = (await sequelize.query(
    `UPDATE vendor_research_runs SET status = 'running', started_at = NOW()
     WHERE organization_id = :organizationId AND id = :runId AND status = 'queued'
     RETURNING id`,
    { replacements: { organizationId, runId }, type: QueryTypes.SELECT },
  )) as Array<{ id: number }>;
  return started.length > 0;
};

export interface FinishRunInput {
  organizationId: number;
  runId: number;
  status: "completed" | "failed";
  categories: ResearchCategory[];
  categorySummary: CategorySummaryEntry[];
  evidence: EvidenceSource[] | null;
  searchProvider: string | null;
  model: string | null;
  promptVersion: string | null;
  searchesUsed: number;
  duplicatesDropped: number;
  error: string | null;
}

/**
 * Records how a run ended. `error` is cut to 500 characters.
 *
 * There is no status guard: a late finish can overwrite a run that the stale sweep
 * (`failStaleRunsQuery`) already failed, and a `failed` finish can overwrite a
 * `completed` one, so callers must finish a run exactly once.
 *
 * It matches on organization and run id only. When either does not match, it
 * updates nothing and reports nothing: a silent no-op.
 */
export const finishRunQuery = async (
  input: FinishRunInput,
  transaction?: Transaction,
): Promise<void> => {
  await sequelize.query(
    `UPDATE vendor_research_runs
     SET status = :status,
         categories = ARRAY[:categories]::text[],
         category_summary = CAST(:categorySummary AS JSONB),
         evidence = CAST(:evidence AS JSONB),
         search_provider = :searchProvider,
         model = :model,
         prompt_version = :promptVersion,
         searches_used = :searchesUsed,
         duplicates_dropped = :duplicatesDropped,
         error = LEFT(:error, ${ERROR_MAX_LENGTH}),
         finished_at = NOW()
     WHERE organization_id = :organizationId AND id = :runId`,
    {
      replacements: {
        ...input,
        categorySummary: JSON.stringify(input.categorySummary),
        evidence: input.evidence === null ? null : JSON.stringify(input.evidence),
      },
      type: QueryTypes.UPDATE,
      transaction,
    },
  );
};

/** When the vendor's newest run was created, whatever its status and trigger type; null when it never had one. */
export const getLastRunCreatedAtQuery = async (
  organizationId: number,
  vendorId: number,
): Promise<Date | null> => {
  const rows = (await sequelize.query(
    `SELECT MAX(created_at) AS created_at FROM vendor_research_runs
     WHERE organization_id = :organizationId AND vendor_id = :vendorId`,
    { replacements: { organizationId, vendorId }, type: QueryTypes.SELECT },
  )) as Array<{ created_at: Date | null }>;
  return rows[0]?.created_at ?? null;
};

/** The organization's runs created at or after `since`, whatever their status and trigger type. */
export const countRunsSinceQuery = async (organizationId: number, since: Date): Promise<number> => {
  const rows = (await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM vendor_research_runs
     WHERE organization_id = :organizationId AND created_at >= :since`,
    { replacements: { organizationId, since }, type: QueryTypes.SELECT },
  )) as Array<{ count: number }>;
  return rows[0].count;
};

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

/** Stores a run's findings as pending, in input order. Run it in the transaction that finishes the run. */
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
          action_plan, likelihood, risk_severity, risk_level, confidence, sources)
       VALUES
         (:organizationId, :vendorId, :runId, :category, :riskDescription, :impactDescription,
          :actionPlan, :likelihood, :riskSeverity, :riskLevel, :confidence, CAST(:sources AS JSONB))
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
          confidence: finding.confidence,
          sources: JSON.stringify(finding.sources),
        },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as IVendorRiskFinding[];
    inserted.push(rows[0]);
  }
  return inserted;
};

/** One page of the organization's findings, newest first, with the vendor's name. */
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
       ORDER BY f.created_at DESC, f.id DESC
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

/** `forUpdate` locks the row until the transaction ends; it only means something with a transaction. */
export const getFindingByIdQuery = async (
  organizationId: number,
  id: number,
  options: { transaction?: Transaction; forUpdate?: boolean } = {},
): Promise<IVendorRiskFinding | null> => {
  const lock = options.forUpdate ? " FOR UPDATE" : "";
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

/** All the vendor's findings, whatever their status, newest first. */
export const getFindingsForVendorQuery = async (
  organizationId: number,
  vendorId: number,
): Promise<IVendorRiskFinding[]> =>
  (await sequelize.query(
    `SELECT ${FINDING_COLUMNS} FROM vendor_risk_findings
     WHERE organization_id = :organizationId AND vendor_id = :vendorId
     ORDER BY created_at DESC, id DESC`,
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
