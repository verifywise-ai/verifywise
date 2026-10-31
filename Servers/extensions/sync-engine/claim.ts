import { randomUUID } from "crypto";
import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import logger, { logStructured } from "../../utils/logger/fileLogger";
import {
  RunSupersededError,
  SyncInProgressError,
  errorCode,
  errorMessage,
  isUniqueViolation,
  truncateMessage,
} from "./errors";
import { getSyncProvider, statusKinds } from "./registry";
import { recordFailureForSchedule, resetScheduleFailures } from "./schedule";
import { sqlOwnsRunFragment, sqlRunIsLive } from "./sql";
import {
  ABANDONED_RUN_MESSAGE,
  DEFAULT_RUN_DEADLINE_MS,
  RunContext,
  RunResult,
  SKIPPED_RUN_MESSAGE,
  SyncProvider,
} from "./types";

const fileName = "claim.ts";

/** A claimed run: its row and the random token only this run holds. */
export interface ClaimedRun {
  runId: number;
  token: string;
  orgId: number;
  key: string;
  kind: string;
  triggeredBy: number | null;
}

/** Close the org's stale `started` rows of this extension as abandoned. */
async function closeStaleRuns(
  provider: SyncProvider,
  orgId: number,
  transaction: Transaction,
): Promise<Array<{ kind: string; started_at: Date }>> {
  const [closed] = (await sequelize.query(
    `UPDATE extension_sync_runs r
        SET status = 'abandoned', code = 'abandoned', message = :message, completed_at = now()
      WHERE r.organization_id = :orgId AND r.extension_key = :key
        AND r.status = 'started' AND NOT ${sqlRunIsLive("r")}
      RETURNING r.kind, r.started_at;`,
    { replacements: { orgId, key: provider.key, message: ABANDONED_RUN_MESSAGE }, transaction },
  )) as unknown as [Array<{ kind: string; started_at: Date }>, unknown];
  return closed ?? [];
}

/** The per-(extension, org) advisory lock every claim and stale sweep takes. */
async function lockOrgRuns(key: string, orgId: number, transaction: Transaction): Promise<void> {
  await sequelize.query(`SELECT pg_advisory_xact_lock(hashtext('ext_sync:' || :key), :orgId);`, {
    replacements: { key, orgId },
    type: QueryTypes.SELECT,
    transaction,
  });
}

/**
 * Close the org's stale runs (under the org lock); each abandoned scheduled
 * run counts as a scheduled failure.
 */
async function closeStaleRunsAndRecord(
  provider: SyncProvider,
  orgId: number,
  transaction: Transaction,
): Promise<void> {
  for (const closed of await closeStaleRuns(provider, orgId, transaction)) {
    if (closed.kind === provider.scheduledKind) {
      await recordFailureForSchedule(provider.key, orgId, closed.started_at, transaction);
    }
  }
}

/**
 * The tick's sweep before it looks for due orgs: close every org's stale runs
 * of this extension, so an abandoned scheduled run raises the backoff before
 * the due query reads it (else the retry is scheduled one failure short). This
 * system query spans organizations by design; each org is then closed in its
 * own transaction under its own lock. Returns the orgs swept.
 */
export async function closeStaleRunsForProvider(provider: SyncProvider): Promise<number[]> {
  const rows = (await sequelize.query(
    `SELECT DISTINCT r.organization_id
       FROM extension_sync_runs r
      WHERE r.extension_key = :key AND r.status = 'started' AND NOT ${sqlRunIsLive("r")}
      ORDER BY r.organization_id;`,
    { replacements: { key: provider.key }, type: QueryTypes.SELECT },
  )) as Array<{ organization_id: number }>;
  const orgIds = rows.map((row) => Number(row.organization_id));
  for (const orgId of orgIds) {
    await sequelize.transaction(async (transaction) => {
      await lockOrgRuns(provider.key, orgId, transaction);
      await closeStaleRunsAndRecord(provider, orgId, transaction);
    });
  }
  return orgIds;
}

