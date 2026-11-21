/**
 * Wave 15 of the uk_ofsi connector (connectors/ukOfsi.ts, version 11): a firm whose name holds ` & `
 * and that is listed after a firm with a side person (a bracket, a marker) keeps its whole key
 * (RV14-OFSI-FA). Each row gives the keys and the persons that a penalty title and
 * a disclosure's description of the same slot give, so that a change to any of them is seen.
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
  // RV14-OFSI-FA: the first firm has a side person, so the slot is read part by part; the ` & ` of the
  // second firm is no cut (version 10 gave `ernst`, `young`; `tate`, `lyle`; `marks`, `spencer`).
  [
    "Kovex Ltd (Casey Sample, director) and Ernst & Young LLP",
    [["kovex", "ernstyoung"], 1],
    [["kovex", "ernstyoung"], 1],
  ],
  [
    "Kovex Ltd (formerly Casey Sample); Tate & Lyle PLC",
    [["kovex", "tatelyle"], 1],
    [["kovex", "tatelyle"], 1],
  ],
  [
    "Kovex Ltd (Casey Sample, director) and Marks & Spencer Ltd",
    [["kovex", "marksspencer"], 1],
    [["kovex", "marksspencer"], 1],
  ],
  [
    "Kovex Ltd (Casey Sample, director) and Tate & Lyle Ltd",
    [["kovex", "tatelyle"], 1],
    [["kovex", "tatelyle"], 1],
  ],
  [
    "Kovex Ltd (Casey Sample, director) and Smith & Nephew plc",
    [["kovex", "smithnephew"], 1],
    [["kovex", "smithnephew"], 1],
  ],
  // Version 10 lost the second Johnson (two cut parts of one key): the firm was read as `johnson`.
  [
    "Kovex Ltd (Casey Sample, director) and Johnson & Johnson Ltd",
    [["kovex", "johnsonjohnson"], 1],
    [["kovex", "johnsonjohnson"], 1],
  ],
  [
    "Hydro-tech Vantorp DMCC (Thomas Whitcombe, sole director) and Tate & Lyle Ltd",
    [["hydrotechvantorpdmcc", "tatelyle"], 1],
    [["hydrotechvantorpdmcc", "tatelyle"], 1],
  ],
  [
    "The Hydro-tech ZAO (ABC) (Ahmed Farouk); Ernst & Young Holdings Ltd",
    [["hydrotechzao", "ernstyoungholdings"], 1],
    [["hydrotechzao", "ernstyoungholdings"], 1],
  ],
  [
    "Kovex Ltd f/k/a Casey Sample and Ernst & Young LLP",
    [["kovex", "ernstyoung"], 1],
    [["kovex", "ernstyoung"], 1],
  ],
  [
    "Kovex Ltd t/a Casey Sample and Ernst & Young LLP",
    [["kovex", "ernstyoung"], 1],
    [["kovex", "ernstyoung"], 1],
  ],
  [
    "Kovex Ltd d/b/a Casey Sample and Ernst & Young LLP",
    [["kovex", "ernstyoung"], 1],
    [["kovex", "ernstyoung"], 1],
  ],
  [
    "Kovex Ltd (Casey Sample, director), Ernst & Young LLP",
    [["kovex", "ernstyoung"], 1],
    [["kovex", "ernstyoung"], 1],
  ],
  [
    "Kovex Ltd (formerly Casey Sample), Tate & Lyle PLC",
    [["kovex", "tatelyle"], 1],
    [["kovex", "tatelyle"], 1],
  ],
  [
    "Kovex Ltd (formerly Casey Sample) & Tate & Lyle PLC",
    [["kovex", "tatelyle"], 1],
    [["kovex", "tatelyle"], 1],
  ],
  [
    "Kovex Limited (in liquidation) (Casey Sample, director) and Ernst & Young LLP",
    [["kovex", "ernstyoung"], 1],
    [["kovex", "ernstyoung"], 1],
  ],
  // The second firm with a status or a side person of its own.
  [
    "Kovex Ltd (Casey Sample, director) and Ernst & Young LLP (in liquidation)",
    [["kovex", "ernstyoung"], 1],
    [["kovex", "ernstyoungllpinliquidation"], 1],
  ],
  [
    "Kovex Ltd (Casey Sample, director) and Ernst & Young LLP (Jane Doe, director)",
    [["kovex", "ernstyoung"], 2],
    [["kovex", "ernstyoung"], 2],
  ],
  // A list of three firms: the third is never glued to the second.
  [
    "Kovex Ltd (Casey Sample, director) and Marks & Spencer Ltd and Zentrix Ltd",
    [["kovex", "marksspencer", "zentrix"], 1],
    [["kovex", "marksspencer", "zentrix"], 1],
  ],
  [
    "Kovex Ltd (Casey Sample, director), Ernst & Young LLP and Zentrix Ltd",
    [["kovex", "ernstyoung", "zentrix"], 1],
    [["kovex", "ernstyoung", "zentrix"], 1],
  ],
  // Only the first ` & ` after a part of one word-group joins: the part after a second ` & ` follows a
  // group of two parts, and is cut in the title (the description path reads the slot another way and
  // keeps all three words in one key).
  [
    "Kovex Ltd (Casey Sample, director) and Marks & Spencer & Zentrix Ltd",
    [["kovex", "marksspencer", "zentrix"], 1],
    [["kovex", "marksspencerzentrix"], 1],
  ],
  // A part before ` & ` that ends a name (a legal form, a word of an organisation, a status) is a firm
  // of its own: the cut stays, as at version 10.
  [
    "Kovex Ltd (Casey Sample, director) and Zentrix Ltd & Alden Brook Ltd",
    [["kovex", "zentrix", "aldenbrook"], 1],
    [["kovex", "zentrixltdaldenbrook"], 1],
  ],
  [
    "Kovex Ltd (Casey Sample, director) and Zentrix Shipping & Alden Ltd",
    [["kovex", "zentrixshipping", "alden"], 1],
    [["kovex", "zentrixshippingalden"], 1],
  ],
  [
    "Kovex Ltd (Casey Sample, director) and Zentrix Bank & Alden Ltd",
    [["kovex", "zentrixbank", "alden"], 1],
    [["kovex", "zentrixbankalden"], 1],
  ],
  [
    "Kovex Ltd (Casey Sample, director) and Kovex Trading & Alden Ltd",
    [["kovex", "kovextrading", "alden"], 1],
    [["kovex", "kovextradingalden"], 1],
  ],
  [
    "Kovex Ltd (Casey Sample, director) and Zentrix (in liquidation) & Alden Ltd",
    [["kovex", "zentrix", "alden"], 1],
    [["kovex", "zentrixinliquidationalden"], 1],
  ],
  // A ` & ` right after the part with the side person: the part before it holds the person, so no join.
  [
    "Kovex Ltd (Casey Sample, director) & Zentrix Ltd",
    [["kovex", "zentrix"], 1],
    [["kovex", "zentrix"], 1],
  ],
  // A person of its own on either side of the ` & `: no join (the person is counted, never a key).
  [
    "Kovex Ltd (Casey Sample, director) and Jane Doe & Zentrix Ltd",
    [["kovex", "zentrix"], 2],
    [["kovex", "janedoezentrix"], 1],
  ],
  [
    "Kovex Ltd (Casey Sample, director) and Ernst & Jane Doe",
    [["kovex", "ernst"], 2],
    [["kovex", "ernstjanedoe"], 1],
  ],
  // The tails that joined before this wave still join.
  [
    "Kovex Ltd (Casey Sample, director) and Kovex & Sons Ltd",
    [["kovex", "kovexsons"], 1],
    [["kovex", "kovexsons"], 1],
  ],
  [
    "Kovex Ltd (Casey Sample, director) and Zentrix & Co Ltd",
    [["kovex", "zentrix"], 1],
    [["kovex", "zentrix"], 1],
  ],
  [
    "Kovex Ltd (Casey Sample, director) and Zentrix GmbH & Co. KG",
    [["kovex", "zentrixgmbhcokg"], 1],
    [["kovex", "zentrixgmbhcokg"], 1],
  ],
  [
    "Kovex Ltd (Casey Sample, director) and Alden Brook Ltd",
    [["kovex", "aldenbrook"], 1],
    [["kovex", "aldenbrook"], 1],
  ],
  // Controls. No side person: the slot is one party, as at version 7.
  ["Kovex Ltd and Ernst & Young LLP", [["kovexltdandernstyoung"], 0], [["kovex", "ernstyoung"], 0]],
  // A person who is a part of their own: the slot is a list as at version 7, every ` & ` cut. The
  // second row has a side person too, but not every person is a side person: no join.
  [
    "Kovex Ltd and Ernst & Young LLP and Casey Sample",
    [["kovex", "ernst", "young"], 1],
    [["kovex", "ernstyoung"], 1],
  ],
  [
    "Kovex Ltd (Casey Sample, director) and Ernst & Young LLP and Casey Sample",
    [["kovex", "ernst", "young"], 2],
    [["kovex", "ernstyoung"], 2],
  ],
  [
    "Casey Sample and Kovex Ltd (Jane Doe, director) and Ernst & Young LLP",
    [["kovex", "ernst", "young"], 2],
    [["kovex", "ernstyoung"], 2],
  ],
  // The firm with ` & ` comes BEFORE the part with the side person: cut as at version 7.
  [
    "Ernst & Young LLP and Kovex Ltd (Casey Sample, director)",
    [["ernst", "young", "kovex"], 1],
    [["ernstyoung", "kovex"], 1],
  ],
  [
    "Kovex Ltd (Casey Sample, director); Jane Doe (Zentrix Ltd) and Ernst & Young LLP",
    [["kovex", "zentrix", "ernst", "young"], 2],
    [["kovex", "zentrix", "ernstyoung"], 2],
  ],
  // Rows that round 11 already read as a list (a status on the second firm, a third part, a side person
  // of the second firm's own, ` & ` between the two firms) and cut at every ` & `, as version 10 did: the
  // second firm now keeps its whole key in the title too. The description path is as before.
  [
    "Zentrix Trading Limited (director Casey Sample), Procter & Gamble Inc (In Administration); Ernst & Young BV",
    [["zentrixtrading", "proctergamble", "ernstyoung"], 1],
    [["zentrixtrading", "proctergambleincinadministrationernstyoung"], 1],
  ],
  [
    "Halden Shipping BV (Omar Lindqvist, director) & Allen & Overy Pty Ltd (In Administration) and Kovrin Services GmbH",
    [["haldenshipping", "allenovery", "kovrinservices"], 1],
    [["haldenshipping", "allenovery", "kovrinservices"], 1],
  ],
  [
    "Kovex Ltd (director Jane Doe) & Ernst & Young ApS d/b/a Jane Doe",
    [["kovex", "ernstyoungaps"], 2],
    [["kovex", "ernstyoungaps"], 2],
  ],
  [
    "Ostrava Bank Corp f/k/a Casey Sample, Black & Decker Inc (In Administration) and Kovrin Services AS",
    [["ostravabank", "blackdecker", "kovrinservices"], 1],
    [["ostravabank", "blackdeckerincinadministration", "kovrinservices"], 1],
  ],
  // The named residual: ` and ` inside the second firm's name is a cut (`Morgan and Wexley Ltd`).
  [
    "Kovex Ltd (Casey Sample, director) and Morgan and Wexley Ltd",
    [["kovex", "morgan", "wexley"], 1],
    [["kovex", "morgan", "wexley"], 1],
  ],
  // Round 15 review (RV15O-1): a part before ` & ` that ends in a TAIL word (`Sons`) is a firm's tail, so
  // the join stops there (the condition `endsInTailWord`): without it `Halvex 3 Sons & Alden Ltd` would be
  // one key in the title too. The description path reads the same slot as one firm.
  [
    "Kovex Ltd (Casey Sample, director) and Halvex 3 Sons & Alden Ltd",
    [["kovex", "halvex3sons", "alden"], 1],
    [["kovex", "halvex3sonsalden"], 1],
  ],
  // Round 15 review (RV15O-2): the join starts AFTER the part that has the side person (`cutAt > sideAt`),
  // never at it: a firm listed BEFORE the side-person firm is cut as round 11 cut it.
  [
    "Zentrix Ltd, Alpha & Kovex Ltd (Casey Sample, director)",
    [["zentrix", "alpha", "kovex"], 1],
    [["zentrix", "alphakovex"], 1],
  ],
  [
    "Zentrix Ltd; Smith & Kovex Ltd (formerly Casey Sample)",
    [["zentrix", "smith", "kovex"], 1],
    [["zentrix", "smith", "kovex"], 1],
  ],
  // The named residual TWO_FORMLESS_FIRMS_GLUED (RV15O-3): in a list that has a side person, ` & ` between
  // two parts that have no legal form is read as the inside of one firm's name (`Barclays & HSBC`), where
  // round 11 cut it into two keys. No person token, no other firm's key: a recall cost.
  [
    "Zentrix Ltd, Kovex Ltd (Casey Sample, director), Barclays & HSBC",
    [["zentrix", "kovex", "barclayshsbc"], 1],
    [["zentrix", "kovex", "barclayshsbc"], 1],
  ],
  [
    "Kovex Ltd (Casey Sample, director), Alden Ltd (in liquidation), Vitol & Glencore AG",
    [["kovex", "alden", "vitolglencore"], 1],
    [["kovex", "aldenltdinliquidation", "vitolglencore"], 1],
  ],
  // The named residual (RV15O-4): the formless ` & ` firm has a side person of its own, so the rule is off
  // (the part holds no legal form, so it is no `besidesAName`): cut as at versions 7 to 10.
  [
    "Kovex Ltd (Casey Sample, director) and Marks & Spencer (Jane Brook, director)",
    [["kovex", "marks", "spencer"], 2],
    [["kovex", "marksspencer"], 2],
  ],
];

describe("ofsiReadingOf, the rows of wave 15", () => {
  it.each(ROWS)("reads %j as wave 15 pins it", (slot, title, description) => {
    expect([keysOf(`${PENALTY}${slot}`, ""), keysOf(DATE_TITLE, `${BY}${slot}`)]).toEqual([
      title,
      description,
    ]);
  });
});
