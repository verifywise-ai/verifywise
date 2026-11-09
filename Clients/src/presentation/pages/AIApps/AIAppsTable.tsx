import { useCallback, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  IconButton,
  Stack,
  Tooltip,
} from "@mui/material";
import { Bot, Eye, SquarePen, Trash2, ScanSearch, ShieldCheck, ClipboardCheck } from "lucide-react";
import Chip from "../../components/Chip";
import { IAIApp } from "../../../domain/interfaces/i.aiApp";
import singleTheme from "../../themes/v1SingleTheme";
import { palette } from "../../themes/palette";
import StandardTableHead from "../../components/Table/StandardTableHead";
import StandardTablePagination from "../../components/Table/StandardTablePagination";
import { useStandardTable } from "../../../application/hooks/useStandardTable";
import type { StandardColumn } from "../../../domain/types/standardTable";
import { statusToChipProps, formatDiscoveredSource } from "./utils";
import StaleMarker from "../../components/LifecycleTabs/StaleMarker";
import { TableEmptyStateLayout } from "../../components/Table/TableEmptyStateLayout";
import { EmptyState } from "../../components/EmptyState";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";

interface AIAppsTableProps {
  apps: IAIApp[];
  onEditApp: (app: IAIApp) => void;
  onViewApp: (app: IAIApp) => void;
  onDeleteApp: (app: IAIApp) => void;
  emptyMessage?: string;
  showEmptyTips?: boolean;
  /** Live apps nobody confirmed within the "still live?" interval (#5193). */
  staleIds?: Set<number>;
  /**
   * The server pages and sorts (#5193): `apps` is one page of `total`, and
   * page, page size and sort changes are reported instead of applied here.
   */
  serverPaging?: AIAppsServerPaging;
}

export interface AIAppsServerPaging {
  total: number;
  page: number;
  rowsPerPage: number;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rowsPerPage: number) => void;
  onSortChange: (key: string, direction: "asc" | "desc" | null) => void;
}

/** Columns the server can sort by (GET /api/v1/ai-apps sortBy). */
const SERVER_SORTABLE = new Set(["name", "status", "risk_score"]);

const TABLE_COLUMNS: StandardColumn[] = [
  { id: "name", label: "AI app", sortable: true },
  { id: "status", label: "Status", sortable: true },
  { id: "vendor", label: "Vendor", sortable: false },
  { id: "risk_score", label: "Risk score", sortable: true },
  { id: "source", label: "Source", sortable: true },
  { id: "actions", label: "Actions", sortable: false, align: "right" },
];

