import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  useTheme,
  Stack,
  Typography,
  Box,
} from "@mui/material";
import TablePaginationActions from "../../TablePagination";
import singleTheme from "../../../themes/v1SingleTheme";
import { ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import Placeholder from "../../../assets/imgs/empty-state.svg";
import CustomizableSkeleton from "../../Skeletons";
import {
  getPaginationRowCount,
  setPaginationRowCount,
} from "../../../../application/utils/paginationStorage";
import { text, status } from "../../../themes/palette";

const LOGS_TABLE_SORTING_KEY = "verifywise_logs_table_sorting";

type SortDirection = "asc" | "desc" | null;
type SortConfig = {
  key: string;
  direction: SortDirection;
};

// Parsed log entry structure
export interface ParsedLogEntry {
  id: string;
  timestamp: string;
  state: "processing" | "successful" | "error" | string;
  description: string;
  functionName: string;
  fileName: string;
  raw: string;
}

interface LogsTableProps {
  data: string[];
  isLoading?: boolean;
  paginated?: boolean;
}

const TABLE_COLUMNS = [
  { id: "id", label: "ID" },
  { id: "timestamp", label: "TIMESTAMP" },
  { id: "state", label: "STATE" },
  { id: "description", label: "DESCRIPTION" },
  { id: "functionName", label: "FUNCTION" },
  { id: "fileName", label: "FILE" },
];

const DEFAULT_ROWS_PER_PAGE = 10;

// Parse a log line into structured data
// Format: ${logId}, ${timestamp}, ${state}, ${description}, ${functionName}, ${fileName}
const parseLogLine = (line: string, index: number): ParsedLogEntry | null => {
  // Try to parse structured log format first
  const parts = line.split(", ");

  if (parts.length >= 6) {
    // Check if first part looks like an ID (number)
    const potentialId = parts[0].trim();
    if (/^\d+$/.test(potentialId)) {
      return {
        id: potentialId,
        timestamp: parts[1].trim(),
        state: parts[2].trim().toLowerCase(),
        description: parts[3].trim(),
        functionName: parts[4].trim(),
        fileName: parts.slice(5).join(", ").trim(), // Join remaining parts in case filename has commas
        raw: line,
      };
    }
  }

  // Fallback: Try to parse Winston log format: ${timestamp} [${level}]: ${message}
  const winstonMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s*\[(\w+)\]:\s*(.*)$/);
  if (winstonMatch) {
    return {
      id: String(index + 1),
      timestamp: winstonMatch[1],
      state: winstonMatch[2].toLowerCase(),
      description: winstonMatch[3],
      functionName: "-",
      fileName: "-",
      raw: line,
    };
  }

  // If parsing fails, return null (will be filtered out)
  return null;
};

const StateBadge: React.FC<{ state: string }> = ({ state }) => {
  const stateStyles: Record<string, { bg: string; color: string }> = {
    successful: { bg: "#E6F4EA", color: `${status.success.text}` },
    success: { bg: "#E6F4EA", color: `${status.success.text}` },
    processing: { bg: "#FFF8E1", color: "#795000" },
    error: { bg: "#FFD6D6", color: `${status.error.text}` },
    info: { bg: "#DCEFFF", color: "#1976D2" },
    warn: { bg: "#FFE5D0", color: "#E64A19" },
    warning: { bg: "#FFE5D0", color: "#E64A19" },
    debug: { bg: "#F3E5F5", color: "#6A1B9A" },
  };

  const normalizedState = state.toLowerCase();
  const style = stateStyles[normalizedState] || {
    bg: "#E0E0E0",
    color: "#424242",
  };

  return (
    <span
      style={{
        backgroundColor: style.bg,
        color: style.color,
        padding: "4px 8px",
        borderRadius: "4px",
        fontWeight: 500,
        fontSize: 11,
        textTransform: "uppercase",
        display: "inline-block",
      }}
    >
      {state}
    </span>
  );
};