/**
 * Atomically record the start of a run, or refuse with SyncInProgressError if
 * one of this extension is live for the org. One claim per (extension, org)
 * covers every exclusive operation the provider declares. The transaction's
 * advisory lock serialises the check-then-insert; the long-running guard is
 * the `started` row (and its partial unique index). Stale rows are closed as
 * abandoned first. The row gets a random token that every later ownership
 * check matches.
 */
export async function claimRun(
  key: string,
  orgId: number,
  kind: string,
  triggeredBy: number | null,
): Promise<ClaimedRun> {
  const provider = getSyncProvider(key);
  if (!provider.kinds.includes(kind)) throw new Error(`"${kind}" is not a run kind of ${key}`);
  const token = randomUUID();
  return sequelize.transaction(async (transaction) => {
    await lockOrgRuns(key, orgId, transaction);
    await closeStaleRunsAndRecord(provider, orgId, transaction);
    const running = (await sequelize.query(
      `SELECT id FROM extension_sync_runs
        WHERE organization_id = :orgId AND extension_key = :key AND status = 'started'
        LIMIT 1;`,
      { replacements: { orgId, key }, type: QueryTypes.SELECT, transaction },
    )) as Array<{ id: number }>;
    if (running.length > 0) throw new SyncInProgressError();
    try {
      const inserted = (await sequelize.query(
        `INSERT INTO extension_sync_runs
           (organization_id, extension_key, kind, status, run_token, triggered_by,
            started_at, heartbeat_at)
         VALUES (:orgId, :key, :kind, 'started', :token, :triggeredBy, now(), now())
         RETURNING id;`,
        {
          replacements: { orgId, key, kind, token, triggeredBy },
          type: QueryTypes.INSERT,
          transaction,
        },
      )) as unknown as [Array<{ id: number }>, number];
      return { runId: inserted[0][0].id, token, orgId, key, kind, triggeredBy };
    } catch (err) {
      if (isUniqueViolation(err)) throw new SyncInProgressError();
      throw err;
    }
  });
}

function cleanCounts(counts: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, value] of Object.entries(counts ?? {})) {
    if (typeof value === "number" && Number.isFinite(value)) out[name] = value;
  }
  return out;
}

/** The engine's RunContext. Every write matches id, org, extension, token and `started`. */
export class EngineRunContext implements RunContext {
  readonly orgId: number;
  readonly runId: number;
  readonly kind: string;
  readonly payload: unknown;
  readonly triggeredBy: number | null;
  readonly signal: AbortSignal;
  private settledFlag = false;
  private readonly timer: NodeJS.Timeout;

  constructor(
    readonly provider: SyncProvider,
    private readonly run: ClaimedRun,
    payload: unknown,
  ) {
    this.orgId = run.orgId;
    this.runId = run.runId;
    this.kind = run.kind;
    this.triggeredBy = run.triggeredBy;
    this.payload = payload;
    const controller = new AbortController();
    this.timer = setTimeout(
      () => controller.abort(new Error(`${run.key} run ${run.runId} reached its deadline`)),
      provider.runDeadlineMs ?? DEFAULT_RUN_DEADLINE_MS,
    );
    this.timer.unref();
    this.signal = controller.signal;
  }

  /** True once this run's row is closed or released (after commit when written in a transaction). */
  get settled(): boolean {
    return this.settledFlag;
  }

  markSettled(transaction?: Transaction): void {
    if (transaction) {
      transaction.afterCommit(() => {
        this.settledFlag = true;
      });
    } else {
      this.settledFlag = true;
    }
  }

  dispose(): void {
    clearTimeout(this.timer);
  }

  /** Bind parameters identifying this run in every ownership check. */
  ref(): { runId: number; orgId: number; key: string; token: string } {
    return {
      runId: this.run.runId,
      orgId: this.run.orgId,
      key: this.run.key,
      token: this.run.token,
    };
  }

