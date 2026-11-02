/**
 * Per-source batching for the syslog listener.
 *
 * Events and drops are buffered per source and flushed at 500 events or 2
 * seconds after the first item. Each flush re-checks the source, counts the
 * batch against the organization's hourly limit (given back for events that
 * end up not stored, e.g. on rollback) and writes events plus the
 * source's stats in one transaction scoped to that organization
 * (`SET LOCAL app.current_org`), so it works with RLS enforcement on.
 * Events are never retried.
 */

import type { Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";
import { recordSyslogSourceStatsQuery } from "../../utils/shadowAiConfig.utils";
import { checkShadowAiRateLimit, ingestShadowAiEvents } from "../shadowAiIngestion.service";
import { CachedSource, revalidateSource } from "./sourceCache";
import type { DropReason, SyslogEvent } from "./types";

export const FLUSH_MAX_EVENTS = 500;
export const FLUSH_INTERVAL_MS = 2_000;
// Events buffered or being written across all sources. Beyond this the
// database is not keeping up, and new events are dropped as rate_limited.
export const MAX_PENDING_EVENTS = 20_000;
// Flushes running at once, so a flood cannot take the HTTP API's DB pool.
export const MAX_CONCURRENT_FLUSHES = 2;
const FAILURE_LOG_INTERVAL_MS = 60_000;
// How long a flush may reuse an organization's hourly limit instead of
// reading settings again. A changed limit applies within this time.
export const RATE_LIMIT_SETTINGS_MAX_AGE_MS = 30_000;

interface Batch {
  source: CachedSource;
  events: SyslogEvent[];
  dropped: number;
  lastDropReason: DropReason | null;
  timer: NodeJS.Timeout | null;
}

export class SourceBatcher {
  private batches = new Map<string, Batch>();
  private inflight = new Set<Promise<void>>();
  private pendingEvents = 0;
  private runningFlushes = 0;
  private waiting: (() => void)[] = [];
  private lastFailureLog = new Map<number, number>();
  /** Flushes that failed and were rolled back (process lifetime). */
  failedFlushes = 0;
  /**
   * Events discarded because their source was revoked or could not be
   * re-checked, or because the flush failed in a way write() did not handle.
   */
  discardedEvents = 0;

  add(src: CachedSource, event: SyslogEvent): void {
    if (this.pendingEvents >= MAX_PENDING_EVENTS) {
      this.drop(src, "rate_limited");
      return;
    }
    const batch = this.batchFor(src);
    batch.events.push(event);
    this.pendingEvents++;
    if (batch.events.length >= FLUSH_MAX_EVENTS) this.flushBatch(this.keyOf(src));
  }

  drop(src: CachedSource, reason: DropReason): void {
    const batch = this.batchFor(src);
    batch.dropped++;
    batch.lastDropReason = reason;
  }

  /** Flush every buffered batch and wait for all flushes, including running ones. */
  async flushAll(): Promise<void> {
    for (const key of [...this.batches.keys()]) this.flushBatch(key);
    while (this.inflight.size > 0) {
      await Promise.allSettled([...this.inflight]);
    }
  }

  private keyOf(src: CachedSource): string {
    return `${src.configId}:${src.keyHash ?? ""}`;
  }

  private batchFor(src: CachedSource): Batch {
    const key = this.keyOf(src);
    let batch = this.batches.get(key);
    if (!batch) {
      batch = { source: src, events: [], dropped: 0, lastDropReason: null, timer: null };
      batch.timer = setTimeout(() => this.flushBatch(key), FLUSH_INTERVAL_MS);
      batch.timer.unref();
      this.batches.set(key, batch);
    }
    return batch;
  }

  private flushBatch(key: string): void {
    const batch = this.batches.get(key);
    if (!batch) return;
    this.batches.delete(key);
    if (batch.timer) clearTimeout(batch.timer);
    // write() handles its own failures. This catch is the last line, so a
    // timer-started flush can never leave an unhandled rejection behind.
    const work = this.runLimited(() => this.write(batch))
      .catch((error) => {
        this.failedFlushes++;
        this.discardedEvents += batch.events.length;
        const { configId, organizationId } = batch.source;
        this.logFailure(configId, organizationId, batch.events.length, error);
      })
      .finally(() => {
        this.pendingEvents -= batch.events.length;
        this.inflight.delete(work);
      });
    this.inflight.add(work);
  }

  private async runLimited(fn: () => Promise<void>): Promise<void> {
    if (this.runningFlushes >= MAX_CONCURRENT_FLUSHES) {
      // A finishing flush hands its slot straight to us, so runningFlushes
      // already counts this one and no new flush can take it meanwhile.
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.runningFlushes++;
    }
    try {
      await fn();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.runningFlushes--;
    }
  }

  private async write(batch: Batch): Promise<void> {
    const source = await revalidateSource(batch.source);
    // Deleted, deactivated or re-keyed since the lines arrived, or the cache
    // could not be refreshed: discard without writing.
    if (!source) {
      this.discardedEvents += batch.events.length;
      return;
    }

    const { organizationId, configId } = source;
    let events = batch.events;
    let dropped = batch.dropped;
    let lastDropReason = batch.lastDropReason;

    // Events counted against the hourly limit are given back if not stored.
    let refundQuota: (count: number) => void = () => {};
    if (events.length > 0) {
      const limit = await checkShadowAiRateLimit(organizationId, events.length, {
        settingsMaxAgeMs: RATE_LIMIT_SETTINGS_MAX_AGE_MS,
      });
      if (limit.allowed) {
        refundQuota = limit.refund;
      } else {
        dropped += events.length;
        lastDropReason = "rate_limited";
        events = [];
      }
    }

    let transaction: Transaction | undefined;
    try {
      // Inside the try: the pool can time out or the database be down.
      transaction = await sequelize.transaction();
      await sequelize.query("SET LOCAL app.current_org = :orgId", {
        replacements: { orgId: organizationId },
        transaction,
      });
      let accepted = 0;
      if (events.length > 0) {
        let skipped = 0;
        ({ ingested: accepted, skipped } = await ingestShadowAiEvents(organizationId, events, {
          transaction,
          skipInvalidRows: true,
        }));
        // Rows that do not fit a column are dropped, not allowed to fail the batch.
        if (skipped > 0) {
          dropped += skipped;
          lastDropReason = "unparseable";
        }
      }
      const notStored = events.length - accepted;
      await recordSyslogSourceStatsQuery(
        organizationId,
        configId,
        accepted,
        dropped,
        lastDropReason,
        transaction,
      );
      await transaction.commit();
      refundQuota(notStored);
    } catch (error) {
      try {
        await transaction?.rollback();
      } catch {
        // The failure below is what gets logged.
      }
      refundQuota(events.length);
      this.failedFlushes++;
      this.logFailure(configId, organizationId, events.length, error);
    }
  }

  /** At most one log line per source per minute; never line contents or keys. */
  private logFailure(configId: number, organizationId: number, count: number, error: unknown) {
    const now = Date.now();
    const last = this.lastFailureLog.get(configId) ?? 0;
    if (now - last < FAILURE_LOG_INTERVAL_MS) return;
    this.lastFailureLog.set(configId, now);
    for (const [id, at] of this.lastFailureLog) {
      if (now - at >= FAILURE_LOG_INTERVAL_MS) this.lastFailureLog.delete(id);
    }
    const message = error instanceof Error ? error.message : "unknown error";
    logger.error(
      `Shadow AI syslog flush failed for source ${configId} (organization ${organizationId}), ${count} events discarded: ${message}`,
    );
  }
}
