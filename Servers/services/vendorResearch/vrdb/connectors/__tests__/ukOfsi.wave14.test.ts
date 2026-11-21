/**
 * Wave 14 of the uk_ofsi connector (connectors/ukOfsi.ts, version 10): two rules of version 9 are
 * narrowed back to the reading of round 11 (uk_ofsi 7), and the named residuals of the review of
 * wave 13 are pinned. Each row gives the keys and the persons that a penalty title and a
 * disclosure's description of the same slot give, so that a change to any of them is seen.
 */
import { shortName } from "../../../identity";
import { compactName } from "../../../records/match";
import { ofsiReadingOf } from "../ukOfsi";

const PENALTY = "Imposition of monetary penalty: ";
const DATE_TITLE = "Disclosure notice: 08 September 2025";
const BY = "Disclosure notice of an offence under financial sanctions by ";

type Reading = string | [string[], number];

/** The keys and the persons of a reading, or its shape when it is no notice. */
function keysOf(title: string, description: string): Reading {
  const reading = ofsiReadingOf(title, description);
  if (reading.shape !== "notice") return reading.shape;
  return [reading.parties.map((party) => compactName(shortName(party))), reading.persons];
}

/** [slot, title reading, description reading] */
const ROWS: Array<[string, Reading, Reading]> = [
  // RV13-OFSI-F2: a firm whose name holds ` & ` or ` and ` and a side person (a bracket, a marker) keeps
  // its whole key, as round 11 gave it; the person is put aside and counted.
  ["Ernst & Young LLP (Casey Sample, director)", [["ernstyoung"], 1], [["ernstyoung"], 1]],
  ["Ernst & Young LLP (formerly Casey Sample)", [["ernstyoung"], 1], [["ernstyoung"], 1]],
  ["Ernst & Young LLP f/k/a Casey Sample", [["ernstyoung"], 1], [["ernstyoung"], 1]],
  [
    "Ernst & Young LLP (in liquidation) (Casey Sample, director)",
    [["ernstyoung"], 1],
    [["ernstyoung"], 1],
  ],
  ["Ernst & Young LLP (director Casey Sample)", [["ernstyoung"], 1], [["ernstyoung"], 1]],
  ["Ernst & Young LLP (Casey Sample)", [["ernstyoung"], 1], [["ernstyoung"], 1]],
  ["Ernst & Young LLP (EY) (Casey Sample, director)", [["ernstyoung"], 1], [["ernstyoung"], 1]],
  ["Ernst & Young LLP trading as Casey Sample", [["ernstyoung"], 1], [["ernstyoung"], 1]],
  ["Ernst and Young LLP (Casey Sample, director)", [["ernstandyoung"], 1], [["ernst", "young"], 1]],
  ["Kovex & Zentrix Ltd (Casey Sample, director)", [["kovexzentrix"], 1], [["kovexzentrix"], 1]],
  ["Kovex & Zentrix Ltd d/b/a Casey Sample", [["kovexzentrix"], 1], [["kovexzentrix"], 1]],
  ["Kovex & Zentrix Ltd t/a Casey Sample", [["kovexzentrix"], 1], [["kovexzentrix"], 1]],
  [
    "Marks & Spencer Group plc (Casey Sample, director)",
    [["marksspencergroup"], 1],
    [["marksspencergroup"], 1],
  ],
  [
    "Marks & Spencer Group plc (formerly Casey Sample)",
    [["marksspencergroup"], 1],
    [["marksspencergroup"], 1],
  ],
  ["Smith & Nephew plc (Casey Sample, director)", [["smithnephew"], 1], [["smithnephew"], 1]],
  ["Johnson & Johnson Ltd f/k/a Casey Sample", [["johnsonjohnson"], 1], [["johnsonjohnson"], 1]],
  [
    "Ambrose & Marrowby International Ltd (Casey Sample, director)",
    [["ambrosemarrowbyinternational"], 1],
    [["ambrosemarrowbyinternational"], 1],
  ],
  // Its neighbours, as round 11 reads them: a person first, a tail of a firm, a firm with no ` & `, and
  // a person after ` and ` (`ernst` and `young`, the same in every version).
  ["Kovex & Partners Ltd (Casey Sample, director)", [["kovexpartners"], 1], [["kovexpartners"], 1]],
  ["Procter & Gamble Co (Casey Sample, director)", [["proctergamble"], 1], [["proctergamble"], 1]],
  ["Kovex Ltd (Casey Sample, director)", [["kovex"], 1], [["kovex"], 1]],
  ["Casey Sample t/a Kovex & Zentrix Ltd", [["kovexzentrix"], 1], [["kovexzentrix"], 1]],
  ["Casey Sample d/b/a Ernst & Young LLP", [["ernstyoung"], 1], [["ernstyoung"], 1]],
  ["Ernst & Young LLP t/a Kovex", [["ernstyoungllptakovex"], 0], [["ernstyoungllptakovex"], 0]],
  ["Ernst & Young LLP and Casey Sample", [["ernst", "young"], 1], [["ernstyoung"], 1]],
  ["Torvik & Sons AB f/k/a Casey Sample", [["torviksons"], 1], [["torviksons"], 1]],
  // The rows of wave 12 and wave 13 that stay: the person-first marker (RV12-OFSI-P-2) and the firm
  // first in the slot (its side person splits the list there).
  [
    "Casey Quarby d/b/a Svarog Shipping & Trading Company Limited",
    [["svarogshippingtrading"], 1],
    [["svarogshippingtrading"], 1],
  ],
  ["Zentrix Limited f/k/a Casey Sample", [["zentrix"], 1], [["zentrix"], 1]],
  [
    "Zentrix Limited f/k/a Casey Sample; Kovex Shipping SE",
    [["zentrix", "kovexshippingse"], 1],
    [["zentrix", "kovexshippingse"], 1],
  ],
  [
    "Zentrix Limited f/k/a Casey Sample and Kovex Ltd",
    [["zentrix", "kovex"], 1],
    [["zentrix", "kovex"], 1],
  ],
  [
    "Kovex Ltd and Zentrix Limited f/k/a Casey Sample",
    [["kovex", "zentrix"], 1],
    [["kovex", "zentrix"], 1],
  ],
  [
    "Kovex Ltd (in liquidation) f/k/a Casey Quarby and Zeltara Ltd",
    [["kovexltdinliquidationfkacaseyquarbyandzeltara"], 0],
    [["kovex", "zeltara"], 1],
  ],
  // The two exceptions of `sideReadable` (wave 12's reading stays): a tail of a firm after ` & `, and a
  // part after a person's part (the person is no name that goes on).
  [
    "Torvik & Sons AB f/k/a Casey Sample vs Halvex International Sdn Bhd",
    [["torviksons", "halvexinternationalsdnbhd"], 1],
    [["torviksons", "halvexinternationalsdnbhd"], 1],
  ],
  [
    "Kovex & Sons Ltd (Casey Sample, director) and Zentrix Ltd",
    [["kovexsons", "zentrix"], 1],
    [["kovexsons", "zentrix"], 1],
  ],
  [
    "Casey Sample and Brightwater Ltd f/k/a Jane Doe and Zentrix Ltd",
    [["brightwater", "zentrix"], 2],
    [["brightwater", "zentrix"], 2],
  ],
  // AMPERSAND_FIRM_UNKNOWN_FORM (OPEN, since wave 12): after a name that a legal form ends, a firm
  // whose name holds ` & ` and whose tail has the shape of a person (`Spencer Ltda`: the person rule
  // knows no `Ltda`) is cut there in a title, as round 11 already cut it after `Kovex Ltd`; wave 12
  // made more forms end a name (`DMCC`, `KG`), and wave 14 gives a hyphened firm its form again.
  [
    "Kovex Ltd and Marks & Spencer Ltda",
    [["kovex", "marks"], 1],
    [["kovex", "marksspencerltda"], 0],
  ],
  [
    "Bank of Ostrava DMCC and Marks & Spencer Ltda",
    [["bankofostravadmcc", "marks"], 1],
    [["bankofostravadmcc", "marksspencerltda"], 0],
  ],
  [
    "Petro-chem KG and Marks & Spencer DMCC (In Administration)",
    [["petrochemkg", "marks"], 1],
    [["petrochemkg", "marksspencerdmccinadministration"], 0],
  ],
  // Its hyphened spelling, which wave 13 hid by reading `Agro-trade W.L.L.` as a person; the twin
  // without a hyphen has read so since wave 13 (it added `WLL` and `CJSC`).
  [
    "Agro-trade W.L.L. and Kovex & Zentrix CJSC (in liquidation)",
    [["agrotradewll", "kovex"], 1],
    [["agrotradewll", "kovexzentrixcjscinliquidation"], 0],
  ],
  [
    "Bank of Ostrava W.L.L. and Kovex & Zentrix CJSC (in liquidation)",
    [["bankofostravawll", "kovex"], 1],
    [["bankofostravawll", "kovexzentrixcjscinliquidation"], 0],
  ],
  // The same tail read as a person opens the exception of a part after a person (`sideReadable`):
  // OPEN, since wave 12 (round 11 gave one glued key).
  [
    "Procter & Gamble PAO; Kovex Ltd (Casey Sample)",
    [["procter", "kovex"], 2],
    [["procter", "kovex"], 2],
  ],
  // TWO_FIRMS_GLUED (as round 11): a firm after the F2 firm is glued to it in a title.
  [
    "Kovex & Zentrix Ltd (Casey Sample, director) and Alden Brook Ltd",
    [["kovexzentrixltdandaldenbrook"], 1],
    [["kovexzentrix", "aldenbrook"], 1],
  ],
  [
    "Kovex & Zentrix Ltd (Casey Sample, director); Alden Brook Ltd",
    [["kovexzentrixltdaldenbrook"], 1],
    [["kovexzentrixltdaldenbrook"], 1],
  ],
  [
    "Ernst & Young LLP (Casey Sample, director) & Kovex Ltd",
    [["ernstyoungllpkovex"], 1],
    [["ernstyoungllpkovex"], 1],
  ],
  [
    "Ernst & Young LLP (Casey Sample, director) and Kovex Ltd",
    [["ernstyoungllpandkovex"], 1],
    [["ernstyoung", "kovex"], 1],
  ],
  // PERSON_FIRST_IN_TITLE: a name the person rule does not read (`Capt. ... PhD`) before ` & ` and a
  // firm with a side person is not split here; this one row the rule reads, and splits.
  [
    "Capt. Casey Sample PhD & Brightwater Oy (Jane Doe, director)",
    [["brightwater"], 2],
    [["brightwater"], 2],
  ],
  // RV13-OFSI-F1: a hyphened word before a legal form of any list is a firm's, as in round 11.
  ["Agro-trade Kovex FZE", [["agrotradekovexfze"], 0], [["agrotradekovexfze"], 0]],
  ["Hi-tech FZE", [["hitechfze"], 0], [["hitechfze"], 0]],
  ["Bio-tech Kovex SE", [["biotechkovexse"], 0], [["biotechkovexse"], 0]],
  ["Petro-chem Zentrix FZE", [["petrochemzentrixfze"], 0], [["petrochemzentrixfze"], 0]],
  [
    "Euro-asia Kovex FZE (in liquidation)",
    [["euroasiakovexfzeinliquidation"], 0],
    [["euroasiakovexfzeinliquidation"], 0],
  ],
  [
    "Kovex Ltd, Agro-trade Kovex FZE and Casey Sample",
    [["kovex", "agrotradekovexfze"], 1],
    [["kovex", "agrotradekovexfze"], 1],
  ],
  ["Coca-cola Ltd", [["cocacola"], 0], [["cocacola"], 0]],
  ["Co-op Ltd", [["coop"], 0], [["coop"], 0]],
  ["Hi-tech Trading FZE", [["hitechtradingfze"], 0], [["hitechtradingfze"], 0]],
  ["Agro-trade Kovex FZE and Ji-sung Park", [["agrotradekovexfze"], 1], [["agrotradekovexfze"], 1]],
  // A hyphened given name with no legal form after it is still a person's (wave 13); `Kovex FZE` is
  // read as a person, as it always was (BARE_NAME_UNKNOWN_FORM).
  ["Ji-sung Park", [[], 1], [[], 1]],
  ["Kovex Ltd's director Ban Ki-moon", [["kovex"], 1], [["kovex"], 1]],
  ["Hyun-woo Kim (Kovex FZE)", [[], 2], [[], 2]],
  ["Kovex SE (Ji-sung Park, director)", [[], 2], [[], 2]],
  ["Ji-sung Park and Kovex FZE", [[], 2], [[], 2]],
  ["Kovex FZE and Ji-sung Park", [[], 2], [[], 2]],
  // PERSON_FIRST_IN_TITLE (as round 11 and every version): a person first in a title with no ended
  // name before ` and ` gives the whole slot.
  ["Hyun-woo Kim and Kovex Ltd", [["hyunwookimandkovex"], 0], [["kovex"], 1]],
  // HYPHEN_GIVEN_FORM_SURNAME (OPEN, as round 11): a hyphened given name before a surname that is
  // spelled as a legal form (`Ao`, `Se`, `AS`, `Co`) is read as a firm, its name in the key, as round
  // 11 read it (wave 13 dropped it).
  ["Ji-sung Park AS", [["jisungpark"], 0], [["jisungpark"], 0]],
  ["Ji-sung Park Co", [["jisungpark"], 0], [["jisungpark"], 0]],
  ["Ji-sung Ao", [["jisungao"], 0], [["jisungao"], 0]],
  ["Ji-sung Se", [["jisungse"], 0], [["jisungse"], 0]],
  ["Casey Sample and Ji-sung Ao", [["caseysampleandjisungao"], 0], [["jisungao"], 1]],
  // HYPHEN_LOWER_BRAND: a brand with no legal form is read as a person.
  ["Coca-cola Hellenic", [[], 1], [[], 1]],
  // RV13-OFSI-F3, PERSON_FIRST_IN_TITLE / TWO_FIRMS_GLUED: round 11 split these two rows by accident
  // (it knew no form `FZE` or `EOOD`, and read `Sons FZE`, `Sons EOOD` as a person); it gives the
  // whole glued slot for the same shapes with a form it knew (`Ltd`), and so do wave 13 and 14.
  [
    "Kovex & Sons FZE (in liquidation) and Zentrix Ltd",
    [["kovexsonsfzeinliquidationandzentrix"], 0],
    [["kovexsonsfzeinliquidation", "zentrix"], 0],
  ],
  [
    "Casey Sample and Torvik & Sons EOOD (in liquidation) and Bank of Ostrava OOO",
    [["caseysampleandtorviksonseoodinliquidationandbankofostravaooo"], 0],
    [["torviksonseoodinliquidation", "bankofostravaooo"], 1],
  ],
  [
    "Casey Sample and Torvik & Sons Ltd (in liquidation) and Bank of Ostrava OOO",
    [["caseysampleandtorviksonsltdinliquidationandbankofostravaooo"], 0],
    [["torviksonsltdinliquidation", "bankofostravaooo"], 1],
  ],
  [
    "Kovex & Sons Ltd (in liquidation) and Zentrix Ltd",
    [["kovexsonsltdinliquidationandzentrix"], 0],
    [["kovexsonsltdinliquidation", "zentrix"], 0],
  ],
  // WHOLE_SLOT_GENERIC (as round 11): a whole slot of generic words alone is never gated, so `& Co
  // Ltd` publishes the id `ofsi:` with an empty key, and `Sons Ltd` the id `ofsi:sons`.
  ["& Co Ltd", [[""], 0], [[""], 0]],
  ["Sons Ltd", [["sons"], 0], [["sons"], 0]],
];

