import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";
import { CustomException } from "../domain.layer/exceptions/custom.exception";
import { sequelize } from "../database/db";
import {
  MrmBreachAction,
  MrmEvalStatus,
  MrmThresholdOp,
  MrmThresholdSeverity,
} from "../domain.layer/enums/mrmMonitoring.enum";
import {
  NotificationType,
  NotificationEntityType,
} from "../domain.layer/interfaces/i.notification";
import { sendInAppNotification } from "../services/inAppNotification.service";
import {
  createIngestionTokenQuery,
  createMetricKeyQuery,
  createThresholdQuery,
  deleteThresholdQuery,
  flagModelForRevalidationQuery,
  generateIngestionTokenPlaintext,
  getBreachHistoryQuery,
  getBreachNotificationRecipientsQuery,
  getIngestionTokensQuery,
  getMetricKeysQuery,
  getMetricTrendQuery,
  getModelLabelQuery,
  getModelMonitoringQuery,
  getThresholdByIdQuery,
  getThresholdsQuery,
  hashIngestionToken,
  ingestPointQuery,
  isUniqueViolation,
  modelExistsForOrgQuery,
  normalizeSegment,
  normalizeWindow,
  resolveModelByExternalKeyQuery,
  revokeIngestionTokenQuery,
  rotateIngestionTokenQuery,
  updateThresholdQuery,
  ThresholdEvaluation,
} from "../utils/mrmMonitoring.utils";

const FILE = "mrmMonitoring.ctrl.ts";

// Reject a point whose `at` is further than this into the future (clock-skew
// guard). Monitoring cadence is never sub-second and clocks drift by seconds,
// so 1 hour is a generous, non-nuisance allowance.
const MAX_FUTURE_MS = 60 * 60 * 1000;

/**
 * Map a domain CustomException to its HTTP status, otherwise 500. Mirrors the
 * Branch-1 mrm.ctrl.ts fail() dispatcher exactly.
 */
