import { buildTarget, normaliseDomain } from "../target";
import { ACME_LEI } from "../vrdb/__tests__/helpers/lei";

describe("normaliseDomain", () => {
  it.each([
    ["https://www.Acme.com/security?x=1", "acme.com"],
    ["acme.com:8443/path", "acme.com"],
    ["https://münchen.de", "xn--mnchen-3ya.de"],
    ["https://MÜNCHEN.DE", "xn--mnchen-3ya.de"],
    ["acme.com", "acme.com"],
    ["www.acme.com", "acme.com"],
    ["  https://acme.com  ", "acme.com"],
    ["HTTPS://WWW.ACME.COM/Path", "acme.com"],
    ["  HTTP://Acme.com", "acme.com"],
    ["https://acme.com:443", "acme.com"],
    ["http://acme.com./about", "acme.com"],
    ["https://trust.acme.com/", "trust.acme.com"],
    // Only a "www." at the very start goes.
    ["https://awww.acme.com", "awww.acme.com"],
    ["https://shop.www.acme.com", "shop.www.acme.com"],
    ["https://acme.co.uk/path", "acme.co.uk"],
    ["https://user:secret@acme.com/login", "acme.com"],
    // A path that contains a colon is a path, not a scheme.
    ["acme.com/docs:setup", "acme.com"],
  ])("turns %p into %p", (website, expected) => {
    expect(normaliseDomain(website)).toBe(expected);
  });

  it.each([
    [""],
    ["  "],
    [null],
    [undefined],
    ["not a url"],
    ["localhost"],
    ["http://192.168.1.1"],
    ["http://[::1]"],
  ])("returns null for %p", (website) => {
    expect(normaliseDomain(website)).toBeNull();
  });

  describe("hosts that are not a public domain name", () => {
    it.each([
      ["https://localhost:3000"],
      ["localhost:3000"],
      ["intranet"],
      ["10.0.0.1"],
      ["http://8.8.8.8/dns"],
      // The URL parser turns these into dotted IPv4 before the checks run.
      ["http://0x7f.0.0.1"],
      ["http://2130706433"],
      ["http://127.1"],
      ["http://[2001:db8::1]:8080/x"],
      // Nothing is left once the www. goes.
      ["https://www.com"],
      ["https://com"],
    ])("rejects %p", (website) => {
      expect(normaliseDomain(website)).toBeNull();
    });

    it("keeps a domain that merely contains numbers", () => {
      expect(normaliseDomain("https://1.2.3.4.example.com")).toBe("1.2.3.4.example.com");
      expect(normaliseDomain("https://99designs.com")).toBe("99designs.com");
    });
  });

  describe("input that is not an http or https website", () => {
    it.each([
      ["ftp://acme.com"],
      ["javascript:alert(1)"],
      ["mailto:sales@acme.com"],
      ["data:text/html,<b>acme.com</b>"],
      ["file:///etc/passwd"],
      ["https://"],
      ["https:///"],
      ["http//acme.com"],
    ])("rejects %p", (website) => {
      expect(normaliseDomain(website)).toBeNull();
    });
  });

  describe("names that are not valid host names", () => {
    it.each([
      ["acme..com"],
      ["-acme.com"],
      ["acme-.com"],
      ["acme_site.com"],
      ["acme!.com"],
      ["https://acme.com:99999"],
      ["https://acme .com"],
    ])("rejects %p", (website) => {
      expect(normaliseDomain(website)).toBeNull();
    });

    it("allows a label of 63 characters and rejects one of 64", () => {
      expect(normaliseDomain(`${"a".repeat(63)}.com`)).toBe(`${"a".repeat(63)}.com`);
      expect(normaliseDomain(`${"a".repeat(64)}.com`)).toBeNull();
    });

    it("allows a name of 253 characters and rejects one of 254", () => {
      const labels = (lastLabelLength: number) =>
        [..."abc"].map((letter) => letter.repeat(63)).concat("d".repeat(lastLabelLength));
      const longest = labels(61).join(".");
      const tooLong = labels(62).join(".");

      expect(longest).toHaveLength(253);
      expect(tooLong).toHaveLength(254);
      expect(normaliseDomain(`https://${longest}/`)).toBe(longest);
      expect(normaliseDomain(`https://${tooLong}/`)).toBeNull();
    });
  });

  it("never throws, whatever it is given, and returns null for what is not a string", () => {
    const notStrings: unknown[] = [
      42,
      NaN,
      true,
      {},
      [],
      ["acme.com"],
      Symbol("acme.com"),
      BigInt(7),
      () => "acme.com",
      new String("acme.com"),
      { toString: () => "acme.com" },
    ];
    for (const value of notStrings) {
      expect(() => normaliseDomain(value as string)).not.toThrow();
      expect(normaliseDomain(value as string)).toBeNull();
    }
  });

  it("never throws on strings the URL parser dislikes", () => {
    const hostile = [
      "http://",
      "://",
      ":",
      "%",
      "%zz.com",
      "https://[",
      "https://[::1",
      "https://a b.com",
      "\u0000",
      "\uD800",
      "https://acme.com\uD800",
      "\n\n",
      "x".repeat(100_000),
      `https://${"a.".repeat(5000)}com`,
    ];
    for (const value of hostile) {
      expect(() => normaliseDomain(value)).not.toThrow();
    }
  });
});

