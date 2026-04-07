import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableFooter,
  TablePagination,
  TableRow,
  Stack,
  Chip as MuiChip,
  Box,
  useTheme,
} from "@mui/material";
import { ChevronsUpDown, ChevronUp, ChevronDown, AlertTriangle, Bot, RefreshCw, Plug, ShieldCheck, Settings } from "lucide-react";
import IconButton from "../../components/IconButton";
import { ReactComponent as SelectorVertical } from "../../assets/icons/selector-vertical.svg";
import { EmptyState } from "../../components/EmptyState";
import { CustomizableButton } from "../../components/button/customizable-button";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import { getInstalledPlugins } from "../../../application/repository/plugin.repository";
import Chip from "../../components/Chip";
import TablePaginationActions from "../../components/TablePagination";
import { singleTheme } from "../../themes";
import {
  permissionChip,
  agentFooterRow,
  agentShowingText,
  agentPaginationMenu,
  agentPaginationSelect,
  agentPagination,
} from "./style";
import { AgentTableProps } from "src/domain/interfaces/i.agentDiscovery";


const cellStyle = singleTheme.tableStyles.primary.body.cell;

const TABLE_COLUMNS = [
  { id: "display_name", label: "NAME", sortable: true },
  { id: "source_system", label: "SOURCE", sortable: true },
  { id: "primitive_type", label: "TYPE", sortable: true },
  { id: "permissions", label: "PERMISSIONS", sortable: false },
  { id: "last_activity", label: "LAST ACTIVITY", sortable: true },
  { id: "review_status", label: "STATUS", sortable: true },
  { id: "stale", label: "", sortable: false },
  { id: "actions", label: "", sortable: false },
];

type SortDirection = "asc" | "desc" | null;
type SortConfig = { key: string; direction: SortDirection };