function fail(req: Request, res: Response, fn: string, msg: string, error: unknown) {
  logStructured("error", msg, fn, FILE);
  logger.error(`❌ Error in ${fn}:`, error);
  const status = error instanceof CustomException ? error.statusCode : 500;
  if (status >= 500) {
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
  const body = (STATUS_CODE as any)[status]
    ? (STATUS_CODE as any)[status](translateError(req, error))
    : STATUS_CODE[400](translateError(req, error));
  return res.status(status).json(body);
}

const parseId = (raw: string | string[]): number => parseInt(Array.isArray(raw) ? raw[0] : raw, 10);

// ===========================================================================
// Ingestion (token-auth — NOT JWT)
// ===========================================================================

interface RawPoint {
  metric?: unknown;
  value?: unknown;
  at?: unknown;
  window?: unknown;
  segment?: unknown;
  context?: unknown;
}

interface ValidatedPoint {
  metric: string;
  value: number;
  at: Date;
  window: string;
  segment: string;
  context: Record<string, unknown> | null;
}

interface PointError {
  index: number;
  errors: string[];
}

/**
 * Validate one raw point. Returns either the normalised point or a list of
 * human-readable errors. Pure — no I/O, so batch validation is a simple map.
 *
 * Rules (spec §3.5): metric non-empty string; value finite number; at valid
 * ISO-8601 and not more than MAX_FUTURE_MS ahead (clock-skew). window/segment
 * are normalised to the DB sentinels ('' / 'overall').
 */
function validatePoint(raw: RawPoint, now: number): { point?: ValidatedPoint; errors?: string[] } {
  const errors: string[] = [];

  const metric = typeof raw.metric === "string" ? raw.metric.trim() : "";
  if (!metric) errors.push("metric is required and must be a non-empty string");
  if (metric.length > 100) errors.push("metric must be 100 characters or fewer");

  // Reject booleans / NaN / Infinity / non-numbers. (typeof true === 'boolean'.)
  const value = raw.value;
  const valueOk = typeof value === "number" && Number.isFinite(value);
  if (!valueOk) errors.push("value is required and must be a finite number");

  let at: Date | null = null;
  if (typeof raw.at !== "string" || raw.at.trim() === "") {
    errors.push("at is required and must be an ISO-8601 timestamp string");
  } else {
    const parsed = new Date(raw.at);
    if (Number.isNaN(parsed.getTime())) {
      errors.push("at must be a valid ISO-8601 timestamp");
    } else if (parsed.getTime() > now + MAX_FUTURE_MS) {
      errors.push("at is too far in the future");
    } else {
      at = parsed;
    }
  }

  if (raw.window !== undefined && raw.window !== null && typeof raw.window !== "string") {
    errors.push("window must be a string when provided");
  }
  if (raw.segment !== undefined && raw.segment !== null && typeof raw.segment !== "string") {
    errors.push("segment must be a string when provided");
  }
  if (
    raw.context !== undefined &&
    raw.context !== null &&
    (typeof raw.context !== "object" || Array.isArray(raw.context))
  ) {
    errors.push("context must be an object when provided");
  }

  if (errors.length > 0) return { errors };

  return {
    point: {
      metric,
      value: value as number,
      at: at as Date,
      window: normalizeWindow(raw.window as string | undefined),
      segment: normalizeSegment(raw.segment as string | undefined),
      context: (raw.context as Record<string, unknown> | undefined) ?? null,
    },
  };
}

/**
 * POST /api/mrm/models/:externalModelKey/metrics  (token-auth)
 *
 * Accepts a single point {metric,value,at,window?,segment?,context?} OR a batch
 * {points:[...]}. Batch is ALL-OR-NOTHING: every point is validated first; if
 * ANY is invalid the whole request is rejected 422 with per-point errors and NO
 * writes happen.
 *
 * For each valid point: insert (idempotent) + evaluate + write the immutable
 * evaluation row, in ONE transaction for the request. A duplicate (idempotency
 * collision) is an idempotent success (status="duplicate"), not a 409 (O1).
 *
 * Breaches trigger the seed revalidation flag (if configured) + an in-app
 * notification AFTER the transaction commits (best-effort, never blocks the
 * append-only audit write). The response reports each point's evaluated status,
 * but the AUTHORITATIVE record + alert are VerifyWise's — the client verdict is
 * never trusted.
 */
export async function ingestMetrics(req: Request, res: Response) {
  const fn = "ingestMetrics";
  const externalModelKey = Array.isArray(req.params.externalModelKey)
    ? req.params.externalModelKey[0]
    : req.params.externalModelKey;

  const tokenCtx = req.mrmIngestionToken;
  if (!tokenCtx) {
    // Should be unreachable — the auth middleware sets this or 401s first.
    return res.status(401).json(STATUS_CODE[401](req.t!("Missing or invalid ingestion token")));
  }
  const organizationId = tokenCtx.organizationId;

  logStructured("processing", `ingesting metrics for model key ${externalModelKey}`, fn, FILE);

  if (!externalModelKey || externalModelKey.trim() === "") {
    return res.status(400).json(STATUS_CODE[400](req.t!("A model key is required")));
  }

  // Parse single-vs-batch. A body with `points` is a batch; otherwise the body
  // itself is a single point.
  const body = req.body ?? {};
  let rawPoints: RawPoint[];
  if (Array.isArray(body.points)) {
    if (body.points.length === 0) {
      return res.status(422).json(
        STATUS_CODE[422]({
          message: req.t!("points must contain at least one point"),
          errors: [],
        }),
      );
    }
    rawPoints = body.points as RawPoint[];
  } else {
    rawPoints = [body as RawPoint];
  }

  // Validate ALL first (all-or-nothing). Collect per-point errors.
  const now = Date.now();
  const validated: ValidatedPoint[] = [];
  const pointErrors: PointError[] = [];
  rawPoints.forEach((raw, index) => {
    const result = validatePoint(raw, now);
    if (result.errors) {
      pointErrors.push({ index, errors: result.errors });
    } else if (result.point) {
      validated.push(result.point);
    }
  });

  if (pointErrors.length > 0) {
    logStructured("error", `rejected ${pointErrors.length} invalid point(s)`, fn, FILE);
    return res.status(422).json(
      STATUS_CODE[422]({
        message: req.t!("One or more points are invalid"),
        errors: pointErrors,
      }),
    );
  }

  try {
    // Resolve external key → model, org-scoped. 404 if unknown.
    const modelInventoryId = await resolveModelByExternalKeyQuery(organizationId, externalModelKey);
    if (modelInventoryId === null) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Model not found for this key")));
    }

    // Model-scoped token: the path model MUST equal the token's scope. 403 otherwise.
    if (tokenCtx.modelInventoryId !== null && tokenCtx.modelInventoryId !== modelInventoryId) {
      logStructured("error", "token scope does not match path model", fn, FILE);
      return res
        .status(403)
        .json(STATUS_CODE[403](req.t!("This token is not scoped to this model")));
    }

    // Insert + evaluate every point in ONE transaction for the request.
    interface WriteOutcome {
      point: ValidatedPoint;
      duplicate: boolean;
      metricId: number | null;
      evaluation: ThresholdEvaluation | null;
    }
    const outcomes: WriteOutcome[] = [];

    const transaction = await sequelize.transaction();
    try {
      for (const point of validated) {
        const result = await ingestPointQuery(
          organizationId,
          modelInventoryId,
          tokenCtx.tokenId,
          {
            metric: point.metric,
            value: point.value,
            at: point.at,
            window: point.window,
            segment: point.segment,
            context: point.context,
          },
          transaction,
        );
        outcomes.push({
          point,
          duplicate: result.duplicate,
          metricId: result.metricId,
          evaluation: result.evaluation,
        });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    // Post-commit breach handling (best-effort, never blocks the audit write).
    // Collect the models to flag once, and fire notifications per breach.
    await handleBreaches(organizationId, modelInventoryId, outcomes);

    // Build the per-point response.
    let accepted = 0;
    const results = outcomes.map((o) => {
      if (o.duplicate) {
        return {
          metric: o.point.metric,
          at: o.point.at.toISOString(),
          status: "duplicate" as const,
          duplicate: true,
          pointId: null,
        };
      }
      accepted += 1;
      const evalResult = o.evaluation!;
      const base = {
        metric: o.point.metric,
        at: o.point.at.toISOString(),
        status: evalResult.status,
        pointId: o.metricId,
      };
      if (evalResult.snapshot) {
        return {
          ...base,
          threshold: {
            op: evalResult.snapshot.op,
            value_num: evalResult.snapshot.value_num,
            value_lo: evalResult.snapshot.value_lo,
            value_hi: evalResult.snapshot.value_hi,
            severity: evalResult.snapshot.severity,
          },
        };
      }
      return base;
    });

    logStructured(
      "successful",
      `ingested ${accepted} point(s) for model ${modelInventoryId}`,
      fn,
      FILE,
    );
    return res.status(200).json(STATUS_CODE[200]({ accepted, results }));
  } catch (error) {
    return fail(req, res, fn, "failed to ingest metrics", error);
  }
}

/**
 * Post-commit breach side effects: for each newly-written breach (warn/breach
 * status), flag the model for revalidation when the winning threshold's
 * breach_action requires it, and send an in-app notification to the model's MRM
 * owners/validators. All best-effort and isolated so one failure cannot poison
 * the others or the already-committed ingestion.
 */
async function handleBreaches(
  organizationId: number,
  modelInventoryId: number,
  outcomes: Array<{
    point: { metric: string; value: number; at: Date; segment: string; window: string };
    duplicate: boolean;
    metricId: number | null;
    evaluation: ThresholdEvaluation | null;
  }>,
): Promise<void> {
  const breaches = outcomes.filter(
    (o) =>
      !o.duplicate &&
      o.evaluation &&
      (o.evaluation.status === MrmEvalStatus.WARN || o.evaluation.status === MrmEvalStatus.BREACH),
  );
  if (breaches.length === 0) return;

  // Flag revalidation once if ANY breach's threshold requires it.
  const needsFlag = breaches.some(
    (o) => o.evaluation!.threshold?.breach_action === MrmBreachAction.NOTIFY_FLAG_REVALIDATION,
  );
  if (needsFlag) {
    try {
      const flaggingBreach = breaches.find(
        (o) => o.evaluation!.threshold?.breach_action === MrmBreachAction.NOTIFY_FLAG_REVALIDATION,
      )!;
      const reason = `Metric "${flaggingBreach.point.metric}" breached its threshold (value ${flaggingBreach.point.value})`;
      const transaction = await sequelize.transaction();
      try {
        await flagModelForRevalidationQuery(organizationId, modelInventoryId, reason, transaction);
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error("❌ Failed to set revalidation flag after breach:", error);
    }
  }

  // Notify the model's MRM stakeholders.
  try {
    const recipients = await getBreachNotificationRecipientsQuery(organizationId, modelInventoryId);
    if (recipients.length === 0) return; // recorded, but no one assigned to notify

    const label = (await getModelLabelQuery(organizationId, modelInventoryId)) ?? "a model";
    for (const breach of breaches) {
      const isHard = breach.evaluation!.status === MrmEvalStatus.BREACH;
      const title = isHard
        ? `Metric breach: ${breach.point.metric}`
        : `Metric warning: ${breach.point.metric}`;
      const message = `${label} — "${breach.point.metric}" = ${breach.point.value} breached its monitoring threshold.`;
      for (const userId of recipients) {
        try {
          await sendInAppNotification(organizationId, {
            user_id: userId,
            type: NotificationType.MRM_METRIC_BREACH,
            title,
            message,
            entity_type: NotificationEntityType.MODEL,
            entity_id: modelInventoryId,
            entity_name: label,
          });
        } catch (error) {
          logger.error("❌ Failed to send MRM breach notification:", error);
        }
      }
    }
  } catch (error) {
    logger.error("❌ Failed to resolve MRM breach notification recipients:", error);
  }
}

// ===========================================================================
// Ingestion-token management (JWT-auth, admin)
// ===========================================================================

export async function createIngestionToken(req: Request, res: Response) {
  const fn = "createIngestionToken";
  const { name, model_inventory_id } = req.body ?? {};

  logStructured("processing", "creating ingestion token", fn, FILE);

  if (typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json(STATUS_CODE[400](req.t!("A token name is required")));
  }
  if (name.trim().length > 255) {
    return res
      .status(400)
      .json(STATUS_CODE[400](req.t!("Token name must be 255 characters or fewer")));
  }

  let modelId: number | null = null;
  if (model_inventory_id !== undefined && model_inventory_id !== null) {
    modelId = parseInt(String(model_inventory_id), 10);
    if (Number.isNaN(modelId)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid model id")));
    }
  }

  try {
    if (modelId !== null && !(await modelExistsForOrgQuery(modelId, req.organizationId!))) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Model not found")));
    }

    // Generate the plaintext ONCE, store only its hash, return the plaintext to
    // the caller a single time — it can never be retrieved again.
    const plaintext = generateIngestionTokenPlaintext();
    const tokenHash = hashIngestionToken(plaintext);

    const created = await createIngestionTokenQuery(req.organizationId!, {
      name: name.trim(),
      model_inventory_id: modelId,
      token_hash: tokenHash,
      created_by: req.userId ?? null,
    });

    logStructured("successful", "ingestion token created", fn, FILE);
    // `token` is returned exactly once; it is NOT stored and cannot be re-shown.
    return res.status(201).json(STATUS_CODE[201]({ ...created, token: plaintext }));
  } catch (error) {
    return fail(req, res, fn, "failed to create ingestion token", error);
  }
}

export async function getIngestionTokens(req: Request, res: Response) {
  const fn = "getIngestionTokens";
  logStructured("processing", "listing ingestion tokens", fn, FILE);
  try {
    // Never returns token_hash or plaintext.
    const rows = await getIngestionTokensQuery(req.organizationId!);
    logStructured("successful", "ingestion tokens retrieved", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](rows));
  } catch (error) {
    return fail(req, res, fn, "failed to retrieve ingestion tokens", error);
  }
}

export async function rotateIngestionToken(req: Request, res: Response) {
  const fn = "rotateIngestionToken";
  const id = parseId(req.params.id);
  logStructured("processing", `rotating ingestion token ${id}`, fn, FILE);

  if (Number.isNaN(id)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid token id")));
  }

  try {
    const plaintext = generateIngestionTokenPlaintext();
    const tokenHash = hashIngestionToken(plaintext);
    const rotated = await rotateIngestionTokenQuery(id, req.organizationId!, tokenHash);
    if (!rotated) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Active ingestion token not found")));
    }
    logStructured("successful", `ingestion token ${id} rotated`, fn, FILE);
    // The new plaintext is shown once here.
    return res.status(200).json(STATUS_CODE[200]({ ...rotated, token: plaintext }));
  } catch (error) {
    return fail(req, res, fn, "failed to rotate ingestion token", error);
  }
}