const LogsTable: React.FC<LogsTableProps> = ({ data, isLoading = false, paginated = true }) => {
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(() =>
    getPaginationRowCount("logsTable", DEFAULT_ROWS_PER_PAGE),
  );

  // Initialize sorting state from localStorage or default to no sorting
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(LOGS_TABLE_SORTING_KEY);
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
    localStorage.setItem(LOGS_TABLE_SORTING_KEY, JSON.stringify(sortConfig));
  }, [sortConfig]);

  // Parse log lines into structured data
  const parsedLogs = useMemo(() => {
    return data
      .map((line, index) => parseLogLine(line, index))
      .filter((entry): entry is ParsedLogEntry => entry !== null);
  }, [data]);

  const handleChangePage = useCallback((_: unknown, newPage: number) => {
    setPage(newPage);
  }, []);

  const handleChangeRowsPerPage = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    setRowsPerPage(newRowsPerPage);
    setPaginationRowCount("logsTable", newRowsPerPage);
    setPage(0);
  }, []);

  // Sorting handlers
  const handleSort = useCallback((columnId: string) => {
    setSortConfig((prevConfig) => {
      if (prevConfig.key === columnId) {
        if (prevConfig.direction === "asc") {
          return { key: columnId, direction: "desc" };
        } else if (prevConfig.direction === "desc") {
          return { key: "", direction: null };
        }
      }
      return { key: columnId, direction: "asc" };
    });
  }, []);

  // Sort the logs data based on current sort configuration
  const sortedData = useMemo(() => {
    if (!parsedLogs || !sortConfig.key || !sortConfig.direction) {
      return parsedLogs || [];
    }

    const sortableData = [...parsedLogs];

    return sortableData.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      const sortKey = sortConfig.key.trim().toLowerCase();

      if (sortKey.includes("id")) {
        aValue = parseInt(a.id) || 0;
        bValue = parseInt(b.id) || 0;
      } else if (sortKey.includes("timestamp") || sortKey.includes("time")) {
        aValue = new Date(a.timestamp).getTime() || 0;
        bValue = new Date(b.timestamp).getTime() || 0;
      } else if (sortKey.includes("state")) {
        aValue = a.state.toLowerCase();
        bValue = b.state.toLowerCase();
      } else if (sortKey.includes("description")) {
        aValue = a.description.toLowerCase();
        bValue = b.description.toLowerCase();
      } else if (sortKey.includes("function")) {
        aValue = a.functionName.toLowerCase();
        bValue = b.functionName.toLowerCase();
      } else if (sortKey.includes("file")) {
        aValue = a.fileName.toLowerCase();
        bValue = b.fileName.toLowerCase();
      } else {
        return 0;
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        const comparison = aValue.localeCompare(bValue);
        return sortConfig.direction === "asc" ? comparison : -comparison;
      }

      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [parsedLogs, sortConfig]);

  const formatTimestamp = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return timestamp;
      return date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return timestamp;
    }
  };

  const tableHeader = useMemo(
    () => (
      <TableHead
        sx={{
          backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
        }}
      >
        <TableRow sx={singleTheme.tableStyles.primary.header.row}>
          {TABLE_COLUMNS.map((column) => (
            <TableCell
              key={column.id}
              sx={{
                ...singleTheme.tableStyles.primary.header.cell,
                "width":
                  column.id === "description"
                    ? "auto"
                    : column.id === "id"
                      ? "60px"
                      : column.id === "timestamp"
                        ? "180px"
                        : "fit-content",
                "whiteSpace": column.id === "description" ? "normal" : "nowrap",
                "cursor": "pointer",
                "userSelect": "none",
                "&:hover": {
                  backgroundColor: "rgba(0, 0, 0, 0.04)",
                },
              }}
              onClick={() => handleSort(column.label)}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: theme.spacing(2),
                }}
              >
                <div
                  style={{
                    fontWeight: 400,
                    color: sortConfig.key === column.label ? "primary.main" : "inherit",
                  }}
                >
                  {column.label}
                </div>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    color: sortConfig.key === column.label ? "primary.main" : `${text.disabled}`,
                  }}
                >
                  {sortConfig.key === column.label && sortConfig.direction === "asc" && (
                    <ChevronUp size={16} />
                  )}
                  {sortConfig.key === column.label && sortConfig.direction === "desc" && (
                    <ChevronDown size={16} />
                  )}
                  {sortConfig.key !== column.label && <ChevronsUpDown size={16} />}
                </Box>
              </Box>
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
    ),
    [sortConfig, handleSort, theme],
  );

  const tableBody = useMemo(
    () => (
      <TableBody>
        {sortedData?.length > 0 ? (
          sortedData
            .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
            .map((log, index) => (
              <TableRow
                key={`${log.id}-${index}`}
                sx={{
                  ...singleTheme.tableStyles.primary.body.row,
                  "&:hover": { backgroundColor: "background.surface" },
                }}
              >
                <TableCell
                  sx={{
                    ...singleTheme.tableStyles.primary.body.cell,
                    width: "60px",
                    whiteSpace: "nowrap",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    backgroundColor:
                      sortConfig.key && sortConfig.key.toLowerCase().includes("id")
                        ? "#e8e8e8"
                        : "#fafafa",
                  }}
                >
                  {log.id}
                </TableCell>
                <TableCell
                  sx={{
                    ...singleTheme.tableStyles.primary.body.cell,
                    width: "180px",
                    whiteSpace: "nowrap",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    backgroundColor:
                      sortConfig.key && sortConfig.key.toLowerCase().includes("timestamp")
                        ? "background.surface"
                        : "inherit",
                  }}
                >
                  {formatTimestamp(log.timestamp)}
                </TableCell>
                <TableCell
                  sx={{
                    ...singleTheme.tableStyles.primary.body.cell,
                    width: "fit-content",
                    whiteSpace: "nowrap",
                    backgroundColor:
                      sortConfig.key && sortConfig.key.toLowerCase().includes("state")
                        ? "background.surface"
                        : "inherit",
                  }}
                >
                  <StateBadge state={log.state} />
                </TableCell>
                <TableCell
                  sx={{
                    ...singleTheme.tableStyles.primary.body.cell,
                    width: "auto",
                    whiteSpace: "normal",
                    backgroundColor:
                      sortConfig.key && sortConfig.key.toLowerCase().includes("description")
                        ? "background.surface"
                        : "inherit",
                  }}
                >
                  {log.description}
                </TableCell>
                <TableCell
                  sx={{
                    ...singleTheme.tableStyles.primary.body.cell,
                    width: "fit-content",
                    whiteSpace: "nowrap",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    color: theme.palette.text.secondary,
                    backgroundColor:
                      sortConfig.key && sortConfig.key.toLowerCase().includes("function")
                        ? "background.surface"
                        : "inherit",
                  }}
                >
                  {log.functionName}
                </TableCell>
                <TableCell
                  sx={{
                    ...singleTheme.tableStyles.primary.body.cell,
                    width: "fit-content",
                    whiteSpace: "nowrap",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    color: theme.palette.text.secondary,
                    backgroundColor:
                      sortConfig.key && sortConfig.key.toLowerCase().includes("file")
                        ? "background.surface"
                        : "inherit",
                  }}
                >
                  {log.fileName}
                </TableCell>
              </TableRow>
            ))
        ) : (
          <TableRow>
            <TableCell colSpan={TABLE_COLUMNS.length} align="center" sx={{ py: 4 }}>
              No log data available.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    ),
    [sortedData, page, rowsPerPage, sortConfig, theme],
  );

  if (isLoading) {
    return (
      <Stack spacing={2}>
        <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
      </Stack>
    );
  }

  if (!sortedData || sortedData.length === 0) {
    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        sx={{
          border: "1px solid #d0d5dd",
          borderRadius: "4px",
          padding: theme.spacing(15, 5),
          paddingBottom: theme.spacing(20),
          gap: theme.spacing(10),
          minHeight: 200,
        }}
      >
        <img src={Placeholder} alt="Placeholder" />
        <Typography sx={{ fontSize: "13px", color: "text.tertiary" }}>
          There are currently no logs available.
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={0}>
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table
          sx={{
            ...singleTheme.tableStyles.primary.frame,
            ...(paginated && {
              borderRadius: "4px 4px 0 0",
              borderBottom: "none",
            }),
          }}
        >
          {tableHeader}
          {tableBody}
        </Table>
      </TableContainer>

      {paginated && (
        <Table>
          <TableBody>
            <TableRow>
              <TablePagination
                count={sortedData?.length ?? 0}
                page={page}
                onPageChange={handleChangePage}
                rowsPerPage={rowsPerPage}
                rowsPerPageOptions={[5, 10, 15, 25, 50]}
                onRowsPerPageChange={handleChangeRowsPerPage}
                ActionsComponent={(props) => <TablePaginationActions {...props} />}
                labelRowsPerPage="Rows per page"
                labelDisplayedRows={({ page, count }) =>
                  `Page ${page + 1} of ${Math.max(0, Math.ceil(count / rowsPerPage))}`
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
                    IconComponent: () => <ChevronsUpDown size={16} />,
                    sx: {
                      "ml": theme.spacing(4),
                      "mr": theme.spacing(12),
                      "minWidth": theme.spacing(20),
                      "textAlign": "left",
                      "&.Mui-focused > div": {
                        backgroundColor: theme.palette.background.main,
                      },
                    },
                  },
                }}
                sx={{
                  "backgroundColor": theme.palette.grey[50],
                  "border": `1px solid ${theme.palette.border.light}`,
                  "borderTop": "none",
                  "borderRadius": `0 0 ${theme.shape.borderRadius}px ${theme.shape.borderRadius}px`,
                  "color": theme.palette.text.secondary,
                  "height": "50px",
                  "minHeight": "50px",
                  "& .MuiTablePagination-toolbar": {
                    minHeight: "50px",
                    paddingTop: "4px",
                    paddingBottom: "4px",
                  },
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
          </TableBody>
        </Table>
      )}
    </Stack>
  );
};

export default LogsTable;
