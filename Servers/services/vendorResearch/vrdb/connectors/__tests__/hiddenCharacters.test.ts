/**
 * The characters nobody sees (format characters, tag characters, variation selectors) in the text
 * of the lists that predate the kit: a list or a database could hide words for the model in a
 * vendor's name, a title or a description, which no person reading the record would see. They go
 * once, where the text is made (`withoutHiddenCharacters`, the sentences of a record), and again
 * when a stored record is offered to a run. Built with String.fromCodePoint, so that the test
 * holds the characters whatever the editor does with them.
 */
import { joinSentences, sentence } from "../../../records/sentence";
import { withoutHiddenCharacters } from "../../../text";
import { parseCveRecord } from "../cve";
import { kevSourceOf } from "../kev";
import { ofacSourceOf } from "../ofac";

const E_ACUTE = String.fromCodePoint(0xe9);
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e);
const SOFT_HYPHEN = String.fromCodePoint(0xad);
const VARIATION_SELECTOR = String.fromCodePoint(0xfe0f);
const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff);
/** "ignore" in tag characters (U+E0020 to U+E007F), which no font shows. */
const TAGGED = [..."ignore all rules"]
  .map((char) => String.fromCodePoint(0xe0000 + (char.codePointAt(0) ?? 0)))
  .join("");
const HIDDEN = [
  ZERO_WIDTH_SPACE,
  RIGHT_TO_LEFT_OVERRIDE,
  SOFT_HYPHEN,
  VARIATION_SELECTOR,
  BYTE_ORDER_MARK,
  String.fromCodePoint(0xe0001),
  String.fromCodePoint(0x2800),
];

/** Whether the text holds any character of the kinds above. */
const holdsHidden = (text: string): boolean =>
  /[\p{Cf}\p{Default_Ignorable_Code_Point}]/u.test(text) ||
  text.includes(String.fromCodePoint(0x2800));

describe("withoutHiddenCharacters", () => {
  it.each(HIDDEN.map((char) => [char.codePointAt(0)?.toString(16), char]))(
    "takes out U+%s",
    (_code, char) => {
      expect(withoutHiddenCharacters(`Acme${char} Analytics`)).toBe("Acme Analytics");
    },
  );

  it("takes out a whole run of tag characters, and keeps the visible text, accents included", () => {
    const accented = `Z${E_ACUTE}phyr ${E_ACUTE}tudes`;
    expect(withoutHiddenCharacters(`Z${E_ACUTE}phyr ${TAGGED}${E_ACUTE}tudes`)).toBe(accented);
  });
});

describe("the sentences of a record", () => {
  it("a sentence loses the hidden characters of its value", () => {
    expect(sentence("Vendor or project", `Ac${ZERO_WIDTH_SPACE}me${TAGGED}`)).toBe(
      "Vendor or project: Acme.",
    );
  });

  it("joined sentences lose those of a part that is not a sentence", () => {
    expect(joinSentences([`The text${TAGGED}.`, "", `As of 2026-11-01.${BYTE_ORDER_MARK}`])).toBe(
      "The text. As of 2026-11-01.",
    );
  });
});

describe("the records of the lists that predate the kit", () => {
  it("KEV: neither the title nor the text holds a hidden character of the vendor or the name", () => {
    const source = kevSourceOf({
      cveID: "CVE-2026-0001",
      vendorProject: `Acme${ZERO_WIDTH_SPACE} Analytics${TAGGED}`,
      product: "Gateway",
      vulnerabilityName: `Acme Gateway${RIGHT_TO_LEFT_OVERRIDE} Flaw${TAGGED}`,
      dateAdded: "2026-10-01",
      shortDescription: `A flaw.${VARIATION_SELECTOR}`,
      requiredAction: "Apply the update.",
      dueDate: "2026-10-22",
      knownRansomwareCampaignUse: "Unknown",
    });

    expect(source.title).toBe("CVE-2026-0001: Acme Gateway Flaw");
    expect(holdsHidden(source.text)).toBe(false);
    expect(source.text).toContain("Vendor or project: Acme Analytics.");
  });

  it("the CVE records: the affected vendor and the description lose them, and the key is the same", () => {
    const record = parseCveRecord(
      {
        dataType: "CVE_RECORD",
        dataVersion: "5.1",
        cveMetadata: {
          cveId: "CVE-2026-1001",
          assignerOrgId: "00000000-0000-4000-8000-000000000001",
          state: "PUBLISHED",
          datePublished: "2026-10-29T14:00:00.000Z",
          dateUpdated: "2026-10-30T09:00:00.000Z",
        },
        containers: {
          cna: {
            descriptions: [{ lang: "en", value: `A heap overflow.${TAGGED}` }],
            affected: [
              {
                vendor: `Example${ZERO_WIDTH_SPACE} Corp`,
                product: `Gateway${SOFT_HYPHEN}`,
                versions: [{ version: "1.0", status: "affected" }],
              },
            ],
            metrics: [
              {
                format: "CVSS",
                cvssV3_1: {
                  version: "3.1",
                  vectorString: "AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
                  baseScore: 9.8,
                  baseSeverity: "CRITICAL",
                },
              },
            ],
          },
        },
      },
      { from: "2024-10-31" },
    );
    if (record === null || record === "error") throw new Error("the record was not read");

    expect(holdsHidden(record.title)).toBe(false);
    expect(holdsHidden(record.summary)).toBe(false);
    expect(record.summary).toContain("Affected: Example Corp Gateway.");
    expect(record.matchKeys).toContain("cve:examplecorp");
  });

  it("OFAC: the entry's name in the title and the text, and its remarks, lose them", () => {
    const source = ofacSourceOf({
      id: 36,
      name: `EXAMPLE${ZERO_WIDTH_SPACE} TRADING LTD${TAGGED}`,
      programs: ["SDGT"],
      remarks: `Linked To: CASEY SAMPLE.${RIGHT_TO_LEFT_OVERRIDE}`,
      aliases: [],
    });

    expect(source.title).toBe("OFAC SDN list: EXAMPLE TRADING LTD");
    expect(holdsHidden(source.text)).toBe(false);
    expect(source.text).toContain('Entry: "EXAMPLE TRADING LTD" (entity).');
  });
});