export async function revokeIngestionToken(req: Request, res: Response) {
  const fn = "revokeIngestionToken";
  const id = parseId(req.params.id);
  logStructured("processing", `revoking ingestion token ${id}`, fn, FILE);

  if (Number.isNaN(id)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid token id")));
  }

  try {
    const revokedRow = await revokeIngestionTokenQuery(id, req.organizationId!);
    if (!revokedRow) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Active ingestion token not found")));
    }
    logStructured("successful", `ingestion token ${id} revoked`, fn, FILE);
    return res.status(200).json(STATUS_CODE[200](revokedRow));
  } catch (error) {
    return fail(req, res, fn, "failed to revoke ingestion token", error);
  }
}

// ===========================================================================
// Threshold management (JWT-auth) — thresholds are config, deletable
// ===========================================================================

/**
 * App-level validation of a threshold's op/value consistency. Belt-and-suspenders
 * with the DB CHECK constraint: gt/gte/lt/lte need a finite value_num; `outside`
 * needs finite value_lo < value_hi.
 */
function validateThresholdShape(
  req: Request,
  op: MrmThresholdOp,
  valueNum: number | null,
  valueLo: number | null,
  valueHi: number | null,
): string | null {
  if (op === MrmThresholdOp.OUTSIDE) {
    if (
      valueLo === null ||
      valueHi === null ||
      !Number.isFinite(valueLo) ||
      !Number.isFinite(valueHi)
    ) {
      return req.t!("The 'outside' operator requires numeric value_lo and value_hi");
    }
    if (!(valueLo < valueHi)) {
      return req.t!("value_lo must be less than value_hi for the 'outside' operator");
    }
  } else {
    if (valueNum === null || !Number.isFinite(valueNum)) {
      return req.t!("This operator requires a numeric value_num");
    }
  }
  return null;
}

