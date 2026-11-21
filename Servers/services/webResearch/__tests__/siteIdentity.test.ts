import { MAX_IDENTITY_NAMES, MAX_IDENTITY_PRODUCTS, extractPageIdentity } from "../siteIdentity";

/** JSON as it is written into a page: `<` is escaped, so that no string can close the script. */
const embedded = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
const jsonLd = (data: unknown) => `<script type="application/ld+json">${embedded(data)}</script>`;
const page = (...head: string[]) =>
  `<html><head>${head.join("")}</head><body><h1>Home</h1></body></html>`;

const NOTHING = { names: [], products: [] };

describe("extractPageIdentity", () => {
  it("is nothing for a page that says nothing about itself", () => {
    expect(extractPageIdentity("<html><body><p>Hello</p></body></html>")).toEqual(NOTHING);
    expect(extractPageIdentity("")).toEqual(NOTHING);
  });

  describe("the meta tags", () => {
    it("take the name the site gives itself", () => {
      const html = page('<meta property="og:site_name" content="Acme">');

      expect(extractPageIdentity(html).names).toEqual(["Acme"]);
    });

    it("take the name of the application", () => {
      const html = page('<meta name="application-name" content="Acme Cloud">');

      expect(extractPageIdentity(html).names).toEqual(["Acme Cloud"]);
    });

    it("give the name of the site before the name of the application", () => {
      const html = page(
        '<meta name="application-name" content="Acme Cloud">',
        '<meta property="og:site_name" content="Acme">',
      );

      expect(extractPageIdentity(html).names).toEqual(["Acme", "Acme Cloud"]);
    });

    it("are read in any order of attributes and any case, with their entities decoded", () => {
      const html = page('<META CONTENT="Acme &amp; Sons" PROPERTY=" OG:Site_Name ">');

      expect(extractPageIdentity(html).names).toEqual(["Acme & Sons"]);
    });

    it("count the first of each kind", () => {
      const html = page(
        '<meta property="og:site_name" content="Acme">',
        '<meta property="og:site_name" content="Another Name">',
      );

      expect(extractPageIdentity(html).names).toEqual(["Acme"]);
    });

    it("are read from the first 200 of them only", () => {
      const filler = '<meta name="x" content="y">'.repeat(200);
      const html = page(filler, '<meta property="og:site_name" content="Acme">');

      expect(extractPageIdentity(html).names).toEqual([]);
    });

    it("are passed over when they have no content", () => {
      expect(extractPageIdentity(page('<meta property="og:site_name">')).names).toEqual([]);
      expect(extractPageIdentity(page('<meta property="og:site_name" content="">')).names).toEqual(
        [],
      );
    });
  });

  describe("the organization in structured data", () => {
    it.each([
      "Organization",
      "Corporation",
      "LocalBusiness",
      "NGO",
      "OnlineBusiness",
      "OnlineStore",
      "EducationalOrganization",
      "GovernmentOrganization",
      "MedicalOrganization",
      "NewsMediaOrganization",
      "Airline",
      "Store",
    ])("gives the name, the other names and the legal name of a %s", (type) => {
      const html = page(
        jsonLd({
          "@type": type,
          name: "Acme Analytics",
          legalName: "Acme Analytics Holdings Ltd",
          alternateName: ["Acme", "AcmeAI"],
        }),
      );

      expect(extractPageIdentity(html).names).toEqual([
        "Acme Analytics",
        "Acme",
        "AcmeAI",
        "Acme Analytics Holdings Ltd",
      ]);
    });

    it("takes another name given as one string", () => {
      const html = page(jsonLd({ "@type": "Organization", name: "Acme", alternateName: "AcmeAI" }));

      expect(extractPageIdentity(html).names).toEqual(["Acme", "AcmeAI"]);
    });

    it("takes the nodes of a graph and of a list", () => {
      const html = page(
        jsonLd({
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "WebSite", name: "Acme", url: "https://acme.com/" },
            { "@type": "Organization", legalName: "Acme Analytics Holdings Ltd" },
          ],
        }),
        jsonLd([{ "@type": "Corporation", name: "Acme Cloud" }]),
      );

      expect(extractPageIdentity(html).names).toEqual([
        "Acme",
        "Acme Analytics Holdings Ltd",
        "Acme Cloud",
      ]);
    });

    it("takes a type given as a list, and a type written as an address", () => {
      const html = page(
        jsonLd({ "@type": ["Thing", "Organization"], name: "Acme" }),
        jsonLd({ "@type": "https://schema.org/Corporation", name: "Acme Cloud" }),
        jsonLd({ "@type": "http://schema.org#LocalBusiness", name: "Acme Local" }),
      );

      expect(extractPageIdentity(html).names).toEqual(["Acme", "Acme Cloud", "Acme Local"]);
    });

    it("takes a type whatever its case", () => {
      const html = page(jsonLd({ "@type": "organization", name: "Acme" }));

      expect(extractPageIdentity(html).names).toEqual(["Acme"]);
    });

    it("leaves out what is not the site's own: the organizations it names, people and articles", () => {
      const html = page(
        jsonLd({
          "@type": "Organization",
          name: "Acme",
          parentOrganization: { "@type": "Organization", name: "Globex Holdings" },
          member: [{ "@type": "Organization", name: "Initech" }],
          founder: { "@type": "Person", name: "Jane Doe" },
          brand: { "@type": "Brand", name: "Acme Premium" },
        }),
        jsonLd({ "@type": "Article", name: "Acme breaks news", author: { "@type": "Person" } }),
        jsonLd({ "@type": "Person", name: "Jane Doe" }),
        jsonLd({ "@type": "BreadcrumbList", name: "Trail" }),
      );

      expect(extractPageIdentity(html).names).toEqual(["Acme"]);
    });

    it("is passed over when the script is not JSON, and the others are still read", () => {
      const html = page(
        '<script type="application/ld+json">{ not json</script>',
        jsonLd({ "@type": "Organization", name: "Acme" }),
      );

      expect(extractPageIdentity(html).names).toEqual(["Acme"]);
    });

    it("takes the legal name of an organization, and not that of a site", () => {
      const html = page(
        jsonLd({ "@type": "WebSite", name: "Acme", legalName: "Acme Analytics Holdings Ltd" }),
      );

      expect(extractPageIdentity(html).names).toEqual(["Acme"]);
    });

    it("is not read from a script of another type", () => {
      const html = page(
        `<script type="application/json">${embedded({ "@type": "Organization", name: "Acme" })}</script>`,
      );

      expect(extractPageIdentity(html).names).toEqual([]);
    });
  });

  describe("the products", () => {
    it.each(["Product", "SoftwareApplication", "WebApplication", "MobileApplication", "Service"])(
      "are the names of a %s",
      (type) => {
        const html = page(jsonLd({ "@type": type, name: "Acme Vault" }));

        expect(extractPageIdentity(html)).toEqual({ names: [], products: ["Acme Vault"] });
      },
    );

    it("are read from a graph, next to the organization", () => {
      const html = page(
        jsonLd({
          "@graph": [
            { "@type": "Organization", name: "Acme" },
            { "@type": "SoftwareApplication", name: "Acme Vault", applicationCategory: "Security" },
            { "@type": ["Product", "SoftwareApplication"], name: "Acme Studio" },
          ],
        }),
      );

      expect(extractPageIdentity(html)).toEqual({
        names: ["Acme"],
        products: ["Acme Vault", "Acme Studio"],
      });
    });

    it("are not taken from what a product names inside itself", () => {
      const html = page(
        jsonLd({
          "@type": "Product",
          name: "Acme Vault",
          isRelatedTo: { "@type": "Product", name: "Globex Safe" },
        }),
      );

      expect(extractPageIdentity(html).products).toEqual(["Acme Vault"]);
    });
  });

  describe("what counts as a name", () => {
    it("is trimmed, and its white space and control characters are cleaned", () => {
      const html = page('<meta property="og:site_name" content="  Acme \n  Analytics\u0000 ">');

      expect(extractPageIdentity(html).names).toEqual(["Acme Analytics"]);
    });

    it.each([
      ["nothing", ""],
      ["white space", "   "],
      ["one character", "A"],
      ["a very long text", "Acme ".repeat(17)],
      ["an address", "https://www.acme.com/about"],
      ["an address without a scheme in front", "//acme.com/about"],
      ["markup", "<b>Acme</b>"],
      ["a tagline after a bar", "Acme | Cloud hosting for teams"],
      ["a tagline after a dash", "Acme - Cloud hosting for teams"],
      ["a tagline after a long dash", "Acme \u2013 Cloud hosting for teams"],
      ["a tagline after a colon", "Acme : Cloud hosting for teams"],
      ["a tagline after a bullet", "Acme \u2022 Cloud hosting for teams"],
      ["a bar with no space around it", "Acme|Cloud"],
      ["a sign that opens or closes markup", "Acme &gt; Cloud"],
      ["a number", "12345"],
      ["signs only", "(*) --"],
    ])("is not %s", (_name, content) => {
      const html = page(
        `<meta property="og:site_name" content="${content.replace(/"/g, "&quot;")}">`,
      );

      expect(extractPageIdentity(html).names).toEqual([]);
    });

    it("is a text: a number, a list or an object in the data is passed over", () => {
      const html = page(
        jsonLd({
          "@type": "Organization",
          name: 12345,
          legalName: { "@value": "Acme Ltd" },
          alternateName: ["Acme", 5, null, ["Nested"], { name: "Also nested" }],
        }),
      );

      expect(extractPageIdentity(html).names).toEqual(["Acme"]);
    });

    it("is not markup, also when the data holds it", () => {
      const html = page(
        jsonLd({ "@type": "Organization", name: "<b>Acme</b>", alternateName: "Acme Cloud" }),
      );

      expect(extractPageIdentity(html).names).toEqual(["Acme Cloud"]);
    });

    it("can be two characters or eighty, and not one or eighty-one", () => {
      const named = (name: string) =>
        extractPageIdentity(page(`<meta property="og:site_name" content="${name}">`)).names;

      expect(named("3M")).toEqual(["3M"]);
      expect(named("a".repeat(80))).toEqual(["a".repeat(80)]);
      expect(named("a".repeat(81))).toEqual([]);
      expect(named("A")).toEqual([]);
    });

    it("is kept once, whatever its case, in the order it was found", () => {
      const html = page(
        '<meta property="og:site_name" content="Acme">',
        jsonLd({ "@type": "Organization", name: "ACME", alternateName: ["acme", "Acme Cloud"] }),
      );

      expect(extractPageIdentity(html).names).toEqual(["Acme", "Acme Cloud"]);
    });

    it("can be kept for the most names and products", () => {
      const names = Array.from({ length: MAX_IDENTITY_NAMES + 5 }, (_, n) => `Acme ${n}`);
      const products = Array.from({ length: MAX_IDENTITY_PRODUCTS + 5 }, (_, n) => ({
        "@type": "Product",
        name: `Acme Product ${n}`,
      }));
      const html = page(
        jsonLd({ "@type": "Organization", name: "Acme", alternateName: names }),
        jsonLd(products),
      );

      const identity = extractPageIdentity(html);

      expect(identity.names).toEqual(["Acme", ...names].slice(0, MAX_IDENTITY_NAMES));
      expect(identity.names).toHaveLength(8);
      expect(identity.products).toHaveLength(MAX_IDENTITY_PRODUCTS);
      expect(identity.products).toHaveLength(12);
      expect(identity.products[0]).toBe("Acme Product 0");
    });
  });

  describe("the limits", () => {
    it("visits at most 500 nodes of a script", () => {
      const filler = Array.from({ length: 500 }, () => ({ "@type": "Thing" }));
      const html = page(
        jsonLd({ "@graph": [...filler, { "@type": "Organization", name: "Late Name" }] }),
      );

      expect(extractPageIdentity(html).names).toEqual([]);
    });

    it("visits at most 500 nodes of a script, also when they are in lists inside lists", () => {
      const filler = (count: number) => Array.from({ length: count }, () => ({ "@type": "Thing" }));
      const html = page(
        jsonLd([filler(450), [...filler(100), { "@type": "Organization", name: "Late Name" }]]),
      );

      expect(extractPageIdentity(html).names).toEqual([]);
    });

    it("goes four levels down in a graph, and no further", () => {
      const nested = (levels: number) => {
        let node: unknown = { "@type": "Organization", name: "Deep Name" };
        for (let level = 0; level < levels; level += 1) node = { "@graph": [node] };
        return node;
      };

      expect(extractPageIdentity(page(jsonLd(nested(4)))).names).toEqual(["Deep Name"]);
      expect(extractPageIdentity(page(jsonLd(nested(5)))).names).toEqual([]);
    });

    it("does not read a script of a size no page has, and reads the others", () => {
      const huge = `<script type="application/ld+json">{"name": "${"word ".repeat(400_000)}"}</script>`;
      const html = page(huge, jsonLd({ "@type": "Organization", name: "Acme" }));

      expect(extractPageIdentity(html).names).toEqual(["Acme"]);
    });

    it("is quick on a page of unclosed scripts", () => {
      const html = `<html><head>${'<script type="application/ld+json">'.repeat(50_000)}</head></html>`;

      const started = Date.now();
      const identity = extractPageIdentity(html);

      expect(identity).toEqual(NOTHING);
      expect(Date.now() - started).toBeLessThan(2000);
    });

    it("is not slowed by a graph that nests deeply", () => {
      let deep: unknown = { "@type": "Organization", name: "Too Deep" };
      for (let level = 0; level < 200; level += 1) deep = { "@graph": [deep] };
      const html = page(deep === undefined ? "" : jsonLd(deep));

      const started = Date.now();
      const identity = extractPageIdentity(html);

      expect(identity.names).toEqual([]);
      expect(Date.now() - started).toBeLessThan(2000);
    });
  });
});
