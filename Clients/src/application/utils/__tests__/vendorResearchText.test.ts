import { describe, it, expect } from "vitest";
import { translations } from "../../../i18n/translations";
import { LANGS, setLanguage } from "../../../test/i18nHelpers";
import type {
  CategoryOutcome,
  CategorySummaryEntry,
  ResearchCategory,
} from "../../../domain/interfaces/i.vendorResearch";
import {
  categoryLabel,
  confidenceLabel,
  describeCategoryLine,
  describeCategoryNote,
  describeRunError,
  dismissReasonLabel,
  formatResearchDate,
  outcomeLabel,
} from "../vendorResearchText";

/** The closed set of run errors the server stores, and the sentence each one becomes. */
const RUN_ERRORS: Array<[stored: string, sentence: string]> = [
  ["Vendor not found", "The vendor was not found."],
  ["No LLM key configured", "No LLM key is configured for your organization."],
  ["Model call failed: HTTP 503", "The model call failed with HTTP status 503."],
  ["Model call failed: timed out", "The model call timed out."],
  [
    "Model call failed: the answer did not match the expected format",
    "The model answer did not match the expected format.",
  ],
  ["Model call failed: unexpected error", "The model call failed unexpectedly."],
  ["Unexpected error", "The research run failed unexpectedly."],
  ["Saving the findings failed", "The findings could not be saved."],
  ["timed out", "The research run timed out."],
  ["could not enqueue", "The research run could not be queued."],
  [
    "The run stopped because the web could not be reached",
    "The web could not be reached from the server.",
  ],
  ["The model did not use the research actions", "The model did not carry out the research steps."],
];

/** Stored by the earlier search provider; no longer ours, so the screen no longer shows it. */
const RETIRED_RUN_ERRORS = [
  "Search provider not configured",
  "The run stopped because all searches failed: ",
  "The run stopped because all searches failed: search timed out",
  "The run stopped because all searches failed: search timed out; The search failed",
];

/** The closed set of category notes by outcome, and the sentence each one becomes. */
const FIXED_NOTES: Array<[outcome: CategoryOutcome, stored: string, sentence: string]> = [
  [
    "skipped",
    "Vendor website is missing or not a valid domain",
    "The vendor website is missing or is not a valid domain.",
  ],
  [
    "skipped",
    "Not researched: the time limit was reached",
    "Not researched: the time limit was reached.",
  ],
  [
    "skipped",
    "Not researched: the research ended before this category was covered",
    "Not researched: the research ended before this category was covered.",
  ],
  [
    "nothing_found",
    "No risks found in the sources reviewed",
    "No risks were found in the sources reviewed.",
  ],
  [
    "nothing_found",
    "No risks found; 2 of 5 pages could not be read",
    "No risks were found. 2 of 5 pages could not be read.",
  ],
  [
    "nothing_found",
    "Possible risks were found but could not be verified or are already recorded",
    "Possible risks were found but could not be verified, or are already recorded.",
  ],
  ["findings", "1 potential risk found", "1 potential risk found"],
  ["findings", "3 potential risks found", "3 potential risks found"],
  ["search_failed", "The search was not available", "The search was not available."],
  ["search_failed", "The pages could not be read", "The pages could not be read."],
];

/** Notes the earlier search provider stored: no longer ours, on any outcome. */
const RETIRED_NOTES: Array<[outcome: CategoryOutcome, stored: string]> = [
  ["nothing_found", "No risks found in the search results"],
  ["search_failed", "search timed out"],
  ["search_failed", "search request failed"],
  ["search_failed", "search response could not be read"],
  ["search_failed", "Tavily search failed with status 503"],
  ["search_failed", "The search failed"],
];

const ALL_OUTCOMES: CategoryOutcome[] = ["findings", "nothing_found", "search_failed", "skipped"];

const entry = (
  outcome: CategoryOutcome,
  note: string,
  category: ResearchCategory = "security_incidents",
): CategorySummaryEntry => ({ category, outcome, note });

describe("describeRunError", () => {
  it.each(RUN_ERRORS)("turns %j into a sentence", (stored, sentence) => {
    expect(describeRunError(stored)).toBe(sentence);
  });

  it.each(RETIRED_RUN_ERRORS)(
    "gives the generic sentence for %j, which is no longer ours",
    (stored) => {
      expect(describeRunError(stored)).toBe("The research run failed.");
    },
  );

  it("never shows an unknown stored string, whatever it says", () => {
    for (const odd of [
      "connect ECONNREFUSED 10.0.0.5:5432",
      "Model call failed: HTTP abc",
      "model call failed: timed out",
      "Vendor not found. Extra detail",
    ]) {
      expect(describeRunError(odd)).toBe("The research run failed.");
    }
  });

  it("falls back to the generic sentence for null, empty and odd input without throwing", () => {
    for (const odd of [null, "", "   ", undefined, 7, {}, []]) {
      expect(describeRunError(odd as never)).toBe("The research run failed.");
    }
  });

  it("ignores the whitespace around a stored error", () => {
    expect(describeRunError("  timed out ")).toBe("The research run timed out.");
  });
});

