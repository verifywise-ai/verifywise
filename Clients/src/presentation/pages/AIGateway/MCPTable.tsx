/**
 * MCPTable — a lightweight standard table for Agent Control pages.
 *
 * Wraps MUI Table with the app's shared `tableStyles.primary` look (the same
 * styling CustomizableBasicTable uses) so Activity, Agent keys and Approvals
 * render as proper tables instead of card lists. Kept generic: callers pass
 * column definitions and a render function per row.
 */
import { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  SxProps,
  Theme,
} from "@mui/material";
import singleTheme from "../../themes/v1SingleTheme";

export interface MCPTableColumn {
  /** Header label shown in the table head. */
  label: string;
  /** Optional fixed/min width for the column. */
  width?: number | string;
  /** Right-align numeric or action columns. */
  align?: "left" | "right" | "center";
}

interface MCPTableProps<T> {
  id: string;
  columns: MCPTableColumn[];
  rows: T[];
  /** Stable key extractor for each row. */
  rowKey: (row: T) => string | number;
  /** Returns the cells (in column order) for a given row. */
  renderRow: (row: T) => ReactNode[];
  onRowClick?: (row: T) => void;
  /** Optional per-row style override (e.g. dim inactive rows). */
  rowSx?: (row: T) => SxProps<Theme>;
}

export default function MCPTable<T>({
  id,
  columns,
  rows,
  rowKey,
  renderRow,
  onRowClick,
  rowSx,
}: MCPTableProps<T>) {
  return (
    <TableContainer id={id}>
      <Table sx={singleTheme.tableStyles.primary.frame}>
        <TableHead
          sx={{
            backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
          }}
        >
          <TableRow sx={singleTheme.tableStyles.primary.header.row}>
            {columns.map((col, i) => (
              <TableCell
                key={`${id}-head-${i}`}
                align={col.align || "left"}
                style={{
                  ...singleTheme.tableStyles.primary.header.cell,
                  width: col.width,
                  minWidth: col.width,
                }}
              >
                {col.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const cells = renderRow(row);
            return (
              <TableRow
                key={rowKey(row)}
                sx={{
                  ...singleTheme.tableStyles.primary.body.row,
                  // The shared row style sets cursor:pointer on hover (for clickable
                  // tables). When this table has no row click, keep the hover
                  // background but override the cursor so rows don't look clickable.
                  "cursor": onRowClick ? "pointer" : "default",
                  "&:hover": {
                    ...(singleTheme.tableStyles.primary.body.row as Record<string, any>)["&:hover"],
                    cursor: onRowClick ? "pointer" : "default",
                  },
                  ...(rowSx ? rowSx(row) : {}),
                }}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {cells.map((cell, i) => (
                  <TableCell
                    key={`${rowKey(row)}-${i}`}
                    align={columns[i]?.align || "left"}
                    sx={{ ...singleTheme.tableStyles.primary.body.cell, whiteSpace: "normal" }}
                  >
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
