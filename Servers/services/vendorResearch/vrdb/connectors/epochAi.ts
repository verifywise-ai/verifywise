/**
 * The Epoch AI "Data on AI models" as a mirrored list of the vendor risk database: one CSV file
 * (`all_ai_models.csv`, 57 columns, about 3,700 rows, newest model first) of the AI models that
 * Epoch AI tracks, with the organisations that developed each. Epoch publishes it under a Creative
 * Commons Attribution licence ("free to use, distribute, and reproduce provided the source and
 * authors are credited"), at a fixed address, with a weak ETag that a conditional GET can use.
 *
 * The record unit is the ORGANISATION, not the model: a record counts the models whose developers
 * include one organisation that Epoch itself labels Industry (381 records from 2,513 rows today),
 * with the first year and the newest day of publication, how many models Epoch marks as frontier
 * (among the five largest by training compute at release) and how many have open weights, and the
 * three newest models by name. It is context for an analysis: it describes model releases as Epoch
 * classifies them, and says nothing about safety or about the conduct of the organisation. The
 * match is by the NAME of the organisation alone (weak). No page shows one organisation, and the
 * address of a record names it.
 *
 * Natural persons. The `Authors` column is all persons and is never read; nor is the Hugging Face
 * developer id (handles that may be personal), the abstract, the reference, the links, the notes
 * (free text of third parties and editors, with e-mail addresses) and the technical columns. The
 * `Organization` cell names organisations: the 1,030 tokens of the real file were read in full and
 * none was a person. No rule tells persons apart, so a person that a later file names in that cell
 * would be a key: that is a residual, which the weak match and the use of the list as context only
 * limit.
 *
 * Rule O (the organisation cells). `Organization` and `Organization categorization` are two comma
 * joined lists whose items line up by position (95.3 % of the rows with an organisation today).
 * A list cell of more than 2,000 characters (the longest real one has 759) is no list of this
 * file: the row does not line up, and gives no key. Nothing of such a cell is read, so that no list
 * is ever cut and no name is ever the piece of one. A cell is split on a comma, except one that a
 * legal form follows (`Acme, Inc.` is one name; Inc, Ltd, LLC, Corp, GmbH, Co, SA, AG, PLC,
 * Limited, Corporation, as written, to the end of the word). An item is an organisation of the
 * Industry kind only when the two lists have the same number of items and the label at its
 * position is exactly `Industry`: a row whose lists differ gives no key. An item is cleaned as a
 * line, its parentheticals are cut (an unclosed `(` to the end) and the blanks collapsed. The key
 * is `compactName(shortName(item))`, which is also the id of the record; one with fewer than four
 * letters and digits gives no key (IBM, xAI, Z.ai, AT&T). A model counts once for each distinct
 * key of its row. A company that renames itself is a new key, one withdrawal and one insert; a
 * label that Epoch corrects adds or withdraws a record.
 *
 * What the file is. The header must hold the columns that are read, by name (a column more is fine,
 * and every row must be as wide as the header); `Model`, the key of the list, must be one text per
 * row, never twice; fewer than 3,000 rows is not this list, and neither is a file in which fewer
 * than 90 % of the rows with an organisation line up (a row with a list cell over 2,000 characters
 * does not; a changed format would otherwise empty the Industry set without a word). A row that has
 * no model name, or an organisation item too long to be one, or a flag cell (`Frontier model`,
 * `Open model weights?`) of more than a megabyte, is not read: it is counted, and the kit's
 * allowance decides whether the sync goes on. A flag cell of that size is refused before anything of
 * its row is kept, whatever the row holds: its first megabyte can say one thing and the cell
 * another. A text that is too long is never cut and read (`lineWithin`): a name that ends in the
 * marker of a cut is no name. The version of the list is the newest day of the `Last modified`
 * column.
 *
 * What a record shows of an organisation. The title and the text show the first spelling cut at 80
 * characters; the identifiers and the names hold it whole (at most 200 characters, the cap of an
 * item): an identifier is never a cut text.
 */