describe("describeCategoryNote", () => {
  it.each(FIXED_NOTES)(
    "turns the %s note %j into a plain sentence",
    (outcome, stored, sentence) => {
      expect(describeCategoryNote(entry(outcome, stored))).toEqual({
        kind: "fixed",
        text: sentence,
      });
    },
  );

  it("counts potential risks with a small parser, singular and plural", () => {
    expect(describeCategoryNote(entry("findings", "1 potential risk found"))).toEqual({
      kind: "fixed",
      text: "1 potential risk found",
    });
    expect(describeCategoryNote(entry("findings", "12 potential risks found"))).toEqual({
      kind: "fixed",
      text: "12 potential risks found",
    });
  });

  it("does not turn a model's note into a system sentence because it repeats one", () => {
    // On a category where nothing was found, the note may be the model's own. A model can write
    // "3 potential risks found" or "search timed out" there; only the server's own phrases for
    // this outcome are fixed sentences, so these come back flagged as the model's.
    for (const phrase of ["3 potential risks found", "search timed out"]) {
      expect(describeCategoryNote(entry("nothing_found", phrase))).toEqual({
        kind: "model",
        text: phrase,
        label: "AI note (unverified)",
      });
    }
  });

  it("hides the phrase of one outcome on a category with another outcome", () => {
    expect(
      describeCategoryNote(entry("findings", "No risks found in the sources reviewed")),
    ).toBeNull();
    expect(describeCategoryNote(entry("skipped", "2 potential risks found"))).toBeNull();
    expect(describeCategoryNote(entry("search_failed", "1 potential risk found"))).toBeNull();
    expect(describeCategoryNote(entry("skipped", "The search was not available"))).toBeNull();
    expect(
      describeCategoryNote(entry("search_failed", "Not researched: the time limit was reached")),
    ).toBeNull();
  });

  it("fills the counts of the page note into the sentence", () => {
    expect(
      describeCategoryNote(
        entry("nothing_found", "No risks found; 1 of 1 pages could not be read"),
      ),
    ).toEqual({ kind: "fixed", text: "No risks were found. 1 of 1 pages could not be read." });
    expect(
      describeCategoryNote(
        entry("nothing_found", "No risks found; 12 of 120 pages could not be read"),
      ),
    ).toEqual({ kind: "fixed", text: "No risks were found. 12 of 120 pages could not be read." });
  });

  it("does not take a page note that the server cannot have written as its own", () => {
    // More than three digits, more pages failed than were read, a sign, a gap, other words.
    for (const odd of [
      "No risks found; 1000 of 1200 pages could not be read",
      "No risks found; 5 of 1000 pages could not be read",
      "No risks found; 6 of 5 pages could not be read",
      "No risks found; -1 of 5 pages could not be read",
      "No risks found; 2 of 5 pages could not be read.",
      "No risks found;  2 of 5 pages could not be read",
      "No risks found; 2 of 5 pages could be read",
      "Prefix. No risks found; 2 of 5 pages could not be read",
    ]) {
      // Where nothing was found it is the model's own text; on any other outcome it is hidden.
      const trimmed = odd.trim();
      expect(describeCategoryNote(entry("nothing_found", odd))).toEqual({
        kind: "model",
        text: trimmed,
        label: "AI note (unverified)",
      });
      for (const other of ["findings", "search_failed", "skipped"] as const) {
        expect(describeCategoryNote(entry(other, odd))).toBeNull();
      }
    }
  });

  it.each(RETIRED_NOTES)(
    "no longer takes the %s note %j of the earlier search provider as ours",
    (outcome, stored) => {
      // The model's own text where nothing was found, hidden everywhere else.
      expect(describeCategoryNote(entry(outcome, stored))).toEqual(
        outcome === "nothing_found"
          ? { kind: "model", text: stored, label: "AI note (unverified)" }
          : null,
      );
    },
  );

  it.each(FIXED_NOTES)(
    "takes the %s note %j as a fixed sentence for that outcome only",
    (outcome, stored) => {
      for (const other of ALL_OUTCOMES.filter((candidate) => candidate !== outcome)) {
        // Never a sentence of ours; the model's own where nothing was found, hidden elsewhere.
        expect(describeCategoryNote(entry(other, stored))).toEqual(
          other === "nothing_found"
            ? { kind: "model", text: stored, label: "AI note (unverified)" }
            : null,
        );
      }
    },
  );

  it("keeps the text of a model-written note and marks it as unverified", () => {
    expect(
      describeCategoryNote(entry("nothing_found", "  Only marketing pages were indexed.  ")),
    ).toEqual({
      kind: "model",
      text: "Only marketing pages were indexed.",
      label: "AI note (unverified)",
    });
  });

  it("does not touch the markup of a model-written note", () => {
    const note = "<img src=x onerror=alert(1)> **bold**";
    expect(describeCategoryNote(entry("nothing_found", note))).toMatchObject({
      kind: "model",
      text: note,
    });
  });

  it("hides an unknown note on any outcome but nothing found", () => {
    // The same note on a category where nothing was found is the model's own, and is shown.
    expect(
      describeCategoryNote(entry("nothing_found", "Something nobody planned for")),
    ).not.toBeNull();
    for (const outcome of ["findings", "search_failed", "skipped"] as const) {
      expect(describeCategoryNote(entry(outcome, "Something nobody planned for"))).toBeNull();
    }
  });

  it("shows nothing for an empty note, and never throws on odd input", () => {
    expect(describeCategoryNote(entry("nothing_found", "A note"))).not.toBeNull();
    expect(describeCategoryNote(entry("nothing_found", ""))).toBeNull();
    expect(describeCategoryNote(entry("nothing_found", "   "))).toBeNull();
    for (const odd of [null, undefined, {}, { outcome: "nothing_found" }, { note: 5 }]) {
      expect(describeCategoryNote(odd as never)).toBeNull();
    }
    expect(describeCategoryNote({ outcome: "mystery", note: "text" } as never)).toBeNull();
    for (const outcome of ["constructor", "__proto__", "toString"]) {
      expect(describeCategoryNote({ outcome, note: "text" } as never)).toBeNull();
    }
  });
});

