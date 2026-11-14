jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));
// The registered sources import the database; these tests inject their own.
jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../../advisor/aiActions", () => ({ executeAiAction: jest.fn() }));

import { getHomeQueue } from "../index";
import logger from "../../../utils/logger/fileLogger";
import type {
  HomeQueueContext,
  HomeQueueItem,
  HomeQueueSource,
  HomeQueueSourceId,
} from "../../../domain.layer/interfaces/i.homeQueue";

const ctx: HomeQueueContext = {
  organizationId: 7,
  userId: 5,
  can: () => true,
  isAdmin: false,
  today: "2026-11-14",
};

const item = (
  source: HomeQueueSourceId,
  entityId: number,
  dueDate: string | null,
  overdue = false,
): HomeQueueItem => ({
  id: `${source}:${entityId}`,
  source,
  part: "automate",
  entityType: "task",
  entityId,
  name: `Item ${entityId}`,
  url: "/tasks",
  dueDate,
  waitingSince: null,
  overdue,
  meta: {},
});

const source = (
  id: HomeQueueSourceId,
  load: HomeQueueSource["load"],
  visible = true,
): HomeQueueSource => ({
  id,
  part: "automate",
  isVisible: jest.fn(() => visible),
  load: jest.fn(load),
});

describe("getHomeQueue", () => {
  beforeEach(() => jest.clearAllMocks());

  it("a throwing source is unavailable and the others still return", async () => {
    const s1 = source("approvals", async () => [item("approvals", 1, null)]);
    const s2 = source("tasks", async () => {
      throw new Error("relation does not exist");
    });

    const result = await getHomeQueue(ctx, [s1, s2], async () => ({}));

    expect(result.sources.approvals).toEqual({ status: "ok", count: 1 });
    expect(result.sources.tasks).toEqual({ status: "unavailable", count: 0 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].source).toBe("approvals");
    expect(logger.error).toHaveBeenCalled();
  });

  it("a source that throws synchronously is unavailable too", async () => {
    const s1 = source("approvals", async () => [item("approvals", 1, null)]);
    const s2: HomeQueueSource = {
      id: "tasks",
      part: "automate",
      isVisible: () => true,
      load: () => {
        throw new Error("sync");
      },
    };

    const result = await getHomeQueue(ctx, [s1, s2], async () => ({}));

    expect(result.sources.tasks).toEqual({ status: "unavailable", count: 0 });
    expect(result.sources.approvals).toEqual({ status: "ok", count: 1 });
  });

  it("an invisible source is omitted", async () => {
    const hidden = source("approvals", async () => [item("approvals", 1, null)], false);
    const shown = source("tasks", async () => []);

    const result = await getHomeQueue(ctx, [hidden, shown], async () => ({}));

    expect(hidden.isVisible).toHaveBeenCalledWith(ctx);
    expect(hidden.load).not.toHaveBeenCalled();
    expect("approvals" in result.sources).toBe(false);
    expect(result.sources.tasks).toEqual({ status: "ok", count: 0 });
    expect(result.items).toEqual([]);
  });

  it("items are merged and sorted with sortQueueItems", async () => {
    const s1 = source("approvals", async () => [item("approvals", 1, null)]);
    const s2 = source("tasks", async () => [
      item("tasks", 2, "2026-11-20"),
      item("tasks", 3, "2026-11-01", true),
    ]);

    const result = await getHomeQueue(ctx, [s1, s2], async () => ({}));

    expect(result.items.map((i) => i.id)).toEqual(["tasks:3", "tasks:2", "approvals:1"]);
    expect(result.sources.tasks).toEqual({ status: "ok", count: 2 });
  });

  it("passes the context to each source and returns the counts loader's result", async () => {
    const s1 = source("tasks", async () => []);
    const counts = jest.fn(async () => ({ untreatedRisks: 4, aiOnRecord: null }));

    const result = await getHomeQueue(ctx, [s1], counts);

    expect(s1.load).toHaveBeenCalledWith(ctx);
    expect(counts).toHaveBeenCalledWith(ctx);
    expect(result.counts).toEqual({ untreatedRisks: 4, aiOnRecord: null });
  });

  it("a failing counts loader does not take the queue down", async () => {
    const s1 = source("tasks", async () => [item("tasks", 1, null)]);

    const result = await getHomeQueue(ctx, [s1], async () => {
      throw new Error("gateway down");
    });

    expect(result.items).toHaveLength(1);
    expect(result.counts).toEqual({});
    expect(logger.error).toHaveBeenCalled();
  });

  it("registers the approvals, tasks and intake sources by default", async () => {
    const { HOME_QUEUE_SOURCES } = await import("../index");
    expect(HOME_QUEUE_SOURCES.map((s) => s.id)).toEqual(["approvals", "tasks", "intake"]);
  });
});
