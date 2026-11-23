/**
 * The page a paginated table can show for `total` rows: the requested page,
 * or the last page when the list shrank below it (0 for an empty list). Keeps
 * a filtered table from showing "Showing 11 - 1 of 1" over an empty body.
 */
export function clampPage(page: number, total: number, rowsPerPage: number): number {
  if (total <= 0 || rowsPerPage <= 0) return 0;
  const lastPage = Math.ceil(total / rowsPerPage) - 1;
  return Math.min(Math.max(0, page), lastPage);
}