describe("labels and the per-category line", () => {
  it("builds the line from the category and the outcome, never from the note", () => {
    expect(describeCategoryLine(entry("nothing_found", "Anything the model wrote"))).toBe(
      "Security incidents: nothing found",
    );
    expect(
      describeCategoryLine(entry("findings", "2 potential risks found", "certifications")),
    ).toBe("Certifications: risks found");
    expect(describeCategoryLine(entry("search_failed", "x", "legal_regulatory"))).toBe(
      "Legal and regulatory: could not be researched",
    );
    expect(describeCategoryLine(entry("skipped", "x", "ai_specific"))).toBe(
      "AI-specific risks: skipped",
    );
  });

  it("labels the four categories, the four outcomes, the five dismissal reasons and the confidences", () => {
    expect(categoryLabel("security_incidents")).toBe("Security incidents");
    expect(categoryLabel("certifications")).toBe("Certifications");
    expect(categoryLabel("legal_regulatory")).toBe("Legal and regulatory");
    expect(categoryLabel("ai_specific")).toBe("AI-specific risks");
    expect(outcomeLabel("findings")).toBe("risks found");
    expect(outcomeLabel("nothing_found")).toBe("nothing found");
    expect(outcomeLabel("search_failed")).toBe("could not be researched");
    expect(outcomeLabel("skipped")).toBe("skipped");
    expect(dismissReasonLabel("not_applicable")).toBe("Not applicable to this vendor");
    expect(dismissReasonLabel("already_covered")).toBe("Already covered by an existing risk");
    expect(dismissReasonLabel("inaccurate")).toBe("Inaccurate or not supported by the sources");
    expect(dismissReasonLabel("accepted_risk")).toBe("Accepted risk");
    expect(dismissReasonLabel("other")).toBe("Other");
    expect(confidenceLabel("low")).toBe("Low");
    expect(confidenceLabel("medium")).toBe("Medium");
    expect(confidenceLabel("high")).toBe("High");
  });

  it("does not render a value it does not know", () => {
    expect(categoryLabel("supply_chain" as never)).toBe("Other");
    expect(outcomeLabel("mystery" as never)).toBe("unknown");
    expect(dismissReasonLabel("mystery" as never)).toBe("Other");
    expect(confidenceLabel("mystery" as never)).toBe("Unknown");
    expect(describeCategoryLine(null as never)).toBe("Other: unknown");
  });
});

