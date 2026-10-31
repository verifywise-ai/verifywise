/**
 * The keys by which a VRDB record is matched to a vendor (spec D4.4): a verified domain and a KEV
 * vendor are strong, an exact name is weak, and a name of three letters is too short to match a
 * sanctions list.
 */
import type { ResearchTarget } from "../../target";
import {
  cikKey,
  cpeKey,
  cveVendorKey,
  domainKey,
  identifierKeysOf,
  isLei,
  kevKey,
  leiKey,
  matchOf,
  nameKey,
  nameKeysOf,
  regnoKey,
  vendorKeys,
} from "../keys";
import { ACME_LEI } from "./helpers/lei";

const ACME: ResearchTarget = {
  name: "Acme Analytics",
  domain: "acme-analytics.example",
  provides: "Analytics software",
};

describe("vendorKeys", () => {
  it("holds a KEV key, a name key and the key of each verified domain", () => {
    expect(vendorKeys(ACME, ["acme-analytics.example", "acme.example"])).toEqual(
      expect.arrayContaining([
        "kev:acmeanalytics",
        "name:acmeanalytics",
        "domain:acme-analytics.example",
        "domain:acme.example",
      ]),
    );
  });

  it("holds no domain key for a domain that the website check did not verify", () => {
    expect(vendorKeys(ACME).filter((key) => key.startsWith("domain:"))).toEqual([]);
  });

  it("holds no key of a host where many have pages, verified or not", () => {
    const keys = vendorKeys({ name: "Acme Analytics", domain: "linkedin.com", provides: "" }, [
      "linkedin.com",
      "acme-analytics.github.io",
    ]);
    expect(keys.filter((key) => key.startsWith("domain:"))).toEqual([]);
    expect(keys).not.toContain("kev:linkedin");
  });

  it("gives the brand of the domain a KEV key and no sanctions key: a sanctions list is matched by names only", () => {
    const keys = vendorKeys({ name: "Apex Holdings Ltd", domain: "apexcloud.io", provides: "" });
    expect(keys).toContain("kev:apexcloud");
    expect(keys).not.toContain("name:apexcloud");
    expect(keys).toEqual(expect.arrayContaining(["name:apexholdingsltd", "name:apexholdings"]));
  });

  it("a three-letter name gets a KEV key and no sanctions key", () => {
    const keys = vendorKeys({ name: "SAP", domain: null, provides: "" });
    expect(keys).toContain("kev:sap");
    expect(keys).not.toContain("name:sap");
  });

  it("spells every key as a record does", () => {
    expect(nameKey("Acme Analytics")).toBe("name:acmeanalytics");
    expect(kevKey("D-Link")).toBe("kev:dlink");
    expect(domainKey("WWW.Acme-Analytics.example")).toBe("domain:acme-analytics.example");
    expect(leiKey(ACME_LEI.toLowerCase())).toBe(`lei:${ACME_LEI}`);
    expect(regnoKey("HRB 12345 B")).toBe("regno:hrb12345b");
    expect(regnoKey("12-345")).toBeNull();
    expect(cikKey("0000320193")).toBe("cik:0000320193");
    expect(cpeKey("trendmicro")).toBe("cpe:trendmicro");
    expect(cveVendorKey("Trend Micro, Inc.")).toBe("cve:trendmicroinc");
  });

  it("holds a cve key beside each kev key, a cpe key, and the keys of the vendor's identifiers", () => {
    const keys = vendorKeys({
      ...ACME,
      identifiers: {
        country: "DE",
        registrationNumber: "HRB 12345 B",
        lei: ACME_LEI,
        secCik: "0000320193",
      },
    });

    expect(keys).toEqual(
      expect.arrayContaining([
        "kev:acmeanalytics",
        "cve:acmeanalytics",
        "cpe:acmeanalytics",
        `lei:${ACME_LEI}`,
        "regno:hrb12345b",
        "cik:0000320193",
      ]),
    );
    expect(keys.filter((key) => key.startsWith("cve:"))).toEqual(
      keys.filter((key) => key.startsWith("kev:")).map((key) => `cve:${key.slice("kev:".length)}`),
    );
    expect(vendorKeys(ACME).filter((key) => /^(lei|regno|cik):/.test(key))).toEqual([]);
  });

  it("holds no cpe key of the brand of a host where many have pages", () => {
    const keys = vendorKeys({ name: "Acme Analytics", domain: "linkedin.com", provides: "" });
    expect(keys.filter((key) => key.startsWith("cpe:"))).toEqual(["cpe:acmeanalytics"]);
  });
});