import { shortName } from "../../identity";
import { compactName } from "../../records/match";
import { sentence } from "../../records/sentence";
import type { ParsedRecord } from "../types";
import { LINE_INPUT_MAX, compareText, dayText, lineOf, lineWithin } from "./kit/clean";
import { type Fetched, type ReadResult, createFileConnector } from "./kit/fileConnector";
import { RECORD_SUMMARY_MAX, recordOf } from "./kit/record";
import { summaryWithClosing } from "./kit/summary";
import { cellsOf, columnsOf, readCsvText } from "./kit/table";
import { textOf } from "./kit/text";
import type { Connector } from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const EPOCH_AI_RECORD_MARK = "Epoch AI Data on AI Models";

const FILE_URL = "https://epoch.ai/data/all_ai_models.csv";
/** The documentation page of the data: a record has no page of its own, so the address names the organisation. */
const RECORD_URL = "https://epoch.ai/data/ai-models-documentation?organisation=";
/** The file is 6.9 MB today and grows by about 0.5 to 0.9 MB a year. */
const MAX_BYTES = 16 * 1024 * 1024;
const TOTAL_TIMEOUT_MS = 120_000;
/** The list has 3,708 models today; a file below this is not the list, one above it is too large. */
const MIN_DATA_ROWS = 3_000;
const MAX_DATA_ROWS = 20_000;
/** The header has 57 columns today: a row of more than this many cells is no row of the list. */
const MAX_COLUMNS = 128;
/** The list has 381 organisations of the Industry kind today. */
const MAX_ENTITIES = 5_000;

/** The columns that are read, by their names in the header. */
const USED_COLUMNS = {
  model: "Model",
  organization: "Organization",
  categorization: "Organization categorization",
  published: "Publication date",
  frontier: "Frontier model",
  openWeights: "Open model weights?",
  modified: "Last modified",
} as const;

/** The longest name of a model that is read: the longest of the real file has well under this. */
const MODEL_MAX = 200;
/**
 * The longest list cell that is read, in UTF-16 units like every length here: the longest real one
 * has 759 characters. A longer cell is no list of this file.
 */
const LIST_CELL_MAX = 2_000;
/** The longest organisation item that is read, and the longest key (and so id) of an organisation. */
const ITEM_MAX = 200;
const KEY_MAX = 160;
const MIN_KEY_CHARS = 4;
const LABEL_MAX = 40;
const FLAG_MAX = 8;
const MODIFIED_MAX = 40;
/** The spellings of an organisation that go to the names of its record. */
const NAMES_MAX = 5;
const NEWEST_SHOWN = 3;
const MODEL_SHOWN_MAX = 60;
const DISPLAY_MAX = 80;
/** The share of the rows with an organisation whose two lists must line up: nine in ten. */
const ALIGNED_OF_TEN = 9;

/** The label that Epoch gives an organisation of industry, and the two flags, as the file writes them. */
const INDUSTRY = "Industry";
const FRONTIER = "True";
const OPEN_WEIGHTS = "Yes";

/**
 * Where a list cell is split: a comma that no legal form follows (a blank or more, then the form,
 * then the end of the word). The case counts. Each comma is looked at once, and a run of blanks
 * after it belongs to that comma alone, so the time is linear in the length of the cell.
 */
const LIST_SEPARATOR =
  /,(?!\s*(?:Inc|Ltd|LLC|Corp|GmbH|Co|SA|AG|PLC|Limited|Corporation)(?![\p{L}\p{N}_]))/u;

/** `Last modified` as the file writes it: a day, then a time and a zone, as in `2026-02-03 08:15:42+00:00`. */
const MODIFIED_STAMP =
  /^(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,9})?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/;

/** The sentence that says what a record is, and is not: it comes before the numbers, so a cut never reaches it. */
const WHAT_A_RECORD_IS =
  "A record counts the AI models in Epoch AI's database that name this organisation among their developers; it describes model releases as Epoch classifies them and says nothing about their safety or the organisation's conduct.";
/** The closing sentence: how the numbers were made, and the credit the licence asks for. */
const CLOSING =
  "Source: Epoch AI, 'Data on AI models' (epoch.ai), Creative Commons Attribution; counted by VerifyWise, not endorsed by Epoch AI.";

