/**
 * The keys of a vendor whose name is written in another form of Unicode than a list's: the list
 * kit folds the names of its records (NFKC, the characters nobody sees out) before it makes keys of
 * them (kit/record.ts), so the vendor's names and numbers are folded the same way, beside the keys
 * of their text as it is, which the lists that predate the kit hold.
 */
import type { ResearchTarget } from "../../target";
import { recordOf } from "../connectors/kit/record";
import { matchOf, nameKeysOf, vendorKeys } from "../keys";

/** A record of a kit list, built by the kit's own record builder, of an entry with these names. */
const kitRecord = (names: string[], regnos: string[] = []) =>
  recordOf({
    id: "E-1",
    type: "sanctions_entity",
    title: names[0],
    summary: "An entry of a list.",
    url: "https://list.example/entries/E-1",
    identifiers: {},
    names,
    regnos,
    publishedAt: "2026-10-01",
  });

const vendor = (name: string, over: Partial<ResearchTarget> = {}): ResearchTarget => ({
  name,
  domain: null,
  provides: "",
  ...over,
});

/** "Acme" in full-width Latin letters (U+FF21 onwards for capitals, U+FF41 for small letters). */
const fullWidth = (text: string): string =>
  [...text]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (code >= 0x41 && code <= 0x5a) return String.fromCodePoint(code - 0x41 + 0xff21);
      if (code >= 0x61 && code <= 0x7a) return String.fromCodePoint(code - 0x61 + 0xff41);
      if (code >= 0x30 && code <= 0x39) return String.fromCodePoint(code - 0x30 + 0xff10);
      return char;
    })
    .join("");

const E_ACUTE = String.fromCodePoint(0xe9);
/** A made-up name with accented letters: "Zephyr Etudes Analytique" with an e acute in each word. */
const ACCENTED = `Z${E_ACUTE}phyr ${E_ACUTE}tudes Analytique`;

describe("vendorKeys: names folded as the kit folds the names of its records", () => {
  it("matches a kit record by a vendor name typed in NFD", () => {
    const record = kitRecord([ACCENTED]);
    const nfd = ACCENTED.normalize("NFD");
    expect(nfd).not.toBe(ACCENTED);

    expect(matchOf(record.matchKeys, vendorKeys(vendor(nfd)))).toMatchObject({
      method: "name_exact",
      matchedKey: `name:${ACCENTED.toLowerCase().replace(/ /g, "")}`,
    });
  });

  it("matches a kit record by a vendor name typed in full-width letters", () => {
    const record = kitRecord(["Acme Analytics"]);
    expect(
      matchOf(record.matchKeys, vendorKeys(vendor(fullWidth("Acme Analytics")))),
    ).toMatchObject({
      method: "name_exact",
      matchedKey: "name:acmeanalytics",
    });
  });

  it("matches a kit record by an alias typed in full-width letters", () => {
    const record = kitRecord(["Acme Analytics"]);
    const keys = vendorKeys(vendor("Example Ltd", { aliases: [fullWidth("Acme Analytics")] }));
    expect(matchOf(record.matchKeys, keys)).not.toBeNull();
  });

  it("matches a registration number typed in full-width digits, beside the name", () => {
    const record = kitRecord(["Acme Analytics"], ["12345678"]);
    const keys = vendorKeys(
      vendor("Acme Analytics", { identifiers: { registrationNumber: fullWidth("12345678") } }),
    );
    expect(matchOf(record.matchKeys, keys)).toMatchObject({
      method: "identifier",
      matchedKey: "regno:12345678",
    });
  });

  it("keeps the keys of the name as it is written, which the lists before the kit hold", () => {
    // A list that predates the kit makes its keys of the text as it is (nameKeysOf, no fold): an
    // NFD entry and an NFD vendor share the key that the fold would not give.
    const nfd = ACCENTED.normalize("NFD");
    const keys = vendorKeys(vendor(nfd));
    for (const key of nameKeysOf([nfd])) expect(keys).toContain(key);
    // The full-width vendor keeps the key of its own letters too.
    expect(vendorKeys(vendor(fullWidth("Acme Analytics")))).toContain(
      `name:${fullWidth("acmeanalytics")}`,
    );
  });

  it("gives an ASCII vendor the keys it had, once each", () => {
    const keys = vendorKeys(vendor("Acme Analytics Ltd", { domain: "acme-analytics.example" }));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([
      "kev:acmeanalyticsltd",
      "kev:acmeanalytics",
      "cve:acmeanalyticsltd",
      "cve:acmeanalytics",
      "cpe:acmeanalytics",
      "name:acmeanalyticsltd",
      "name:acmeanalytics",
    ]);
  });
});
