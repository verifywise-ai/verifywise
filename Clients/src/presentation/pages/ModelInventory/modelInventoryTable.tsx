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
  TableFooter,
  Tooltip,
  Box,
} from "@mui/material";
import TablePaginationActions from "../../components/TablePagination";
import "../../components/Table/index.css";
import singleTheme from "../../themes/v1SingleTheme";
import CustomIconButton from "../../components/IconButton";
import ViewRelationshipsButton from "../../components/ViewRelationshipsButton";
import PluginSlot from "../../components/PluginSlot";
import { PLUGIN_SLOTS } from "../../../domain/constants/pluginSlots";
import allowedRoles from "../../../application/constants/permissions";
import { useAuth } from "../../../application/hooks/useAuth";
import { ChevronsUpDown, ChevronUp, ChevronDown, Cpu, Layers, BarChart3, Link2 } from "lucide-react";

const SelectorVertical = (props: any) => <ChevronsUpDown size={16} {...props} />;
import { EmptyState } from "../../components/EmptyState";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import { ModelInventoryTableProps } from "../../../domain/interfaces/i.modelInventory";
import { getAllEntities } from "../../../application/repository/entity.repository";
import { User } from "../../../domain/types/User";
import {
  getPaginationRowCount,
  setPaginationRowCount,
} from "../../../application/utils/paginationStorage";
import {
  tableRowHoverStyle,
  tableRowDeletingStyle,
  loadingContainerStyle,
  tableFooterRowStyle,
  showingTextCellStyle,
  paginationMenuProps,
  paginationSelectStyle,
  paginationStyle,
} from "./style";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { displayFormattedDate } from "../../tools/isoDateToString";
import { ModelInventoryStatus } from "../../../domain/enums/modelInventory.enum";
import Chip from "../../components/Chip";
import { VWLink } from "../../components/Link";
import ModelRisksDialog from "../../components/ModelRisksDialog";
import { palette } from "../../themes/palette";

dayjs.extend(utc);

// LocalStorage keys
const MODEL_INVENTORY_SORTING_KEY = "verifywise_model_inventory_sorting";

// Types for sorting
type SortDirection = "asc" | "desc" | null;
type SortConfig = {
  key: string;
  direction: SortDirection;
};

// Constants for table
const TABLE_COLUMNS = [
  { id: "provider", label: "PROVIDER", sortable: true },
  { id: "model", label: "MODEL", sortable: true },
  { id: "version", label: "VERSION", sortable: true },
  { id: "approver", label: "APPROVER", sortable: true },
  { id: "security_assessment", label: "ASSESSMENT", sortable: true },
  { id: "risks", label: "RISKS", sortable: true },
  { id: "status", label: "STATUS", sortable: true },
  { id: "status_date", label: "STATUS DATE", sortable: true },
  { id: "actions", label: "", sortable: false },
];

const DEFAULT_ROWS_PER_PAGE = 10;

const TooltipCell: React.FC<{ value: string | null | undefined }> = ({
  value,
}) => {
  const displayValue = value || "-";
  const shouldShowTooltip = displayValue.length > 24;

  return shouldShowTooltip ? (
    <Tooltip title={displayValue} arrow>
      <span>{displayValue}</span>
    </Tooltip>
  ) : (
    <span>{displayValue}</span>
  );
};

const StatusBadge: React.FC<{ status: ModelInventoryStatus }> = ({
  status,
}) => {
  return <Chip label={status} />;
};

const SecurityAssessmentBadge: React.FC<{ assessment: boolean }> = ({
  assessment,
}) => {
  return <Chip label={assessment ? "Yes" : "No"} />;
};

// const CapabilitiesChips: React.FC<{ capabilities: string[] }> = ({
//   capabilities,
// }) => {
//   return (
//     <Stack direction="row" flexWrap="wrap" sx={capabilitiesChipContainerStyle}>
//       {capabilities.slice(0, 3).map((capability, index) => (
//         <Chip
//           key={index}
//           label={capability}
//           size="small"
//           sx={capabilityChipStyle}
//         />
//       ))}
//       {capabilities.length > 3 && (
//         <Chip
//           label={`+${capabilities.length - 3}`}
//           size="small"
//           sx={capabilityChipExtraStyle}
//         />
//       )}
//     </Stack>
//   );
// };

