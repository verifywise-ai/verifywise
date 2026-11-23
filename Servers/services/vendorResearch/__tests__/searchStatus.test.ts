import { describe, it, expect } from "@jest/globals";
import { researchSearchStatus, runFoundNoNews } from "../searchStatus";
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

describe("runFoundNoNews", () => {
  it("is true when every news category's search was not available", () => {
    expect(runFoundNoNews([...site, ...news("search_failed", NOTES.searchUnavailable)])).toBe(true);
  });

  it("is true when the news categories rest on the vendor's own pages and records only", () => {
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
    expect(runFoundNoNews(summary)).toBe(true);
  });

  it("is false when one news category kept a finding", () => {
    const summary = news("search_failed", NOTES.searchUnavailable);
    summary[2] = { category: "availability", outcome: "findings", note: findingsNote(2) };
    expect(runFoundNoNews(summary)).toBe(false);
  });

  it("is false when a news search answered and found nothing", () => {
    expect(runFoundNoNews(news("nothing_found", NOTES.nothingFound))).toBe(false);
  });

  it("is false when only some searches of a category failed", () => {
    const summary = news("search_failed", NOTES.searchUnavailable);
    summary[0] = {
      category: "security_incidents",
      outcome: "nothing_found",
      note: "3 of 5 searches failed",
    };
    expect(runFoundNoNews(summary)).toBe(false);
  });

  it("is false when the news found more than a run keeps", () => {
    const summary = news("search_failed", NOTES.searchUnavailable);
    summary[1] = { category: "legal_regulatory", outcome: "over_cap", note: NOTES.overCap };
    expect(runFoundNoNews(summary)).toBe(false);
  });

  it("does not count a summary it cannot read as a failure", () => {
    expect(runFoundNoNews(null)).toBe(false);
    expect(runFoundNoNews("search_failed")).toBe(false);
    expect(runFoundNoNews([])).toBe(false);
    expect(runFoundNoNews(site)).toBe(false);
    expect(runFoundNoNews([{ category: "security_incidents" }, 7, null])).toBe(false);
  });
});

describe("researchSearchStatus", () => {
  const failed = news("search_failed", NOTES.searchUnavailable);
  const answered = news("nothing_found", NOTES.nothingFound);

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

  it("says GDELT has been failing only when every recent GDELT run found no news", () => {
    expect(researchSearchStatus([], [failed]).gdeltNewsFailing).toBe(true);
    expect(researchSearchStatus([], [failed, failed, failed]).gdeltNewsFailing).toBe(true);
    expect(researchSearchStatus([], [failed, answered, failed]).gdeltNewsFailing).toBe(false);
    expect(researchSearchStatus([], [answered]).gdeltNewsFailing).toBe(false);
  });

  it("does not say GDELT has been failing without a recent GDELT run", () => {
    expect(researchSearchStatus([], []).gdeltNewsFailing).toBe(false);
  });
});
