/**
 * Wave 13 of the uk_ofsi connector (connectors/ukOfsi.ts, version 9): the rules that wave 12 widened
 * are narrowed back where they moved a firm's key away from the key of the version before it, and
 * the additive fixes of this wave are pinned. Each row gives the keys and the persons that a penalty
 * title and a disclosure's description of the same slot give. The rows marked as residuals pin
 * shapes that the rules do not read, so that a change to them is seen.
 */
import { shortName } from "../../../identity";
import { compactName } from "../../../records/match";
import { ofsiReadingOf } from "../ukOfsi";

const PENALTY = "Imposition of monetary penalty: ";
const DATE_TITLE = "Disclosure notice: 08 September 2025";
const BY = "Disclosure notice of an offence under financial sanctions by ";

/** The keys and the persons of a reading, or its shape when it is no notice. */
function keysOf(title: string, description: string): string | [string[], number] {
  const reading = ofsiReadingOf(title, description);
  if (reading.shape !== "notice") return reading.shape;
  return [reading.parties.map((party) => compactName(shortName(party))), reading.persons];
}

type Reading = string | [string[], number];

/** [slot, title reading, description reading] */
const ROWS: Array<[string, Reading, Reading]> = [
  // RV12-OFSI-P-2: a person before a sole trader's marker leaves the firm after it whole.
  [
    "Casey Quarby d/b/a Svarog Shipping & Trading Company Limited",
    [["svarogshippingtrading"], 1],
    [["svarogshippingtrading"], 1],
  ],
  [
    "Casey Quarby t/a Zeltara Trading & Sons Ltd",
    [["zeltaratradingsons"], 1],
    [["zeltaratradingsons"], 1],
  ],
  [
    "Casey Quarby trading as Marisol Shipping & Trading Company AG",
    [["marisolshippingtrading"], 1],
    [["marisolshippingtrading"], 1],
  ],
  ["Casey Quarby t/a Kovex Trading & Co Ltd", [["kovextrading"], 1], [["kovextrading"], 1]],
  [
    "Casey Quarby trading as Kovex Holdings & Co. KG",
    [["kovexholdingscokg"], 1],
    [["kovexholdingscokg"], 1],
  ],
  [
    "Casey Quarby t/a Kovex Trading and Partners LLP",
    [["kovextradingandpartners"], 1],
    [["kovextrading"], 1],
  ],
  ["Casey Quarby t/a Kovex GmbH & Co. KG", [["kovexgmbhcokg"], 1], [["kovexgmbhcokg"], 1]],
  // Its neighbours: the firm first (the case that wave 12 fixed) and the bracket.
  [
    "Zentrix Limited f/k/a Casey Sample; Kovex Shipping SE",
    [["zentrix", "kovexshippingse"], 1],
    [["zentrix", "kovexshippingse"], 1],
  ],
  ["Zentrix Limited f/k/a Casey Sample", [["zentrix"], 1], [["zentrix"], 1]],
  [
    "Kovex Trading & Sons Ltd t/a Casey Quarby",
    [["kovextradingsons"], 1],
    [["kovextradingsons"], 1],
  ],
  [
    "Casey Quarby (Zeltara Trading & Sons Ltd)",
    [["zeltaratradingsons"], 1],
    [["zeltaratradingsons"], 1],
  ],
  [
    "Kovex Ltd and Casey Quarby t/a Zeltara & Sons Ltd",
    [["kovex", "zeltara"], 1],
    [["kovex", "zeltarasons"], 1],
  ],
  // RV12-OD-2: a part of generic words alone after ` and ` is no tail of the name before it.
  [
    "Standard Chartered Bank and Trust Bank",
    [["standardcharteredbankandtrustbank"], 0],
    [["standardcharteredbank"], 0],
  ],
  [
    "Standard Chartered Bank and Trust Bank and Casey Sample",
    [["standardcharteredbank"], 1],
    [["standardcharteredbank"], 1],
  ],
  ["Wise Payments and Trust Bank", [["wisepaymentsandtrustbank"], 0], [["wisepayments"], 0]],
  ["Citibank and Charity Bank", [["citibankandcharitybank"], 0], [["citibank"], 0]],
  ["Metro Bank and Trust Company Ltd and Casey Sample", [["metrobank"], 1], [["metrobank"], 1]],
  // The residual AND_FIRM: the generic part is cut and gives nothing, the firm keeps r11's key.
  [
    "Svarog Shipping and Trading Company Limited and Casey Sample",
    [["svarogshipping"], 1],
    [["svarogshipping"], 1],
  ],
  // RV12-OD-1, RV12-OFSI-P-7: a party that is the whole slot is never gated.
  ["SAS AB", [["sas"], 0], [["sas"], 0]],
  ["SAS Group", [["sasgroup"], 0], [["sasgroup"], 0]],
  ["AB Bank Limited", [["abbank"], 0], [["abbank"], 0]],
  ["AS Bank", [["asbank"], 0], [["asbank"], 0]],
  ["EV Group", [["evgroup"], 0], [["evgroup"], 0]],
  ["EV Group GmbH", [["evgroup"], 0], [["evgroup"], 0]],
  [
    "Brother International Corporation",
    [["brotherinternational"], 0],
    [["brotherinternational"], 0],
  ],
  ["Corporation Bank", [["corporationbank"], 0], [["corporationbank"], 0]],
  ["Members Trust Company", [["memberstrust"], 0], [["memberstrust"], 0]],
  ["x.ai Corp", [["xai"], 0], [["xai"], 0]],
  ["ftx.com Ltd", [["ftxcom"], 0], [["ftxcom"], 0]],
  ["Partners Group AG", [["partnersgroup"], 0], [["partnersgroup"], 0]],
  ["Sons Ltd", [["sons"], 0], [["sons"], 0]],
  ["The Partners Group AG", [["partnersgroup"], 0], [["partnersgroup"], 0]],
  // A slot in lower case alone is the words of a role: gated as any part is.
  ["its director, the owner", [[], 0], "unreadable"],
  ["Casey Sample (director)", [[], 1], [[], 1]],
  // The residual BRAND_IS_FORM_IN_A_LIST: as a cut part of a list, the gate stays.
  ["SAS Group and Casey Sample", [[], 1], [[], 1]],
  ["AB Bank Limited and Casey Sample", [[], 1], [[], 1]],
  // RV12-DOCS-1: the gate reads the words of the key's name (`shortName`: no leading `The`).
  ["Kovex Ltd and The Trading Company Ltd and Casey Sample", [["kovex"], 1], [["kovex"], 1]],
  ["Kovex Ltd and The Partners Group AG and Casey Sample", [["kovex"], 1], [["kovex"], 1]],
  ["Kovex Ltd and Trading Company Ltd and Casey Sample", [["kovex"], 1], [["kovex"], 1]],
  // RV12-OFSI-P-5: the forms of the former Soviet states, Denmark, the Gulf, Brazil and Belgium.
  [
    "Kovex & Partners CJSC and Casey Quarby",
    [["kovexpartnerscjsc"], 1],
    [["kovexpartnerscjsc"], 1],
  ],
  ["Kovex & Partners PAO and Casey Quarby", [["kovexpartnerspao"], 1], [["kovexpartnerspao"], 1]],
  ["Kovex & Partners WLL and Casey Quarby", [["kovexpartnerswll"], 1], [["kovexpartnerswll"], 1]],
  [
    "Kovex & Partners Ltda and Casey Quarby",
    [["kovexpartnersltda"], 1],
    [["kovexpartnersltda"], 1],
  ],
  ["Kovex & Sons ApS and Casey Quarby", [["kovexsonsaps"], 1], [["kovexsonsaps"], 1]],
  // The forms are no part of the person rule: a surname written as one stays a person's.
  ["Casey Ao and Kovex Ltd", [["caseyaoandkovex"], 0], [["kovex"], 1]],
  ["Kovex Too Ltd", [["kovextoo"], 0], [["kovextoo"], 0]],
  // RV12-OFSI-P-6: `Sons FZ-LLC` after a firm is that firm's tail.
  [
    "Kovrin Holdings & Sons FZ-LLC",
    [["kovrinholdingssonsfzllc"], 0],
    [["kovrinholdingssonsfzllc"], 0],
  ],
  [
    "Kovrin Holdings & Sons FZ-LLC and Casey Sample",
    [["kovrinholdingssonsfzllc"], 1],
    [["kovrinholdingssonsfzllc"], 1],
  ],
  ["Casey Sample & Sons FZ-LLC", [[], 2], [[], 2]],
  // RV12-OFSI-P-1: a given name whose second part a hyphen joins in lower case is a person's.
  ["Ji-sung Park", [[], 1], [[], 1]],
  ["Park Ji-sung", [[], 1], [[], 1]],
  ["Mr Hyun-woo Kim", [[], 1], [[], 1]],
  ["Abdul-rahman Haddad", [[], 1], [[], 1]],
  ["Kovex Ltd and Park Ji-sung", [["kovex"], 1], [["kovex"], 1]],
  ["Kovex Ltd (Ji-sung Park, director)", [["kovex"], 1], [["kovex"], 1]],
  ["Kovex Ltd's director Ban Ki-moon", [["kovex"], 1], [["kovex"], 1]],
  // Its neighbours: a legal form, and a firm's tail before the hyphen, keep the firm.
  ["Coca-cola Ltd", [["cocacola"], 0], [["cocacola"], 0]],
  ["Kovex Co-op", [["kovexcoop"], 0], [["kovexcoop"], 0]],
  ["Kovex Co-operative", [["kovexcooperative"], 0], [["kovexcooperative"], 0]],
  // The residual HYPHEN_LOWER_BRAND: a brand of that shape with no form is read as a person.
  ["Coca-cola Hellenic", [[], 1], [[], 1]],
  // RV12-OFSI-P-4: a comma-set legal form ends the name before the person, its alias aside.
  ["Kovexbank, N.A. (KNA) and Casey Quarby", "unreadable", "unreadable"],
  ["Kovex, Ltd (KCL) and Casey Quarby", "unreadable", "unreadable"],
  ["Kovexbank, N.A. and Casey Quarby", "unreadable", "unreadable"],
  // A tail of the shape of a person after an ended name makes the slot a list again, so the persons
  // before the firm never reach its key (wave 12 kept the whole slot as one key with the persons).
  [
    "Priyanka McNakamura Snr. & Jean-Luc Quarby & Tarkent Management & Söhne FZE (In Administration)",
    [["tarkentmanagementsöhnefze"], 2],
    [["tarkentmanagementsöhnefze"], 2],
  ],
  [
    "Casey Sample & Kovex Management & Söhne FZE",
    [["kovexmanagementsöhnefze"], 1],
    [["kovexmanagementsöhnefze"], 1],
  ],
  [
    "Casey Sample and Kovex Payments & Sons FZE",
    [["kovexpaymentssonsfze"], 1],
    [["kovexpaymentssonsfze"], 1],
  ],
  [
    "Kovex Management & Söhne FZE",
    [["kovexmanagementsöhnefze"], 0],
    [["kovexmanagementsöhnefze"], 0],
  ],
  [
    "Brightwater Bank & Sons DMCC as well as Blue Halcyon Shipping Pte Ltd",
    [["brightwaterbanksonsdmcc", "bluehalcyonshipping"], 0],
    [["brightwaterbanksonsdmcc", "bluehalcyonshipping"], 0],
  ],
  // The residual STATUS_BEFORE_MARKER (RV12-OFSI-P-3, as in r11): a bracket before a marker hides
  // the side person from a title's list reading.
  [
    "Kovex Ltd (in liquidation) f/k/a Casey Quarby and Zeltara Ltd",
    [["kovexltdinliquidationfkacaseyquarbyandzeltara"], 0],
    [["kovex", "zeltara"], 1],
  ],
];

describe("ofsiReadingOf, the rows of wave 13", () => {
  it.each(ROWS)("reads %j as wave 13 pins it", (slot, title, description) => {
    expect(keysOf(`${PENALTY}${slot}`, "")).toEqual(title);
    expect(keysOf(DATE_TITLE, `${BY}${slot}`)).toEqual(description);
  });
});
