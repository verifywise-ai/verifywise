/**
 * Most rows one spreadsheet import may hold (risk import and framework
 * import). Keeps one transaction and one request bounded. The client's
 * risk import modal mirrors this number to refuse a larger file up front.
 */
export const MAX_IMPORT_ROWS = 5000;
