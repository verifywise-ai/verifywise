/**
 * @fileoverview AI Detection History Page
 *
 * Page for viewing scan history.
 * Features list of past scans with status, results, and actions.
 *
 * @module pages/AIDetection/HistoryPage
 */

import { useState, useEffect, useCallback, Suspense, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableFooter,
  TablePagination,
  useTheme,
} from "@mui/material";
import Chip from "../../components/Chip";
import Alert from "../../components/Alert";
import { Trash2, ChevronsUpDown, Clock, ChevronUp, ChevronDown, Scan as ScanIcon, GitBranch, Search, BarChart3 } from "lucide-react";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import { EmptyState } from "../../components/EmptyState";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import TablePaginationActions from "../../components/TablePagination";
import singleTheme from "../../themes/v1SingleTheme";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { FilterBy, FilterColumn } from "../../components/Table/FilterBy";
import { GroupBy } from "../../components/Table/GroupBy";
import SearchBox from "../../components/Search/SearchBox";
import { useFilterBy } from "../../../application/hooks/useFilterBy";
import { useGroupByState, useTableGrouping } from "../../../application/hooks/useTableGrouping";
import { GroupedTableView } from "../../components/Table/GroupedTableView";
import { getScans, deleteScan, getScanStatus } from "../../../application/repository/aiDetection.repository";
import { Scan, ScansResponse, ScanStatus } from "../../../domain/ai-detection/types";
import { useAIDetectionSidebarContext } from "../../../application/contexts/AIDetectionSidebar.context";
import { palette } from "../../themes/palette";

function getGradeColor(grade: string | null | undefined): string {
  switch (grade) {
    case "A":
    case "B":
      return palette.status.success.text;
    case "C":
      return palette.status.warning.text;
    case "D":
      return palette.accent.orange.text;
    case "F":
      return palette.status.error.text;
    default:
      return palette.text.accent;
  }
}

const ACTIVE_STATUSES: ScanStatus[] = ["pending", "cloning", "scanning"];
const POLL_INTERVAL_MS = 3000;

const HISTORY_ROWS_PER_PAGE_KEY = "verifywise_ai_detection_history_rows_per_page";
const HISTORY_SORTING_KEY = "verifywise_ai_detection_history_sorting";

type SortDirection = "asc" | "desc" | null;
type SortConfig = {
  key: string;
  direction: SortDirection;
};

const SelectorVertical = (props: React.SVGAttributes<SVGSVGElement>) => (
  <ChevronsUpDown size={16} {...props} />
);


// Table columns configuration with sortable flag
const TABLE_COLUMNS = [
  { id: "repository", label: "REPOSITORY", sortable: true },
  { id: "status", label: "STATUS", sortable: true },
  { id: "risk_score", label: "RISK SCORE", sortable: true },
  { id: "findings", label: "FINDINGS", sortable: true },
  { id: "files", label: "FILES SCANNED", sortable: true },
  { id: "duration", label: "DURATION", sortable: true },
  { id: "triggered_by", label: "TRIGGERED BY", sortable: true },
  { id: "actions", label: "", sortable: false },
];

// Sortable Table Header Component
const SortableTableHead: React.FC<{
  columns: typeof TABLE_COLUMNS;
  sortConfig: SortConfig;
  onSort: (columnId: string) => void;
}> = ({ columns, sortConfig, onSort }) => {
  return (
    <TableHead
      sx={{
        backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
      }}
    >
      <TableRow sx={singleTheme.tableStyles.primary.header.row}>
        {columns.map((column) => (
          <TableCell
            key={column.id}
            sx={{
              ...singleTheme.tableStyles.primary.header.cell,
              ...(column.sortable
                ? {
                    cursor: "pointer",
                    userSelect: "none",
                    "&:hover": {
                      backgroundColor: palette.background.hover,
                    },
                  }
                : {}),
            }}
            onClick={() => column.sortable && onSort(column.id)}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
              }}
            >
              <Typography
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
                    color: sortConfig.key === column.id ? "primary.main" : palette.text.disabled,
                  }}
                >
                  {sortConfig.key === column.id && sortConfig.direction === "asc" && (
                    <ChevronUp size={16} />
                  )}
                  {sortConfig.key === column.id && sortConfig.direction === "desc" && (
                    <ChevronDown size={16} />
                  )}
                  {sortConfig.key !== column.id && <ChevronsUpDown size={16} />}
                </Box>
              )}
            </Box>
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );
};

