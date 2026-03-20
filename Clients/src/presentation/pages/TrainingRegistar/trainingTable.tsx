import React, { useCallback, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  useTheme,
  Stack,
  Typography,
} from "@mui/material";
import "../../components/Table/index.css";
import singleTheme from "../../themes/v1SingleTheme";
import CustomIconButton from "../../components/IconButton";
import allowedRoles from "../../../application/constants/permissions";
import { GraduationCap, Users, Calendar, Award } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import { useAuth } from "../../../application/hooks/useAuth";
import { TrainingRegistarModel } from "../../../domain/models/Common/trainingRegistar/trainingRegistar.model";
import { TrainingStatus } from "../../../domain/enums/status.enum";
import Chip from "../../components/Chip";
import { TrainingTableProps } from "../../types/interfaces/i.table";
import { useStandardTable } from "../../../application/hooks/useStandardTable";
import type { StandardColumn } from "../../../domain/types/standardTable";
import StandardTableHead from "../../components/Table/StandardTableHead";
import StandardTablePagination from "../../components/Table/StandardTablePagination";

const TABLE_COLUMNS: StandardColumn[] = [
  { id: "training_name", label: "TRAINING NAME", sortable: true },
  { id: "duration", label: "DURATION", sortable: true },
  { id: "provider", label: "PROVIDER", sortable: true },
  { id: "department", label: "DEPARTMENT", sortable: true },
  { id: "status", label: "STATUS", sortable: true },
  { id: "numberOfPeople", label: "PEOPLE", sortable: true },
  { id: "actions", label: "", sortable: false },
];

const parseDuration = (duration: string) => {
  const match = duration.match(/(\d+)/);
  return match ? parseInt(match[0]) : 0;
};

const getStatusValue = (status: TrainingStatus) => {
  switch (status) {
    case TrainingStatus.InProgress:
      return 3;
    case TrainingStatus.Planned:
      return 2;
    case TrainingStatus.Completed:
      return 1;
    default:
      return 0;
  }
};

const StatusBadge: React.FC<{ status: TrainingStatus }> = ({ status }) => {
  return <Chip label={status} />;
};

