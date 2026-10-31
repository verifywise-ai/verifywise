import { describe, expect, it, vi } from "vitest";
import {
  BATCH_SIZE,
  deselectDone,
  finishImport,
  keepShown,
  IMPORT_INTERRUPTED_MESSAGE,
  IMPORT_PARTLY_FAILED_MESSAGE,
  IMPORTED_BEFORE_STOP_LABEL,
  IMPORTED_LABEL,
  importInBatches,
  NOT_IMPORTED_LABEL,
  REMOVAL_INTERRUPTED_PARTIAL_MESSAGE,
  REMOVAL_PARTLY_SKIPPED_MESSAGE,
  REMOVED_BEFORE_STOP_LABEL,
  REMOVED_LABEL,
  removeInBatches,
  SKIPPED_CHANGED_LABEL,
  SKIPPED_GONE_LABEL,
  SKIPPED_LIVE_LABEL,
  SKIPPED_OTHER_LABEL,
  LINKS_REMOVED_LABEL,
  REMOVAL_LIVE_LINK_MESSAGE,
  createRequestGate,
  loadPages,
  planBatches,
  MAX_REFRESH_PAGES,
  NOT_REMOVED_LABEL,
  runPickerRequest,
  REMOVAL_NOT_SELECTED_MESSAGE,
  SKIPPED_NOT_SELECTED_LABEL,
  REMOVAL_KEPT_MESSAGE,
  appendPage,
  UNLINKED_LABEL,
  runInBatches,
} from "./batching";
import { REMOVAL_INTERRUPTED_MESSAGE, SYNC_RUNNING_MESSAGE } from "./runOutcome";

const ids = (n: number, from = 1) => Array.from({ length: n }, (_, i) => String(from + i));
const nums = (n: number, from = 1) => ids(n, from).map(Number);
const conflict = (data: unknown) =>
  Object.assign(new Error("Conflict"), { status: 409, response: { data } });
const ok = (batch: string[], extra: Record<string, unknown> = {}) => ({
  success: true,
  imported: batch.length,
  ...extra,
});

describe("runInBatches", () => {
  it("sends 250 items as 3 sequential requests of up to 100, reporting progress", async () => {
    const send = vi.fn(async (batch: string[]) => batch.length);
    const progress = vi.fn();

    const run = await runInBatches(ids(250), send, progress);

    expect(BATCH_SIZE).toBe(100);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls.map(([batch]) => batch.length)).toEqual([100, 100, 50]);
    expect(send.mock.calls[1][0][0]).toBe("101");
    expect(progress.mock.calls.map(([p]) => p)).toEqual([
      { from: 1, to: 100, total: 250 },
      { from: 101, to: 200, total: 250 },
      { from: 201, to: 250, total: 250 },
    ]);
    expect(run.error).toBeUndefined();
    expect(run.done.map((d) => d.result)).toEqual([100, 100, 50]);
  });

  it("stops at the first error", async () => {
    const boom = new Error("boom");
    const send = vi
      .fn<(batch: string[]) => Promise<number>>()
      .mockResolvedValueOnce(100)
      .mockRejectedValueOnce(boom);

    const run = await runInBatches(ids(250), send);

    expect(send).toHaveBeenCalledTimes(2);
    expect(run.done).toHaveLength(1);
    expect(run.error).toBe(boom);
  });
});

