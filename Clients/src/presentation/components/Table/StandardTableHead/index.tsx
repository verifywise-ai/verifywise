import { memo } from "react";
import { TableCell, TableHead, TableRow, Box, Typography } from "@mui/material";
import { ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import singleTheme from "../../../themes/v1SingleTheme";
import { text } from "../../../themes/palette";
import type { SortConfig, StandardColumn } from "../../../../domain/types/standardTable";

interface StandardTableHeadProps {
  columns: StandardColumn[];
  sortConfig: SortConfig;
  onSort: (columnId: string) => void;
}

const StandardTableHead: React.FC<StandardTableHeadProps> = memo(({
  columns,
  sortConfig,
  onSort,
}) => {
  return (
    <TableHead
      sx={{
        backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
      }}
    >
      <TableRow sx={singleTheme.tableStyles.primary.header.row}>
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
                      cursor: "pointer",
                      userSelect: "none",
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
                ...(column.minWidth && !isActionColumn
                  ? { minWidth: column.minWidth }
                  : {}),
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
                    color:
                      sortConfig.key === column.id ? "primary.main" : "inherit",
                  }}
                >
                  {column.label}
                </Typography>
                {column.sortable && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      color:
                        sortConfig.key === column.id
                          ? "primary.main"
                          : `${text.disabled}`,
                    }}
                  >
                    {sortConfig.key === column.id &&
                      sortConfig.direction === "asc" && (
                        <ChevronUp size={14} />
                      )}
                    {sortConfig.key === column.id &&
                      sortConfig.direction === "desc" && (
                        <ChevronDown size={14} />
                      )}
                    {sortConfig.key !== column.id && (
                      <ChevronsUpDown size={14} />
                    )}
                  </Box>
                )}
              </Box>
            </TableCell>
          );
        })}
      </TableRow>
    </TableHead>
  );
});

export default StandardTableHead;
