import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TablePagination,
  TableRow,
  TableFooter,
  Typography,
  useTheme,
  TableHead,
} from "@mui/material";
import singleTheme from "../../../themes/v1SingleTheme";
import { useCallback, useMemo, useState, useEffect } from "react";
import TablePaginationActions from "../../TablePagination";
import {
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  ShieldAlert,
  UserCheck,
  Tag as TagIcon,
  Archive,
} from "lucide-react";
import VWProjectRisksTableBody from "./VWProjectRisksTableBody";
import { EmptyState } from "../../EmptyState";
import { IVWProjectRisksTable } from "../../../types/interfaces/i.risk";
import { RiskModel } from "../../../../domain/models/Common/risks/risk.model";
import { text } from "../../../themes/palette";
import Checkbox from "../../Inputs/Checkbox";
import ConfirmationModal from "../../Dialogs/ConfirmationModal";
import BulkActionsToolbar, { type BulkAction } from "../BulkActionsToolbar";
import CustomizableMultiSelect from "../../Inputs/Select/Multi";
import VWSelect from "../../Inputs/Select";
import { useBulkSelection } from "../../../../application/hooks/useBulkSelection";
import { useBulkUpdateProjectRisks } from "../../../../application/hooks/useBulkUpdateProjectRisks";
import useUsers from "../../../../application/hooks/useUsers";

const PROJECT_RISK_CATEGORIES = [
  "Strategic risk",
  "Operational risk",
  "Compliance risk",
  "Financial risk",
  "Cybersecurity risk",
  "Reputational risk",
  "Legal risk",
  "Technological risk",
  "Third-party/vendor risk",
  "Environmental risk",
  "Human resources risk",
  "Geopolitical risk",
  "Fraud risk",
  "Data privacy risk",
  "Health and safety risk",
] as const;

const SelectorVertical = (props: React.SVGAttributes<SVGSVGElement>) => (
  <ChevronsUpDown size={16} {...props} />
);

const RISKS_ROWS_PER_PAGE_KEY = "verifywise_risks_rows_per_page";
const RISKS_SORTING_KEY = "verifywise_risks_sorting";

type SortDirection = "asc" | "desc" | null;
type SortConfig = {
  key: string;
  direction: SortDirection;
};

const columns = [
  { id: "risk_name", label: "RISK NAME", sortable: true }, // value from risk tab
  { id: "risk_owner", label: "OWNER", sortable: true }, // value from risk tab
  { id: "severity", label: "SEVERITY", sortable: true }, // value from risk tab
  { id: "ale_estimate", label: "ALE ($)", sortable: true }, // quantitative: annualized loss expectation
  { id: "mitigation_status", label: "MITIGATION STATUS", sortable: true }, // mitigation status
  { id: "risk_level_autocalculated", label: "RISK LEVEL", sortable: true }, // risk auto calculated value from risk tab
  { id: "deadline", label: "TARGET DATE", sortable: true }, // start date (deadline) value from mitigation tab
  { id: "controls_mapping", label: "CONTROLS", sortable: true }, // controls mapping value from risk tab
  { id: "actions", label: "", sortable: false },
];

