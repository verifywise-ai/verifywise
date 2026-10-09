import { Box, Drawer, Typography, Stack, IconButton, Divider } from "@mui/material";
import { X, Activity, PlayCircle, ShieldX, UserCheck, AlertTriangle, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import Chip from "../../components/Chip";
import { StatCard } from "../../components/Cards/StatCard";
import { EmptyState } from "../../components/EmptyState";
import { apiServices } from "../../../infrastructure/api/networkServices";
import palette from "../../themes/palette";
import CustomizableSkeleton from "../../components/Skeletons";
import { MCP_STATUS_COLORS, MCP_STATUS_FALLBACK, formatMcpStatus } from "./shared";
import useFormattedDate from "../../../application/hooks/useFormattedDate";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { fill } from "../../../i18n/fill";

// The activity window, sent with the request and shown in the subtitle.
const ACTIVITY_DAYS = 30;

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
  const formatDate = useFormattedDate();
  const { t: tr } = useTranslation();
  const [data, setData] = useState<AgentActivity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || !agentKeyId) return;
    // Ignore a response that arrives after the drawer closed or switched agent.
    let current = true;
    setData(null);
    setError(false);
    setLoading(true);
    apiServices
      .get<Record<string, any>>(`/ai-gateway/mcp/audit/agent/${agentKeyId}`, {
        days: ACTIVITY_DAYS,
      })
      .then((res) => {
        if (current) setData(res?.data?.data || null);
      })
      .catch(() => {
        if (current) setError(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
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
          {fill(tr("{name} · last {days} days"), {
            name: agentKeyName || tr("This agent"),
            days: ACTIVITY_DAYS,
          })}
        </Typography>

        {loading ? (
          <CustomizableSkeleton variant="rectangular" width="100%" height={360} />
        ) : error ? (
          <EmptyState icon={X} message="Failed to load agent activity" />
        ) : !s || s.total_calls === 0 ? (
          <EmptyState icon={X} message="No activity recorded for this agent yet" />
        ) : (
          <Stack gap="24px">
            {/* Summary */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)" },
                gap: "8px",
              }}
            >
              <StatCard
                title="Tool calls"
                value={s.total_calls}
                Icon={Activity}
                subtitle={
                  s.last_active
                    ? fill(tr("Last active {date}"), { date: formatDate(s.last_active) })
                    : undefined
                }
              />
              <StatCard title="Runs" value={s.runs} Icon={PlayCircle} />
              <StatCard title="Denied" value={s.denied} Icon={ShieldX} highlight={s.denied > 0} />
              <StatCard title="Approvals" value={s.approvals} Icon={UserCheck} />
              <StatCard
                title="Errors"
                value={s.errors}
                Icon={AlertTriangle}
                highlight={s.errors > 0}
              />
              <StatCard title="Avg latency" value={`${s.avg_latency_ms} ms`} Icon={Clock} />
            </Box>

            <Divider />

            {/* Per-tool breakdown */}
            <Box>
              <Typography sx={labelSx}>Tools used</Typography>
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
                        {t.count === 1
                          ? tr("1 call")
                          : fill(tr("{count} calls"), { count: t.count })}
                      </Typography>
                      {t.denied > 0 && (
                        <Chip
                          label={fill(tr("{count} denied"), { count: t.denied })}
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
              <Typography sx={labelSx}>Recent activity</Typography>
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
                          label={formatMcpStatus(r.result_status)}
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
                          {formatDate(r.created_at)}
                        </Typography>
                        {r.matched_rule_name && (
                          <Typography
                            sx={{
                              fontSize: 11,
                              color: palette.status.warning.text,
                              fontWeight: 600,
                            }}
                          >
                            {fill(tr("Rule: {name}"), { name: r.matched_rule_name })}
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
