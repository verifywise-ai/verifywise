/**
 * ControlsMatrix — master × frameworks grid on the Controls Hub page.
 *
 * Renders a sortable, paginated MUI Table with one row per master control.
 * Columns: Title • Status • Owner • EU AI Act • ISO 42001 • ISO 27001 •
 * NIST AI RMF • Due date • Actions.
 *
 * The four framework cells render a `FrameworkCell` chip cluster listing
 * mapped requirement codes (with a "+N" overflow chip for long mapping
 * lists).
 *
 * Row click → opens the master control drawer (wired in T-029).
 */

import { useCallback, useMemo, useState } from "react";
import {
  Box,
  Checkbox,
  Chip as MuiChip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TablePagination,
  TableRow,
  useTheme,
} from "@mui/material";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import type {
  MasterControlModel,
  MasterControlStatus,
} from "../../../../domain/models/Common/masterControl/masterControl.model";
import { singleTheme } from "../../../themes";
import FrameworkCell from "./FrameworkCell";

// ---------- Column definitions ----------

type ColumnId =
  | "title"
  | "status"
  | "owner"
  | "eu_ai_act"
  | "iso_42001"
  | "iso_27001"
  | "nist_ai_rmf"
  | "due_date";

interface Column {
  id: ColumnId;
  label: string;
  sortable: boolean;
  minWidth?: number;
}

const COLUMNS: Column[] = [
  { id: "title", label: "TITLE", sortable: true, minWidth: 240 },
  { id: "status", label: "STATUS", sortable: true, minWidth: 120 },
  { id: "owner", label: "OWNER", sortable: true, minWidth: 100 },
  { id: "eu_ai_act", label: "EU AI ACT", sortable: false, minWidth: 110 },
  { id: "iso_42001", label: "ISO 42001", sortable: false, minWidth: 110 },
  { id: "iso_27001", label: "ISO 27001", sortable: false, minWidth: 110 },
  { id: "nist_ai_rmf", label: "NIST AI RMF", sortable: false, minWidth: 120 },
  { id: "due_date", label: "DUE DATE", sortable: true, minWidth: 140 },
];

type SortDirection = "asc" | "desc" | null;
type SortConfig = { key: ColumnId | ""; direction: SortDirection };

// ---------- Helpers ----------

const STATUS_ORDER: Record<MasterControlStatus, number> = {
  Waiting: 0,
  "In progress": 1,
  Done: 2,
};

const STATUS_COLORS: Record<MasterControlStatus, { bg: string; fg: string }> = {
  Waiting: { bg: "#F2F4F7", fg: "#475467" },
  "In progress": { bg: "#FEF0C7", fg: "#B54708" },
  Done: { bg: "#D1FADF", fg: "#027A48" },
};

function compareNullable(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls sort last
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a).toLowerCase();
  const sb = String(b).toLowerCase();
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}

function formatDueDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * A master control is overdue when it has a due date in the past AND the
 * work is not yet `Done`. Used to flag the due-date cell with red copy.
 */
