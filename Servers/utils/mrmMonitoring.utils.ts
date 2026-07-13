import { QueryTypes, Transaction } from "sequelize";
import crypto from "crypto";
import { sequelize } from "../database/db";
import {
  MrmBreachAction,
  MrmEvalStatus,
  MrmThresholdOp,
  MrmThresholdSeverity,
} from "../domain.layer/enums/mrmMonitoring.enum";
import { MrmThresholdModel } from "../domain.layer/models/mrm/mrmThreshold.model";
import { MrmMetricKeyModel } from "../domain.layer/models/mrm/mrmMetricKey.model";
import { MrmThresholdSnapshot } from "../domain.layer/interfaces/i.mrmMetricEvaluation";

/**
 * MRM (Model Risk Management) — Branch 2 (monitoring / ingestion) data-access +
 * the threshold-evaluation engine.
 *
 * Every query is tenant-isolated: `WHERE organization_id = :organizationId`.
 * Table names are UNQUALIFIED — the `search_path = verifywise` afterConnect hook
 * resolves the schema. Thin controllers call into these functions; all SQL and
 * the pure evaluation function live here per the backend Layer Flow.
 *
 * The threshold-evaluation engine (`evaluateThreshold` + `selectThreshold` +
 * `evaluatePoint`) is the correctness-critical, examiner-inspected core. It is
 * deterministic and pure (no I/O), so it is directly unit-testable.
 */

// PostgreSQL SQLSTATE for unique_violation (idempotency UNIQUE breach).
const PG_UNIQUE_VIOLATION = "23505";

// A missing window normalises to '' and a missing segment to 'overall' — the
// same concrete sentinels the mrm_metrics table defaults to. These MUST match
// the DB defaults so app-level and DB-level dedup agree.
export const DEFAULT_WINDOW = "";
export const DEFAULT_SEGMENT = "overall";

export const normalizeWindow = (window?: string | null): string =>
  window === undefined || window === null ? DEFAULT_WINDOW : window;

export const normalizeSegment = (segment?: string | null): string =>
  segment === undefined || segment === null || segment === "" ? DEFAULT_SEGMENT : segment;

// ===========================================================================
// Threshold-evaluation engine — the regulatory core (pure, deterministic)
// ===========================================================================

/**
 * A threshold as the evaluator needs it. A subset of the full row: only the
 * fields that drive the verdict + severity, plus segment/window used for
 * matching and the snapshot.
 */
export interface EvaluableThreshold {
  id: number;
  metric: string;
  segment: string | null;
  window: string | null;
  op: MrmThresholdOp;
  value_num: number | null;
  value_lo: number | null;
  value_hi: number | null;
  severity: MrmThresholdSeverity;
  breach_action: MrmBreachAction;
  active: boolean;
}

/** The point being evaluated (already normalised for segment/window). */
export interface EvaluablePoint {
  metric: string;
  value: number;
  segment: string;
  window: string;
}

export interface ThresholdEvaluation {
  status: MrmEvalStatus;
  breached: boolean;
  threshold: EvaluableThreshold | null;
  snapshot: MrmThresholdSnapshot | null;
}

/**
 * Is a threshold a breach for `value`? Deterministic, side-effect-free.
 *
 *   gt      → value >  value_num
 *   gte     → value >= value_num
 *   lt      → value <  value_num
 *   lte     → value <= value_num
 *   outside → value <  value_lo  OR  value > value_hi   (breach when OUTSIDE the band)
 *
 * The DB CHECK constraint already guarantees value_num (scalar ops) or a valid
 * value_lo < value_hi band ('outside') exist, but we guard here too
 * (belt-and-suspenders): a threshold missing its operand is treated as NOT a
 * breach rather than throwing, so a single malformed row never fails a push.
 */
export function evaluateThreshold(
  op: MrmThresholdOp,
  value: number,
  t: EvaluableThreshold,
): boolean {
  switch (op) {
    case MrmThresholdOp.GT:
      return t.value_num !== null && value > t.value_num;
    case MrmThresholdOp.GTE:
      return t.value_num !== null && value >= t.value_num;
    case MrmThresholdOp.LT:
      return t.value_num !== null && value < t.value_num;
    case MrmThresholdOp.LTE:
      return t.value_num !== null && value <= t.value_num;
    case MrmThresholdOp.OUTSIDE:
      return (
        t.value_lo !== null && t.value_hi !== null && (value < t.value_lo || value > t.value_hi)
      );
    default:
      return false;
  }
}

/**
 * Map a threshold's severity to the recorded evaluation status ON BREACH.
 *
 *   severity = warn            → status = warn   (a soft breach, surfaced but not escalated)
 *   severity = high | critical → status = breach (a hard breach — the alerting state)
 *
 * A non-breach is always `ok`. `no_threshold` is handled by the caller (there is
 * no threshold to read a severity from). This mapping is the single source of
 * truth for warn-vs-breach and is deliberately explicit so an examiner can read it.
 */
