/**
 * The frozen corpus of the uk_ofsi and uk_atrs connectors (connectors/ukOfsi.ts, version 11;
 * connectors/ukAtrs.ts, version 10). The fixture holds a fixed sample of invented slots and supplier
 * cells, each with the reading that the version of round 11 (uk_ofsi 7, uk_atrs 8) gave it: the
 * parties and the count of persons of a notice, or the shape it was read as; the verdict on the
 * Companies House number and the suppliers of a cell. Every row whose move is one that the review of
 * round 13 names (a person's name into a key, a whole slot losing its only key, a key gained, a shape
 * changed; a number given that was withheld) is in it, with a sample of the rest.
 *
 * The test reads each row with the code of the tree and counts the classes of its move against that
 * reading. The counts are pinned: a change of either connector that moves one row more or fewer to any
 * class makes it fail, so that the move is seen and judged before the counts are written again.
 *
 * The reviewed rows of waves 14 and 15 (source `w14:*`, `w15:*`) and every row whose reading holds a
 * person's name that round 11's did not are pinned row by row too (`ofsiNow`: the keys and persons of
 * the tree, or its shape), so that a change inside one class is seen as well.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { shortName } from "../../../identity";
import { compactName } from "../../../records/match";
import { createUkAtrsConnector } from "../ukAtrs";
import { ofsiReadingOf } from "../ukOfsi";
import { fakeFetch } from "./helpers/kitContract";

jest.setTimeout(300_000);

/** A row of a title and a description, with the parties and persons of round 11 or the shape it gave. */
type OfsiRow = [string, string, string, string[], number] | [string, string, string, string];
/** A row of a title and a description with the keys and persons of the tree, or the shape it gives. */
type OfsiNowRow = [string, string, string[], number] | [string, string, string];
/** A supplier cell, its kind, its source, and the verdict of round 11. */
type AtrsRow = [string, string, string, string];

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "ukOfsiAtrsCorpus.r11.json"), "utf8"),
) as { ofsi: OfsiRow[]; atrs: AtrsRow[]; ofsiNow: OfsiNowRow[] };

interface Reading {
  shape: string;
  keys: string[];
  parties: string[];
  persons: number;
}

const keyOf = (party: string): string => compactName(shortName(party));

/** The words of the invented persons' names of the corpus: a party that holds one holds a person. */
const PERSON_WORDS = new Set(
  [
    ...["casey", "jane", "volga", "alden", "anne-marie", "omar", "quilla", "ji-sung", "ki-moon"],
    ...["hyun-woo", "abdul-rahman", "sample", "quarby", "quarrin", "brook", "doe", "lindqvist"],
    ...["dupont", "casimir", "josé", "søren", "zoë", "mehmet", "ngozi", "wei", "aleksandr"],
    ...["siobhán", "jean-luc", "bartholomew", "ömer", "łukasz", "ioana", "priyanka", "tadhg"],
    ...["olumide", "thistlewood", "okonkwo", "brannagh", "velasquez", "haddad", "rashidov"],
    ...["nakamura", "fairweather", "szymanski", "penhaligon", "abernethy", "dvořák", "ivanenko"],
    ...["oyelaran", "zyqa", "vorlin", "quessa", "ilvane", "draxa", "brazzle", "tromwick"],
    ...["ovelny", "pexwold", "grumlet"],
  ].map((word) => word.normalize("NFC")),
);

