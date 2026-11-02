jest.mock("../../../utils/shadowAiConfig.utils", () => ({
  listActiveSyslogSourcesQuery: jest.fn(),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { listActiveSyslogSourcesQuery } from "../../../utils/shadowAiConfig.utils";
import {
  invalidateSourceCache,
  resolveByKey,
  revalidateSource,
  sourcesForIp,
  SOURCE_CACHE_TTL_MS,
} from "../sourceCache";
import { hashSourceKey } from "../sourceKey";

const list = listActiveSyslogSourcesQuery as jest.Mock;
const KEY = `vwsl_7_${"ab".repeat(24)}`;
const row = {
  id: 1,
  organization_id: 7,
  parser_type: "zscaler",
  source_identifier: "10.0.0.5",
  key_hash: hashSourceKey(KEY),
};

describe("source cache", () => {
  let now = 1_000_000;

  beforeEach(() => {
    list.mockReset();
    jest.spyOn(Date, "now").mockImplementation(() => now);
    invalidateSourceCache();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("resolves a key and enforces the key's embedded organization", async () => {
    list.mockResolvedValue([row]);
    expect(await resolveByKey(KEY)).toMatchObject({ configId: 1, organizationId: 7 });

    const forged = `vwsl_8_${"ab".repeat(24)}`;
    list.mockResolvedValue([{ ...row, key_hash: hashSourceKey(forged) }]);
    invalidateSourceCache();
    expect(await resolveByKey(forged)).toBeNull();
  });

  it("shares one in-flight reload between concurrent callers", async () => {
    list.mockResolvedValue([row]);
    await Promise.all([resolveByKey(KEY), resolveByKey(KEY), sourcesForIp("10.0.0.5")]);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("does not answer a caller after invalidation with a reload that started before it", async () => {
    const stale = { ...row, parser_type: "squid" };
    let finishOld!: (rows: unknown[]) => void;
    list
      .mockImplementationOnce(() => new Promise((resolve) => (finishOld = resolve)))
      .mockResolvedValue([row]);

    const early = resolveByKey(KEY);
    await Promise.resolve();
    invalidateSourceCache();
    // Both arrive after the invalidation: they must share one fresh reload.
    const late = Promise.all([resolveByKey(KEY), sourcesForIp("10.0.0.5")]);
    finishOld([stale]);

    expect((await early)?.parserType).toBe("squid");
    const [byKey, byIp] = await late;
    expect(byKey?.parserType).toBe("zscaler");
    expect(byIp.map((s) => s.parserType)).toEqual(["zscaler"]);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("serves nothing when a reload fails after invalidation", async () => {
    list.mockResolvedValue([row]);
    const src = await resolveByKey(KEY);
    expect(src).not.toBeNull();

    list.mockRejectedValue(new Error("db down"));
    invalidateSourceCache();
    expect(await resolveByKey(KEY)).toBeNull();
    expect(await sourcesForIp("10.0.0.5")).toEqual([]);
    expect(await revalidateSource(src!)).toBeNull();
  });

  it("serves nothing when a reload fails after the TTL expires", async () => {
    list.mockResolvedValue([row]);
    const src = await resolveByKey(KEY);
    expect(src).not.toBeNull();

    list.mockRejectedValue(new Error("db down"));
    now += SOURCE_CACHE_TTL_MS + 1;
    expect(await resolveByKey(KEY)).toBeNull();
    expect(await revalidateSource(src!)).toBeNull();
  });

  it("serves rows again once a later reload succeeds", async () => {
    list.mockRejectedValue(new Error("db down"));
    expect(await resolveByKey(KEY)).toBeNull();

    list.mockResolvedValue([row]);
    now += 10_000;
    expect(await resolveByKey(KEY)).not.toBeNull();
  });
});