export function severityToBreachStatus(severity: MrmThresholdSeverity): MrmEvalStatus {
  return severity === MrmThresholdSeverity.WARN ? MrmEvalStatus.WARN : MrmEvalStatus.BREACH;
}

/**
 * Specificity score for tie-breaking when several active thresholds match the
 * same point. A threshold that pins BOTH segment and window is the most
 * specific; one that pins neither (applies to any segment/any window) is the
 * least. Higher = more specific = wins.
 *
 *   +2  segment is concrete (not null/'' — i.e. not "any segment")
 *   +1  window  is concrete (not null/'' — i.e. not "any window")
 */
export function thresholdSpecificity(t: EvaluableThreshold): number {
  const segmentPinned = t.segment !== null && t.segment !== "" && t.segment !== DEFAULT_SEGMENT;
  const windowPinned = t.window !== null && t.window !== "";
  return (segmentPinned ? 2 : 0) + (windowPinned ? 1 : 0);
}

/**
 * Does a threshold apply to a point?
 *
 * A threshold matches when, for BOTH segment and window, it is either
 * unscoped (null / '' / 'overall' sentinel = "applies to any") or equal to the
 * point's value. Segment/window on the point are already normalised.
 */
export function thresholdMatchesPoint(t: EvaluableThreshold, point: EvaluablePoint): boolean {
  if (!t.active) return false;
  if (t.metric !== point.metric) return false;

  const segmentUnscoped = t.segment === null || t.segment === "" || t.segment === DEFAULT_SEGMENT;
  const segmentOk = segmentUnscoped || t.segment === point.segment;
  if (!segmentOk) return false;

  const windowUnscoped = t.window === null || t.window === "";
  const windowOk = windowUnscoped || t.window === point.window;
  if (!windowOk) return false;

  return true;
}

/**
 * Choose the single winning threshold among candidates for a point.
 *
 * MOST-CONSERVATIVE-WINS (SR 11-7 / bank-MRM fail-safe convention): a breach is
 * never masked. If ANY matching threshold breaches, a breaching one wins —
 * regardless of specificity — so a loosely-set segment threshold can never silently
 * suppress a catch-all breach. Specificity only decides between thresholds that
 * agree on the breach outcome.
 *
 * Tie-break, in order:
 *   1. BREACHING beats non-breaching (the conservative guarantee — decided first).
 *   2. Higher severity wins (critical > high > warn) — a breach reports its worst.
 *   3. Most specific (segment/window-pinned) wins.
 *   4. Final tie-break: lowest id (oldest, deterministic).
 *
 * Returns null when no threshold matches (the no_threshold case).
 */
export function selectThreshold(
  candidates: EvaluableThreshold[],
  point: EvaluablePoint,
): EvaluableThreshold | null {
  const matching = candidates.filter((t) => thresholdMatchesPoint(t, point));
  if (matching.length === 0) return null;

  const severityRank: Record<MrmThresholdSeverity, number> = {
    [MrmThresholdSeverity.WARN]: 1,
    [MrmThresholdSeverity.HIGH]: 2,
    [MrmThresholdSeverity.CRITICAL]: 3,
  };

  return matching.reduce((best, t) => {
    // 1. Conservative guarantee: a breaching threshold beats a non-breaching one,
    //    regardless of how specific either is. This is what prevents breach masking.
    const bBreach = evaluateThreshold(best.op, point.value, best);
    const tBreach = evaluateThreshold(t.op, point.value, t);
    if (tBreach !== bBreach) return tBreach ? t : best;

    // 2. Both breach (or both pass) → prefer higher severity.
    const bSev = severityRank[best.severity];
    const tSev = severityRank[t.severity];
    if (tSev !== bSev) return tSev > bSev ? t : best;

    // 3. Then most specific.
    const bSpec = thresholdSpecificity(best);
    const tSpec = thresholdSpecificity(t);
    if (tSpec !== bSpec) return tSpec > bSpec ? t : best;

    // 4. Deterministic final tie-break.
    return t.id < best.id ? t : best;
  });
}

/** Freeze the threshold's evaluated shape onto the immutable evaluation record. */
export function snapshotThreshold(t: EvaluableThreshold): MrmThresholdSnapshot {
  return {
    op: t.op,
    value_num: t.value_num ?? undefined,
    value_lo: t.value_lo ?? undefined,
    value_hi: t.value_hi ?? undefined,
    severity: t.severity,
    segment: t.segment ?? undefined,
    window: t.window ?? undefined,
  };
}

