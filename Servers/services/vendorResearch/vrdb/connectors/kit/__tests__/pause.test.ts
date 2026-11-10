/**
 * The pause of a connector between two requests to one host: the four hosts that the round of
 * 2026-11-10 pauses for, the pause each asks for, and a sleep that a test can inject so that no
 * test waits.
 */
import { HOST_PAUSE_MS, type PausedHost, type Sleep, pauseFor, realSleep } from "../pause";

describe("HOST_PAUSE_MS", () => {
  it("holds the pause of each host that asks for one", () => {
    expect(HOST_PAUSE_MS).toEqual({
      "open.canada.ca": 20_000,
      "www.ftc.gov": 5_000,
      "www.datos.gov.co": 1_000,
      "www.gov.uk": 400,
    });
  });

  it("holds whole, positive numbers of milliseconds only", () => {
    for (const ms of Object.values(HOST_PAUSE_MS)) {
      expect(Number.isInteger(ms)).toBe(true);
      expect(ms).toBeGreaterThan(0);
    }
  });
});

describe("pauseFor", () => {
  it.each(Object.entries(HOST_PAUSE_MS) as Array<[PausedHost, number]>)(
    "asks the sleep it is given for the pause of %s, once, and returns what the sleep returns",
    async (host, ms) => {
      const returned = Promise.resolve();
      const sleep = jest.fn<ReturnType<Sleep>, Parameters<Sleep>>(() => returned);

      const result = pauseFor(host, sleep);

      expect(sleep).toHaveBeenCalledTimes(1);
      expect(sleep).toHaveBeenCalledWith(ms);
      expect(result).toBe(returned);
      await result;
    },
  );

  it("waits for the sleep before its promise settles", async () => {
    let finish: () => void = () => undefined;
    const sleep: Sleep = () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      });
    let settled = false;

    const waiting = pauseFor("www.gov.uk", sleep).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    finish();
    await waiting;
    expect(settled).toBe(true);
  });

  it("passes the error of the sleep on", async () => {
    const sleep: Sleep = async () => {
      throw new Error("sleep failed");
    };

    await expect(pauseFor("www.ftc.gov", sleep)).rejects.toThrow("sleep failed");
  });
});

describe("realSleep", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("settles after the milliseconds it is given, and not before", async () => {
    let settled = false;
    const waiting = realSleep(400).then(() => {
      settled = true;
    });

    await jest.advanceTimersByTimeAsync(399);
    expect(settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    await waiting;
    expect(settled).toBe(true);
  });

  it("is what pauseFor waits with when no sleep is given", async () => {
    let settled = false;
    const waiting = pauseFor("www.datos.gov.co").then(() => {
      settled = true;
    });

    await jest.advanceTimersByTimeAsync(HOST_PAUSE_MS["www.datos.gov.co"] - 1);
    expect(settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    await waiting;
    expect(settled).toBe(true);
  });
});
