/**
 * Shadow AI Tools Page
 *
 * Lists detected AI tools with status management and detail view.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Stack,
  Typography,
  Skeleton,
  SelectChangeEvent,
  Box,
  IconButton,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  TablePagination,
  TableFooter,
  useTheme,
  Tooltip,
} from "@mui/material";
import Chip from "../../components/Chip";
import {
  ArrowLeft,
  Bot,
  Radar,
  Wifi,
  ShieldAlert,
  Tags,
} from "lucide-react";
import { PROVIDER_ICONS, VENDOR_ICON_MAP } from "../../components/ProviderIcons";
import {
  getTools,
  getToolById,
  updateToolStatus,
  GetToolsParams,
} from "../../../application/repository/shadowAi.repository";
import {
  IShadowAiTool,
  ShadowAiToolStatus,
} from "../../../domain/interfaces/i.shadowAi";
import singleTheme from "../../themes/v1SingleTheme";
import { palette } from "../../themes/palette";
import { EmptyState } from "../../components/EmptyState";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import { CustomizableButton } from "../../components/button/customizable-button";
import Select from "../../components/Inputs/Select";
import { DashboardHeaderCard } from "../../components/Cards/DashboardHeaderCard";
import TablePaginationActions from "../../components/TablePagination";
import GovernanceWizardModal from "./GovernanceWizardModal";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import {
  SelectorVertical,
  SortableColumn,
  useTableSort,
  useSortedRows,
  SortableTableHead,
} from "./constants";

const ROWS_PER_PAGE = 20;

const STATUS_OPTIONS = [
  { _id: "all", name: "All statuses" },
  { _id: "detected", name: "Detected" },
  { _id: "under_review", name: "Under review" },
  { _id: "approved", name: "Approved" },
  { _id: "restricted", name: "Restricted" },
  { _id: "blocked", name: "Blocked" },
  { _id: "dismissed", name: "Dismissed" },
];

const STATUS_CONFIG: Record<
  ShadowAiToolStatus,
  { label: string; color: string; bg: string }
> = {
  detected: { label: "Detected", color: palette.status.info.text, bg: palette.status.info.bg },
  under_review: { label: "Under review", color: palette.status.warning.text, bg: palette.status.warning.bg },
  approved: { label: "Approved", color: palette.status.success.text, bg: palette.status.success.bg },
  restricted: { label: "Restricted", color: palette.accent.orange.text, bg: palette.accent.orange.bg },
  blocked: { label: "Blocked", color: palette.status.error.text, bg: palette.status.error.bg },
  dismissed: { label: "Dismissed", color: palette.status.default.text, bg: palette.status.default.bg },
};

function ToolIcon({ vendor, size = 18 }: { vendor?: string; size?: number }) {
  if (!vendor) return <Bot size={size} strokeWidth={1.5} color={palette.text.disabled} />;
  const iconKey = VENDOR_ICON_MAP[vendor];
  const IconComponent = iconKey ? PROVIDER_ICONS[iconKey] : null;
  if (!IconComponent) return <Bot size={size} strokeWidth={1.5} color={palette.text.disabled} />;
  return <IconComponent width={size} height={size} />;
}

export default function AIToolsPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { toolId } = useParams<{ toolId?: string }>();
  const [loading, setLoading] = useState(true);
  const [tools, setTools] = useState<IShadowAiTool[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ShadowAiToolStatus | "all">("all");
  const [selectedTool, setSelectedTool] = useState<(IShadowAiTool & {
    departments?: { department: string; user_count: number }[];
    top_users?: { user_email: string; event_count: number }[];
  }) | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [governanceModalOpen, setGovernanceModalOpen] = useState(false);

  // ─── Sorting ───
  const TOOLS_COLUMNS: SortableColumn[] = useMemo(() => [
    { id: "name", label: "Tool" },
    { id: "status", label: "Status" },
    { id: "total_users", label: "Users" },
    { id: "total_events", label: "Events" },
    { id: "risk_score", label: "Risk score", tooltip: "Calculated nightly (0–100). Weighted formula: approval status (40%), data & compliance policies (25%), usage volume (15%), department sensitivity (20%)." },
    { id: "last_seen_at", label: "Last seen" },
  ], []);

  const { sortConfig: toolsSortConfig, handleSort: handleToolsSort } =
    useTableSort("vw_shadow_ai_tools_sort");

  const getToolValue = useCallback(
    (row: IShadowAiTool, key: string): string | number => {
      switch (key) {
        case "name": return row.name;
        case "status": return row.status;
        case "total_users": return row.total_users;
        case "total_events": return row.total_events;
        case "risk_score": return row.risk_score ?? 0;
        case "last_seen_at": return row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
        default: return "";
      }
    }, []
  );

  const sortedTools = useSortedRows(tools, toolsSortConfig, getToolValue);

  useEffect(() => {
    const controller = new AbortController();
    const fetchData = async () => {
      setLoading(true);
      try {
        const params: GetToolsParams = {
          page,
          limit: ROWS_PER_PAGE,
          sort_by: "risk_score",
          order: "desc",
        };
        if (statusFilter !== "all") params.status = statusFilter;
        const result = await getTools(params);
        if (controller.signal.aborted) return;
        setTools(result.tools);
        setTotal(result.total);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Failed to load tools:", error);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    fetchData();
    return () => { controller.abort(); };
  }, [page, statusFilter]);

  // Simple refetch for mutation handlers
  const fetchTools = async () => {
    try {
      const params: GetToolsParams = {
        page,
        limit: ROWS_PER_PAGE,
        sort_by: "risk_score",
        order: "desc",
      };
      if (statusFilter !== "all") params.status = statusFilter;
      const result = await getTools(params);
      setTools(result.tools);
      setTotal(result.total);
    } catch (error) {
      console.error("Failed to reload tools:", error);
    }
  };

  // Load tool detail when toolId is in the URL
  useEffect(() => {
    if (!toolId) {
      setSelectedTool(null);
      return;
    }
    const loadTool = async () => {
      setDetailLoading(true);
      try {
        const detail = await getToolById(parseInt(toolId, 10));
        setSelectedTool(detail);
      } catch (error) {
        console.error("Failed to load tool detail:", error);
      } finally {
        setDetailLoading(false);
      }
    };
    loadTool();
  }, [toolId]);

  const handleToolClick = (tool: IShadowAiTool) => {
    navigate(`/shadow-ai/tools/${tool.id}`);
  };

  const handleStatusChange = async (
    id: number,
    newStatus: ShadowAiToolStatus
  ) => {
    try {
      await updateToolStatus(id, newStatus);
      fetchTools();
      if (selectedTool?.id === id) {
        const detail = await getToolById(id);
        setSelectedTool(detail);
      }
    } catch (error) {
      console.error("Failed to update tool status:", error);
    }
  };

  const handleBack = () => {
    navigate("/shadow-ai/tools");
  };

  // ─── Detail view ───
  if (selectedTool) {
    const cfg = STATUS_CONFIG[selectedTool.status];
    return (
      <PageHeaderExtended
        title={selectedTool.name}
        description="AI tool details"
      >
        <Stack direction="row" alignItems="center" gap="8px">
          <IconButton onClick={handleBack} size="small">
            <ArrowLeft size={16} strokeWidth={1.5} />
          </IconButton>
          <ToolIcon vendor={selectedTool.vendor} size={22} />
          <Typography sx={{ fontSize: 15, fontWeight: 600 }}>
            {selectedTool.name}
          </Typography>
          <Chip
            label={cfg.label}
            size="small"
            backgroundColor={cfg.bg}
            textColor={cfg.color}
            uppercase={false}
          />
        </Stack>

        {detailLoading ? (
          <Skeleton height={300} />
        ) : (
          <Stack gap="16px">
            {/* Summary cards */}
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: "16px",
                "& > *": {
                  flex: "1 1 0",
                  minWidth: "120px",
                },
              }}
            >
              <DashboardHeaderCard
                title="Vendor"
                count={selectedTool.vendor || "Unknown"}
                disableNavigation
              />
              <DashboardHeaderCard
                title="Total users"
                count={selectedTool.total_users}
                disableNavigation
              />
              <DashboardHeaderCard
                title="Total events"
                count={selectedTool.total_events}
                disableNavigation
              />
              <Tooltip
                title="Calculated nightly (0–100). Weighted formula: approval status (40%), data & compliance policies (25%), usage volume (15%), department sensitivity (20%)."
                arrow
                placement="bottom"
                slotProps={{ tooltip: { sx: { maxWidth: 280, fontSize: 12, lineHeight: 1.5 } } }}
              >
                <Box>
                  <DashboardHeaderCard
                    title="Risk score"
                    count={selectedTool.risk_score ?? "—"}
                    disableNavigation
                  />
                </Box>
              </Tooltip>
              <DashboardHeaderCard
                title="First detected"
                count={
                  selectedTool.first_detected_at
                    ? new Date(selectedTool.first_detected_at).toLocaleDateString()
                    : "—"
                }
                disableNavigation
              />
              <DashboardHeaderCard
                title="Last seen"
                count={
                  selectedTool.last_seen_at
                    ? new Date(selectedTool.last_seen_at).toLocaleDateString()
                    : "—"
                }
                disableNavigation
              />
            </Box>

            {/* Status change */}
            <Stack direction="row" alignItems="center" gap="8px">
              <Typography sx={{ fontSize: 13, fontWeight: 500, color: palette.text.secondary }}>
                Status:
              </Typography>
              <Select
                id="tool-status-select"
                value={selectedTool.status}
                onChange={(e: SelectChangeEvent<string | number>) =>
                  handleStatusChange(
                    selectedTool.id,
                    e.target.value as ShadowAiToolStatus
                  )
                }
                items={Object.entries(STATUS_CONFIG).map(([key, val]) => ({
                  _id: key,
                  name: val.label,
                }))}
                sx={{ width: 160 }}
              />

              {!selectedTool.model_inventory_id && (
                <CustomizableButton
                  text="Start governance"
                  variant="contained"
                  sx={{
                    backgroundColor: palette.brand.primary,
                    "&:hover": { backgroundColor: palette.brand.primaryHover },
                    height: 30,
                    fontSize: 12,
                  }}
                  onClick={() => setGovernanceModalOpen(true)}
                />
              )}
              {selectedTool.model_inventory_id && (
                <Chip
                  label="Governed"
                  size="small"
                />
              )}
            </Stack>

            {/* Governance wizard modal */}
            <GovernanceWizardModal
              isOpen={governanceModalOpen}
              onClose={() => setGovernanceModalOpen(false)}
              tool={selectedTool}
              onSuccess={async () => {
                const detail = await getToolById(selectedTool.id);
                setSelectedTool(detail);
              }}
            />

            {/* Departments & Top users side by side */}
            <Stack direction="row" gap="16px">
              {selectedTool.departments && selectedTool.departments.length > 0 && (
                <Stack sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 600, mb: 1 }}>
                    Departments
                  </Typography>
                  <TableContainer sx={singleTheme.tableStyles.primary.frame}>
                    <Table sx={{ tableLayout: "fixed" }}>
                      <TableHead>
                        <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                          <TableCell sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "70%" }}>Department</TableCell>
                          <TableCell sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "30%" }}>Users</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedTool.departments.map((d) => (
                          <TableRow key={d.department} sx={singleTheme.tableStyles.primary.body.row}>
                            <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{d.department}</TableCell>
                            <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{d.user_count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Stack>
              )}

              {selectedTool.top_users && selectedTool.top_users.length > 0 && (
                <Stack sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 600, mb: 1 }}>
                    Top users
                  </Typography>
                  <TableContainer sx={singleTheme.tableStyles.primary.frame}>
                    <Table sx={{ tableLayout: "fixed" }}>
                      <TableHead>
                        <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                          <TableCell sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "70%" }}>User</TableCell>
                          <TableCell sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "30%" }}>Events</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedTool.top_users.map((u) => (
                          <TableRow key={u.user_email} sx={singleTheme.tableStyles.primary.body.row}>
                            <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{u.user_email}</TableCell>
                            <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{u.event_count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Stack>
              )}
            </Stack>
          </Stack>
        )}
      </PageHeaderExtended>
    );
  }

  // ─── List view ───
  return (
    <PageHeaderExtended
      title="AI tools"
      description="View and manage all AI tools detected in your organization's network traffic. Review risk scores, update tool statuses, and start formal governance for any discovered tool."
      helpArticlePath="shadow-ai/ai-tools"
      tipBoxEntity="shadow-ai-tools"
    >

      <Stack direction="row" justifyContent="flex-end">
        <Select
          id="tools-status-filter"
          value={statusFilter}
          onChange={(e: SelectChangeEvent<string | number>) => {
            setStatusFilter(e.target.value as ShadowAiToolStatus | "all");
            setPage(1);
          }}
          items={STATUS_OPTIONS}
          sx={{ width: 160 }}
        />
      </Stack>

      {loading ? (
        <Skeleton variant="rectangular" height={300} sx={{ borderRadius: "4px" }} />
      ) : tools.length === 0 ? (
        <EmptyState
          icon={Radar}
          message="No AI tools detected yet. Connect a data source to monitor AI tool usage."
          showBorder
        >
          <EmptyStateTip
            icon={Wifi}
            title="Connect data sources"
            description="Add the AI tools your organization uses or has detected. Track which tools are in use and who has access to them."
          />
          <EmptyStateTip
            icon={ShieldAlert}
            title="Identify unauthorized tools"
            description="Discover AI tools being used without IT approval. Flag tools that may expose sensitive data or violate company policy."
          />
          <EmptyStateTip
            icon={Tags}
            title="Categorize and govern"
            description="Classify detected tools as approved, under review, or blocked. Set policies per tool and notify users of compliance requirements."
          />
        </EmptyState>
      ) : (
        <TableContainer sx={singleTheme.tableStyles.primary.frame}>
          <Table>
            <SortableTableHead
              columns={TOOLS_COLUMNS}
              sortConfig={toolsSortConfig}
              onSort={handleToolsSort}
            />
            <TableBody>
              {sortedTools.map((t) => {
                const cfg = STATUS_CONFIG[t.status];
                return (
                  <TableRow key={t.id} hover sx={{ ...singleTheme.tableStyles.primary.body.row, cursor: "pointer" }} onClick={() => handleToolClick(t)}>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      <Stack direction="row" alignItems="center" gap="6px">
                        <ToolIcon vendor={t.vendor} />
                        {t.name}
                      </Stack>
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      <Chip
                        label={cfg.label}
                        size="small"
                        backgroundColor={cfg.bg}
                        textColor={cfg.color}
                        uppercase={false}
                      />
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{t.total_users}</TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{t.total_events}</TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{t.risk_score ?? 0}</TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      {t.last_seen_at ? new Date(t.last_seen_at).toLocaleDateString() : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
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
                  Showing {(page - 1) * ROWS_PER_PAGE + 1} -{" "}
                  {Math.min(page * ROWS_PER_PAGE, total)} of {total} tool(s)
                </TableCell>
                <TablePagination
                  count={total}
                  page={page - 1}
                  onPageChange={(_e, newPage) => setPage(newPage + 1)}
                  rowsPerPage={ROWS_PER_PAGE}
                  rowsPerPageOptions={[ROWS_PER_PAGE]}
                  ActionsComponent={(props) => (
                    <TablePaginationActions {...props} />
                  )}
                  labelRowsPerPage=""
                  labelDisplayedRows={({ page: p, count }) =>
                    `Page ${p + 1} of ${Math.max(0, Math.ceil(count / ROWS_PER_PAGE))}`
                  }
                  slotProps={{
                    select: {
                      MenuProps: {
                        keepMounted: true,
                        PaperProps: {
                          className: "pagination-dropdown",
                          sx: { mt: 0, mb: theme.spacing(2) },
                        },
                        transformOrigin: { vertical: "bottom", horizontal: "left" },
                        anchorOrigin: { vertical: "top", horizontal: "left" },
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
                    "& .MuiSelect-icon": { width: "24px", height: "fit-content" },
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
          </Table>
        </TableContainer>
      )}
    </PageHeaderExtended>
  );
}