/**
 * The end-to-end pure evaluation of one point against a set of candidate
 * thresholds. Returns the recorded status, whether it was a breach, the winning
 * threshold (if any), and the frozen snapshot to persist.
 *
 * - No matching threshold → status = no_threshold, breached = false, threshold =
 *   null (a first-class recorded state — never silent).
 * - Matching threshold, within bounds → status = ok.
 * - Matching threshold, breach → status = warn | breach per severityToBreachStatus.
 *
 * NEVER consumes a client-supplied verdict — the caller passes only the raw value.
 */
export function evaluatePoint(
  point: EvaluablePoint,
  candidates: EvaluableThreshold[],
): ThresholdEvaluation {
  const threshold = selectThreshold(candidates, point);
  if (!threshold) {
    return {
      status: MrmEvalStatus.NO_THRESHOLD,
      breached: false,
      threshold: null,
      snapshot: null,
    };
  }

  const isBreach = evaluateThreshold(threshold.op, point.value, threshold);
  const status = isBreach ? severityToBreachStatus(threshold.severity) : MrmEvalStatus.OK;
  return {
    status,
    breached: isBreach,
    threshold,
    snapshot: snapshotThreshold(threshold),
  };
}

// ===========================================================================
// Token hashing (mirrors utils/tokens.utils.ts hashApiToken — SHA-256 hex)
// ===========================================================================

/**
 * Hash an ingestion token for storage AND lookup. Only the hash is persisted;
 * the plaintext is returned to the creator once and never stored. Uses the same
 * SHA-256-hex scheme as the existing API-token path so hashing is consistent
 * across the codebase.
 */
export const hashIngestionToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

/** Generate a new opaque ingestion token (plaintext, shown once). */
export const generateIngestionTokenPlaintext = (): string =>
  `mrm_${crypto.randomBytes(32).toString("hex")}`;

// ===========================================================================
// Ingestion-token lookup for the auth middleware
// ===========================================================================

export interface ActiveIngestionTokenRow {
  id: number;
  organization_id: number;
  model_inventory_id: number | null;
}

/**
 * Look up an ACTIVE (non-revoked) ingestion token by the hash of its raw value.
 * The token_hash column is globally UNIQUE, so this returns at most one row. Not
 * org-scoped in the WHERE because the caller has no org context yet — the token
 * IS what establishes the org. Returns null when no active token matches.
 */
export const getActiveIngestionTokenByHashQuery = async (
  tokenHash: string,
): Promise<ActiveIngestionTokenRow | null> => {
  const rows = (await sequelize.query(
    `SELECT id, organization_id, model_inventory_id
       FROM mrm_ingestion_tokens
      WHERE token_hash = :tokenHash AND revoked_at IS NULL
      LIMIT 1`,
    {
      replacements: { tokenHash },
      type: QueryTypes.SELECT,
    },
  )) as ActiveIngestionTokenRow[];
  return rows[0] ?? null;
};

/** Best-effort: stamp last_used_at on the token that just authenticated. */
export const touchIngestionTokenLastUsedQuery = async (id: number): Promise<void> => {
  await sequelize.query(`UPDATE mrm_ingestion_tokens SET last_used_at = NOW() WHERE id = :id`, {
    replacements: { id },
  });
};

// ===========================================================================
// Model resolution by external key (ingestion path)
// ===========================================================================

/**
 * Resolve a customer-set external model key to its model_inventory_id WITHIN an
 * org. Returns null when the org has no model with that external_key.
 */
export const resolveModelByExternalKeyQuery = async (
  organizationId: number,
  externalKey: string,
): Promise<number | null> => {
  const rows = (await sequelize.query(
    `SELECT id FROM model_inventories
      WHERE organization_id = :organizationId AND external_key = :externalKey
      LIMIT 1`,
    {
      replacements: { organizationId, externalKey },
      type: QueryTypes.SELECT,
    },
  )) as { id: number }[];
  return rows[0]?.id ?? null;
};

// ===========================================================================
// Threshold candidate load (evaluation lookup)
// ===========================================================================

/**
 * Load ALL active thresholds for (org, model, metric). The candidate set is
 * filtered/tie-broken in the pure engine (selectThreshold) so matching logic is
 * testable without a DB. Only active rows are returned — inactive thresholds
 * never evaluate.
 */
