import { getEventListeners } from "node:events";
import { createLimiter } from "../limiter";

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("createLimiter", () => {
  it("gives a place at once while there is one", async () => {
    const limiter = createLimiter(2);

    const first = await limiter.take();
    const second = await limiter.take();

    expect(typeof first).toBe("function");
    expect(typeof second).toBe("function");
  });

  it("makes the others wait, and hands a place on in the order they asked", async () => {
    const limiter = createLimiter(1);
    const order: string[] = [];
    const first = await limiter.take();
    const second = limiter.take().then((release) => {
      order.push("second");
      return release;
    });
    const third = limiter.take().then((release) => {
      order.push("third");
      return release;
    });
    await tick();
    expect(order).toEqual([]);

    first();
    const releaseSecond = await second;
    expect(order).toEqual(["second"]);
    releaseSecond();
    await third;

    expect(order).toEqual(["second", "third"]);
  });

  // A place that is handed on is never given up, so a new asker cannot slip in between and
  // take a place that was meant for a waiter.
  it("does not let a new asker pass a waiter", async () => {
    const limiter = createLimiter(1);
    const first = await limiter.take();
    let waiterHasPlace = false;
    void limiter.take().then(() => {
      waiterHasPlace = true;
    });
    await tick();

    first();
    let newcomerHasPlace = false;
    void limiter.take().then(() => {
      newcomerHasPlace = true;
    });
    await tick();

    expect(waiterHasPlace).toBe(true);
    expect(newcomerHasPlace).toBe(false);
  });

  it("takes the place back once, however many times the release is called", async () => {
    const limiter = createLimiter(1);
    const first = await limiter.take();
    first();
    first();

    const second = await limiter.take();
    let thirdHasPlace = false;
    void limiter.take().then(() => {
      thirdHasPlace = true;
    });
    await tick();

    expect(thirdHasPlace).toBe(false);
    second();
  });

  it("lets a waiter that gives up leave the line, with the error it is asked for", async () => {
    const limiter = createLimiter(1);
    const first = await limiter.take();
    const controller = new AbortController();
    const waiting = limiter.take(controller.signal, () => new Error("gave up"));
    let lastHasPlace = false;
    void limiter.take().then(() => {
      lastHasPlace = true;
    });
    await tick();

    controller.abort();
    await expect(waiting).rejects.toThrow("gave up");
    first();
    await tick();

    // The place went to the one behind it, not to the one that left.
    expect(lastHasPlace).toBe(true);
  });

  it("leaves no listener on the signal of a waiter that got its place", async () => {
    const limiter = createLimiter(1);
    const first = await limiter.take();
    const controller = new AbortController();
    const waiting = limiter.take(controller.signal);
    await tick();
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(1);

    first();
    (await waiting)();

    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });

  it("is an error to ask for no places at all", () => {
    expect(() => createLimiter(0)).toThrow();
  });
});
