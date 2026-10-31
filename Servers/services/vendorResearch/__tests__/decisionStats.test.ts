import { RESEARCH_CATEGORIES } from "../../../domain.layer/interfaces/i.vendorResearch";
import { type DecisionCountRow, foldDecisionStats, sumByPromptVersion } from "../decisionStats";

const row = (partial: Partial<DecisionCountRow>): DecisionCountRow => ({
  prompt_version: "vr-2",
  category: "security_incidents",
  status: "pending",
  dismissed_reason: null,
  count: 1,
  ...partial,
});

describe("foldDecisionStats", () => {
  it("adds up pending, accepted and dismissed per prompt version and category", () => {
    const stats = foldDecisionStats([
      row({ status: "pending", count: 4 }),
      row({ status: "accepted", count: 3 }),
      row({ status: "dismissed", dismissed_reason: "inaccurate", count: 2 }),
      row({ category: "legal_regulatory", status: "accepted", count: 1 }),
    ]);

    expect(stats).toEqual([
      {
        promptVersion: "vr-2",
        category: "security_incidents",
        pending: 4,
        accepted: 3,
        dismissed: 2,
        acceptanceRate: 0.6,
        dismissedByReason: { inaccurate: 2 },
      },
      {
        promptVersion: "vr-2",
        category: "legal_regulatory",
        pending: 0,
        accepted: 1,
        dismissed: 0,
        acceptanceRate: 1,
        dismissedByReason: {},
      },
    ]);
  });

  it("counts a dismissal by its reason, summing rows of one reason", () => {
    const [stat] = foldDecisionStats([
      row({ status: "dismissed", dismissed_reason: "wrong_vendor", count: 2 }),
      row({ status: "dismissed", dismissed_reason: "outdated", count: 1 }),
      row({ status: "dismissed", dismissed_reason: "wrong_vendor", count: 3 }),
    ]);

    expect(stat.dismissed).toBe(6);
    expect(stat.dismissedByReason).toEqual({ wrong_vendor: 5, outdated: 1 });
  });

  it("has no acceptance rate while nobody has decided", () => {
    const [stat] = foldDecisionStats([row({ status: "pending", count: 5 })]);

    expect(stat.acceptanceRate).toBeNull();
  });

  it("keeps a run without a prompt version apart, after the versions that are named", () => {
    const stats = foldDecisionStats([
      row({ prompt_version: null, status: "accepted" }),
      row({ prompt_version: "vr-3", status: "accepted" }),
      row({ prompt_version: "vr-2", status: "accepted" }),
    ]);

    expect(stats.map((stat) => stat.promptVersion)).toEqual(["vr-2", "vr-3", null]);
  });

  it("lists the categories of a prompt version in the order of the categories", () => {
    const stats = foldDecisionStats(
      [...RESEARCH_CATEGORIES].reverse().map((category) => row({ category, status: "accepted" })),
    );

    expect(stats.map((stat) => stat.category)).toEqual([...RESEARCH_CATEGORIES]);
  });

  it("returns nothing for no rows", () => {
    expect(foldDecisionStats([])).toEqual([]);
  });
});

describe("sumByPromptVersion", () => {
  it("adds the categories of one prompt version into one entry, the rate over all of them", () => {
    const stats = foldDecisionStats([
      row({ category: "security_incidents", status: "accepted", count: 1 }),
      row({ category: "certifications", status: "accepted", count: 1 }),
      row({
        category: "certifications",
        status: "dismissed",
        dismissed_reason: "outdated",
        count: 2,
      }),
      row({ category: "ai_specific", status: "pending", count: 7 }),
      row({ prompt_version: "vr-3", category: "ai_specific", status: "accepted", count: 5 }),
    ]);

    expect(sumByPromptVersion(stats)).toEqual([
      {
        promptVersion: "vr-2",
        pending: 7,
        accepted: 2,
        dismissed: 2,
        acceptanceRate: 0.5,
        dismissedByReason: { outdated: 2 },
      },
      {
        promptVersion: "vr-3",
        pending: 0,
        accepted: 5,
        dismissed: 0,
        acceptanceRate: 1,
        dismissedByReason: {},
      },
    ]);
  });
});
