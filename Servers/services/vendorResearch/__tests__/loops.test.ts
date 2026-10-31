import {
  RESEARCH_CATEGORIES,
  ResearchCategory,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import type { StopReason } from "../../webResearch/researchLoop";
import { CATEGORY_LOOP_STEPS, SITE_LOOP_SEARCHES, combineEndings, loopGrants } from "../loops";

const ALL: readonly ResearchCategory[] = RESEARCH_CATEGORIES;
const NEWS_ONLY: readonly ResearchCategory[] = [
  "security_incidents",
  "legal_regulatory",
  "availability",
  "financial_health",
];
const TOTAL = { searches: 8, reads: 12 };

describe("the constants of a loop of one category", () => {
  it("gives a loop four model turns, and a category of the vendor's website one search", () => {
    expect(CATEGORY_LOOP_STEPS).toBe(4);
    expect(SITE_LOOP_SEARCHES).toBe(1);
  });
});

describe("loopGrants", () => {
  it("gives the first two news categories two searches, the others and each category of the website one, and shares the twelve reads evenly", () => {
    expect(loopGrants(ALL, TOTAL)).toEqual([
      { category: "security_incidents", searches: 2, reads: 2 },
      { category: "certifications", searches: 1, reads: 2 },
      { category: "legal_regulatory", searches: 2, reads: 2 },
      { category: "ai_specific", searches: 1, reads: 2 },
      { category: "availability", searches: 1, reads: 2 },
      { category: "financial_health", searches: 1, reads: 2 },
    ]);
  });

  it("gives the whole budget to the news categories of a vendor without a domain", () => {
    expect(loopGrants(NEWS_ONLY, TOTAL)).toEqual([
      { category: "security_incidents", searches: 2, reads: 3 },
      { category: "legal_regulatory", searches: 2, reads: 3 },
      { category: "availability", searches: 2, reads: 3 },
      { category: "financial_health", searches: 2, reads: 3 },
    ]);
  });

  it("gives a single category the whole budget", () => {
    expect(loopGrants(["certifications"], TOTAL)).toEqual([
      { category: "certifications", searches: 8, reads: 12 },
    ]);
  });

  it("gives the remainder to the first categories, so that the grants add up to the total", () => {
    const grants = loopGrants(ALL, { searches: 9, reads: 14 });

    expect(grants.map((grant) => grant.reads)).toEqual([3, 3, 2, 2, 2, 2]);
    // The news categories share what the websites leave: 7 searches, the first ones one more.
    expect(grants.map((grant) => grant.searches)).toEqual([2, 1, 2, 1, 2, 1]);
  });

  it("never gives out more than the total, and gives out all of it", () => {
    for (const researchable of [ALL, NEWS_ONLY, ["ai_specific"] as const]) {
      for (let searches = 0; searches <= 12; searches += 1) {
        for (let reads = 0; reads <= 15; reads += 1) {
          const grants = loopGrants(researchable, { searches, reads });
          const sum = (key: "searches" | "reads") =>
            grants.reduce((total, grant) => total + grant[key], 0);
          expect(sum("searches")).toBe(searches);
          expect(sum("reads")).toBe(reads);
          expect(grants.every((grant) => grant.searches >= 0 && grant.reads >= 0)).toBe(true);
        }
      }
    }
  });

  it("gives a category of the website no more searches than there are", () => {
    expect(loopGrants(ALL, { searches: 1, reads: 12 }).map((grant) => grant.searches)).toEqual([
      0, 1, 0, 0, 0, 0,
    ]);
  });

  it("keeps the order of the categories it is given", () => {
    expect(loopGrants(["ai_specific", "security_incidents"], TOTAL).map((g) => g.category)).toEqual(
      ["ai_specific", "security_incidents"],
    );
  });

  it("gives out nothing when there is no category", () => {
    expect(loopGrants([], TOTAL)).toEqual([]);
  });
});

describe("combineEndings", () => {
  const ended = (stoppedBecause: StopReason, modelError: unknown = null) => ({
    stoppedBecause,
    modelError,
  });

  it("is finished when every loop finished", () => {
    expect(combineEndings([ended("finished"), ended("finished")])).toEqual(ended("finished"));
  });

  it("is finished when there is no loop", () => {
    expect(combineEndings([])).toEqual(ended("finished"));
  });

  it("says the time ran out when any loop was cut off by it", () => {
    expect(
      combineEndings([ended("finished"), ended("time"), ended("steps"), ended("budget")]),
    ).toEqual(ended("time"));
  });

  it("says the steps ran out when a loop used them all and none ran out of time", () => {
    expect(combineEndings([ended("budget"), ended("steps"), ended("finished")])).toEqual(
      ended("steps"),
    );
  });

  it("says the budget ran out when a loop spent it and none ran out of steps or time", () => {
    expect(combineEndings([ended("finished"), ended("budget")])).toEqual(ended("budget"));
  });

  it("is a model error, with the first error, only when every loop failed", () => {
    const first = new Error("first");
    const second = new Error("second");

    expect(combineEndings([ended("model_error", first), ended("model_error", second)])).toEqual(
      ended("model_error", first),
    );
  });

  it("is a model error with no error when every loop failed and none kept its error", () => {
    expect(combineEndings([ended("model_error"), ended("model_error")])).toEqual(
      ended("model_error"),
    );
  });

  it("leaves out the loops that failed when others went on: what they found is kept", () => {
    expect(combineEndings([ended("model_error", new Error("down")), ended("finished")])).toEqual(
      ended("finished"),
    );
    expect(combineEndings([ended("model_error", new Error("down")), ended("time")])).toEqual(
      ended("time"),
    );
  });
});