const AgentTable: React.FC<AgentTableProps> = ({
  agents,
  isLoading,
  onRowClick,
  onEdit,
  onDelete,
  onSync,
  isSyncing,
  visibleColumns,
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [azureInstalled, setAzureInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    getInstalledPlugins()
      .then((plugins) => {
        setAzureInstalled(plugins.some((p) => p.pluginKey === "azure-ai-foundry"));
      })
      .catch(() => setAzureInstalled(false));
  }, []);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: "",
    direction: null,
  });

  // Filter columns based on visibility
  const visibleColumnsArray = useMemo(() => {
    if (!visibleColumns || visibleColumns.size === 0) return TABLE_COLUMNS;
    return TABLE_COLUMNS.filter((col) => visibleColumns.has(col.id));
  }, [visibleColumns]);

  // Helper to check individual column visibility
  const isColVisible = (id: string) =>
    !visibleColumns || visibleColumns.size === 0 || visibleColumns.has(id);

  useEffect(() => {
    setPage(0);
  }, [agents]);

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSort = useCallback((columnLabel: string) => {
    setSortConfig((prev) => {
      if (prev.key === columnLabel) {
        if (prev.direction === "asc") return { key: columnLabel, direction: "desc" };
        if (prev.direction === "desc") return { key: "", direction: null };
      }
      return { key: columnLabel, direction: "asc" };
    });
  }, []);

  const sortedData = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return agents;

    const sorted = [...agents].sort((a, b) => {
      let aVal: string | null = null;
      let bVal: string | null = null;

      switch (sortConfig.key) {
        case "NAME":
          aVal = a.display_name;
          bVal = b.display_name;
          break;
        case "SOURCE":
          aVal = a.source_system;
          bVal = b.source_system;
          break;
        case "TYPE":
          aVal = a.primitive_type;
          bVal = b.primitive_type;
          break;
        case "LAST ACTIVITY":
          aVal = a.last_activity;
          bVal = b.last_activity;
          break;
        case "STATUS":
          aVal = a.review_status;
          bVal = b.review_status;
          break;
        default:
          return 0;
      }

      const strA = (aVal || "").toLowerCase();
      const strB = (bVal || "").toLowerCase();
      if (strA < strB) return sortConfig.direction === "asc" ? -1 : 1;
      if (strA > strB) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [agents, sortConfig]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getRange = useMemo(() => {
    const start = page * rowsPerPage + 1;
    const end = Math.min((page + 1) * rowsPerPage, sortedData.length);
    return `${start}–${end}`;
  }, [page, rowsPerPage, sortedData.length]);

  if (isLoading) {
    return <EmptyState icon={Bot} message="Loading agents..." />;
  }

  if (!sortedData || sortedData.length === 0) {
    return (
      <EmptyState icon={Bot} message="No agents discovered yet">
        <EmptyStateTip
          icon={Plug}
          title="Connect a source"
          description="Agent discovery pulls AI agents from your cloud platforms. Install the Azure AI Foundry plugin to discover agents deployed in your Azure subscription, or browse the marketplace for other integrations."
        />
        <EmptyStateTip
          icon={RefreshCw}
          title="Configure and sync"
          description="After installing a plugin, add your project endpoint and API key in the plugin settings. Then click Sync on this page to pull in your agents."
        />
        <EmptyStateTip
          icon={ShieldCheck}
          title="Review and govern"
          description="Each discovered agent can be confirmed, rejected, or linked to a model in your inventory for compliance tracking."
        />
        <Box sx={{ display: "flex", gap: "8px", mt: "16px" }}>
          {azureInstalled ? (
            <>
              <CustomizableButton
                text={isSyncing ? "Syncing..." : "Sync now"}
                variant="contained"
                onClick={onSync}
                isDisabled={isSyncing}
                startIcon={<RefreshCw size={14} style={isSyncing ? { animation: "spin 1s linear infinite" } : undefined} />}
                sx={{ height: 34 }}
              />
              <CustomizableButton
                text="Configure"
                variant="outlined"
                onClick={() => navigate("/plugins/azure-ai-foundry/manage")}
                startIcon={<Settings size={14} />}
                sx={{ height: 34 }}
              />
            </>
          ) : (
            <CustomizableButton
              text="Install Azure AI Foundry"
              variant="contained"
              onClick={() => navigate("/plugins/azure-ai-foundry/manage")}
              startIcon={<Plug size={14} />}
              sx={{ height: 34 }}
            />
          )}
        </Box>
      </EmptyState>
    );
  }

  const tableHeader = (
    <TableHead
      sx={{
        backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
      }}
    >
      <TableRow sx={singleTheme.tableStyles.primary.header.row}>
        {visibleColumnsArray.map((column) => {
          const sortable = column.sortable;
          return (
            <TableCell
              key={column.id}
              sx={{
                ...singleTheme.tableStyles.primary.header.cell,
                ...(sortable
                  ? {
                    cursor: "pointer",
                    userSelect: "none",
                    "&:hover": {
                      backgroundColor: "rgba(0, 0, 0, 0.04)",
                    },
                  }
                  : {}),
              }}
              onClick={() => sortable && handleSort(column.label)}
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
                    color:
                      sortConfig.key === column.label
                        ? "primary.main"
                        : "inherit",
                  }}
                >
                  {column.label}
                </div>
                {sortable && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      color:
                        sortConfig.key === column.label
                          ? "primary.main"
                          : "text.disabled",
                    }}
                  >
                    {sortConfig.key === column.label &&
                      sortConfig.direction === "asc" && (
                        <ChevronUp size={16} />
                      )}
                    {sortConfig.key === column.label &&
                      sortConfig.direction === "desc" && (
                        <ChevronDown size={16} />
                      )}
                    {sortConfig.key !== column.label && (
                      <ChevronsUpDown size={16} />
                    )}
                  </Box>
                )}
              </Box>
            </TableCell>
          );
        })}
      </TableRow>
    </TableHead>
  );

  const tableBody = (
    <TableBody>
      {sortedData
        .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
        .map((agent) => (
          <TableRow
            key={agent.id}
            sx={singleTheme.tableStyles.primary.body.row}
            onClick={() => onRowClick(agent)}
          >
            {isColVisible('display_name') && (
              <TableCell sx={cellStyle}>{agent.display_name}</TableCell>
            )}
            {isColVisible('source_system') && (
              <TableCell sx={cellStyle}>{agent.source_system}</TableCell>
            )}
            {isColVisible('primitive_type') && (
              <TableCell sx={cellStyle}>{agent.primitive_type}</TableCell>
            )}
            {isColVisible('permissions') && (
              <TableCell sx={cellStyle}>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5}>
                  {(agent.permission_categories || []).slice(0, 3).map((cat) => (
                    <MuiChip
                      key={cat}
                      label={cat}
                      size="small"
                      sx={permissionChip}
                    />
                  ))}
                  {(agent.permission_categories || []).length > 3 && (
                    <MuiChip
                      label={`+${agent.permission_categories.length - 3}`}
                      size="small"
                      sx={permissionChip}
                    />
                  )}
                </Stack>
              </TableCell>
            )}
            {isColVisible('last_activity') && (
              <TableCell sx={cellStyle}>
                {formatDate(agent.last_activity)}
              </TableCell>
            )}
            {isColVisible('review_status') && (
              <TableCell sx={cellStyle}>
                <Chip label={agent.review_status} />
              </TableCell>
            )}
            {isColVisible('stale') && (
              <TableCell sx={{ ...cellStyle, width: 40 }}>
                {agent.is_stale && (
                  <AlertTriangle
                    size={14}
                    strokeWidth={1.5}
                    color="#F9A825"
                  />
                )}
              </TableCell>
            )}
            {isColVisible('actions') && (
              <TableCell
                sx={{ ...cellStyle, width: 40 }}
                onClick={(e) => e.stopPropagation()}
              >
                <IconButton
                  id={agent.id}
                  onEdit={() => onEdit(agent)}
                  onDelete={() => onDelete(agent)}
                  onMouseEvent={() => { }}
                  warningTitle="Delete this agent?"
                  warningMessage="When you delete this agent, all data related to this agent will be removed. This action is non-recoverable."
                  type="Vendor"
                />
              </TableCell>
            )}
          </TableRow>
        ))}
    </TableBody>
  );

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table sx={singleTheme.tableStyles.primary.frame}>
        {tableHeader}
        {tableBody}
        <TableFooter>
          <TableRow sx={agentFooterRow(theme)}>
            <TableCell colSpan={Math.max(1, visibleColumnsArray.length - 1)} sx={agentShowingText(theme)}>
              Showing {getRange} of {sortedData.length} agent(s)
            </TableCell>
            <TablePagination
              count={sortedData.length}
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
                  MenuProps: agentPaginationMenu(theme),
                  inputProps: {
                    id: "agent-pagination-dropdown",
                  },
                  IconComponent: SelectorVertical,
                  sx: agentPaginationSelect(theme),
                },
              }}
              sx={agentPagination(theme)}
            />
          </TableRow>
        </TableFooter>
      </Table>
    </TableContainer>
  );
};

export default AgentTable;