function isOverdue(row: MasterControlModel): boolean {
  if (!row.due_date || row.status === "Done") return false;
  const d = new Date(row.due_date);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

// ---------- Component ----------

interface ControlsMatrixProps {
  masterControls: MasterControlModel[];
  onRowClick?: (row: MasterControlModel) => void;
  /** Selection set for bulk-edit. Omit both props to disable checkboxes. */
  selectedIds?: Set<number>;
  onSelectionChange?: (nextSelection: Set<number>) => void;
}

const cellStyle = singleTheme.tableStyles.primary.body.cell;

export function ControlsMatrix({
  masterControls,
  onRowClick,
  selectedIds,
  onSelectionChange,
}: ControlsMatrixProps) {
  const theme = useTheme();
  const selectionEnabled = Boolean(selectedIds && onSelectionChange);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: "",
    direction: null,
  });

  const handleSort = useCallback((columnId: ColumnId) => {
    setSortConfig((prev) => {
      if (prev.key === columnId) {
        if (prev.direction === "asc") return { key: columnId, direction: "desc" };
        if (prev.direction === "desc") return { key: "", direction: null };
      }
      return { key: columnId, direction: "asc" };
    });
  }, []);

  const sortedRows = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return masterControls;

    const rows = [...masterControls];
    const dir = sortConfig.direction === "asc" ? 1 : -1;

    rows.sort((a, b) => {
      switch (sortConfig.key) {
        case "title":
          return compareNullable(a.title, b.title) * dir;
        case "status":
          return (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) * dir;
        case "owner":
          return compareNullable(a.owner, b.owner) * dir;
        case "due_date": {
          const ad = a.due_date ? new Date(a.due_date).getTime() : null;
          const bd = b.due_date ? new Date(b.due_date).getTime() : null;
          return compareNullable(ad, bd) * dir;
        }
        default:
          return 0;
      }
    });

    return rows;
  }, [masterControls, sortConfig]);

  const pagedRows = useMemo(
    () =>
      sortedRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [sortedRows, page, rowsPerPage]
  );

  // ---------- Selection helpers ----------
  const toggleRowSelection = (rowId: number) => {
    if (!selectedIds || !onSelectionChange) return;
    const next = new Set(selectedIds);
    if (next.has(rowId)) {
      next.delete(rowId);
    } else {
      next.add(rowId);
    }
    onSelectionChange(next);
  };

  const pageRowIds = useMemo(
    () => pagedRows.map((r) => r.id).filter((id): id is number => typeof id === "number"),
    [pagedRows]
  );

  const allPageSelected =
    pageRowIds.length > 0 &&
    pageRowIds.every((id) => selectedIds?.has(id));
  const somePageSelected =
    !allPageSelected && pageRowIds.some((id) => selectedIds?.has(id));

  const toggleSelectAllOnPage = () => {
    if (!selectedIds || !onSelectionChange) return;
    const next = new Set(selectedIds);
    if (allPageSelected) {
      pageRowIds.forEach((id) => next.delete(id));
    } else {
      pageRowIds.forEach((id) => next.add(id));
    }
    onSelectionChange(next);
  };

  const handleChangePage = (_: unknown, newPage: number) => setPage(newPage);
  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // ---------- Render ----------

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table sx={singleTheme.tableStyles.primary.frame}>
        <TableHead
          sx={{
            backgroundColor:
              singleTheme.tableStyles.primary.header.backgroundColors,
          }}
        >
          <TableRow sx={singleTheme.tableStyles.primary.header.row}>
            {selectionEnabled && (
              <TableCell
                padding="checkbox"
                sx={{
                  ...singleTheme.tableStyles.primary.header.cell,
                  width: 44,
                }}
              >
                <Checkbox
                  size="small"
                  checked={allPageSelected}
                  indeterminate={somePageSelected}
                  onChange={toggleSelectAllOnPage}
                  inputProps={{
                    "aria-label": "Select all master controls on this page",
                  }}
                />
              </TableCell>
            )}
            {COLUMNS.map((column) => (
              <TableCell
                key={column.id}
                sx={{
                  ...singleTheme.tableStyles.primary.header.cell,
                  ...(column.minWidth
                    ? { minWidth: column.minWidth, width: column.minWidth }
                    : {}),
                  ...(column.sortable
                    ? {
                        cursor: "pointer",
                        userSelect: "none",
                        "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.04)" },
                      }
                    : {}),
                }}
                onClick={() => column.sortable && handleSort(column.id)}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: theme.spacing(2),
                  }}
                >
                  <span>{column.label}</span>
                  {column.sortable && (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        color:
                          sortConfig.key === column.id
                            ? "primary.main"
                            : "text.disabled",
                      }}
                    >
                      {sortConfig.key === column.id &&
                        sortConfig.direction === "asc" && <ChevronUp size={16} />}
                      {sortConfig.key === column.id &&
                        sortConfig.direction === "desc" && (
                          <ChevronDown size={16} />
                        )}
                      {sortConfig.key !== column.id && (
                        <ChevronsUpDown size={16} />
                      )}
                    </Box>
                  )}
                </Box>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>

        <TableBody>
          {pagedRows.map((row) => {
            const statusColor = STATUS_COLORS[row.status];
            const rowId = row.id;
            const isSelected =
              typeof rowId === "number" && selectedIds?.has(rowId);
            return (
              <TableRow
                key={row.id}
                sx={singleTheme.tableStyles.primary.body.row}
                selected={Boolean(isSelected)}
                onClick={() => onRowClick?.(row)}
              >
                {selectionEnabled && (
                  <TableCell
                    padding="checkbox"
                    sx={{ width: 44 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      size="small"
                      checked={Boolean(isSelected)}
                      onChange={() => {
                        if (typeof rowId === "number") toggleRowSelection(rowId);
                      }}
                      inputProps={{
                        "aria-label": `Select ${row.title ?? "master control"}`,
                      }}
                    />
                  </TableCell>
                )}
                <TableCell
                  sx={{
                    ...cellStyle,
                    fontWeight: 500,
                    maxWidth: 320,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={row.title}
                >
                  {row.title}
                </TableCell>
                <TableCell sx={cellStyle}>
                  <MuiChip
                    label={row.status}
                    size="small"
                    sx={{
                      backgroundColor: statusColor.bg,
                      color: statusColor.fg,
                      fontWeight: 500,
                      height: 22,
                    }}
                  />
                </TableCell>
                <TableCell
                  sx={{
                    ...cellStyle,
                    color: row.owner != null ? "inherit" : "text.disabled",
                    fontStyle: row.owner != null ? "normal" : "italic",
                  }}
                >
                  {row.owner != null ? `#${row.owner}` : "Unassigned"}
                </TableCell>
                <TableCell sx={cellStyle}>
                  <FrameworkCell
                    mappings={row.getMappingsByFramework("eu_ai_act")}
                  />
                </TableCell>
                <TableCell sx={cellStyle}>
                  <FrameworkCell
                    mappings={row.getMappingsByFramework("iso_42001")}
                  />
                </TableCell>
                <TableCell sx={cellStyle}>
                  <FrameworkCell
                    mappings={row.getMappingsByFramework("iso_27001")}
                  />
                </TableCell>
                <TableCell sx={cellStyle}>
                  <FrameworkCell
                    mappings={row.getMappingsByFramework("nist_ai_rmf")}
                  />
                </TableCell>
                <TableCell
                  sx={{
                    ...cellStyle,
                    color: isOverdue(row) ? "#B42318" : "inherit",
                    fontWeight: isOverdue(row) ? 500 : 400,
                  }}
                >
                  {formatDueDate(row.due_date)}
                  {isOverdue(row) && (
                    <Box component="span" sx={{ ml: 1, fontSize: 11 }}>
                      · Overdue
                    </Box>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>

        <TableFooter>
          <TableRow>
            <TablePagination
              count={sortedRows.length}
              page={page}
              onPageChange={handleChangePage}
              rowsPerPage={rowsPerPage}
              rowsPerPageOptions={[5, 10, 25, 50]}
              onRowsPerPageChange={handleChangeRowsPerPage}
              labelRowsPerPage="Rows per page"
              labelDisplayedRows={({ page: p, count }) =>
                `Page ${p + 1} of ${Math.max(0, Math.ceil(count / rowsPerPage))}`
              }
              colSpan={COLUMNS.length + (selectionEnabled ? 1 : 0)}
            />
          </TableRow>
        </TableFooter>
      </Table>
    </TableContainer>
  );
}
