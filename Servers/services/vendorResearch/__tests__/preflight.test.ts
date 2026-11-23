import { FetchedPage, PageReadError, PageReader } from "../../webResearch/readPage";
import {
  WebsiteCheck,
  aliasesOf,
  checkWebsite,
  closedHostsOf,
  describeWebsite,
  siteNamesOf,
  verifiedDomainsOf,
} from "../preflight";
import { ResearchTarget } from "../target";

const target: ResearchTarget = {
  name: "Acme Analytics, Inc.",
  domain: "acme-analytics.com",
  provides: "Product analytics",
};

const HOME = "https://acme-analytics.com/";

const page = (overrides: Partial<FetchedPage> = {}): FetchedPage => ({
  url: HOME,
  title: "Acme Analytics - product analytics for teams",
  publishedAt: null,
  text: "Acme Analytics helps product teams understand how people use their software.",
  links: [],
  canonicalUrl: null,
  ...overrides,
});

/** A reader that answers each address from `answers`: a page, or the reason it fails with. */
function readerOf(answers: Record<string, FetchedPage | PageReadError["reason"]>): jest.Mock {
  return jest.fn(async (url: string) => {
    const answer = answers[url];
    if (answer === undefined) throw new PageReadError("unreachable");
    if (typeof answer === "string") throw new PageReadError(answer);
    return answer;
  });
}

