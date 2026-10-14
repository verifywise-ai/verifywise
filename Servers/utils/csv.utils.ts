const FORMULA_START = /^[=+\-@\t\r]/;
// Text a spreadsheet reads as a plain value, not a formula: a signed number
// such as "-5" or "+1.5", or a lone "-" / "+" (change history's "no value").
const PLAIN_VALUE = /^[+-]?(\d+(\.\d+)?)?$/;

/** Text that a spreadsheet could run as a formula (CSV injection). */
const looksLikeFormula = (text: string): boolean =>
  FORMULA_START.test(text) && !PLAIN_VALUE.test(text);

/** One CSV field: quoted, quotes doubled, formula-looking text prefixed with '. */
export const csvField = (value: unknown): string => {
  if (value === null || value === undefined) return '""';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (typeof value === "string" && looksLikeFormula(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

/** One CSV line, RFC 4180 line ending. */
export const csvRow = (values: unknown[]): string => `${values.map(csvField).join(",")}\r\n`;

/** Byte-order mark so spreadsheet apps read the file as UTF-8. */
export const CSV_BOM = "\uFEFF";
