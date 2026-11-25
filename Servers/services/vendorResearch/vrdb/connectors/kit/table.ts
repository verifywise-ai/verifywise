/**
 * The table readers of the list kit: the rows of a tab-delimited text (the flat files of NHTSA)
 * and of a CSV text (the reader of the OFAC list, with a byte order mark out), the header that
 * moves, the columns of a header by name, a row of another width, a row as an object, and a cell
 * of a row that may be short. A reader treats its text as hostile: it reads the text once from the
 * front, whatever it holds, and stops
 *
 * - after `maxRows` rows, so that a file of millions of short rows is not held in memory (`more`
 *   says that it stopped early), and
 * - at the first row of more than `maxColumns` cells, so that one line of millions of delimiters
 *   is not held either (`wide` says that it stopped there; the rows before are kept, nothing after
 *   is read, and no cell of the wide row is made past the limit).
 *
 * A reader that stopped early has given part of the list, and a list taken in part would mark
 * every record that it lacks as gone. A reader says so itself: `complete` is `!more && !cut && !wide`
 * (`readTsv` has no `cut`), and the connector that calls it passes `complete: reading.complete` on
 * to the factory (kit/fileConnector.ts), which fails the download when it is false.
 *
 * The cells are as the file has them. Cleaning one is `lineOf`'s job (kit/clean.ts).
 */
import { readCsv } from "../ofac";

const BYTE_ORDER_MARK = 0xfeff;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;

/**
 * Whether a line has at most `max` cells (a tab ends each but the last), counted without splitting
 * it, so that a wide line costs the tabs up to the limit and no cell. A limit that is no number
 * counts nothing as fitting.
 */
function hasAtMostCells(line: string, max: number): boolean {
  let cells = 1;
  for (let tab = line.indexOf("\t"); tab !== -1; tab = line.indexOf("\t", tab + 1)) {
    cells += 1;
    if (!(cells <= max)) return false;
  }
  return cells <= max;
}

/**
 * The rows of a tab-delimited text: a record per line, a cell per tab, no quoting (a quote is a
 * character, and a tab inside quotes ends the cell). A byte order mark at the start is taken off. A
 * line ends with a line feed, a carriage return, or both (CRLF is a line and an empty one, and a
 * lone carriage return is a line end as in `readCsv`), and an empty line holds no row; a line of
 * blanks or of tabs is a record. At most `maxRows` rows are read, and `more` is true when another
 * line that holds something follows them. A line of more than `maxColumns` cells stops the reading
 * before it is split: `wide` is true, and the rows before it are the rows. A `maxColumns` that is
 * not above zero makes every line wide. Linear in the length of the text.
 */
export function readTsv(
  text: string,
  maxRows: number,
  maxColumns: number,
): { rows: string[][]; more: boolean; wide: boolean; complete: boolean } {
  const rows: string[][] = [];
  const length = text.length;
  // Where the next line ends: searched from the start of the line, so that it costs the line.
  const lineEnd = /[\r\n]/g;
  let at = text.charCodeAt(0) === BYTE_ORDER_MARK ? 1 : 0;
  while (at < length) {
    const code = text.charCodeAt(at);
    // An empty line, or the line feed behind a carriage return.
    if (code === LINE_FEED || code === CARRIAGE_RETURN) {
      at += 1;
      continue;
    }
    if (rows.length >= maxRows) return { rows, more: true, wide: false, complete: false };
    lineEnd.lastIndex = at;
    const found = lineEnd.exec(text);
    const end = found === null ? length : found.index;
    // A slice shares the text, and its tabs are counted inside the line only.
    const line = text.slice(at, end);
    if (!hasAtMostCells(line, maxColumns))
      return { rows, more: false, wide: true, complete: false };
    rows.push(line.split("\t"));
    at = end + 1;
  }
  return { rows, more: false, wide: false, complete: true };
}

/**
 * The rows of a CSV text as `readCsv` of the OFAC list reads them (quotes, commas and line breaks
 * inside quotes, quotes written twice, blank lines skipped), with a byte order mark at the start
 * taken off, which would otherwise hide the quote of a first cell. `cut` is true when the text ends
 * inside a quoted field: it was cut short, and the row that the quote opened is not among the rows.
 * `more` is as for `readTsv`, and so is `wide`: a row of more than `maxColumns` cells stops the
 * reading at once (a quoted comma is no column), with the rows before it kept and `cut` false.
 */
export function readCsvText(
  text: string,
  maxRows: number,
  maxColumns: number,
): { rows: string[][]; more: boolean; cut: boolean; wide: boolean; complete: boolean } {
  const csv = readCsv(
    text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text,
    maxRows,
    maxColumns,
  );
  const cut = csv.cut !== null;
  const wide = csv.wide === true;
  return { rows: csv.rows, more: csv.more, cut, wide, complete: !csv.more && !cut && !wide };
}

/**
 * The position of each wanted column in the header, found by the exact name of the trimmed cell
 * (the case counts); null when any wanted column is missing, since the file is then not the list. A
 * column that the header holds twice is the first.
 */
export function columnsOf<K extends string>(
  header: readonly string[],
  wanted: Record<K, string>,
): Record<K, number> | null {
  const names = header.map((cell) => cell.trim());
  const columns = {} as Record<K, number>;
  for (const key of Object.keys(wanted) as K[]) {
    const at = names.indexOf(wanted[key]);
    if (at === -1) return null;
    columns[key] = at;
  }
  return columns;
}

/**
 * The header of a table whose header is not its first row (an export that begins with a title and
 * a row of groups): the first of the first `maxScan` rows that holds every wanted column
 * (`columnsOf`), with its place, and the place of each column; null when none does. A `maxScan`
 * that is not above zero reads no row, and no row past it is read, whatever the rows hold.
 */
export function findHeader<K extends string>(
  rows: readonly string[][],
  wanted: Record<K, string>,
  maxScan: number,
): { at: number; columns: Record<K, number> } | null {
  const scanned = Math.min(rows.length, Math.floor(maxScan));
  for (let at = 0; at < scanned; at += 1) {
    const columns = columnsOf(rows[at], wanted);
    if (columns !== null) return { at, columns };
  }
  return null;
}

/** The cell of a row at an index; an empty text when the row is short. */
export const cellAt = (row: readonly string[], index: number): string => row[index] ?? "";

/**
 * The row when it has exactly `width` cells, and null when it has more or fewer: a row that is
 * shifted (a quote or a delimiter that the file got wrong) puts its cells in the wrong columns, so
 * the connector counts it as unreadable and does not read it as it is (NHTSA's reader does the same).
 */
export function cellsOf(row: readonly string[], width: number): readonly string[] | null {
  return row.length === width ? row : null;
}

/**
 * The cells of a row by the names of the header, as an object with no prototype: the names are
 * trimmed, the first of a name that the header holds twice wins, a column with no name has no
 * place, and a cell that the row lacks is an empty text. Any name is an ordinary key (`__proto__`,
 * `constructor`), and none is inherited, so that a header of a hostile file can neither set a
 * prototype nor be read as a method.
 */
export function rowObjectOf(
  header: readonly string[],
  cells: readonly string[],
): Record<string, string> {
  const row: Record<string, string> = Object.create(null);
  for (let at = 0; at < header.length; at += 1) {
    const name = header[at].trim();
    if (name === "" || name in row) continue;
    row[name] = cells[at] ?? "";
  }
  return row;
}