const toNum = (v: unknown): number | null =>
  v === undefined || v === null || v === "" ? null : typeof v === "number" ? v : Number(v);

export async function getThresholds(req: Request, res: Response) {
  const fn = "getThresholds";
  logStructured("processing", "fetching thresholds", fn, FILE);
  try {
    const modelIdRaw = req.query.modelId;
    const metric = typeof req.query.metric === "string" ? req.query.metric : undefined;
    const modelId = modelIdRaw ? parseInt(String(modelIdRaw), 10) : undefined;
    if (modelIdRaw && Number.isNaN(modelId)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid model id")));
    }
    const rows = await getThresholdsQuery(req.organizationId!, modelId, metric);
    logStructured("successful", "thresholds retrieved", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](rows));
  } catch (error) {
    return fail(req, res, fn, "failed to retrieve thresholds", error);
  }
}

export async function createThreshold(req: Request, res: Response) {
  const fn = "createThreshold";
  const modelId = parseId(req.params.modelId);
  const {
    metric,
    segment,
    window,
    op,
    value_num,
    value_lo,
    value_hi,
    severity,
    breach_action,
    active,
  } = req.body ?? {};

  logStructured("processing", `creating threshold for model ${modelId}`, fn, FILE);

  if (Number.isNaN(modelId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid model id")));
  }
  if (typeof metric !== "string" || metric.trim().length === 0) {
    return res.status(400).json(STATUS_CODE[400](req.t!("A metric is required")));
  }
  if (!Object.values(MrmThresholdOp).includes(op)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid threshold operator")));
  }
  if (severity !== undefined && !Object.values(MrmThresholdSeverity).includes(severity)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid threshold severity")));
  }
  if (breach_action !== undefined && !Object.values(MrmBreachAction).includes(breach_action)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid breach action")));
  }

  const valueNum = toNum(value_num);
  const valueLo = toNum(value_lo);
  const valueHi = toNum(value_hi);
  const shapeError = validateThresholdShape(req, op, valueNum, valueLo, valueHi);
  if (shapeError) {
    return res.status(400).json(STATUS_CODE[400](shapeError));
  }

  try {
    if (!(await modelExistsForOrgQuery(modelId, req.organizationId!))) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Model not found")));
    }
    const created = await createThresholdQuery(req.organizationId!, {
      model_inventory_id: modelId,
      metric: metric.trim(),
      segment: typeof segment === "string" && segment.trim() !== "" ? segment.trim() : null,
      window: typeof window === "string" && window.trim() !== "" ? window.trim() : null,
      op,
      value_num: op === MrmThresholdOp.OUTSIDE ? null : valueNum,
      value_lo: op === MrmThresholdOp.OUTSIDE ? valueLo : null,
      value_hi: op === MrmThresholdOp.OUTSIDE ? valueHi : null,
      severity: severity ?? MrmThresholdSeverity.WARN,
      breach_action: breach_action ?? MrmBreachAction.NOTIFY,
      active: active === undefined ? true : active === true,
    });
    logStructured("successful", `threshold created for model ${modelId}`, fn, FILE);
    return res.status(201).json(STATUS_CODE[201](created));
  } catch (error) {
    return fail(req, res, fn, "failed to create threshold", error);
  }
}