export const getActiveThresholdsForQuery = async (
  organizationId: number,
  modelInventoryId: number,
  metric: string,
  transaction?: Transaction,
): Promise<EvaluableThreshold[]> => {
  const rows = (await sequelize.query(
    `SELECT id, metric, segment, "window", op, value_num, value_lo, value_hi,
            severity, breach_action, active
       FROM mrm_thresholds
      WHERE organization_id = :organizationId
        AND model_inventory_id = :modelInventoryId
        AND metric = :metric
        AND active = true`,
    {
      replacements: { organizationId, modelInventoryId, metric },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as EvaluableThreshold[];
  return rows;
};

// ===========================================================================
// Insert an ingested point (idempotent) + write its evaluation
// ===========================================================================

export interface IngestPointInput {
  metric: string;
  value: number;
  at: Date;
  window: string;
  segment: string;
  context?: Record<string, unknown> | null;
}

export interface IngestPointResult {
  duplicate: boolean;
  metricId: number | null;
  evaluation: ThresholdEvaluation | null;
}

/**
 * Insert one metric point and evaluate it, transactionally.
 *
 * Idempotency (§5 / O1): the DB UNIQUE (org, model, metric, segment, window, at)
 * makes a re-POST of the same logical point collide — where `at` is truncated to
 * the second (date_trunc in the INSERT below) so sub-second jitter can't slip a
 * duplicate through. On the 23505 we treat it as a DUPLICATE — an idempotent no-op
 * SUCCESS (200 + duplicate:true), NOT a 409. No second row, no second evaluation,
 * no double-counted breach.
 *
 * On a fresh insert we run the threshold evaluation (pure engine) and write the
 * immutable evaluation row (with the frozen threshold snapshot) inside the SAME
 * transaction, so a point and its evaluation are always written atomically.
 */
export const ingestPointQuery = async (
  organizationId: number,
  modelInventoryId: number,
  ingestionTokenId: number | null,
  input: IngestPointInput,
  transaction: Transaction,
): Promise<IngestPointResult> => {
  let metricId: number;
  // Wrap the metrics INSERT in a SAVEPOINT. A duplicate hits the idempotency
  // UNIQUE and raises 23505, which aborts the enclosing transaction in Postgres —
  // catching it in JS is not enough. Without the savepoint, a single duplicate in
  // a batch poisons the transaction and every later point fails with "current
  // transaction is aborted". Rolling back to the savepoint isolates the failed
  // insert so the rest of the batch still commits.
  const savepoint = `sp_ingest_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  await sequelize.query(`SAVEPOINT ${savepoint}`, { transaction });
  try {
    // SELECT type parses the RETURNING rows as a flat array (an INSERT ...
    // RETURNING behaves like a SELECT for result mapping); QueryTypes.INSERT
    // would yield [rows, meta] and break the row access below.
    const rows = (await sequelize.query(
      // `at` is truncated to the second here so sub-second jitter between an initial
      // send and a retry cannot defeat the idempotency UNIQUE. (A generated column
      // can't do this — Postgres requires generated expressions to be IMMUTABLE and
      // date_trunc over a timestamptz is only STABLE — so it lives in the one insert path.)
      `INSERT INTO mrm_metrics
         (organization_id, model_inventory_id, metric, value, at, "window", segment,
          context, ingestion_token_id, received_at, created_at)
       VALUES
         (:organizationId, :modelInventoryId, :metric, :value,
          date_trunc('second', :at::timestamptz), :window, :segment,
          :context, :ingestionTokenId, :now, :now)
       RETURNING id`,
      {
        replacements: {
          organizationId,
          modelInventoryId,
          metric: input.metric,
          value: input.value,
          at: input.at,
          window: input.window,
          segment: input.segment,
          context: JSON.stringify(input.context ?? {}),
          ingestionTokenId: ingestionTokenId ?? null,
          now: new Date(),
        },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as { id: number }[];
    metricId = rows[0].id;
    await sequelize.query(`RELEASE SAVEPOINT ${savepoint}`, { transaction });
  } catch (error) {
    if ((error as any)?.original?.code === PG_UNIQUE_VIOLATION) {
      // Idempotent duplicate — roll back just this insert and report a no-op
      // success, leaving the enclosing transaction usable for the rest of the batch.
      await sequelize.query(`ROLLBACK TO SAVEPOINT ${savepoint}`, { transaction });
      return { duplicate: true, metricId: null, evaluation: null };
    }
    throw error;
  }

  const candidates = await getActiveThresholdsForQuery(
    organizationId,
    modelInventoryId,
    input.metric,
    transaction,
  );
  const evaluation = evaluatePoint(
    { metric: input.metric, value: input.value, segment: input.segment, window: input.window },
    candidates,
  );

  await sequelize.query(
    `INSERT INTO mrm_metric_evaluations
       (organization_id, metric_id, threshold_id, status, threshold_snapshot, evaluated_at)
     VALUES
       (:organizationId, :metricId, :thresholdId, :status, :snapshot, :now)`,
    {
      replacements: {
        organizationId,
        metricId,
        thresholdId: evaluation.threshold?.id ?? null,
        status: evaluation.status,
        snapshot: evaluation.snapshot ? JSON.stringify(evaluation.snapshot) : null,
        now: new Date(),
      },
      type: QueryTypes.INSERT,
      transaction,
    },
  );

  return { duplicate: false, metricId, evaluation };
};

// ===========================================================================
// Breach handling — flag revalidation + notification recipients
// ===========================================================================

/**
 * Set the model's revalidation SEED flag (Branch 2 only sets the seed; the full
 * workflow is Branch 3). Idempotent: re-flagging just refreshes the reason /
 * timestamp. Never clears the flag here.
 */
export const flagModelForRevalidationQuery = async (
  organizationId: number,
  modelInventoryId: number,
  reason: string,
  transaction: Transaction,
): Promise<void> => {
  await sequelize.query(
    `UPDATE model_inventories
        SET mrm_revalidation_flagged = true,
            mrm_revalidation_flagged_at = :now,
            mrm_revalidation_reason = :reason,
            updated_at = :now
      WHERE organization_id = :organizationId AND id = :modelInventoryId`,
    {
      replacements: { organizationId, modelInventoryId, reason, now: new Date() },
      transaction,
    },
  );
};

/**
 * The user ids to notify about a model's breach: the humans assigned as the
 * model's MRM owner / validator / approver (from mrm_model_roles). Deduped.
 * Empty when the model has no assigned roles — the caller then only records the
 * breach (evaluation row already written) without an in-app notification.
 */
export const getBreachNotificationRecipientsQuery = async (
  organizationId: number,
  modelInventoryId: number,
): Promise<number[]> => {
  const rows = (await sequelize.query(
    `SELECT DISTINCT user_id FROM mrm_model_roles
      WHERE organization_id = :organizationId
        AND model_inventory_id = :modelInventoryId
        AND user_id IS NOT NULL
        AND role IN ('owner', 'validator', 'approver')`,
    {
      replacements: { organizationId, modelInventoryId },
      type: QueryTypes.SELECT,
    },
  )) as { user_id: number }[];
  return rows.map((r) => r.user_id);
};

/** A model's display label for a notification (provider/model/version). */
export const getModelLabelQuery = async (
  organizationId: number,
  modelInventoryId: number,
): Promise<string | null> => {
  const rows = (await sequelize.query(
    `SELECT provider, model, version FROM model_inventories
      WHERE organization_id = :organizationId AND id = :modelInventoryId LIMIT 1`,
    {
      replacements: { organizationId, modelInventoryId },
      type: QueryTypes.SELECT,
    },
  )) as { provider: string | null; model: string | null; version: string | null }[];
  const r = rows[0];
  if (!r) return null;
  return [r.provider, r.model, r.version].filter(Boolean).join(" ") || null;
};

// ===========================================================================
// Ingestion-token management (JWT-authed admin CRUD)
// ===========================================================================

export interface CreateIngestionTokenInput {
  name: string;
  model_inventory_id: number | null;
  token_hash: string;
  created_by: number | null;
}

export interface IngestionTokenSafeRow {
  id: number;
  name: string;
  model_inventory_id: number | null;
  last_used_at: Date | null;
  revoked_at: Date | null;
  created_by: number | null;
  created_at: Date;
}

const INGESTION_TOKEN_SAFE_COLUMNS = `id, name, model_inventory_id, last_used_at, revoked_at, created_by, created_at`;

/**
 * Create an ingestion token. Stores ONLY the hash; the plaintext is generated +
 * returned by the controller once and never persisted. token_hash is excluded
 * from RETURNING so it never leaves the DB.
 */
export const createIngestionTokenQuery = async (
  organizationId: number,
  input: CreateIngestionTokenInput,
): Promise<IngestionTokenSafeRow> => {
  const rows = (await sequelize.query(
    `INSERT INTO mrm_ingestion_tokens
       (organization_id, name, token_hash, model_inventory_id, created_by, created_at)
     VALUES
       (:organizationId, :name, :tokenHash, :modelInventoryId, :createdBy, :now)
     RETURNING ${INGESTION_TOKEN_SAFE_COLUMNS}`,
    {
      replacements: {
        organizationId,
        name: input.name,
        tokenHash: input.token_hash,
        modelInventoryId: input.model_inventory_id ?? null,
        createdBy: input.created_by ?? null,
        now: new Date(),
      },
      type: QueryTypes.SELECT,
    },
  )) as IngestionTokenSafeRow[];
  return rows[0];
};

/** List tokens for an org — never returns token_hash or any plaintext. */
export const getIngestionTokensQuery = async (
  organizationId: number,
): Promise<IngestionTokenSafeRow[]> => {
  return (await sequelize.query(
    `SELECT ${INGESTION_TOKEN_SAFE_COLUMNS}
       FROM mrm_ingestion_tokens
      WHERE organization_id = :organizationId
      ORDER BY created_at DESC, id DESC`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    },
  )) as IngestionTokenSafeRow[];
};

/** Fetch a single active (non-revoked) token's safe fields, or null. */
export const getActiveIngestionTokenByIdQuery = async (
  id: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<IngestionTokenSafeRow | null> => {
  const rows = (await sequelize.query(
    `SELECT ${INGESTION_TOKEN_SAFE_COLUMNS}
       FROM mrm_ingestion_tokens
      WHERE organization_id = :organizationId AND id = :id AND revoked_at IS NULL
      LIMIT 1`,
    {
      replacements: { organizationId, id },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as IngestionTokenSafeRow[];
  return rows[0] ?? null;
};

/**
 * Rotate a token: revoke the current row and create a fresh one with the SAME
 * name + model scope, in one transaction. Returns the new safe row, or null when
 * no active token with that id exists for the org. The new plaintext hash is
 * supplied by the controller (which returns the plaintext once).
 */
export const rotateIngestionTokenQuery = async (
  id: number,
  organizationId: number,
  newTokenHash: string,
): Promise<IngestionTokenSafeRow | null> => {
  const transaction = await sequelize.transaction();
  try {
    const existing = await getActiveIngestionTokenByIdQuery(id, organizationId, transaction);
    if (!existing) {
      await transaction.rollback();
      return null;
    }

    const now = new Date();
    await sequelize.query(
      `UPDATE mrm_ingestion_tokens SET revoked_at = :now
        WHERE organization_id = :organizationId AND id = :id AND revoked_at IS NULL`,
      { replacements: { organizationId, id, now }, transaction },
    );

    const rows = (await sequelize.query(
      `INSERT INTO mrm_ingestion_tokens
         (organization_id, name, token_hash, model_inventory_id, created_by, created_at)
       VALUES
         (:organizationId, :name, :tokenHash, :modelInventoryId, :createdBy, :now)
       RETURNING ${INGESTION_TOKEN_SAFE_COLUMNS}`,
      {
        replacements: {
          organizationId,
          name: existing.name,
          tokenHash: newTokenHash,
          modelInventoryId: existing.model_inventory_id ?? null,
          createdBy: existing.created_by ?? null,
          now,
        },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as IngestionTokenSafeRow[];

    await transaction.commit();
    return rows[0];
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Soft-revoke a token (set revoked_at). Returns the updated safe row on
 * success, or null when no active token with that id exists for the org.
 * Never returns token_hash.
 */
export const revokeIngestionTokenQuery = async (
  id: number,
  organizationId: number,
): Promise<IngestionTokenSafeRow | null> => {
  const rows = (await sequelize.query(
    `UPDATE mrm_ingestion_tokens SET revoked_at = NOW()
      WHERE organization_id = :organizationId AND id = :id AND revoked_at IS NULL
      RETURNING ${INGESTION_TOKEN_SAFE_COLUMNS}`,
    {
      replacements: { organizationId, id },
      type: QueryTypes.SELECT,
    },
  )) as IngestionTokenSafeRow[];
  return rows[0] ?? null;
};

// ===========================================================================
// Threshold management (JWT-authed CRUD)
// ===========================================================================

export const getThresholdsQuery = async (
  organizationId: number,
  modelId?: number,
  metric?: string,
): Promise<MrmThresholdModel[]> => {
  const clauses = ["organization_id = :organizationId"];
  if (modelId) clauses.push("model_inventory_id = :modelId");
  if (metric) clauses.push("metric = :metric");
  return (await sequelize.query(
    `SELECT * FROM mrm_thresholds WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC, id DESC`,
    {
      replacements: { organizationId, modelId, metric },
      mapToModel: true,
      model: MrmThresholdModel,
    },
  )) as MrmThresholdModel[];
};

export const getThresholdByIdQuery = async (
  id: number,
  organizationId: number,
): Promise<MrmThresholdModel | null> => {
  const rows = (await sequelize.query(
    `SELECT * FROM mrm_thresholds WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: MrmThresholdModel,
    },
  )) as MrmThresholdModel[];
  return rows[0] ?? null;
};

