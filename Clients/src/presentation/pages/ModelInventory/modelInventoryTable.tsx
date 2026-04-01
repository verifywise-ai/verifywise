import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  useTheme,
  Stack,
  Typography,
  Tooltip,
} from "@mui/material";
import "../../components/Table/index.css";
import singleTheme from "../../themes/v1SingleTheme";
import CustomIconButton from "../../components/IconButton";
import ViewRelationshipsButton from "../../components/ViewRelationshipsButton";
import PluginSlot from "../../components/PluginSlot";
import { PLUGIN_SLOTS } from "../../../domain/constants/pluginSlots";
import allowedRoles from "../../../application/constants/permissions";
import { useAuth } from "../../../application/hooks/useAuth";
import { Cpu, Layers, BarChart3, Link2 } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import {
  ModelInventoryTableProps,
  IModelInventory,
} from "../../../domain/interfaces/i.modelInventory";
import { getAllEntities } from "../../../application/repository/entity.repository";
import { User } from "../../../domain/types/User";
import {
  tableRowHoverStyle,
  tableRowDeletingStyle,
  loadingContainerStyle,
} from "./style";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { displayFormattedDate } from "../../tools/isoDateToString";
import { ModelInventoryStatus } from "../../../domain/enums/modelInventory.enum";
import Chip from "../../components/Chip";
import { VWLink } from "../../components/Link";
import ModelRisksDialog from "../../components/ModelRisksDialog";
import { palette } from "../../themes/palette";
import { useStandardTable } from "../../../application/hooks/useStandardTable";
import type { StandardColumn } from "../../../domain/types/standardTable";
import StandardTableHead from "../../components/Table/StandardTableHead";
import StandardTablePagination from "../../components/Table/StandardTablePagination";

dayjs.extend(utc);

// Constants for table
const TABLE_COLUMNS: StandardColumn[] = [
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
  const [users, setUsers] = useState<User[]>([]);

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

  // Sort comparator — returns raw comparison (hook handles direction)
  const sortComparator = useCallback(
    (a: IModelInventory, b: IModelInventory, key: string): number => {
      let aValue: string | number;
      let bValue: string | number;

      switch (key) {
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
        return aValue.localeCompare(bValue);
      }
      if (aValue < bValue) return -1;
      if (aValue > bValue) return 1;
      return 0;
    },
    [userMap, getModelRiskCount, getStatusOrder]
  );

  const {
    sortConfig,
    handleSort,
    sortedRows,
    validPage,
    rowsPerPage,
    handleChangePage,
    handleChangeRowsPerPage,
    getRange,
    totalCount,
  } = useStandardTable<IModelInventory>({
    rows: data || [],
    storageKey: "modelInventory",
    defaultSortColumn: "",
    defaultSortDirection: null,
    sortComparator,
  });

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

  const tableBody = useMemo(
    () => (
      <TableBody>
        {sortedRows?.length > 0 ? (
          sortedRows
            .slice(
              hidePagination ? 0 : validPage * rowsPerPage,
              hidePagination ? Math.min(sortedRows.length, 100) : validPage * rowsPerPage + rowsPerPage
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
      sortedRows,
      sortConfig,
      validPage,
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
          <StandardTableHead
            columns={visibleTableColumns}
            sortConfig={sortConfig}
            onSort={handleSort}
          />
          {tableBody}
          {paginated && !hidePagination && (
            <StandardTablePagination
              totalCount={totalCount}
              page={validPage}
              rowsPerPage={rowsPerPage}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              getRange={getRange}
              entityLabel="model"
              colSpan={visibleTableColumns.length}
            />
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