const STATUS_CONFIG: Record<ScanStatus, string> = {
  pending: "Pending",
  cloning: "Cloning",
  scanning: "Scanning",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

// Filter columns configuration
const FILTER_COLUMNS: FilterColumn[] = [
  {
    id: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "pending", label: "Pending" },
      { value: "cloning", label: "Cloning" },
      { value: "scanning", label: "Scanning" },
      { value: "completed", label: "Completed" },
      { value: "failed", label: "Failed" },
      { value: "cancelled", label: "Cancelled" },
    ],
  },
  {
    id: "repository",
    label: "Repository",
    type: "text",
  },
  {
    id: "triggered_by",
    label: "Triggered by",
    type: "text",
  },
];

// Group by options
const GROUP_BY_OPTIONS = [
  { id: "status", label: "Status" },
  { id: "triggered_by", label: "Triggered by" },
];

export default function HistoryPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { refreshRecentScans } = useAIDetectionSidebarContext();
  const [scans, setScans] = useState<Scan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    const saved = localStorage.getItem(HISTORY_ROWS_PER_PAGE_KEY);
    return saved ? parseInt(saved, 10) : 10;
  });
  const [total, setTotal] = useState(0);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [scanToDelete, setScanToDelete] = useState<Scan | null>(null);
  const [alert, setAlert] = useState<{
    variant: "success" | "error";
    body: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Sorting state - initialize from localStorage or default to no sorting
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(HISTORY_SORTING_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { key: "", direction: null };
      }
    }
    return { key: "", direction: null };
  });

  // GroupBy state
  const { groupBy, groupSortOrder, handleGroupChange } = useGroupByState();

  // FilterBy - Field value getter
  const getScanFieldValue = useCallback(
    (item: Scan, fieldId: string): string | number | Date | null | undefined => {
      switch (fieldId) {
        case "status":
          return item.status;
        case "repository":
          return `${item.repository_owner}/${item.repository_name}`;
        case "triggered_by":
          return `${item.triggered_by.name}${item.triggered_by.surname ? ` ${item.triggered_by.surname}` : ""}`;
        default:
          return null;
      }
    },
    []
  );

  // FilterBy hook
  const { filterData, handleFilterChange } = useFilterBy<Scan>(getScanFieldValue);

  // Save rowsPerPage to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(HISTORY_ROWS_PER_PAGE_KEY, rowsPerPage.toString());
  }, [rowsPerPage]);

  // Save sorting state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(HISTORY_SORTING_KEY, JSON.stringify(sortConfig));
  }, [sortConfig]);

  // Sorting handler
  const handleSort = useCallback((columnId: string) => {
    setSortConfig((prevConfig) => {
      if (prevConfig.key === columnId) {
        // Toggle direction if same column, or clear if already descending
        if (prevConfig.direction === "asc") {
          return { key: columnId, direction: "desc" };
        } else {
          return { key: "", direction: null };
        }
      }
      // New column - start with ascending
      return { key: columnId, direction: "asc" };
    });
  }, []);

  const loadScans = useCallback(async () => {
    setIsLoading(true);
    try {
      const response: ScansResponse = await getScans({ page: page + 1, limit: rowsPerPage });
      setScans(response.scans);
      setTotal(response.pagination.total);
    } catch (error) {
      console.error("Failed to load scans:", error);
    } finally {
      setIsLoading(false);
    }
  }, [page, rowsPerPage]);

  useEffect(() => {
    loadScans();
  }, [loadScans]);

  // Poll for status updates on active scans
  useEffect(() => {
    const activeScans = scans.filter((scan) => ACTIVE_STATUSES.includes(scan.status));
    if (activeScans.length === 0) return;

    const pollActiveScans = async () => {
      const updates: Map<number, ScanStatus> = new Map();

      await Promise.all(
        activeScans.map(async (scan) => {
          try {
            const status = await getScanStatus(scan.id);
            if (status.status !== scan.status) {
              updates.set(scan.id, status.status);
            }
          } catch (error) {
            console.error(`Failed to poll status for scan ${scan.id}:`, error);
          }
        })
      );

      if (updates.size > 0) {
        setScans((prevScans) =>
          prevScans.map((scan) => {
            const newStatus = updates.get(scan.id);
            if (newStatus) {
              return { ...scan, status: newStatus };
            }
            return scan;
          })
        );

        // If any scan completed, reload to get full data
        const hasCompleted = Array.from(updates.values()).some(
          (status) => !ACTIVE_STATUSES.includes(status)
        );
        if (hasCompleted) {
          loadScans();
        }
      }
    };

    const intervalId = setInterval(pollActiveScans, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [scans, loadScans]);

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

  const openDeleteModal = (scan: Scan, e: React.MouseEvent) => {
    e.stopPropagation();
    setScanToDelete(scan);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!scanToDelete || deletingId) return;

    const repoIdentifier = `${scanToDelete.repository_owner}/${scanToDelete.repository_name}`;
    setDeletingId(scanToDelete.id);
    try {
      await deleteScan(scanToDelete.id);
      setScans((prev) => prev.filter((s) => s.id !== scanToDelete.id));
      setTotal((prev) => prev - 1);
      refreshRecentScans();
      setAlert({
        variant: "success",
        body: `Scan for ${repoIdentifier} deleted.`,
      });
      setTimeout(() => setAlert(null), 3000);
    } catch (error) {
      console.error("Failed to delete scan:", error);
      setAlert({
        variant: "error",
        body: `Failed to delete scan for ${repoIdentifier}.`,
      });
      setTimeout(() => setAlert(null), 3000);
    } finally {
      setDeletingId(null);
      setDeleteModalOpen(false);
      setScanToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setDeleteModalOpen(false);
    setScanToDelete(null);
  };

  const formatDuration = (ms?: number): string => {
    if (!ms) return "-";
    const totalSeconds = Math.round(ms / 1000);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Filter and search scans
  const filteredScans = useMemo(() => {
    // First apply FilterBy conditions
    let filtered = filterData(scans);

    // Then apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((scan) => {
        const repoName = `${scan.repository_owner}/${scan.repository_name}`.toLowerCase();
        const triggeredBy = `${scan.triggered_by.name}${scan.triggered_by.surname ? ` ${scan.triggered_by.surname}` : ""}`.toLowerCase();
        return repoName.includes(query) || triggeredBy.includes(query);
      });
    }

    return filtered;
  }, [filterData, scans, searchQuery]);

  // Sort the filtered scans based on current sort configuration
  const sortedScans = useMemo(() => {
    if (!filteredScans || !sortConfig.key || !sortConfig.direction) {
      return filteredScans || [];
    }

    const sortableScans = [...filteredScans];

    // Status order for sorting
    const getStatusOrder = (status: ScanStatus): number => {
      const order: Record<ScanStatus, number> = {
        scanning: 0,
        cloning: 1,
        pending: 2,
        completed: 3,
        failed: 4,
        cancelled: 5,
      };
      return order[status] ?? 99;
    };

    return sortableScans.sort((a: Scan, b: Scan) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortConfig.key) {
        case "repository":
          aValue = `${a.repository_owner}/${a.repository_name}`.toLowerCase();
          bValue = `${b.repository_owner}/${b.repository_name}`.toLowerCase();
          break;
        case "status":
          aValue = getStatusOrder(a.status);
          bValue = getStatusOrder(b.status);
          break;
        case "risk_score":
          aValue = a.risk_score ?? -1;
          bValue = b.risk_score ?? -1;
          break;
        case "findings":
          aValue = a.findings_count ?? 0;
          bValue = b.findings_count ?? 0;
          break;
        case "files":
          aValue = a.files_scanned ?? 0;
          bValue = b.files_scanned ?? 0;
          break;
        case "duration":
          aValue = a.duration_ms ?? 0;
          bValue = b.duration_ms ?? 0;
          break;
        case "triggered_by":
          aValue = `${a.triggered_by.name}${a.triggered_by.surname ? ` ${a.triggered_by.surname}` : ""}`.toLowerCase();
          bValue = `${b.triggered_by.name}${b.triggered_by.surname ? ` ${b.triggered_by.surname}` : ""}`.toLowerCase();
          break;
        default:
          return 0;
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
  }, [filteredScans, sortConfig]);

  // Define how to get the group key for each scan
  const getScanGroupKey = (
    scan: Scan,
    field: string
  ): string | string[] => {
    switch (field) {
      case "status":
        return STATUS_CONFIG[scan.status] || "Unknown";
      case "triggered_by":
        return `${scan.triggered_by.name}${scan.triggered_by.surname ? ` ${scan.triggered_by.surname}` : ""}`;
      default:
        return "Other";
    }
  };

  // Apply grouping to sorted scans
  const groupedScans = useTableGrouping({
    data: sortedScans,
    groupByField: groupBy,
    sortOrder: groupSortOrder,
    getGroupKey: getScanGroupKey,
  });

  const columns = [
    {
      id: "repository",
      label: "REPOSITORY",
      render: (scan: Scan) => (
        <Typography sx={{ fontSize: "13px", fontWeight: 500 }}>
          {scan.repository_owner}/{scan.repository_name}
        </Typography>
      ),
    },
    {
      id: "status",
      label: "STATUS",
      render: (scan: Scan) => (
        <Chip label={STATUS_CONFIG[scan.status]} size="small" />
      ),
    },
    {
      id: "risk_score",
      label: "RISK SCORE",
      render: (scan: Scan) => {
        if (scan.status !== "completed" || scan.risk_score == null) {
          return (
            <Typography sx={{ fontSize: "13px", color: palette.text.accent }}>
              -
            </Typography>
          );
        }
        const grade = scan.risk_score_grade;
        const color = getGradeColor(grade);
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Box
              sx={{
                px: 0.75,
                py: 0.25,
                borderRadius: "4px",
                backgroundColor: `${color}14`,
                border: `1px solid ${color}30`,
              }}
            >
              <Typography sx={{ fontSize: 12, fontWeight: 600, color, lineHeight: 1.4 }}>
                {grade}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: "13px", fontWeight: 500, fontFamily: "monospace" }}>
              {Math.round(scan.risk_score)}
            </Typography>
          </Box>
        );
      },
    },
    {
      id: "findings",
      label: "FINDINGS",
      render: (scan: Scan) => (
        <Typography sx={{ fontSize: "13px" }}>
          {scan.status === "completed" ? scan.findings_count : "-"}
        </Typography>
      ),
    },
    {
      id: "files",
      label: "FILES SCANNED",
      render: (scan: Scan) => (
        <Typography sx={{ fontSize: "13px" }}>
          {scan.status === "completed" ? scan.files_scanned : "-"}
        </Typography>
      ),
    },
    {
      id: "duration",
      label: "DURATION",
      render: (scan: Scan) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Clock size={14} color={palette.text.tertiary} />
          <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, fontFamily: "monospace" }}>
            {scan.status === "completed" ? formatDuration(scan.duration_ms) : "-"}
          </Typography>
        </Box>
      ),
    },
    {
      id: "triggered_by",
      label: "TRIGGERED BY",
      render: (scan: Scan) => (
        <Typography sx={{ fontSize: "13px" }}>
          {scan.triggered_by.name}
          {scan.triggered_by.surname ? ` ${scan.triggered_by.surname}` : ""}
        </Typography>
      ),
    },
    {
      id: "actions",
      label: "",
      render: (scan: Scan) => (
        <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
          {["completed", "failed", "cancelled"].includes(scan.status) && (
            <Tooltip title="Delete">
              <IconButton
                size="small"
                disableRipple
                disableFocusRipple
                onClick={(e) => openDeleteModal(scan, e)}
                disabled={deletingId === scan.id}
                sx={{
                  padding: "4px",
                  border: "none !important",
                  outline: "none !important",
                  boxShadow: "none !important",
                  backgroundColor: "transparent !important",
                  "&:focus": {
                    outline: "none !important",
                    border: "none !important",
                    boxShadow: "none !important",
                    backgroundColor: "transparent !important",
                  },
                  "&:hover": { backgroundColor: "transparent !important" },
                  "&:active": { backgroundColor: "transparent !important" },
                  "&.MuiIconButton-root": {
                    border: "none !important",
                    outline: "none !important",
                  },
                  "&.MuiIconButton-root:hover": { backgroundColor: "transparent !important" },
                  "&.Mui-focusVisible": {
                    outline: "none !important",
                    border: "none !important",
                    boxShadow: "none !important",
                  },
                }}
              >
                <Trash2 size={16} color={palette.status.error.text} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      ),
    },
  ];

  if (isLoading && scans.length === 0) {
    return (
      <PageHeaderExtended
        title="Scan results"
        description="View past repository scans and their results."
        helpArticlePath="ai-detection/history"
      >
        <Box sx={{ textAlign: "center" }}>
          <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
            Loading scan results...
          </Typography>
        </Box>
      </PageHeaderExtended>
    );
  }

  if (!isLoading && scans.length === 0 && total === 0) {
    return (
      <PageHeaderExtended
        title="Scan results"
        description="View past repository scans and their results."
        helpArticlePath="ai-detection/history"
      >
        <EmptyState
          icon={ScanIcon}
          message="No scans yet. Scan your repositories to detect AI and ML libraries."
          showBorder
        >
          <EmptyStateTip
            icon={GitBranch}
            title="Add a repository first"
            description="Go to the Repositories tab and add a GitHub repository URL. Once added, you can run scans to detect AI/ML usage."
          />
          <EmptyStateTip
            icon={Search}
            title="What gets detected?"
            description="AI/ML libraries (TensorFlow, PyTorch, scikit-learn), LLM SDKs (OpenAI, Anthropic), model files, ML pipelines, and containerized AI workloads."
          />
          <EmptyStateTip
            icon={BarChart3}
            title="Track changes over time"
            description="Each scan creates a snapshot. Compare scans to see what AI components were added, removed, or changed across your codebase."
          />
        </EmptyState>
      </PageHeaderExtended>
    );
  }

  const getRange = () => {
    const start = page * rowsPerPage + 1;
    const end = Math.min(page * rowsPerPage + rowsPerPage, total);
    return `${start} - ${end}`;
  };

  return (
    <PageHeaderExtended
      title="Scan results"
      description="View past repository scans and their results."
      helpArticlePath="ai-detection/history"
      alert={
        alert ? (
          <Suspense fallback={null}>
            <Alert
              variant={alert.variant}
              body={alert.body}
              isToast={true}
              onClick={() => setAlert(null)}
            />
          </Suspense>
        ) : undefined
      }
    >

      {/* Toolbar with Filter, Group, Search */}
      <Stack direction="row" gap={2} alignItems="center" sx={{ mb: 2 }}>
        <FilterBy
          columns={FILTER_COLUMNS}
          onFilterChange={handleFilterChange}
        />
        <GroupBy
          options={GROUP_BY_OPTIONS}
          onGroupChange={handleGroupChange}
        />
        <SearchBox
          placeholder="Search scans..."
          value={searchQuery}
          onChange={setSearchQuery}
          fullWidth={false}
        />
      </Stack>

      {/* Table */}
      <GroupedTableView
        groupedData={groupedScans}
        ungroupedData={sortedScans}
        renderTable={(data, options) => (
          <TableContainer
            sx={{
              backgroundColor: palette.background.main,
              borderRadius: "4px",
              overflow: "hidden",
            }}
          >
            <Table sx={singleTheme.tableStyles.primary.frame}>
              <SortableTableHead
                columns={TABLE_COLUMNS}
                sortConfig={sortConfig}
                onSort={handleSort}
              />
              <TableBody sx={singleTheme.tableStyles.primary.body}>
                {data.map((scan) => (
                  <TableRow
                    key={scan.id}
                    onClick={() => {
                      if (scan.status === "completed" || scan.status === "failed") {
                        navigate(`/ai-detection/scans/${scan.id}`);
                      }
                    }}
                    sx={{
                      ...singleTheme.tableStyles.primary.body.row,
                      cursor: ["completed", "failed"].includes(scan.status) ? "pointer" : "default",
                    }}
                  >
                    {columns.map((col) => (
                      <TableCell
                        key={col.id}
                        sx={singleTheme.tableStyles.primary.body.cell}
                      >
                        {col.render(scan)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
              {!options?.hidePagination && (
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
                      Showing {getRange()} of {total} scan(s)
                    </TableCell>
                    <TablePagination
                      count={total}
                      page={page}
                      onPageChange={handleChangePage}
                      rowsPerPage={rowsPerPage}
                      rowsPerPageOptions={[5, 10, 15, 25]}
                      onRowsPerPageChange={handleChangeRowsPerPage}
                      ActionsComponent={(props) => (
                        <TablePaginationActions {...props} />
                      )}
                      labelRowsPerPage="Rows per page"
                      labelDisplayedRows={({ page: currentPage, count }) =>
                        `Page ${currentPage + 1} of ${Math.max(
                          1,
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
        )}
      />

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && scanToDelete && (
        <ConfirmationModal
          isOpen={deleteModalOpen}
          title="Delete scan?"
          body={
            <Typography fontSize={13} color={palette.text.secondary}>
              Are you sure you want to delete the scan for{" "}
              <strong>
                {scanToDelete.repository_owner}/{scanToDelete.repository_name}
              </strong>
              ? This action cannot be undone.
            </Typography>
          }
          cancelText="Cancel"
          proceedText="Delete"
          onCancel={handleCancelDelete}
          onProceed={handleConfirmDelete}
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          TitleFontSize={0}
        />
      )}
    </PageHeaderExtended>
  );
}
