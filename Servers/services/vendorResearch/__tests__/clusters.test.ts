import type { EvidenceSource } from "../../../domain.layer/interfaces/i.vendorResearch";
import {
  EVENT_TEXT_CHARS,
  EVENT_WINDOW_DAYS,
  clusterSources,
  eventIdsByUrl,
  eventKindsOf,
} from "../clusters";

let counter = 0;

/** A source, dated by default, with an address of its own. */
function source(overrides: Partial<EvidenceSource> = {}): EvidenceSource {
  counter += 1;
  return {
    id: `S${counter}`,
    category: "security_incidents",
    kind: "result",
    onVendorSite: false,
    url: `https://news.example/${counter}`,
    title: "Acme news",
    content: "Something about Acme.",
    publishedAt: "2026-09-10",
    ...overrides,
  };
}

/** The pack of the sources, numbered S1, S2, ... as a real pack is. */
const packOf = (...sources: EvidenceSource[]): EvidenceSource[] =>
  sources.map((one, index) => ({ ...one, id: `S${index + 1}` }));

const idsOf = (pack: EvidenceSource[]) =>
  clusterSources(pack).map((cluster) => [cluster.id, cluster.sourceIds]);

describe("the constants of an event", () => {
  it("is three weeks long and read from the start of a text", () => {
    expect(EVENT_WINDOW_DAYS).toBe(21);
    expect(EVENT_TEXT_CHARS).toBe(300);
  });
});

describe("eventKindsOf", () => {
  const kinds = (title: string, content = "") => [...eventKindsOf({ title, content })].sort();

  it.each([
    ["Acme confirms ransomware attack", ["intrusion"]],
    ["Customer data leaked after Acme breach", ["intrusion"]],
    ["Hackers stole files from Acme", ["intrusion"]],
    ["Acme services down: a four day outage", ["outage"]],
    ["Acme went offline", ["outage"]],
    ["Acme sued in a class action", ["lawsuit"]],
    ["Acme agrees to settlement", ["lawsuit"]],
    ["Acme fined 2 million by the regulator", ["enforcement"]],
    ["Penalty for Acme after an investigation", ["enforcement"]],
  ])("reads the kind of %s", (title, expected) => {
    expect(kinds(title)).toEqual(expected);
  });

  it("reads several kinds from one text, and none from a text about nothing in particular", () => {
    expect(kinds("Acme offline after ransomware attack")).toEqual(["intrusion", "outage"]);
    expect(kinds("Acme opens a new office")).toEqual([]);
  });

  it("ignores case and matches whole words only", () => {
    expect(kinds("RANSOMWARE hits Acme")).toEqual(["intrusion"]);
    expect(kinds("Acme has a fine print")).toEqual([]);
    expect(kinds("The hackathon of Acme")).toEqual([]);
    expect(kinds("Acme leaders speak")).toEqual([]);
  });

  it("reads the title and the start of the text, no more", () => {
    const deep = `${"x ".repeat(EVENT_TEXT_CHARS)}ransomware`;

    expect(kinds("Acme news", "A ransomware attack hit Acme.")).toEqual(["intrusion"]);
    expect(kinds("Acme news", deep)).toEqual([]);
  });
});

