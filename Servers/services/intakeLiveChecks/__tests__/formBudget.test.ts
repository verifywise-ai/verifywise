// Servers/services/intakeLiveChecks/__tests__/formBudget.test.ts
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const store = new Map<string, number>();
const incr = jest.fn(async (key: string) => {
  const next = (store.get(key) ?? 0) + 1;
  store.set(key, next);
  return next;
});
const expire = jest.fn(async (_key: string, _seconds: number) => 1);
const connection = { status: "ready" };

type Reply = [Error | null, unknown];
// Runs the queued commands in order, the way ioredis reports a MULTI: one
// [error, result] pair per command.
const exec = jest.fn(async (ops: Array<() => Promise<unknown>>): Promise<Reply[]> => {
  const replies: Reply[] = [];
  for (const op of ops) {
    try {
      replies.push([null, await op()]);
    } catch (error) {
      replies.push([error as Error, null]);
    }
  }
  return replies;
});

jest.mock("../../../database/redis", () => ({
  __esModule: true,
  default: {
    get status() {
      return connection.status;
    },
    multi: () => {
      const ops: Array<() => Promise<unknown>> = [];
      const chain = {
        incr: (key: string) => (ops.push(() => incr(key)), chain),
        expire: (key: string, seconds: number) => (ops.push(() => expire(key, seconds)), chain),
        exec: () => exec(ops),
      };
      return chain;
    },
  },
}));

import {
  consumeFormBudget,
  formBudgetKey,
  FORM_BUDGET_PER_HOUR,
  REDIS_TIMEOUT_MS,
} from "../formBudget";

const NOW = new Date("2026-10-28T14:35:00.000Z");

beforeEach(() => {
  store.clear();
  incr.mockClear();
  expire.mockClear();
  exec.mockClear();
  connection.status = "ready";
});

describe("formBudgetKey", () => {
  it("names the endpoint, the form and the UTC hour", () => {
    expect(formBudgetKey(42, "checks", NOW)).toBe("intake:livechecks:checks:42:2026102814");
    expect(formBudgetKey(42, "prefill", new Date("2026-10-28T15:00:00.000Z"))).toBe(
      "intake:livechecks:prefill:42:2026102815",
    );
  });
});

describe("consumeFormBudget", () => {
  it("exports the per-form hourly caps and the Redis time limit", () => {
    expect(FORM_BUDGET_PER_HOUR).toEqual({ checks: 300, prefill: 20 });
    expect(REDIS_TIMEOUT_MS).toBe(300);
  });

  it("allows the 300th call in an hour and refuses the 301st", async () => {
    for (let i = 1; i < 300; i++) await consumeFormBudget(7, "checks", 300, NOW);
    expect(await consumeFormBudget(7, "checks", 300, NOW)).toBe(true);
    expect(await consumeFormBudget(7, "checks", 300, NOW)).toBe(false);
  });

  it("sets the one hour expiry in the same transaction as every count", async () => {
    await consumeFormBudget(7, "prefill", 20, NOW);
    await consumeFormBudget(7, "prefill", 20, NOW);
    expect(exec).toHaveBeenCalledTimes(2);
    expect(expire).toHaveBeenCalledTimes(2);
    expect(expire).toHaveBeenCalledWith("intake:livechecks:prefill:7:2026102814", 3600);
  });

  it("refuses without queuing a count while Redis is not connected", async () => {
    connection.status = "reconnecting";
    expect(await consumeFormBudget(7, "checks", 300, NOW)).toBe(false);
    expect(exec).not.toHaveBeenCalled();
    expect(incr).not.toHaveBeenCalled();
  });

  it("counts each form, endpoint and hour separately", async () => {
    for (let i = 0; i < 20; i++) await consumeFormBudget(7, "prefill", 20, NOW);
    expect(await consumeFormBudget(7, "prefill", 20, NOW)).toBe(false);
    expect(await consumeFormBudget(8, "prefill", 20, NOW)).toBe(true);
    expect(await consumeFormBudget(7, "checks", 300, NOW)).toBe(true);
    expect(await consumeFormBudget(7, "prefill", 20, new Date("2026-10-28T15:01:00Z"))).toBe(true);
  });

  it("refuses when the count errors", async () => {
    incr.mockRejectedValueOnce(new Error("WRONGTYPE"));
    expect(await consumeFormBudget(7, "checks", 300, NOW)).toBe(false);
  });

  it("refuses when the transaction fails", async () => {
    exec.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect(await consumeFormBudget(7, "checks", 300, NOW)).toBe(false);
  });

  it("still allows a counted call when only the expiry errors", async () => {
    expire.mockRejectedValueOnce(new Error("expire failed"));
    expect(await consumeFormBudget(7, "checks", 300, NOW)).toBe(true);
  });

  describe("with a Redis that never answers", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    // Settles the promise's state without waiting on it.
    const settled = async (p: Promise<boolean>) => {
      let value: boolean | undefined;
      void p.then((v) => (value = v));
      await Promise.resolve();
      await Promise.resolve();
      return value;
    };

    it("refuses at 300 ms, not before", async () => {
      exec.mockImplementationOnce(() => new Promise<Reply[]>(() => undefined));
      const pending = consumeFormBudget(7, "checks", 300, NOW);
      await jest.advanceTimersByTimeAsync(REDIS_TIMEOUT_MS - 1);
      expect(await settled(pending)).toBeUndefined();
      await jest.advanceTimersByTimeAsync(1);
      expect(await pending).toBe(false);
    });
  });
});