describe("buildTarget", () => {
  it("trims the name and the description and drops a website that is not a domain", () => {
    expect(buildTarget({ vendor_name: " Acme ", website: "x", vendor_provides: "Cloud" })).toEqual({
      name: "Acme",
      domain: null,
      provides: "Cloud",
    });
  });

  it("derives the domain from the website", () => {
    expect(
      buildTarget({
        vendor_name: "Acme",
        website: "https://www.acme.com/security",
        vendor_provides: "  Cloud hosting\n",
      }),
    ).toEqual({ name: "Acme", domain: "acme.com", provides: "Cloud hosting" });
  });

  it("returns only the three target fields, whatever else the vendor row carries", () => {
    const vendor = {
      vendor_name: "Acme",
      website: "acme.com",
      vendor_provides: "Cloud",
      assignee: 7,
      risk_score: 3,
    };

    expect(Object.keys(buildTarget(vendor)).sort()).toEqual(["domain", "name", "provides"]);
  });

  describe("the identifiers of the vendor", () => {
    const record = { vendor_name: "Acme", website: "acme.com", vendor_provides: "Cloud" };

    it("the identifiers come from the vendor", () => {
      expect(
        buildTarget({
          ...record,
          country: "DE",
          registration_number: "HRB 12345 B",
          lei: ACME_LEI,
          sec_cik: "0000320193",
        }).identifiers,
      ).toEqual({
        country: "DE",
        registrationNumber: "HRB 12345 B",
        lei: ACME_LEI,
        secCik: "0000320193",
      });
    });

    it("holds only those the vendor has, and is no field of the target when it has none", () => {
      expect(buildTarget({ ...record, country: "DE", lei: null, sec_cik: "" }).identifiers).toEqual(
        { country: "DE" },
      );
      expect(
        buildTarget({
          ...record,
          country: null,
          registration_number: null,
          lei: null,
          sec_cik: null,
        }),
      ).not.toHaveProperty("identifiers");
    });
  });

  describe("the other names of the vendor", () => {
    const record = {
      vendor_name: "Meta Platforms, Inc.",
      website: "facebook.com",
      vendor_provides: "Social media",
    };

    it("are the names a person wrote in the record, cleaned and without repeats", () => {
      expect(
        buildTarget({ ...record, other_names: " Facebook,  Instagram ;facebook\nWhatsApp " }),
      ).toEqual({
        name: "Meta Platforms, Inc.",
        domain: "facebook.com",
        provides: "Social media",
        aliases: ["Facebook", "Instagram", "WhatsApp"],
      });
    });

    it("leave out the name of the vendor itself, with or without its legal form", () => {
      const target = buildTarget({
        ...record,
        other_names: "Meta Platforms, META PLATFORMS, Facebook",
      });

      expect(target.aliases).toEqual(["Facebook"]);
    });

    it.each([[undefined], [null], [""], ["  ,; "]])(
      "are no field of the target when the record has %p",
      (otherNames) => {
        const target = buildTarget({ ...record, other_names: otherNames });

        expect(target).not.toHaveProperty("aliases");
      },
    );
  });
});