describe("importInBatches", () => {
  it("adds up every batch and deselects everything on full success", async () => {
    const send = vi.fn(async (batch: string[]) => ok(batch));

    const summary = await importInBatches(ids(250), send);

    expect(send).toHaveBeenCalledTimes(3);
    expect(summary).toMatchObject({
      type: "success",
      counts: [{ label: IMPORTED_LABEL, value: 250 }],
    });
    expect(summary.doneIds).toHaveLength(250);
  });

  it("does not call it finished when a batch reports 80 of 100 objects failed", async () => {
    const failedIds = ids(80, 21); // "21".."100"
    const send = vi
      .fn<(batch: string[]) => Promise<any>>()
      .mockResolvedValueOnce({
        success: true,
        imported: 20,
        errors: failedIds.map((id) => `Failed to import ${id}: boom`),
        failed_ids: failedIds,
      })
      .mockImplementation(async (batch: string[]) => ok(batch));

    const summary = await importInBatches(ids(150), send);

    expect(summary.type).toBe("warning");
    expect(summary.text).toBe(IMPORT_PARTLY_FAILED_MESSAGE);
    expect(summary.counts).toEqual([
      { label: IMPORTED_LABEL, value: 70 },
      { label: NOT_IMPORTED_LABEL, value: 80 },
    ]);
    // The 80 failed ids stay selected; the 20 imported and the 50 of batch 2 leave.
    expect(summary.doneIds).toEqual([...ids(20), ...ids(50, 101)]);
  });

  it("keeps a batch selected when it reports errors without ids", async () => {
    const send = vi.fn(async () => ({ success: true, imported: 99, errors: ["Failed: x"] }));

    const summary = await importInBatches(ids(100), send);

    expect(summary.type).toBe("warning");
    expect(summary.doneIds).toEqual([]);
  });

  it("stops on a 409 mid-way, says a sync is running, keeps unsent ids selected", async () => {
    const send = vi
      .fn<(batch: string[]) => Promise<any>>()
      .mockImplementationOnce(async (batch) => ok(batch))
      .mockRejectedValueOnce(conflict("A Jira Assets sync is already running"));

    const summary = await importInBatches(ids(250), send);

    expect(send).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({
      type: "error",
      text: SYNC_RUNNING_MESSAGE,
      counts: [{ label: IMPORTED_BEFORE_STOP_LABEL, value: 100 }],
    });
    expect(summary.doneIds).toEqual(ids(100));
  });

  it("counts what an interrupted batch imported, but keeps that batch selected", async () => {
    const send = vi
      .fn<(batch: string[]) => Promise<any>>()
      .mockImplementationOnce(async (batch) => ok(batch))
      .mockRejectedValueOnce(conflict({ code: "import_interrupted", imported: 30, skipped: 0 }));

    const summary = await importInBatches(ids(250), send);

    expect(summary).toMatchObject({
      type: "error",
      text: IMPORT_INTERRUPTED_MESSAGE,
      counts: [{ label: IMPORTED_BEFORE_STOP_LABEL, value: 130 }],
    });
    expect(summary.doneIds).toEqual(ids(100));
  });

  it("treats a response without success as a failure and stops", async () => {
    const send = vi.fn(async () => ({ success: false, error: "Nope" }));

    const summary = await importInBatches(ids(150), send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ type: "error", text: "Nope", doneIds: [] });
  });
});

