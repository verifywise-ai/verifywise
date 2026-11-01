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
 * without a link to give or were carried over from today's other lists. Of the 37 publishers that
 * sr-1 carried over, sr-5 took bbc, theguardian, usatoday, cnbc and smh out: the reading of Q9
 * gave them the pages that were read.
 */
const CARRIED_OVER_PRESS = [
  "apnews",
  "nytimes",
  "wsj",
  "ft",
  "economist",
  "latimes",
  "theatlantic",
  "newyorker",
  "marketwatch",
  "barrons",
  "politico",
  "euractiv",
  "dw",
  "independent",
  "telegraph",
  "thetimes",
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
const NO_EVIDENCE = [...CARRIED_OVER_PRESS, "heise", "fca", "bafin", "dpas", "uk-courts", "bing"];

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
  it("holds 113 entries: 25 official, 77 trusted press and 11 unverified", () => {
    const ofCategory = (category: string) =>
      REGISTRY.filter((entry) => entry.category === category).length;
    expect(REGISTRY).toHaveLength(113);
    expect(ofCategory("official")).toBe(25);
    expect(ofCategory("trusted_press")).toBe(77);
    expect(ofCategory("unverified")).toBe(11);
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

  it("keeps the trusted press of status U to the 32 carried-over publishers", () => {
    const unverifiedPress = REGISTRY.filter(
      (entry) => entry.category === "trusted_press" && entry.status === "U",
    ).map((entry) => entry.id);
    expect(CARRIED_OVER_PRESS).toHaveLength(32);
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

  it("holds the government domains of Q8 (sr-5) as entries reviewed on 2026-10-31", () => {
    const byId = (id: string) => REGISTRY.find((entry) => entry.id === id);
    expect(byId("us-mil")).toMatchObject({
      hosts: ["mil"],
      suffix: true,
      category: "official",
      reason:
        "US Department of Defense: run by the DoD Network Information Center, and its names fall within DoD jurisdiction",
      status: "V",
      evidence: [
        "https://www.iana.org/domains/root/db/mil.html",
        "https://www.rfc-editor.org/rfc/rfc2146.txt",
        "https://get.gov/",
      ],
      reviewed: "2026-10-31",
    });
    expect(byId("gov-sld-q8")).toMatchObject({
      hosts: [
        "gov.br",
        "go.id",
        "go.th",
        "go.tz",
        "gov.sg",
        "gov.my",
        "gov.pk",
        "gob.pk",
        "gov.lk",
        "gov.za",
        "gov.pl",
        "gov.hk",
        "gob.gt",
      ],
      suffix: true,
      category: "official",
      status: "V",
      evidence: [
        "https://registro.br/dominio/categorias/",
        "https://www.cgi.br/resolucoes/documento/2017/031",
        "https://pandi.id/public/files/2024/2/a-pm-232013-pengelolaan-nama-domain-1709175239.pdf",
        "https://pandi.id/public/files/2024/2/a-pm-052015-registrar-nama-domain-instansi-penyelenggara-negara-1709175259.pdf",
        "https://pandi.id/public/files/2024/10/kebijakan-pendaftaran-nama-domain-versi-9-0-bilingual-new-1729151599.pdf",
        "https://www.thnic.co.th/gov",
        "https://www.tcra.go.tz/faq",
        "https://www.iana.org/domains/root/db/tz.html",
        "https://www.sgnic.sg/domain-registration/sg-categories-rules",
        "https://mynic.my/resources/domains/buying-a-domain",
        "https://www.pknic.net.pk/gov-requirements.html",
        "https://www.domains.lk/lk-domain-naming-structure/",
        "https://zadna.org.za/nic-home",
        "https://www.dns.pl/informacje_o_rejestracji_domen_gov_pl",
        "https://www.hkirc.hk/en/our-services-support/domain-services/eligibility-required-documents/",
        "https://www.gt/sitio/registration_policy.php?lang=en",
      ],
      reviewed: "2026-10-31",
    });
    expect(byId("gov-de-facto-q8")).toMatchObject({
      hosts: ["gc.ca", "gov.de"],
      suffix: true,
      category: "official",
      status: "V",
      evidence: [
        "https://www.canada.ca/en/government/system/digital-government/policies-standards/enterprise-it-service-common-configurations/dns.html",
        "https://rdap.ca.fury.ca/rdap/domain/gc.ca",
        "https://design.canada.ca/specifications/mandatory-elements/domains-urls.html",
        "https://dachmarke.gov.de/",
      ],
      reviewed: "2026-10-31",
    });
    expect(byId("gov-held")).toMatchObject({
      hosts: ["bund.de", "gov.fi"],
      suffix: true,
      category: "official",
      status: "P",
      evidence: [
        "https://verwaltung.bund.de/portal/EN/impressum",
        "https://www.bund.de/",
        "https://rdap.fi/rdap/rdap/domain/gov.fi",
      ],
      reviewed: "2026-10-31",
    });
    expect(byId("gov-co")).toMatchObject({
      hosts: ["gov.co"],
      suffix: true,
      category: "official",
      reason:
        "Restricted .CO name for Colombian institutions, registered on supporting documents (operator Puntoco); government-only is not stated",
      status: "P",
      evidence: ["https://www.registrocolombia.co/"],
      reviewed: "2026-10-31",
    });
    for (const id of ["us-mil", "gov-sld-q8", "gov-de-facto-q8", "gov-held", "gov-co"]) {
      expect(byId(id)?.reason.trim()).not.toBe("");
    }
  });

  it("keeps the older government entries apart, so that their review dates are not reset", () => {
    const byId = (id: string) => REGISTRY.find((entry) => entry.id === id);
    expect(byId("gov-sld")).toMatchObject({
      hosts: ["gov.au", "gov.in", "gob.es", "gob.mx", "go.jp", "go.kr"],
      reviewed: "2026-10-29",
    });
    expect(byId("gov-de-facto")).toMatchObject({
      hosts: ["admin.ch", "canada.ca", "gv.at"],
      reviewed: "2026-10-29",
    });
  });

  it("has no entry that matches by a pattern, and none for the hosts that Q8 dropped", () => {
    expect(REGISTRY.find((entry) => entry.id === "gov-unverified")).toBeUndefined();
    expect(REGISTRY.filter((entry) => "pattern" in entry).map((entry) => entry.id)).toEqual([]);
    const hosts = REGISTRY.flatMap((entry) => entry.hosts);
    expect(
      ["govt.nz", "go.ke", "go.ug", "gov.ug", "gov.ie"].filter((host) => hosts.includes(host)),
    ).toEqual([]);
  });

  it("holds the general press of Q9 (sr-5) as entries reviewed on 2026-10-31", () => {
    const byId = (id: string) => REGISTRY.find((entry) => entry.id === id);
    // Whole entries, so that no flag or rule outside the ruling's table can slip in.
    expect(byId("bbc")).toEqual({
      id: "bbc",
      hosts: ["bbc.com", "bbc.co.uk"],
      category: "trusted_press",
      publisher: "BBC",
      reason:
        "News pages link to an editorial complaints route and the BBC's editorial guidelines, and name a publishing-principles page; the guidelines themselves could not be read",
      status: "P",
      evidence: ["https://www.bbc.co.uk/news/articles/c629pny4gl7o"],
      reviewed: "2026-10-31",
    });
    expect(byId("theguardian")).toEqual({
      id: "theguardian",
      hosts: ["theguardian.com"],
      category: "trusted_press",
      publisher: "The Guardian",
      downgrade: [{ pathSegment: "commentisfree" }],
      reason:
        "GNM editorial code: significant errors are corrected promptly through the readers' editor, the code binds external contributors too, and commercial teams make paid content; Opinion sits under /commentisfree",
      status: "V",
      // The code only: theguardian.com bars Claude-User, so its article q9 cited is not evidence.
      evidence: [
        "https://uploads.guim.co.uk/2026/03/03/Editorial_Code_of_Practice_Guidelines_March2026.pdf",
      ],
      reviewed: "2026-10-31",
    });
    expect(byId("usatoday")).toEqual({
      id: "usatoday",
      hosts: ["usatoday.com"],
      category: "trusted_press",
      publisher: "USA TODAY",
      reason:
        "USA TODAY NETWORK ethical principles for newsrooms: accuracy, fairness and independence; errors are corrected promptly and transparently; advertising is kept apart from editorial content",
      status: "V",
      evidence: ["https://cm.marconews.com/ethical-conduct/"],
      reviewed: "2026-10-31",
    });
    expect(byId("cnbc")).toEqual({
      id: "cnbc",
      hosts: ["cnbc.com"],
      category: "trusted_press",
      publisher: "CNBC",
      downgrade: [{ pathSegment: "advertorial" }, { pathSegment: "guest-blog" }],
      reason:
        "Publishes correction notices under 'CNBC News Corrections', linked from every footer; advertorials are labelled paid posts made without the editorial staff",
      status: "V",
      evidence: [
        "https://www.cnbc.com/correction-where-big-money-investors-are-putting-their-fixed-income-dollars/",
        "https://www.cnbc.com/corrections/",
        "https://www.cnbc.com/advertorial/2022/02/17/understanding-the-value-of-branded-content.html",
        "https://www.cnbc.com/guest-blog/",
      ],
      reviewed: "2026-10-31",
    });
    expect(byId("smh")).toEqual({
      id: "smh",
      hosts: ["smh.com.au"],
      category: "trusted_press",
      reason:
        "Nine's governance page: Nine observes the Charter of Editorial Independence for its mastheads, The Sydney Morning Herald among them, and its Metro Publishing business is a member of the Press Council of Australia",
      status: "V",
      evidence: ["https://www.nineforbrands.com.au/governance/"],
      reviewed: "2026-10-31",
    });
    expect(byId("bloomberg")).toEqual({
      id: "bloomberg",
      hosts: ["bloomberg.com"],
      category: "trusted_press",
      downgrade: [{ pathSegment: "sponsor" }, { pathSegment: "sponsors" }],
      reason:
        "A standards inbox for corrections; The Bloomberg Way guide for reporters and editors (search summary only)",
      status: "S",
      evidence: [
        "https://www.bloomberg.com/help/question/submit-feedback-news-coverage/",
        "https://www.bloomberg.com/robots.txt",
      ],
      reviewed: "2026-10-31",
    });
    expect(byId("washingtonpost")).toEqual({
      id: "washingtonpost",
      hosts: ["washingtonpost.com"],
      category: "trusted_press",
      downgrade: [{ pathSegment: "creativegroup" }],
      reason:
        "Policies and standards: every error is corrected and the correction says what was wrong (search summary only)",
      status: "S",
      evidence: [
        "https://www.washingtonpost.com/policies-and-standards/",
        "https://www.washingtonpost.com/robots.txt",
      ],
      reviewed: "2026-10-31",
    });
    expect(byId("forbes")).toEqual({
      id: "forbes",
      hosts: ["forbes.com"],
      category: "trusted_press",
      downgrade: [
        { pathPrefix: "sites", unless: "sites/forbesstaff" },
        { host: "councils.forbes.com" },
        { pathSegment: "councils" },
        { pathSegment: "advisor" },
        { pathSegment: "vetted" },
      ],
      reason:
        "Editorial values and standards: corrections when warranted, fact-checking, rules binding staff and contributors; BrandVoice, Councils, Advisor and Vetted listed as partner content",
      status: "V",
      evidence: [
        "https://www.forbes.com/sites/forbesstaff/article/forbes-editorial-values-and-standards/",
        "https://councils.forbes.com/",
        "https://www.forbes.com/robots.txt",
      ],
      reviewed: "2026-10-31",
    });
    expect(byId("cbc")).toEqual({
      id: "cbc",
      hosts: ["cbc.ca"],
      category: "trusted_press",
      reason:
        "CBC/Radio-Canada Journalistic Standards and Practices: significant errors are corrected promptly, with an explanatory note on the story page online",
      status: "V",
      evidence: [
        "https://cbc.radio-canada.ca/en/vision/governance/journalistic-standards-and-practices/corrections",
      ],
      reviewed: "2026-10-31",
    });
  });

  it("holds the security press of Q9 (sr-5), with The Hacker News moved to the unverified, reviewed on 2026-10-31", () => {
    const byId = (id: string) => REGISTRY.find((entry) => entry.id === id);
    expect(byId("darkreading")).toEqual({
      id: "darkreading",
      hosts: ["darkreading.com"],
      category: "trusted_press",
      reason:
        "Owner Informa TechTarget's editorial page: its editorial content, Dark Reading's network included, is vendor-neutral and apart from business ties; corrections not stated",
      status: "P",
      evidence: [
        "https://www.informatechtarget.com/editorial/",
        "https://www.darkreading.com/about-us",
      ],
      reviewed: "2026-10-31",
    });
    expect(byId("scworld")).toEqual({
      id: "scworld",
      hosts: ["scworld.com"],
      category: "trusted_press",
      downgrade: [{ pathSegment: "perspective" }],
      reason:
        "Owner CyberRisk Alliance's editorial policy: errors are corrected promptly and openly, sponsored content is clearly identified; outside contributors write Perspectives",
      status: "V",
      evidence: [
        "https://cyberriskalliance.com/editorial-policy",
        "https://www.cyberriskalliance.com/why-cra",
        "https://www.cyberriskalliance.com/",
        "https://www.scworld.com/contribute",
      ],
      reviewed: "2026-10-31",
    });
    // No standards or corrections page was seen, so it is no trusted press. It keeps no downgrade
    // rule either: an unverified entry has nothing to be lowered from.
    expect(byId("thehackernews")).toEqual({
      id: "thehackernews",
      hosts: ["thehackernews.com"],
      category: "unverified",
      reason:
        "No standards or corrections page seen; a search summary shows partner-contributed and sponsored articles; the site blocks automated readers",
      status: "S",
      evidence: [
        "https://thehackernews.com/p/about-us.html",
        "https://thehackernews.com/robots.txt",
      ],
      reviewed: "2026-10-31",
    });
  });

  it("leaves npr, cnn, cnet, axios and spiegel, and the 31 other carried-over publishers, as sr-4 had them", () => {
    const byId = (id: string) => REGISTRY.find((entry) => entry.id === id);
    // The ruling of 2026-10-31 keeps these, whatever q9 says of them.
    expect(byId("npr")).toMatchObject({
      category: "trusted_press",
      status: "S",
      evidence: ["https://www.npr.org/ethics"],
      reviewed: "2026-10-29",
    });
    expect(byId("cnn")).toMatchObject({
      category: "trusted_press",
      status: "S",
      reviewed: "2026-10-29",
    });
    expect(byId("cnet")).toMatchObject({
      category: "trusted_press",
      status: "U",
      reason: "Carried over",
      evidence: [],
      reviewed: "2026-10-29",
    });
    expect(byId("axios")).toMatchObject({ category: "trusted_press", status: "S" });
    expect(byId("spiegel")).toMatchObject({ category: "trusted_press", status: "S" });
    for (const id of ["axios", "spiegel"]) expect(byId(id)?.reviewed).toBe("2026-10-29");

    const changed = CARRIED_OVER_PRESS.filter((id) => {
      const entry = byId(id);
      return (
        entry === undefined ||
        entry.category !== "trusted_press" ||
        entry.status !== "U" ||
        entry.reviewed !== "2026-10-29" ||
        !entry.reason.startsWith("Carried over") ||
        entry.evidence.length > 0
      );
    });
    expect(changed).toEqual([]);
  });

  it("cites no page of npr.org or theguardian.com as a page that was read (the ruling of 2026-10-31)", () => {
    // npr.org bars every Claude agent and theguardian.com bars Claude-User, so a page of either can
    // be known from a search summary at best (status S) and never be one that was read (V or P).
    const barring = ["npr.org", "theguardian.com"];
    const isOnBarring = (link: string): boolean => {
      try {
        const host = new URL(link).hostname;
        return barring.some((domain) => host === domain || host.endsWith(`.${domain}`));
      } catch {
        return false;
      }
    };
    expect(
      REGISTRY.filter(
        (entry) =>
          (entry.status === "V" || entry.status === "P") && entry.evidence.some(isOnBarring),
      ).map((entry) => entry.id),
    ).toEqual([]);
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

  it("is version sr-5", () => expect(REGISTRY_VERSION).toBe("sr-5"));
});