// Sortable Table Header Component
const SortableTableHead: React.FC<{
  columns: typeof columns;
  sortConfig: SortConfig;
  onSort: (columnId: string) => void;
  selection?: {
    allSelected: boolean;
    someSelected: boolean;
    onToggleAll: () => void;
  };
}> = ({ columns, sortConfig, onSort, selection }) => {
  const theme = useTheme();

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
                id="project-risks-select-all"
                value="select-all"
                isChecked={selection.allSelected}
                isIndeterminate={selection.someSelected && !selection.allSelected}
                onChange={selection.onToggleAll}
                ariaLabel="Select all project risks"
                size="small"
                sx={{ p: 0 }}
              />
            </Box>
          </TableCell>
        )}
        {columns.map((column) => (
          <TableCell
            key={column.id}
            sx={{
              ...singleTheme.tableStyles.primary.header.cell,
              ...(column.sortable
                ? {
                    "cursor": "pointer",
                    "userSelect": "none",
                    "&:hover": {
                      backgroundColor: "rgba(0, 0, 0, 0.04)",
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
                justifyContent: "space-between",
                gap: theme.spacing(2),
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 500,
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

const VWProjectRisksTable = ({
  rows,
  setSelectedRow,
  setAnchor,
  onDeleteRisk,
  setPage,
  page,
  flashRow,
  hidePagination = false,
  visibleColumns,
  canRunBulkActions = false,
  onBulkActionSuccess,
}: IVWProjectRisksTable) => {
  const filteredColumns = useMemo(
    () => (visibleColumns ? columns.filter((col) => visibleColumns.has(col.id)) : columns),
    [visibleColumns],
  );
  const theme = useTheme();

  // Initialize rowsPerPage from localStorage or default to 5
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    const saved = localStorage.getItem(RISKS_ROWS_PER_PAGE_KEY);
    return saved ? parseInt(saved, 10) : 5;
  });

  // Initialize sorting state from localStorage or default to no sorting
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(RISKS_SORTING_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { key: "", direction: null };
      }
    }
    return { key: "", direction: null };
  });

  // Save rowsPerPage to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(RISKS_ROWS_PER_PAGE_KEY, rowsPerPage.toString());
  }, [rowsPerPage]);

  // Save sorting state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(RISKS_SORTING_KEY, JSON.stringify(sortConfig));
  }, [sortConfig]);

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

  // Sort the risks based on current sort configuration
  const sortedRows = useMemo(() => {
    if (!rows || !sortConfig.key || !sortConfig.direction) {
      return rows || [];
    }

    const sortableRows = [...rows];

    return sortableRows.sort((a: RiskModel, b: RiskModel) => {
      // Helper functions for sorting
      // Severity values: Negligible, Minor, Moderate, Major, Catastrophic
      const getSeverityValue = (severity: string) => {
        const severityLower = severity.toLowerCase();
        if (severityLower.includes("catastrophic")) return 5;
        if (severityLower.includes("major")) return 4;
        if (severityLower.includes("moderate")) return 3;
        if (severityLower.includes("minor")) return 2;
        if (severityLower.includes("negligible")) return 1;
        return 0;
      };

      const getLikelihoodValue = (likelihood: string) => {
        const likelihoodLower = likelihood.toLowerCase();
        if (likelihoodLower.includes("very high")) return 5;
        if (likelihoodLower.includes("high")) return 4;
        if (likelihoodLower.includes("medium")) return 3;
        if (likelihoodLower.includes("low")) return 2;
        if (likelihoodLower.includes("very low")) return 1;
        return 0;
      };

      // Risk level values: No risk, Very low risk, Low risk, Medium risk, High risk, Very high risk
      const getRiskLevelValue = (riskLevel: string) => {
        const riskLower = riskLevel.toLowerCase();
        if (riskLower.includes("very high")) return 6;
        if (riskLower.includes("high")) return 5;
        if (riskLower.includes("medium")) return 4;
        if (riskLower.includes("low") && !riskLower.includes("very low")) return 3;
        if (riskLower.includes("very low")) return 2;
        if (riskLower.includes("no risk")) return 1;
        return 0;
      };

      let aValue: string | number;
      let bValue: string | number;

      switch (sortConfig.key) {
        case "risk_name":
          aValue = a.risk_name.toLowerCase();
          bValue = b.risk_name.toLowerCase();
          break;

        case "risk_owner":
          aValue = a.risk_owner;
          bValue = b.risk_owner;
          break;

        case "severity":
          // Severity order: Critical > High > Medium > Low
          aValue = getSeverityValue(a.severity);
          bValue = getSeverityValue(b.severity);
          break;

        case "likelihood":
          // Likelihood order: Very High > High > Medium > Low > Very Low
          aValue = getLikelihoodValue(a.likelihood);
          bValue = getLikelihoodValue(b.likelihood);
          break;

        case "mitigation_status":
          aValue = a.mitigation_status.toLowerCase();
          bValue = b.mitigation_status.toLowerCase();
          break;

        case "risk_level_autocalculated":
          // Risk level order: Critical > High > Medium > Low
          aValue = getRiskLevelValue(a.risk_level_autocalculated);
          bValue = getRiskLevelValue(b.risk_level_autocalculated);
          break;

        case "deadline":
          aValue = new Date(a.deadline).getTime();
          bValue = new Date(b.deadline).getTime();
          break;

        case "ale_estimate":
          aValue = a.ale_estimate ?? 0;
          bValue = b.ale_estimate ?? 0;
          break;

        case "controls_mapping":
          aValue = a.controls_mapping.toLowerCase();
          bValue = b.controls_mapping.toLowerCase();
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
  }, [rows, sortConfig]);

  // Ensure page is valid when rows are empty
  const validPage =
    sortedRows.length === 0
      ? 0
      : Math.min(page, Math.max(0, Math.ceil(sortedRows.length / rowsPerPage) - 1));

  // Update page if it's invalid
  useEffect(() => {
    if (page !== validPage) {
      setPage(validPage);
    }
  }, [sortedRows.length, page, validPage, setPage]);

  const getRange = useMemo(() => {
    const start = page * rowsPerPage + 1;
    const end = Math.min(page * rowsPerPage + rowsPerPage, sortedRows?.length ?? 0);
    return `${start} - ${end}`;
  }, [page, rowsPerPage, sortedRows?.length]);

  const handleChangePage = useCallback(
    (_: unknown, newPage: number) => {
      setPage(newPage);
    },
    [setPage],
  );

  const handleChangeRowsPerPage = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRowsPerPage(parseInt(event.target.value, 10));
      setPage(0);
    },
    [setPage],
  );

  // ----- Bulk actions -----
  // Selection scope: all non-archived rows currently visible (full filtered list).
  const selectableRows = useMemo(() => sortedRows.filter((r) => !r.is_deleted), [sortedRows]);
  const getRowId = useCallback((r: RiskModel) => Number(r.id), []);
  const {
    selectedIds,
    isSelected,
    toggle: toggleSelection,
    toggleAll,
    setAll: setAllSelected,
    clear: clearSelection,
    allSelected,
    someSelected,
    count: selectionCount,
  } = useBulkSelection<RiskModel>({ rows: selectableRows, getId: getRowId });

  const allSelectableRiskIds = useMemo(
    () => selectableRows.map((r) => Number(r.id)),
    [selectableRows],
  );

  const { users } = useUsers();
  const [ownerDialogOpen, setOwnerDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [pendingOwnerId, setPendingOwnerId] = useState<string>("");
  const [pendingCategories, setPendingCategories] = useState<string[]>([]);

  const bulkMutation = useBulkUpdateProjectRisks({
    onSuccess: (payload) => {
      clearSelection();
      setOwnerDialogOpen(false);
      setCategoryDialogOpen(false);
      setPendingOwnerId("");
      setPendingCategories([]);
      onBulkActionSuccess?.(payload.action, payload.ids.length);
    },
  });

  const handleConfirmOwner = useCallback(() => {
    if (!pendingOwnerId || selectedIds.length === 0) return;
    bulkMutation.mutate({
      ids: selectedIds,
      action: "set_owner",
      ownerId: Number(pendingOwnerId),
    });
  }, [bulkMutation, pendingOwnerId, selectedIds]);

  const handleConfirmCategory = useCallback(() => {
    if (selectedIds.length === 0) return;
    bulkMutation.mutate({
      ids: selectedIds,
      action: "set_category",
      categories: pendingCategories,
    });
  }, [bulkMutation, pendingCategories, selectedIds]);

  const handleConfirmArchive = useCallback(() => {
    if (selectedIds.length === 0) return;
    bulkMutation.mutate({ ids: selectedIds, action: "archive" });
  }, [bulkMutation, selectedIds]);

  const bulkActions = useMemo<BulkAction[]>(
    () => [
      {
        id: "set_owner",
        label: "Set owner",
        icon: <UserCheck size={16} />,
        onClick: () => {
          setPendingOwnerId("");
          setOwnerDialogOpen(true);
        },
        disabled: bulkMutation.isPending,
      },
      {
        id: "set_category",
        label: "Set category",
        icon: <TagIcon size={16} />,
        onClick: () => {
          setPendingCategories([]);
          setCategoryDialogOpen(true);
        },
        disabled: bulkMutation.isPending,
      },
      {
        id: "archive",
        label: "Archive",
        icon: <Archive size={16} />,
        onClick: handleConfirmArchive,
        disabled: bulkMutation.isPending,
        confirm: {
          title: `Archive ${selectionCount} project risk${selectionCount === 1 ? "" : "s"}?`,
          body: "Archived risks are soft-deleted: they are hidden from the active risk register but remain available for audit history.",
          confirmLabel: "Archive",
          danger: true,
        },
      },
    ],
    [bulkMutation.isPending, handleConfirmArchive, selectionCount],
  );

  return (
    <Stack sx={{ width: "100%" }}>
      {canRunBulkActions && (
        <BulkActionsToolbar
          count={selectionCount}
          onClear={clearSelection}
          actions={bulkActions}
          selectAll={{
            totalCount: allSelectableRiskIds.length,
            onSelectAll: () => setAllSelected(allSelectableRiskIds),
          }}
        />
      )}
      <TableContainer>
        <Table
          sx={{
            ...singleTheme.tableStyles.primary.frame,
          }}
        >
          <SortableTableHead
            columns={filteredColumns}
            sortConfig={sortConfig}
            onSort={handleSort}
            selection={
              canRunBulkActions
                ? {
                    allSelected: allSelected && selectableRows.length > 0,
                    someSelected,
                    onToggleAll: toggleAll,
                  }
                : undefined
            }
          />
          {sortedRows.length !== 0 ? (
            <VWProjectRisksTableBody
              rows={sortedRows}
              page={hidePagination ? 0 : page}
              rowsPerPage={hidePagination ? sortedRows.length : rowsPerPage}
              setSelectedRow={setSelectedRow}
              setAnchor={setAnchor}
              onDeleteRisk={onDeleteRisk}
              flashRow={flashRow}
              sortConfig={sortConfig}
              visibleColumns={visibleColumns}
              selection={canRunBulkActions ? { isSelected, onToggle: toggleSelection } : undefined}
            />
          ) : (
            <TableBody>
              <TableRow>
                <TableCell
                  colSpan={filteredColumns.length + (canRunBulkActions ? 1 : 0)}
                  sx={{ border: "none", p: 0 }}
                >
                  <EmptyState
                    icon={ShieldAlert}
                    message="There is currently no data in this table."
                  />
                </TableCell>
              </TableRow>
            </TableBody>
          )}
          {!hidePagination && (
            <TableFooter>
              <TableRow>
                <TableCell
                  colSpan={filteredColumns.length + (canRunBulkActions ? 1 : 0)}
                  sx={{ border: "none", p: 0 }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingX: theme.spacing(4),
                    }}
                  >
                    <Typography
                      sx={{
                        paddingX: theme.spacing(2),
                        fontSize: 12,
                        opacity: 0.7,
                        color: theme.palette.text.tertiary,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Showing {getRange} of {sortedRows?.length} project risk(s)
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center" }}>
                      <TablePagination
                        component="div"
                        count={sortedRows?.length}
                        page={validPage}
                        onPageChange={handleChangePage}
                        rowsPerPage={rowsPerPage}
                        rowsPerPageOptions={[5, 10, 15, 20, 25]}
                        onRowsPerPageChange={handleChangeRowsPerPage}
                        ActionsComponent={(props) => <TablePaginationActions {...props} />}
                        labelRowsPerPage="Project risks per page"
                        labelDisplayedRows={({ page, count }) =>
                          `Page ${page + 1} of ${Math.max(0, Math.ceil(count / rowsPerPage))}`
                        }
                        sx={{
                          "mt": theme.spacing(6),
                          "color": theme.palette.text.secondary,
                          "& .MuiSelect-select": {
                            width: theme.spacing(10),
                            borderRadius: theme.shape.borderRadius,
                            border: `1px solid ${theme.palette.border.light}`,
                            padding: theme.spacing(4),
                          },
                          "& .MuiTablePagination-selectIcon": {
                            width: "24px",
                            height: "fit-content",
                          },
                        }}
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
                              anchorOrigin: { vertical: "top", horizontal: "left" },
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
                      />
                    </Box>
                  </Box>
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </TableContainer>

      {canRunBulkActions && ownerDialogOpen && (
        <ConfirmationModal
          isOpen
          title={`Set owner on ${selectionCount} project risk${selectionCount === 1 ? "" : "s"}`}
          body={
            <Stack gap={2}>
              <VWSelect
                id="bulk-set-owner"
                placeholder="Choose an owner…"
                value={pendingOwnerId}
                onChange={(e) => setPendingOwnerId(String(e.target.value))}
                items={users.map((u: { id: number; name: string; surname: string }) => ({
                  _id: String(u.id),
                  name: u.name,
                  surname: u.surname,
                }))}
                sx={{ width: 280 }}
              />
            </Stack>
          }
          cancelText="Cancel"
          proceedText="Assign"
          proceedButtonVariant="contained"
          confirmBtnSx={{
            opacity: pendingOwnerId ? 1 : 0.5,
            pointerEvents: pendingOwnerId ? "auto" : "none",
          }}
          onCancel={() => {
            if (bulkMutation.isPending) return;
            setOwnerDialogOpen(false);
          }}
          onProceed={handleConfirmOwner}
          isLoading={bulkMutation.isPending}
        />
      )}

      {canRunBulkActions && categoryDialogOpen && (
        <ConfirmationModal
          isOpen
          title={`Set categories on ${selectionCount} project risk${
            selectionCount === 1 ? "" : "s"
          }`}
          body={
            <Stack gap={2}>
              <Typography variant="body2" sx={{ color: "text.secondary", fontSize: 12 }}>
                Replaces existing categories. Leave empty to clear.
              </Typography>
              <CustomizableMultiSelect
                label=""
                placeholder="Choose categories…"
                isHidden
                value={pendingCategories}
                onChange={(e) => {
                  const v = e.target.value;
                  setPendingCategories(
                    typeof v === "string" ? v.split(",") : (v as (string | number)[]).map(String),
                  );
                }}
                items={PROJECT_RISK_CATEGORIES.map((c) => ({ _id: c, name: c }))}
                width={320}
              />
            </Stack>
          }
          cancelText="Cancel"
          proceedText="Apply"
          proceedButtonVariant="contained"
          onCancel={() => {
            if (bulkMutation.isPending) return;
            setCategoryDialogOpen(false);
          }}
          onProceed={handleConfirmCategory}
          isLoading={bulkMutation.isPending}
        />
      )}
    </Stack>
  );
};

export default VWProjectRisksTable;
