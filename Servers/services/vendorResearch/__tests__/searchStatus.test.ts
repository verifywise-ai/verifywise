import { describe, it, expect } from "@jest/globals";
import { researchSearchStatus, runNewsOutcome } from "../searchStatus";
import { NOTES, findingsNote } from "../summary";

/** A summary of the four news categories, each with the given outcome and note. */
const news = (outcome: string, note: string) =>
  ["security_incidents", "legal_regulatory", "availability", "financial_health"].map(
    (category) => ({ category, outcome, note }),
  );

/** The two site categories, answered from the vendor's own pages. */
const site = [
  { category: "certifications", outcome: "nothing_found", note: NOTES.nothingFound },
  { category: "ai_specific", outcome: "findings", note: findingsNote(1) },
];

describe("runNewsOutcome", () => {
  it("is no_news when every news category's search was not available", () => {
    expect(runNewsOutcome([...site, ...news("search_failed", NOTES.searchUnavailable)])).toBe(
      "no_news",
    );
  });

  it("is no_news when the news rests on the vendor's own pages and records only", () => {
    const summary = [
      ...site,
      { category: "security_incidents", outcome: "nothing_found", note: NOTES.newsUnavailable },
      {
        category: "legal_regulatory",
        outcome: "nothing_found",
        note: NOTES.newsUnavailableWithRecords,
      },
      { category: "availability", outcome: "skipped", note: NOTES.timeLimit },
      { category: "financial_health", outcome: "search_failed", note: NOTES.pagesUnreadable },
    ];
    expect(runNewsOutcome(summary)).toBe("no_news");
  });

  it("is answered when one news category kept a finding", () => {
    const summary = news("search_failed", NOTES.searchUnavailable);
    summary[2] = { category: "availability", outcome: "findings", note: findingsNote(2) };
    expect(runNewsOutcome(summary)).toBe("answered");
  });

  it("is answered when a news search answered and found nothing", () => {
    expect(runNewsOutcome(news("nothing_found", NOTES.nothingFound))).toBe("answered");
  });

  it("is answered when only some searches of a category failed", () => {
    const summary = news("search_failed", NOTES.searchUnavailable);
    summary[0] = {
      category: "security_incidents",
      outcome: "nothing_found",
      note: "3 of 5 searches failed",
    };
    expect(runNewsOutcome(summary)).toBe("answered");
  });

  it("is answered when the news found more than a run keeps", () => {
    const summary = news("search_failed", NOTES.searchUnavailable);
    summary[1] = { category: "legal_regulatory", outcome: "over_cap", note: NOTES.overCap };
    expect(runNewsOutcome(summary)).toBe("answered");
  });

  // A run that ran out of time, or ended, before the news was searched says nothing about it.
  it("is unknown when the news categories were skipped by the time limit or an early end", () => {
    expect(runNewsOutcome(news("skipped", NOTES.timeLimit))).toBe("unknown");
    expect(runNewsOutcome(news("skipped", NOTES.endedEarly))).toBe("unknown");
  });

  it("is unknown when only pages could not be read", () => {
    expect(runNewsOutcome(news("search_failed", NOTES.pagesUnreadable))).toBe("unknown");
  });

  it("is unknown for a summary it cannot read", () => {
    expect(runNewsOutcome(null)).toBe("unknown");
    expect(runNewsOutcome("search_failed")).toBe("unknown");
    expect(runNewsOutcome([])).toBe("unknown");
    expect(runNewsOutcome(site)).toBe("unknown");
    expect(runNewsOutcome([{ category: "security_incidents" }, 7, null])).toBe("unknown");
  });
});

describe("researchSearchStatus", () => {
  const failed = news("search_failed", NOTES.searchUnavailable);
  const answered = news("nothing_found", NOTES.nothingFound);
  const timedOut = news("skipped", NOTES.timeLimit);

  it("names the search of each key, and of the newest key as the default", () => {
    const status = researchSearchStatus(
      [
        { id: 5, name: "Anthropic", url: "https://api.anthropic.com" },
        { id: 2, name: "Custom", url: "https://ai-gateway.vercel.sh/v1" },
        { id: 1, name: "Anthropic", url: "https://proxy.example.com" },
      ],
      [],
    );
    expect(status.engines).toEqual({
      default: "anthropic",
      byKey: { 5: "anthropic", 2: "gdelt", 1: "gdelt" },
    });
  });

  it("has no default without a key", () => {
    expect(researchSearchStatus([], []).engines).toEqual({ default: null, byKey: {} });
  });

  it("says recent runs found no news only when every judged run found none", () => {
    expect(researchSearchStatus([], [failed]).recentRunsFoundNoNews).toBe(true);
    expect(researchSearchStatus([], [failed, failed, failed]).recentRunsFoundNoNews).toBe(true);
    expect(researchSearchStatus([], [failed, answered, failed]).recentRunsFoundNoNews).toBe(false);
    expect(researchSearchStatus([], [answered]).recentRunsFoundNoNews).toBe(false);
  });

  it("does not count a run that ran out of time against the news search", () => {
    expect(researchSearchStatus([], [timedOut, timedOut, timedOut]).recentRunsFoundNoNews).toBe(
      false,
    );
  });

  it("skips runs that say nothing about the news and judges the latest three that do", () => {
    // The newest three that say something all failed; an older answered run is past them.
    expect(
      researchSearchStatus([], [timedOut, failed, null, failed, failed, answered])
        .recentRunsFoundNoNews,
    ).toBe(true);
    // An answered run among the three makes it false.
    expect(
      researchSearchStatus([], [failed, timedOut, answered, failed]).recentRunsFoundNoNews,
    ).toBe(false);
  });

  it("does not say recent runs found no news without a recent run", () => {
    expect(researchSearchStatus([], []).recentRunsFoundNoNews).toBe(false);
  });

  describe("with a Brave key", () => {
    const keys = [
      { id: 5, name: "OpenRouter", url: "https://openrouter.ai/api/v1/" },
      { id: 2, name: "Anthropic", url: "https://api.anthropic.com" },
      { id: 1, name: "Anthropic", url: "https://proxy.example.com" },
    ];

    it("names Brave for every key with no search of its own, and keeps Claude's for Anthropic's own", () => {
      const status = researchSearchStatus(keys, [], true);
      expect(status.engines).toEqual({
        default: "brave",
        byKey: { 5: "brave", 2: "anthropic", 1: "brave" },
      });
      expect(status.braveConfigured).toBe(true);
    });

    it("names GDELT without one, and says there is none", () => {
      const status = researchSearchStatus(keys, []);
      expect(status.engines.byKey).toEqual({ 5: "gdelt", 2: "anthropic", 1: "gdelt" });
      expect(status.braveConfigured).toBe(false);
      expect(researchSearchStatus(keys, [], false).braveConfigured).toBe(false);
    });
  });
});
