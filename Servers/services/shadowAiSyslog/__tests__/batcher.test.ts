jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));
jest.mock("../../shadowAiIngestion.service", () => ({
  checkShadowAiRateLimit: jest.fn(),
  ingestShadowAiEvents: jest.fn(),
}));
jest.mock("../sourceCache", () => ({ revalidateSource: jest.fn() }));
jest.mock("../../../utils/shadowAiConfig.utils", () => ({
  recordSyslogSourceStatsQuery: jest.fn(),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { sequelize } from "../../../database/db";
import { checkShadowAiRateLimit, ingestShadowAiEvents } from "../../shadowAiIngestion.service";
import { revalidateSource } from "../sourceCache";
import { recordSyslogSourceStatsQuery } from "../../../utils/shadowAiConfig.utils";
import {
  FLUSH_MAX_EVENTS,
  MAX_CONCURRENT_FLUSHES,
  RATE_LIMIT_SETTINGS_MAX_AGE_MS,
  SourceBatcher,
} from "../batcher";
import type { CachedSource } from "../sourceCache";
import type { SyslogEvent } from "../types";

const transaction = sequelize.transaction as unknown as jest.Mock;
const rateLimit = checkShadowAiRateLimit as jest.Mock;
const ingest = ingestShadowAiEvents as jest.Mock;
const revalidate = revalidateSource as jest.Mock;
const recordStats = recordSyslogSourceStatsQuery as jest.Mock;

const source = (configId: number): CachedSource => ({
  configId,
  organizationId: 7,
  parserType: "zscaler",
  allowedIp: null,
  keyHash: `hash-${configId}`,
});
const event: SyslogEvent = {
  user_email: "a@example.com",
  destination: "chat.openai.com",
  timestamp: "2026-11-01T10:00:00Z",
};

/** Promises of the flushes started so far (private state, read for the test). */
const inflightOf = (b: SourceBatcher): Promise<void>[] => [
  ...(b as unknown as { inflight: Set<Promise<void>> }).inflight,
];

/** Fill a source's batch so it flushes at once, without waiting for the timer. */
const fill = (b: SourceBatcher, src: CachedSource) => {
  for (let i = 0; i < FLUSH_MAX_EVENTS; i++) b.add(src, event);
};

describe("SourceBatcher", () => {
  let refund: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    revalidate.mockImplementation(async (src: CachedSource) => src);
    refund = jest.fn();
    rateLimit.mockResolvedValue({ allowed: true, maxPerHour: 0, refund });
    ingest.mockResolvedValue({ ingested: FLUSH_MAX_EVENTS, toolsMatched: 0, skipped: 0 });
    recordStats.mockResolvedValue(undefined);
    (sequelize.query as unknown as jest.Mock).mockResolvedValue(undefined);
    transaction.mockResolvedValue({
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    });
  });

  describe("the hourly quota", () => {
    it("reuses the organization's limit for a short time", async () => {
      const b = new SourceBatcher();
      fill(b, source(1));
      await b.flushAll();
      expect(rateLimit).toHaveBeenCalledWith(7, FLUSH_MAX_EVENTS, {
        settingsMaxAgeMs: RATE_LIMIT_SETTINGS_MAX_AGE_MS,
      });
    });

    it("gives the batch back when the write rolls back", async () => {
      recordStats.mockRejectedValue(new Error("deadlock"));
      const b = new SourceBatcher();
      fill(b, source(1));
      await b.flushAll();
      expect(b.failedFlushes).toBe(1);
      expect(refund).toHaveBeenCalledWith(FLUSH_MAX_EVENTS);
    });

    it("gives back rows that were skipped, after a commit", async () => {
      ingest.mockResolvedValue({ ingested: FLUSH_MAX_EVENTS - 3, toolsMatched: 0, skipped: 3 });
      const b = new SourceBatcher();
      fill(b, source(1));
      await b.flushAll();
      expect(refund).toHaveBeenCalledTimes(1);
      expect(refund).toHaveBeenCalledWith(3);
    });

    it("gives nothing back after a commit that stored every event", async () => {
      const b = new SourceBatcher();
      fill(b, source(1));
      await b.flushAll();
      expect(refund).toHaveBeenCalledWith(0);
    });
  });

  describe("the concurrent flush cap", () => {
    type Limited = {
      runLimited: (fn: () => Promise<void>) => Promise<void>;
      waiting: (() => void)[];
    };

    it(`never runs more than ${MAX_CONCURRENT_FLUSHES} flushes, even when one starts as a slot is handed over`, async () => {
      const b = new SourceBatcher() as unknown as Limited;
      let running = 0;
      let peak = 0;
      const releases: (() => void)[] = [];
      const job = () => async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise<void>((resolve) => releases.push(resolve));
        running--;
      };

      // Fill every slot, then queue one waiter.
      const runs = Array.from({ length: MAX_CONCURRENT_FLUSHES + 1 }, () => b.runLimited(job()));
      await Promise.resolve();
      expect(running).toBe(MAX_CONCURRENT_FLUSHES);

      // The moment a finishing flush resumes the waiter, before the waiter
      // runs, a new flush arrives: it must queue, not take the slot.
      const resumeWaiter = b.waiting[0];
      let late: Promise<void> | undefined;
      b.waiting[0] = () => {
        resumeWaiter();
        late = b.runLimited(job());
      };

      releases.shift()!();
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(peak).toBe(MAX_CONCURRENT_FLUSHES);

      while (releases.length > 0 || running > 0) {
        releases.shift()?.();
        await new Promise((resolve) => setImmediate(resolve));
      }
      await Promise.all([...runs, late]);
      expect(peak).toBe(MAX_CONCURRENT_FLUSHES);
    });
  });

  describe("a flush that cannot get a transaction", () => {
    it("resolves, counts a failed flush and writes nothing", async () => {
      transaction.mockRejectedValue(new Error("pool timeout"));
      const b = new SourceBatcher();
      fill(b, source(1));

      const flushes = inflightOf(b);
      expect(flushes).toHaveLength(1);
      await expect(flushes[0]).resolves.toBeUndefined();
      expect(b.failedFlushes).toBe(1);
      expect(ingest).not.toHaveBeenCalled();
    });
  });

  describe("a flush that fails outside write()'s own handling", () => {
    it("resolves and counts the batch as discarded", async () => {
      revalidate.mockRejectedValue(new Error("unexpected"));
      const b = new SourceBatcher();
      fill(b, source(1));

      await expect(inflightOf(b)[0]).resolves.toBeUndefined();
      expect(b.failedFlushes).toBe(1);
      expect(b.discardedEvents).toBe(FLUSH_MAX_EVENTS);
    });
  });
});
