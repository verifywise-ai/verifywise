import { useState, useEffect, useCallback } from "react";
import { Box, Typography, Stack } from "@mui/material";
import {
  Activity,
  AlertTriangle,
  Clock,
  Wrench,
  BarChart3,
  Info,
  RotateCcw,
  SearchX,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { chartTooltipStyle } from "../../../components/Charts/chartEnhancements";
import Select from "../../../components/Inputs/Select";
import Field from "../../../components/Inputs/Field";
import Chip from "../../../components/Chip";
import { StatCard } from "../../../components/Cards/StatCard";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { EmptyState } from "../../../components/EmptyState";
import EmptyStateTip from "../../../components/EmptyState/EmptyStateTip";
import { Tooltip as MuiTooltip } from "@mui/material";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import palette from "../../../themes/palette";
import { sectionTitleSx, useCardSx, MCP_STATUS_COLORS, MCP_STATUS_FALLBACK } from "../shared";
import CustomizableSkeleton from "../../../components/Skeletons";
import MCPTable from "../MCPTable";
import MCPInvocationDrawer from "../MCPInvocationDrawer";
import { displayFormattedDate } from "../../../tools/isoDateToString";

interface AuditLog {
  id: number;
  agent_key_id: number;
  agent_key_name?: string;
  key_name?: string;
  tool_name: string;
  result_status: string;
  result_summary: string | null;
  is_error: boolean;
  latency_ms: number;
  created_at: string;
}

interface AuditStats {
  total_calls: number;
  error_count: number;
  avg_latency_ms: number;
  unique_tools: number;
  unique_agents: number;
}

const PERIOD_ITEMS = [
  { _id: "7", name: "Last 7 days" },
  { _id: "14", name: "Last 14 days" },
  { _id: "30", name: "Last 30 days" },
];

const STATUS_ITEMS = [
  { _id: "all", name: "All statuses" },
  { _id: "success", name: "Success" },
  { _id: "error", name: "Error" },
  { _id: "blocked", name: "Blocked" },
  { _id: "rate_limited", name: "Rate limited" },
];

const PAGE_SIZE = 20;

export default function MCPAuditLogPage() {
  const cardSx = useCardSx();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [toolStats, setToolStats] = useState<
    { tool_name: string; count: number; avg_latency_ms: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [days, setDays] = useState("7");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterTool, setFilterTool] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [drawerLogId, setDrawerLogId] = useState<number | null>(null);

  const loadStats = useCallback(async () => {
    setLoadError(null);
    try {
      const [statsRes, toolRes] = await Promise.all([
        apiServices.get<Record<string, any>>(`/ai-gateway/mcp/audit/stats?days=${days}`),
        apiServices.get<Record<string, any>>(`/ai-gateway/mcp/audit/stats/by-tool?days=${days}`),
      ]);
      setStats(statsRes?.data?.data || null);
      const allTools = toolRes?.data?.data || [];
      setToolStats(allTools.sort((a: any, b: any) => b.count - a.count).slice(0, 10));
    } catch {
      setLoadError("Failed to load audit activity. Please try again.");
    }
  }, [days]);

  const loadLogs = useCallback(
    async (pageNum: number) => {
      setLoadError(null);
      try {
        const newOffset = (pageNum - 1) * PAGE_SIZE;
        let url = `/ai-gateway/mcp/audit/logs?limit=${PAGE_SIZE}&offset=${newOffset}`;
        if (filterTool) url += `&tool_name=${encodeURIComponent(filterTool)}`;
        if (filterStatus !== "all") url += `&result_status=${filterStatus}`;

        const res = await apiServices.get<Record<string, any>>(url);
        const data: AuditLog[] = res?.data?.data || [];
        const totalCount = res?.data?.total ?? data.length;
        setLogs(data);
        setTotal(totalCount);
      } catch {
        setLoadError("Failed to load audit logs. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [filterTool, filterStatus],
  );

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    setLoading(true);
    setPage(1);
    loadLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterTool, filterStatus]);

  useEffect(() => {
    setLoading(true);
    loadLogs(page);
  }, [page, loadLogs]);

  const isFirstTime = !loading && logs.length === 0 && !stats?.total_calls;
  const noFilterResults = !loading && logs.length === 0 && !isFirstTime;

  return (
    <PageHeaderExtended
      title="Activity"
      description="Every tool call your AI agents make, MCP tools and native tools like Bash, with outcome, latency and which agent."
      helpArticlePath="ai-gateway/mcp-audit"
      actionButton={
        <Box sx={{ width: 160 }}>
          <Select
            id="mcp-audit-period"
            items={PERIOD_ITEMS}
            value={days}
            onChange={(e) => setDays(e.target.value as string)}
          />
        </Box>
      }
    >
      {loading ? (
        <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
      ) : loadError ? (
        <EmptyState icon={AlertTriangle} message={loadError}>
          <CustomizableButton
            variant="outlined"
            text="Retry"
            icon={<RotateCcw size={16} />}
            onClick={() => {
              loadStats();
              setPage(1);
              loadLogs(1);
            }}
          />
        </EmptyState>
      ) : isFirstTime ? (
        <Box sx={{ px: 3, pt: 4 }}>
          <EmptyState icon={Activity} message="No audit logs yet" showBorder>
            <EmptyStateTip
              icon={Activity}
              title="How to generate audit logs"
              description="Make tool calls through the MCP Gateway using an agent key at POST /v1/mcp with the tools/call method."
            />
          </EmptyState>
        </Box>
      ) : (
        <>
          {stats && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "16px",
                px: 3,
                pt: 2.5,
              }}
            >
              <StatCard
                title="Total Calls"
                value={stats.total_calls}
                Icon={BarChart3}
                tooltip="Total tool invocations in the selected period"
              />
              <StatCard
                title="Error Rate"
                value={
                  stats.total_calls > 0
                    ? `${((stats.error_count / stats.total_calls) * 100).toFixed(1)}%`
                    : "0%"
                }
                Icon={AlertTriangle}
                highlight={stats.error_count > 0}
                tooltip="Percentage of tool calls that failed"
              />
              <StatCard
                title="Avg Latency"
                value={`${Math.round(stats.avg_latency_ms || 0)}ms`}
                Icon={Clock}
                tooltip="Average round-trip time for tool calls"
              />
              <StatCard
                title="Unique Tools"
                value={stats.unique_tools}
                Icon={Wrench}
                tooltip="Number of distinct tools called"
              />
            </Box>
          )}

          {toolStats.length > 0 && (
            <Stack direction={{ xs: "column", md: "row" }} gap="16px" sx={{ px: 3, pt: 2 }}>
              <Box sx={{ ...cardSx, flex: 1 }}>
                <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
                  <Typography sx={sectionTitleSx}>Top 10 tools by calls</Typography>
                  <MuiTooltip
                    title="Most frequently invoked tools in the selected period, ranked by total call count"
                    arrow
                    placement="top"
                  >
                    <Box sx={{ display: "flex", alignItems: "center", cursor: "help" }}>
                      <Info size={14} color={palette.text.disabled} />
                    </Box>
                  </MuiTooltip>
                </Stack>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={toolStats} barSize={32} layout="horizontal">
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                    <XAxis
                      dataKey="tool_name"
                      tick={{ fontSize: 11, fill: "#888" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#888" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Bar dataKey="count" name="Calls" fill="#5C8A7D" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
              <Box sx={{ ...cardSx, flex: 1 }}>
                <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
                  <Typography sx={sectionTitleSx}>Avg latency, top 10 tools</Typography>
                  <MuiTooltip
                    title="Average round-trip time per tool call, useful for spotting slow tools"
                    arrow
                    placement="top"
                  >
                    <Box sx={{ display: "flex", alignItems: "center", cursor: "help" }}>
                      <Info size={14} color={palette.text.disabled} />
                    </Box>
                  </MuiTooltip>
                </Stack>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={toolStats} barSize={32} layout="horizontal">
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                    <XAxis
                      dataKey="tool_name"
                      tick={{ fontSize: 11, fill: "#888" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#888" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${v}ms`}
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(value) => [`${Math.round(Number(value))}ms`, "Avg Latency"]}
                    />
                    <Bar
                      dataKey="avg_latency_ms"
                      name="Avg Latency"
                      fill="#7986CB"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Stack>
          )}

          <Stack direction="row" spacing={2} sx={{ px: 3, pt: 3, pb: 1.5 }} alignItems="flex-end">
            <Box sx={{ width: 240 }}>
              <Field
                label="Filter by tool"
                placeholder="e.g. greet"
                value={filterTool}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilterTool(e.target.value)}
              />
            </Box>
            <Box sx={{ width: 180 }}>
              <Select
                id="mcp-audit-status-filter"
                label="Status"
                items={STATUS_ITEMS}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as string)}
              />
            </Box>
          </Stack>

          <Typography sx={{ ...sectionTitleSx, px: 3, pt: 2, pb: 1 }}>Recent tool calls</Typography>

          <Stack spacing={1.5} sx={{ px: 3, pb: 3 }}>
            {noFilterResults ? (
              <EmptyState
                icon={SearchX}
                message="No results matching the current filters."
                showBorder={false}
              />
            ) : (
              <>
                <MCPTable
                  id="mcp-audit-table"
                  columns={[
                    { label: "Tool", width: 160 },
                    { label: "Status", width: 120 },
                    { label: "Latency", width: 90, align: "right" },
                    { label: "Summary" },
                    { label: "Agent key", width: 160 },
                    { label: "Time", width: 160 },
                  ]}
                  rows={logs}
                  rowKey={(log) => log.id}
                  onRowClick={(log) => setDrawerLogId(log.id)}
                  renderRow={(log) => {
                    const colors = MCP_STATUS_COLORS[log.result_status] || MCP_STATUS_FALLBACK;
                    return [
                      <Typography sx={{ fontSize: 13, fontFamily: "monospace", fontWeight: 600 }}>
                        {log.tool_name}
                      </Typography>,
                      <Chip
                        label={log.result_status.replace("_", " ")}
                        backgroundColor={colors.bg}
                        textColor={colors.text}
                      />,
                      <Typography variant="body2" color="text.secondary">
                        {log.latency_ms}ms
                      </Typography>,
                      <Typography variant="body2" color="text.secondary">
                        {log.result_summary || "—"}
                      </Typography>,
                      <Typography variant="body2" color="text.tertiary" sx={{ fontSize: 12 }}>
                        {log.agent_key_name || log.key_name || `Key #${log.agent_key_id}`}
                      </Typography>,
                      <Typography color="text.disabled" sx={{ fontSize: 12 }}>
                        {displayFormattedDate(log.created_at)}
                      </Typography>,
                    ];
                  }}
                />
                {total > 0 && (
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ pt: 2 }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      Showing {(page - 1) * PAGE_SIZE + 1}&ndash;{Math.min(page * PAGE_SIZE, total)}{" "}
                      of {total}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <CustomizableButton
                        text="Previous"
                        onClick={() => setPage((p) => p - 1)}
                        variant="outlined"
                        disabled={page <= 1}
                      />
                      <CustomizableButton
                        text="Next"
                        onClick={() => setPage((p) => p + 1)}
                        variant="outlined"
                        disabled={page * PAGE_SIZE >= total}
                      />
                    </Stack>
                  </Stack>
                )}
              </>
            )}
          </Stack>
        </>
      )}

      <MCPInvocationDrawer
        logId={drawerLogId}
        open={drawerLogId !== null}
        onClose={() => setDrawerLogId(null)}
      />
    </PageHeaderExtended>
  );
}