describe("identifierKeysOf", () => {
  it("a valid LEI on a list entry is a lei key; another number of six or more is a regno key; a shorter one is none", () => {
    expect(identifierKeysOf([ACME_LEI.toLowerCase(), "1027700000000", "12345"])).toEqual([
      `lei:${ACME_LEI}`,
      "regno:1027700000000",
    ]);
  });

  it("reads a number written with words around it as the number too", () => {
    expect(identifierKeysOf(["OGRN 1027700000000 (Example)"])).toEqual([
      "regno:ogrn1027700000000example",
      "regno:1027700000000",
    ]);
    expect(identifierKeysOf(["HRB 12345 B", "Registered in England"])).toEqual(["regno:hrb12345b"]);
  });

  it("tells an LEI by its check digits", () => {
    const changed = `${ACME_LEI.slice(0, 5)}${ACME_LEI[5] === "9" ? "8" : "9"}${ACME_LEI.slice(6)}`;
    expect(isLei(ACME_LEI)).toBe(true);
    expect(isLei(` ${ACME_LEI.toLowerCase()} `)).toBe(true);
    expect(isLei(changed)).toBe(false);
    expect(identifierKeysOf([changed])).toEqual([`regno:${changed.toLowerCase()}`]);
  });
});

describe("nameKeysOf", () => {
  it("gives the name keys of a list entry: each name as written and without its legal form, of four characters or more", () => {
    expect(nameKeysOf(["Northwind Export Company", "NW Ltd", "Northwind Export Company"])).toEqual([
      "name:northwindexportcompany",
      "name:northwindexport",
      "name:nwltd",
    ]);
  });
});

describe("matchOf with identifiers", () => {
  const VENDOR = vendorKeys({
    ...ACME,
    identifiers: { registrationNumber: "HRB 12345 B", lei: ACME_LEI, secCik: "0000320193" },
  });

  it("an LEI alone is a strong identifier match", () => {
    expect(matchOf([`lei:${ACME_LEI}`], VENDOR)).toEqual({
      method: "identifier",
      strength: "strong",
      matchedKey: `lei:${ACME_LEI}`,
    });
  });

  it("a registration number without the name matches nothing", () => {
    expect(matchOf(["regno:hrb12345b", "name:northwindexport"], VENDOR)).toBeNull();
  });

  it("a registration number with the name is a strong identifier match", () => {
    expect(matchOf(["name:acmeanalytics", "regno:hrb12345b"], VENDOR)).toEqual({
      method: "identifier",
      strength: "strong",
      matchedKey: "regno:hrb12345b",
    });
  });

  it("a stored CIK is strong; one in weakKeys is weak", () => {
    expect(matchOf(["cik:0000320193"], VENDOR)).toEqual({
      method: "sec_cik",
      strength: "strong",
      matchedKey: "cik:0000320193",
    });
    expect(matchOf(["cik:0000320193"], VENDOR, new Set(["cik:0000320193"]))).toEqual({
      method: "sec_cik",
      strength: "weak",
      matchedKey: "cik:0000320193",
    });
  });

  it("prefers lei, domain, cik, cpe, kev, cve, regno and name, in that order", () => {
    const vendor = [...VENDOR, "domain:acme-analytics.example"];
    let record = [
      "name:acmeanalytics",
      "regno:hrb12345b",
      "cve:acmeanalytics",
      "kev:acmeanalytics",
      "cpe:acmeanalytics",
      "cik:0000320193",
      "domain:acme-analytics.example",
      `lei:${ACME_LEI}`,
    ];
    const order: string[] = [];
    for (let match = matchOf(record, vendor); match !== null; match = matchOf(record, vendor)) {
      const { matchedKey } = match;
      order.push(`${match.method} ${match.strength}`);
      record = record.filter((key) => key !== matchedKey);
    }

    expect(order).toEqual([
      "identifier strong",
      "domain strong",
      "sec_cik strong",
      "nvd_cpe_vendor strong",
      "kev_vendor strong",
      "cve_affected_vendor strong",
      "identifier strong",
      "name_exact weak",
    ]);
  });
});

describe("matchOf", () => {
  const VENDOR = ["kev:acme", "name:acmeco", "domain:acme.example"];

  it("prefers the domain, then the KEV vendor, then the exact name, and names the key", () => {
    expect(matchOf(["name:acmeco", "kev:acme", "domain:acme.example"], VENDOR)).toEqual({
      method: "domain",
      strength: "strong",
      matchedKey: "domain:acme.example",
    });
    expect(matchOf(["name:acmeco", "kev:acme"], VENDOR)).toEqual({
      method: "kev_vendor",
      strength: "strong",
      matchedKey: "kev:acme",
    });
    expect(matchOf(["name:acmeco"], VENDOR)).toEqual({
      method: "name_exact",
      strength: "weak",
      matchedKey: "name:acmeco",
    });
  });

  it("returns null without a common key", () => {
    expect(matchOf(["name:other", "kev:other"], VENDOR)).toBeNull();
    expect(matchOf([], VENDOR)).toBeNull();
  });
});
