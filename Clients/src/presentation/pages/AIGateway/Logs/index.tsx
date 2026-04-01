import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Typography,
  Stack,
  Table,
  TableBody,
  TableRow,
  TablePagination,
  useTheme,
} from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import TabBar from "../../../components/TabBar";
import {
  FileText,
  ChevronDown,
  ChevronUp,
  Info,
  RefreshCw,
  ChevronsUpDown,
  KeyRound,
} from "lucide-react";
import { Tooltip as MuiTooltip } from "@mui/material";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Toggle from "../../../components/Inputs/Toggle";
import Select from "../../../components/Inputs/Select";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { EmptyState } from "../../../components/EmptyState";
import EmptyStateTip from "../../../components/EmptyState/EmptyStateTip";
import TablePaginationActions from "../../../components/TablePagination";
import SearchBox from "../../../components/Search/SearchBox";
import Chip from "../../../components/Chip";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import { getPaginationRowCount, setPaginationRowCount } from "../../../../application/utils/paginationStorage";
import palette from "../../../themes/palette";
import { sectionTitleSx, useCardSx, formatEntityType } from "../shared";

const AUTO_REFRESH_INTERVAL_MS = 10_000;
const SEARCH_DEBOUNCE_MS = 300;
const GR_DEFAULT_PAGE_SIZE = 25;

type StatusFilter = "all" | "success" | "error";
type SourceFilter = "all" | "playground" | "virtual-key";

interface RequestMessage {
  role: string;
  content: unknown;
}

interface GatewayLog {
  id: number;
  endpoint_id: number;
  endpoint_name: string;
  endpoint_slug: string;
  model: string;
  provider: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  latency_ms: number;
  status_code: number;
  metadata: Record<string, string>;
  request_messages: unknown;
  response_text: string | null;
  error_message: string | null;
  created_at: string;
  virtual_key_id: number | null;
  user_name: string;
  virtual_key_name: string | null;
  virtual_key_prefix: string | null;
}

function isMessageArray(value: unknown): value is RequestMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof (value[0] as Record<string, unknown>).role === "string" &&
    (value[0] as Record<string, unknown>).content !== undefined
  );
}

