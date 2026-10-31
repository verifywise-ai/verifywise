/**
 * The hygiene of the source registry (spec D3.3 and D6.3): what every entry must hold, and the
 * review dates that age. Adding an entry, or changing one, has to keep this file green.
 */
import {
  REGISTRY,
  REGISTRY_VERSION,
  USER_CONTENT_HOST_LABELS,
  USER_CONTENT_SECTIONS,
} from "../entries";

/**
 * The entries that have no evidence link (Ruling 10 of the M0 plan): the trusted press carried over
 * from today's list, whose own pages could not be read (Q9), then the entries that were read
 * without a link to give or were carried over from today's other lists.
 */
const CARRIED_OVER_PRESS = [
  "apnews",
  "bbc",
  "nytimes",
  "wsj",
  "ft",
  "economist",
  "theguardian",
  "usatoday",
  "latimes",
  "theatlantic",
  "newyorker",
  "cnbc",
  "marketwatch",
  "barrons",
  "politico",
  "euractiv",
  "dw",
  "independent",
  "telegraph",
  "thetimes",
  "smh",
  "straitstimes",
  "thehindu",
  "lemonde",
  "lefigaro",
  "zeit",
  "faz",
  "sueddeutsche",
  "elpais",
  "corriere",
  "repubblica",
  "nrc",
  "theverge",
  "wired",
  "arstechnica",
  "zdnet",
  "cnet",
];
const NO_EVIDENCE = [
  ...CARRIED_OVER_PRESS,
  "heise",
  "gov-unverified",
  "fca",
  "bafin",
  "dpas",
  "uk-courts",
  "bing",
];

const sorted = (values: readonly string[]): string[] => [...values].sort();

/**
 * The whole months from a review date (YYYY-MM-DD) to a moment, in UTC: a month is complete on the
 * same day of the month, so "2026-10-29" is 18 months old on 2028-04-29.
 */
function monthsSince(reviewed: string, now: Date): number {
  const [year, month, day] = reviewed.split("-").map(Number);
  const months = (now.getUTCFullYear() - year) * 12 + (now.getUTCMonth() + 1 - month);
  return now.getUTCDate() < day ? months - 1 : months;
}

/** An entry is due for review at 12 months, and the build fails on one at 18 (spec D3.3, Q18). */
const REVIEW_DUE_MONTHS = 12;
const REVIEW_LIMIT_MONTHS = 18;