describe("formatResearchDate", () => {
  it("writes the day, the short month and the year in the language of the screen", () => {
    expect(formatResearchDate("2026-03-12", "en")).toBe("12 Mar 2026");
    expect(formatResearchDate("2026-03-12T23:59:59.000Z", "en")).toBe("12 Mar 2026");
    expect(formatResearchDate("2026-03-12", "de")).toBe("12. März 2026");
    expect(formatResearchDate("2026-03-12", "fr")).toBe("12 mars 2026");
    expect(formatResearchDate("2026-03-12", "es")).toBe("12 mar 2026");
  });

  it("falls back to English for a language it does not know", () => {
    expect(formatResearchDate("2026-03-12", "xx")).toBe("12 Mar 2026");
  });

  it("gives null for no date, and for one that does not parse", () => {
    expect(formatResearchDate("2026-03-12", "en")).toBe("12 Mar 2026");
    for (const odd of [null, undefined, "", "not a date", 20260312 as never]) {
      expect(formatResearchDate(odd, "en")).toBeNull();
    }
  });
});

describe("translation", () => {
  /** Every key the helpers look up while describing the whole closed sets. */
  const keysRequested = () => {
    const keys = new Set<string>();
    const t = (key: string) => {
      keys.add(key);
      return key;
    };
    for (const [stored] of RUN_ERRORS) describeRunError(stored, t);
    for (const stored of RETIRED_RUN_ERRORS) describeRunError(stored, t);
    describeRunError("unknown", t);
    describeRunError(null, t);
    for (const [outcome, stored] of FIXED_NOTES) describeCategoryNote(entry(outcome, stored), t);
    describeCategoryNote(entry("nothing_found", "A note the model wrote"), t);
    for (const category of [
      "security_incidents",
      "certifications",
      "legal_regulatory",
      "ai_specific",
    ] as const) {
      for (const outcome of ["findings", "nothing_found", "search_failed", "skipped"] as const) {
        describeCategoryLine(entry(outcome, "", category), t);
      }
    }
    for (const reason of [
      "not_applicable",
      "already_covered",
      "inaccurate",
      "accepted_risk",
      "other",
    ] as const) {
      dismissReasonLabel(reason, t);
    }
    for (const confidence of ["low", "medium", "high"] as const) confidenceLabel(confidence, t);
    // What a value the client does not know is shown as.
    categoryLabel("mystery" as never, t);
    outcomeLabel("mystery" as never, t);
    dismissReasonLabel("mystery" as never, t);
    confidenceLabel("mystery" as never, t);
    return [...keys];
  };

  it("looks up the dictionary for the closed sets, so that the check below has something to check", () => {
    expect(keysRequested()).toEqual(
      expect.arrayContaining([
        "The model call timed out.",
        "The web could not be reached from the server.",
        "{category}: {outcome}",
        "AI note (unverified)",
        "Not applicable to this vendor",
      ]),
    );
  });

  it.each(LANGS)("has a %s entry for every sentence and label the helpers can produce", (lang) => {
    const missing = keysRequested().filter((key) => translations[lang][key] === undefined);
    expect(missing).toEqual([]);
  });

  it.each(LANGS)("describes a run error and a category line in %s", (lang) => {
    const t = (key: string) => translations[lang][key] ?? key;
    expect(describeRunError("timed out", t)).toBe(
      translations[lang]["The research run timed out."],
    );
    expect(describeRunError("Model call failed: HTTP 502", t)).toContain("502");
    expect(describeRunError("Model call failed: HTTP 502", t)).not.toContain("{status}");
    expect(describeCategoryLine(entry("nothing_found", ""), t)).not.toBe(
      "Security incidents: nothing found",
    );
    expect(describeCategoryNote(entry("nothing_found", "A note"), t)).toEqual({
      kind: "model",
      text: "A note",
      label: translations[lang]["AI note (unverified)"],
    });
  });

  it.each(LANGS)("fills the counts of the page note into the %s sentence", (lang) => {
    const t = (key: string) => translations[lang][key] ?? key;
    const note = describeCategoryNote(
      entry("nothing_found", "No risks found; 2 of 5 pages could not be read"),
      t,
    );
    expect(note).toMatchObject({ kind: "fixed" });
    const text = note?.text ?? "";
    expect(text).toContain("2");
    expect(text).toContain("5");
    expect(text).not.toContain("{");
    expect(text).not.toBe("No risks were found. 2 of 5 pages could not be read.");
  });

  it("reads the language that is active when no translator is passed", async () => {
    await setLanguage("de");
    try {
      expect(describeRunError("timed out")).toBe(translations.de["The research run timed out."]);
    } finally {
      await setLanguage("en");
    }
  });
});