const TrainingTable: React.FC<TrainingTableProps> = ({
  data,
  isLoading,
  onEdit,
  onDelete,
  paginated = true,
  hidePagination = false,
  visibleColumns,
}) => {
  const theme = useTheme();
  const { userRoleName } = useAuth();

  const isVisible = useCallback(
    (id: string) => !visibleColumns || visibleColumns.size === 0 || visibleColumns.has(id),
    [visibleColumns]
  );

  const visibleTableColumns = useMemo(
    () => TABLE_COLUMNS.filter((col) => isVisible(col.id)),
    [isVisible]
  );

  const isDeletingAllowed =
    allowedRoles.training?.delete?.includes(userRoleName);

  const sortComparator = useCallback(
    (a: TrainingRegistarModel, b: TrainingRegistarModel, key: string): number => {
      let aValue: string | number;
      let bValue: string | number;

      switch (key) {
        case "training_name":
          aValue = a.training_name.toLowerCase();
          bValue = b.training_name.toLowerCase();
          break;
        case "duration":
          aValue = parseDuration(a.duration);
          bValue = parseDuration(b.duration);
          break;
        case "provider":
          aValue = a.provider.toLowerCase();
          bValue = b.provider.toLowerCase();
          break;
        case "department":
          aValue = a.department.toLowerCase();
          bValue = b.department.toLowerCase();
          break;
        case "status":
          aValue = getStatusValue(a.status);
          bValue = getStatusValue(b.status);
          break;
        case "numberOfPeople":
          aValue = a.numberOfPeople;
          bValue = b.numberOfPeople;
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
    []
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
  } = useStandardTable<TrainingRegistarModel>({
    rows: data || [],
    storageKey: "training",
    defaultSortColumn: "",
    defaultSortDirection: null,
    sortComparator,
  });

  const tableBody = useMemo(
    () => (
      <TableBody>
        {sortedRows?.length > 0 ? (
          sortedRows
            .slice(
              hidePagination ? 0 : validPage * rowsPerPage,
              hidePagination
                ? Math.min(sortedRows.length, 100)
                : validPage * rowsPerPage + rowsPerPage
            )
            // Defensive: Filter out invalid records early (fail fast)
            .filter((training) => {
              const isValid = training.id !== undefined && training.id !== null;
              if (!isValid) {
                console.error(
                  "[TrainingTable] Invalid training record without ID:",
                  training
                );
              }
              return isValid;
            })
            .map((training) => {
              // Type guard: After filter, we know id exists
              const trainingId = training.id as number;
              const trainingIdStr = trainingId.toString();

              return (
                <TableRow
                  key={trainingId}
                  sx={{
                    ...singleTheme.tableStyles.primary.body.row,
                    "&:hover": {
                      backgroundColor: "#FBFBFB",
                      cursor: "pointer",
                    },
                  }}
                  onClick={() => {
                    onEdit?.(trainingIdStr);
                  }}
                >
                  {isVisible("training_name") && (
                    <TableCell
                      sx={{
                        ...singleTheme.tableStyles.primary.body.cell,
                        cursor: "pointer",
                        textTransform: "none !important",
                        backgroundColor:
                          sortConfig.key === "training_name"
                            ? "#e8e8e8"
                            : "#fafafa",
                      }}
                    >
                      {training.training_name}
                    </TableCell>
                  )}
                  {isVisible("duration") && (
                    <TableCell
                      sx={{
                        ...singleTheme.tableStyles.primary.body.cell,
                        cursor: "pointer",
                        textTransform: "none !important",
                        backgroundColor:
                          sortConfig.key === "duration" ? "background.surface" : "inherit",
                      }}
                    >
                      {training.duration}
                    </TableCell>
                  )}
                  {isVisible("provider") && (
                    <TableCell
                      sx={{
                        ...singleTheme.tableStyles.primary.body.cell,
                        cursor: "pointer",
                        textTransform: "none !important",
                        backgroundColor:
                          sortConfig.key === "provider" ? "background.surface" : "inherit",
                      }}
                    >
                      {training.provider}
                    </TableCell>
                  )}
                  {isVisible("department") && (
                    <TableCell
                      sx={{
                        ...singleTheme.tableStyles.primary.body.cell,
                        cursor: "pointer",
                        textTransform: "none !important",
                        backgroundColor:
                          sortConfig.key === "department" ? "background.surface" : "inherit",
                      }}
                    >
                      {training.department}
                    </TableCell>
                  )}
                  {isVisible("status") && (
                    <TableCell
                      sx={{
                        ...singleTheme.tableStyles.primary.body.cell,
                        cursor: "pointer",
                        textTransform: "none !important",
                        backgroundColor:
                          sortConfig.key === "status" ? "background.surface" : "inherit",
                      }}
                    >
                      <StatusBadge status={training.status} />
                    </TableCell>
                  )}
                  {isVisible("numberOfPeople") && (
                    <TableCell
                      sx={{
                        ...singleTheme.tableStyles.primary.body.cell,
                        cursor: "pointer",
                        textTransform: "none !important",
                        backgroundColor:
                          sortConfig.key === "numberOfPeople"
                            ? "background.surface"
                            : "inherit",
                      }}
                    >
                      {training.numberOfPeople}
                    </TableCell>
                  )}
                  {isVisible("actions") && (
                    <TableCell
                      sx={{
                        ...singleTheme.tableStyles.primary.body.cell,
                        minWidth: "50px",
                      }}
                    >
                      {isDeletingAllowed && (
                        <CustomIconButton
                          id={trainingId}
                          onDelete={(e?: React.MouseEvent) => {
                            e?.stopPropagation();
                            onDelete?.(trainingIdStr);
                          }}
                          onEdit={(e?: React.MouseEvent) => {
                            e?.stopPropagation();
                            onEdit?.(trainingIdStr);
                          }}
                          onMouseEvent={(e: React.SyntheticEvent) =>
                            e.stopPropagation()
                          }
                          warningTitle="Delete this training?"
                          warningMessage="When you delete this training, all data related to this training will be removed. This action is non-recoverable."
                          type="Training"
                        />
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })
        ) : (
          <TableRow>
            <TableCell
              colSpan={visibleTableColumns.length}
              align="center"
              sx={{ py: 4 }}
            >
              No training data available.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    ),
    [sortedRows, validPage, rowsPerPage, isDeletingAllowed, onEdit, onDelete, isVisible, visibleTableColumns, sortConfig.key, hidePagination]
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

  if (!data || data.length === 0) {
    return (
      <EmptyState icon={GraduationCap} message="No training records yet. Track AI governance training for your team.">
        <EmptyStateTip
          icon={Users}
          title="Assign training to team members"
          description="Each record tracks who completed what training, when, and their score. This creates an audit trail for competency requirements."
        />
        <EmptyStateTip
          icon={Calendar}
          title="Set renewal dates"
          description="Some certifications and training expire. Record renewal dates so you can keep track of upcoming expirations."
        />
        <EmptyStateTip
          icon={Award}
          title="Common training topics"
          description="AI ethics, data privacy, responsible AI use, bias awareness, incident reporting procedures, and framework-specific requirements."
        />
      </EmptyState>
    );
  }

  return (
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
            entityLabel="training"
            colSpan={visibleTableColumns.length}
          />
        )}
      </Table>
    </TableContainer>
  );
};

export default TrainingTable;
