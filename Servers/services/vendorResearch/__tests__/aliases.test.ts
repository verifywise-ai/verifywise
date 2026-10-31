import { MAX_ALIASES, MAX_ALIAS_CHARS, parseOtherNames, profileOf, withAliases } from "../aliases";
import { ResearchTarget } from "../target";

const target = (overrides: Partial<ResearchTarget> = {}): ResearchTarget => ({
  name: "Acme Analytics, Inc.",
  domain: "acme-analytics.com",
  provides: "Product analytics",
  ...overrides,
});

describe("parseOtherNames", () => {
  it("splits on commas, semicolons and line breaks, and trims each name", () => {
    expect(parseOtherNames("Facebook, Instagram;  WhatsApp\nMeta Quest\r\n Messenger ")).toEqual([
      "Facebook",
      "Instagram",
      "WhatsApp",
      "Meta Quest",
      "Messenger",
    ]);
  });

  it("collapses the white space inside a name and drops control characters", () => {
    expect(parseOtherNames("Meta   Quest,  Insta\u0000gram")).toEqual(["Meta Quest", "Instagram"]);
  });

  it.each([[null], [undefined], [""], ["   "], [" , ; ,\n"]])("is no names for %p", (text) => {
    expect(parseOtherNames(text)).toEqual([]);
  });

  it("keeps a name once, whatever its case, spacing or punctuation", () => {
    expect(parseOtherNames("Facebook, FACEBOOK, face-book, Face Book, Instagram")).toEqual([
      "Facebook",
      "Instagram",
    ]);
  });

  it("drops a name that is too short, too long or has no letter or digit in it", () => {
    const tooLong = "x".repeat(MAX_ALIAS_CHARS + 1);
    const justRight = "y".repeat(MAX_ALIAS_CHARS);

    expect(parseOtherNames(`A, ${tooLong}, ${justRight}, --, (), 3M`)).toEqual([justRight, "3M"]);
  });

  it("keeps at most as many names as a vendor may have", () => {
    const text = Array.from({ length: MAX_ALIASES + 4 }, (_, n) => `Name ${n}`).join(", ");

    expect(parseOtherNames(text)).toHaveLength(MAX_ALIASES);
    expect(parseOtherNames(text)[0]).toBe("Name 0");
  });
});

describe("withAliases", () => {
  it("adds the names after the ones the target has", () => {
    const added = withAliases(target({ aliases: ["Acme"] }), ["AcmeAI", "Acme Cloud"]);

    expect(added.aliases).toEqual(["Acme", "AcmeAI", "Acme Cloud"]);
  });

  it("leaves out the name of the vendor, its name without the legal form, and repeats", () => {
    const added = withAliases(target({ aliases: ["Acme"] }), [
      "Acme Analytics, Inc.",
      "ACME ANALYTICS",
      "acme",
      "AcmeAI",
      "AcmeAI",
      "  ",
    ]);

    expect(added.aliases).toEqual(["Acme", "AcmeAI"]);
  });

  it("gives the target itself back when there is nothing to add", () => {
    const plain = target();
    const withOne = target({ aliases: ["Acme"] });

    expect(withAliases(plain, [])).toBe(plain);
    expect(withAliases(plain, ["Acme Analytics", "  "])).toBe(plain);
    expect(withAliases(withOne, ["acme", "Acme Analytics"])).toBe(withOne);
    expect(withAliases(plain, [])).not.toHaveProperty("aliases");
  });

  it("does not change the target it is given", () => {
    const plain = target();

    const added = withAliases(plain, ["Acme"]);

    expect(plain).not.toHaveProperty("aliases");
    expect(added).not.toBe(plain);
    expect(added).toMatchObject({ name: plain.name, domain: plain.domain });
  });

  it("keeps at most as many names as a vendor may have", () => {
    const names = Array.from({ length: MAX_ALIASES + 3 }, (_, n) => `Name ${n}`);

    const added = withAliases(target(), names);

    expect(added.aliases).toEqual(names.slice(0, MAX_ALIASES));
  });
});

