import { Box, Drawer, Typography, Stack, IconButton, Divider } from "@mui/material";
import { X } from "lucide-react";
import { useState, useEffect } from "react";
import Chip from "../../components/Chip";
import { EmptyState } from "../../components/EmptyState";
import { apiServices } from "../../../infrastructure/api/networkServices";
import palette from "../../themes/palette";
import CustomizableSkeleton from "../../components/Skeletons";
import { MCP_STATUS_COLORS, MCP_STATUS_FALLBACK } from "./shared";
import { displayFormattedDate } from "../../tools/isoDateToString";

interface AgentActivityDrawerProps {
  agentKeyId: number | null;
  agentKeyName?: string | null;
  open: boolean;
  onClose: () => void;
}

interface ActivitySummary {
  total_calls: number;
  denied: number;
  approvals: number;
  errors: number;
  unique_tools: number;
  runs: number;
  avg_latency_ms: number;
  last_active: string | null;
}

interface ToolRow {
  tool_name: string;
  count: number;
  denied: number;
}

interface RecentRow {
  id: number;
  tool_name: string;
  result_status: string;
  matched_rule_name: string | null;
  latency_ms: number | null;
  created_at: string;
}

interface AgentActivity {
  summary: ActivitySummary;
  by_tool: ToolRow[];
  recent: RecentRow[];
}

const labelSx = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.04em",
  color: palette.text.tertiary,
  mb: "6px",
};

/** A single summary metric tile. */
function StatTile({
  label,
  value,
  danger,
}: {
  label: string;
  value: number | string;
  danger?: boolean;
}) {
  return (
    <Box
      sx={{
        flex: "1 1 0",
        minWidth: 96,
        p: "12px",
        borderRadius: "4px",
        border: `1px solid ${palette.border.light}`,
        backgroundColor: palette.background.main,
      }}
    >
      <Typography
        sx={{
          fontSize: 22,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: danger && value !== 0 ? palette.status.error.text : palette.text.primary,
        }}
      >
        {value}
      </Typography>
      <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>{label}</Typography>
    </Box>
  );
}

/**
 * Per-agent activity view: everything one agent has been doing (summary metrics,
 * per-tool breakdown, and its most recent tool calls with decision provenance).
 */
export default function AgentActivityDrawer({
  agentKeyId,
  agentKeyName,
  open,
  onClose,
}: AgentActivityDrawerProps) {
  const [data, setData] = useState<AgentActivity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || !agentKeyId) return;
    setData(null);
    setError(false);
    setLoading(true);
    apiServices
      .get<Record<string, any>>(`/ai-gateway/mcp/audit/agent/${agentKeyId}`)
      .then((res) => setData(res?.data?.data || null))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open, agentKeyId]);

  const s = data?.summary;

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 520, maxWidth: "100vw", p: "24px" }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb="4px">
          <Typography sx={{ fontSize: 16, fontWeight: 600 }}>Agent activity</Typography>
          <IconButton size="small" onClick={onClose} aria-label="Close">
            <X size={16} />
          </IconButton>
        </Stack>
        <Typography sx={{ fontSize: 13, color: palette.text.tertiary, mb: "20px" }}>
          {(agentKeyName || "This agent") + " · last 30 days"}
        </Typography>

        {loading ? (
          <CustomizableSkeleton variant="rectangular" width="100%" height={360} />
        ) : error ? (
          <EmptyState icon={X} message="Failed to load agent activity" />
        ) : !s || s.total_calls === 0 ? (
          <EmptyState icon={X} message="No activity recorded for this agent yet" />
        ) : (
          <Stack gap="24px">
            {/* Summary tiles */}
            <Stack direction="row" flexWrap="wrap" gap="8px">
              <StatTile label="Tool calls" value={s.total_calls} />
              <StatTile label="Runs" value={s.runs} />
              <StatTile label="Denied" value={s.denied} danger />
              <StatTile label="Approvals" value={s.approvals} />
              <StatTile label="Tools used" value={s.unique_tools} />
              <StatTile label="Avg latency" value={`${s.avg_latency_ms} ms`} />
            </Stack>

            <Divider />

            {/* Per-tool breakdown */}
            <Box>
              <Typography sx={labelSx}>TOOLS USED</Typography>
              <Stack gap="6px">
                {data!.by_tool.map((t) => (
                  <Stack
                    key={t.tool_name}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{
                      p: "8px 12px",
                      borderRadius: "4px",
                      border: `1px solid ${palette.border.light}`,
                    }}
                  >
                    <Typography sx={{ fontSize: 13, fontFamily: "monospace" }}>
                      {t.tool_name}
                    </Typography>
                    <Stack direction="row" gap="8px" alignItems="center">
                      <Typography
                        sx={{
                          fontSize: 13,
                          fontVariantNumeric: "tabular-nums",
                          color: palette.text.tertiary,
                        }}
                      >
                        {t.count} calls
                      </Typography>
                      {t.denied > 0 && (
                        <Chip
                          label={`${t.denied} denied`}
                          backgroundColor={palette.status.error.bg}
                          textColor={palette.status.error.text}
                        />
                      )}
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            </Box>

            <Divider />

            {/* Recent calls with provenance */}
            <Box>
              <Typography sx={labelSx}>RECENT ACTIVITY</Typography>
              <Stack gap="6px">
                {data!.recent.map((r) => {
                  const colors = MCP_STATUS_COLORS[r.result_status] || MCP_STATUS_FALLBACK;
                  return (
                    <Box
                      key={r.id}
                      sx={{
                        p: "8px 12px",
                        borderRadius: "4px",
                        border: `1px solid ${palette.border.light}`,
                      }}
                    >
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        gap="8px"
                      >
                        <Typography sx={{ fontSize: 13, fontFamily: "monospace" }}>
                          {r.tool_name}
                        </Typography>
                        <Chip
                          label={r.result_status}
                          backgroundColor={colors.bg}
                          textColor={colors.text}
                        />
                      </Stack>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        mt="2px"
                      >
                        <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>
                          {displayFormattedDate(r.created_at)}
                        </Typography>
                        {r.matched_rule_name && (
                          <Typography
                            sx={{
                              fontSize: 11,
                              color: palette.status.warning.text,
                              fontWeight: 600,
                            }}
                          >
                            rule: {r.matched_rule_name}
                          </Typography>
                        )}
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          </Stack>
        )}
      </Box>
    </Drawer>
  );
}