function formatDateHeader(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (date.toDateString() === todayStr) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getDayKey(dateStr: string): string {
  return new Date(dateStr).toDateString();
}

function ConversationView({ messages }: { messages: RequestMessage[] }) {
  const roleLabelColor: Record<string, string> = {
    system: palette.text.disabled,
    user: palette.brand.primary,
    assistant: palette.text.secondary,
  };

  return (
    <Stack gap="8px">
      {messages.map((msg, i) => (
        <Box key={`${msg.role}-${i}`}>
          <Typography
            component="span"
            sx={{
              fontSize: 11,
              fontWeight: 600,
              color: roleLabelColor[msg.role] ?? palette.text.secondary,
              textTransform: "capitalize",
              display: "block",
              mb: "4px",
            }}
          >
            {msg.role}
          </Typography>
          <Box
            sx={{
              fontFamily: "monospace",
              fontSize: 11,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: palette.text.primary,
              lineHeight: 1.6,
            }}
          >
            {typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content, null, 2)}
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

const STATUS_OPTIONS = [
  { _id: "all", name: "Status: All" },
  { _id: "success", name: "Status: Success" },
  { _id: "error", name: "Status: Error" },
];

const SOURCE_OPTIONS = [
  { _id: "all", name: "Source: All" },
  { _id: "playground", name: "Source: Playground" },
  { _id: "virtual-key", name: "Source: Virtual key" },
];

export default function LogsPage() {
  const theme = useTheme();
  const cardSx = useCardSx();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeLogTab = searchParams.get("tab") || "requests";

  // Guardrail logs state
  const [grLogs, setGrLogs] = useState<any[]>([]);
  const [grTotal, setGrTotal] = useState(0);
  const [grPage, setGrPage] = useState(0);
  const [grRowsPerPage, setGrRowsPerPage] = useState(() =>
    getPaginationRowCount("aiGatewayGuardrailLogs", GR_DEFAULT_PAGE_SIZE)
  );
  const [grLoading, setGrLoading] = useState(false);

  const loadGuardrailLogs = useCallback(async () => {
    setGrLoading(true);
    try {
      const res = await apiServices.get<Record<string, any>>(`/ai-gateway/guardrails/logs?limit=${grRowsPerPage}&offset=${grPage * grRowsPerPage}`);
      const data = res?.data || {};
      setGrLogs(data.logs || data?.data?.logs || []);
      setGrTotal(data.total || data.logs?.length || 0);
    } catch {
      // Silently handle
    } finally {
      setGrLoading(false);
    }
  }, [grPage, grRowsPerPage]);

  useEffect(() => {
    if (activeLogTab === "guardrails") loadGuardrailLogs();
  }, [activeLogTab, loadGuardrailLogs]);

  const [logs, setLogs] = useState<GatewayLog[]>([]);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(() =>
    getPaginationRowCount("aiGatewayLogs", 25)
  );

  // Filter state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const pageRef = useRef(page);
  const rowsPerPageRef = useRef(rowsPerPage);
  pageRef.current = page;
  rowsPerPageRef.current = rowsPerPage;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const buildQuery = useCallback(
    (p: number, rpp: number) => {
      const params = new URLSearchParams();
      params.set("limit", String(rpp));
      params.set("offset", String(p * rpp));
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      return params.toString();
    },
    [debouncedSearch, statusFilter, sourceFilter]
  );

  const loadLogs = useCallback(
    async (p: number, rpp: number) => {
      setLoading(true);
      try {
        const qs = buildQuery(p, rpp);
        const res = await apiServices.get<Record<string, any>>(`/ai-gateway/spend/logs?${qs}`);
        const data = res?.data?.data || res?.data || {};
        setLogs(data.rows || []);
        setTotal(data.total || 0);
      } catch {
        // Silently handle
      } finally {
        setLoading(false);
      }
    },
    [buildQuery]
  );

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
    setExpandedId(null);
  }, [debouncedSearch, statusFilter, sourceFilter]);

  // Reload when page/pagination/filters change (skip when guardrails tab is active)
  useEffect(() => {
    if (activeLogTab === "requests") loadLogs(page, rowsPerPage);
  }, [page, rowsPerPage, loadLogs, activeLogTab]);

  // Auto-refresh: only restarts when toggled, reads page/rpp from refs
  const loadLogsRef = useRef(loadLogs);
  loadLogsRef.current = loadLogs;

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      loadLogsRef.current(pageRef.current, rowsPerPageRef.current);
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoRefresh]);

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
    setExpandedId(null);
  };

  const handleChangeRowsPerPage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rpp = parseInt(e.target.value, 10);
    setRowsPerPage(rpp);
    setPage(0);
    setPaginationRowCount("aiGatewayLogs", rpp);
  };

  // Group logs by calendar day (memoized)
  const groupedLogs = useMemo(() => {
    const seenDays = new Set<string>();
    return logs.map((log) => {
      const dayKey = getDayKey(log.created_at);
      const isFirstOfDay = !seenDays.has(dayKey);
      if (isFirstOfDay) seenDays.add(dayKey);
      return { log, isFirstOfDay, dayKey };
    });
  }, [logs]);

  const hasLogs = logs.length > 0 || (total > 0 && loading);

  return (
    <PageHeaderExtended
      title="Logs"
      description="View request, response, and guardrail detection logs for all AI Gateway traffic."
      tipBoxEntity="ai-gateway-logs"
      helpArticlePath="ai-gateway/logs"
      actionButton={
        <Stack direction="row" gap="8px" alignItems="center">
          <Stack direction="row" alignItems="center" gap="6px">
            <Toggle
              checked={autoRefresh}
              onChange={() => setAutoRefresh((prev) => !prev)}
              size="small"
            />
            <Typography fontSize={12} color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
              Live updates
            </Typography>
          </Stack>
          <CustomizableButton
            text={(activeLogTab === "requests" ? loading : grLoading) ? "Loading..." : "Refresh"}
            icon={<RefreshCw size={14} strokeWidth={1.5} />}
            onClick={() => activeLogTab === "requests" ? loadLogs(page, rowsPerPage) : loadGuardrailLogs()}
          />
        </Stack>
      }
    >
      <TabContext value={activeLogTab}>
        <TabBar
          tabs={[
            { label: "Request logs", value: "requests", icon: "FileText" as const },
            { label: "Guardrail logs", value: "guardrails", icon: "Shield" as const },
          ]}
          activeTab={activeLogTab}
          onChange={(_, v) => setSearchParams({ tab: v })}
        />

        <Box sx={{ mt: "16px" }}>
        {/* ─── Request logs tab ──────────────────────────────── */}
        {activeLogTab === "requests" && (
          <>
      {/* Filter bar */}
      <Box
        sx={{
          mb: "16px",
          p: "12px 16px",
          background: theme.palette.background.paper,
          border: `1.5px solid ${theme.palette.border.light}`,
          borderRadius: theme.shape.borderRadius,
        }}
      >
        <Stack direction="row" gap="12px" alignItems="center" flexWrap="wrap">
          <Box sx={{ flex: "1 1 200px", minWidth: 180, maxWidth: 320 }}>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Search endpoints, models, users..."
              fullWidth={false}
              sx={{ width: "100%" }}
            />
          </Box>
          <Select
            id="status-filter"
            value={statusFilter}
            items={STATUS_OPTIONS}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            sx={{ minWidth: 140, maxWidth: 170 }}
          />
          <Select
            id="source-filter"
            value={sourceFilter}
            items={SOURCE_OPTIONS}
            onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
            sx={{ minWidth: 160, maxWidth: 190 }}
          />
        </Stack>
      </Box>

      {!loading && logs.length === 0 && total === 0 && (
        <EmptyState
          icon={FileText}
          message="No request logs yet. Send requests through the gateway to see detailed logs here."
          showBorder
        >
          <EmptyStateTip
            icon={FileText}
            title="Full request and response audit"
            description="Each log entry shows the complete prompt sent to the LLM, the model's response, cost, tokens, latency, and any metadata tags attached to the request."
          />
        </EmptyState>
      )}

      {hasLogs && (
        <Box sx={cardSx}>
          <Stack gap="12px">
            <Stack direction="row" alignItems="center" gap="6px">
              <Typography sx={sectionTitleSx}>Recent requests</Typography>
              <MuiTooltip
                title="Click a row to expand and see full request/response details"
                arrow
                placement="top"
              >
                <Box sx={{ display: "flex", cursor: "help" }} tabIndex={0} aria-label="Log details info">
                  <Info size={14} color={palette.text.disabled} />
                </Box>
              </MuiTooltip>
              <Box sx={{ flex: 1 }} />
              <Typography sx={{ fontSize: 11, color: palette.text.disabled }}>
                {total.toLocaleString()} total
              </Typography>
            </Stack>

            <Stack gap="4px">
              {groupedLogs.map(({ log, isFirstOfDay }) => (
                <Box key={log.id}>
                  {/* Date group header */}
                  {isFirstOfDay && (
                    <Typography
                      sx={{
                        fontSize: 11,
                        color: palette.text.disabled,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        mt: "8px",
                        mb: "6px",
                        pb: "4px",
                        borderBottom: `1px solid ${palette.border.light}`,
                      }}
                    >
                      {formatDateHeader(log.created_at)}
                    </Typography>
                  )}

                  {/* Log row */}
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpandedId(expandedId === log.id ? null : log.id);
                      }
                    }}
                    sx={{
                      p: "10px 14px",
                      borderRadius: "4px",
                      border: `1px solid ${palette.border.light}`,
                      cursor: "pointer",
                      "&:hover": { backgroundColor: palette.background.hover },
                    }}
                  >
                    <Stack direction="row" alignItems="center" gap="8px">
                      {expandedId === log.id ? (
                        <ChevronUp size={14} color={palette.text.tertiary} />
                      ) : (
                        <ChevronDown size={14} color={palette.text.tertiary} />
                      )}
                      <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                        {log.endpoint_name || log.endpoint_slug || "unknown"}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                        {log.model}
                      </Typography>
                    </Stack>

                    <Stack direction="row" gap="12px" alignItems="center">
                      {/* Virtual key name or user name */}
                      {log.virtual_key_id ? (
                        <Stack direction="row" alignItems="center" gap="4px">
                          <KeyRound size={12} color={palette.text.disabled} strokeWidth={1.5} />
                          <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>
                            {log.virtual_key_name || log.virtual_key_prefix || "Virtual key"}
                          </Typography>
                        </Stack>
                      ) : (
                        <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>
                          {log.user_name}
                        </Typography>
                      )}

                      <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>
                        {Number(log.total_tokens).toLocaleString()} tokens
                      </Typography>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, minWidth: 70, textAlign: "right" }}>
                        ${Number(log.cost_usd).toFixed(6)}
                      </Typography>

                      {/* Status chip */}
                      <Chip
                        label={String(log.status_code)}
                        variant={log.status_code === 200 ? "success" : "error"}
                        size="small"
                        uppercase={false}
                      />

                      <Typography sx={{ fontSize: 11, color: palette.text.disabled, minWidth: 65 }}>
                        {new Date(log.created_at).toLocaleTimeString()}
                      </Typography>
                    </Stack>
                  </Stack>

                  {/* Expanded detail panel */}
                  {expandedId === log.id && (
                    <Box
                      sx={{
                        p: "12px 16px",
                        ml: 3,
                        mt: 0.5,
                        border: `1px solid ${palette.border.light}`,
                        borderRadius: "4px",
                        backgroundColor: palette.background.alt,
                      }}
                    >
                      {!!log.request_messages && (
                        <Box
                          sx={{
                            mb: 1.5,
                            p: "16px",
                            borderRadius: "4px",
                            backgroundColor: palette.background.main,
                            border: `1px solid ${palette.border.light}`,
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: palette.text.tertiary,
                              mb: 1.5,
                            }}
                          >
                            Request
                          </Typography>
                          {isMessageArray(log.request_messages) ? (
                            <ConversationView messages={log.request_messages} />
                          ) : (
                            <Box
                              sx={{
                                fontFamily: "monospace",
                                fontSize: 11,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-all",
                                maxHeight: 200,
                                overflow: "auto",
                              }}
                            >
                              {JSON.stringify(log.request_messages, null, 2)}
                            </Box>
                          )}
                        </Box>
                      )}

                      {log.response_text && (
                        <Box
                          sx={{
                            mb: 1.5,
                            p: "16px",
                            borderRadius: "4px",
                            backgroundColor: palette.background.main,
                            border: `1px solid ${palette.border.light}`,
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: palette.text.tertiary,
                              mb: 1,
                            }}
                          >
                            Response
                          </Typography>
                          <Box sx={{ fontSize: 12, whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>
                            {log.response_text}
                          </Box>
                        </Box>
                      )}

                      {log.error_message && (
                        <Box
                          sx={{
                            mb: 1.5,
                            p: "16px",
                            borderRadius: "4px",
                            backgroundColor: palette.background.main,
                            border: `1px solid ${palette.border.light}`,
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: palette.status.error.text,
                              mb: 1,
                            }}
                          >
                            Error
                          </Typography>
                          <Typography sx={{ fontSize: 12, color: palette.status.error.text }}>
                            {log.error_message}
                          </Typography>
                        </Box>
                      )}

                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <Box
                          sx={{
                            mb: 1,
                            p: "16px",
                            borderRadius: "4px",
                            backgroundColor: palette.background.main,
                            border: `1px solid ${palette.border.light}`,
                          }}
                        >
                          <Typography
                            sx={{ fontSize: 11, fontWeight: 600, color: palette.text.tertiary, mb: 1 }}
                          >
                            Metadata
                          </Typography>
                          <Typography sx={{ fontSize: 11, fontFamily: "monospace" }}>
                            {JSON.stringify(log.metadata)}
                          </Typography>
                        </Box>
                      )}

                      <Stack
                        direction="row"
                        gap="16px"
                        sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${palette.border.light}` }}
                      >
                        <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                          Latency: <strong>{log.latency_ms}ms</strong>
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                          Prompt: <strong>{Number(log.prompt_tokens).toLocaleString()} tokens</strong>
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                          Completion:{" "}
                          <strong>{Number(log.completion_tokens).toLocaleString()} tokens</strong>
                        </Typography>
                      </Stack>
                    </Box>
                  )}
                </Box>
              ))}
            </Stack>
          </Stack>

          {/* Pagination */}
          <Table>
            <TableBody>
              <TableRow>
                <TablePagination
                  count={total}
                  page={page}
                  onPageChange={handleChangePage}
                  rowsPerPage={rowsPerPage}
                  rowsPerPageOptions={[10, 25, 50]}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  ActionsComponent={(props) => <TablePaginationActions {...props} />}
                  labelRowsPerPage="Rows per page"
                  labelDisplayedRows={({ page, count }) =>
                    `Page ${page + 1} of ${Math.max(0, Math.ceil(count / rowsPerPage))}`
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
                      IconComponent: () => <ChevronsUpDown size={16} />,
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
                    backgroundColor: theme.palette.grey[50],
                    border: `1px solid ${theme.palette.border.light}`,
                    borderTop: "none",
                    borderRadius: `0 0 ${theme.shape.borderRadius}px ${theme.shape.borderRadius}px`,
                    color: theme.palette.text.secondary,
                    height: "50px",
                    minHeight: "50px",
                    "& .MuiTablePagination-toolbar": {
                      minHeight: "50px",
                      paddingTop: "4px",
                      paddingBottom: "4px",
                    },
                    "& .MuiSelect-icon": {
                      width: "24px",
                      height: "fit-content",
                    },
                    "& .MuiSelect-select": {
                      width: theme.spacing(10),
                      borderRadius: theme.shape.borderRadius,
                      border: `1px solid ${theme.palette.border.light}`,
                    },
                  }}
                />
              </TableRow>
            </TableBody>
          </Table>
        </Box>
      )}
          </>
        )}

        {/* ─── Guardrail logs tab ────────────────────────────── */}
        {activeLogTab === "guardrails" && (
          <Box sx={cardSx}>
            <Stack gap="12px">
              <Typography sx={sectionTitleSx}>Guardrail detection logs</Typography>
              <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
                Every blocked or masked request across all endpoints for the last 30 days.
              </Typography>

              {grLoading ? (
                <Typography sx={{ fontSize: 13, color: palette.text.tertiary, py: "16px" }}>Loading...</Typography>
              ) : grLogs.length === 0 ? (
                <Typography sx={{ fontSize: 13, color: palette.text.tertiary, py: "16px" }}>No guardrail detections in this period.</Typography>
              ) : (
                <Stack>
                  {/* Header */}
                  <Stack direction="row" sx={{ p: "8px 0", borderBottom: `1px solid ${palette.border.light}` }}>
                    <Typography sx={{ flex: 0.8, fontSize: 11, fontWeight: 600, color: palette.text.tertiary }}>TIME</Typography>
                    <Typography sx={{ flex: 0.7, fontSize: 11, fontWeight: 600, color: palette.text.tertiary }}>TYPE</Typography>
                    <Typography sx={{ flex: 0.6, fontSize: 11, fontWeight: 600, color: palette.text.tertiary }}>ACTION</Typography>
                    <Typography sx={{ flex: 1, fontSize: 11, fontWeight: 600, color: palette.text.tertiary }}>ENTITY</Typography>
                    <Typography sx={{ flex: 1.2, fontSize: 11, fontWeight: 600, color: palette.text.tertiary }}>MATCHED</Typography>
                    <Typography sx={{ flex: 0.8, fontSize: 11, fontWeight: 600, color: palette.text.tertiary }}>ENDPOINT</Typography>
                    <Typography sx={{ flex: 0.5, fontSize: 11, fontWeight: 600, color: palette.text.tertiary }}>RULE</Typography>
                  </Stack>

                  {/* Rows */}
                  {grLogs.map((log: any) => (
                    <Stack
                      key={log.id}
                      direction="row"
                      alignItems="center"
                      sx={{
                        p: "6px 0",
                        borderBottom: `1px solid ${palette.border.light}`,
                        "&:last-child": { borderBottom: "none" },
                      }}
                    >
                      <Typography sx={{ flex: 0.8, fontSize: 12, color: palette.text.tertiary }}>
                        {new Date(log.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </Typography>
                      <Typography sx={{ flex: 0.7, fontSize: 12 }}>
                        {log.guardrail_type === "pii" ? "PII" : "Filter"}
                      </Typography>
                      <Box sx={{ flex: 0.6 }}>
                        <Chip label={log.action_taken === "blocked" ? "Blocked" : "Masked"} size="small" />
                      </Box>
                      <Typography sx={{ flex: 1, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {formatEntityType(log.entity_type)}
                      </Typography>
                      <Typography sx={{ flex: 1.2, fontSize: 11, fontFamily: "monospace", color: palette.text.tertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {log.matched_text || "—"}
                      </Typography>
                      <Typography sx={{ flex: 0.8, fontSize: 12, color: palette.text.tertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {log.endpoint_name || "—"}
                      </Typography>
                      <Typography sx={{ flex: 0.5, fontSize: 12, color: palette.text.tertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {log.rule_name || "—"}
                      </Typography>
                    </Stack>
                  ))}

                  {/* Pagination */}
                  <Table>
                    <TableBody>
                      <TableRow>
                        <TablePagination
                          count={grTotal}
                          page={grPage}
                          onPageChange={(_, newPage) => setGrPage(newPage)}
                          rowsPerPage={grRowsPerPage}
                          rowsPerPageOptions={[10, 25, 50]}
                          onRowsPerPageChange={(e) => {
                            const rpp = parseInt(e.target.value, 10);
                            setGrRowsPerPage(rpp);
                            setGrPage(0);
                            setPaginationRowCount("aiGatewayGuardrailLogs", rpp);
                          }}
                          ActionsComponent={(props) => <TablePaginationActions {...props} />}
                          labelRowsPerPage="Rows per page"
                          labelDisplayedRows={({ page, count }) =>
                            `Page ${page + 1} of ${Math.max(1, Math.ceil(count / grRowsPerPage))}`
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
                              inputProps: { id: "gr-pagination-dropdown" },
                              IconComponent: () => <ChevronsUpDown size={16} />,
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
                            backgroundColor: theme.palette.grey[50],
                            border: `1px solid ${theme.palette.border.light}`,
                            borderTop: "none",
                            borderRadius: `0 0 ${theme.shape.borderRadius}px ${theme.shape.borderRadius}px`,
                            color: theme.palette.text.secondary,
                            height: "50px",
                            minHeight: "50px",
                            "& .MuiTablePagination-toolbar": {
                              minHeight: "50px",
                              paddingTop: "4px",
                              paddingBottom: "4px",
                            },
                            "& .MuiSelect-icon": {
                              width: "24px",
                              height: "fit-content",
                            },
                            "& .MuiSelect-select": {
                              width: theme.spacing(10),
                              borderRadius: theme.shape.borderRadius,
                              border: `1px solid ${theme.palette.border.light}`,
                            },
                          }}
                        />
                      </TableRow>
                    </TableBody>
                  </Table>
                </Stack>
              )}
            </Stack>
          </Box>
        )}
        </Box>
      </TabContext>
    </PageHeaderExtended>
  );
}