describe("removeInBatches", () => {
  it("skips that settle the id (no longer missing, not found) deselect it and say why", async () => {
    const send = vi.fn(async () => ({
      removed: 2,
      unlinked: 0,
      skipped_items: [
        { id: 3, reason: "no_longer_missing" as const },
        { id: 4, reason: "not_found" as const },
      ],
    }));

    const summary = await removeInBatches([1, 2, 3, 4], send);

    expect(summary).toEqual({
      type: "warning",
      text: REMOVAL_PARTLY_SKIPPED_MESSAGE,
      counts: [
        { label: REMOVED_LABEL, value: 2 },
        { label: SKIPPED_GONE_LABEL, value: 2 },
      ],
      doneIds: [1, 2, 3, 4],
    });
  });

  it("deselects use cases still linked to a Jira object, with their own message", async () => {
    const send = vi.fn(async () => ({
      removed: 1,
      links_removed: 1,
      skipped_items: [{ id: 2, reason: "has_live_links" }],
    }));

    const summary = await removeInBatches([1, 2], send);

    expect(summary).toEqual({
      type: "warning",
      text: REMOVAL_LIVE_LINK_MESSAGE,
      counts: [
        { label: REMOVED_LABEL, value: 1 },
        { label: SKIPPED_LIVE_LABEL, value: 1 },
      ],
      doneIds: [1, 2],
    });
  });

  it("keeps only changed (and unknown) skips selected, and says they are", async () => {
    const send = vi.fn(async () => ({
      removed: 1,
      skipped_items: [
        { id: 2, reason: "has_live_links" },
        { id: 3, reason: "changed" },
        { id: 4, reason: "no_longer_missing" },
        { id: 5, reason: "something_new" },
      ],
    }));

    const summary = await removeInBatches([1, 2, 3, 4, 5], send);

    expect(summary.type).toBe("warning");
    expect(summary.text).toBe(REMOVAL_KEPT_MESSAGE);
    expect(summary.counts).toEqual([
      { label: REMOVED_LABEL, value: 1 },
      { label: SKIPPED_GONE_LABEL, value: 1 },
      { label: SKIPPED_LIVE_LABEL, value: 1 },
      { label: SKIPPED_CHANGED_LABEL, value: 1 },
      { label: SKIPPED_OTHER_LABEL, value: 1 },
    ]);
    expect(summary.doneIds).toEqual([1, 2, 4]);
  });

  it("shows Jira links removed next to use cases removed when they differ", async () => {
    const send = vi.fn(async () => ({ removed: 1, links_removed: 2, skipped_items: [] }));

    const summary = await removeInBatches([1, 2], send);

    expect(summary.counts).toEqual([
      { label: REMOVED_LABEL, value: 1 },
      { label: LINKS_REMOVED_LABEL, value: 2 },
    ]);
  });

  it("shows the server's message naming the use case when a delete failed (500)", async () => {
    const message =
      '"Credit model" (AI-7) could not be deleted, so nothing was removed. Try again.';
    const send = vi
      .fn<(batch: number[]) => Promise<any>>()
      .mockResolvedValueOnce({ removed: 100, skipped_items: [] })
      .mockRejectedValueOnce(
        Object.assign(new Error("Internal Server Error"), {
          status: 500,
          response: { message: "Internal Server Error", error: message },
        }),
      );

    const summary = await removeInBatches(nums(150), send);

    expect(summary).toMatchObject({
      type: "error",
      text: message,
      counts: [{ label: REMOVED_BEFORE_STOP_LABEL, value: 100 }],
      doneIds: nums(100),
    });
  });

  it("reports links cleaned up separately from use cases removed", async () => {
    const send = vi.fn(async () => ({ removed: 1, unlinked: 1, skipped_items: [] }));

    const summary = await removeInBatches([1, 2], send);

    expect(summary).toMatchObject({
      type: "success",
      counts: [
        { label: REMOVED_LABEL, value: 1 },
        { label: UNLINKED_LABEL, value: 1 },
      ],
      doneIds: [1, 2],
    });
  });

  it("stops at an error on the 2nd batch, reports the 100 removed, deselects only those", async () => {
    const send = vi
      .fn<(batch: number[]) => Promise<{ removed: number; skipped_items: [] }>>()
      .mockResolvedValueOnce({ removed: 100, skipped_items: [] })
      .mockRejectedValueOnce(
        conflict({ code: "removal_interrupted", message: REMOVAL_INTERRUPTED_MESSAGE }),
      );

    const summary = await removeInBatches(nums(250), send);

    expect(send).toHaveBeenCalledTimes(2);
    expect(summary).toEqual({
      type: "error",
      text: REMOVAL_INTERRUPTED_PARTIAL_MESSAGE,
      counts: [{ label: REMOVED_BEFORE_STOP_LABEL, value: 100 }],
      doneIds: nums(100),
    });
    expect(deselectDone(new Set(nums(250)), summary.doneIds)).toEqual(new Set(nums(150, 101)));
  });

  it("keeps the server's 'nothing was removed' when the first batch is interrupted", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(
        conflict({ code: "removal_interrupted", message: REMOVAL_INTERRUPTED_MESSAGE }),
      );

    const summary = await removeInBatches([1, 2], send);

    expect(summary).toMatchObject({ text: REMOVAL_INTERRUPTED_MESSAGE, doneIds: [] });
  });

  it("says a sync is running on a plain 409", async () => {
    const send = vi.fn().mockRejectedValueOnce(conflict("busy"));

    const summary = await removeInBatches([1, 2], send);

    expect(summary).toMatchObject({ type: "error", text: SYNC_RUNNING_MESSAGE });
  });
});

