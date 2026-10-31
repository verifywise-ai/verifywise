import { createSpacer } from "../spacer";

const signal = new AbortController().signal;

describe("createSpacer", () => {
  const setup = (limit: number, windowMs: number, maxWaitMs: number) => {
    let clock = 1_000;
    const slept: number[] = [];
    const spacer = createSpacer(
      { limit, windowMs, maxWaitMs },
      () => clock,
      async (ms) => {
        slept.push(ms);
      },
    );
    return { spacer, slept, advance: (ms: number) => (clock += ms) };
  };

  it("lets as many requests go at once as the limit allows", async () => {
    const { spacer, slept } = setup(3, 30_000, 5000);

    const turns = [await spacer(signal), await spacer(signal), await spacer(signal)];

    expect(turns).toEqual([true, true, true]);
    expect(slept).toEqual([]);
  });

  it("makes the next request wait until the first of the window is as old as the window", async () => {
    const { spacer, slept, advance } = setup(2, 10_000, 20_000);

    await spacer(signal);
    advance(3000);
    await spacer(signal);
    advance(1000);
    await spacer(signal);

    // The first request started 4000 ms ago and the window is 10,000.
    expect(slept).toEqual([6000]);
  });

  it("gives requests made at once their turns in order, never more than the limit in a window", async () => {
    const { spacer, slept } = setup(2, 10_000, 30_000);

    const turns = await Promise.all([1, 2, 3, 4, 5].map(() => spacer(signal)));

    expect(turns).toEqual([true, true, true, true, true]);
    // Two start at once, two ten seconds later, one twenty seconds later.
    expect(slept).toEqual([10_000, 10_000, 20_000]);
  });

  it("does not make a request that would wait longer than the most it may", async () => {
    const { spacer, slept } = setup(1, 6500, 5000);

    await spacer(signal);

    expect(await spacer(signal)).toBe(false);
    expect(slept).toEqual([]);
  });

  it("lets a request wait exactly as long as it may", async () => {
    const { spacer, slept } = setup(1, 5000, 5000);

    await spacer(signal);

    expect(await spacer(signal)).toBe(true);
    expect(slept).toEqual([5000]);
  });

  it("does not give a turn to a request that was refused", async () => {
    const { spacer, advance } = setup(1, 6500, 5000);

    await spacer(signal);
    await spacer(signal);
    advance(6500);

    expect(await spacer(signal)).toBe(true);
  });

  it("lets a request go at once when the window has passed", async () => {
    const { spacer, slept, advance } = setup(1, 6500, 5000);

    await spacer(signal);
    advance(6500);
    await spacer(signal);

    expect(slept).toEqual([]);
  });

  it("forgets the requests of an old window: a long quiet gives the whole limit again", async () => {
    const { spacer, slept, advance } = setup(2, 10_000, 5000);

    await spacer(signal);
    await spacer(signal);
    advance(60_000);
    await spacer(signal);
    await spacer(signal);

    expect(slept).toEqual([]);
  });
});
