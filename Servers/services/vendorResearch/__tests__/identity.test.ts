import { brandOf, createVendorMatcher, wholeWord } from "../identity";
import { ResearchTarget } from "../target";

const target = (overrides: Partial<ResearchTarget> = {}): ResearchTarget => ({
  name: "Acme Analytics",
  domain: "acme-analytics.com",
  provides: "Product analytics",
  ...overrides,
});

const source = (fields: Partial<{ title: string; content: string; url: string }> = {}) => ({
  title: "",
  content: "",
  url: "https://news.example/story",
  ...fields,
});

describe("wholeWord", () => {
  it("matches a term only as a whole word, in any case", () => {
    const matcher = wholeWord("Acme");
    expect(matcher?.test("ACME confirmed it")).toBe(true);
    expect(matcher?.test("Acmeville confirmed it")).toBe(false);
    expect(matcher?.test("the pacme group")).toBe(false);
  });

  it("matches the characters of a name as written, and a run of spaces as any run of spaces", () => {
    expect(wholeWord("C++ Builders")?.test("the c++   builders team")).toBe(true);
    expect(wholeWord("AT&T")?.test("AT&T said")).toBe(true);
  });

  it("matches a domain only as a whole word", () => {
    expect(wholeWord("acme.com")?.test("see acme.com/trust")).toBe(true);
    expect(wholeWord("acme.com")?.test("see notacme.com/trust")).toBe(false);
  });

  it("has no matcher for an empty term", () => {
    expect(wholeWord("   ")).toBeNull();
  });
});

describe("createVendorMatcher", () => {
  it("is true for a source that names the vendor in its title or its text", () => {
    const mentions = createVendorMatcher(target());

    expect(mentions(source({ title: "Acme Analytics discloses an incident" }))).toBe(true);
    expect(mentions(source({ content: "Customers of Acme Analytics were told on Monday" }))).toBe(
      true,
    );
  });

  it("is false for a source that does not", () => {
    const mentions = createVendorMatcher(target());

    expect(
      mentions(source({ title: "A cloud provider is breached", content: "Nothing about us" })),
    ).toBe(false);
  });

  it("does not take a longer word, or the name of another company that contains it", () => {
    const mentions = createVendorMatcher(target({ name: "Acme", domain: null }));

    expect(mentions(source({ content: "Acmeville is a town" }))).toBe(false);
    expect(mentions(source({ content: "Pacme Holdings said" }))).toBe(false);
  });

  it("is true for a source whose address names the vendor", () => {
    const mentions = createVendorMatcher(target());

    expect(mentions(source({ url: "https://news.example/acme-analytics-breach-2026" }))).toBe(true);
    expect(mentions(source({ url: "https://www.example.com/companies/Acme_Analytics/risk" }))).toBe(
      true,
    );
  });

  it("reads the host of the address as words too", () => {
    const mentions = createVendorMatcher(target({ name: "OpenAI", domain: "openai.com" }));

    expect(mentions(source({ url: "https://platform.openai.com/docs" }))).toBe(true);
    expect(mentions(source({ url: "https://notopenai.example/docs" }))).toBe(false);
  });

  it("is true for a source that mentions the vendor's domain", () => {
    const mentions = createVendorMatcher(target());

    expect(mentions(source({ content: "Read acme-analytics.com/trust for the report" }))).toBe(
      true,
    );
  });

  it("does not take a domain that only ends like the vendor's", () => {
    const mentions = createVendorMatcher(target({ name: "Zeta", domain: "acme.com" }));

    expect(mentions(source({ content: "See notacme.com/trust" }))).toBe(false);
    expect(mentions(source({ url: "https://notacme.com/trust" }))).toBe(false);
  });

  it("matches the name without the legal form that the vendor record carries", () => {
    const mentions = createVendorMatcher(target({ name: "Acme Analytics, Inc.", domain: null }));

    expect(mentions(source({ title: "Acme Analytics confirmed a breach" }))).toBe(true);
    expect(
      createVendorMatcher(target({ name: "Müller GmbH", domain: null }))(
        source({ content: "Müller said on Monday" }),
      ),
    ).toBe(true);
    expect(
      createVendorMatcher(target({ name: "The Acme Company", domain: null }))(
        source({ content: "Acme said on Monday" }),
      ),
    ).toBe(true);
  });

  it("matches the name as it is written in the record too", () => {
    const mentions = createVendorMatcher(target({ name: "Acme Analytics, Inc.", domain: null }));

    expect(mentions(source({ content: "Acme Analytics, Inc. filed a report" }))).toBe(true);
  });

  it("keeps a name that is nothing but a legal form", () => {
    const mentions = createVendorMatcher(target({ name: "Limited", domain: null }));

    expect(mentions(source({ content: "A Limited release" }))).toBe(true);
  });

  it("works with a vendor that has no domain", () => {
    const mentions = createVendorMatcher(target({ domain: null }));

    expect(mentions(source({ content: "Acme Analytics said" }))).toBe(true);
    expect(mentions(source({ content: "Something else" }))).toBe(false);
  });

  it("does not throw for a source whose address cannot be read", () => {
    const mentions = createVendorMatcher(target());

    expect(mentions(source({ url: "not a url", content: "Acme Analytics said" }))).toBe(true);
    expect(mentions(source({ url: "not a url" }))).toBe(false);
  });

  it("builds a matcher for a name that holds regular expression characters", () => {
    const mentions = createVendorMatcher(target({ name: "C++ (Builders)[x]", domain: null }));

    expect(mentions(source({ content: "the C++ (Builders)[x] team" }))).toBe(true);
  });
});