  async heartbeat(transaction?: Transaction): Promise<void> {
    const beat = (t?: Transaction) =>
      sequelize.query(
        `UPDATE extension_sync_runs SET heartbeat_at = now()
          WHERE id = :runId AND organization_id = :orgId AND extension_key = :key
            AND run_token = :token AND status = 'started'
          RETURNING id;`,
        { replacements: this.ref(), transaction: t },
      ) as unknown as Promise<[Array<{ id: number }>, unknown]>;
    let rows: Array<{ id: number }> | undefined;
    if (transaction) {
      [rows] = await beat(transaction);
    } else {
      // A short transaction with a lock timeout: if the caller holds this row's
      // share lock in another transaction, fail fast instead of hanging.
      rows = await sequelize.transaction(async (t) => {
        await sequelize.query(`SET LOCAL lock_timeout = '10s';`, { transaction: t });
        const [updated] = await beat(t);
        return updated;
      });
    }
    if (!rows || rows.length === 0) throw new RunSupersededError(this.runId);
  }

  sqlOwnsRun(alias = "own"): string {
    return sqlOwnsRunFragment(
      { runId: this.run.runId, orgId: this.run.orgId, token: this.run.token },
      alias,
    );
  }

  async assertOwned(transaction: Transaction): Promise<void> {
    const rows = (await sequelize.query(
      `SELECT id FROM extension_sync_runs
        WHERE id = :runId AND organization_id = :orgId AND extension_key = :key
          AND run_token = :token AND status = 'started'
        FOR SHARE;`,
      { replacements: this.ref(), type: QueryTypes.SELECT, transaction },
    )) as Array<{ id: number }>;
    if (rows.length === 0) throw new RunSupersededError(this.runId);
  }

  async finalize(result: RunResult, transaction?: Transaction): Promise<void> {
    if (!transaction) {
      // The completion and the schedule streak reset commit together.
      await sequelize.transaction((t) => this.completeIn(result, t));
      this.markSettled();
      return;
    }
    await this.completeIn(result, transaction);
    this.markSettled(transaction);
  }

  private async completeIn(result: RunResult, transaction: Transaction): Promise<void> {
    const [rows] = (await sequelize.query(
      `UPDATE extension_sync_runs
          SET status = 'completed', counts = CAST(:counts AS JSONB), message = :message,
              code = :code, completed_at = now()
        WHERE id = :runId AND organization_id = :orgId AND extension_key = :key
          AND run_token = :token AND status = 'started'
        RETURNING id;`,
      {
        replacements: {
          ...this.ref(),
          counts: JSON.stringify(cleanCounts(result.counts)),
          message: result.message ? truncateMessage(result.message) : null,
          code: result.code ?? null,
        },
        transaction,
      },
    )) as unknown as [Array<{ id: number }>, unknown];
    if (!rows || rows.length === 0) throw new RunSupersededError(this.runId);
    if (statusKinds(this.provider).includes(this.kind)) {
      await resetScheduleFailures(this.provider.key, this.orgId, transaction);
    }
  }

  async release(transaction?: Transaction): Promise<void> {
    const remove = () =>
      sequelize.query(
        `DELETE FROM extension_sync_runs
          WHERE id = :runId AND organization_id = :orgId AND extension_key = :key
            AND run_token = :token AND status = 'started';`,
        { replacements: this.ref(), transaction },
      );
    if (transaction) {
      await remove();
      this.markSettled(transaction);
      return;
    }
    try {
      await remove();
      this.markSettled();
    } catch (err) {
      // The row stays `started` and is closed as abandoned after the stale window.
      logger.error(`Extension sync: could not release run ${this.runId}:`, err);
    }
  }
}

export function createRunContext(
  provider: SyncProvider,
  run: ClaimedRun,
  payload: unknown,
): EngineRunContext {
  return new EngineRunContext(provider, run, payload);
}

/**
 * Close a run as failed with the error's message (cut to 2,000 characters)
 * and code. Only touches the run's own `started` row. Never throws: it runs in
 * catch blocks, where a second exception would hide the first.
 */