export async function updateThreshold(req: Request, res: Response) {
  const fn = "updateThreshold";
  const id = parseId(req.params.id);
  const { segment, window, op, value_num, value_lo, value_hi, severity, breach_action, active } =
    req.body ?? {};

  logStructured("processing", `updating threshold ${id}`, fn, FILE);

  if (Number.isNaN(id)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid threshold id")));
  }
  if (op !== undefined && !Object.values(MrmThresholdOp).includes(op)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid threshold operator")));
  }
  if (severity !== undefined && !Object.values(MrmThresholdSeverity).includes(severity)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid threshold severity")));
  }
  if (breach_action !== undefined && !Object.values(MrmBreachAction).includes(breach_action)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid breach action")));
  }

  try {
    const existing = await getThresholdByIdQuery(id, req.organizationId!);
    if (!existing) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Threshold not found")));
    }

    // Compute the effective post-update shape and validate it (app-level, before
    // the DB CHECK runs). Fall back to existing values for unspecified fields.
    const effectiveOp: MrmThresholdOp = (op ?? existing.op) as MrmThresholdOp;
    const effValueNum = value_num !== undefined ? toNum(value_num) : (existing.value_num ?? null);
    const effValueLo = value_lo !== undefined ? toNum(value_lo) : (existing.value_lo ?? null);
    const effValueHi = value_hi !== undefined ? toNum(value_hi) : (existing.value_hi ?? null);
    const shapeError = validateThresholdShape(
      req,
      effectiveOp,
      effValueNum,
      effValueLo,
      effValueHi,
    );
    if (shapeError) {
      return res.status(400).json(STATUS_CODE[400](shapeError));
    }

    const updated = await updateThresholdQuery(id, req.organizationId!, {
      segment:
        segment === undefined
          ? undefined
          : typeof segment === "string" && segment.trim() !== ""
            ? segment.trim()
            : null,
      window:
        window === undefined
          ? undefined
          : typeof window === "string" && window.trim() !== ""
            ? window.trim()
            : null,
      op,
      value_num:
        value_num === undefined
          ? undefined
          : effectiveOp === MrmThresholdOp.OUTSIDE
            ? null
            : effValueNum,
      value_lo:
        value_lo === undefined
          ? undefined
          : effectiveOp === MrmThresholdOp.OUTSIDE
            ? effValueLo
            : null,
      value_hi:
        value_hi === undefined
          ? undefined
          : effectiveOp === MrmThresholdOp.OUTSIDE
            ? effValueHi
            : null,
      severity,
      breach_action,
      active: active === undefined ? undefined : active === true,
    });
    if (!updated) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Threshold not found")));
    }
    logStructured("successful", `threshold ${id} updated`, fn, FILE);
    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    return fail(req, res, fn, "failed to update threshold", error);
  }
}

