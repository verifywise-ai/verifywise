/**
 * The metrics of the vendor research agent, pushed to the central stack like the rest of the
 * backend's (see docs/technical/infrastructure/observability.md). Nothing here changes how a run or
 * a decision goes: a counter that throws is swallowed, and with observability off the global meter
 * is a no-op.
 *
 * Every attribute value comes from a closed set (a decision, a category, a dismissal reason, a
 * feed, a search outcome, a kind of cache and its outcome), so the number of series stays small and nothing a third party or the
 * model wrote leaves the server.
 */
import { metrics, type Meter } from "@opentelemetry/api";
import type {
  DismissReason,
  ResearchCategory,
} from "../../domain.layer/interfaces/i.vendorResearch";

/** The name of the backend's meter, the one `observability/otel.ts` registers its instruments on. */
const METER_NAME = "verifywise-backend";

export interface ResearchMetrics {
  /** A person accepted or dismissed a finding: the measure of how useful the agent's findings are. */
  findingDecided(decision: {
    decision: "accepted" | "dismissed";
    category: ResearchCategory;
    /** Why it was dismissed; absent for an accepted finding. */
    reason?: DismissReason;
  }): void;
  /**
   * A search step of the loop ended: `results` (the feed returned results that were kept), `empty`
   * (it answered and nothing was left), `refused` (the rules turned it away before the feed) or
   * `failed` (the feed did not answer, also after the retry).
   */
  searchFinished(search: {
    kind: "web" | "news";
    outcome: "results" | "empty" | "refused" | "failed";
  }): void;
  /** The engine asked a feed a second time, after a failure that may pass. */
  searchRetried(search: { kind: "web" | "news" }): void;
  /**
   * A lookup in the cache that research runs share: what was looked up (`robots`, `page` or
   * `search`) and how it came out (`hit`, `miss`, or `error` when the store failed or was too slow).
   * A write that failed is an `error` too.
   */
  cacheLookup(lookup: {
    kind: "robots" | "page" | "search";
    outcome: "hit" | "miss" | "error";
  }): void;
}

export function createResearchMetrics(meter: Pick<Meter, "createCounter">): ResearchMetrics {
  const decisions = meter.createCounter("vendor_research.finding.decisions", {
    description: "Findings of the vendor research agent that a person accepted or dismissed",
  });

  const searches = meter.createCounter("vendor_research.searches", {
    description: "Search steps of the vendor research agent, by feed and outcome",
  });
  const retries = meter.createCounter("vendor_research.search.retries", {
    description: "Searches of the vendor research agent that were asked of the feed a second time",
  });
  const cache = meter.createCounter("vendor_research.cache", {
    description:
      "Lookups in the cache that vendor research runs share, by what was looked up and the outcome",
  });

  return {
    findingDecided({ decision, category, reason }) {
      try {
        decisions.add(1, { decision, category, reason: reason ?? "none" });
      } catch {
        // A metric must never break the decision it counts.
      }
    },
    searchFinished({ kind, outcome }) {
      try {
        searches.add(1, { kind, outcome });
      } catch {
        // Nor the search.
      }
    },
    searchRetried({ kind }) {
      try {
        retries.add(1, { kind });
      } catch {
        // Nor the search.
      }
    },
    cacheLookup({ kind, outcome }) {
      try {
        cache.add(1, { kind, outcome });
      } catch {
        // Nor the lookup.
      }
    },
  };
}

let shared: ResearchMetrics | undefined;

/**
 * The metrics on the global meter. Built on first use, which is after `initObservability` has
 * registered the meter provider at startup.
 */
export function researchMetrics(): ResearchMetrics {
  shared ??= createResearchMetrics(metrics.getMeter(METER_NAME));
  return shared;
}