describe("clusterSources", () => {
  it("makes one event of dated sources that report the same kind of event within the window", () => {
    const pack = packOf(
      source({
        title: "Acme services down after ransomware attack",
        publishedAt: "2026-07-14",
      }),
      source({ title: "A calm day at the office" }),
      source({
        category: "legal_regulatory",
        title: "Acme tells regulator about ransomware attack",
        publishedAt: "2026-07-16T09:30:00.000Z",
      }),
    );

    expect(idsOf(pack)).toEqual([["E1", ["S1", "S3"]]]);
  });

  it("does not join sources more than the window apart, counted from the first of the event", () => {
    const attack = (publishedAt: string) =>
      source({ title: "Acme ransomware attack", publishedAt });

    // 1 September, 15 September and 29 September: the last is 28 days after the first.
    const pack = packOf(attack("2026-09-01"), attack("2026-09-15"), attack("2026-09-29"));

    expect(idsOf(pack)).toEqual([["E1", ["S1", "S2"]]]);
  });

  it("joins a source exactly a window after the first", () => {
    const attack = (publishedAt: string) =>
      source({ title: "Acme ransomware attack", publishedAt });

    expect(idsOf(packOf(attack("2026-09-01"), attack("2026-09-22")))).toEqual([
      ["E1", ["S1", "S2"]],
    ]);
    expect(idsOf(packOf(attack("2026-09-01"), attack("2026-09-23")))).toEqual([]);
  });

  it("keeps sources of different kinds apart", () => {
    const pack = packOf(
      source({ title: "Acme ransomware attack" }),
      source({ title: "Acme sued in a class action" }),
      source({ title: "Acme fined by the regulator" }),
    );

    expect(idsOf(pack)).toEqual([]);
  });

  it("never joins a source that has no date, nor one whose date is not a date", () => {
    const pack = packOf(
      source({ title: "Acme ransomware attack" }),
      source({ title: "Acme ransomware attack", publishedAt: null }),
      source({ title: "Acme ransomware attack", publishedAt: "last spring" }),
    );

    expect(idsOf(pack)).toEqual([]);
  });

  it("groups sources of different categories and of both kinds", () => {
    const pack = packOf(
      source({ title: "Acme ransomware attack", kind: "result" }),
      source({
        category: "legal_regulatory",
        kind: "page",
        title: "Ransomware attack on Acme systems",
      }),
    );

    expect(idsOf(pack)).toEqual([["E1", ["S1", "S2"]]]);
  });

  it("reads a page of the vendor's own site by its title alone", () => {
    const notice = source({
      onVendorSite: true,
      kind: "page",
      title: "Security incident of 20 September",
      content: "We detected a ransomware attack.",
    });
    const trust = source({
      onVendorSite: true,
      kind: "page",
      title: "Trust centre",
      content: "How to report a ransomware attack or a breach to us.",
    });

    expect(idsOf(packOf(source({ title: "Acme confirms a breach" }), notice, trust))).toEqual([
      ["E1", ["S1", "S2"]],
    ]);
  });

  it("links sources that name the same vulnerability, whatever their dates, and not those that name another", () => {
    const pack = packOf(
      source({ title: "Acme patches CVE-2026-1234", publishedAt: "2026-02-01" }),
      source({ title: "Exploits of Acme", content: "See CVE-2026-1234.", publishedAt: null }),
      source({ title: "Acme patches CVE-2026-9999", publishedAt: "2026-02-02" }),
    );

    expect(idsOf(pack)).toEqual([["E1", ["S1", "S2"]]]);
  });

  it("numbers the events by the place of their first source in the pack, and lists the sources in the pack's order", () => {
    const pack = packOf(
      source({ title: "Acme sued", publishedAt: "2026-03-10" }),
      source({ title: "Acme ransomware attack", publishedAt: "2026-06-01" }),
      source({ title: "Acme class action", publishedAt: "2026-03-12" }),
      source({ title: "Ransomware attack on Acme", publishedAt: "2026-06-02" }),
    );

    expect(idsOf(pack)).toEqual([
      ["E1", ["S1", "S3"]],
      ["E2", ["S2", "S4"]],
    ]);
  });

  it("is the same whichever order the pack lists the same sources in dates", () => {
    const early = source({ title: "Acme ransomware attack", publishedAt: "2026-09-01" });
    const middle = source({ title: "Acme ransomware attack", publishedAt: "2026-09-12" });
    const late = source({ title: "Acme ransomware attack", publishedAt: "2026-09-25" });

    const forward = clusterSources(packOf(early, middle, late));
    const backward = clusterSources(packOf(late, middle, early));

    // Counted from the earliest source, so the late one is out of the event either way.
    expect(forward.map((cluster) => cluster.sourceIds)).toEqual([["S1", "S2"]]);
    expect(backward.map((cluster) => cluster.sourceIds)).toEqual([["S2", "S3"]]);
  });

  it("is empty for an empty pack, and gives no event to a single source", () => {
    expect(clusterSources([])).toEqual([]);
    expect(clusterSources(packOf(source({ title: "Acme ransomware attack" })))).toEqual([]);
  });

  it("does not change the pack it is given", () => {
    const pack = packOf(
      source({ title: "Acme ransomware attack" }),
      source({ title: "Acme ransomware attack" }),
    );
    const before = JSON.stringify(pack);

    clusterSources(pack);

    expect(JSON.stringify(pack)).toBe(before);
  });
});

describe("eventIdsByUrl", () => {
  it("maps the address of every source of an event to the event, and no other", () => {
    const pack = packOf(
      source({ title: "Acme ransomware attack", url: "https://a.example/1" }),
      source({ title: "Acme sued", url: "https://b.example/2" }),
      source({ title: "Ransomware attack on Acme", url: "https://c.example/3" }),
    );

    const ids = eventIdsByUrl(clusterSources(pack), pack);

    expect([...ids]).toEqual([
      ["https://a.example/1", "E1"],
      ["https://c.example/3", "E1"],
    ]);
  });
});