export interface CreateThresholdInput {
  model_inventory_id: number;
  metric: string;
  segment: string | null;
  window: string | null;
  op: MrmThresholdOp;
  value_num: number | null;
  value_lo: number | null;
  value_hi: number | null;
  severity: MrmThresholdSeverity;
  breach_action: MrmBreachAction;
  active: boolean;
}

export const createThresholdQuery = async (
  organizationId: number,
  input: CreateThresholdInput,
): Promise<MrmThresholdModel> => {
  const now = new Date();
  const rows = (await sequelize.query(
    `INSERT INTO mrm_thresholds
       (organization_id, model_inventory_id, metric, segment, "window", op,
        value_num, value_lo, value_hi, severity, breach_action, active, created_at, updated_at)
     VALUES
       (:organizationId, :modelId, :metric, :segment, :window, :op,
        :valueNum, :valueLo, :valueHi, :severity, :breachAction, :active, :now, :now)
     RETURNING *`,
    {
      replacements: {
        organizationId,
        modelId: input.model_inventory_id,
        metric: input.metric,
        segment: input.segment ?? null,
        window: input.window ?? null,
        op: input.op,
        valueNum: input.value_num ?? null,
        valueLo: input.value_lo ?? null,
        valueHi: input.value_hi ?? null,
        severity: input.severity,
        breachAction: input.breach_action,
        active: input.active,
        now,
      },
      mapToModel: true,
      model: MrmThresholdModel,
    },
  )) as MrmThresholdModel[];
  return rows[0];
};

