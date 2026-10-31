import { keysOfSources, splitKnownSources } from "../sourceMemory";

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