describe("finishImport (the panel's state after an import)", () => {
  type Obj = { id: string; key: string };
  const picker = (list: string[]): Obj[] => list.map((id) => ({ id, key: `K-${id}` }));

  /** What the panel does: apply the updaters to the latest state, then keepShown. */
  function apply(
    latest: { objects: Obj[]; selected: Set<string> },
    next: ReturnType<typeof finishImport<Obj>>,
  ) {
    const objects = next.objects(latest.objects);
    const selected = keepShown(next.selected(latest.selected), objects);
    return { objects, selected };
  }

  it("interrupted batch, 30 of 50 imported: only the 20 still shown stay selected", async () => {
    const send = vi
      .fn<(batch: string[]) => Promise<any>>()
      .mockRejectedValueOnce(conflict({ code: "import_interrupted", imported: 30 }));
    const summary = await importInBatches(ids(50), send);
    // Fresh /use-cases after the import: objects 1..30 are imported now.
    const next = finishImport<Obj>(summary, new Set(ids(30)));

    const state = apply({ objects: picker(ids(50)), selected: new Set(ids(50)) }, next);

    expect(state.objects.map((o) => o.id)).toEqual(ids(20, 31));
    expect(state.selected).toEqual(new Set(ids(20, 31)));
    expect(state.selected.size).toBe(state.objects.length);
    expect(next.message).toEqual({
      type: "error",
      text: IMPORT_INTERRUPTED_MESSAGE,
      counts: [{ label: IMPORTED_BEFORE_STOP_LABEL, value: 30 }],
    });
  });

  it("250 ids, batch 2 interrupted: selected = unhandled of batch 2 + the unsent batch", async () => {
    const send = vi
      .fn<(batch: string[]) => Promise<any>>()
      .mockImplementationOnce(async (batch) => ok(batch))
      .mockRejectedValueOnce(conflict({ code: "import_interrupted", imported: 40 }));
    const summary = await importInBatches(ids(250), send);
    expect(send).toHaveBeenCalledTimes(2);

    // Batch 1 (1..100) and the first 40 of batch 2 (101..140) are imported.
    const next = finishImport<Obj>(summary, new Set(ids(140)));
    const state = apply({ objects: picker(ids(250)), selected: new Set(ids(250)) }, next);

    expect(state.selected).toEqual(new Set([...ids(60, 141), ...ids(50, 201)]));
    expect(state.selected.size).toBe(state.objects.length);
  });

  it("keeps a page loaded, and a toggle made, while the import was running", async () => {
    const send = vi.fn(async (batch: string[]) => ok(batch));
    const summary = await importInBatches(ids(2), send);
    const next = finishImport<Obj>(summary, new Set(ids(2)));

    // Meanwhile "Load more" appended 3..4 and the user ticked 4.
    const state = apply({ objects: picker(ids(4)), selected: new Set(["1", "2", "4"]) }, next);

    expect(state.objects.map((o) => o.id)).toEqual(["3", "4"]);
    expect(state.selected).toEqual(new Set(["4"]));
  });

  it("a batch kept whole (errors without ids) keeps only its failed objects selected", async () => {
    const send = vi.fn(async () => ({ success: true, imported: 3, errors: ["Failed: x"] }));
    const summary = await importInBatches(ids(4), send);
    const next = finishImport<Obj>(summary, new Set(["1", "2", "3"]));

    const state = apply({ objects: picker(ids(4)), selected: new Set(ids(4)) }, next);

    expect(state.selected).toEqual(new Set(["4"]));
    expect(state.objects.map((o) => o.id)).toEqual(["4"]);
  });

  it("leaves the picker alone when the fresh list could not be read", () => {
    const summary = { type: "success" as const, text: "", counts: [], doneIds: ["1"] };
    const next = finishImport<Obj>(summary, null);

    const latest = picker(["1", "2"]);
    const state = apply({ objects: latest, selected: new Set(["1", "2"]) }, next);

    expect(state.objects).toBe(latest);
    expect(state.selected).toEqual(new Set(["2"]));
  });
});

describe("keepShown", () => {
  it("drops selected ids the picker does not show, and keeps the same set otherwise", () => {
    const objects = [{ id: "1" }, { id: "2" }];
    const same = new Set(["1"]);

    expect(keepShown(new Set(["1", "2", "99"]), objects)).toEqual(new Set(["1", "2"]));
    expect(keepShown(same, objects)).toBe(same);
  });
});

describe("appendPage (Load more)", () => {
  const obj = (id: string) => ({ id });

  it("leaves out objects imported by the time the page lands, and duplicates", () => {
    const prev = [obj("1"), obj("2")];
    // The page was requested before an import of "3" finished.
    const next = appendPage(prev, [obj("2"), obj("3"), obj("4")], new Set(["3"]));

    expect(next.map((o) => o.id)).toEqual(["1", "2", "4"]);
  });
});

describe("createRequestGate (stale picker responses)", () => {
  it("drops a Load more that resolves after a reset or a fresh load", () => {
    const gate = createRequestGate();
    const loadMore = gate.current(); // "Load more" sent
    gate.bump(); // object type changed / picker reset / refresh

    expect(gate.isCurrent(loadMore)).toBe(false);
    const fresh = gate.current();
    expect(gate.isCurrent(fresh)).toBe(true);
  });
});