export interface UpdateThresholdInput {
  segment?: string | null;
  window?: string | null;
  op?: MrmThresholdOp;
  value_num?: number | null;
  value_lo?: number | null;
  value_hi?: number | null;
  severity?: MrmThresholdSeverity;
  breach_action?: MrmBreachAction;
  active?: boolean;
}

/**
 * Update a threshold's config. COALESCE-style CASE guards keep unspecified
 * fields untouched. The DB CHECK constraint re-validates op/value consistency on
 * write (belt-and-suspenders with the controller's app-level check).
 */
export const updateThresholdQuery = async (
  id: number,
  organizationId: number,
  input: UpdateThresholdInput,
): Promise<MrmThresholdModel | null> => {
  const rows = (await sequelize.query(
    `UPDATE mrm_thresholds
        SET segment       = CASE WHEN :segmentProvided THEN :segment ELSE segment END,
            "window"      = CASE WHEN :windowProvided THEN :window ELSE "window" END,
            op            = COALESCE(:op, op),
            value_num     = CASE WHEN :valueNumProvided THEN :valueNum ELSE value_num END,
            value_lo      = CASE WHEN :valueLoProvided THEN :valueLo ELSE value_lo END,
            value_hi      = CASE WHEN :valueHiProvided THEN :valueHi ELSE value_hi END,
            severity      = COALESCE(:severity, severity),
            breach_action = COALESCE(:breachAction, breach_action),
            active        = COALESCE(:active, active),
            updated_at    = :now
      WHERE organization_id = :organizationId AND id = :id
      RETURNING *`,
    {
      replacements: {
        organizationId,
        id,
        segmentProvided: input.segment !== undefined,
        segment: input.segment ?? null,
        windowProvided: input.window !== undefined,
        window: input.window ?? null,
        op: input.op ?? null,
        valueNumProvided: input.value_num !== undefined,
        valueNum: input.value_num ?? null,
        valueLoProvided: input.value_lo !== undefined,
        valueLo: input.value_lo ?? null,
        valueHiProvided: input.value_hi !== undefined,
        valueHi: input.value_hi ?? null,
        severity: input.severity ?? null,
        breachAction: input.breach_action ?? null,
        active: input.active ?? null,
        now: new Date(),
      },
      mapToModel: true,
      model: MrmThresholdModel,
    },
  )) as MrmThresholdModel[];
  return rows[0] ?? null;
};

