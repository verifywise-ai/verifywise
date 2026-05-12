import { memo } from "react";
import { TableCell, TableHead, TableRow, Box, Typography } from "@mui/material";
import { ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import singleTheme from "../../../themes/v1SingleTheme";
import { text } from "../../../themes/palette";
import Checkbox from "../../Inputs/Checkbox";
import type {
  SelectionColumnConfig,
  SortConfig,
  StandardColumn,
} from "../../../../domain/types/standardTable";

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
                borderBottom: "1px solid #d0d5dd",
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
          {columns.map((column, index) => {
            const isFirstColumn = index === 0;
            const isActionColumn = column.id === "actions";

            return (
              <TableCell
                key={column.id}
                sx={{
                  ...singleTheme.tableStyles.primary.header.cell,
                  textAlign: column.align ?? (isFirstColumn ? "left" : "center"),
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
                    sx={{
                      fontWeight: 500,
                      fontSize: "13px",
                      color: sortConfig.key === column.id ? "primary.main" : "inherit",
                    }}
                  >
                    {column.label}
                  </Typography>
                  {column.sortable && (
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