describe("selection pruning when the picker list is replaced", () => {
  it("refresh hides X; a Load more that brings X back does not tick it", () => {
    const obj = (id: string) => ({ id });
    // X and Y are ticked; a refresh returns only Y.
    let stored = new Set(["X", "Y"]);
    let objects = appendPage([], [obj("Y")], new Set());
    stored = keepShown(stored, objects);
    expect(stored).toEqual(new Set(["Y"]));

    // "Load more" brings X back.
    objects = appendPage(objects, [obj("X")], new Set());
    expect(keepShown(stored, objects)).toEqual(new Set(["Y"]));
  });
});

describe("planBatches (all links of one use case in one request)", () => {
  it("packs whole groups into batches of up to 100", () => {
    // 60 links of project A, 60 of B, 10 ungrouped.
    const ids = [...nums(60, 1), ...nums(60, 101), ...nums(10, 201)];
    const projectOf = (id: number) => (id <= 60 ? 1 : id <= 160 ? 2 : null);

    const batches = planBatches(ids, projectOf);

    expect(batches.map((b) => b.length)).toEqual([60, 70]);
    expect(batches[0]).toEqual(nums(60, 1));
    expect(batches[1]).toEqual([...nums(60, 101), ...nums(10, 201)]);
  });

  it("sends a group larger than 100 alone", () => {
    const ids = [...nums(5, 1), ...nums(150, 1001)];
    const projectOf = (id: number) => (id > 1000 ? 7 : null);

    const batches = planBatches(ids, projectOf);

    expect(batches.map((b) => b.length)).toEqual([5, 150]);
  });
});

describe("removeInBatches grouped by use case", () => {
  it("in a selection over 100, links 50 and 150 of one use case go in the same request", async () => {
    const ids = nums(200);
    const projectOf = (id: number) => (id === 50 || id === 150 ? 999 : null);
    const send = vi.fn(async (batch: number[]) => ({ removed: batch.length, skipped_items: [] }));

    await removeInBatches(ids, send, undefined, projectOf);

    const withBoth = send.mock.calls.filter(([batch]) => batch.includes(50) || batch.includes(150));
    expect(withBoth).toHaveLength(1);
    expect(withBoth[0][0]).toEqual(expect.arrayContaining([50, 150]));
    expect(send.mock.calls.every(([batch]) => batch.length <= 100)).toBe(true);
  });

  it("keeps an id selected when other items of its use case were not selected", async () => {
    const send = vi.fn(async () => ({
      removed: 0,
      skipped_items: [{ id: 50, reason: "other_links_not_selected" }],
    }));

    const summary = await removeInBatches([50], send);

    expect(summary.type).toBe("warning");
    expect(summary.text).toBe(REMOVAL_NOT_SELECTED_MESSAGE);
    expect(summary.counts).toContainEqual({ label: SKIPPED_NOT_SELECTED_LABEL, value: 1 });
    expect(summary.doneIds).toEqual([]);
  });
});