/** Whether a party holds a person's name: one of its words, or a piece after a hyphen or an apostrophe. */
function holdsPerson(party: string): boolean {
  for (const raw of party.normalize("NFC").split(/\s+/)) {
    const word = raw.toLowerCase().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
    if (word === "") continue;
    if (PERSON_WORDS.has(word)) return true;
    for (const piece of word.split(/[\p{Pd}'’]/u)) {
      if (PERSON_WORDS.has(piece)) return true;
      if (piece.startsWith("mc") && PERSON_WORDS.has(piece.slice(2))) return true;
    }
  }
  return false;
}

/** The classes of the move of a reading from round 11's (`base`) to the tree's (`now`). */
function classesOf(base: Reading, now: Reading): string[] {
  const out: string[] = [];
  if (base.shape !== now.shape) out.push(`shape ${base.shape}->${now.shape}`);
  const before = new Set(base.keys);
  const after = new Set(now.keys);
  const lostAt = base.keys.flatMap((key, index) => (after.has(key) ? [] : [index]));
  const gained = now.keys.filter((key) => !before.has(key));
  const partyOf = (key: string): string => now.parties[now.keys.indexOf(key)];
  const lostPerson = lostAt.some((index) => holdsPerson(base.parties[index]));
  if (lostAt.length > 0 && gained.length > 0) {
    const lost = lostAt.map((index) => base.keys[index]);
    if (gained.some((key) => holdsPerson(partyOf(key)))) out.push("different: person into key");
    else if (
      lostPerson &&
      gained.every((key) => lost.some((old) => old.startsWith(key) || old.includes(key)))
    )
      out.push("different: person cut out");
    else if (
      gained.every(
        (key) =>
          base.keys.some((old) => key.startsWith(old)) || lost.some((old) => key.includes(old)),
      )
    )
      out.push("different: joined");
    else if (gained.every((key) => lost.some((old) => old.startsWith(key))))
      out.push("different: shortened");
    else out.push("different: other");
  } else if (lostAt.length > 0) {
    if (lostPerson) out.push("lost: key with a person");
    else if (base.keys.length === 1 && base.persons === 0 && now.keys.length === 0)
      out.push("lost: whole single");
    else out.push("lost: cut part");
  } else if (gained.length > 0) {
    out.push(
      gained.some((key) => holdsPerson(partyOf(key))) ? "gained: person key" : "gained: key",
    );
  }
  if (base.persons !== now.persons)
    out.push(base.persons < now.persons ? "persons up" : "persons down");
  const personBefore = base.parties.some(holdsPerson);
  const personNow = now.parties.some(holdsPerson);
  if (personNow && !personBefore) out.push("person token new");
  if (personBefore && !personNow) out.push("person token gone");
  return out.length > 0 ? out : ["same"];
}

function readingNow(title: string, description: string): Reading {
  const reading = ofsiReadingOf(title, description);
  if (reading.shape !== "notice")
    return { shape: reading.shape, keys: [], parties: [], persons: 0 };
  return {
    shape: "notice",
    keys: reading.parties.map(keyOf),
    parties: reading.parties,
    persons: reading.persons,
  };
}

function readingBefore(row: OfsiRow): Reading {
  if (row.length === 4) return { shape: row[3], keys: [], parties: [], persons: 0 };
  return { shape: "notice", keys: row[3].map(keyOf), parties: row[3], persons: row[4] };
}

const tallyOf = (classes: Iterable<string>): Record<string, number> => {
  const tally: Record<string, number> = {};
  for (const name of classes) tally[name] = (tally[name] ?? 0) + 1;
  return Object.fromEntries(Object.entries(tally).sort(([a], [b]) => (a < b ? -1 : 1)));
};

const SEARCH_URL =
  "https://www.gov.uk/api/search.json?filter_content_store_document_type=algorithmic_transparency_record&count=1000&start=0&order=-public_timestamp&fields[]=title&fields[]=description&fields[]=link&fields[]=public_timestamp&fields[]=content_store_document_type&fields[]=format&fields[]=first_published_at&fields[]=primary_publishing_organisation&fields[]=algorithmic_transparency_record_organisation&fields[]=algorithmic_transparency_record_organisation_type&fields[]=algorithmic_transparency_record_phase&fields[]=algorithmic_transparency_record_function&fields[]=algorithmic_transparency_record_region&fields[]=algorithmic_transparency_record_atrs_version&fields[]=algorithmic_transparency_record_date_published&fields[]=indexable_content";

/** The text of a record whose supplier is the cell and whose Companies House number is 12345678. */
const contentOf = (cell: string): string =>
  [
    ...["Tier 1 - Summary information", "", "1 - Name", "", "Example tool", ""],
    ...["2.3 - External supplier involvement", "", "Yes", "", "2.3.1 - External supplier", ""],
    ...[cell, "", "2.3.2 - Companies House Number", "", "12345678", ""],
    ...["2.3.3 - External supplier role", "", "Builds it.", ""],
  ].join("\n");

/** The verdict of the tree on a cell: GIVE or withhold the number, and the keys of the suppliers. */
async function verdictOf(cell: string): Promise<string> {
  const connector = createUkAtrsConnector({ sleep: async () => undefined });
  const result = {
    algorithmic_transparency_record_atrs_version: "v4.0",
    algorithmic_transparency_record_date_published: "2026-03-04",
    algorithmic_transparency_record_organisation: "example-borough-council",
    algorithmic_transparency_record_phase: "production",
    content_store_document_type: "algorithmic_transparency_record",
    format: "algorithmic_transparency_record",
    indexable_content: contentOf(cell),
    link: "/algorithmic-transparency-records/example-tool-1",
    public_timestamp: "2026-03-05T10:11:12Z",
    title: "Example tool 1",
  };
  const body = JSON.stringify({ results: [result], total: 1, start: 0 });
  const snapshot = await connector.download(
    fakeFetch({ [SEARCH_URL]: { body, contentType: "application/json" } }),
    {},
  );
  if (snapshot === "unchanged") throw new Error("The fake fetch answered 304 to a first request.");
  const { records } = connector.parse(snapshot);
  if (records.length === 0) return "none";
  const given = records.some((record) => record.matchKeys.includes("regno:12345678"));
  const keys = records.map((record) => record.sourceRecordId.replace(/^atrs:/, "")).sort();
  return `${given ? "GIVE" : "withhold"} ${keys.join(",")}`;
}

function verdictMoveOf(before: string, now: string): string {
  if (before === now) return "same";
  const [was] = before.split(" ");
  const [is] = now.split(" ");
  return was === is ? `${was}: keys changed` : `${was}->${is}`;
}

/**
 * The rows of the fixture and the classes of their moves from round 11 to the tree (wave 14). Wave 14
 * added a reviewed block of rows (source `w14:*`: a firm whose name holds ` & ` or ` and ` with a side
 * person, a hyphened word before a legal form of every list, the named residuals of uk_ofsi and
 * uk_atrs, and the 51 rows of its own hunt that a hyphened firm's form now makes a list:
 * AMPERSAND_FIRM_UNKNOWN_FORM), and moved six rows of wave 13 back to the reading of round 11
 * (`person into key` -> `same`: a name the person rule does not read, then ` & ` and a firm with a
 * side person). Wave 15 added a reviewed block of 48 rows (source `w15:*`: a firm with a side person
 * first and a firm whose name holds ` & ` after it, RV14-OFSI-FA, with its neighbours and controls).
 * 23 are `different: other`: round 11 glued the slot into one key, and the tree gives each firm its
 * own key, except the named residual `Morgan and Wexley Ltd` (` and ` inside a name is still a cut).
 * 4 are `different: person cut out`: round 11 put the marker's person into the glued key; in one of
 * them (`Casey Sample and Kovex Ltd (Jane Doe, director) and Ernst & Young LLP`, a person of a part of
 * its own) the tree still cuts `Ernst & Young`. 5 are `different: person into key`: the firm `Alden
 * Brook Ltd`, whose words the classifier takes for a person's, and `Zentrix Shipping & Alden Ltd`,
 * cut after a word of an organisation as at version 10. 4 are `different: joined`: rows that round 11
 * cut at every ` & ` too (a status, a third part, a side person of the second firm's own), whose
 * second firm now keeps its whole key. 12 are `same`. No row of the earlier blocks changed its
 * classes; 9 changed their keys inside their class: 6 rows of the hunt of wave 14 (a firm with a side
 * person first, then `Ernst & Young`, `Procter & Gamble`, `Kestrin & Halvex Trading` or `Johnson &
 * Johnson`: now one key each), and 3 invented rows with a person beside the ` & ` (before it or
 * after it) that the person rule does not read: their key held the person before and holds it
 * still, and in one of them (`... José van der Velasquez & Kovrin Services Corporation`) the clean key
 * `kovrinservices` of version 10 is now glued to that part.
 */
const OFSI_ROWS = 2644;
const OFSI_CLASSES: Record<string, number> = {
  "different: joined": 82,
  "different: other": 73,
  "different: person cut out": 69,
  "different: person into key": 310,
  "different: shortened": 10,
  "gained: key": 44,
  "gained: person key": 14,
  "lost: cut part": 110,
  "lost: key with a person": 44,
  "lost: whole single": 149,
  "person token gone": 113,
  "person token new": 21,
  "persons down": 63,
  "persons up": 288,
  same: 1739,
  "shape notice->unreadable": 19,
  "shape unreadable->notice": 49,
};
/** The rows pinned row by row: the 332 rows of wave 14, the 48 of wave 15, and the rest with a new person token. */
const OFSI_NOW_ROWS = 400;
const ATRS_ROWS = 1734;
const ATRS_CLASSES: Record<string, number> = {
  "gen GIVE->withhold": 37,
  "gen same": 202,
  "gen withhold->GIVE": 350,
  "one GIVE->none": 1,
  "one GIVE->withhold": 4,
  "one same": 84,
  "one withhold->GIVE": 19,
  "one withhold->none": 165,
  "probe GIVE->none": 1,
  "probe GIVE->withhold": 28,
  "probe same": 283,
  "probe withhold->GIVE": 7,
  "probe withhold: keys changed": 3,
  "two GIVE->withhold": 42,
  "two same": 495,
  "two withhold->GIVE": 9,
  "two withhold->none": 4,
};

describe("the frozen corpus of uk_ofsi and uk_atrs against round 11", () => {
  it("moves the slots of uk_ofsi to the pinned classes", () => {
    const classes = FIXTURE.ofsi.flatMap((row) =>
      classesOf(readingBefore(row), readingNow(row[0], row[1])),
    );
    expect([FIXTURE.ofsi.length, tallyOf(classes)]).toEqual([OFSI_ROWS, OFSI_CLASSES]);
  });

  it("reads the pinned rows of uk_ofsi as the tree pins them, row by row", () => {
    const moved = FIXTURE.ofsiNow.flatMap((row) => {
      const now = readingNow(row[0], row[1]);
      const got: OfsiNowRow =
        now.shape === "notice"
          ? [row[0], row[1], now.keys, now.persons]
          : [row[0], row[1], now.shape];
      return JSON.stringify(got) === JSON.stringify(row) ? [] : [{ pinned: row, now: got }];
    });
    expect([FIXTURE.ofsiNow.length, moved]).toEqual([OFSI_NOW_ROWS, []]);
  });

  it("moves the verdicts of uk_atrs to the pinned classes", async () => {
    const classes: string[] = [];
    for (const [cell, kind, , before] of FIXTURE.atrs) {
      classes.push(`${kind} ${verdictMoveOf(before, await verdictOf(cell))}`);
    }
    expect([FIXTURE.atrs.length, tallyOf(classes)]).toEqual([ATRS_ROWS, ATRS_CLASSES]);
  });
});
