import { memo } from "react";
import { TableCell, TableHead, TableRow, Box, Typography } from "@mui/material";
import { ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import singleTheme from "../../../themes/v1SingleTheme";
import { text, border } from "../../../themes/palette";
import { isClassicUi } from "../../../themes/uiStyle";
import Checkbox from "../../Inputs/Checkbox";
import type {
  SelectionColumnConfig,
  SortConfig,
  StandardColumn,
} from "../../../../domain/types/standardTable";

const classicUi = isClassicUi();

interface StandardTableHeadProps {
  columns: StandardColumn[];
  sortConfig: SortConfig;
  onSort: (columnId: string) => void;
  selection?: SelectionColumnConfig;
}

const StandardTableHead: React.FC<StandardTableHeadProps> = memo(
  ({ columns, sortConfig, onSort, selection }) => {
    return (
      <TableHead
        sx={{
          backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
        }}
      >
        <TableRow sx={singleTheme.tableStyles.primary.header.row}>
          {selection && (
            <TableCell
              sx={{
                width: 40,
                minWidth: 40,
                maxWidth: 40,
                padding: 0,
                borderBottom: `1px solid ${border.dark}`,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                }}
              >
                <Checkbox
                  id="standard-table-select-all"
                  value="select-all"
                  isChecked={selection.allSelected}
                  isIndeterminate={selection.someSelected && !selection.allSelected}
                  onChange={selection.onToggleAll}
                  ariaLabel={selection.ariaLabel ?? "Select all rows"}
                  sx={{ "p": 0, "& svg": { display: "block" } }}
                />
              </Box>
            </TableCell>
          )}
          {columns.map((column) => {
            const isActionColumn = column.id === "actions";
            const isSorted = sortConfig.key === column.id && sortConfig.direction !== null;
            const ariaSort = column.sortable
              ? isSorted
                ? sortConfig.direction === "asc"
                  ? "ascending"
                  : "descending"
                : "none"
              : undefined;

            return (
              <TableCell
                key={column.id}
                aria-sort={classicUi ? undefined : ariaSort}
                sx={{
                  ...singleTheme.tableStyles.primary.header.cell,
                  textAlign: column.align ?? "left",
                  ...(column.sortable
                    ? {
                        "cursor": "pointer",
                        "userSelect": "none",
                        "&:hover": {
                          backgroundColor: "rgba(0, 0, 0, 0.04)",
                        },
                      }
                    : {}),
                  ...(isActionColumn
                    ? {
                        minWidth: column.minWidth ?? "80px",
                        maxWidth: "80px",
                      }
                    : {}),
                  ...(column.width ? { width: column.width } : {}),
                  ...(column.minWidth && !isActionColumn ? { minWidth: column.minWidth } : {}),
                }}
                onClick={() => column.sortable && onSort(column.id)}
              >
                <Box
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={
                      classicUi
                        ? {
                            fontWeight: 500,
                            fontSize: "13px",
                            color: sortConfig.key === column.id ? "primary.main" : "inherit",
                          }
                        : {
                            // Phase 1: the header cell sets the type (11px, 500, uppercase, tracked).
                            font: "inherit",
                            letterSpacing: "inherit",
                            color: isSorted ? "primary.main" : "inherit",
                          }
                    }
                  >
                    {column.label}
                  </Typography>
                  {!classicUi && column.sortable && isSorted && (
                    <Box
                      component="span"
                      aria-hidden="true"
                      data-testid="sort-arrow"
                      sx={{ color: "primary.main", lineHeight: 1 }}
                    >
                      {sortConfig.direction === "asc" ? "\u2191" : "\u2193"}
                    </Box>
                  )}
                  {classicUi && column.sortable && (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        color: sortConfig.key === column.id ? "primary.main" : `${text.disabled}`,
                      }}
                    >
                      {sortConfig.key === column.id && sortConfig.direction === "asc" && (
                        <ChevronUp size={14} />
                      )}
                      {sortConfig.key === column.id && sortConfig.direction === "desc" && (
                        <ChevronDown size={14} />
                      )}
                      {sortConfig.key !== column.id && <ChevronsUpDown size={14} />}
                    </Box>
                  )}
                </Box>
              </TableCell>
            );
          })}
        </TableRow>
      </TableHead>
    );
  },
);

export default StandardTableHead;
