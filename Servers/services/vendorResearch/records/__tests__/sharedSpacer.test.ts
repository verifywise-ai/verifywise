/**
 * The spacer that every worker shares (M2 Task 4). The script itself runs on a real Redis in
 * tests/integration/vrdb.spacer.test.ts; here Redis is a fake that answers what the script would.
 */
const applicationClient = { status: "ready", eval: jest.fn() };
jest.mock("../../../../database/redis", () => ({
  __esModule: true,
  default: applicationClient,
}));

import {
  NVD_SPACER_KEY,
  SEC_LIMITS,
  SEC_SPACER_KEY,
  SPACER_SCRIPT,
  type SpacerRedis,
  applicationRedis,
  createSharedSpacer,
} from "../sharedSpacer";

const LIMITS = { limit: 4, windowMs: 30_000, maxWaitMs: 3_000 };
const KEY = "vrdb:spacer:test";

const setup = (
  answer: (...args: Array<string | number>) => Promise<unknown>,
  maxWaitMs = 3_000,
) => {
  const slept: number[] = [];
  const calls: Array<Array<string | number>> = [];
  const redis: SpacerRedis = {
    eval: (...args: Array<string | number>) => {
      calls.push(args);
      return answer(...args);
    },
  };
  const spacer = createSharedSpacer(
    { ...LIMITS, maxWaitMs },
    {
      redis,
      key: KEY,
      sleep: async (ms) => {
        slept.push(ms);
      },
    },
  );
  return { spacer, slept, calls };
};

const signal = () => new AbortController().signal;

describe("createSharedSpacer", () => {
  it("waits the time the script answers", async () => {
    const { spacer, slept, calls } = setup(async () => 1_250);

    expect(await spacer(signal())).toBe(true);

    expect(slept).toEqual([1_250]);
    expect(calls).toEqual([[SPACER_SCRIPT, 2, KEY, `${KEY}:seq`, 4, 30_000, 3_000]]);
  });

  it("does not sleep when the turn is now", async () => {
    const { spacer, slept } = setup(async () => 0);

    expect(await spacer(signal())).toBe(true);
    expect(slept).toEqual([]);
  });

  it("refuses when the script answers -1", async () => {
    const { spacer, slept } = setup(async () => -1);

    expect(await spacer(signal())).toBe(false);
    expect(slept).toEqual([]);
  });

  it("refuses when Redis fails", async () => {
    const { spacer, slept } = setup(async () => {
      throw new Error("READONLY You can't write against a read only replica.");
    });

    expect(await spacer(signal())).toBe(false);
    expect(slept).toEqual([]);
  });

  it("refuses an answer that is not a wait", async () => {
    for (const answer of ["120", null, 3_001, 1.5]) {
      const { spacer, slept } = setup(async () => answer);

      expect(await spacer(signal())).toBe(false);
      expect(slept).toEqual([]);
    }
  });

  it("refuses when Redis does not answer within the most the turn may wait", async () => {
    const { spacer, slept } = setup(() => new Promise(() => undefined), 30);
    const startedAt = Date.now();

    expect(await spacer(signal())).toBe(false);

    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(slept).toEqual([]);
  });

  it("refuses at once when the run stops while Redis has not answered", async () => {
    const { spacer } = setup(() => new Promise(() => undefined));
    const controller = new AbortController();

    const turn = spacer(controller.signal);
    controller.abort();

    expect(await turn).toBe(false);
  });

  it("asks nothing for a run that has already stopped", async () => {
    const { spacer, calls } = setup(async () => 0);
    const controller = new AbortController();
    controller.abort();

    expect(await spacer(controller.signal)).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("applicationRedis", () => {
  beforeEach(() => {
    applicationClient.eval.mockReset();
  });

  it("hands the script to the application's client", async () => {
    applicationClient.status = "ready";
    applicationClient.eval.mockResolvedValue(0);

    expect(await applicationRedis.eval(SPACER_SCRIPT, 2, KEY, `${KEY}:seq`, 4, 30_000, 3_000)).toBe(
      0,
    );
    expect(applicationClient.eval).toHaveBeenCalledWith(
      SPACER_SCRIPT,
      2,
      KEY,
      `${KEY}:seq`,
      4,
      30_000,
      3_000,
    );
  });

  it("hands no command to a client that is not ready: it would queue it until it reconnects", async () => {
    applicationClient.status = "reconnecting";

    await expect(
      applicationRedis.eval(SPACER_SCRIPT, 2, KEY, `${KEY}:seq`, 4, 30_000, 3_000),
    ).rejects.toThrow("Redis is not ready");
    expect(applicationClient.eval).not.toHaveBeenCalled();
  });
});

describe("the windows", () => {
  it("are one key for the NVD and one for the SEC, under the vendor risk database", () => {
    expect(NVD_SPACER_KEY).toBe("vrdb:spacer:nvd");
    expect(SEC_SPACER_KEY).toBe("vrdb:spacer:sec");
  });

  it("let the SEC have five requests a second, half of the ten it allows, and a wait of two seconds", () => {
    expect(SEC_LIMITS).toEqual({ limit: 5, windowMs: 1_000, maxWaitMs: 2_000 });
  });
});