export async function failRun(ctx: EngineRunContext, err: unknown): Promise<void> {
  try {
    const message = truncateMessage(errorMessage(err));
    const code = errorCode(err);
    const closed = await sequelize.transaction(async (transaction) => {
      const [rows] = (await sequelize.query(
        `UPDATE extension_sync_runs
            SET status = 'failed', message = :message, code = :code, completed_at = now()
          WHERE id = :runId AND organization_id = :orgId AND extension_key = :key
            AND run_token = :token AND status = 'started'
          RETURNING started_at;`,
        { replacements: { ...ctx.ref(), message, code }, transaction },
      )) as unknown as [Array<{ started_at: Date }>, unknown];
      const row = rows?.[0] ?? null;
      if (row && ctx.kind === ctx.provider.scheduledKind) {
        await recordFailureForSchedule(ctx.provider.key, ctx.orgId, row.started_at, transaction);
      }
      return row;
    });
    if (!closed) {
      logger.warn(`Extension sync run ${ctx.runId} was already closed; failure not recorded`);
      return;
    }
    ctx.markSettled();
  } catch (finalizeErr) {
    logStructured(
      "error",
      `Extension sync run ${ctx.runId} could not be marked failed`,
      "failRun",
      fileName,
    );
    logger.error(`Extension sync failRun for run ${ctx.runId} failed:`, finalizeErr);
  }
}

/**
 * Run a claimed run to the end. A returned result is finalized; a provider that
 * finalized itself returns void. A thrown error closes the run as failed; a
 * lost claim (RunSupersededError) writes nothing. Never throws.
 */
export async function runClaimed(provider: SyncProvider, ctx: EngineRunContext): Promise<void> {
  try {
    const result = await provider.run(ctx);
    if (!ctx.settled) {
      if (result) await ctx.finalize(result);
      else await failRun(ctx, new Error(`${provider.key} ${ctx.kind} run returned no result`));
    }
  } catch (err) {
    if (err instanceof RunSupersededError) {
      logger.warn(err.message);
      return;
    }
    await failRun(ctx, err);
  } finally {
    ctx.dispose();
  }
}

export interface WithClaimOptions {
  payload?: unknown;
  /** Errors that mean "nothing was done": the claim is released instead of failed. */
  releaseOn?: (err: unknown) => boolean;
}

/**
 * An exclusive operation outside a sync (an import, a removal) under the same
 * per-(extension, org) claim. `fn` gets the run's context and returns its
 * value plus, optionally, a result. If `fn` did not finalize or release the
 * run itself, a result is finalized and no result releases the claim. A thrown
 * error closes the run as failed (or releases it, per `releaseOn`) and is
 * rethrown; RunSupersededError writes nothing. A provider that needs rollback
 * safety calls ctx.finalize(result, t) or ctx.release(t) inside its own data
 * transaction.
 */
export async function withClaim<T>(
  key: string,
  orgId: number,
  kind: string,
  triggeredBy: number | null,
  fn: (ctx: RunContext) => Promise<{ value: T; result?: RunResult }>,
  options: WithClaimOptions = {},
): Promise<T> {
  const provider = getSyncProvider(key);
  const run = await claimRun(key, orgId, kind, triggeredBy);
  const ctx = createRunContext(provider, run, options.payload ?? null);
  try {
    const { value, result } = await fn(ctx);
    if (!ctx.settled) {
      if (result) await ctx.finalize(result);
      else await ctx.release();
    }
    return value;
  } catch (err) {
    if (!(err instanceof RunSupersededError) && !ctx.settled) {
      if (options.releaseOn?.(err)) await ctx.release();
      else await failRun(ctx, err);
    }
    throw err;
  } finally {
    ctx.dispose();
  }
}

/**
 * A closed `skipped` row saying a manual run did not start because another run
 * held the claim. No token, so it never counts as a run for the schedule.
 * Never throws.
 */
export async function recordSkippedRun(
  key: string,
  orgId: number,
  kind: string,
  triggeredBy: number | null,
): Promise<void> {
  try {
    await sequelize.query(
      `INSERT INTO extension_sync_runs
         (organization_id, extension_key, kind, status, code, message, triggered_by,
          started_at, completed_at)
       VALUES (:orgId, :key, :kind, 'skipped', 'skipped', :message, :triggeredBy, now(), now());`,
      { replacements: { orgId, key, kind, triggeredBy, message: SKIPPED_RUN_MESSAGE } },
    );
  } catch (err) {
    logger.error(`Extension sync: could not record a skipped ${key} run for org ${orgId}:`, err);
  }
}