/** The legal forms of every list (and two that no list knows, `Oyj`, `Lda`), as RV13-OFSI-F1 reads them. */
const FORMS = [
  ...[
    "Ltd",
    "Limited",
    "PLC",
    "Plc",
    "LLP",
    "LLC",
    "Inc",
    "GmbH",
    "AG",
    "SA",
    "S.A.",
    "BV",
    "B.V.",
  ],
  ...["NV", "N.V.", "SE", "SpA", "S.p.A.", "SRL", "S.r.l.", "SARL", "SAS", "AB", "AS", "ASA", "Oy"],
  ...["Oyj", "Kft", "Zrt", "Nyrt", "AD", "EOOD", "OOD", "DOO", "d.o.o.", "s.r.o.", "a.s.", "OOO"],
  ...[
    "JSC",
    "PJSC",
    "CJSC",
    "ZAO",
    "OAO",
    "PAO",
    "AO",
    "TOO",
    "FZE",
    "FZCO",
    "FZ-LLC",
    "DMCC",
    "WLL",
  ],
  ...["W.L.L.", "ApS", "A/S", "KG", "GmbH Co", "Co", "Corp", "Corporation", "Pte", "Pvt", "Pty"],
  ...["Bhd", "Sdn Bhd", "LP", "Ltda", "KK", "Sp.z.o.o.", "sp. z o.o.", "Lda", "Srl"],
];

describe("ofsiReadingOf, the rows of wave 14", () => {
  it.each(ROWS)("reads %j as wave 14 pins it", (slot, title, description) => {
    expect([keysOf(`${PENALTY}${slot}`, ""), keysOf(DATE_TITLE, `${BY}${slot}`)]).toEqual([
      title,
      description,
    ]);
  });

  it("has 71 forms in its table of RV13-OFSI-F1", () => {
    expect(new Set(FORMS).size).toBe(71);
  });

  // RV13-OFSI-F1: a whole-slot firm whose name holds a hyphened word in lower case and ends in a legal
  // form of any list keeps the key of the whole name, the word first or second, as round 11 gave it.
  it.each(FORMS)("keeps the key of a firm with a hyphened word before the form %j", (form) => {
    for (const slot of [
      `Agro-trade Kovex ${form}`,
      `Kovex Agro-trade ${form}`,
      `Agro-trade ${form}`,
    ]) {
      const key = compactName(shortName(slot));
      expect([slot, keysOf(`${PENALTY}${slot}`, "")]).toEqual([slot, [[key], 0]]);
      expect([slot, keysOf(DATE_TITLE, `${BY}${slot}`)]).toEqual([slot, [[key], 0]]);
    }
  });
});
