import React, { useMemo, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Stack,
  Typography,
  Tooltip,
} from "@mui/material";
import { AlertTriangle, FileWarning, ClipboardList, Bell } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import Chip from "../../components/Chip";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { displayFormattedDate } from "../../tools/isoDateToString";
import { singleTheme } from "../../themes";
import { AIIncidentManagementModel } from "../../../domain/models/Common/incidentManagement/incidentManagement.model";
import { IncidentTableProps } from "../../types/interfaces/i.table";
import {
  incidentRowHover,
  incidentLoadingContainer,
  incidentTableRowDeletingStyle,
} from "./style";
import CustomIconButton from "../../components/IconButton";
import { useStandardTable } from "../../../application/hooks/useStandardTable";
import type { StandardColumn } from "../../../domain/types/standardTable";
import StandardTableHead from "../../components/Table/StandardTableHead";
import StandardTablePagination from "../../components/Table/StandardTablePagination";

dayjs.extend(utc);

const cellStyle = singleTheme.tableStyles.primary.body.cell;

const TABLE_COLUMNS: StandardColumn[] = [
  { id: "incident_id", label: "INCIDENT ID", sortable: true },
  { id: "ai_project", label: "AI PROJECT", sortable: true },
  { id: "type", label: "TYPE", sortable: true },
  { id: "severity", label: "SEVERITY", sortable: true },
  { id: "status", label: "STATUS", sortable: true },
  { id: "occurred_date", label: "OCCURRED DATE", sortable: true },
  { id: "approved_by", label: "APPROVED BY", sortable: true },
  { id: "actions", label: "", sortable: false },
];

const TooltipCell: React.FC<{ value?: string | null }> = ({ value }) => {
  const displayValue = value || "-";
  const shouldTruncate = displayValue.length > 30;
  const truncatedValue = shouldTruncate
    ? `${displayValue.substring(0, 30)}...`
    : displayValue;

  return shouldTruncate ? (
    <Tooltip title={displayValue} arrow>
      <span style={{ cursor: "help" }}>{truncatedValue}</span>
    </Tooltip>
  ) : (
    <span>{displayValue}</span>
  );
};

