import { ResearchTarget } from "../target";
import {
  CREDIBLE_TIERS,
  SOURCE_TIERS,
  SourceTier,
  corroborationOf,
  publisherKey,
  tierOf,
} from "../sourceTiers";

const TARGET: ResearchTarget = { name: "Acme", domain: "acme.com", provides: "Payroll software" };
const NO_DOMAIN: ResearchTarget = { name: "Acme", domain: null, provides: "Payroll software" };

const page = (url: string, onVendorSite = false) => ({ url, onVendorSite });

describe("publisherKey", () => {
  it.each([
    ["https://www.bbc.co.uk/news/a", "bbc"],
    ["https://www.bbc.com/news/a", "bbc"],
    ["https://news.example.com/a", "example"],
    ["https://legal.example.org/a", "example"],
    ["https://acme.com/", "acme"],
    ["https://trust.acme.com/soc2", "acme"],
    ["https://acme.co.uk/", "acme"],
    ["https://www.acme.com.au/", "acme"],
    ["https://WWW.Acme.COM/", "acme"],
    ["https://acme.com:8443/", "acme"],
    ["https://localhost/", "localhost"],
  ])("reads %s as %s", (url, key) => {
    expect(publisherKey(url)).toBe(key);
  });

  it("is null for an address that is not one", () => {
    expect(publisherKey("not a url")).toBeNull();
    expect(publisherKey("")).toBeNull();
  });

  it("takes every tenant of a hosting platform for one publisher, which can only lower a confidence", () => {
    expect(publisherKey("https://acme.github.io/")).toBe("github");
    expect(publisherKey("https://other.github.io/")).toBe("github");
  });
});

describe("tierOf", () => {
  it("is official for a page the research took for the vendor's own, whatever its host", () => {
    expect(tierOf(page("https://acme.com/trust", true), TARGET)).toBe("official");
    expect(tierOf(page("https://trust.acme.com/soc2", true), TARGET)).toBe("official");
    // A page asked for elsewhere that answered from the vendor's site.
    expect(tierOf(page("https://news.example.com/moved", true), TARGET)).toBe("official");
    // Even where the host is an aggregator's, the research's mark is what counts.
    expect(tierOf(page("https://medium.com/acme/post", true), TARGET)).toBe("official");
  });

  it("does not take the vendor's domain for the vendor's own when the research did not mark the page", () => {
    // A page asked for on the vendor's domain that redirected off it.
    expect(tierOf(page("https://acme.com/trust", false), TARGET)).toBe("other");
  });

  it("does not take any page for the vendor's own when the vendor has no domain", () => {
    expect(tierOf(page("https://acme.com/trust", true), NO_DOMAIN)).toBe("other");
  });

  it.each([
    "https://www.ftc.gov/news-events/x",
    "https://www.sec.gov/Archives/edgar/data/1/x.htm",
    "https://www.justice.gov/opa/pr/x",
    "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
    "https://nvd.nist.gov/vuln/detail/CVE-2026-0001",
    "https://www.gov.uk/government/publications/x",
    "https://ico.org.uk/action-weve-taken/enforcement/x",
    "https://www.oaic.gov.au/x",
    "https://www.cnil.fr/fr/x",
    "https://www.economie.gouv.fr/x",
    "https://www.garanteprivacy.it/x",
    "https://www.aepd.es/x",
    "https://www.dataprotection.ie/x",
    "https://www.autoriteitpersoonsgegevens.nl/x",
    "https://www.bfdi.bund.de/x",
    "https://www.cnpd.pt/x",
    "https://www.gov.br/anpd/pt-br/x",
    "https://edpb.europa.eu/news/x",
    "https://eur-lex.europa.eu/legal-content/x",
    "https://www.priv.gc.ca/x",
    "https://www.mext.go.jp/x",
    "https://www.who.int/x",
    "https://www.fca.org.uk/news/x",
    "https://www.courtlistener.com/docket/1/acme-v-example/",
    "https://www.bailii.org/ew/cases/EWHC/Ch/2026/1.html",
    "https://WWW.FTC.GOV/x",
  ])("is regulator_or_court for %s", (url) => {
    expect(tierOf(page(url), TARGET)).toBe("regulator_or_court");
  });

  it.each([
    "https://notgov.com/x",
    "https://gov.example.com/x",
    "https://www.ftc.gov.evil.example/x",
    "https://ftc.gov.example.com/x",
    "https://go.it/x",
    "https://foo.go.it/x",
    "https://mygov.us/x",
    "https://nobund.de/x",
    "https://news.mygov/x",
    "https://news.theint/x",
  ])("is not regulator_or_court for %s: a name is matched whole, at the end of the host", (url) => {
    expect(tierOf(page(url), TARGET)).not.toBe("regulator_or_court");
  });

  it.each([
    "https://news.google.com/articles/x",
    "https://finance.yahoo.com/news/x",
    "https://www.msn.com/en-us/news/x",
    "https://www.reddit.com/r/netsec/comments/x",
    "https://medium.com/@someone/post",
    "https://someone.medium.com/post",
    "https://acme.substack.com/p/x",
    "https://www.linkedin.com/pulse/x",
    "https://x.com/someone/status/1",
    "https://twitter.com/someone/status/1",
    "https://en.wikipedia.org/wiki/Acme",
    "https://news.ycombinator.com/item?id=1",
    "https://www.prnewswire.com/news-releases/x.html",
    "https://www.businesswire.com/news/home/x",
    "https://www.globenewswire.com/news-release/x",
    "https://web.archive.org/web/2026/https://example.com/",
    "https://flipboard.com/@someone/x",
  ])("is aggregator for %s", (url) => {
    expect(tierOf(page(url), TARGET)).toBe("aggregator");
  });

  it.each([
    "https://www.reuters.com/technology/x",
    "https://apnews.com/article/x",
    "https://www.bbc.co.uk/news/x",
    "https://www.bbc.com/news/x",
    "https://www.nytimes.com/2026/01/01/x",
    "https://www.ft.com/content/x",
    "https://www.theguardian.com/technology/x",
    "https://edition.cnn.com/x",
    "https://abcnews.go.com/x",
    "https://www.bloomberg.com/news/x",
    "https://techcrunch.com/2026/01/01/x",
    "https://www.theverge.com/x",
    "https://arstechnica.com/security/x",
    "https://www.wired.com/story/x",
    "https://www.theregister.com/2026/01/01/x",
    "https://www.bleepingcomputer.com/news/security/x/",
    "https://therecord.media/x",
    "https://www.securityweek.com/x",
    "https://www.darkreading.com/x",
    "https://krebsonsecurity.com/2026/01/x/",
    "https://www.lemonde.fr/x",
    "https://www.spiegel.de/x",
    "https://www.heise.de/news/x",
    "https://www.politico.eu/article/x",
    "https://www.euractiv.com/section/x",
  ])("is major_publisher for %s", (url) => {
    expect(tierOf(page(url), TARGET)).toBe("major_publisher");
  });

  it.each([
    "https://news.example.com/a",
    "https://someblog.example.org/x",
    "https://acme-fan.com/x",
    "https://reuters.com.evil.example/x",
    "https://notreuters.com/x",
    "https://myreddit.com/x",
    // A record of Have I Been Pwned is data that others gathered: it is no regulator, and it is
    // not enough alone for a high confidence.
    "https://haveibeenpwned.com/api/v3/breach/Adobe",
  ])("is other for %s: a name is matched whole, at the end of the host", (url) => {
    expect(tierOf(page(url), TARGET)).toBe("other");
  });

  it("is other for an address that is not one", () => {
    expect(tierOf(page("not a url"), TARGET)).toBe("other");
  });

  it("holds five tiers, and only three of them are credible", () => {
    expect([...SOURCE_TIERS].sort()).toEqual(
      ["aggregator", "major_publisher", "official", "other", "regulator_or_court"].sort(),
    );
    expect([...CREDIBLE_TIERS].sort()).toEqual(
      ["major_publisher", "official", "regulator_or_court"].sort(),
    );
    const tiers: SourceTier[] = [...SOURCE_TIERS];
    expect(tiers).toHaveLength(5);
  });
});