/** A model of an organisation, as the newest three are kept: its name as shown, and its day or none. */
interface ModelAt {
  name: string;
  day: string | null;
}

/** One organisation of the list, as the reader makes it. */
interface OrganisationRow {
  /** The key of the organisation: `compactName(shortName(item))`. */
  id: string;
  /** The most frequent spelling (as cleaned), ties by the order of the texts. */
  display: string;
  /** The five most frequent spellings, for the names a vendor may match. */
  names: string[];
  models: number;
  /** The year of the oldest dated model, and the newest day of publication; null when none is dated. */
  firstYear: number | null;
  newestDay: string | null;
  frontier: number;
  openWeights: number;
  /** The newest three models: the newest day first, the undated last, ties by the order of the names. */
  newest: ModelAt[];
  /** The newest `Last modified` day of the file: the same in every row, the version of the list. */
  modified: string | null;
}

/** What is counted for an organisation while the rows are read. */
interface Counting {
  spellings: Map<string, number>;
  models: number;
  firstDay: string | null;
  newestDay: string | null;
  frontier: number;
  openWeights: number;
  newest: ModelAt[];
}

/** The text without its parentheticals (a blank for each), an unclosed `(` cutting to the end. Linear. */
function withoutParentheticals(text: string): string {
  let kept = "";
  let at = 0;
  for (;;) {
    const open = text.indexOf("(", at);
    if (open === -1) return kept + text.slice(at);
    kept += `${text.slice(at, open)} `;
    const close = text.indexOf(")", open + 1);
    if (close === -1) return kept;
    at = close + 1;
  }
}

/**
 * The items of a list cell, split as rule O says (an empty item stays, for the positions), or null
 * when the cell is longer than 2,000 characters: it is no list of this file, and a cut of it would
 * end in the piece of a name. Nothing of such a cell is split, so its length costs nothing.
 */
const itemsOf = (cell: string): string[] | null =>
  cell.length > LIST_CELL_MAX ? null : cell.split(LIST_SEPARATOR);

/**
 * A text as one clean line (`lineOf`) of at most `max` units: "" when nothing is left of it, null
 * when the clean line is longer than `max`. It never gives a cut line: `lineWithin` says null for
 * an empty line as well, and `lineOf(text, max + 1)` cannot tell an overlong text from a whole one
 * (the cut takes a blank before it off and never splits a pair of surrogates, so a cut line of
 * `max` units that ends in the marker passes). A text of more than LINE_INPUT_MAX units is null
 * before anything else is asked: `lineOf` reads only the first LINE_INPUT_MAX units of it, so
 * a first megabyte of blanks would read as an empty text. The reader never passes one (a list cell
 * of more than 2,000 units is refused before it is split), so the guard is the helper's own;
 * it is exported for its test.
 */
export function uncutLineOf(text: string, max: number): string | null {
  if (text.length > LINE_INPUT_MAX) return null;
  // `lineOf(text, 2)` is empty only when the clean line is: a cut to two units keeps at least one.
  return lineWithin(text, max) ?? (lineOf(text, 2) === "" ? "" : null);
}

/**
 * An item as a name: cleaned as one line first (so that a full-width parenthesis is one like the
 * others), its parentheticals cut, and the blanks that they leave collapsed. "" when nothing is
 * left, and null when the item is too long to be a name, before or after its parentheticals are
 * cut: nothing of it is read, and no cut text is ever taken for a name.
 */
function nameOf(item: string): string | null {
  const line = uncutLineOf(item, LIST_CELL_MAX);
  return line === null ? null : uncutLineOf(withoutParentheticals(line), ITEM_MAX);
}

/** The day of a `Last modified` cell, or null when it is not a real day followed by a time or by nothing. */
function modifiedDayOf(cell: string): string | null {
  const match = MODIFIED_STAMP.exec(lineOf(cell, MODIFIED_MAX));
  return match === null ? null : dayText(match[1]);
}

/** The newest first; a model without a day after every model with one; ties by the order of the names. */
function newerFirst(a: ModelAt, b: ModelAt): number {
  if (a.day !== b.day) {
    if (a.day === null) return 1;
    if (b.day === null) return -1;
    return a.day < b.day ? 1 : -1;
  }
  return compareText(a.name, b.name);
}

