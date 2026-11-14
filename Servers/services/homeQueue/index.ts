import logger, { logStructured } from "../../utils/logger/fileLogger";
import { loadHomeCounts } from "./counts";
import { sortQueueItems } from "./sort";
import { approvalsSource } from "./sources/approvals.source";
import { intakeSource } from "./sources/intake.source";
import { incidentsSource } from "./sources/incidents.source";
import { mrmFindingsSource } from "./sources/mrmFindings.source";
import { policyReviewsSource } from "./sources/policyReviews.source";
import { risksSource } from "./sources/risks.source";
import { tasksSource } from "./sources/tasks.source";
import { vendorReviewsSource } from "./sources/vendorReviews.source";
import type {
  HomeQueueContext,
  HomeQueueItem,
  HomeQueueResponse,
  HomeQueueSource,
} from "../../domain.layer/interfaces/i.homeQueue";

const FILE = "services/homeQueue/index.ts";

export type CountsLoader = (ctx: HomeQueueContext) => Promise<HomeQueueResponse["counts"]>;

/** Every queue source, in registration order. */
export const HOME_QUEUE_SOURCES: HomeQueueSource[] = [
  approvalsSource,
  tasksSource,
  intakeSource,
  risksSource,
  policyReviewsSource,
  vendorReviewsSource,
  incidentsSource,
  mrmFindingsSource,
];

const loadCounts = async (
  counts: CountsLoader,
  ctx: HomeQueueContext,
): Promise<HomeQueueResponse["counts"]> => {
  try {
    return await counts(ctx);
  } catch (error) {
    logStructured("error", "home queue counts failed to load", "getHomeQueue", FILE);
    logger.error("Home queue counts failed to load:", error);
    return {};
  }
};

/**
 * Run every source the user may see, in parallel. A source that throws is
 * reported as unavailable with no items, never as an empty list; a source the
 * user may not see is left out of `sources` entirely.
 */
export async function getHomeQueue(
  ctx: HomeQueueContext,
  sources: HomeQueueSource[] = HOME_QUEUE_SOURCES,
  counts: CountsLoader = loadHomeCounts,
): Promise<HomeQueueResponse> {
  const visible = sources.filter((source) => source.isVisible(ctx));

  const [settled, countsResult] = await Promise.all([
    // Promise.resolve().then() turns a synchronous throw into a rejection.
    Promise.allSettled(visible.map((source) => Promise.resolve().then(() => source.load(ctx)))),
    loadCounts(counts, ctx),
  ]);

  const items: HomeQueueItem[] = [];
  const sourceResults: HomeQueueResponse["sources"] = {};

  settled.forEach((result, i) => {
    const source = visible[i];
    if (result.status === "fulfilled") {
      items.push(...result.value);
      sourceResults[source.id] = { status: "ok", count: result.value.length };
    } else {
      logStructured("error", `home queue source ${source.id} failed`, "getHomeQueue", FILE);
      logger.error(`Home queue source ${source.id} failed:`, result.reason);
      sourceResults[source.id] = { status: "unavailable", count: 0 };
    }
  });

  return { items: sortQueueItems(items), sources: sourceResults, counts: countsResult };
}
