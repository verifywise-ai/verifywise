import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableFooter,
  Typography,
  useTheme,
  Stack,
  Box,
} from "@mui/material";
import singleTheme from "../../../themes/v1SingleTheme";
import TablePaginationActions from "../../TablePagination";
import { ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import Placeholder from "../../../assets/imgs/empty-state.svg";
import { IAITrustCenterTableProps } from "../../../types/interfaces/i.table";

const SelectorVertical = (props: any) => (
  <ChevronsUpDown size={16} {...props} />
);

const DEFAULT_ROWS_PER_PAGE = 5;
const AI_TRUST_CENTER_SORTING_KEY = "verifywise_ai_trust_center_sorting";

type SortDirection = "asc" | "desc" | null;
type SortConfig = {
  key: string;
  direction: SortDirection;
};

const AITrustCenterTable = <T extends { id: number }>({
  data,
  columns,
  isLoading = false,
  paginated = true,
  emptyStateText = "No data found. Add your first item to get started.",
  renderRow,
  onRowClick,
  tableId = "ai-trust-center-table",
  disabled = false,
  hidePagination = false,
  flashRowId,
}: IAITrustCenterTableProps<T>) => {
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE);

  // Initialize sorting state from localStorage or default to no sorting
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(AI_TRUST_CENTER_SORTING_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { key: "", direction: null };
      }
    }
    return { key: "", direction: null };
  });

  // Save sorting state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(AI_TRUST_CENTER_SORTING_KEY, JSON.stringify(sortConfig));
  }, [sortConfig]);

  const handleChangePage = useCallback((_: unknown, newPage: number) => {
    setPage(newPage);
  }, []);

  const handleChangeRowsPerPage = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRowsPerPage(parseInt(event.target.value, 10));
      setPage(0);
    },
    []
  );

  // Sorting handlers
  const handleSort = useCallback((columnId: string) => {
    setSortConfig((prevConfig) => {
      if (prevConfig.key === columnId) {
        // Toggle direction if same column, or clear if already descending
        if (prevConfig.direction === "asc") {
          return { key: columnId, direction: "desc" };
        } else if (prevConfig.direction === "desc") {
          return { key: "", direction: null };
        }
      }
      // New column or first sort
      return { key: columnId, direction: "asc" };
    });
  }, []);

  // Sort the data based on current sort configuration
  const sortedData = useMemo(() => {
    if (!data || !sortConfig.key || !sortConfig.direction) {
      return data || [];
    }

    const sortableData = [...data];

    return sortableData.sort((a: any, b: any) => {
      let aValue: string | number | boolean;
      let bValue: string | number | boolean;

      // Use exact column name matching - case insensitive
      const sortKey = sortConfig.key.trim().toLowerCase();

      // Handle different column types for AI Trust Center data
      if (sortKey.includes("name")) {
        aValue = a.name?.toString().toLowerCase() || "";
        bValue = b.name?.toString().toLowerCase() || "";
      } else if (sortKey.includes("type") || sortKey.includes("purpose") || sortKey.includes("description")) {
        aValue = a.description?.toString().toLowerCase() || "";
        bValue = b.description?.toString().toLowerCase() || "";
      } else if (sortKey.includes("visible")) {
        aValue = a.visible || false;
        bValue = b.visible || false;
      } else if (sortKey.includes("action")) {
        // Don't sort by action column
        return 0;
      } else {
        // Try to handle unknown columns by checking if they're properties of the item
        if (sortKey && sortKey in a && sortKey in b) {
          const aVal = (a as Record<string, unknown>)[sortKey];
          const bVal = (b as Record<string, unknown>)[sortKey];
          aValue = String(aVal).toLowerCase();
          bValue = String(bVal).toLowerCase();
          const comparison = aValue.localeCompare(bValue);
          return sortConfig.direction === "asc" ? comparison : -comparison;
        }
        return 0;
      }

      // Handle boolean comparisons
      if (typeof aValue === "boolean" && typeof bValue === "boolean") {
        if (aValue === bValue) return 0;
        return sortConfig.direction === "asc" ? (aValue ? -1 : 1) : (aValue ? 1 : -1);
      }

      // Handle string comparisons
      if (typeof aValue === "string" && typeof bValue === "string") {
        const comparison = aValue.localeCompare(bValue);
        return sortConfig.direction === "asc" ? comparison : -comparison;
      }

      // Handle number comparisons
      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortConfig]);

  const getRange = useMemo(() => {
    const start = page * rowsPerPage + 1;
    const end = Math.min(page * rowsPerPage + rowsPerPage, sortedData?.length ?? 0);
    return `${start} - ${end}`;
  }, [page, rowsPerPage, sortedData?.length]);

  const tableHeader = useMemo(
    () => (
      <TableHead
        sx={{
          backgroundColor:
            singleTheme.tableStyles.primary.header.backgroundColors,
        }}
      >
        <TableRow sx={singleTheme.tableStyles.primary.header.row}>
          {columns.map((column) => {
            const isLastColumn = column.id === "action";
            const sortable = !["action"].includes(column.id);

            return (
              <TableCell
                key={column.id}
                sx={{
                  ...singleTheme.tableStyles.primary.header.cell,
                  // Remove width constraints to match original AI Trust Center behavior
                  minWidth: "auto",
                  width: (column as any).width || "auto",
                  maxWidth: (column as any).width || "auto",
                  ...(!isLastColumn && sortable
                    ? {
                        cursor: "pointer",
                        userSelect: "none",
                        "&:hover": {
                          backgroundColor: "rgba(0, 0, 0, 0.04)",
                        },
                      }
                    : {}),
                }}
                onClick={() => sortable && handleSort(column.label)}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: theme.spacing(2),
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 500,
                      color: sortConfig.key === column.label ? "primary.main" : "inherit",
                      textTransform: "uppercase",
                    }}
                  >
                    {column.label}
                  </Typography>
                  {sortable && (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        color: sortConfig.key === column.label ? "primary.main" : "text.disabled",
                      }}
                    >
                      {sortConfig.key === column.label && sortConfig.direction === "asc" && (
                        <ChevronUp size={16} />
                      )}
                      {sortConfig.key === column.label && sortConfig.direction === "desc" && (
                        <ChevronDown size={16} />
                      )}
                      {sortConfig.key !== column.label && (
                        <ChevronsUpDown size={16} />
                      )}
                    </Box>
                  )}
                </Box>
              </TableCell>
            );
          })}
        </TableRow>
      </TableHead>
    ),
    [columns, sortConfig, handleSort, theme]
  );

  const tableBody = useMemo(
    () => (
      <TableBody
        sx={{
          ...(disabled && {
            opacity: 0.6,
            pointerEvents: "none",
          }),
        }}
      >
        {sortedData &&
          (hidePagination
            ? sortedData
            : sortedData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
          ).map((item) => (
              <TableRow
                key={item.id}
                sx={{
                  ...singleTheme.tableStyles.primary.body.row,
                  "& .MuiTableCell-root": {
                    padding: "8px 10px !important",
                    // Remove width constraints to match original AI Trust Center behavior
                    minWidth: "auto",
                    width: "auto",
                  },
                  ...(onRowClick &&
                    !disabled && {
                      cursor: "pointer",
                      "&:hover": {
                        backgroundColor: singleTheme.tableColors.rowHover,
                      },
                    }),
                  ...(flashRowId === item.id && {
                    backgroundColor: singleTheme.flashColors.background,
                    "& td": {
                      backgroundColor: "transparent !important",
                    },
                    "&:hover": {
                      backgroundColor: singleTheme.flashColors.backgroundHover,
                    },
                  }),
                }}
                onClick={() => !disabled && onRowClick?.(item)}
              >
                {renderRow(item, sortConfig)}
              </TableRow>
            ))}
      </TableBody>
    ),
    [sortedData, page, rowsPerPage, renderRow, onRowClick, disabled, hidePagination, flashRowId, sortConfig]
  );

  const emptyState = useMemo(
    () => (
      <Stack
        alignItems="center"
        justifyContent="center"
        sx={{
          border: "1px solid #EEEEEE",
          borderRadius: "4px",
          padding: theme.spacing(15, 5),
          paddingBottom: theme.spacing(20),
          gap: theme.spacing(10),
          minHeight: 200,
          backgroundColor: "background.main",
        }}
      >
        <img src={Placeholder} alt="Empty state" />
        <Typography sx={{ fontSize: "13px", color: "text.tertiary" }}>
          {emptyStateText}
        </Typography>
      </Stack>
    ),
    [theme, emptyStateText]
  );

  if (isLoading) {
    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        sx={{
          border: "1px solid #EEEEEE",
          borderRadius: "4px",
          padding: theme.spacing(15, 5),
          minHeight: 200,
        }}
      >
        <Typography sx={{ fontSize: "13px", color: "text.tertiary" }}>
          Loading...
        </Typography>
      </Stack>
    );
  }

  if (!sortedData || sortedData.length === 0) {
    return emptyState;
  }

  return (
    <TableContainer sx={{ overflowX: "auto" }} id={tableId}>
      <Table sx={singleTheme.tableStyles.primary.frame}>
        {tableHeader}
        {tableBody}
        {paginated && !hidePagination && (
          <TableFooter>
            <TableRow
              sx={{
                "& .MuiTableCell-root.MuiTableCell-footer": {
                  paddingX: theme.spacing(8),
                  paddingY: theme.spacing(4),
                },
              }}
            >
              <TableCell
                sx={{
                  paddingX: theme.spacing(2),
                  fontSize: 12,
                  opacity: 0.7,
                }}
              >
                Showing {getRange} of {sortedData?.length} item(s)
              </TableCell>
              <TablePagination
                count={sortedData?.length}
                page={page}
                onPageChange={handleChangePage}
                rowsPerPage={rowsPerPage}
                rowsPerPageOptions={[5, 10, 15, 25]}
                onRowsPerPageChange={handleChangeRowsPerPage}
                ActionsComponent={(props) => (
                  <TablePaginationActions {...props} />
                )}
                labelRowsPerPage="Rows per page"
                labelDisplayedRows={({ page, count }) =>
                  `Page ${page + 1} of ${Math.max(
                    0,
                    Math.ceil(count / rowsPerPage)
                  )}`
                }
                slotProps={{
                  select: {
                    MenuProps: {
                      keepMounted: true,
                      PaperProps: {
                        className: "pagination-dropdown",
                        sx: {
                          mt: 0,
                          mb: theme.spacing(2),
                        },
                      },
                      transformOrigin: {
                        vertical: "bottom",
                        horizontal: "left",
                      },
                      anchorOrigin: {
                        vertical: "top",
                        horizontal: "left",
                      },
                      sx: { mt: theme.spacing(-2) },
                    },
                    inputProps: { id: "pagination-dropdown" },
                    IconComponent: SelectorVertical,
                    sx: {
                      ml: theme.spacing(4),
                      mr: theme.spacing(12),
                      minWidth: theme.spacing(20),
                      textAlign: "left",
                      "&.Mui-focused > div": {
                        backgroundColor: theme.palette.background.main,
                      },
                    },
                  },
                }}
                sx={{
                  mt: theme.spacing(6),
                  color: theme.palette.text.secondary,
                  "& .MuiSelect-icon": {
                    width: "24px",
                    height: "fit-content",
                  },
                  "& .MuiSelect-select": {
                    width: theme.spacing(10),
                    borderRadius: theme.shape.borderRadius,
                    border: `1px solid ${theme.palette.border.light}`,
                    padding: theme.spacing(4),
                  },
                }}
              />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </TableContainer>
  );
};

export default AITrustCenterTable;