const countedUp = (counts: Map<string, number>, key: string): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

/** The most frequent first, then the order of the texts. */
const byCount = ([a, x]: [string, number], [b, y]: [string, number]): number =>
  y - x || compareText(a, b);

function organisationRowOf(
  id: string,
  counting: Counting,
  modified: string | null,
): OrganisationRow {
  const spellings = [...counting.spellings].sort(byCount);
  return {
    id,
    display: spellings[0][0],
    names: spellings.slice(0, NAMES_MAX).map(([spelling]) => spelling),
    models: counting.models,
    firstYear: counting.firstDay === null ? null : Number(counting.firstDay.slice(0, 4)),
    newestDay: counting.newestDay,
    frontier: counting.frontier,
    openWeights: counting.openWeights,
    newest: counting.newest,
    modified,
  };
}

/**
 * The organisations of the file, or null when it is not the list. A pure function of its text: it
 * reads at most 20,000 rows of at most 128 cells, and a part of the list is no read (the download
 * then fails as too large). It reads only the columns it needs, and builds no row from any other.
 */
function readModels(fetched: Fetched): ReadResult<OrganisationRow> | null {
  const csv = readCsvText(textOf(fetched, 0), MAX_DATA_ROWS + 1, MAX_COLUMNS);
  const [header, ...body] = csv.rows;
  if (header === undefined) return null;
  const columns = columnsOf(header, USED_COLUMNS);
  if (columns === null) return null;
  const complete = !csv.more && !csv.cut && !csv.wide;
  if (!complete) return { rows: [], total: body.length, unreadable: 0, complete };
  if (body.length < MIN_DATA_ROWS) return null;

  const width = header.length;
  const organisations = new Map<string, Counting>();
  const modelNames = new Set<string>();
  let unreadable = 0;
  let newestModified: string | null = null;
  let withOrganization = 0;
  let aligned = 0;
  for (const row of body) {
    const cells = cellsOf(row, width);
    if (cells === null) {
      unreadable += 1;
      continue;
    }
    // A flag cell longer than `lineOf` reads is refused before anything of the row is kept: its
    // first megabyte can say `False` or nothing where the cell as a whole says another thing.
    if (
      cells[columns.frontier].length > LINE_INPUT_MAX ||
      cells[columns.openWeights].length > LINE_INPUT_MAX
    ) {
      unreadable += 1;
      continue;
    }
    // A name that is empty, or longer than a model's can be, is no name, and is never cut: it
    // could not tell one model from another.
    const model = lineWithin(cells[columns.model], MODEL_MAX);
    if (model === null) {
      unreadable += 1;
      continue;
    }
    // The model is the key of the list: a file that names one twice is not this list.
    if (modelNames.has(model)) return null;
    modelNames.add(model);

    const modified = modifiedDayOf(cells[columns.modified]);
    if (modified !== null && (newestModified === null || modified > newestModified)) {
      newestModified = modified;
    }

    const organizationCell = cells[columns.organization];
    if (organizationCell.trim() === "") continue;
    withOrganization += 1;
    const items = itemsOf(organizationCell);
    const labels = itemsOf(cells[columns.categorization]);
    // A list cell over the cap is no list, and the label at the position of an item says nothing
    // when the lists are of different lengths: the row does not line up, and gives no key.
    if (
      items === null ||
      labels === null ||
      cells[columns.categorization].trim() === "" ||
      labels.length !== items.length
    ) {
      continue;
    }
    aligned += 1;

    const shown: ModelAt = {
      name: lineOf(model, MODEL_SHOWN_MAX),
      day: dayText(cells[columns.published]),
    };
    const frontier = lineOf(cells[columns.frontier], FLAG_MAX) === FRONTIER;
    const openWeights = lineOf(cells[columns.openWeights], FLAG_MAX) === OPEN_WEIGHTS;
    const seen = new Set<string>();
    for (let at = 0; at < items.length; at += 1) {
      if (lineOf(labels[at], LABEL_MAX) !== INDUSTRY) continue;
      const item = nameOf(items[at]);
      if (item === null) {
        unreadable += 1;
        continue;
      }
      const key = compactName(shortName(item));
      if (key.length < MIN_KEY_CHARS || seen.has(key)) continue;
      if (key.length > KEY_MAX) {
        unreadable += 1;
        continue;
      }
      seen.add(key);

      let counting = organisations.get(key);
      if (counting === undefined) {
        // A list of more organisations than any real one is no list of this kind.
        if (organisations.size >= MAX_ENTITIES) return null;
        counting = {
          spellings: new Map(),
          models: 0,
          firstDay: null,
          newestDay: null,
          frontier: 0,
          openWeights: 0,
          newest: [],
        };
        organisations.set(key, counting);
      }
      countedUp(counting.spellings, item);
      counting.models += 1;
      if (shown.day !== null) {
        if (counting.firstDay === null || shown.day < counting.firstDay) {
          counting.firstDay = shown.day;
        }
        if (counting.newestDay === null || shown.day > counting.newestDay) {
          counting.newestDay = shown.day;
        }
      }
      if (frontier) counting.frontier += 1;
      if (openWeights) counting.openWeights += 1;
      counting.newest = [...counting.newest, shown].sort(newerFirst).slice(0, NEWEST_SHOWN);
    }
  }

  // A changed format would leave the lists out of line, and the set of organisations empty
  // without a word: the run fails instead.
  if (withOrganization === 0 || aligned * 10 < withOrganization * ALIGNED_OF_TEN) return null;

  const rows = [...organisations].map(([id, counting]) =>
    organisationRowOf(id, counting, newestModified),
  );
  // A row can name several organisations, so the entities may outnumber the rows of the file: the
  // total is the larger of the two, and the kit refuses a body whose total is below the entities.
  return { rows, total: Math.max(body.length, rows.length + unreadable), unreadable, complete };
}