const IncidentTable: React.FC<IncidentTableProps> = ({
  data,
  isLoading,
  onEdit,
  onView,
  onArchive,
  paginated = true,
  archivedId,
  hidePagination = false,
  visibleColumns,
}) => {
  const isVisible = useCallback(
    (key: string) => {
      if (!visibleColumns) return true;
      return visibleColumns.has(key);
    },
    [visibleColumns]
  );

  const visibleTableColumns = useMemo(
    () => TABLE_COLUMNS.filter((col) => isVisible(col.id)),
    [isVisible]
  );

  const sortComparator = useCallback(
    (a: AIIncidentManagementModel, b: AIIncidentManagementModel, key: string): number => {
      let aValue: string | number;
      let bValue: string | number;

      switch (key) {
        case "incident_id":
          aValue = a.incident_id?.toString() || "";
          bValue = b.incident_id?.toString() || "";
          break;
        case "ai_project":
          aValue = a.ai_project?.toLowerCase() || "";
          bValue = b.ai_project?.toLowerCase() || "";
          break;
        case "type":
          aValue = a.type?.toLowerCase() || "";
          bValue = b.type?.toLowerCase() || "";
          break;
        case "severity":
          aValue = a.severity?.toLowerCase() || "";
          bValue = b.severity?.toLowerCase() || "";
          break;
        case "status":
          aValue = a.status?.toLowerCase() || "";
          bValue = b.status?.toLowerCase() || "";
          break;
        case "occurred_date":
          aValue = a.occurred_date ? new Date(a.occurred_date).getTime() : 0;
          bValue = b.occurred_date ? new Date(b.occurred_date).getTime() : 0;
          break;
        case "approved_by":
          aValue = a.approved_by?.toLowerCase() || "";
          bValue = b.approved_by?.toLowerCase() || "";
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
  } = useStandardTable<AIIncidentManagementModel>({
    rows: data || [],
    storageKey: "incident_table",
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
            .map((incident) => (
              <TableRow
                key={incident.id}
                sx={{
                  ...singleTheme.tableStyles.primary.body.row,
                  ...incidentRowHover,
                  ...(archivedId === incident.id?.toString() &&
                    incidentTableRowDeletingStyle),
                }}
                onClick={() => onEdit?.(incident.id?.toString(), "edit")}
              >
                {isVisible("incident_id") && (
                  <TableCell
                    sx={{
                      ...cellStyle,
                      width: "110px",
                      maxWidth: "110px",
                      backgroundColor:
                        sortConfig.key === "incident_id"
                          ? "#e8e8e8"
                          : "#fafafa",
                    }}
                  >
                    {incident.incident_id}{" "}
                  </TableCell>
                )}
                {isVisible("ai_project") && (
                  <TableCell
                    sx={{
                      ...cellStyle,
                      backgroundColor:
                        sortConfig.key === "ai_project"
                          ? "background.surface"
                          : "inherit",
                    }}
                  >
                    <TooltipCell value={incident.ai_project} />
                  </TableCell>
                )}
                {isVisible("type") && (
                  <TableCell
                    sx={{
                      ...cellStyle,
                      backgroundColor:
                        sortConfig.key === "type"
                          ? "background.surface"
                          : "inherit",
                    }}
                  >
                    <TooltipCell value={incident.type} />
                  </TableCell>
                )}
                {isVisible("severity") && (
                  <TableCell
                    sx={{
                      ...cellStyle,
                      backgroundColor:
                        sortConfig.key === "severity"
                          ? "background.surface"
                          : "inherit",
                    }}
                  >
                    <Chip label={incident.severity} />
                  </TableCell>
                )}
                {isVisible("status") && (
                  <TableCell
                    sx={{
                      ...cellStyle,
                      backgroundColor:
                        sortConfig.key === "status"
                          ? "background.surface"
                          : "inherit",
                    }}
                  >
                    <Chip label={incident.status} />
                  </TableCell>
                )}
                {isVisible("occurred_date") && (
                  <TableCell
                    sx={{
                      ...cellStyle,
                      backgroundColor:
                        sortConfig.key === "occurred_date"
                          ? "background.surface"
                          : "inherit",
                    }}
                  >
                    {incident.occurred_date
                      ? displayFormattedDate(incident.occurred_date)
                      : "-"}
                  </TableCell>
                )}
                {isVisible("approved_by") && (
                  <TableCell
                    sx={{
                      ...cellStyle,
                      backgroundColor:
                        sortConfig.key === "approved_by"
                          ? "background.surface"
                          : "inherit",
                    }}
                  >
                    <TooltipCell value={incident.approved_by} />
                  </TableCell>
                )}
                {isVisible("actions") && (
                  <TableCell
                    sx={{
                      ...cellStyle,
                    }}
                  >
                    <Stack direction="row" spacing={1}>
                      <CustomIconButton
                        id={incident.id}
                        type="Incident"
                        onEdit={() => onEdit?.(incident.id?.toString(), "edit")}
                        onDelete={() =>
                          onArchive?.(incident.id?.toString(), "archive")
                        }
                        onView={() => onView?.(incident.id?.toString(), "view")}
                        onMouseEvent={() => {}}
                        warningTitle="Are you sure?"
                        warningMessage="You are about to archive this incident. This action cannot be undone. You can also choose to edit or view the incident instead."
                      />
                    </Stack>
                  </TableCell>
                )}
              </TableRow>
            ))
        ) : (
          <TableRow>
            <TableCell
              colSpan={visibleTableColumns.length}
              align="center"
              sx={{ border: "none", p: 0 }}
            >
              <EmptyState icon={AlertTriangle} message="No incidents found." />
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    ),
    [sortedRows, validPage, rowsPerPage, archivedId, onEdit, onArchive, onView, isVisible, sortConfig.key, visibleTableColumns.length, hidePagination]
  );

  if (isLoading) {
    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        sx={incidentLoadingContainer()}
      >
        <Typography>Loading...</Typography>
      </Stack>
    );
  }

  if (!sortedRows || sortedRows.length === 0) {
    return (
      <EmptyState icon={AlertTriangle} message="No incidents reported yet. Track and manage AI-related incidents to maintain compliance.">
        <EmptyStateTip
          icon={FileWarning}
          title="What counts as an incident?"
          description="Any unintended AI behavior, data breach, biased output, system outage, or safety concern. Log them early, even if minor."
        />
        <EmptyStateTip
          icon={ClipboardList}
          title="Document root cause and response"
          description="Record what happened, why it happened, the impact, and what corrective actions were taken. This builds your incident response history."
        />
        <EmptyStateTip
          icon={Bell}
          title="Assign owners and track resolution"
          description="Assign each incident to a responsible person and track it through to resolution. A clear ownership chain speeds up response times."
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
            entityLabel="incident"
            colSpan={visibleTableColumns.length}
          />
        )}
      </Table>
    </TableContainer>
  );
};

export default IncidentTable;