const ModelInventoryTable: React.FC<ModelInventoryTableProps> = ({
  data,
  isLoading,
  onEdit,
  onDelete,
  onCheckModelHasRisks,
  onViewDetails,
  paginated = true,
  deletingId,
  hidePagination = false,
  modelRisks = [],
  flashRowId,
  visibleColumns,
}) => {
  const theme = useTheme();
  const { userRoleName } = useAuth();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(() =>
    getPaginationRowCount("modelInventory", DEFAULT_ROWS_PER_PAGE)
  );
  const [users, setUsers] = useState<User[]>([]);

  // Initialize sorting state from localStorage or default to no sorting
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(MODEL_INVENTORY_SORTING_KEY);
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
    localStorage.setItem(MODEL_INVENTORY_SORTING_KEY, JSON.stringify(sortConfig));
  }, [sortConfig]);

  // Model risks dialog state
  const [showModelRisks, setShowModelRisks] = useState(false);
  const [selectedModel, setSelectedModel] = useState<{
    id: number;
    name: string;
  } | null>(null);

  // Fetch users when component mounts
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/users" });
      if (response?.data) {
        setUsers(response.data);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  // Filter TABLE_COLUMNS based on visibleColumns
  const visibleTableColumns = useMemo(() => {
    if (!visibleColumns || visibleColumns.size === 0) return TABLE_COLUMNS;
    return TABLE_COLUMNS.filter((col) => visibleColumns.has(col.id));
  }, [visibleColumns]);

  // Helper to check if a column is visible
  const isColVisible = useCallback(
    (columnId: string) => {
      if (!visibleColumns || visibleColumns.size === 0) return true;
      return visibleColumns.has(columnId);
    },
    [visibleColumns]
  );

  // Create a mapping of user IDs to user names
  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((user) => {
      map.set(user.id.toString(), `${user.name} ${user.surname}`.trim());
    });
    return map;
  }, [users]);

  const isDeletingAllowed =
    allowedRoles.modelInventory?.delete?.includes(userRoleName);

  // Get risk count for a specific model
  const getModelRiskCount = useCallback((modelId: number) => {
    return modelRisks.filter(risk => risk.model_id === modelId).length;
  }, [modelRisks]);

  // Sorting handler
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

  // Status order for sorting
  const getStatusOrder = useCallback((status: ModelInventoryStatus) => {
    switch (status) {
      case ModelInventoryStatus.APPROVED:
        return 1;
      case ModelInventoryStatus.PENDING:
        return 2;
      case ModelInventoryStatus.RESTRICTED:
        return 3;
      case ModelInventoryStatus.BLOCKED:
        return 4;
      default:
        return 5;
    }
  }, []);

  // Sort the data based on current sort configuration
  const sortedData = useMemo(() => {
    if (!data || !sortConfig.key || !sortConfig.direction) {
      return data || [];
    }

    const sortableData = [...data];

    return sortableData.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortConfig.key) {
        case "provider":
          aValue = (a.provider || "").toLowerCase();
          bValue = (b.provider || "").toLowerCase();
          break;
        case "model":
          aValue = (a.model || "").toLowerCase();
          bValue = (b.model || "").toLowerCase();
          break;
        case "version":
          aValue = (a.version || "").toLowerCase();
          bValue = (b.version || "").toLowerCase();
          break;
        case "approver":
          aValue = (userMap.get(a.approver?.toString() ?? "") || "").toLowerCase();
          bValue = (userMap.get(b.approver?.toString() ?? "") || "").toLowerCase();
          break;
        case "security_assessment":
          aValue = a.security_assessment ? 1 : 0;
          bValue = b.security_assessment ? 1 : 0;
          break;
        case "risks":
          aValue = getModelRiskCount(a.id || 0);
          bValue = getModelRiskCount(b.id || 0);
          break;
        case "status":
          aValue = getStatusOrder(a.status);
          bValue = getStatusOrder(b.status);
          break;
        case "status_date":
          aValue = a.status_date ? new Date(a.status_date).getTime() : 0;
          bValue = b.status_date ? new Date(b.status_date).getTime() : 0;
          break;
        default:
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
  }, [data, sortConfig, userMap, getModelRiskCount, getStatusOrder]);

  const openModelRisksDialog = useCallback(
    (modelId: number, modelName: string) => {
      setSelectedModel({ id: modelId, name: modelName });
      setShowModelRisks(true);
    },
    []
  );

  const closeModelRisksDialog = useCallback(() => {
    setShowModelRisks(false);
    setSelectedModel(null);
  }, []);

  const handleChangePage = useCallback((_: unknown, newPage: number) => {
    setPage(newPage);
  }, []);

  const handleChangeRowsPerPage = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newRowsPerPage = parseInt(event.target.value, 10);
      setRowsPerPage(newRowsPerPage);
      setPaginationRowCount("modelInventory", newRowsPerPage);
      setPage(0);
    },
    []
  );

  const getRange = useMemo(() => {
    const start = page * rowsPerPage + 1;
    const end = Math.min(page * rowsPerPage + rowsPerPage, data?.length ?? 0);
    return `${start} - ${end}`;
  }, [page, rowsPerPage, data?.length]);

  const tableHeader = useMemo(
    () => (
      <TableHead
        sx={{
          backgroundColor:
            singleTheme.tableStyles.primary.header.backgroundColors,
        }}
      >
        <TableRow sx={singleTheme.tableStyles.primary.header.row}>
          {visibleTableColumns.map((column) => (
            <TableCell
              component={"td"}
              className="model-inventory-table-header-cel"
              key={column.id}
              sx={{
                ...singleTheme.tableStyles.primary.header.cell,
                ...(column.sortable && {
                  cursor: "pointer",
                  userSelect: "none",
                  "&:hover": {
                    backgroundColor: "rgba(0, 0, 0, 0.04)",
                  },
                }),
              }}
              onClick={() => column.sortable && handleSort(column.id)}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                {column.label}
                {column.sortable && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      color:
                        sortConfig.key === column.id
                          ? theme.palette.text.primary
                          : theme.palette.text.disabled,
                    }}
                  >
                    {sortConfig.key === column.id ? (
                      sortConfig.direction === "asc" ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )
                    ) : (
                      <ChevronsUpDown size={16} />
                    )}
                  </Box>
                )}
              </Box>
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
    ),
    [sortConfig, handleSort, theme, visibleTableColumns]
  );

  const tableBody = useMemo(
    () => (
      <TableBody>
        {sortedData?.length > 0 ? (
          sortedData
            .slice(
              hidePagination ? 0 : page * rowsPerPage,
              hidePagination ? Math.min(sortedData.length, 100) : page * rowsPerPage + rowsPerPage
            )
            .map((modelInventory) => (
              <TableRow
                key={modelInventory.id}
                sx={{
                  ...singleTheme.tableStyles.primary.body.row,
                  ...tableRowHoverStyle,
                  ...(deletingId === modelInventory.id?.toString() &&
                    tableRowDeletingStyle),
                  ...(flashRowId === modelInventory.id && {
                    backgroundColor: singleTheme.flashColors.background,
                    "& td": {
                      backgroundColor: "transparent !important",
                    },
                    "&:hover": {
                      backgroundColor: singleTheme.flashColors.backgroundHover,
                    },
                  }),
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onViewDetails) {
                    onViewDetails(modelInventory.id?.toString() || "");
                  } else {
                    onEdit?.(modelInventory.id?.toString() || "");
                  }
                }}
              >
                {isColVisible("provider") && (
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      whiteSpace: "nowrap",
                      backgroundColor: sortConfig.key === "provider" ? singleTheme.tableColors.sortedColumnFirst : undefined,
                    }}
                  >
                    <TooltipCell value={modelInventory.provider} />
                  </TableCell>
                )}
                {isColVisible("model") && (
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      whiteSpace: "nowrap",
                      backgroundColor: sortConfig.key === "model" ? singleTheme.tableColors.sortedColumn : undefined,
                    }}
                  >
                    <TooltipCell value={modelInventory.model} />
                  </TableCell>
                )}
                {isColVisible("version") && (
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      whiteSpace: "nowrap",
                      backgroundColor: sortConfig.key === "version" ? singleTheme.tableColors.sortedColumn : undefined,
                    }}
                  >
                    <TooltipCell value={modelInventory.version} />
                  </TableCell>
                )}
                {isColVisible("approver") && (
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      whiteSpace: "nowrap",
                      backgroundColor: sortConfig.key === "approver" ? singleTheme.tableColors.sortedColumn : undefined,
                    }}
                  >
                    <TooltipCell
                      value={userMap.get(modelInventory.approver?.toString() ?? "")}
                    />
                  </TableCell>
                )}
                {isColVisible("security_assessment") && (
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      whiteSpace: "nowrap",
                      backgroundColor: sortConfig.key === "security_assessment" ? singleTheme.tableColors.sortedColumn : undefined,
                    }}
                  >
                    <SecurityAssessmentBadge
                      assessment={modelInventory.security_assessment}
                    />
                  </TableCell>
                )}
                {isColVisible("risks") && (
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      whiteSpace: "nowrap",
                      backgroundColor: sortConfig.key === "risks" ? singleTheme.tableColors.sortedColumn : undefined,
                    }}
                  >
                    {(() => {
                      const riskCount = getModelRiskCount(modelInventory.id || 0);
                      return riskCount > 0 ? (
                        <VWLink
                          onClick={(e) => {
                            e.stopPropagation();
                            openModelRisksDialog(
                              modelInventory.id || 0,
                              modelInventory.model || ""
                            );
                          }}
                          showIcon={false}
                        >
                          {riskCount} risk{riskCount !== 1 ? "s" : ""}
                        </VWLink>
                      ) : (
                        <Typography variant="body2" sx={{ color: palette.text.disabled }}>
                          No risks
                        </Typography>
                      );
                    })()}
                  </TableCell>
                )}
                {isColVisible("status") && (
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      whiteSpace: "nowrap",
                      backgroundColor: sortConfig.key === "status" ? singleTheme.tableColors.sortedColumn : undefined,
                    }}
                  >
                    <StatusBadge status={modelInventory.status} />
                  </TableCell>
                )}
                {isColVisible("status_date") && (
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      whiteSpace: "nowrap",
                      backgroundColor: sortConfig.key === "status_date" ? singleTheme.tableColors.sortedColumn : undefined,
                    }}
                  >
                    <TooltipCell
                      value={
                        modelInventory.status_date
                          ? displayFormattedDate(modelInventory.status_date)
                          : "-"
                      }
                    />
                  </TableCell>
                )}
                <TableCell
                  sx={{
                    ...singleTheme.tableStyles.primary.body.cell,
                    minWidth: "80px",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    <ViewRelationshipsButton
                      entityId={modelInventory.id || 0}
                      entityType="model"
                      entityLabel={modelInventory.model || undefined}
                    />
                    {/* Plugin-injected icon buttons for model rows */}
                    <PluginSlot
                      id={PLUGIN_SLOTS.MODEL_ROW_ICON_ACTIONS}
                      slotProps={{
                        modelId: modelInventory.id,
                        modelName: modelInventory.model,
                      }}
                    />
                    {isDeletingAllowed && (
                      <CustomIconButton
                        id={modelInventory.id || 0}
                        onDelete={() =>
                          onDelete?.(modelInventory.id?.toString() || "")
                        }
                        onEdit={() => {
                          onEdit?.(modelInventory.id?.toString() || "");
                        }}
                        onMouseEvent={() => {}}
                        warningTitle="Delete this model?"
                        warningMessage="When you delete this model, all data related to this model will be removed. This action is non-recoverable."
                        type="model"
                        entityId={modelInventory.id}
                        checkForRisks={
                          onCheckModelHasRisks
                            ? () =>
                                onCheckModelHasRisks(
                                  modelInventory.id?.toString() || "0"
                                )
                            : undefined
                        }
                        onDeleteWithRisks={
                          onDelete
                            ? (deleteRisks: boolean) =>
                                onDelete(
                                  modelInventory.id?.toString() || "",
                                  deleteRisks
                                )
                            : undefined
                        }
                      />
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))
        ) : (
          <TableRow>
            <TableCell
              colSpan={visibleTableColumns.length}
              align="center"
              sx={{ py: 4 }}
            >
              No model inventory data available.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    ),
    [
      sortedData,
      sortConfig,
      page,
      rowsPerPage,
      isDeletingAllowed,
      onEdit,
      onDelete,
      onCheckModelHasRisks,
      deletingId,
      userMap,
      getModelRiskCount,
      hidePagination,
      openModelRisksDialog,
      flashRowId,
      isColVisible,
      visibleTableColumns,
    ]
  );

  if (isLoading) {
    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        sx={loadingContainerStyle(theme)}
      >
        <Typography>Loading...</Typography>
      </Stack>
    );
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState icon={Cpu} message="No models registered yet. Maintain a complete inventory of all AI models your organization uses.">
        <EmptyStateTip
          icon={Layers}
          title="What counts as a model?"
          description="Any machine learning model, large language model, computer vision system, or automated decision-making tool. Include both internal and third-party models."
        />
        <EmptyStateTip
          icon={BarChart3}
          title="Track model status"
          description="Record each model's status: approved, restricted, pending, blocked, or rejected. This gives auditors visibility into your governance coverage."
        />
        <EmptyStateTip
          icon={Link2}
          title="Link to vendors and risks"
          description="Connect each model to its provider and associated risks. This creates a full traceability map for your audit."
        />
      </EmptyState>
    );
  }

  return (
    <>
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table sx={singleTheme.tableStyles.primary.frame}>
          {tableHeader}
          {tableBody}
          {paginated && !hidePagination && (
            <TableFooter>
              <TableRow sx={tableFooterRowStyle(theme)}>
                <TableCell sx={showingTextCellStyle(theme)}>
                  Showing {getRange} of {data?.length} model(s)
                </TableCell>
                <TablePagination
                  count={data?.length ?? 0}
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
                      MenuProps: paginationMenuProps(theme),
                      inputProps: { id: "pagination-dropdown" },
                      IconComponent: SelectorVertical,
                      sx: paginationSelectStyle(theme),
                    },
                  }}
                  sx={paginationStyle(theme)}
                />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </TableContainer>

      {/* Model Risks Dialog */}
      {showModelRisks && selectedModel && (
        <ModelRisksDialog
          open={showModelRisks}
          onClose={closeModelRisksDialog}
          modelId={selectedModel.id}
          modelName={selectedModel.name}
        />
      )}
    </>
  );
};

export default ModelInventoryTable;
