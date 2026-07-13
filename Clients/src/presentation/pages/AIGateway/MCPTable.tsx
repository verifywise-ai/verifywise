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
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  SxProps,
  Theme,
  useTheme,
} from "@mui/material";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useTranslation } from "../../../application/hooks/useTranslation";
import singleTheme from "../../themes/v1SingleTheme";

export interface MCPTableColumn {
  /** Header label shown in the table head. */
  label: string;
  /** Optional fixed/min width for the column. */
  width?: number | string;
  /** Right-align numeric or action columns. */
  align?: "left" | "right" | "center";
  /**
   * Opt-in sort identifier. When set AND the table is given an `onSort`
   * handler, this column's header becomes a clickable sort control. Columns
   * without a `sortKey` always render as a plain header.
   */
  sortKey?: string;
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
  /** Currently-active sort column (matches a column's `sortKey`). */
  sortBy?: string;
  /** Active sort direction; drives the header arrow. */
  sortDir?: "asc" | "desc";
  /**
   * Called when a sortable header is clicked. Sorting is opt-in: when this is
   * omitted, every header renders plainly and the table behaves exactly as it
   * did before sorting support was added.
   */
  onSort?: (sortKey: string) => void;
}

export default function MCPTable<T>({
  id,
  columns,
  rows,
  rowKey,
  renderRow,
  onRowClick,
  rowSx,
  sortBy,
  sortDir,
  onSort,
}: MCPTableProps<T>) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <TableContainer id={id}>
      <Table sx={singleTheme.tableStyles.primary.frame}>
        <TableHead
          sx={{
            backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
          }}
        >
          <TableRow sx={singleTheme.tableStyles.primary.header.row}>
            {columns.map((col, i) => {
              const sortable = !!col.sortKey && !!onSort;
              const isActive = sortable && sortBy === col.sortKey;
              return (
                <TableCell
                  key={`${id}-head-${i}`}
                  align={col.align || "left"}
                  style={{
                    ...singleTheme.tableStyles.primary.header.cell,
                    width: col.width,
                    minWidth: col.width,
                  }}
                >
                  {sortable ? (
                    <Box
                      component="span"
                      role="button"
                      tabIndex={0}
                      aria-label={
                        isActive && sortDir === "desc" ? t("Sort descending") : t("Sort ascending")
                      }
                      onClick={() => onSort!(col.sortKey!)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSort!(col.sortKey!);
                        }
                      }}
                      sx={{
                        // Match the header cell text style explicitly. The
                        // parent <td> sets these via the `style` attr, which
                        // does not reliably cascade into this nested span, so
                        // the sort label would otherwise render faint.
                        "display": "inline-flex",
                        "alignItems": "center",
                        "gap": "4px",
                        "cursor": "pointer",
                        "userSelect": "none",
                        "color": theme.palette.text.tertiary,
                        "fontSize": "13px",
                        "fontWeight": 400,
                        "&:hover": { color: theme.palette.text.primary },
                        "justifyContent":
                          col.align === "right"
                            ? "flex-end"
                            : col.align === "center"
                              ? "center"
                              : "flex-start",
                      }}
                    >
                      {col.label}
                      {isActive &&
                        (sortDir === "desc" ? (
                          <ChevronDown size={14} strokeWidth={1.5} />
                        ) : (
                          <ChevronUp size={14} strokeWidth={1.5} />
                        ))}
                    </Box>
                  ) : (
                    col.label
                  )}
                </TableCell>
              );
            })}
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
