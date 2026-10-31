import { createMemo } from "../memo";

describe("createMemo", () => {
  it("loads once for a key and answers the same value until it expires", async () => {
    let clock = 0;
    const memo = createMemo<number>(1000, 8, () => clock);
    const load = jest.fn().mockResolvedValue(7);

    expect(await memo.get("a", load)).toBe(7);
    clock = 999;
    expect(await memo.get("a", load)).toBe(7);
    expect(load).toHaveBeenCalledTimes(1);

    clock = 1000;
    await memo.get("a", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps a key apart from another", async () => {
    const memo = createMemo<string>(1000);

    expect(await memo.get("a", async () => "one")).toBe("one");
    expect(await memo.get("b", async () => "two")).toBe("two");
  });

  it("shares a load that is under way", async () => {
    const memo = createMemo<number>(1000);
    let finish: (value: number) => void = () => undefined;
    const load = jest.fn(() => new Promise<number>((resolve) => (finish = resolve)));

    const first = memo.get("a", load);
    const second = memo.get("a", load);
    finish(5);

    expect(await first).toBe(5);
    expect(await second).toBe(5);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("forgets a load that failed, so that the next call tries again", async () => {
    const memo = createMemo<number>(1000);
    const load = jest.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(3);

    await expect(memo.get("a", load)).rejects.toThrow("down");
    expect(await memo.get("a", load)).toBe(3);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not forget a newer load when an older one of the same key fails late", async () => {
    let clock = 0;
    const memo = createMemo<number>(1000, 8, () => clock);
    let failOld: (error: Error) => void = () => undefined;
    const slowAndFailing = jest.fn(
      () => new Promise<number>((_resolve, reject) => (failOld = reject)),
    );
    const fast = jest.fn().mockResolvedValue(4);

    const old = memo.get("a", slowAndFailing);
    clock = 1000;
    expect(await memo.get("a", fast)).toBe(4);
    failOld(new Error("late"));
    await expect(old).rejects.toThrow("late");

    expect(await memo.get("a", fast)).toBe(4);
    expect(fast).toHaveBeenCalledTimes(1);
  });

  it("counts a key that was loaded again as the newest, so that the oldest to go is another", async () => {
    let clock = 0;
    const memo = createMemo<number>(1000, 2, () => clock);
    const load = jest.fn().mockResolvedValue(1);

    await memo.get("a", load);
    await memo.get("b", load);
    clock = 1000;
    await memo.get("a", load);
    await memo.get("c", load);
    expect(load).toHaveBeenCalledTimes(4);

    await memo.get("a", load);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("keeps at most the number of keys it is given, forgetting the oldest", async () => {
    const memo = createMemo<number>(1000, 2);
    const load = jest.fn().mockResolvedValue(1);

    await memo.get("a", load);
    await memo.get("b", load);
    await memo.get("c", load);
    expect(load).toHaveBeenCalledTimes(3);

    await memo.get("b", load);
    await memo.get("c", load);
    expect(load).toHaveBeenCalledTimes(3);

    await memo.get("a", load);
    expect(load).toHaveBeenCalledTimes(4);
  });
});
