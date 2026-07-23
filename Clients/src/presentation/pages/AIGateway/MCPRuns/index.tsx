import { useEffect, useState, useCallback } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { Activity, AlertTriangle, RotateCcw, Wrench } from "lucide-react";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import MCPTable, { MCPTableColumn } from "../MCPTable";
import { EmptyState } from "../../../components/EmptyState";
import RunDetailDrawer from "./RunDetailDrawer";
import palette from "../../../themes/palette";
import { CustomizableButton } from "../../../components/button/customizable-button";
import CustomizableSkeleton from "../../../components/Skeletons";
import Select from "../../../components/Inputs/Select";
import { StatCard } from "../../../components/Cards/StatCard";

interface RunRow {
  agent_run_id: string;
  agent_key_name: string | null;
  model_count: number;
  tool_count: number;
  denied_count: number;
  total_tokens: number;
  total_cost: number;
  started_at: string;
  last_at: string;
}

interface RunStats {
  total_runs: number;
  avg_tool_calls_per_run: number;
  pct_runs_with_block: number;
}

const PERIOD_ITEMS = [
  { _id: "7", name: "Last 7 days" },
  { _id: "14", name: "Last 14 days" },
  { _id: "30", name: "Last 30 days" },
];

const RUNS_LIMIT = 50;

const COLUMNS: MCPTableColumn[] = [
  { label: "Run" },
  { label: "Agent" },
  { label: "Started" },
  { label: "Model calls", align: "right" },
  { label: "Tool calls", align: "right" },
  { label: "Denied", align: "right" },
];

export default function MCPRuns() {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [days, setDays] = useState("7");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiServices.get<Record<string, any>>(
        `/ai-gateway/mcp/runs?limit=${RUNS_LIMIT}&offset=0`,
      );
      setRows(res?.data?.data ?? []);
    } catch {
      setLoadError("Failed to load agent runs. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadStats = useCallback(async () => {
    try {
      const res = await apiServices.get<Record<string, any>>(
        `/ai-gateway/mcp/runs/stats?days=${days}`,
      );
      setStats(res?.data?.data ?? null);
    } catch {
      setStats(null);
    }
  }, [days]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return (
    <PageHeaderExtended
      title="Runs"
      description="Reconstruct a full agent turn: the model calls (the conversation) and tool calls (the actions) correlated into one run."
      helpArticlePath="ai-gateway/mcp-runs"
    >
      <Box sx={{ px: 3, pt: 2 }}>
        <Stack direction="row" sx={{ justifyContent: "flex-end", mb: "16px" }}>
          <Box sx={{ width: 180 }}>
            <Select
              id="runs-period"
              value={days}
              items={PERIOD_ITEMS}
              onChange={(e) => setDays(e.target.value as string)}
            />
          </Box>
        </Stack>
        {stats && (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "16px",
              mb: "16px",
            }}
          >
            <StatCard
              title="Total runs"
              value={stats.total_runs}
              Icon={Activity}
              tooltip="Distinct agent runs in the selected period"
            />
            <StatCard
              title="Avg tool calls / run"
              value={stats.avg_tool_calls_per_run}
              Icon={Wrench}
              tooltip="Mean number of tool calls per run"
            />
            <StatCard
              title="Runs with a block"
              value={`${stats.pct_runs_with_block}%`}
              Icon={AlertTriangle}
              highlight={stats.pct_runs_with_block > 0}
              tooltip="Share of runs where at least one tool call was blocked by a policy or guardrail"
            />
          </Box>
        )}
        {loading ? (
          <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
        ) : loadError ? (
          <EmptyState icon={AlertTriangle} message={loadError}>
            <CustomizableButton
              variant="outlined"
              text="Retry"
              icon={<RotateCcw size={16} />}
              onClick={load}
            />
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState icon={Activity} message="No agent runs yet" showBorder>
            <Typography variant="body2">
              Runs appear when an agent sends the same run id (header <code>x-vw-agent-run-id</code>{" "}
              on model calls, or the session id on tool calls).
            </Typography>
          </EmptyState>
        ) : (
          <Stack sx={{ gap: "16px" }}>
            <MCPTable<RunRow>
              id="mcp-runs-table"
              columns={COLUMNS}
              rows={rows}
              rowKey={(r) => r.agent_run_id}
              onRowClick={(r) => setSelected(r.agent_run_id)}
              renderRow={(r) => [
                r.agent_run_id.slice(0, 12) + "…",
                r.agent_key_name ?? "—",
                new Date(r.started_at).toLocaleString(),
                r.model_count,
                r.tool_count,
                r.denied_count || "—",
              ]}
            />
            {rows.length >= RUNS_LIMIT && (
              <Typography variant="caption" sx={{ color: palette.text.tertiary }}>
                Showing the most recent 50 runs.
              </Typography>
            )}
          </Stack>
        )}
      </Box>
      {selected && <RunDetailDrawer runId={selected} onClose={() => setSelected(null)} />}
    </PageHeaderExtended>
  );
}