describe("profileOf", () => {
  const identity = (names: string[], products: string[] = []) => ({ names, products });

  it("is empty for a page that says nothing about itself", () => {
    expect(profileOf(undefined, target())).toEqual({ names: [], products: [] });
  });

  it("keeps the names that are built around the brand of the vendor: its name or its domain", () => {
    const profile = profileOf(
      identity(["Acme Analytics Holdings Ltd", "AcmeAI", "Acme-Analytics Cloud"]),
      target(),
    );

    expect(profile.names).toEqual([
      "Acme Analytics Holdings Ltd",
      "AcmeAI",
      "Acme-Analytics Cloud",
    ]);
  });

  it("leaves out names that have nothing to do with the vendor", () => {
    const profile = profileOf(
      identity(["Home", "Welcome", "Analytics", "Globex Corporation", "Log in"]),
      target(),
    );

    expect(profile.names).toEqual([]);
  });

  it("takes the name of a vendor that is known by another brand, through its domain", () => {
    const profile = profileOf(
      identity(["Facebook", "Meta", "Instagram"]),
      target({ name: "Meta Platforms, Inc.", domain: "facebook.com" }),
    );

    // "Meta" is only a part of the recorded name, and so is left out (see the next test).
    expect(profile.names).toEqual(["Facebook"]);
  });

  it("leaves out a name that is only a part of the vendor's name, unless it is the brand of its domain", () => {
    const part = identity(["Acme", "Analytics"]);

    // "Acme" alone could be any of the companies that start with it.
    expect(profileOf(part, target()).names).toEqual([]);
    // The vendor owns acme.com, so "Acme" is its brand.
    expect(profileOf(part, target({ domain: "acme.com" })).names).toEqual(["Acme"]);
    // A generic first word of a name is not a brand either.
    expect(
      profileOf(identity(["Cloud"]), target({ name: "Cloud Services Ltd", domain: "csl.io" }))
        .names,
    ).toEqual([]);
  });

  it("leaves out the names the vendor has already: its own, without the legal form, and the ones a person gave", () => {
    const profile = profileOf(
      identity([
        "Acme Analytics, Inc.",
        "Acme Analytics",
        "ACME ANALYTICS",
        "AcmeAI",
        "Acme Cloud",
      ]),
      target({ aliases: ["AcmeAI"] }),
    );

    expect(profile.names).toEqual(["Acme Cloud"]);
  });

  it("takes no name for a brand of fewer than three letters", () => {
    const profile = profileOf(
      identity(["Go", "Go Fast Ltd"]),
      target({ name: "Go", domain: "go.io" }),
    );

    expect(profile.names).toEqual([]);
  });

  it("keeps at most four names", () => {
    const names = Array.from({ length: 7 }, (_, n) => `Acme Analytics ${n}`);

    expect(profileOf(identity(names), target()).names).toEqual(names.slice(0, 4));
  });

  it("gives the products for the briefing, whatever they are called, five at most and once each", () => {
    const profile = profileOf(
      identity(
        [],
        ["Windows 11", "Office", "Windows 11", "Teams", "Azure", "Xbox", "Surface", "Bing"],
      ),
      target(),
    );

    expect(profile.products).toEqual(["Windows 11", "Office", "Teams", "Azure", "Xbox"]);
  });

  it("takes a name built around a brand of three letters", () => {
    const profile = profileOf(
      identity(["Zed Editor", "Zedboard"]),
      target({ name: "Zed Industries, Inc.", domain: "zed.dev" }),
    );

    expect(profile.names).toEqual(["Zed Editor", "Zedboard"]);
  });

  it("builds the brand on the name without its article and legal form", () => {
    const profile = profileOf(
      identity(["Theatre Cloud", "Acme Cloud"]),
      target({ name: "The Acme Company", domain: "acme-co.io" }),
    );

    // "The" is not the brand of the vendor; "Acme" is.
    expect(profile.names).toEqual(["Acme Cloud"]);
  });

  it("keeps a name once, however it is written", () => {
    const profile = profileOf(
      identity(["HarborChat", "Harbor Chat", "Harbor-Chat"]),
      target({ name: "Northwind Holdings", domain: "harborchat.com" }),
    );

    expect(profile.names).toEqual(["HarborChat"]);
  });
});