describe("corroborationOf", () => {
  it("is nothing for no source", () => {
    expect(corroborationOf([], TARGET)).toEqual({ publishers: 0, credible: false });
  });

  it("counts a publisher once, whatever the domain it writes under", () => {
    expect(
      corroborationOf(
        [page("https://www.bbc.co.uk/news/a"), page("https://www.bbc.com/news/a")],
        TARGET,
      ),
    ).toEqual({ publishers: 1, credible: true });
  });

  it("counts a publisher once, whatever the number of its pages", () => {
    expect(
      corroborationOf(
        [page("https://www.reuters.com/a"), page("https://www.reuters.com/b")],
        TARGET,
      ),
    ).toEqual({ publishers: 1, credible: true });
  });

  it("counts the pages of the vendor's own site as one publisher: the vendor says it once", () => {
    expect(
      corroborationOf(
        [page("https://acme.com/trust", true), page("https://trust.acme.com/soc2", true)],
        TARGET,
      ),
    ).toEqual({ publishers: 1, credible: true });
  });

  it("counts the vendor and an independent publisher as two, when a page of another site shares the vendor's brand label", () => {
    expect(
      corroborationOf(
        [page("https://acme.com/trust", true), page("https://acme.org/news")],
        TARGET,
      ),
    ).toEqual({ publishers: 2, credible: true });
  });

  it("never counts an aggregator as a publisher, so a story and its copy are one", () => {
    expect(
      corroborationOf(
        [page("https://www.reuters.com/a"), page("https://finance.yahoo.com/news/a")],
        TARGET,
      ),
    ).toEqual({ publishers: 1, credible: true });
    expect(
      corroborationOf(
        [page("https://www.reddit.com/r/netsec/comments/a"), page("https://medium.com/@x/a")],
        TARGET,
      ),
    ).toEqual({ publishers: 0, credible: false });
  });

  it("is not credible when every publisher is a tier of no standing", () => {
    expect(
      corroborationOf(
        [page("https://news.example.com/a"), page("https://blog.another.org/b")],
        TARGET,
      ),
    ).toEqual({ publishers: 2, credible: false });
  });

  it("is credible when one of the publishers is, and the others are not", () => {
    expect(
      corroborationOf(
        [page("https://blog.another.org/b"), page("https://www.sec.gov/Archives/x")],
        TARGET,
      ),
    ).toEqual({ publishers: 2, credible: true });
  });

  it("does not count an address it cannot read", () => {
    expect(corroborationOf([page("not a url"), page("https://www.reuters.com/a")], TARGET)).toEqual(
      { publishers: 1, credible: true },
    );
  });

  it("is no corroboration at all when an aggregator stands next to a publisher of no standing", () => {
    expect(
      corroborationOf(
        [page("https://news.google.com/a"), page("https://blog.another.org/b")],
        TARGET,
      ),
    ).toEqual({ publishers: 1, credible: false });
  });
});
