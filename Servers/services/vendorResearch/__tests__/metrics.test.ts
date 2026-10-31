import { createResearchMetrics } from "../metrics";

/** A meter that remembers what its counters were told. */
function fakeMeter() {
  const counters = new Map<string, Array<{ value: number; attributes: Record<string, unknown> }>>();
  return {
    counters,
    meter: {
      createCounter: (name: string) => {
        const calls: Array<{ value: number; attributes: Record<string, unknown> }> = [];
        counters.set(name, calls);
        return {
          add: (value: number, attributes: Record<string, unknown>) =>
            calls.push({ value, attributes }),
        };
      },
    },
  };
}

describe("createResearchMetrics", () => {
  it("counts an accepted finding by category, with no reason", () => {
    const { meter, counters } = fakeMeter();

    createResearchMetrics(meter as never).findingDecided({
      decision: "accepted",
      category: "security_incidents",
    });

    expect(counters.get("vendor_research.finding.decisions")).toEqual([
      {
        value: 1,
        attributes: { decision: "accepted", category: "security_incidents", reason: "none" },
      },
    ]);
  });

  it("counts a dismissed finding with the reason it was dismissed for", () => {
    const { meter, counters } = fakeMeter();

    createResearchMetrics(meter as never).findingDecided({
      decision: "dismissed",
      category: "legal_regulatory",
      reason: "wrong_vendor",
    });

    expect(counters.get("vendor_research.finding.decisions")).toEqual([
      {
        value: 1,
        attributes: { decision: "dismissed", category: "legal_regulatory", reason: "wrong_vendor" },
      },
    ]);
  });

  it.each(["results", "empty", "refused", "failed"] as const)(
    "counts a %s search by the feed it asked",
    (outcome) => {
      const { meter, counters } = fakeMeter();

      createResearchMetrics(meter as never).searchFinished({ kind: "news", outcome });

      expect(counters.get("vendor_research.searches")).toEqual([
        { value: 1, attributes: { kind: "news", outcome } },
      ]);
    },
  );

  it("counts a search that was asked again, by the feed", () => {
    const { meter, counters } = fakeMeter();

    createResearchMetrics(meter as never).searchRetried({ kind: "web" });

    expect(counters.get("vendor_research.search.retries")).toEqual([
      { value: 1, attributes: { kind: "web" } },
    ]);
  });

  it.each([
    ["robots", "hit"],
    ["page", "miss"],
    ["search", "error"],
  ] as const)("counts a %s lookup of the shared cache that came to a %s", (kind, outcome) => {
    const { meter, counters } = fakeMeter();

    createResearchMetrics(meter as never).cacheLookup({ kind, outcome });

    expect(counters.get("vendor_research.cache")).toEqual([
      { value: 1, attributes: { kind, outcome } },
    ]);
  });

  it("never lets a failing counter break the decision or the search it counts", () => {
    const meter = {
      createCounter: () => ({
        add: () => {
          throw new Error("exporter is down");
        },
      }),
    };
    const research = createResearchMetrics(meter as never);

    expect(() =>
      research.findingDecided({ decision: "accepted", category: "ai_specific" }),
    ).not.toThrow();
    expect(() => research.searchFinished({ kind: "web", outcome: "results" })).not.toThrow();
    expect(() => research.searchRetried({ kind: "news" })).not.toThrow();
    expect(() => research.cacheLookup({ kind: "page", outcome: "hit" })).not.toThrow();
  });
});
