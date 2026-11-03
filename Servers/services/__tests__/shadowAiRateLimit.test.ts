jest.mock("../../database/db", () => ({ sequelize: { transaction: jest.fn(), query: jest.fn() } }));
jest.mock("../../utils/shadowAiConfig.utils", () => ({ getSettingsQuery: jest.fn() }));
jest.mock("../shadowAiToolMatcher.service", () => ({}));
jest.mock("../shadowAiModelExtractor.service", () => ({}));
jest.mock("../shadowAiAlertNotification.service", () => ({}));
jest.mock("../../utils/shadowAiIngestion.utils", () => ({}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { getSettingsQuery } from "../../utils/shadowAiConfig.utils";
import { checkShadowAiRateLimit } from "../shadowAiIngestion.service";

const settings = getSettingsQuery as jest.Mock;

describe("checkShadowAiRateLimit", () => {
  // Each test uses its own organization: the hourly buckets live for the process.
  let org = 1000;
  beforeEach(() => {
    org++;
    settings.mockReset();
    settings.mockResolvedValue({ rate_limit_max_events_per_hour: 10 });
  });

  it("gives refunded events back to the hour's quota", async () => {
    const first = await checkShadowAiRateLimit(org, 8);
    expect(first).toEqual(expect.objectContaining({ allowed: true, maxPerHour: 10 }));
    expect((await checkShadowAiRateLimit(org, 8)).allowed).toBe(false);

    first.refund(8);
    expect((await checkShadowAiRateLimit(org, 8)).allowed).toBe(true);
  });

  it("never refunds more than the batch counted", async () => {
    await checkShadowAiRateLimit(org, 5);
    const second = await checkShadowAiRateLimit(org, 3);
    second.refund(100);
    second.refund(100);
    // 5 still counted: 6 more would exceed 10, 5 more fits.
    expect((await checkShadowAiRateLimit(org, 6)).allowed).toBe(false);
    expect((await checkShadowAiRateLimit(org, 5)).allowed).toBe(true);
  });

  it("refunds nothing once the hour window has moved on", async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    try {
      const old = await checkShadowAiRateLimit(org, 8);
      clock.mockReturnValue(now + 60 * 60 * 1000);
      await checkShadowAiRateLimit(org, 8);
      old.refund(8);
      expect((await checkShadowAiRateLimit(org, 3)).allowed).toBe(false);
    } finally {
      clock.mockRestore();
    }
  });

  it("reads settings every time by default, and once within settingsMaxAgeMs", async () => {
    await checkShadowAiRateLimit(org, 1);
    await checkShadowAiRateLimit(org, 1);
    expect(settings).toHaveBeenCalledTimes(2);

    settings.mockClear();
    await checkShadowAiRateLimit(org, 1, { settingsMaxAgeMs: 30_000 });
    await checkShadowAiRateLimit(org, 1, { settingsMaxAgeMs: 30_000 });
    expect(settings).toHaveBeenCalledTimes(1);
  });

  it("allows the batch with no refund when settings cannot be read", async () => {
    settings.mockRejectedValue(new Error("no table"));
    const result = await checkShadowAiRateLimit(org, 50);
    expect(result).toEqual(expect.objectContaining({ allowed: true, maxPerHour: 0 }));
    expect(() => result.refund(50)).not.toThrow();
  });
});
