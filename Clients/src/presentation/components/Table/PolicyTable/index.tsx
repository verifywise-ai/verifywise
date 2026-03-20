import React, { useState, useEffect, useCallback, useContext, useMemo } from "react";
import {
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
  useTheme,
  Box,
} from "@mui/material";
import TablePaginationActions from "../../TablePagination";
import { VerifyWiseContext } from "../../../../application/contexts/VerifyWise.context";
import singleTheme from "../../../themes/v1SingleTheme";
import { ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";

import {
  getPaginationRowCount,
  setPaginationRowCount,
} from "../../../../application/utils/paginationStorage";
import { ITableProps } from "../../../types/interfaces/i.table";
import { text } from "../../../themes/palette";

const POLICY_TABLE_SORTING_KEY = "verifywise_policy_table_sorting";

type SortDirection = "asc" | "desc" | null;
type SortConfig = {
  key: string;
  direction: SortDirection;
};

const SelectorVertical = (props: any) => (
  <ChevronsUpDown size={16} {...props} />
);

const DEFAULT_ROWS_PER_PAGE = 10;

const CustomizablePolicyTable = ({
  data,
  paginated = false,
  onRowClick,
  setSelectedRow,
  setAnchorEl,
  renderRow,
  hidePagination = false,
  flashRowId,
}: ITableProps) => {
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(() =>
    getPaginationRowCount("policyManager", DEFAULT_ROWS_PER_PAGE)
  );
  const { setInputValues } = useContext(VerifyWiseContext);

  // Initialize sorting state from localStorage or default to no sorting
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(POLICY_TABLE_SORTING_KEY);
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
    localStorage.setItem(POLICY_TABLE_SORTING_KEY, JSON.stringify(sortConfig));
  }, [sortConfig]);

  useEffect(() => setPage(0), [data.rows.length, sortConfig]);

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

  const handleChangePage = useCallback(
    (_: unknown, newPage: number) => setPage(newPage),
    []
  );
  const handleChangeRowsPerPage = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newRowsPerPage = parseInt(event.target.value, 10);
      setRowsPerPage(newRowsPerPage);
      setPaginationRowCount("policyManager", newRowsPerPage);
      setPage(0);
    },
    []
  );

  const onRowClickHandler = (
    event: React.MouseEvent<HTMLTableRowElement>,
    rowData: any
  ) => {
    setSelectedRow(rowData);
    setInputValues(rowData);
    setAnchorEl(event.currentTarget);
    onRowClick?.(rowData.id);
  };

  // Sort the data based on current sort configuration
  const sortedData = useMemo(() => {
    if (!data.rows || !sortConfig.key || !sortConfig.direction) {
      return data.rows || [];
    }

    const sortableData = [...data.rows];

    return sortableData.sort((a: any, b: any) => {
      let aValue: string | number;
      let bValue: string | number;

      // Use exact column name matching - case insensitive
      const sortKey = sortConfig.key.trim().toLowerCase();

      // Handle different column types for policies
      if (sortKey.includes("title")) {
        aValue = a.title?.toLowerCase() || "";
        bValue = b.title?.toLowerCase() || "";
      } else if (sortKey.includes("status")) {
        aValue = a.status?.toLowerCase() || "";
        bValue = b.status?.toLowerCase() || "";
      } else if (sortKey.includes("tags")) {
        aValue = a.tags?.join(", ")?.toLowerCase() || "";
        bValue = b.tags?.join(", ")?.toLowerCase() || "";
      } else if (sortKey.includes("next") || sortKey.includes("review")) {
        aValue = a.next_review_date ? new Date(a.next_review_date).getTime() : 0;
        bValue = b.next_review_date ? new Date(b.next_review_date).getTime() : 0;
      } else if (sortKey.includes("author")) {
        aValue = a.author_id?.toString() || "";
        bValue = b.author_id?.toString() || "";
      } else if (sortKey.includes("last") || sortKey.includes("updated")) {
        // Handle both "last updated" and "updated by" columns
        if (sortKey.includes("by")) {
          aValue = a.last_updated_by?.toString() || "";
          bValue = b.last_updated_by?.toString() || "";
        } else {
          aValue = a.last_updated_at ? new Date(a.last_updated_at).getTime() : 0;
          bValue = b.last_updated_at ? new Date(b.last_updated_at).getTime() : 0;
        }
      } else {
        // Try to handle unknown columns by checking if they're properties of the row
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

      // Handle string comparisons
      if (typeof aValue === "string" && typeof bValue === "string") {
        const comparison = aValue.localeCompare(bValue);
        return sortConfig.direction === "asc" ? comparison : -comparison;
      }

      // Handle number comparisons (for dates)
      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [data.rows, sortConfig]);

  const tableHeader = (
    <TableHead
      sx={{
        backgroundColor:
          singleTheme.tableStyles.primary.header.backgroundColors,
      }}
    >
      <TableRow sx={singleTheme.tableStyles.primary.header.row}>
        {data.cols.map((col) => {
          const isLastColumn = col.id === "actions";
          const sortable = !["actions", "tags"].includes(col.id);

          return (
            <TableCell
              key={col.id}
              style={{
                ...singleTheme.tableStyles.primary.header.cell,
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
              onClick={() => sortable && handleSort(col.name)}
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
                    color: sortConfig.key === col.name ? "primary.main" : "inherit",
                    textTransform: "uppercase",
                  }}
                >
                  {col.name}
                </Typography>
                {sortable && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      color: sortConfig.key === col.name ? "primary.main" : `${text.disabled}`,
                    }}
                  >
                    {sortConfig.key === col.name && sortConfig.direction === "asc" && (
                      <ChevronUp size={16} />
                    )}
                    {sortConfig.key === col.name && sortConfig.direction === "desc" && (
                      <ChevronDown size={16} />
                    )}
                    {sortConfig.key !== col.name && (
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
  );

  const tableBody = (
    <TableBody>
      {(hidePagination ? sortedData : (sortedData ?? []).slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage))
        .map((row) =>
          renderRow ? (
            renderRow(row, sortConfig)
          ) : (
            <TableRow
              key={row.id}
              onClick={(event) => onRowClickHandler(event, row)}
              sx={{
                ...(flashRowId === row.id && {
                  backgroundColor: singleTheme.flashColors.background,
                  "& td": {
                    backgroundColor: "transparent !important",
                  },
                  "&:hover": {
                    backgroundColor: singleTheme.flashColors.backgroundHover,
                  },
                }),
              }}
            >
              {data.cols.map((col) => (
                <TableCell
                  key={col.id}
                  style={singleTheme.tableStyles.primary.body.cell}
                >
                  {row[col.id]}
                </TableCell>
              ))}
            </TableRow>
          )
        )}
    </TableBody>
  );

  return (
    <>
      {!sortedData.length ? (
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
          }}
        >
          <Typography sx={{ fontSize: "13px", color: `${text.tertiary}` }}>
            There is currently no data in this table.
          </Typography>
        </Stack>
      ) : (
        <TableContainer>
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
                    Showing {page * rowsPerPage + 1} -{" "}
                    {Math.min(
                      page * rowsPerPage + rowsPerPage,
                      sortedData.length
                    )}{" "}
                    of {sortedData.length} items
                  </TableCell>
                  <TablePagination
                    count={sortedData.length}
                    page={page}
                    onPageChange={handleChangePage}
                    rowsPerPage={rowsPerPage}
                    rowsPerPageOptions={[5, 10, 15, 25]}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                    ActionsComponent={
                      TablePaginationActions as React.ComponentType<any>
                    }
                    labelRowsPerPage="Rows per page"
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
      )}
    </>
  );
};

export default CustomizablePolicyTable;
