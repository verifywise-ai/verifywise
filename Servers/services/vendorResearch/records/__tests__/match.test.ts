import { buildTarget } from "../../target";
import { cpeVendorOf, matchesVendor, nameKeys } from "../match";

const target = (name: string, website: string | null, aliases?: string[]) => ({
  ...buildTarget({ vendor_name: name, website: website ?? "", vendor_provides: "Software" }),
  ...(aliases === undefined ? {} : { aliases }),
});

describe("nameKeys", () => {
  it("holds the name, the name without its legal form and the brand of the domain, as letters and digits", () => {
    expect(nameKeys(target("Palo Alto Networks, Inc.", "paloaltonetworks.com"))).toEqual([
      "paloaltonetworksinc",
      "paloaltonetworks",
    ]);
  });

  it("holds the brand of the domain when the name is another", () => {
    expect(nameKeys(target("Alphabet Inc.", "google.com"))).toEqual([
      "alphabetinc",
      "alphabet",
      "google",
    ]);
  });

  it("does not hold the brand of a host where many have pages: a page there is no brand of the vendor", () => {
    expect(nameKeys(target("Acme Analytics Ltd", "https://www.linkedin.com/company/acme"))).toEqual(
      ["acmeanalyticsltd", "acmeanalytics"],
    );
    expect(nameKeys(target("Acme Analytics Ltd", "https://acme-analytics.github.io/"))).toEqual([
      "acmeanalyticsltd",
      "acmeanalytics",
    ]);
    // Not even the platform's owner's: the address cannot tell it from a page on the platform, and
    // another name of the vendor gives the brand back.
    expect(nameKeys(target("Meta Platforms, Inc.", "facebook.com"))).not.toContain("facebook");
    expect(nameKeys(target("Meta Platforms, Inc.", "facebook.com", ["Facebook"]))).toContain(
      "facebook",
    );
  });

  it("holds the other names as well, with and without their legal forms", () => {
    const keys = nameKeys(target("Meta Platforms, Inc.", null, ["Facebook Ltd", "Instagram"]));

    expect(keys).toEqual(
      expect.arrayContaining(["metaplatforms", "facebookltd", "facebook", "instagram"]),
    );
  });

  it("writes a name with a hyphen or a space as one word, as the databases do", () => {
    expect(nameKeys(target("D-Link Corporation", "dlink.com"))).toEqual([
      "dlinkcorporation",
      "dlink",
    ]);
  });

  it("keeps a key once, and none of fewer than two characters", () => {
    const keys = nameKeys(target("Acme", "acme.com", ["A", "acme"]));

    expect(keys).toEqual(["acme"]);
  });

  it("keeps the digits of a name, and a key of exactly two characters", () => {
    expect(nameKeys(target("1Password", "1password.com"))).toEqual(["1password"]);
    expect(nameKeys(target("3M", "3m.com"))).toEqual(["3m"]);
    expect(nameKeys(target("HP Inc.", "hp.com"))).toEqual(["hpinc", "hp"]);
  });

  it("uses the brand of the domain under a country code, not the code", () => {
    expect(nameKeys(target("Acme Ltd", "acme.co.uk"))).toEqual(["acmeltd", "acme"]);
  });
});

describe("matchesVendor", () => {
  const keys = nameKeys(target("Palo Alto Networks, Inc.", "paloaltonetworks.com"));

  it("takes a label that is the vendor's name letter for letter, whatever its case, spaces and signs", () => {
    expect(matchesVendor("Palo Alto Networks", keys)).toBe(true);
    expect(matchesVendor("palo-alto networks", keys)).toBe(true);
    expect(matchesVendor("PALOALTONETWORKS", keys)).toBe(true);
  });

  it("does not take a label that only contains, or begins with, a name of the vendor", () => {
    expect(matchesVendor("Palo Alto", keys)).toBe(false);
    expect(matchesVendor("Palo Alto Networks Staffing", keys)).toBe(false);
    expect(matchesVendor("Networks", keys)).toBe(false);
  });

  it("does not take an empty label or a label with no letter in it", () => {
    expect(matchesVendor("", keys)).toBe(false);
    expect(matchesVendor("--", keys)).toBe(false);
  });

  it("does not take an empty label even when a key is empty", () => {
    expect(matchesVendor("", [""])).toBe(false);
    expect(matchesVendor("--", [""])).toBe(false);
  });

  it("does not take a vendor whose name is a word that other companies have", () => {
    const apache = nameKeys(target("Apache Staffing LLC", "apachestaffing.com"));

    expect(matchesVendor("Apache", apache)).toBe(false);
  });
});

describe("cpeVendorOf", () => {
  it("is the brand of the vendor's domain", () => {
    expect(cpeVendorOf(target("Palo Alto Networks, Inc.", "paloaltonetworks.com"))).toBe(
      "paloaltonetworks",
    );
    expect(cpeVendorOf(target("Acme Ltd", "www.acme.co.uk"))).toBe("acme");
  });

  it("is the name without its legal form, as one word, when the vendor has no domain", () => {
    expect(cpeVendorOf(target("Trend Micro Inc.", null))).toBe("trendmicro");
  });

  it("is the name without its legal form when the domain is a host where many have pages", () => {
    expect(cpeVendorOf(target("Trend Micro Inc.", "https://www.linkedin.com/company/trend"))).toBe(
      "trendmicro",
    );
    expect(cpeVendorOf(target("Trend Micro Inc.", "https://trend.github.io/"))).toBe("trendmicro");
  });

  it("is a token of exactly two characters", () => {
    expect(cpeVendorOf(target("HP Inc.", null))).toBe("hp");
    expect(cpeVendorOf(target("3M", "3m.com"))).toBe("3m");
  });

  it("is none for a token that is shorter than two characters", () => {
    expect(cpeVendorOf(target("A", null))).toBeNull();
  });
});