describe("the source registry", () => {
  it("holds 110 entries: 22 official, 78 trusted press and 10 unverified", () => {
    const ofCategory = (category: string) =>
      REGISTRY.filter((entry) => entry.category === category).length;
    expect(REGISTRY).toHaveLength(110);
    expect(ofCategory("official")).toBe(22);
    expect(ofCategory("trusted_press")).toBe(78);
    expect(ofCategory("unverified")).toBe(10);
  });

  it("has unique kebab-case ids, and lower-case hosts without a scheme, www. or a leading dot, each in one entry only", () => {
    const ids = REGISTRY.map((entry) => entry.id);
    expect(ids.filter((id) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))).toEqual([]);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);

    expect(REGISTRY.filter((entry) => entry.hosts.length === 0).map((entry) => entry.id)).toEqual(
      [],
    );
    const hosts = REGISTRY.flatMap((entry) => entry.hosts);
    expect(
      hosts.filter(
        (host) => !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(host) || host.startsWith("www."),
      ),
    ).toEqual([]);
    expect(hosts.filter((host, index) => hosts.indexOf(host) !== index)).toEqual([]);
  });

  it("gives every entry a reason, a status of V, P, S or U, and a review date YYYY-MM-DD", () => {
    expect(REGISTRY.filter((entry) => entry.reason.trim() === "").map((entry) => entry.id)).toEqual(
      [],
    );
    expect(
      REGISTRY.filter((entry) => !["V", "P", "S", "U"].includes(entry.status)).map(
        (entry) => entry.id,
      ),
    ).toEqual([]);
    const isDay = (text: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(text) &&
      new Date(`${text}T00:00:00Z`).toISOString().startsWith(text);
    expect(REGISTRY.filter((entry) => !isDay(entry.reviewed)).map((entry) => entry.id)).toEqual([]);
  });

  it("has an https evidence link on every entry except those of NO_EVIDENCE, which have none", () => {
    const without = REGISTRY.filter((entry) => entry.evidence.length === 0).map(
      (entry) => entry.id,
    );
    expect(sorted(without)).toEqual(sorted(NO_EVIDENCE));
    const notHttps = REGISTRY.flatMap((entry) => entry.evidence).filter((link) => {
      try {
        return new URL(link).protocol !== "https:";
      } catch {
        return true;
      }
    });
    expect(notHttps).toEqual([]);
  });

  it("keeps the trusted press of status U to the 37 carried-over publishers", () => {
    const unverifiedPress = REGISTRY.filter(
      (entry) => entry.category === "trusted_press" && entry.status === "U",
    ).map((entry) => entry.id);
    expect(CARRIED_OVER_PRESS).toHaveLength(37);
    expect(sorted(unverifiedPress)).toEqual(sorted(CARRIED_OVER_PRESS));
  });

  it("fails on a review 18 months old or more", () => {
    expect(monthsSince("2026-10-29", new Date("2028-04-29T00:00:00Z"))).toBe(REVIEW_LIMIT_MONTHS);
    expect(monthsSince("2026-10-29", new Date("2028-04-28T23:59:59Z"))).toBe(
      REVIEW_LIMIT_MONTHS - 1,
    );

    const now = new Date();
    const due = REGISTRY.filter((entry) => monthsSince(entry.reviewed, now) >= REVIEW_DUE_MONTHS);
    if (due.length > 0) {
      console.warn(
        `Source registry entries due for review: ${due.map((entry) => entry.id).join(", ")}`,
      );
    }
    expect(
      REGISTRY.filter((entry) => monthsSince(entry.reviewed, now) >= REVIEW_LIMIT_MONTHS).map(
        (entry) => entry.id,
      ),
    ).toEqual([]);
  });

  it("holds the filings of Q26, with their other addresses (sr-3), as entries reviewed on 2026-10-31", () => {
    const byId = (id: string) => REGISTRY.find((entry) => entry.id === id);
    expect(byId("sec")).toMatchObject({
      hosts: ["sec.gov"],
      category: "official",
      downgrade: [
        { pathPrefix: "Archives" },
        { pathPrefix: "ix" },
        { pathPrefix: "ixviewer" },
        { pathPrefix: "cgi-bin/viewer" },
      ],
      status: "V",
      evidence: ["https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data"],
      reviewed: "2026-10-31",
    });
    expect(byId("regulations-gov")).toMatchObject({
      hosts: ["regulations.gov"],
      category: "official",
      downgrade: [{ pathPrefix: "comment" }, { host: "downloads.regulations.gov" }],
      status: "P",
      evidence: ["https://open.gsa.gov/api/regulationsgov/"],
      reviewed: "2026-10-31",
    });
    expect(byId("courtlistener")).toMatchObject({
      downgrade: [
        { host: "storage.courtlistener.com", pathPrefix: "recap" },
        { pathSegments: ["docket", "#", "#"] },
      ],
      reviewed: "2026-10-31",
    });
    expect(byId("courtlistener")?.evidence).toEqual(
      expect.arrayContaining([
        "https://free.law/recap/hacking-recap-links",
        "https://wiki.free.law/c/courtlistener/help/api/rest/v4/pacer-data",
      ]),
    );
    for (const id of ["sec", "regulations-gov", "courtlistener"]) {
      expect(byId(id)?.reason.trim()).not.toBe("");
    }
  });

  it("names the words of G11 and marks the platforms of G6–G9 as user content (Q25)", () => {
    const words = ["community", "forum", "forums", "discuss", "discussions", "answers"];
    expect(USER_CONTENT_HOST_LABELS).toEqual(words);
    expect(USER_CONTENT_SECTIONS).toEqual(words);
    expect(REGISTRY.filter((entry) => entry.userContent).map((entry) => entry.id)).toEqual([
      "blogs",
      "social",
      "forums",
      "wikis-archives",
    ]);
  });

  it("is version sr-4", () => expect(REGISTRY_VERSION).toBe("sr-4"));
});
