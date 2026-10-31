import {
  CategorySummaryEntry,
  NewFinding,
  RESEARCH_CATEGORIES,
  ResearchCategory,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import type { StopReason } from "../../webResearch/researchLoop";
import { CallFailure, CallRecord, createWebSession } from "../../webResearch/webSession";
import { NO_DOMAIN_NOTE } from "../categories";
import { MAX_NOTE_CHARS } from "../schema";
import {
  NOTES,
  findingsNote,
  pagesFailedNote,
  summariseCategories,
  workedCategories,
} from "../summary";

type Call = CallRecord<ResearchCategory>;

// Built from char codes, so that no control character or lone surrogate sits in this file.
const NUL = String.fromCharCode(0);
const REPLACEMENT = String.fromCharCode(0xfffd);
const LONE_HIGH = String.fromCharCode(0xd83d);

/** A search that the web answered: a feed, with or without results. */
const searched = (category: ResearchCategory): Call => ({
  category,
  tool: "search",
  answered: true,
  failure: null,
});

/** A search that failed: Bing answered 429, a consent page, or nothing at all. */
const searchFailed = (category: ResearchCategory): Call => ({
  category,
  tool: "search",
  answered: false,
  failure: "search_unavailable",
});

/** A page that was read. */
const read = (category: ResearchCategory): Call => ({
  category,
  tool: "read",
  answered: true,
  failure: null,
});

/** A page that could not be read. */
const readFailed = (
  category: ResearchCategory,
  failure: CallFailure = "blocked_by_site",
): Call => ({
  category,
  tool: "read",
  answered: false,
  failure,
});

/** A finding as the pipeline keeps it; only its category matters here. */
const keptIn = (category: ResearchCategory): NewFinding => ({
  category,
  risk_description: "A risk.",
  impact_description: "An effect on us.",
  action_plan: "Ask the vendor.",
  likelihood: "Possible",
  risk_severity: "Major",
  risk_level: "High Risk",
  confidence: "low",
  rationale: null,
  sources: [{ url: "https://news.example.com/a", title: "A", quote: "q", published_at: null }],
});

type SummaryInput = Parameters<typeof summariseCategories>[0];

/** Every category worked on, each with one answered search, and nothing else. */
function summarise(overrides: Partial<SummaryInput> = {}): CategorySummaryEntry[] {
  return summariseCategories({
    skippedNoDomain: [],
    calls: RESEARCH_CATEGORIES.map(searched),
    kept: [],
    proposed: new Set(),
    modelNotes: [],
    stoppedBecause: "finished",
    ...overrides,
  });
}

/** The entry of one category. */
function entryFor(summary: CategorySummaryEntry[], category: ResearchCategory) {
  const entry = summary.find((candidate) => candidate.category === category);
  if (entry === undefined) throw new Error(`no entry for ${category}`);
  return entry;
}

/** The summary of security_incidents when these are its only calls. */
const securityWith = (calls: Call[], overrides: Partial<SummaryInput> = {}) =>
  entryFor(summarise({ calls, ...overrides }), "security_incidents");

describe("the notes", () => {
  it("are the closed set of phrases that the UI translates", () => {
    expect(NOTES).toEqual({
      nothingFound: "No risks found in the sources reviewed",
      unconfirmed: "Possible risks were found but could not be verified or are already recorded",
      searchUnavailable: "The search was not available",
      pagesUnreadable: "The pages could not be read",
      timeLimit: "Not researched: the time limit was reached",
      endedEarly: "Not researched: the research ended before this category was covered",
      noNewSources: "No new sources since the last run",
    });
  });

  it("count the findings, in the singular for one", () => {
    expect(findingsNote(1)).toBe("1 potential risk found");
    expect(findingsNote(3)).toBe("3 potential risks found");
  });

  it("count the pages that could not be read", () => {
    expect(pagesFailedNote(2, 5)).toBe("No risks found; 2 of 5 pages could not be read");
  });
});

describe("summariseCategories", () => {
  it("gives one entry per category, in category order, whatever order the calls came in", () => {
    const summary = summarise({ calls: RESEARCH_CATEGORIES.map(searched).reverse() });

    expect(summary.map((entry) => entry.category)).toEqual([...RESEARCH_CATEGORIES]);
  });

  describe("a category that cannot be researched without the vendor's domain", () => {
    it("is skipped with the no-domain note, whatever else is true of it", () => {
      const summary = summarise({
        skippedNoDomain: ["certifications", "ai_specific"],
        calls: [
          searched("certifications"),
          readFailed("ai_specific"),
          searched("security_incidents"),
        ],
        kept: [keptIn("certifications")],
        proposed: new Set<ResearchCategory>(["ai_specific"]),
        modelNotes: [{ category: "certifications", note: "A note of the model." }],
        stoppedBecause: "time",
      });

      expect(entryFor(summary, "certifications")).toEqual({
        category: "certifications",
        outcome: "skipped",
        note: NO_DOMAIN_NOTE,
      });
      expect(entryFor(summary, "ai_specific")).toEqual({
        category: "ai_specific",
        outcome: "skipped",
        note: NO_DOMAIN_NOTE,
      });
    });
  });

  describe("a category with kept findings", () => {
    it("counts them", () => {
      const summary = summarise({
        kept: [
          keptIn("security_incidents"),
          keptIn("legal_regulatory"),
          keptIn("legal_regulatory"),
          keptIn("legal_regulatory"),
        ],
      });

      expect(entryFor(summary, "security_incidents")).toEqual({
        category: "security_incidents",
        outcome: "findings",
        note: "1 potential risk found",
      });
      expect(entryFor(summary, "legal_regulatory")).toEqual({
        category: "legal_regulatory",
        outcome: "findings",
        note: "3 potential risks found",
      });
    });

    it("counts them also when some of its calls failed, and whatever the model wrote", () => {
      const entry = securityWith(
        [
          searchFailed("security_incidents"),
          searched("security_incidents"),
          readFailed("security_incidents"),
        ],
        {
          kept: [keptIn("security_incidents")],
          proposed: new Set<ResearchCategory>(["security_incidents"]),
          modelNotes: [{ category: "security_incidents", note: "NOTE-OF-THE-MODEL" }],
        },
      );

      expect(entry).toEqual({
        category: "security_incidents",
        outcome: "findings",
        note: "1 potential risk found",
      });
    });
  });

  // Review Focus 1 and 5: a loop that ended before it reached a category did not look at it.
  describe("a category that no call was tagged with", () => {
    it("says that the time limit was reached when the loop ran out of time", () => {
      expect(entryFor(summarise({ calls: [], stoppedBecause: "time" }), "certifications")).toEqual({
        category: "certifications",
        outcome: "skipped",
        note: "Not researched: the time limit was reached",
      });
    });

    it.each<StopReason>(["finished", "budget", "steps", "model_error"])(
      "says that the research ended before it when the loop stopped for %s",
      (stoppedBecause) => {
        expect(entryFor(summarise({ calls: [], stoppedBecause }), "certifications")).toEqual({
          category: "certifications",
          outcome: "skipped",
          note: "Not researched: the research ended before this category was covered",
        });
      },
    );

    it("tells the categories of a vendor without a website from those the loop did not reach", () => {
      const summary = summarise({
        skippedNoDomain: ["certifications", "ai_specific"],
        calls: [searched("security_incidents")],
        stoppedBecause: "time",
      });

      expect(summary).toEqual([
        {
          category: "security_incidents",
          outcome: "nothing_found",
          note: "No risks found in the sources reviewed",
        },
        { category: "certifications", outcome: "skipped", note: NO_DOMAIN_NOTE },
        {
          category: "legal_regulatory",
          outcome: "skipped",
          note: "Not researched: the time limit was reached",
        },
        { category: "ai_specific", outcome: "skipped", note: NO_DOMAIN_NOTE },
        {
          category: "availability",
          outcome: "skipped",
          note: "Not researched: the time limit was reached",
        },
        {
          category: "financial_health",
          outcome: "skipped",
          note: "Not researched: the time limit was reached",
        },
      ]);
    });
  });

  // Review Focus 4: Bing answered 429 or a consent page, or every page was blocked.
  describe("a category that was worked on and that the web never answered", () => {
    it.each([
      ["one failed search", [searchFailed("security_incidents")]],
      [
        "several failed searches",
        [searchFailed("security_incidents"), searchFailed("security_incidents")],
      ],
    ])("says the search was not available after %s", (_label, calls) => {
      expect(securityWith(calls)).toEqual({
        category: "security_incidents",
        outcome: "search_failed",
        note: "The search was not available",
      });
    });

    it.each([
      ["one failed page", [readFailed("security_incidents")]],
      [
        "a failed search and a failed page",
        [searchFailed("security_incidents"), readFailed("security_incidents", "blocked_by_robots")],
      ],
      [
        "failed pages of every kind",
        [
          readFailed("security_incidents", "unreachable"),
          readFailed("security_incidents", "not_found"),
          readFailed("security_incidents", "needs_javascript"),
        ],
      ],
    ])("says the pages could not be read after %s", (_label, calls) => {
      expect(securityWith(calls)).toEqual({
        category: "security_incidents",
        outcome: "search_failed",
        note: "The pages could not be read",
      });
    });

    it("is never nothing_found, even when the model proposed a risk or wrote a note for it", () => {
      const entry = securityWith([searchFailed("security_incidents")], {
        proposed: new Set<ResearchCategory>(["security_incidents"]),
        modelNotes: [{ category: "security_incidents", note: "Nothing in the news." }],
      });

      expect(entry.outcome).toBe("search_failed");
      expect(entry.note).toBe("The search was not available");
    });
  });

  describe("a category that the web answered", () => {
    it("found nothing when the model proposed nothing and wrote no note", () => {
      expect(securityWith([searched("security_incidents"), read("security_incidents")])).toEqual({
        category: "security_incidents",
        outcome: "nothing_found",
        note: "No risks found in the sources reviewed",
      });
    });

    it("found nothing also when its only call was an answered search with no results", () => {
      expect(securityWith([searched("security_incidents")])).toEqual({
        category: "security_incidents",
        outcome: "nothing_found",
        note: "No risks found in the sources reviewed",
      });
    });

    it("found nothing next to a failed search, as long as another call was answered", () => {
      expect(
        securityWith([searchFailed("security_incidents"), searched("security_incidents")]),
      ).toEqual({
        category: "security_incidents",
        outcome: "nothing_found",
        note: "No risks found in the sources reviewed",
      });
    });

    it("counts the pages that could not be read among all the pages of the category", () => {
      const entry = securityWith([
        searched("security_incidents"),
        read("security_incidents"),
        readFailed("security_incidents", "blocked_by_site"),
        read("security_incidents"),
        readFailed("security_incidents", "unreachable"),
        read("security_incidents"),
        // A failed search is no page, and a page of another category is not counted.
        searchFailed("security_incidents"),
        readFailed("legal_regulatory"),
      ]);

      expect(entry).toEqual({
        category: "security_incidents",
        outcome: "nothing_found",
        note: "No risks found; 2 of 5 pages could not be read",
      });
    });

    it("says the possible risks were not confirmed when the model proposed one and none was kept", () => {
      expect(
        securityWith([searched("security_incidents")], {
          proposed: new Set<ResearchCategory>(["security_incidents"]),
        }),
      ).toEqual({
        category: "security_incidents",
        outcome: "nothing_found",
        note: "Possible risks were found but could not be verified or are already recorded",
      });
    });

    it("says so even when pages of the category could not be read", () => {
      const entry = securityWith(
        [
          searched("security_incidents"),
          read("security_incidents"),
          readFailed("security_incidents"),
        ],
        { proposed: new Set<ResearchCategory>(["security_incidents"]) },
      );

      expect(entry.note).toBe(
        "Possible risks were found but could not be verified or are already recorded",
      );
    });
  });

  // A scheduled run shows the model only the sources that no earlier run showed to it. A category
  // that has none of those did not become safe: nothing new was found, which is another sentence.
  describe("a scheduled run, where only the new sources were analysed", () => {
    const fresh = (...categories: ResearchCategory[]) => ({
      freshCategories: new Set<ResearchCategory>(categories),
    });

    it("found nothing new in a category that was worked on and has no new source", () => {
      expect(securityWith([searched("security_incidents")], fresh())).toEqual({
        category: "security_incidents",
        outcome: "nothing_found",
        note: "No new sources since the last run",
      });
    });

    it("says what it always says for a category that has a new source", () => {
      expect(securityWith([searched("security_incidents")], fresh("security_incidents"))).toEqual({
        category: "security_incidents",
        outcome: "nothing_found",
        note: "No risks found in the sources reviewed",
      });
    });

    it("leaves the model's own note out for a category it saw no new source of", () => {
      const entry = securityWith([searched("security_incidents")], {
        ...fresh(),
        modelNotes: [{ category: "security_incidents", note: "The press reported one incident." }],
      });

      expect(entry.note).toBe("No new sources since the last run");
    });

    it("keeps the model's own note for a category that has a new source", () => {
      const entry = securityWith([searched("security_incidents")], {
        ...fresh("security_incidents"),
        modelNotes: [{ category: "security_incidents", note: "The press reported one incident." }],
      });

      expect(entry.note).toBe("The press reported one incident.");
    });

    it("still counts the pages that could not be read, which is more than 'nothing new'", () => {
      const entry = securityWith(
        [
          searched("security_incidents"),
          read("security_incidents"),
          readFailed("security_incidents"),
        ],
        fresh(),
      );

      expect(entry.note).toBe("No risks found; 1 of 2 pages could not be read");
    });

    it("keeps the count of the findings, and the sentences of a category that was not researched or could not be", () => {
      const summary = summarise({
        calls: [searched("security_incidents"), searchFailed("certifications")],
        kept: [keptIn("security_incidents")],
        stoppedBecause: "time",
        ...fresh("security_incidents"),
      });

      expect(entryFor(summary, "security_incidents")).toEqual({
        category: "security_incidents",
        outcome: "findings",
        note: "1 potential risk found",
      });
      expect(entryFor(summary, "certifications")).toEqual({
        category: "certifications",
        outcome: "search_failed",
        note: "The search was not available",
      });
      expect(entryFor(summary, "legal_regulatory")).toEqual({
        category: "legal_regulatory",
        outcome: "skipped",
        note: "Not researched: the time limit was reached",
      });
    });

    it("is the same as any other run when the run does not name the categories with new sources", () => {
      expect(securityWith([searched("security_incidents")]).note).toBe(
        "No risks found in the sources reviewed",
      );
    });
  });

  describe("the note of the model", () => {
    const withNote = (note: string, calls: Call[] = [searched("security_incidents")]) =>
      securityWith(calls, { modelNotes: [{ category: "security_incidents", note }] });

    it("is used when no page failed and the model proposed nothing", () => {
      expect(withNote("Nothing in the news.")).toEqual({
        category: "security_incidents",
        outcome: "nothing_found",
        note: "Nothing in the news.",
      });
    });

    it("is cleaned, trimmed and cut to the length of a note", () => {
      expect(withNote(`  Quiet${NUL} year ${LONE_HIGH}  `).note).toBe(`Quiet year ${REPLACEMENT}`);
      expect(withNote(`  ${"n".repeat(MAX_NOTE_CHARS + 50)}`).note).toBe(
        "n".repeat(MAX_NOTE_CHARS),
      );
    });

    it("gives way to the plain sentence when it is blank, or only NULs and whitespace", () => {
      expect(withNote("   ").note).toBe("No risks found in the sources reviewed");
      expect(withNote(` ${NUL}${NUL}\n `).note).toBe("No risks found in the sources reviewed");
    });

    it("is the first of its category that has text left", () => {
      const entry = securityWith([searched("security_incidents")], {
        modelNotes: [
          { category: "legal_regulatory", note: "A note of another category." },
          { category: "security_incidents", note: "  " },
          { category: "security_incidents", note: "The first real note." },
          { category: "security_incidents", note: "The second note." },
        ],
      });

      expect(entry.note).toBe("The first real note.");
    });

    it("is ignored next to a page that could not be read", () => {
      const entry = withNote("Nothing to see here.", [
        searched("security_incidents"),
        read("security_incidents"),
        readFailed("security_incidents"),
      ]);

      expect(entry.note).toBe("No risks found; 1 of 2 pages could not be read");
    });

    it("is ignored when the model proposed a risk in the category", () => {
      const entry = securityWith([searched("security_incidents")], {
        proposed: new Set<ResearchCategory>(["security_incidents"]),
        modelNotes: [{ category: "security_incidents", note: "NOTE-OF-THE-MODEL" }],
      });

      expect(JSON.stringify(entry)).not.toContain("NOTE-OF-THE-MODEL");
    });
  });
});

describe("workedCategories", () => {
  it("lists the categories with at least one call, failed ones included, in category order", () => {
    const calls = [
      read("ai_specific"),
      searchFailed("security_incidents"),
      searched("ai_specific"),
      readFailed("legal_regulatory"),
    ];

    expect(workedCategories(calls)).toEqual([
      "security_incidents",
      "legal_regulatory",
      "ai_specific",
    ]);
  });

  it("is empty when the loop made no call", () => {
    expect(workedCategories([])).toEqual([]);
  });

  it("leaves out a category whose calls the session refused, since a refusal is never a call", async () => {
    const session = createWebSession<ResearchCategory>({
      engine: { search: async () => [] },
      readPage: async () => {
        throw new Error("a refused read never reaches the reader");
      },
      domain: "acme.com",
      cutoffs: {},
      limits: { maxSearches: 1 },
    });

    expect(await session.search("Acme breach", "news", "security_incidents")).toMatchObject({
      ok: true,
    });
    // Not from a search and not on the vendor's site; then a search over the budget.
    expect(await session.read("https://elsewhere.example.com/page", "certifications")).toEqual({
      ok: false,
      reason: "not_from_search",
    });
    expect(await session.search("Acme lawsuit", "news", "legal_regulatory")).toEqual({
      ok: false,
      reason: "budget_exhausted",
    });

    const { calls } = session.snapshot();
    expect(workedCategories(calls)).toEqual(["security_incidents"]);
    expect(entryFor(summarise({ calls }), "certifications").outcome).toBe("skipped");
    expect(entryFor(summarise({ calls }), "legal_regulatory").outcome).toBe("skipped");
  });
});