export async function deleteThreshold(req: Request, res: Response) {
  const fn = "deleteThreshold";
  const id = parseId(req.params.id);
  logStructured("processing", `deleting threshold ${id}`, fn, FILE);

  if (Number.isNaN(id)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid threshold id")));
  }

  try {
    // Thresholds are configuration, not audit records — they are deletable.
    // Past evaluations keep their frozen threshold_snapshot, so deleting a
    // threshold never rewrites history.
    const deleted = await deleteThresholdQuery(id, req.organizationId!);
    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Threshold not found")));
    }
    logStructured("successful", `threshold ${id} deleted`, fn, FILE);
    return res.status(200).json(STATUS_CODE[200]({ id, deleted: true }));
  } catch (error) {
    return fail(req, res, fn, "failed to delete threshold", error);
  }
}

// ===========================================================================
// Metric-key catalogue (JWT-auth)
// ===========================================================================

export async function getMetricKeys(req: Request, res: Response) {
  const fn = "getMetricKeys";
  logStructured("processing", "fetching metric keys", fn, FILE);
  try {
    const rows = await getMetricKeysQuery(req.organizationId!);
    logStructured("successful", "metric keys retrieved", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](rows));
  } catch (error) {
    return fail(req, res, fn, "failed to retrieve metric keys", error);
  }
}