describe("runPickerRequest (loading flag)", () => {
  it("clears loading when a fresh load fails and its error handler resets the picker", async () => {
    const gate = createRequestGate();
    const loading: boolean[] = [];
    const onError = vi.fn(() => gate.bump()); // resetPicker bumps the generation

    await runPickerRequest({
      gate,
      append: false,
      setLoading: (l) => loading.push(l),
      fetch: async () => {
        throw new Error("boom");
      },
      onResult: vi.fn(),
      onError,
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(loading[loading.length - 1]).toBe(false);
  });

  it("a reset mid-request drops the response and leaves loading cleared", async () => {
    const gate = createRequestGate();
    const loading: boolean[] = [];
    let release!: (v: string) => void;
    const onResult = vi.fn();
    const request = runPickerRequest({
      gate,
      append: true,
      setLoading: (l) => loading.push(l),
      fetch: () => new Promise<string>((resolve) => (release = resolve)),
      onResult,
      onError: vi.fn(),
    });

    // resetPicker: new generation and loading cleared.
    gate.bump();
    loading.push(false);
    release("late page");
    await request;

    expect(onResult).not.toHaveBeenCalled();
    expect(loading).toEqual([true, false]);
  });
});

describe("loadPages (refresh to the loaded depth)", () => {
  it("reloads as many pages as were loaded, so ticks on page 2 objects survive", async () => {
    const fetchPage = vi.fn(async (startAt: number) =>
      startAt === 0
        ? { objects: [{ id: "A" }], hasMore: true, nextStartAt: 1000 }
        : { objects: [{ id: "B" }], hasMore: true, nextStartAt: 2000 },
    );

    const result = await loadPages(fetchPage, 2);

    expect(fetchPage.mock.calls.map(([start]) => start)).toEqual([0, 1000]);
    expect(result).toEqual({
      objects: [{ id: "A" }, { id: "B" }],
      hasMore: true,
      nextStartAt: 2000,
      pages: 2,
    });
    // "B" was ticked on a Load more page; it is still ticked after the refresh.
    expect(keepShown(new Set(["A", "B"]), result.objects)).toEqual(new Set(["A", "B"]));
  });

  it("loads one page when nothing was loaded before, and stops when there is no more", async () => {
    const fetchPage = vi.fn(async () => ({
      objects: [{ id: "A" }],
      hasMore: false,
      nextStartAt: 0,
    }));

    expect((await loadPages(fetchPage, 0)).pages).toBe(1);
    expect((await loadPages(fetchPage, 5)).pages).toBe(1);
  });
});

describe("large use cases and failing batches", () => {
  it("sends 1,500 links of one use case as one request", async () => {
    const ids = nums(1500);
    const send = vi.fn(async (batch: number[]) => ({
      removed: 1,
      links_removed: batch.length,
      skipped_items: [],
    }));

    const summary = await removeInBatches(ids, send, undefined, () => 7);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toHaveLength(1500);
    expect(summary.type).toBe("success");
  });

  it("a batch rejected as invalid (400) is reported, and the later batches still go", async () => {
    const invalid = Object.assign(new Error("Bad Request"), {
      status: 400,
      response: { message: "Bad Request", data: "A removal may cover at most 100 use cases" },
    });
    const send = vi
      .fn<(batch: number[]) => Promise<any>>()
      .mockRejectedValueOnce(invalid)
      .mockImplementation(async (batch) => ({ removed: batch.length, skipped_items: [] }));

    const summary = await removeInBatches(nums(250), send);

    expect(send).toHaveBeenCalledTimes(3);
    expect(summary.type).toBe("error");
    expect(summary.text).toBe("A removal may cover at most 100 use cases");
    expect(summary.counts).toContainEqual({ label: NOT_REMOVED_LABEL, value: 100 });
    // The failed batch stays selected; the other two went through.
    expect(summary.doneIds).toEqual(nums(150, 101));
  });

  it("still stops at a 409 (sync running)", async () => {
    const send = vi.fn<(batch: number[]) => Promise<any>>().mockRejectedValueOnce(conflict("busy"));

    const summary = await removeInBatches(nums(250), send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(summary.text).toBe(SYNC_RUNNING_MESSAGE);
  });
});

describe("loadPages guards", () => {
  it("de-duplicates objects that appear on more than one page", async () => {
    const fetchPage = vi.fn(async (startAt: number) =>
      startAt === 0
        ? { objects: [{ id: "A" }, { id: "B" }], hasMore: true, nextStartAt: 2 }
        : { objects: [{ id: "B" }, { id: "C" }], hasMore: false, nextStartAt: 0 },
    );

    const result = await loadPages(fetchPage, 2);

    expect(result.objects.map((o) => o.id)).toEqual(["A", "B", "C"]);
  });

  it("stops when the next offset is missing or does not move forward", async () => {
    const stuck = vi.fn(async () => ({ objects: [{ id: "A" }], hasMore: true, nextStartAt: 0 }));
    const broken = vi.fn(async () => ({
      objects: [{ id: "A" }],
      hasMore: true,
      nextStartAt: Number.NaN,
    }));

    const a = await loadPages(stuck, 5);
    const b = await loadPages(broken, 5);

    expect(stuck).toHaveBeenCalledTimes(1);
    expect(broken).toHaveBeenCalledTimes(1);
    expect(a.hasMore).toBe(false);
    expect(b.hasMore).toBe(false);
  });

  it(`reloads at most ${MAX_REFRESH_PAGES} pages`, async () => {
    let n = 0;
    const fetchPage = vi.fn(async (startAt: number) => ({
      objects: [{ id: `o${n++}` }],
      hasMore: true,
      nextStartAt: startAt + 1000,
    }));

    const result = await loadPages(fetchPage, 50);

    expect(fetchPage).toHaveBeenCalledTimes(MAX_REFRESH_PAGES);
    expect(result.pages).toBe(MAX_REFRESH_PAGES);
    expect(result.hasMore).toBe(true);
  });
});