describe("checkWebsite", () => {
  it("checks nothing for a vendor without a website", async () => {
    const readPage = jest.fn();

    const check = await checkWebsite({
      target: { ...target, domain: null },
      readPage: readPage as unknown as PageReader,
    });

    expect(check).toEqual({ status: "no_website" });
    expect(readPage).not.toHaveBeenCalled();
  });

  it("reads the home page once, with the signal it was given", async () => {
    const readPage = readerOf({ [HOME]: page() });
    const signal = new AbortController().signal;

    await checkWebsite({ target, readPage, signal });

    expect(readPage).toHaveBeenCalledTimes(1);
    expect(readPage).toHaveBeenCalledWith(HOME, signal);
  });

  describe("a home page that was read", () => {
    it("says whether it names the vendor, by the title or the text", async () => {
      const byTitle = await checkWebsite({
        target,
        readPage: readerOf({ [HOME]: page({ text: "Welcome." }) }),
      });
      const byText = await checkWebsite({
        target,
        readPage: readerOf({ [HOME]: page({ title: "Home", text: "About ACME analytics." }) }),
      });
      const byNeither = await checkWebsite({
        target,
        readPage: readerOf({ [HOME]: page({ title: "Home", text: "Anvils for sale." }) }),
      });

      expect(byTitle).toMatchObject({ status: "readable", namesVendor: true });
      expect(byText).toMatchObject({ status: "readable", namesVendor: true });
      expect(byNeither).toMatchObject({ status: "readable", namesVendor: false });
    });

    it("does not take the domain on a parked page for the vendor's name", async () => {
      const parked = page({
        title: "acme-analytics.com",
        text: "The domain acme-analytics.com is for sale. Make an offer.",
      });

      const check = await checkWebsite({ target, readPage: readerOf({ [HOME]: parked }) });

      expect(check).toMatchObject({ status: "readable", namesVendor: false });
    });

    it("matches the name without the legal form of the record, as a whole word", async () => {
      const longer = page({ title: "Home", text: "Acme Analyticsville is a town." });

      const check = await checkWebsite({ target, readPage: readerOf({ [HOME]: longer }) });

      expect(check).toMatchObject({ namesVendor: false });
    });

    it("offers the links to security, trust, privacy and legal pages on the vendor's domain", async () => {
      const links = [
        { text: "Pricing", url: "https://acme-analytics.com/pricing" },
        { text: "Security", url: "https://acme-analytics.com/security" },
        { text: "Trust center", url: "https://trust.acme-analytics.com/" },
        { text: "Privacy policy", url: "https://acme-analytics.com/privacy" },
        { text: "Security blog", url: "https://elsewhere.example/security" },
      ];

      const check = await checkWebsite({ target, readPage: readerOf({ [HOME]: page({ links }) }) });

      expect(check).toMatchObject({
        status: "readable",
        links: [
          { text: "Security", url: "https://acme-analytics.com/security" },
          { text: "Trust center", url: "https://trust.acme-analytics.com/" },
          { text: "Privacy policy", url: "https://acme-analytics.com/privacy" },
        ],
      });
    });

    it("offers at most twelve links", async () => {
      const links = Array.from({ length: 30 }, (_, index) => ({
        text: `Security ${index}`,
        url: `https://acme-analytics.com/security/${index}`,
      }));

      const check = await checkWebsite({ target, readPage: readerOf({ [HOME]: page({ links }) }) });

      expect(check.status === "readable" && check.links).toHaveLength(12);
    });

    it("keeps the address that answered, and has no redirect to report for the same site", async () => {
      const www = page({ url: "https://www.acme-analytics.com/en/" });

      const check = await checkWebsite({ target, readPage: readerOf({ [HOME]: www }) });

      expect(check).toMatchObject({
        status: "readable",
        url: "https://www.acme-analytics.com/en/",
        redirectedTo: null,
      });
    });

    it("reports the host of a home page that redirects off the vendor's site and does not name the vendor, and offers no links", async () => {
      const elsewhere = page({
        url: "https://other-company.example/",
        title: "Other Company",
        text: "Other Company sells anvils.",
        links: [{ text: "Security", url: "https://acme-analytics.com/security" }],
      });

      const check = await checkWebsite({ target, readPage: readerOf({ [HOME]: elsewhere }) });

      expect(check).toMatchObject({
        status: "readable",
        redirectedTo: "other-company.example",
        alias: null,
        links: [],
      });
    });

    describe("a home page that moved to another domain", () => {
      const moved = (url: string, overrides: Partial<FetchedPage> = {}) =>
        checkWebsite({ target, readPage: readerOf({ [HOME]: page({ url, ...overrides }) }) });

      it("takes the domain it moved to as another name for the vendor's website when it names the vendor and shares its brand", async () => {
        const check = await moved("https://www.acme-analytics.net/en/", {
          links: [
            { text: "Security", url: "https://www.acme-analytics.net/security" },
            { text: "Old security", url: "https://acme-analytics.com/security" },
          ],
        });

        expect(check).toMatchObject({
          status: "readable",
          namesVendor: true,
          redirectedTo: "www.acme-analytics.net",
          alias: "acme-analytics.net",
          links: [{ text: "Security", url: "https://www.acme-analytics.net/security" }],
        });
      });

      it("does the same when the brand grew on the way: acme.com to acme-analytics.com", async () => {
        const grown = await checkWebsite({
          target: { ...target, domain: "acme.com" },
          readPage: readerOf({
            "https://acme.com/": page({ url: "https://www.acme-analytics.com/" }),
          }),
        });
        const sameName = await checkWebsite({
          target: { ...target, name: "Notion Labs, Inc.", domain: "notion.so" },
          readPage: readerOf({
            "https://notion.so/": page({
              url: "https://www.notion.com/",
              title: "Notion",
              text: "Notion Labs: the connected workspace.",
            }),
          }),
        });

        expect(grown).toMatchObject({ alias: "acme-analytics.com" });
        expect(sameName).toMatchObject({ alias: "notion.com" });
      });

      it("does not, when the page it moved to does not name the vendor", async () => {
        const check = await moved("https://www.acme-analytics.net/", {
          title: "Home",
          text: "Welcome to our shop.",
        });

        expect(check).toMatchObject({ redirectedTo: "www.acme-analytics.net", alias: null });
      });

      it("does not, when the domain it moved to has another brand: a social page or a host of many sites is not the vendor's website", async () => {
        for (const url of [
          "https://www.facebook.com/acme",
          "https://acme-analytics.github.io/",
          "https://sites.google.com/view/acme-analytics",
          "https://www.linkedin.com/company/acme-analytics",
        ]) {
          expect(await moved(url)).toMatchObject({ redirectedTo: expect.any(String), alias: null });
        }
      });

      it("reads the brand of a domain that ends in a two-part suffix", async () => {
        const check = await checkWebsite({
          target: { ...target, domain: "acme-analytics.co.uk" },
          readPage: readerOf({
            "https://acme-analytics.co.uk/": page({ url: "https://www.acme-analytics.com/" }),
          }),
        });

        expect(check).toMatchObject({ alias: "acme-analytics.com" });
      });

      it("does not take a brand of under three letters, which shares itself with too many others", async () => {
        const check = await checkWebsite({
          target: { ...target, name: "AI Labs", domain: "ai.com" },
          readPage: readerOf({
            "https://ai.com/": page({
              url: "https://www.ai-world.example/",
              title: "AI Labs",
              text: "AI Labs builds things.",
            }),
          }),
        });

        expect(check).toMatchObject({ alias: null });
      });

      it("has no alias for a home page on the vendor's own domain, www or not", async () => {
        expect(await moved("https://www.acme-analytics.com/en/")).toMatchObject({ alias: null });
        expect(await moved("https://trust.acme-analytics.com/")).toMatchObject({ alias: null });
      });
    });
  });

  describe("what the home page says about its site", () => {
    const identity = (names: string[], products: string[] = []) => ({ names, products });

    it("gives the names the site uses for the vendor and the products it lists, when the page names the vendor", async () => {
      const home = page({
        identity: identity(["Acme Analytics", "AcmeAI", "Globex Corporation"], ["Acme Vault"]),
      });

      const check = await checkWebsite({ target, readPage: readerOf({ [HOME]: home }) });

      expect(check).toMatchObject({
        status: "readable",
        namesVendor: true,
        profile: { names: ["AcmeAI"], products: ["Acme Vault"] },
      });
    });

    it("gives the products even when no name of the site is new", async () => {
      const home = page({ identity: identity(["Acme Analytics"], ["Acme Vault"]) });

      const check = await checkWebsite({ target, readPage: readerOf({ [HOME]: home }) });

      expect(check).toMatchObject({ profile: { names: [], products: ["Acme Vault"] } });
    });

    it("gives nothing when the page does not name the vendor, for the site may be another company's", async () => {
      const home = page({
        title: "Home",
        text: "Anvils for sale.",
        identity: identity(["AcmeAI"], ["Acme Vault"]),
      });

      const check = await checkWebsite({ target, readPage: readerOf({ [HOME]: home }) });

      expect(check).toMatchObject({ status: "readable", namesVendor: false });
      expect(check).not.toHaveProperty("profile");
    });

    it("gives nothing when the page says nothing about itself, or nothing that is the vendor's", async () => {
      const silent = await checkWebsite({ target, readPage: readerOf({ [HOME]: page() }) });
      const strangers = await checkWebsite({
        target,
        readPage: readerOf({ [HOME]: page({ identity: identity(["Globex", "Home"]) }) }),
      });

      expect(silent).not.toHaveProperty("profile");
      expect(strangers).not.toHaveProperty("profile");
    });

    it("gives nothing for a home page that redirects to a site that is not the vendor's, even if it names the vendor", async () => {
      const social = page({
        url: "https://www.linkedin.com/company/acme-analytics",
        identity: identity(["Acme Analytics Fan Page", "AcmeAI"]),
      });

      const check = await checkWebsite({ target, readPage: readerOf({ [HOME]: social }) });

      expect(check).toMatchObject({ redirectedTo: "www.linkedin.com", namesVendor: true });
      expect(check).not.toHaveProperty("profile");
    });

    it("gives them for a home page that moved to another domain of the vendor", async () => {
      const moved = page({
        url: "https://www.acme.com/",
        identity: identity(["Acme", "AcmeAI"], ["Acme Vault"]),
      });

      const check = await checkWebsite({ target, readPage: readerOf({ [HOME]: moved }) });

      expect(check).toMatchObject({ alias: "acme.com", profile: { products: ["Acme Vault"] } });
    });

    it("counts the other names a person gave when it decides whether the page names the vendor", async () => {
      const known = {
        name: "Meta Platforms, Inc.",
        domain: "facebook.com",
        provides: "Social media",
        aliases: ["Facebook"],
      };
      const home = page({
        url: "https://facebook.com/",
        title: "Facebook - log in or sign up",
        text: "Facebook helps you connect and share with the people in your life.",
        identity: identity(["Facebook", "Facebook Lite"]),
      });

      const check = await checkWebsite({
        target: known,
        readPage: readerOf({ "https://facebook.com/": home }),
      });

      expect(check).toMatchObject({
        namesVendor: true,
        // "Facebook" is known already; "Facebook Lite" is built around the brand of the domain.
        profile: { names: ["Facebook Lite"] },
      });
    });
  });

  describe("a home page that cannot be used, on a site that answers", () => {
    it.each(["not_found", "unsupported_type", "needs_javascript"] as const)(
      "is unreadable, not closed, for %s",
      async (reason) => {
        const readPage = readerOf({ [HOME]: reason });

        const check = await checkWebsite({ target, readPage });

        expect(check).toEqual({ status: "unreadable", reason });
        expect(readPage).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe("a site that is closed", () => {
    it.each(["blocked_by_robots", "blocked_by_site", "not_allowed"] as const)(
      "is closed for %s, after one request",
      async (reason) => {
        const readPage = readerOf({ [HOME]: reason });

        const check = await checkWebsite({ target, readPage });

        expect(check).toEqual({ status: "closed", reason });
        expect(readPage).toHaveBeenCalledTimes(1);
      },
    );

    it("is closed when neither the bare domain nor its www form answers", async () => {
      const readPage = readerOf({});

      const check = await checkWebsite({ target, readPage });

      expect(check).toEqual({ status: "closed", reason: "unreachable" });
      expect(readPage.mock.calls.map(([url]) => url)).toEqual([
        HOME,
        "https://www.acme-analytics.com/",
      ]);
    });

    it("is open when only the www form answers, as a site with no record for its bare domain is", async () => {
      const readPage = readerOf({
        "https://www.acme-analytics.com/": page({ url: "https://www.acme-analytics.com/" }),
      });

      const check = await checkWebsite({ target, readPage });

      expect(check).toMatchObject({ status: "readable", url: "https://www.acme-analytics.com/" });
    });

    it("names the more specific reason when the www form fails differently", async () => {
      const readPage = readerOf({ "https://www.acme-analytics.com/": "blocked_by_robots" });

      const check = await checkWebsite({ target, readPage });

      expect(check).toEqual({ status: "closed", reason: "blocked_by_robots" });
    });

    it("does not try the www form of a site that answered with an error of its own", async () => {
      const readPage = readerOf({ [HOME]: "not_found" });

      await checkWebsite({ target, readPage });

      expect(readPage).toHaveBeenCalledTimes(1);
    });
  });

  it("does not let a reader that breaks fail the run: the site is then unchecked", async () => {
    const readPage = jest.fn(async () => {
      throw new TypeError("something else");
    }) as unknown as PageReader;

    const check = await checkWebsite({ target, readPage });

    expect(check).toEqual({ status: "unchecked" });
  });
});

describe("closedHostsOf", () => {
  it("names the bare domain and its www form for a closed site", () => {
    expect(closedHostsOf({ status: "closed", reason: "unreachable" }, target)).toEqual([
      "acme-analytics.com",
      "www.acme-analytics.com",
    ]);
  });

  it("names none for a site that is open, unreadable or unchecked", () => {
    expect(closedHostsOf({ status: "no_website" }, target)).toEqual([]);
    expect(closedHostsOf({ status: "unchecked" }, target)).toEqual([]);
    expect(closedHostsOf({ status: "unreadable", reason: "not_found" }, target)).toEqual([]);
    expect(
      closedHostsOf(
        {
          status: "readable",
          url: HOME,
          namesVendor: true,
          redirectedTo: null,
          alias: null,
          links: [],
        },
        target,
      ),
    ).toEqual([]);
  });

  it("names none for a vendor without a domain", () => {
    expect(
      closedHostsOf({ status: "closed", reason: "unreachable" }, { ...target, domain: null }),
    ).toEqual([]);
  });
});

describe("aliasesOf", () => {
  it("names the domain a home page moved to", () => {
    expect(
      aliasesOf({
        status: "readable",
        url: "https://www.acme-analytics.net/",
        namesVendor: true,
        redirectedTo: "www.acme-analytics.net",
        alias: "acme-analytics.net",
        links: [],
      }),
    ).toEqual(["acme-analytics.net"]);
  });

  it("names none for any other check", () => {
    expect(aliasesOf({ status: "no_website" })).toEqual([]);
    expect(aliasesOf({ status: "unchecked" })).toEqual([]);
    expect(aliasesOf({ status: "closed", reason: "unreachable" })).toEqual([]);
    expect(
      aliasesOf({
        status: "readable",
        url: HOME,
        namesVendor: true,
        redirectedTo: null,
        alias: null,
        links: [],
      }),
    ).toEqual([]);
  });
});

describe("verifiedDomainsOf", () => {
  const readable = (
    overrides: Partial<Extract<WebsiteCheck, { status: "readable" }>> = {},
  ): WebsiteCheck => ({
    status: "readable",
    url: HOME,
    namesVendor: true,
    redirectedTo: null,
    alias: null,
    links: [],
    ...overrides,
  });

  it("is the recorded domain when its home page was read and names the vendor", () => {
    expect(verifiedDomainsOf(readable(), target)).toEqual(["acme-analytics.com"]);
  });

  it("adds the domain the home page moved to when that is the vendor's too", () => {
    expect(
      verifiedDomainsOf(
        readable({
          url: "https://www.acme-analytics.net/",
          redirectedTo: "www.acme-analytics.net",
          alias: "acme-analytics.net",
        }),
        target,
      ),
    ).toEqual(["acme-analytics.com", "acme-analytics.net"]);
  });

  it("is none when the home page does not name the vendor, or moved to another company's domain", () => {
    expect(verifiedDomainsOf(readable({ namesVendor: false }), target)).toEqual([]);
    expect(
      verifiedDomainsOf(
        readable({ url: "https://www.other.example/", redirectedTo: "www.other.example" }),
        target,
      ),
    ).toEqual([]);
  });

  it("is none when the home page could not be read, or there is no website", () => {
    expect(verifiedDomainsOf({ status: "unchecked" }, target)).toEqual([]);
    expect(verifiedDomainsOf({ status: "unreadable", reason: "not_found" }, target)).toEqual([]);
    expect(verifiedDomainsOf({ status: "closed", reason: "unreachable" }, target)).toEqual([]);
    expect(verifiedDomainsOf({ status: "no_website" }, { ...target, domain: null })).toEqual([]);
  });
});

describe("siteNamesOf", () => {
  const readable = (profile?: { names: string[]; products: string[] }): WebsiteCheck => ({
    status: "readable",
    url: HOME,
    namesVendor: true,
    redirectedTo: null,
    alias: null,
    links: [],
    ...(profile === undefined ? {} : { profile }),
  });

  it("names the other names the home page gave the vendor", () => {
    expect(
      siteNamesOf(readable({ names: ["AcmeAI", "Acme Cloud"], products: ["Acme Vault"] })),
    ).toEqual(["AcmeAI", "Acme Cloud"]);
  });

  it("names none for a home page that gave none, and for any other check", () => {
    expect(siteNamesOf(readable())).toEqual([]);
    expect(siteNamesOf({ status: "no_website" })).toEqual([]);
    expect(siteNamesOf({ status: "unchecked" })).toEqual([]);
    expect(siteNamesOf({ status: "unreadable", reason: "not_found" })).toEqual([]);
    expect(siteNamesOf({ status: "closed", reason: "unreachable" })).toEqual([]);
  });
});

describe("describeWebsite", () => {
  const readable = (
    overrides: Partial<Extract<WebsiteCheck, { status: "readable" }>> = {},
  ): WebsiteCheck => ({
    status: "readable",
    url: HOME,
    namesVendor: true,
    redirectedTo: null,
    alias: null,
    links: [],
    ...overrides,
  });

  it("says nothing for a vendor without a website, or a check that did not happen", () => {
    expect(describeWebsite({ status: "no_website" }, target)).toBeNull();
    expect(describeWebsite({ status: "unchecked" }, target)).toBeNull();
  });

  it("says that the home page was read and names the vendor, and lists its links", () => {
    const text = describeWebsite(
      readable({
        links: [
          { text: "Security", url: "https://acme-analytics.com/security" },
          { text: "Privacy policy", url: "https://acme-analytics.com/privacy" },
        ],
      }),
      target,
    );

    expect(text).toContain("acme-analytics.com");
    expect(text).toContain("home page");
    expect(text).toMatch(/names the vendor/);
    expect(text).toContain("- Security - https://acme-analytics.com/security");
    expect(text).toContain("- Privacy policy - https://acme-analytics.com/privacy");
  });

  it("tells the model the names the site uses for the vendor and the products it lists", () => {
    const text = describeWebsite(
      readable({
        profile: { names: ["AcmeAI", "Acme Cloud"], products: ["Acme Vault", "Acme Studio"] },
      }),
      target,
    );

    expect(text).toContain("The site gives these names for itself: AcmeAI, Acme Cloud.");
    expect(text).toContain("Sources may name the vendor by any of them.");
    expect(text).toContain("It lists these products: Acme Vault, Acme Studio.");
  });

  it("tells only what the site gave: names without products, products without names", () => {
    const names = describeWebsite(
      readable({ profile: { names: ["AcmeAI"], products: [] } }),
      target,
    );
    const products = describeWebsite(
      readable({ profile: { names: [], products: ["Acme Vault"] } }),
      target,
    );

    expect(names).toContain("AcmeAI");
    expect(names).not.toMatch(/products/);
    expect(products).toContain("Acme Vault");
    expect(products).not.toMatch(/these names/);
  });

  it("says nothing of names when the site gave none", () => {
    expect(describeWebsite(readable(), target)).not.toMatch(/names for itself|products/);
  });

  it("also tells them for a home page that moved to another domain of the vendor", () => {
    const text = describeWebsite(
      readable({
        redirectedTo: "www.acme.com",
        alias: "acme.com",
        profile: { names: ["AcmeAI"], products: [] },
      }),
      target,
    );

    expect(text).toContain("acme.com");
    expect(text).toContain("AcmeAI");
  });

  it("says when the home page shows no link to a page worth reading", () => {
    expect(describeWebsite(readable(), target)).toMatch(/no link/);
  });

  it("warns that the website may belong to someone else when the home page does not name the vendor", () => {
    const text = describeWebsite(readable({ namesVendor: false }), target);

    expect(text).toMatch(/does not mention the vendor/);
    expect(text).toMatch(/another company/);
    expect(text).not.toMatch(/was read and names the vendor/);
  });

  it("says where a home page that redirects off the site ended up, and that its pages are not the vendor's own", () => {
    const text = describeWebsite(
      readable({ redirectedTo: "other-company.example", namesVendor: false }),
      target,
    );

    expect(text).toContain("other-company.example");
    expect(text).toMatch(/not the vendor's own/);
  });

  it("says that the domain a home page moved to counts as the vendor's website too, and lists the links found there", () => {
    const text = describeWebsite(
      readable({
        url: "https://www.acme-analytics.net/",
        redirectedTo: "www.acme-analytics.net",
        alias: "acme-analytics.net",
        links: [{ text: "Security", url: "https://www.acme-analytics.net/security" }],
      }),
      target,
    );

    expect(text).toContain("redirects to www.acme-analytics.net");
    expect(text).toMatch(/names the vendor/);
    expect(text).toMatch(/acme-analytics\.net counts as the vendor's website too/);
    expect(text).toMatch(/without a search/);
    expect(text).toContain("- Security - https://www.acme-analytics.net/security");
  });

  it("says that a home page that does not exist leaves the other pages possible", () => {
    const text = describeWebsite({ status: "unreadable", reason: "not_found" }, target);

    expect(text).toMatch(/was not found/);
    expect(text).toMatch(/other pages/);
  });

  it("says that a home page built by a script shows no text", () => {
    const text = describeWebsite({ status: "unreadable", reason: "needs_javascript" }, target);

    expect(text).toMatch(/built by a script/);
  });

  it.each([
    ["blocked_by_robots", /robots\.txt/],
    ["blocked_by_site", /refused the request/],
    ["not_allowed", /not a public web address/],
    ["unreachable", /did not answer/],
  ] as const)("says why a closed site is closed (%s) and what to do instead", (reason, why) => {
    const text = describeWebsite({ status: "closed", reason }, target);

    expect(text).toMatch(why);
    expect(text).toMatch(/refused/);
    expect(text).toMatch(/searches/);
  });
});
