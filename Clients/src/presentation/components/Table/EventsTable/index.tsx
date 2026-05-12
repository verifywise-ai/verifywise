/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { formatDateTime } from "../../../tools/isoDateToString";
import { Event } from "../../../../domain/types/Event";
import { User } from "../../../../domain/types/User";
import {
  getPaginationRowCount,
  setPaginationRowCount,
} from "../../../../application/utils/paginationStorage";
import { IEventsTableProps } from "../../../types/interfaces/i.table";
import { status } from "../../../themes/palette";

const EVENTS_TABLE_SORTING_KEY = "verifywise_events_table_sorting";

type SortDirection = "asc" | "desc" | null;
type SortConfig = {
  key: string;
  direction: SortDirection;
};

const SelectorVertical = (props: any) => <ChevronsUpDown size={16} {...props} />;

const TABLE_COLUMNS = [
  { id: "id", label: "ID" },
  { id: "event_type", label: "EVENT TYPE" },
  { id: "description", label: "DESCRIPTION" },
  { id: "user_id", label: "USER (ID)" },
  { id: "timestamp", label: "TIMESTAMP" },
];

const DEFAULT_ROWS_PER_PAGE = 10;

const EventTypeBadge: React.FC<{ eventType: Event["event_type"] }> = ({ eventType }) => {
  const eventTypeStyles = {
    Create: { bg: "#E6F4EA", color: `${status.success.text}` },
    Read: { bg: "#DCEFFF", color: "#1976D2" },
    Update: { bg: "#FFF8E1", color: "#795000" },
    Delete: { bg: "#FFD6D6", color: `${status.error.text}` },
    Error: { bg: "#FFE5D0", color: "#E64A19" },
  };

  const style = eventTypeStyles[eventType] || {
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
      {eventType}
    </span>
  );
};

const EventsTable: React.FC<IEventsTableProps> = ({
  data,
  users = [],
  isLoading,
  paginated = true,
}) => {
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(() =>
    getPaginationRowCount("eventTracker", DEFAULT_ROWS_PER_PAGE),
  );

  // Initialize sorting state from localStorage or default to no sorting
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(EVENTS_TABLE_SORTING_KEY);
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
    localStorage.setItem(EVENTS_TABLE_SORTING_KEY, JSON.stringify(sortConfig));
  }, [sortConfig]);

  // Format users data like other tables do
  const formattedUsers = useMemo(() => {
    return users?.map((user: User) => ({
      _id: user.id,
      name: `${user.name} ${user.surname}`,
    }));
  }, [users]);

  const handleChangePage = useCallback((_: unknown, newPage: number) => {
    setPage(newPage);
  }, []);

  const handleChangeRowsPerPage = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    setRowsPerPage(newRowsPerPage);
    setPaginationRowCount("eventTracker", newRowsPerPage);
    setPage(0);
  }, []);

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

  // Sort the events data based on current sort configuration
  const sortedData = useMemo(() => {
    if (!data || !sortConfig.key || !sortConfig.direction) {
      return data || [];
    }

    const sortableData = [...data];

    return sortableData.sort((a: Event, b: Event) => {
      let aValue: string | number;
      let bValue: string | number;

      // Use exact column name matching - case insensitive
      const sortKey = sortConfig.key.trim().toLowerCase();

      // Handle different column types for events
      if (sortKey.includes("id")) {
        aValue = a.id?.toString() || "";
        bValue = b.id?.toString() || "";
      } else if (sortKey.includes("event") || sortKey.includes("type")) {
        aValue = a.event_type?.toLowerCase() || "";
        bValue = b.event_type?.toLowerCase() || "";
      } else if (sortKey.includes("description")) {
        aValue = a.description?.toLowerCase() || "";
        bValue = b.description?.toLowerCase() || "";
      } else if (sortKey.includes("user")) {
        // Get user name for sorting, fallback to user_id
        const aUserName =
          formattedUsers?.find((user: any) => user._id === a.user_id)?.name?.toLowerCase() || "";
        const bUserName =
          formattedUsers?.find((user: any) => user._id === b.user_id)?.name?.toLowerCase() || "";
        aValue = aUserName || a.user_id?.toString() || "";
        bValue = bUserName || b.user_id?.toString() || "";
      } else if (sortKey.includes("timestamp") || sortKey.includes("time")) {
        aValue = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        bValue = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      } else {
        // Try to handle unknown columns by checking if they're properties of the event
        if (sortKey && sortKey in a && sortKey in b) {
          const aVal = (a as any)[sortKey];
          const bVal = (b as any)[sortKey];
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

      // Handle number comparisons (for dates and IDs)
      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortConfig, formattedUsers]);

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
                      ? "80px"
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
                    color: sortConfig.key === column.label ? "primary.main" : "text.disabled",
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
          sortedData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((event) => (
            <TableRow
              key={event.id}
              sx={{
                ...singleTheme.tableStyles.primary.body.row,
                "&:hover": { backgroundColor: "background.surface", cursor: "pointer" },
              }}
            >
              <TableCell
                sx={{
                  ...singleTheme.tableStyles.primary.body.cell,
                  width: "80px",
                  whiteSpace: "nowrap",
                  backgroundColor:
                    sortConfig.key && sortConfig.key.toLowerCase().includes("id")
                      ? "#e8e8e8"
                      : "#fafafa",
                }}
              >
                {event.id}
              </TableCell>
              <TableCell
                sx={{
                  ...singleTheme.tableStyles.primary.body.cell,
                  width: "fit-content",
                  whiteSpace: "nowrap",
                  backgroundColor:
                    sortConfig.key &&
                    (sortConfig.key.toLowerCase().includes("event") ||
                      sortConfig.key.toLowerCase().includes("type"))
                      ? "background.surface"
                      : "inherit",
                }}
              >
                <EventTypeBadge eventType={event.event_type} />
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
                {event.description}
              </TableCell>
              <TableCell
                sx={{
                  ...singleTheme.tableStyles.primary.body.cell,
                  width: "fit-content",
                  whiteSpace: "nowrap",
                  backgroundColor:
                    sortConfig.key && sortConfig.key.toLowerCase().includes("user")
                      ? "background.surface"
                      : "inherit",
                }}
              >
                {(() => {
                  const userName = formattedUsers?.find(
                    (user: any) => user._id === event.user_id,
                  )?.name;
                  return userName ? `${userName} (${event.user_id})` : event.user_id;
                })()}
              </TableCell>
              <TableCell
                sx={{
                  ...singleTheme.tableStyles.primary.body.cell,
                  width: "fit-content",
                  whiteSpace: "nowrap",
                  backgroundColor:
                    sortConfig.key &&
                    (sortConfig.key.toLowerCase().includes("timestamp") ||
                      sortConfig.key.toLowerCase().includes("time"))
                      ? "background.surface"
                      : "inherit",
                }}
              >
                {event.timestamp ? formatDateTime(event.timestamp) : "N/A"}
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={TABLE_COLUMNS.length} align="center" sx={{ py: 4 }}>
              No event data available.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    ),
    [sortedData, page, rowsPerPage, formattedUsers],
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
        <Typography>Loading...</Typography>
      </Stack>
    );
  }

  if (!sortedData || sortedData.length === 0) {
    return (
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
        <img src={Placeholder} alt="Placeholder" />
        <Typography sx={{ fontSize: "13px", color: "text.tertiary" }}>
          There is currently no data in this table.
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={0}>
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table sx={singleTheme.tableStyles.primary.frame}>
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
                rowsPerPageOptions={[5, 10, 15, 25]}
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
                    IconComponent: SelectorVertical,
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

export default EventsTable;
