import { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Typography, Stack } from "@mui/material";
import { DollarSign, Hash, Layers, Clock, BarChart3, Router, Users, ShieldCheck, ShieldOff, Info, Zap, BadgeDollarSign } from "lucide-react";
import { Tooltip as MuiTooltip } from "@mui/material";
import Select from "../../../components/Inputs/Select";
import { StatCard } from "../../../components/Cards/StatCard";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
} from "recharts";
import {
  GradientDef,
  DonutCenterLabel,
  chartTooltipStyle,
  getProviderColor,
} from "../../../components/Charts/chartEnhancements";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { EmptyState } from "../../../components/EmptyState";
import EmptyStateTip from "../../../components/EmptyState/EmptyStateTip";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import palette, { chart as chartPalette } from "../../../themes/palette";
import { sectionTitleSx, useCardSx, GUARDRAIL_ACTION_COLORS, formatEntityType } from "../shared";
import { useUserGuideSidebarContext } from "../../../components/UserGuide/UserGuideSidebarContext";
import MockDashboard from "./MockDashboard";
import OnboardingOverlay from "./OnboardingOverlay";

/** Shared date tick formatter for all time-series charts */
const formatDayTick = (v: string, period: string) => {
  if (period === "1d") return v;
  const d = new Date(v + "T00:00:00");
  return isNaN(d.getTime()) ? v : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const PERIOD_OPTIONS = [
  { _id: "1d", name: "Last 24 hours" },
  { _id: "7d", name: "7 days" },
  { _id: "30d", name: "30 days" },
  { _id: "90d", name: "90 days" },
];

export default function SpendDashboardPage() {
  const cardSx = useCardSx();
  const userGuideSidebar = useUserGuideSidebarContext();
  const [period, setPeriod] = useState(() => {
    return localStorage.getItem("vw_ai_gateway_analytics_period") || "1d";
  });
  const [data, setData] = useState<any>(null);
  const [byEndpoint, setByEndpoint] = useState<any[]>([]);
  const [byUser, setByUser] = useState<any[]>([]);
  const [guardrailStats, setGuardrailStats] = useState<any>(null);
  const [cacheStats, setCacheStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isFirstTime, setIsFirstTime] = useState<boolean | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [setupStatus, setSetupStatus] = useState({
    hasApiKey: false,
    hasEndpoint: false,
    hasVirtualKey: false,
    hasRequests: false,
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Check first-time status before loading period-based data
        const logsCheck = await apiServices.get<Record<string, any>>("/ai-gateway/spend/logs?limit=1").catch(() => null);
        const totalLogs = logsCheck?.data?.total || 0;
        if (totalLogs === 0) {
          const [keysRes, endpointsRes, vkeysRes] = await Promise.all([
            apiServices.get<Record<string, any>>("/ai-gateway/keys").catch(() => null),
            apiServices.get<Record<string, any>>("/ai-gateway/endpoints").catch(() => null),
            apiServices.get<Record<string, any>>("/ai-gateway/virtual-keys").catch(() => null),
          ]);
          setSetupStatus({
            hasApiKey: (keysRes?.data?.data || []).length > 0,
            hasEndpoint: (endpointsRes?.data?.endpoints || []).length > 0,
            hasVirtualKey: (vkeysRes?.data?.data || []).length > 0,
            hasRequests: false,
          });
          setIsFirstTime(true);
          setLoading(false);
          return;
        }
        setIsFirstTime(false);

        const [spendRes, endpointRes, userRes, gsRes, cacheRes] = await Promise.all([
          apiServices.get<Record<string, any>>(`/ai-gateway/spend?period=${period}`),
          apiServices.get<Record<string, any>>(`/ai-gateway/spend/by-endpoint?period=${period}`).catch(() => null),
          apiServices.get<Record<string, any>>(`/ai-gateway/spend/by-user?period=${period}`).catch(() => null),
          apiServices.get<Record<string, any>>(`/ai-gateway/guardrails/stats?period=${period}`).catch(() => null),
          apiServices.get<Record<string, any>>("/ai-gateway/cache/stats").catch(() => null),
        ]);
        setData(spendRes?.data || null);
        setByEndpoint((endpointRes?.data?.data || []).map((d: any) => ({ ...d, group_key: d.group_key || d.endpoint_name })));
        setByUser((userRes?.data?.data || []).map((d: any) => ({ ...d, group_key: d.group_key || d.user_name })));
        // Map Python guardrail stats field names to frontend expectations
        const rawGs = gsRes?.data || null;
        if (rawGs) {
          const mapped: any = { ...rawGs };
          if (rawGs.summary) {
            mapped.summary = {
              ...rawGs.summary,
              blocked_count: rawGs.summary.blocked_count ?? rawGs.summary.blocked ?? 0,
              masked_count: rawGs.summary.masked_count ?? rawGs.summary.masked ?? 0,
              total_checks: rawGs.summary.total_checks ?? rawGs.summary.total ?? 0,
            };
          }
          if (!rawGs.topDetections && rawGs.byType) {
            mapped.topDetections = rawGs.byType.map((d: any) => ({
              ...d,
              entity_type: d.entity_type || d.guardrail_type,
            }));
          }
          setGuardrailStats(mapped);
        } else {
          setGuardrailStats(null);
        }
        setCacheStats(cacheRes?.data?.stats || null);
      } catch {
        setData(null);
        setIsFirstTime(false);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [period, reloadKey]);

  const summary = data?.summary;
  // Python returns snake_case keys; charts expect camelCase / specific field names
  const byDay = useMemo(() => (data?.by_day || data?.byDay || []).map((d: any) => ({ ...d, day: d.day || d.period })), [data]);
  const byModel = useMemo(() => (data?.by_model || data?.byModel || []).map((d: any) => ({ ...d, group_key: d.group_key || d.model })), [data]);
  const byProvider = useMemo(() => (data?.by_provider || data?.byProvider || []).map((d: any) => ({ ...d, group_key: d.group_key || d.provider })), [data]);
  const errorRateByDay = useMemo(() => data?.error_rate_by_day || data?.errorRateByDay || [], [data]);
  const tokensPerEndpoint = useMemo(() => (data?.tokens_per_endpoint || data?.tokensPerEndpoint || []).map((d: any) => ({
    ...d,
    endpoint: d.endpoint || d.endpoint_name,
    avg_prompt_tokens: d.avg_prompt_tokens ?? d.avg_tokens_per_request ?? 0,
    avg_completion_tokens: d.avg_completion_tokens ?? 0,
  })), [data]);

  const totalCost = summary ? `$${Number(summary.total_cost).toFixed(4)}` : "$0.00";
  const totalRequests = String(summary?.total_requests ?? 0);
  const totalTokens = summary ? Number(summary.total_tokens).toLocaleString() : "0";
  const avgLatency = summary ? `${Math.round(summary.avg_latency_ms || 0)}ms` : "0ms";

  const hasData = byDay.length > 0 || byModel.length > 0 || byEndpoint.length > 0 || (summary?.total_requests > 0);

  const refreshSetupStatus = useCallback(async () => {
    const [keysRes, endpointsRes, vkeysRes, logsCheck] = await Promise.all([
      apiServices.get<Record<string, any>>("/ai-gateway/keys").catch(() => null),
      apiServices.get<Record<string, any>>("/ai-gateway/endpoints").catch(() => null),
      apiServices.get<Record<string, any>>("/ai-gateway/virtual-keys").catch(() => null),
      apiServices.get<Record<string, any>>("/ai-gateway/spend/logs?limit=1").catch(() => null),
    ]);
    const newStatus = {
      hasApiKey: (keysRes?.data?.data || []).length > 0,
      hasEndpoint: (endpointsRes?.data?.endpoints || []).length > 0,
      hasVirtualKey: (vkeysRes?.data?.data || []).length > 0,
      hasRequests: (logsCheck?.data?.total || 0) > 0,
    };
    setSetupStatus(newStatus);
    if (newStatus.hasRequests) {
      setIsFirstTime(false);
      setReloadKey((k) => k + 1);
    }
  }, []);

  if (isFirstTime === true) {
    return (
      <PageHeaderExtended
        title="Dashboard"
        description="Monitor LLM usage and costs across your organization."
        tipBoxEntity="ai-gateway-dashboard"
        helpArticlePath="ai-gateway/dashboard"
      >
        <Box sx={{ position: "relative", borderRadius: "4px", overflow: "hidden", border: `1.5px dashed ${palette.border.dark}` }}>
          <Box sx={{ filter: "blur(3px)", pointerEvents: "none", userSelect: "none" }}>
            <MockDashboard />
          </Box>
          <OnboardingOverlay
            setupStatus={setupStatus}
            onGetStarted={() => {
              // Clear path first to ensure the effect re-fires even if same path
              userGuideSidebar.close();
              setTimeout(() => userGuideSidebar.open("ai-gateway/getting-started"), 50);
            }}
            onStepCompleted={refreshSetupStatus}
          />
        </Box>
      </PageHeaderExtended>
    );
  }

  return (
    <PageHeaderExtended
      title="Dashboard"
      description="Monitor LLM usage and costs across your organization."
      tipBoxEntity="ai-gateway-dashboard"
      helpArticlePath="ai-gateway/dashboard"
      actionButton={
        <Select
          id="analytics-period"
          value={period}
          items={PERIOD_OPTIONS}
          onChange={(e) => {
            const val = e.target.value as string;
            setPeriod(val);
            localStorage.setItem("vw_ai_gateway_analytics_period", val);
          }}
          sx={{ width: 140 }}
        />
      }
      summaryCards={
        <Box sx={{ display: "grid", gridTemplateColumns: cacheStats?.total_entries > 0 ? "repeat(6, 1fr)" : "repeat(4, 1fr)", gap: "16px" }}>
          <StatCard title="Total cost" value={totalCost} Icon={DollarSign} tooltip="Total spend across all endpoints for this period" />
          <StatCard title="Total requests" value={totalRequests} Icon={Hash} tooltip="Number of completion and embedding requests processed" />
          <StatCard title="Total tokens" value={totalTokens} Icon={Layers} tooltip="Combined prompt and completion tokens across all requests" />
          <StatCard title="Avg latency" value={avgLatency} Icon={Clock} tooltip="Average round-trip time from request to complete response" />
          {cacheStats?.total_entries > 0 && (
            <>
              <StatCard title="Cache hit rate" value={`${cacheStats.hit_rate_pct || 0}%`} Icon={Zap} tooltip="Percentage of requests served from cache — higher means more cost savings" />
              <StatCard title="Cost saved" value={`$${Number(cacheStats.total_cost_saved || 0).toFixed(2)}`} Icon={BadgeDollarSign} tooltip="Money saved by serving cached responses instead of calling the LLM" />
            </>
          )}
        </Box>
      }
    >
      {!loading && !hasData && (
        <EmptyState
          icon={BarChart3}
          message="No analytics data for this period. Send requests through the gateway to see usage and cost breakdowns here."
          showBorder
        >
          <EmptyStateTip
            icon={Router}
            title="Configure endpoints to start tracking"
            description="Create an endpoint in the Endpoints tab and send your first request. Every request is automatically logged with cost, tokens, and latency."
          />
          <EmptyStateTip
            icon={DollarSign}
            title="Cost breakdowns by model and endpoint"
            description="Once requests flow through, you'll see cost-over-time charts, per-model spend comparisons, and endpoint-level breakdowns to help optimize your provider strategy."
          />
          <EmptyStateTip
            icon={Users}
            title="Track usage by team members"
            description="See which users are sending the most requests and consuming the most tokens. Use this to identify training opportunities and allocate budgets effectively."
          />
        </EmptyState>
      )}

      {/* Cost over time chart */}
      {!loading && (
        <Box sx={cardSx}>
          <Stack gap="12px">
            <Stack direction="row" alignItems="center" gap="6px">
              <Typography sx={sectionTitleSx}>{period === "1d" ? "Cost by hour" : "Cost over time"}</Typography>
              <MuiTooltip title={period === "1d" ? "Hourly spend breakdown for today" : "Daily spend trend across all endpoints for the selected period"} arrow placement="top">
                <Box sx={{ display: "flex", cursor: "help" }}><Info size={14} color={palette.text.disabled} /></Box>
              </MuiTooltip>
            </Stack>
            <ResponsiveContainer width="100%" height={260} minWidth={0} style={{ outline: "none" }}>
              <BarChart data={byDay}>
                <defs>
                  <GradientDef id="costBarGradient" color={palette.brand.primary} />
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={palette.border.light} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: palette.text.tertiary }}
                  tickLine={false}
                  axisLine={{ stroke: palette.border.light }}
                  tickFormatter={(v) => formatDayTick(v, period)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: palette.text.tertiary }}
                  tickLine={false}
                  axisLine={{ stroke: palette.border.light }}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => { const v = Number(value) || 0; return [`$${v.toFixed(6)}`, "Cost"]; }} />
                <Bar dataKey="total_cost" fill={palette.brand.primary} fillOpacity={0.75} stroke={palette.brand.primary} strokeWidth={0.5} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Stack>
        </Box>
      )}

      {/* Two-column: Cost by model + Cost per request */}
      {!loading && (
        <Stack direction={{ xs: "column", md: "row" }} gap="16px">
          {/* Cost by model */}
          {(
            <Box sx={{ ...cardSx, flex: 1 }}>
              <Stack gap="12px">
                <Stack direction="row" alignItems="center" gap="6px">
                  <Typography sx={sectionTitleSx}>Cost by model</Typography>
                  <MuiTooltip title="Spend breakdown by LLM model — helps identify which models consume the most budget" arrow placement="top">
                    <Box sx={{ display: "flex", cursor: "help" }}><Info size={14} color={palette.text.disabled} /></Box>
                  </MuiTooltip>
                </Stack>
                <Stack gap="6px" sx={{ maxHeight: 270, overflowY: "auto" }}>
                  {(() => {
                    const maxCost = Math.max(...byModel.map((m: any) => Number(m.total_cost)), 0.000001);
                    return byModel.map((m: any, i: number) => {
                      const pct = (Number(m.total_cost) / maxCost) * 100;
                      return (
                    <Stack
                      key={m.group_key}
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      sx={{
                        p: "22px 14px",
                        borderRadius: "4px",
                        border: `1px solid ${palette.border.light}`,
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      <Box sx={{
                        position: "absolute", left: 0, top: 0, bottom: 0,
                        width: `${pct}%`,
                        backgroundColor: palette.border.light,
                        opacity: 0.4,
                        transition: "width 0.3s",
                      }} />
                      <Stack direction="row" alignItems="center" gap="8px" sx={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
                        <Box
                          sx={{
                            width: 8, height: 8,
                            borderRadius: "50%",
                            backgroundColor: chartPalette[i % chartPalette.length],
                            flexShrink: 0,
                          }}
                        />
                        <Typography sx={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.group_key}
                        </Typography>
                      </Stack>
                      <Stack direction="row" gap="12px" alignItems="center" sx={{ flexShrink: 0, position: "relative", zIndex: 1 }}>
                        <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>
                          {Number(m.total_requests).toLocaleString()} req
                        </Typography>
                        <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>
                          {Number(m.total_tokens).toLocaleString()} tok
                        </Typography>
                        <Typography sx={{ fontSize: 12, fontWeight: 600, minWidth: 70, textAlign: "right" }}>
                          ${Number(m.total_cost).toFixed(4)}
                        </Typography>
                      </Stack>
                    </Stack>
                      );
                    });
                  })()}
                </Stack>
              </Stack>
            </Box>
          )}

          {/* Cost per request by model */}
          {(
            <Box sx={{ ...cardSx, flex: 1 }}>
              <Stack gap="12px">
                <Stack direction="row" alignItems="center" gap="6px">
                  <Typography sx={sectionTitleSx}>Cost per request</Typography>
                  <MuiTooltip title="Average cost per request by model — helps identify which models give the best value per call" arrow placement="top">
                    <Box sx={{ display: "flex", cursor: "help" }}><Info size={14} color={palette.text.disabled} /></Box>
                  </MuiTooltip>
                </Stack>
                <Stack gap="6px" sx={{ maxHeight: 270, overflowY: "auto" }}>
                  {(() => {
                    const modelsWithCpr = byModel
                      .map((m: any) => ({
                        ...m,
                        cost_per_req: Number(m.total_requests) > 0 ? Number(m.total_cost) / Number(m.total_requests) : 0,
                      }))
                      .sort((a: any, b: any) => b.cost_per_req - a.cost_per_req);
                    const maxCpr = Math.max(...modelsWithCpr.map((m: any) => m.cost_per_req), 0.000001);
                    return modelsWithCpr.map((m: any, i: number) => {
                      const pct = (m.cost_per_req / maxCpr) * 100;
                      return (
                        <Stack
                          key={m.group_key}
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                          sx={{
                            p: "22px 14px",
                            borderRadius: "4px",
                            border: `1px solid ${palette.border.light}`,
                            position: "relative",
                            overflow: "hidden",
                          }}
                        >
                          <Box sx={{
                            position: "absolute", left: 0, top: 0, bottom: 0,
                            width: `${pct}%`,
                            backgroundColor: i === modelsWithCpr.length - 1 ? `${palette.brand.primary}15` : palette.border.light,
                            opacity: 0.4,
                            transition: "width 0.3s",
                          }} />
                          <Stack direction="row" alignItems="center" gap="8px" sx={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: chartPalette[i % chartPalette.length], flexShrink: 0 }} />
                            <Typography sx={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {m.group_key}
                            </Typography>
                          </Stack>
                          <Stack direction="row" gap="12px" alignItems="center" sx={{ flexShrink: 0, position: "relative", zIndex: 1 }}>
                            <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>
                              {Number(m.total_requests).toLocaleString()} req
                            </Typography>
                            <Typography sx={{ fontSize: 12, fontWeight: 600, minWidth: 80, textAlign: "right", fontFamily: "monospace" }}>
                              ${m.cost_per_req.toFixed(6)}
                            </Typography>
                          </Stack>
                        </Stack>
                      );
                    });
                  })()}
                </Stack>
              </Stack>
            </Box>
          )}
        </Stack>
      )}

      {/* Error rate + Tokens per request */}
      {!loading && (
        <Stack direction={{ xs: "column", md: "row" }} gap="16px">
          {/* Error rate over time */}
          {(
            <Box sx={{ ...cardSx, flex: 1 }}>
              <Stack gap="12px">
                <Stack direction="row" alignItems="center" gap="6px">
                  <Typography sx={sectionTitleSx}>Error rate</Typography>
                  <MuiTooltip title="Percentage of non-200 responses per day — spikes indicate provider issues or misconfigured endpoints" arrow placement="top">
                    <Box sx={{ display: "flex", cursor: "help" }}><Info size={14} color={palette.text.disabled} /></Box>
                  </MuiTooltip>
                </Stack>
                <ResponsiveContainer width="100%" height={180} minWidth={0} style={{ outline: "none" }}>
                  <AreaChart data={errorRateByDay}>
                    <defs>
                      <GradientDef id="errorGradient" color={GUARDRAIL_ACTION_COLORS.blocked} />
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={palette.border.light} />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: palette.text.tertiary }}
                      tickLine={false}
                      axisLine={{ stroke: palette.border.light }}
                      tickFormatter={(v) => formatDayTick(v, period)}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: palette.text.tertiary }}
                      tickLine={false}
                      axisLine={{ stroke: palette.border.light }}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(value, name) => { const v = Number(value) || 0; const n = String(name ?? ""); return [n === "error_rate" ? `${v}%` : v, n === "error_rate" ? "Error rate" : "Errors"]; }} />
                    <Area type="monotone" dataKey="error_rate" stroke={GUARDRAIL_ACTION_COLORS.blocked} fill="url(#errorGradient)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </Stack>
            </Box>
          )}

          {/* Tokens per request by endpoint */}
          {(
            <Box sx={{ ...cardSx, flex: 1 }}>
              <Stack gap="12px">
                <Stack direction="row" alignItems="center" gap="6px">
                  <Typography sx={sectionTitleSx}>Tokens per request</Typography>
                  <MuiTooltip title="Average token usage per request by endpoint — helps identify chatty prompts or missing max_token limits" arrow placement="top">
                    <Box sx={{ display: "flex", cursor: "help" }}><Info size={14} color={palette.text.disabled} /></Box>
                  </MuiTooltip>
                </Stack>
                <ResponsiveContainer width="100%" height={180} minWidth={0} style={{ outline: "none" }}>
                  <BarChart data={tokensPerEndpoint} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={palette.border.light} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: palette.text.tertiary }}
                      tickLine={false}
                      axisLine={{ stroke: palette.border.light }}
                    />
                    <YAxis
                      type="category"
                      dataKey="endpoint"
                      tick={{ fontSize: 11, fill: palette.text.tertiary }}
                      tickLine={false}
                      axisLine={{ stroke: palette.border.light }}
                      width={120}
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(value, name) => { const v = Number(value) || 0; const n = String(name ?? ""); return [v.toLocaleString(), n === "avg_prompt_tokens" ? "Prompt" : "Completion"]; }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="avg_prompt_tokens" stackId="tokens" fill={chartPalette[0]} radius={[0, 0, 0, 0]} name="Prompt" />
                    <Bar dataKey="avg_completion_tokens" stackId="tokens" fill={chartPalette[1]} radius={[0, 4, 4, 0]} name="Completion" />
                  </BarChart>
                </ResponsiveContainer>
              </Stack>
            </Box>
          )}
        </Stack>
      )}

      {/* Cost by provider + Guardrail detections */}
      {!loading && (
        <Stack direction={{ xs: "column", md: "row" }} gap="16px">
          {/* Cost by provider — donut chart */}
          {(
            <Box sx={{ ...cardSx, flex: 1 }}>
              <Stack gap="12px">
                <Stack direction="row" alignItems="center" gap="6px">
                  <Typography sx={sectionTitleSx}>Cost by provider</Typography>
                  <MuiTooltip title="Spend distribution across LLM providers — high concentration on a single provider increases vendor risk" arrow placement="top">
                    <Box sx={{ display: "flex", cursor: "help" }}><Info size={14} color={palette.text.disabled} /></Box>
                  </MuiTooltip>
                </Stack>
                <Box sx={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <Box sx={{ position: "relative", width: 160, height: 160 }}>
                    <ResponsiveContainer width={160} height={160} minWidth={0} style={{ outline: "none" }}>
                      <PieChart>
                        <Pie
                          data={byProvider}
                          dataKey="total_cost"
                          nameKey="group_key"
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={70}
                          paddingAngle={2}
                          strokeWidth={0}
                        >
                          {byProvider.map((p: any, i: number) => (
                            <Cell key={i} fill={getProviderColor(p.group_key, i)} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => { const v = Number(value) || 0; return [`$${v.toFixed(4)}`, "Cost"]; }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <DonutCenterLabel value={`$${byProvider.reduce((s: number, p: any) => s + Number(p.total_cost), 0).toFixed(2)}`} />
                  </Box>
                  <Stack gap="6px" flex={1}>
                    {(() => {
                      const totalProviderCost = byProvider.reduce((s: number, pp: any) => s + Number(pp.total_cost), 0);
                      return byProvider.map((p: any, i: number) => {
                      const pct = totalProviderCost > 0 ? Math.round((Number(p.total_cost) / totalProviderCost) * 100) : 0;
                      return (
                        <Stack key={p.group_key} direction="row" justifyContent="space-between" alignItems="center">
                          <Stack direction="row" alignItems="center" gap="8px">
                            <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: getProviderColor(p.group_key, i), flexShrink: 0 }} />
                            <Typography sx={{ fontSize: 12 }}>{p.group_key}</Typography>
                          </Stack>
                          <Stack direction="row" gap="8px" alignItems="center">
                            <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>{pct}%</Typography>
                            <Typography sx={{ fontSize: 12, fontWeight: 600, minWidth: 60, textAlign: "right" }}>${Number(p.total_cost).toFixed(4)}</Typography>
                          </Stack>
                        </Stack>
                      );
                    });
                    })()}
                  </Stack>
                </Box>
              </Stack>
            </Box>
          )}

          {/* Guardrail detections trend */}
          {(
            <Box sx={{ ...cardSx, flex: 1 }}>
              <Stack gap="12px">
                <Stack direction="row" alignItems="center" gap="6px">
                  <Typography sx={sectionTitleSx}>Guardrail detections</Typography>
                  <MuiTooltip title="Daily trend of blocked and masked requests — rising detections may indicate increased PII exposure or attack attempts" arrow placement="top">
                    <Box sx={{ display: "flex", cursor: "help" }}><Info size={14} color={palette.text.disabled} /></Box>
                  </MuiTooltip>
                </Stack>
                <Stack direction="row" gap="12px" sx={{ mb: "4px" }}>
                  <Stack direction="row" alignItems="center" gap="4px">
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: GUARDRAIL_ACTION_COLORS.blocked }} />
                    <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>Blocked</Typography>
                  </Stack>
                  <Stack direction="row" alignItems="center" gap="4px">
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: GUARDRAIL_ACTION_COLORS.masked }} />
                    <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>Masked</Typography>
                  </Stack>
                </Stack>
                <ResponsiveContainer width="100%" height={160} minWidth={0} style={{ outline: "none" }}>
                  <AreaChart data={guardrailStats?.byDay || []} margin={{ left: 0, right: 0 }}>
                    <defs>
                      <GradientDef id="blockedGradient" color={GUARDRAIL_ACTION_COLORS.blocked} />
                      <GradientDef id="maskedGradient" color={GUARDRAIL_ACTION_COLORS.masked} />
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={palette.border.light} />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: palette.text.tertiary }}
                      tickLine={false}
                      axisLine={{ stroke: palette.border.light }}
                      tickFormatter={(v) => formatDayTick(v, period)}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: palette.text.tertiary }}
                      tickLine={false}
                      axisLine={{ stroke: palette.border.light }}
                      width={30}
                    />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Area type="monotone" dataKey="blocked" stackId="1" stroke={GUARDRAIL_ACTION_COLORS.blocked} fill="url(#blockedGradient)" strokeWidth={1.5} />
                    <Area type="monotone" dataKey="masked" stackId="1" stroke={GUARDRAIL_ACTION_COLORS.masked} fill="url(#maskedGradient)" strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </Stack>
            </Box>
          )}

        </Stack>
      )}

      {/* Top users */}
      {!loading && (
        <Box sx={cardSx}>
          <Stack gap="12px">
            <Stack direction="row" alignItems="center" gap="6px">
              <Typography sx={sectionTitleSx}>Top users</Typography>
              <MuiTooltip title="Users ranked by total spend — shows request count, token usage, and cost" arrow placement="top">
                <Box sx={{ display: "flex", cursor: "help" }}><Info size={14} color={palette.text.disabled} /></Box>
              </MuiTooltip>
            </Stack>
            <Stack gap="8px">
              {byUser.slice(0, 10).map((user: any, i: number) => (
                <Stack
                  key={user.group_key || `user-${i}`}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{
                    p: "8px 12px",
                    borderRadius: "4px",
                    border: `1px solid ${palette.border.light}`,
                  }}
                >
                  <Stack direction="row" alignItems="center" gap="8px">
                    <Typography sx={{ fontSize: 12, color: palette.text.disabled, fontWeight: 600, minWidth: 20 }}>
                      {i + 1}
                    </Typography>
                    <Typography sx={{ fontSize: 13 }}>{user.group_key}</Typography>
                  </Stack>
                  <Stack direction="row" gap="16px" alignItems="center">
                    <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                      {Number(user.total_requests).toLocaleString()} req
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                      {Number(user.total_tokens).toLocaleString()} tokens
                    </Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                      ${Number(user.total_cost).toFixed(4)}
                    </Typography>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          </Stack>
        </Box>
      )}
      {/* Guardrails activity — redesigned */}
      {!loading && (
        <Box sx={cardSx}>
          <Stack gap="12px">
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ pb: "8px", borderBottom: `1px solid ${palette.border.light}` }}>
              <Stack direction="row" alignItems="center" gap="6px">
                <Typography sx={sectionTitleSx}>Guardrails activity</Typography>
                <MuiTooltip title="What your guardrails caught in this period" arrow placement="top">
                  <Box sx={{ display: "flex", cursor: "help" }}><Info size={14} color={palette.text.disabled} /></Box>
                </MuiTooltip>
              </Stack>
              {/* Summary badges */}
              <Stack direction="row" gap="12px" alignItems="center">
                <Stack direction="row" alignItems="center" gap="4px">
                  <ShieldOff size={13} strokeWidth={1.5} color={GUARDRAIL_ACTION_COLORS.blocked} />
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: GUARDRAIL_ACTION_COLORS.blocked }}>
                    {guardrailStats?.summary?.blocked_count ?? 0}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>blocked</Typography>
                </Stack>
                <Stack direction="row" alignItems="center" gap="4px">
                  <ShieldCheck size={13} strokeWidth={1.5} color={GUARDRAIL_ACTION_COLORS.masked} />
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: GUARDRAIL_ACTION_COLORS.masked }}>
                    {guardrailStats?.summary?.masked_count ?? 0}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>masked</Typography>
                </Stack>
                <Typography sx={{ fontSize: 12, color: palette.text.disabled }}>
                  {guardrailStats?.summary?.total_checks ?? 0} total
                </Typography>
              </Stack>
            </Stack>

            {/* Two-column: Top detections + By endpoint */}
            <Stack direction={{ xs: "column", md: "row" }} gap="16px">
              {/* Top detections */}
              <Box flex={1}>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: palette.text.tertiary, textTransform: "uppercase", mb: "8px" }}>
                  Top detections
                </Typography>
                <Stack gap="4px">
                  {(guardrailStats?.topDetections || []).length === 0 ? (
                    <Typography sx={{ fontSize: 12, color: palette.text.disabled, py: "8px" }}>No detections in this period</Typography>
                  ) : (
                    (guardrailStats?.topDetections || []).slice(0, 6).map((d: any, i: number) => (
                      <Stack
                        key={`${d.entity_type}-${d.action_taken}-${i}`}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        sx={{ p: "4px 8px", borderRadius: "4px", "&:hover": { backgroundColor: palette.background.alt } }}
                      >
                        <Stack direction="row" alignItems="center" gap="6px">
                          <Box sx={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: d.action_taken === "blocked" ? GUARDRAIL_ACTION_COLORS.blocked : GUARDRAIL_ACTION_COLORS.masked, flexShrink: 0 }} />
                          <Typography sx={{ fontSize: 12 }}>
                            {formatEntityType(d.entity_type)}
                          </Typography>
                        </Stack>
                        <Typography sx={{ fontSize: 12, fontWeight: 600, minWidth: "30px", textAlign: "right" }}>
                          {d.count}
                        </Typography>
                      </Stack>
                    ))
                  )}
                </Stack>
              </Box>

              {/* By endpoint */}
              <Box flex={1}>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: palette.text.tertiary, textTransform: "uppercase", mb: "8px" }}>
                  By endpoint
                </Typography>
                <Stack gap="4px">
                  {(guardrailStats?.byEndpoint || []).length === 0 ? (
                    <Typography sx={{ fontSize: 12, color: palette.text.disabled, py: "8px" }}>No endpoint data</Typography>
                  ) : (
                    (guardrailStats?.byEndpoint || []).slice(0, 6).map((ep: any, _i: number) => (
                      <Stack
                        key={ep.endpoint_name}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        sx={{ p: "4px 8px", borderRadius: "4px", "&:hover": { backgroundColor: palette.background.alt } }}
                      >
                        <Typography sx={{ fontSize: 12 }}>{ep.endpoint_name}</Typography>
                        <Stack direction="row" gap="8px" alignItems="center">
                          {ep.blocked > 0 && <Typography sx={{ fontSize: 11, color: GUARDRAIL_ACTION_COLORS.blocked }}>{ep.blocked} blocked</Typography>}
                          {ep.masked > 0 && <Typography sx={{ fontSize: 11, color: GUARDRAIL_ACTION_COLORS.masked }}>{ep.masked} masked</Typography>}
                          <Typography sx={{ fontSize: 12, fontWeight: 600, minWidth: "30px", textAlign: "right" }}>{ep.count}</Typography>
                        </Stack>
                      </Stack>
                    ))
                  )}
                </Stack>
              </Box>
            </Stack>

            {/* View all logs link */}
            <Box sx={{ pt: "4px", borderTop: `1px solid ${palette.border.light}` }}>
              <Typography
                component="a"
                href="/ai-gateway/logs?tab=guardrails"
                sx={{ fontSize: 12, color: palette.brand.primary, textDecoration: "none", "&:hover": { textDecoration: "underline" }, cursor: "pointer" }}
              >
                View all guardrail logs
              </Typography>
            </Box>
          </Stack>
        </Box>
      )}
    </PageHeaderExtended>
  );
}