/** Hard-delete a threshold (config, not audit). Returns false when not found. */
export const deleteThresholdQuery = async (
  id: number,
  organizationId: number,
): Promise<boolean> => {
  const rows = (await sequelize.query(
    `DELETE FROM mrm_thresholds
      WHERE organization_id = :organizationId AND id = :id RETURNING id`,
    {
      replacements: { organizationId, id },
      type: QueryTypes.SELECT,
    },
  )) as { id: number }[];
  return rows.length > 0;
};

// ===========================================================================
// Metric-key catalogue (JWT-authed)
// ===========================================================================

export const getMetricKeysQuery = async (organizationId: number): Promise<MrmMetricKeyModel[]> => {
  return (await sequelize.query(
    `SELECT * FROM mrm_metric_keys WHERE organization_id = :organizationId ORDER BY key ASC`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: MrmMetricKeyModel,
    },
  )) as MrmMetricKeyModel[];
};

/**
 * Register a metric key. UNIQUE(org, key): a duplicate is a 23505 the controller
 * maps to a clean 409. Returns the created row.
 */
export const createMetricKeyQuery = async (
  organizationId: number,
  key: string,
  displayName: string | null,
): Promise<MrmMetricKeyModel> => {
  const rows = (await sequelize.query(
    `INSERT INTO mrm_metric_keys (organization_id, key, display_name, created_at)
     VALUES (:organizationId, :key, :displayName, :now)
     RETURNING *`,
    {
      replacements: { organizationId, key, displayName: displayName ?? null, now: new Date() },
      mapToModel: true,
      model: MrmMetricKeyModel,
    },
  )) as MrmMetricKeyModel[];
  return rows[0];
};