describe("a vendor known by other names", () => {
  const known = target({
    name: "Meta Platforms, Inc.",
    domain: "meta-platforms.com",
    aliases: ["Facebook", "Instagram, Inc."],
  });

  it("is named by any of its other names, as whole words and in any case", () => {
    const mentions = createVendorMatcher(known);

    expect(mentions(source({ title: "FACEBOOK fined over data transfers" }))).toBe(true);
    expect(mentions(source({ content: "The outage hit Facebook and its apps" }))).toBe(true);
    expect(mentions(source({ title: "Facebookish clone launches" }))).toBe(false);
    expect(mentions(source({ title: "A book about faces" }))).toBe(false);
  });

  it("is named by an other name without its legal form too", () => {
    const mentions = createVendorMatcher(known);

    expect(mentions(source({ title: "Instagram changes its rules" }))).toBe(true);
  });

  it("is still named by its recorded name and its domain", () => {
    const mentions = createVendorMatcher(known);

    expect(mentions(source({ title: "Meta Platforms reports earnings" }))).toBe(true);
    expect(mentions(source({ content: "See meta-platforms.com/trust" }))).toBe(true);
    expect(mentions(source({ title: "A cloud provider is breached" }))).toBe(false);
  });

  it("is named by the other name of a vendor that has no domain", () => {
    const mentions = createVendorMatcher({ ...known, domain: null });

    expect(mentions(source({ title: "Facebook outage" }))).toBe(true);
  });

  it("is named as before when it has no other names, a list of none or names that are blank", () => {
    for (const aliases of [undefined, [], ["", "   "]]) {
      const mentions = createVendorMatcher(target({ aliases }));

      expect(mentions(source({ title: "Acme Analytics discloses an incident" }))).toBe(true);
      expect(mentions(source({ title: "Anything else at all" }))).toBe(false);
    }
  });

  it("builds a matcher for an other name that holds regular expression characters", () => {
    const mentions = createVendorMatcher(target({ aliases: ["C++ (Labs)"] }));

    expect(mentions(source({ title: "C++ (Labs) ships a fix" }))).toBe(true);
  });
});

describe("brandOf", () => {
  it.each([
    ["acme.com", "acme"],
    ["www.acme.com", "acme"],
    ["acme-analytics.com", "acme-analytics"],
    ["acme.co.uk", "acme"],
    ["trust.acme.com", "acme"],
    ["ACME.COM.", "acme"],
    ["localhost", "localhost"],
  ])("is the label before the suffix of %s: %s", (host, brand) => {
    expect(brandOf(host)).toBe(brand);
  });
});
