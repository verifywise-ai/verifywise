import { dropDuplicates } from "../dedupe";
import {
  changeKeyOf,
  changeKeysOf,
  forgottenIn,
  keysOfSources,
  splitKnownSources,
} from "../sourceMemory";

const entry = (url: string, extra: Record<string, unknown> = {}) => ({ url, ...extra });

describe("keysOfSources", () => {
  it("gives the key of each source, in order", () => {
    expect(
      keysOfSources([
        entry("https://news.example.com/a"),
        entry("https://www.example.org/b/?utm_source=x"),
      ]),
    ).toEqual(["news.example.com/a", "example.org/b"]);
  });

  it("gives a key once, for sources that name one document", () => {
    expect(
      keysOfSources([
        entry("https://news.example.com/a"),
        entry("http://www.news.example.com/a/"),
        entry("https://news.example.com/b"),
      ]),
    ).toEqual(["news.example.com/a", "news.example.com/b"]);
  });

  it("leaves out an address that has no key, since a memory cannot hold it", () => {
    expect(
      keysOfSources([
        entry("https://127.0.0.1/a"),
        entry("not a url"),
        entry("https://a.example.com/"),
      ]),
    ).toEqual(["a.example.com/"]);
  });

  it("gives nothing for no sources", () => {
    expect(keysOfSources([])).toEqual([]);
  });
});

describe("splitKnownSources", () => {
  const known = new Set(["news.example.com/a", "example.org/b"]);

  it("sets apart the entries whose document was shown to the model before", () => {
    const entries = [
      entry("https://news.example.com/a", { title: "A" }),
      entry("https://news.example.com/new", { title: "New" }),
      entry("https://example.org/b", { title: "B" }),
    ];

    const split = splitKnownSources(entries, known);

    expect(split.fresh).toEqual([entries[1]]);
    expect(split.skipped).toBe(2);
    expect(split.knownKeys).toEqual(["news.example.com/a", "example.org/b"]);
  });

  it("recognises a document by its key, not by the way its address is spelled", () => {
    const entries = [
      entry("http://www.news.example.com/a/"),
      entry("https://news.example.com/a?utm_campaign=mail"),
    ];

    const split = splitKnownSources(entries, known);

    expect(split.fresh).toEqual([]);
    expect(split.skipped).toBe(2);
    // The two spellings are one document: it is named once.
    expect(split.knownKeys).toEqual(["news.example.com/a"]);
  });

  it("keeps the entries in the order they came in, the same object each", () => {
    const entries = [
      entry("https://z.example.com/1"),
      entry("https://news.example.com/a"),
      entry("https://a.example.com/2"),
    ];

    const { fresh } = splitKnownSources(entries, known);

    expect(fresh).toEqual([entries[0], entries[2]]);
    expect(fresh[0]).toBe(entries[0]);
    expect(fresh[1]).toBe(entries[2]);
  });

  // An address with no key is not in any memory, so it cannot be "known": the evidence pack drops it
  // if it is not usable, and a source it can use is analysed.
  it("keeps an entry whose address has no key", () => {
    const entries = [entry("not a url"), entry("https://127.0.0.1/a")];

    const split = splitKnownSources(entries, known);

    expect(split.fresh).toEqual(entries);
    expect(split.skipped).toBe(0);
    expect(split.knownKeys).toEqual([]);
  });

  it("splits nothing when nothing is known", () => {
    const entries = [entry("https://news.example.com/a")];

    expect(splitKnownSources(entries, new Set())).toEqual({
      fresh: entries,
      knownKeys: [],
      skipped: 0,
    });
  });

  it("does not change the entries it is given", () => {
    const entries = [entry("https://news.example.com/a"), entry("https://a.example.com/")];
    const copy = JSON.parse(JSON.stringify(entries));

    splitKnownSources(entries, known);

    expect(entries).toEqual(copy);
  });
});

// RVP-4: a change of a page where the vendor states its terms is remembered under a key of its own.
describe("the key of a change", () => {
  const CHANGE = "https://www.acme.com/legal/privacy/#changed-1a2b3c4d";

  it("is the key of the page and the fragment of the change", () => {
    expect(changeKeyOf(CHANGE)).toBe("acme.com/legal/privacy#changed-1a2b3c4d");
    expect(changeKeyOf("https://acme.com/legal/privacy")).toBeNull();
    expect(changeKeyOf("https://acme.com/legal/privacy#section-2")).toBeNull();
    expect(changeKeyOf("not an address#changed-1a2b3c4d")).toBeNull();
  });

  it("gives the keys of the changes only, each once", () => {
    expect(
      changeKeysOf([entry(CHANGE), entry("https://acme.com/legal/privacy"), entry(CHANGE)]),
    ).toEqual(["acme.com/legal/privacy#changed-1a2b3c4d"]);
  });

  it("sets no source apart: a key of a document has no fragment", () => {
    const known = new Set([changeKeyOf(CHANGE) as string]);

    expect(
      splitKnownSources([entry("https://acme.com/legal/privacy"), entry(CHANGE)], known).skipped,
    ).toBe(0);
  });
});

describe("forgottenIn", () => {
  const CHANGE = "https://acme.com/legal/privacy#changed-1a2b3c4d";

  it("looks a change up by its own key, and any other source by its document", () => {
    const forgotten = forgottenIn(
      new Set(["acme.com/legal/privacy#changed-1a2b3c4d", "reuters.com/acme"]),
    );

    expect(forgotten(CHANGE)).toBe(false);
    expect(forgotten("https://www.reuters.com/acme")).toBe(false);
    expect(forgotten("https://acme.com/legal/privacy#changed-99999999")).toBe(true);
    expect(forgotten("https://acme.com/legal/privacy")).toBe(true);
    expect(forgotten("not an address")).toBe(false);
  });

  // The probe of the finding: a reworded repeat of a stored finding that cites a change shown again.
  it("keeps the same_source rule for a change that a run showed", () => {
    const prior = {
      category: "ai_specific" as const,
      risk_description:
        "The privacy policy now lets Acme use customer content to train its models.",
      impact_description: "Our data could end up in the vendor's models.",
      sources: [{ url: CHANGE, title: "t", quote: "q", published_at: null }],
    };
    const repeat = {
      category: "ai_specific" as const,
      risk_description:
        "Acme added a clause allowing model training on uploaded files unless an opt-out is filed.",
      impact_description: "Confidential documents we upload may be used for machine learning.",
      action_plan: "Ask.",
      likelihood: "Possible" as const,
      risk_severity: "Major" as const,
      risk_level: "High Risk" as const,
      rationale: null,
      sources: [{ url: CHANGE, title: "t", quote: "q", published_at: null }],
    };
    const shown = new Set(["reuters.com/acme", "acme.com/legal/privacy#changed-1a2b3c4d"]);
    const report = { reasons: {} };

    const result = dropDuplicates([repeat], [], [prior], report, new Map(), {
      forgotten: forgottenIn(shown),
    });

    expect(result.kept).toEqual([]);
    expect(report.reasons).toEqual({ same_source: 1 });
    // A change that no run remembers (the caps cut a candidate that cited it) lets it back in.
    expect(
      dropDuplicates([repeat], [], [prior], undefined, new Map(), {
        forgotten: forgottenIn(new Set(["reuters.com/acme"])),
      }).kept,
    ).toHaveLength(1);
  });
});
