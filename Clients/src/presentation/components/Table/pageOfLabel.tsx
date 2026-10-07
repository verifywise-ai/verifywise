import type { ReactNode } from "react";

/**
 * "Page X of Y" for `TablePagination`'s `labelDisplayedRows`.
 *
 * Returned as JSX, not a template string, so React renders "Page" and "of" as
 * their own text nodes. The DOM translator matches whole text nodes against
 * the dictionary, so a single "Page 1 of 3" string never translates.
 */
export const pageOfLabel = (page: number, totalPages: number): ReactNode => (
  <>
    Page {page} of {totalPages}
  </>
);