/** SQLSTATE for unique_violation — re-exported for the controller's 409 mapping. */
export const isUniqueViolation = (error: unknown): boolean =>
  (error as any)?.original?.code === PG_UNIQUE_VIOLATION;

// ===========================================================================
// Monitoring read (JWT-authed)
// ===========================================================================

export interface LatestMetricRow {
  metric: string;
  segment: string;
  window: string;
  value: number;
  at: Date;
  metric_id: number;
  status: MrmEvalStatus | null;
  threshold_id: number | null;
  evaluated_at: Date | null;
}

/**
 * Latest value + latest evaluation status per (metric, segment, window) for a
 * model. DISTINCT ON the grouping keys ordered by `at DESC` picks the most
 * recent point; its evaluation (if any) is joined on.
 */
export const getModelMonitoringQuery = async (
  organizationId: number,
  modelInventoryId: number,
): Promise<LatestMetricRow[]> => {
  return (await sequelize.query(
    `SELECT DISTINCT ON (m.metric, m.segment, m."window")
            m.metric, m.segment, m."window", m.value, m.at, m.id AS metric_id,
            e.status, e.threshold_id, e.evaluated_at
       FROM mrm_metrics m
       LEFT JOIN mrm_metric_evaluations e
              ON e.metric_id = m.id AND e.organization_id = m.organization_id
      WHERE m.organization_id = :organizationId
        AND m.model_inventory_id = :modelInventoryId
      ORDER BY m.metric, m.segment, m."window", m.at DESC, e.evaluated_at DESC`,
    {
      replacements: { organizationId, modelInventoryId },
      type: QueryTypes.SELECT,
    },
  )) as LatestMetricRow[];
};

export interface TrendRow {
  metric_id: number;
  value: number;
  at: Date;
  segment: string;
  window: string;
  status: MrmEvalStatus | null;
}

/** Time-ordered value + status trend for one (model, metric). */
export const getMetricTrendQuery = async (
  organizationId: number,
  modelInventoryId: number,
  metric: string,
): Promise<TrendRow[]> => {
  return (await sequelize.query(
    `SELECT m.id AS metric_id, m.value, m.at, m.segment, m."window", e.status
       FROM mrm_metrics m
       LEFT JOIN mrm_metric_evaluations e
              ON e.metric_id = m.id AND e.organization_id = m.organization_id
      WHERE m.organization_id = :organizationId
        AND m.model_inventory_id = :modelInventoryId
        AND m.metric = :metric
      ORDER BY m.at ASC, m.id ASC`,
    {
      replacements: { organizationId, modelInventoryId, metric },
      type: QueryTypes.SELECT,
    },
  )) as TrendRow[];
};

export interface BreachHistoryRow {
  evaluation_id: number;
  metric_id: number;
  metric: string;
  value: number;
  at: Date;
  segment: string;
  window: string;
  status: MrmEvalStatus;
  threshold_id: number | null;
  threshold_snapshot: MrmThresholdSnapshot | null;
  evaluated_at: Date;
}

/**
 * Breach history for a model (or one metric): every warn/breach evaluation,
 * newest first, with the frozen threshold snapshot for the audit trail.
 */
export const getBreachHistoryQuery = async (
  organizationId: number,
  modelInventoryId: number,
  metric?: string,
): Promise<BreachHistoryRow[]> => {
  const clauses = [
    "m.organization_id = :organizationId",
    "m.model_inventory_id = :modelInventoryId",
    "e.status IN ('warn', 'breach')",
  ];
  if (metric) clauses.push("m.metric = :metric");
  return (await sequelize.query(
    `SELECT e.id AS evaluation_id, m.id AS metric_id, m.metric, m.value, m.at,
            m.segment, m."window", e.status, e.threshold_id, e.threshold_snapshot, e.evaluated_at
       FROM mrm_metric_evaluations e
       JOIN mrm_metrics m ON m.id = e.metric_id AND m.organization_id = e.organization_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY e.evaluated_at DESC, e.id DESC`,
    {
      replacements: { organizationId, modelInventoryId, metric },
      type: QueryTypes.SELECT,
    },
  )) as BreachHistoryRow[];
};

/** Does a model exist for this org? (mirrors mrm.utils modelExistsForOrgQuery). */
export const modelExistsForOrgQuery = async (
  modelId: number,
  organizationId: number,
): Promise<boolean> => {
  const rows = (await sequelize.query(
    `SELECT 1 AS ok FROM model_inventories WHERE organization_id = :organizationId AND id = :modelId LIMIT 1`,
    {
      replacements: { organizationId, modelId },
      type: QueryTypes.SELECT,
    },
  )) as { ok: number }[];
  return rows.length > 0;
};