/** A record is the count of the models that name one organisation: no text of a model, no person. */
function toRecord(row: OrganisationRow): ParsedRecord {
  const display = lineOf(row.display, DISPLAY_MAX);
  const published =
    row.firstYear === null || row.newestDay === null
      ? ""
      : `, published ${String(row.firstYear).padStart(4, "0")} to ${row.newestDay}`;
  const newest = row.newest
    .map(({ name, day }) => `${lineOf(name, MODEL_SHOWN_MAX)} (${day ?? "undated"})`)
    .join("; ");
  return recordOf({
    id: row.id,
    type: "ai_model_developer",
    title: `${EPOCH_AI_RECORD_MARK}: ${display}`,
    summary: summaryWithClosing(
      [
        `${EPOCH_AI_RECORD_MARK} (epoch.ai), a register or status list.`,
        WHAT_A_RECORD_IS,
        sentence("Organisation as written", display),
        `Models: ${row.models}${published}; ${row.frontier} marked frontier by Epoch (among the five largest by training compute at release), ${row.openWeights} with open weights.`,
        newest === "" ? "" : `Newest: ${newest}.`,
      ],
      CLOSING,
      RECORD_SUMMARY_MAX,
    ),
    url: `${RECORD_URL}${encodeURIComponent(row.id)}`,
    identifiers: {
      // The whole first spelling, never the cut line of the title; the record builder takes
      // the angle brackets out of every identifier.
      organisation: row.names[0],
      models: row.models,
      frontier: row.frontier,
      openWeights: row.openWeights,
    },
    names: row.names,
    publishedAt: row.newestDay,
  });
}

export const epochAiConnector: Connector = createFileConnector<OrganisationRow>({
  id: "epoch_ai",
  version: 1,
  root: "all_ai_models.csv",
  sortKey: (row) => row.id,
  files: [
    {
      url: FILE_URL,
      maxBytes: MAX_BYTES,
      contentTypes: ["text/csv"],
      timeoutMs: TOTAL_TIMEOUT_MS,
    },
  ],
  pin: { hosts: ["epoch.ai"], pathPrefixes: ["/data/"] },
  read: readModels,
  toRecords: (rows) => rows.map(toRecord),
  sourceVersion: (rows) =>
    rows.reduce<string | null>(
      (newest, { modified }) =>
        modified !== null && (newest === null || modified > newest) ? modified : newest,
      null,
    ),
});