export default function AIAppsTable({
  apps,
  onEditApp,
  onViewApp,
  onDeleteApp,
  emptyMessage = "This is your inventory of the AI apps your teams use. Record who owns each one and how it was found, then manage it from here. Add your first AI app to get started.",
  showEmptyTips = false,
  staleIds,
  serverPaging,
}: AIAppsTableProps) {
  const sortComparator = useCallback((a: IAIApp, b: IAIApp, key: string): number => {
    switch (key) {
      case "name":
        return (a.name || "").localeCompare(b.name || "");
      case "status":
        return (a.status || "").localeCompare(b.status || "");
      case "risk_score":
        return (a.risk_score ?? 0) - (b.risk_score ?? 0);
      case "source":
        return (a.discovered_source || "").localeCompare(b.discovered_source || "");
      default:
        return 0;
    }
  }, []);

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
  } = useStandardTable<IAIApp>({
    rows: apps,
    storageKey: "aiApps",
    defaultSortColumn: "",
    defaultSortDirection: null,
    sortComparator,
  });

  // Server-paged: the server sorts, so report sort changes to the page.
  const onServerSortChange = serverPaging?.onSortChange;
  useEffect(() => {
    onServerSortChange?.(sortConfig.key, sortConfig.direction);
  }, [onServerSortChange, sortConfig.key, sortConfig.direction]);

  const columns = serverPaging
    ? TABLE_COLUMNS.map((c) => ({ ...c, sortable: c.sortable && SERVER_SORTABLE.has(c.id) }))
    : TABLE_COLUMNS;
  const visibleRows = serverPaging
    ? sortedRows
    : sortedRows.slice(validPage * rowsPerPage, validPage * rowsPerPage + rowsPerPage);
  const pagination = serverPaging
    ? {
        totalCount: serverPaging.total,
        page: serverPaging.page,
        rowsPerPage: serverPaging.rowsPerPage,
        onPageChange: (_: unknown, next: number) => serverPaging.onPageChange(next),
        onRowsPerPageChange: (event: React.ChangeEvent<HTMLInputElement>) =>
          serverPaging.onRowsPerPageChange(parseInt(event.target.value, 10)),
        getRange: `${serverPaging.page * serverPaging.rowsPerPage + 1} - ${Math.min(
          (serverPaging.page + 1) * serverPaging.rowsPerPage,
          serverPaging.total,
        )}`,
      }
    : {
        totalCount,
        page: validPage,
        rowsPerPage,
        onPageChange: handleChangePage,
        onRowsPerPageChange: handleChangeRowsPerPage,
        getRange,
      };

  const tableHeader = (
    <StandardTableHead columns={columns} sortConfig={sortConfig} onSort={handleSort} />
  );

  if (!sortedRows || sortedRows.length === 0) {
    return (
      <TableEmptyStateLayout header={tableHeader}>
        <EmptyState icon={Bot} message={emptyMessage}>
          {showEmptyTips && (
            <>
              <EmptyStateTip
                icon={ScanSearch}
                title="Keep one list of every AI app"
                description="Record the AI tools your teams use, including shadow AI you promote from a discovered tool, with its owner, vendor and how you found it."
              />
              <EmptyStateTip
                icon={ShieldCheck}
                title="Map models and policies"
                description="Link each app to the models it runs on and the policies that apply to it, so you have a clear record for every tool."
              />
              <EmptyStateTip
                icon={ClipboardCheck}
                title="Run approvals and risk assessments"
                description="Take an app from draft to approved, score its risk and assign the training people need before they use it."
              />
            </>
          )}
        </EmptyState>
      </TableEmptyStateLayout>
    );
  }

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table sx={singleTheme.tableStyles.primary.frame}>
        {tableHeader}
        <TableBody>
          {visibleRows.map((app) => {
            const chipProps = statusToChipProps(app.status);
            return (
              <TableRow
                key={app.id}
                hover
                sx={{ ...singleTheme.tableStyles.primary.body.row, cursor: "pointer" }}
                onClick={() => onEditApp(app)}
              >
                <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                  <Stack direction="row" alignItems="center" gap="8px">
                    <Bot size={16} strokeWidth={1.5} color={palette.text.secondary} />
                    {app.name}
                    {app.id !== undefined && staleIds?.has(app.id) && <StaleMarker />}
                  </Stack>
                </TableCell>
                <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                  <Chip {...chipProps} size="small" uppercase={false} />
                </TableCell>
                <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                  {app.vendor_name || "—"}
                </TableCell>
                <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                  {app.risk_score ?? "—"}
                </TableCell>
                <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                  {formatDiscoveredSource(app.discovered_source)}
                </TableCell>
                <TableCell sx={singleTheme.tableStyles.primary.body.cell} align="right">
                  <Stack
                    direction="row"
                    justifyContent="flex-end"
                    gap="4px"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditApp(app);
                        }}
                        aria-label={`Edit ${app.name}`}
                      >
                        <SquarePen size={14} strokeWidth={1.5} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Details">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewApp(app);
                        }}
                        aria-label={`View details for ${app.name}`}
                      >
                        <Eye size={14} strokeWidth={1.5} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteApp(app);
                        }}
                        aria-label={`Delete ${app.name}`}
                      >
                        <Trash2 size={14} strokeWidth={1.5} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        {pagination.totalCount > 0 && (
          <StandardTablePagination
            totalCount={pagination.totalCount}
            page={pagination.page}
            rowsPerPage={pagination.rowsPerPage}
            onPageChange={pagination.onPageChange}
            onRowsPerPageChange={pagination.onRowsPerPageChange}
            getRange={pagination.getRange}
            entityLabel="AI app"
            entityLabelPlural="AI apps"
            colSpan={TABLE_COLUMNS.length}
          />
        )}
      </Table>
    </TableContainer>
  );
}
