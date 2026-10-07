/**
 * @fileoverview The one table every risk-inheritance report renders through.
 *
 * Sorting and pagination are the site's standard ones — useStandardTable for
 * state (three-state sort, persisted per table), StandardTableHead for the
 * clickable headers and StandardTablePagination for the footer — so these
 * reports behave like every other table in the app. Each column says how to
 * render a cell and, when sortable, which value to sort on; the comparator is
 * derived from that, so no report writes its own switch statement.
 */

import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableContainer, TableRow } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import StandardTableHead from "../../components/Table/StandardTableHead";
import StandardTablePagination from "../../components/Table/StandardTablePagination";
import { useStandardTable } from "../../../application/hooks/useStandardTable";
import type { SortDirection, StandardColumn } from "../../../domain/types/standardTable";
import { tableSx, tableBodyRowSx, tableBodyCellSx } from "./DismissalAnalytics/styles";

export interface ReportColumn<T> extends StandardColumn {
  render: (row: T) => ReactNode;
  /** Required when `sortable` is true: the value the column sorts on. */
  sortValue?: (row: T) => string | number | null;
  /** Overrides the default body cell style (e.g. a wrapping or numeric cell). */
  cellSx?: SxProps<Theme>;
}

interface ReportTableProps<T> {
  columns: ReportColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string | number;
  /** Persists sort and rows-per-page; unique per table. */
  storageKey: string;
  defaultSortColumn: string;
  defaultSortDirection?: SortDirection;
  entityLabel: string;
  entityLabelPlural?: string;
}

/** Nulls always sort last, whichever direction the column is sorted in. */
export function compareSortValues(a: string | number | null, b: string | number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  }
  return Number(a) - Number(b);
}

function ReportTable<T>({
  columns,
  rows,
  getRowKey,
  storageKey,
  defaultSortColumn,
  defaultSortDirection = "desc",
  entityLabel,
  entityLabelPlural,
}: ReportTableProps<T>) {
  const sortComparator = useCallback(
    (a: T, b: T, key: string): number => {
      const column = columns.find((c) => c.id === key);
      if (!column?.sortValue) return 0;
      return compareSortValues(column.sortValue(a), column.sortValue(b));
    },
    [columns],
  );

  const {
    sortConfig,
    handleSort,
    sortedRows,
    validPage,
    rowsPerPage,
    handleChangePage,
    handleChangeRowsPerPage,
    getRange,
    totalCount,
  } = useStandardTable({
    rows,
    storageKey,
    defaultSortColumn,
    defaultSortDirection,
    sortComparator,
  });

  const pageRows = useMemo(
    () => sortedRows.slice(validPage * rowsPerPage, validPage * rowsPerPage + rowsPerPage),
    [sortedRows, validPage, rowsPerPage],
  );

  return (
    <TableContainer>
      <Table sx={tableSx}>
        <StandardTableHead columns={columns} sortConfig={sortConfig} onSort={handleSort} />
        <TableBody>
          {pageRows.map((row) => (
            <TableRow key={getRowKey(row)} sx={tableBodyRowSx}>
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  align={column.align}
                  sx={column.cellSx ?? tableBodyCellSx}
                >
                  {column.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
        <StandardTablePagination
          totalCount={totalCount}
          page={validPage}
          rowsPerPage={rowsPerPage}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          getRange={getRange}
          entityLabel={entityLabel}
          entityLabelPlural={entityLabelPlural}
          colSpan={columns.length}
        />
      </Table>
    </TableContainer>
  );
}

export default ReportTable;
