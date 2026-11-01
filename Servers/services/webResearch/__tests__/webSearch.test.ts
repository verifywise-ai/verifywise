import { createRecorder } from "../../vendorResearch/eval/recorder";
import { createReplayEngine } from "../../vendorResearch/eval/replay";
import * as webSearch from "../webSearch";
import {
  type SearchEngine,
  type SearchEngineId,
  SearchEngineError,
  createSearchQueue,
} from "../webSearch";

/** A clock that only moves when the queue sleeps or a task works. */
function fakeClock() {
  let time = 0;
  const sleeps: number[] = [];
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
    sleeps,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      time += ms;
    },
  };
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("createSearchQueue", () => {
  it("runs one task at a time, each starting at least minGapMs after the previous one started", async () => {
    const clock = fakeClock();
    const queue = createSearchQueue({ minGapMs: 1000, now: clock.now, sleep: clock.sleep });
    const starts: number[] = [];
    let running = 0;
    let mostRunning = 0;
    const task = (id: string) => async () => {
      running += 1;
      mostRunning = Math.max(mostRunning, running);
      starts.push(clock.now());
      await Promise.resolve();
      clock.advance(300);
      running -= 1;
      return id;
    };

    const results = await Promise.all([queue(task("a")), queue(task("b")), queue(task("c"))]);

    expect(results).toEqual(["a", "b", "c"]);
    expect(mostRunning).toBe(1);
    expect(starts).toEqual([0, 1000, 2000]);
    // The first task does not wait; the others wait for what is left of the gap after their turn.
    expect(clock.sleeps).toEqual([700, 700]);
  });

  it("measures the gap from the start of the previous task, so a long task is not followed by a wait", async () => {
    const clock = fakeClock();
    const queue = createSearchQueue({ minGapMs: 1000, now: clock.now, sleep: clock.sleep });
    const starts: number[] = [];
    const task = async () => {
      starts.push(clock.now());
      clock.advance(1500);
    };

    await Promise.all([queue(task), queue(task), queue(task)]);

    expect(starts).toEqual([0, 1500, 3000]);
    expect(clock.sleeps).toEqual([]);
  });

  it("starts the first task at once", async () => {
    const clock = fakeClock();
    clock.advance(5);
    const queue = createSearchQueue({ minGapMs: 1000, now: clock.now, sleep: clock.sleep });
    await queue(async () => undefined);
    expect(clock.sleeps).toEqual([]);
  });

  describe("the gap of an engine", () => {
    it.each([
      ["no options at all", undefined],
      ["options with no gap", {}],
      ["a gap that is not a number", { minGapMs: "1000" }],
      ["a negative gap", { minGapMs: -1 }],
      ["a gap that is not a finite number", { minGapMs: Number.NaN }],
      ["an endless gap", { minGapMs: Number.POSITIVE_INFINITY }],
    ])(
      "is a parameter of every queue: %s is refused, so that no queue runs without spacing",
      (_name, options) => {
        expect(() => createSearchQueue(options as never)).toThrow(RangeError);
      },
    );

    it("accepts a gap of zero, which spaces nothing", async () => {
      const queue = createSearchQueue({ minGapMs: 0 });
      await expect(queue(async () => "ok")).resolves.toBe("ok");
    });

    it("is the gap of its own queue: the spacing of one engine does not wait for another's", async () => {
      const slow = fakeClock();
      const quick = fakeClock();
      const slowQueue = createSearchQueue({ minGapMs: 5000, now: slow.now, sleep: slow.sleep });
      const quickQueue = createSearchQueue({ minGapMs: 1000, now: quick.now, sleep: quick.sleep });

      await Promise.all([
        slowQueue(async () => undefined),
        slowQueue(async () => undefined),
        quickQueue(async () => undefined),
        quickQueue(async () => undefined),
      ]);

      expect(slow.sleeps).toEqual([5000]);
      expect(quick.sleeps).toEqual([1000]);
    });
  });

  it("goes on to the next task when a task fails", async () => {
    const clock = fakeClock();
    const queue = createSearchQueue({ minGapMs: 1000, now: clock.now, sleep: clock.sleep });
    const first = queue(async () => {
      throw new Error("boom");
    });
    const second = queue(async () => "ok");
    const third = queue(() => {
      throw new Error("not even a promise");
    });
    const fourth = queue(async () => "again");

    await expect(first).rejects.toThrow("boom");
    await expect(second).resolves.toBe("ok");
    await expect(third).rejects.toThrow("not even a promise");
    await expect(fourth).resolves.toBe("again");
  });

  it("rejects a task that is still waiting behind a running one when its signal aborts, and never runs it", async () => {
    const clock = fakeClock();
    const queue = createSearchQueue({ minGapMs: 1000, now: clock.now, sleep: clock.sleep });
    const first = deferred<string>();
    const firstRun = queue(() => first.promise);
    const controller = new AbortController();
    const second = jest.fn(async () => "second");
    const secondOutcome = queue(second, controller.signal).catch((error: Error) => error);

    controller.abort();

    // It settles while the first task is still running.
    const error = await secondOutcome;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("AbortError");

    first.resolve("first");
    await expect(firstRun).resolves.toBe("first");
    // The aborted task neither ran nor used up a gap: the next one waits for the first's only.
    await expect(queue(async () => "third")).resolves.toBe("third");
    expect(second).not.toHaveBeenCalled();
    expect(clock.sleeps).toEqual([1000]);
  });

  it("rejects at once, and runs nothing, when the signal has aborted already", async () => {
    const clock = fakeClock();
    const queue = createSearchQueue({ minGapMs: 1000, now: clock.now, sleep: clock.sleep });
    const controller = new AbortController();
    controller.abort();
    const task = jest.fn(async () => "never");

    await expect(queue(task, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(queue(async () => "next")).resolves.toBe("next");

    expect(task).not.toHaveBeenCalled();
    expect(clock.sleeps).toEqual([]);
  });

  it("rejects a task that is waiting for the gap when its signal aborts, and does not run it later", async () => {
    const clock = fakeClock();
    const gap = deferred();
    const queue = createSearchQueue({ minGapMs: 1000, now: clock.now, sleep: () => gap.promise });
    await queue(async () => "first");
    const controller = new AbortController();
    const task = jest.fn(async () => "second");
    const outcome = queue(task, controller.signal).catch((error: Error) => error);
    await flush();

    controller.abort();
    expect(((await outcome) as Error).name).toBe("AbortError");
    gap.resolve();
    await flush();

    expect(task).not.toHaveBeenCalled();
  });

  it("does not interrupt a task that has started when its signal aborts", async () => {
    const queue = createSearchQueue({ minGapMs: 0 });
    const controller = new AbortController();
    const started = deferred();
    const finish = deferred<string>();
    const run = queue(() => {
      started.resolve();
      return finish.promise;
    }, controller.signal);
    await started.promise;

    controller.abort();
    finish.resolve("done");

    await expect(run).resolves.toBe("done");
  });

  describe("with the real clock and timers", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("waits out the gap with a timer", async () => {
      const queue = createSearchQueue({ minGapMs: 1000 });
      const started: string[] = [];
      const run = (id: string) => queue(async () => void started.push(id));
      const runs = [run("a"), run("b")];

      await jest.advanceTimersByTimeAsync(999);
      expect(started).toEqual(["a"]);
      await jest.advanceTimersByTimeAsync(1);
      expect(started).toEqual(["a", "b"]);
      await Promise.all(runs);
    });

    it("stops waiting, and clears its timer, when the signal aborts", async () => {
      const queue = createSearchQueue({ minGapMs: 1000 });
      await queue(async () => undefined);
      const controller = new AbortController();
      const task = jest.fn(async () => "never");
      const outcome = queue(task, controller.signal).catch((error: Error) => error);
      await jest.advanceTimersByTimeAsync(10);
      expect(jest.getTimerCount()).toBe(1);

      controller.abort();

      expect(((await outcome) as Error).name).toBe("AbortError");
      expect(jest.getTimerCount()).toBe(0);
      expect(task).not.toHaveBeenCalled();
    });
  });
});

const FIXED_MESSAGE = "The search is not available right now";

describe("SearchEngineError", () => {
  it("has a fixed message", () => {
    const error = new SearchEngineError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("SearchEngineError");
    expect(error.message).toBe(FIXED_MESSAGE);
  });
});

describe("what the module no longer has", () => {
  // The RSS feeds of Bing are not licensed for this use (the notice in every feed allows personal,
  // non-commercial display in an aggregator), and the product searches with the engine of the
  // research key or the GDELT Project instead. Nothing of the feed is left to be called by mistake:
  // the module holds the interface, the error and the queue, and not one engine, request builder,
  // feed reader or limit of a feed.
  it("exports the limit of the results, the error, the queue and its sleep, and nothing else", () => {
    expect(Object.keys(webSearch).sort()).toEqual([
      "MAX_RESULTS",
      "SearchEngineError",
      "createSearchQueue",
      "sleepUnlessAborted",
    ]);
  });

  it("does not name Bing as an engine", () => {
    // @ts-expect-error "bing" is not the id of an engine any more.
    const bing: SearchEngineId = "bing";
    const ids: SearchEngineId[] = ["anthropic", "openai", "gdelt", "replay"];

    expect(ids).not.toContain(bing);
  });
});

describe("the fields that every search engine declares", () => {
  it("are declared by the replay engine of the evaluation: its id, both kinds and no window for the news", () => {
    // A recording holds searches of both kinds, and has no window for the news of its own.
    const engine = createReplayEngine([]);

    expect(engine.id).toBe("replay");
    expect(engine.kinds).toEqual(["web", "news"]);
    expect(engine.newsWindowMonths).toBeNull();
  });

  describe("behind the recorder of the evaluation", () => {
    const recorderOf = (engine: SearchEngine) =>
      createRecorder({
        engine,
        readPage: jest.fn(),
        generate: jest.fn() as never,
      });

    it("are those of the engine it records", () => {
      const engine: SearchEngine = {
        id: "gdelt",
        kinds: ["news"],
        newsWindowMonths: 3,
        search: async () => [],
      };

      const recorded = recorderOf(engine).engine;

      expect(recorded.id).toBe("gdelt");
      expect(recorded.kinds).toEqual(["news"]);
      expect(recorded.newsWindowMonths).toBe(3);
    });

    it("are those of the engine as it is now: an engine that falls back changes them under the recorder", () => {
      let live: Pick<SearchEngine, "id" | "kinds" | "newsWindowMonths"> = {
        id: "anthropic",
        kinds: ["web", "news"],
        newsWindowMonths: null,
      };
      const engine: SearchEngine = {
        get id() {
          return live.id;
        },
        get kinds() {
          return live.kinds;
        },
        get newsWindowMonths() {
          return live.newsWindowMonths;
        },
        search: async () => [],
      };
      const recorded = recorderOf(engine).engine;
      expect(recorded.kinds).toEqual(["web", "news"]);

      live = { id: "gdelt", kinds: ["news"], newsWindowMonths: 3 };

      expect(recorded.id).toBe("gdelt");
      expect(recorded.kinds).toEqual(["news"]);
      expect(recorded.newsWindowMonths).toBe(3);
    });

    it("still record the searches that are made", async () => {
      const results = [
        {
          title: "Acme fined",
          url: "https://news.example.com/acme-fined",
          snippet: "",
          publishedAt: null,
          source: null,
        },
      ];
      const recorder = recorderOf({
        id: "replay",
        kinds: ["web", "news"],
        newsWindowMonths: null,
        search: async () => results,
      });

      await recorder.engine.search("Acme fined", "news");

      expect(recorder.recording().searches).toEqual([
        { kind: "news", query: "Acme fined", results },
      ]);
    });
  });
});
