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
import { FLUSH_MAX_EVENTS, SourceBatcher } from "../batcher";
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
  beforeEach(() => {
    jest.clearAllMocks();
    revalidate.mockImplementation(async (src: CachedSource) => src);
    rateLimit.mockResolvedValue(true);
    ingest.mockResolvedValue({ ingested: FLUSH_MAX_EVENTS, toolsMatched: 0, skipped: 0 });
    recordStats.mockResolvedValue(undefined);
    (sequelize.query as unknown as jest.Mock).mockResolvedValue(undefined);
    transaction.mockResolvedValue({
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
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