export async function createMetricKey(req: Request, res: Response) {
  const fn = "createMetricKey";
  const { key, display_name } = req.body ?? {};

  logStructured("processing", "creating metric key", fn, FILE);

  if (typeof key !== "string" || key.trim().length === 0) {
    return res.status(400).json(STATUS_CODE[400](req.t!("A metric key is required")));
  }
  if (key.trim().length > 100) {
    return res
      .status(400)
      .json(STATUS_CODE[400](req.t!("A metric key must be 100 characters or fewer")));
  }

  try {
    const created = await createMetricKeyQuery(
      req.organizationId!,
      key.trim(),
      typeof display_name === "string" && display_name.trim() !== "" ? display_name.trim() : null,
    );
    logStructured("successful", "metric key created", fn, FILE);
    return res.status(201).json(STATUS_CODE[201](created));
  } catch (error) {
    // UNIQUE(org, key) collision → 409.
    if (isUniqueViolation(error)) {
      return res
        .status(409)
        .json(STATUS_CODE[409](req.t!("A metric key with this name already exists")));
    }
    return fail(req, res, fn, "failed to create metric key", error);
  }
}

// ===========================================================================
// Monitoring read (JWT-auth)
// ===========================================================================

export async function getModelMonitoring(req: Request, res: Response) {
  const fn = "getModelMonitoring";
  const modelId = parseId(req.params.modelId);
  logStructured("processing", `fetching monitoring for model ${modelId}`, fn, FILE);

  if (Number.isNaN(modelId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid model id")));
  }

  try {
    if (!(await modelExistsForOrgQuery(modelId, req.organizationId!))) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Model not found")));
    }
    const rows = await getModelMonitoringQuery(req.organizationId!, modelId);
    logStructured("successful", `monitoring retrieved for model ${modelId}`, fn, FILE);
    return res.status(200).json(STATUS_CODE[200](rows));
  } catch (error) {
    return fail(req, res, fn, "failed to retrieve model monitoring", error);
  }
}

export async function getMetricTrend(req: Request, res: Response) {
  const fn = "getMetricTrend";
  const modelId = parseId(req.params.modelId);
  const metric = typeof req.query.metric === "string" ? req.query.metric : undefined;
  logStructured("processing", `fetching trend for model ${modelId}`, fn, FILE);

  if (Number.isNaN(modelId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid model id")));
  }
  if (!metric || metric.trim() === "") {
    return res.status(400).json(STATUS_CODE[400](req.t!("A metric query parameter is required")));
  }

  try {
    if (!(await modelExistsForOrgQuery(modelId, req.organizationId!))) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Model not found")));
    }
    const rows = await getMetricTrendQuery(req.organizationId!, modelId, metric.trim());
    logStructured("successful", `trend retrieved for model ${modelId}`, fn, FILE);
    return res.status(200).json(STATUS_CODE[200](rows));
  } catch (error) {
    return fail(req, res, fn, "failed to retrieve metric trend", error);
  }
}

export async function getBreachHistory(req: Request, res: Response) {
  const fn = "getBreachHistory";
  const modelId = parseId(req.params.modelId);
  const metric = typeof req.query.metric === "string" ? req.query.metric : undefined;
  logStructured("processing", `fetching breach history for model ${modelId}`, fn, FILE);

  if (Number.isNaN(modelId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid model id")));
  }

  try {
    if (!(await modelExistsForOrgQuery(modelId, req.organizationId!))) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Model not found")));
    }
    const rows = await getBreachHistoryQuery(
      req.organizationId!,
      modelId,
      metric && metric.trim() !== "" ? metric.trim() : undefined,
    );
    logStructured("successful", `breach history retrieved for model ${modelId}`, fn, FILE);
    return res.status(200).json(STATUS_CODE[200](rows));
  } catch (error) {
    return fail(req, res, fn, "failed to retrieve breach history", error);
  }
}
