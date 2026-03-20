/**
 * Shadow AI Insights Page
 *
 * Dashboard showing summary metrics, tool risk rankings,
 * department breakdown pie chart, and top tool charts.
 */

import { useState, useEffect } from "react";
import {
  Stack,
  Box,
  Typography,
  Skeleton,
  SelectChangeEvent,
} from "@mui/material";
import {
  AppWindow,
  Users,
  AlertTriangle,
  Building2,
} from "lucide-react";
import { VWBarChart, VWDonutChart } from "../../components/Charts/VWCharts";
import {
  getInsightsSummary,
  getToolsByEvents,
  getToolsByUsers,
  getUsersByDepartment,
  getTools,
} from "../../../application/repository/shadowAi.repository";
import {
  ShadowAiInsightsSummary,
  ShadowAiToolByEvents,
  ShadowAiToolByUsers,
  ShadowAiUsersByDepartment,
  IShadowAiTool,
} from "../../../domain/interfaces/i.shadowAi";
import Select from "../../components/Inputs/Select";
import { StatCard } from "../../components/Cards/StatCard";
import { DashboardCard } from "../../components/Cards/DashboardCard";
import { VWLink } from "../../components/Link/VWLink";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import ShadowAIOnboarding from "../../components/Modals/ShadowAIOnboarding";
import { useNavigate } from "react-router-dom";
import { PERIOD_OPTIONS } from "./constants";
import { palette } from "../../themes/palette";

const DEPT_COLORS = [...palette.chart];

export default function InsightsPage() {
  const navigate = useNavigate();
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [period, setPeriod] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ShadowAiInsightsSummary | null>(null);
  const [toolsByEvents, setToolsByEvents] = useState<ShadowAiToolByEvents[]>([]);
  const [toolsByUsers, setToolsByUsers] = useState<ShadowAiToolByUsers[]>([]);
  const [departments, setDepartments] = useState<ShadowAiUsersByDepartment[]>([]);
  const [topRiskTools, setTopRiskTools] = useState<IShadowAiTool[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchData = async () => {
      setLoading(true);
      try {
        const [summaryData, eventsData, usersData, deptData, toolsData] =
          await Promise.all([
            getInsightsSummary(period),
            getToolsByEvents(period, 6),
            getToolsByUsers(period, 6),
            getUsersByDepartment(period),
            getTools({ sort_by: "risk_score", order: "desc", limit: 5 }),
          ]);
        if (controller.signal.aborted) return;
        setSummary(summaryData);
        setToolsByEvents(eventsData);
        setToolsByUsers(usersData);
        setDepartments(deptData);
        setTopRiskTools(toolsData.tools);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Failed to load insights:", error);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    fetchData();
    return () => { controller.abort(); };
  }, [period]);

  const handlePeriodChange = (e: SelectChangeEvent<string | number>) => {
    setPeriod(e.target.value as string);
  };

  return (
    <PageHeaderExtended
      title="Insights"
      description="Overview of Shadow AI activity across your organization. See summary metrics, top tools by usage, risk rankings, and department breakdown at a glance."

      helpArticlePath="shadow-ai/insights"
      tipBoxEntity="shadow-ai-insights"
    >

      {/* Period selector */}
      <Stack direction="row" justifyContent="flex-end">
        <Select
          id="insights-period-select"
          value={period}
          onChange={handlePeriodChange}
          items={PERIOD_OPTIONS}
          sx={{ width: 160 }}
        />
      </Stack>

      {/* Summary header cards */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "16px",
        }}
      >
        <StatCard
          title="Unique apps"
          value={loading ? "..." : String(summary?.unique_apps ?? 0)}
          Icon={AppWindow}
          onClick={() => navigate("/shadow-ai/tools")}
        />
        <StatCard
          title="AI users"
          value={loading ? "..." : String(summary?.total_ai_users ?? 0)}
          Icon={Users}
          onClick={() => navigate("/shadow-ai/user-activity")}
        />
        <StatCard
          title="Highest risk tool"
          value={loading ? "..." : (summary?.highest_risk_tool?.name ?? "—")}
          Icon={AlertTriangle}
          onClick={() => navigate("/shadow-ai/tools")}
        />
        <StatCard
          title="Most active department"
          value={loading ? "..." : (summary?.most_active_department ?? "—")}
          Icon={Building2}
          onClick={() => navigate("/shadow-ai/user-activity/departments")}
        />
      </Box>

      {/* Main content: left = risk list + dept chart, right = bar charts */}
      <Stack direction={{ xs: "column", md: "row" }} gap="16px">
        {/* Left column */}
        <Stack gap="16px" sx={{ flex: 1 }}>
          {/* Accessed tools with highest risk */}
          <DashboardCard title="Accessed tools with highest risk">
            {loading ? (
              <Skeleton variant="rectangular" height={200} sx={{ borderRadius: "4px" }} />
            ) : topRiskTools.length > 0 ? (
              <Stack gap="12px">
                {topRiskTools.map((tool) => (
                  <Stack
                    key={tool.id}
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <Stack direction="row" alignItems="center" gap="12px">
                      <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary }}>
                        {tool.risk_score ?? 0}
                      </Typography>
                      <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
                        {tool.name}
                      </Typography>
                    </Stack>
                    <Typography sx={{ fontSize: 12, color: palette.status.default.text }}>
                      {tool.total_events.toLocaleString()} events
                    </Typography>
                  </Stack>
                ))}
                <VWLink
                  onClick={() => navigate("/shadow-ai/tools")}
                  showIcon={false}
                  sx={{ fontSize: 12, mt: 0.5, alignSelf: "flex-end" }}
                >
                  Go to AI tools
                </VWLink>
              </Stack>
            ) : (
              <NoChartData />
            )}
          </DashboardCard>

          {/* AI users by department - pie chart */}
          <DashboardCard title="AI users by department">
            {loading ? (
              <Skeleton variant="rectangular" height={250} sx={{ borderRadius: "4px" }} />
            ) : departments.length > 0 ? (
              <Stack direction="row" alignItems="center" justifyContent="center" gap="24px">
                <VWDonutChart
                  data={departments}
                  dataKey="user_count"
                  nameKey="department"
                  colors={DEPT_COLORS}
                  size={200}
                  innerRadius={0}
                  outerRadius={90}
                  tooltipFormatter={(value, name) => [String(value), name]}
                />
                <Stack gap="8px">
                  {departments.map((dept, index) => (
                    <Stack key={dept.department} direction="row" alignItems="center" gap="8px">
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          backgroundColor: DEPT_COLORS[index % DEPT_COLORS.length],
                          flexShrink: 0,
                        }}
                      />
                      <Typography sx={{ fontSize: 12, color: palette.text.secondary }}>
                        {dept.department}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Stack>
            ) : (
              <NoChartData />
            )}
          </DashboardCard>
        </Stack>

        {/* Right column - bar charts */}
        <Stack gap="16px" sx={{ flex: 1 }}>
          {/* Most accessed tools by events */}
          <DashboardCard title="Most accessed tools by events">
            {loading ? (
              <Skeleton variant="rectangular" height={260} sx={{ borderRadius: "4px" }} />
            ) : toolsByEvents.length > 0 ? (
              <>
                <VWBarChart
                  data={toolsByEvents}
                  series={[{ dataKey: "event_count" }]}
                  categoryKey="tool_name"
                  layout="vertical"
                  height={260}
                  barCategoryGap="20%"
                  hideHorizontalGrid
                  tooltipFormatter={(value) => [typeof value === "number" ? value.toLocaleString() : String(value), "Events"]}
                />
                <VWLink
                  onClick={() => navigate("/shadow-ai/tools")}
                  showIcon={false}
                  sx={{ fontSize: 12, mt: 1, alignSelf: "flex-end" }}
                >
                  Go to AI tools
                </VWLink>
              </>
            ) : (
              <NoChartData />
            )}
          </DashboardCard>

          {/* Most accessed tools by users */}
          <DashboardCard title="Most accessed tools by users">
            {loading ? (
              <Skeleton variant="rectangular" height={260} sx={{ borderRadius: "4px" }} />
            ) : toolsByUsers.length > 0 ? (
              <VWBarChart
                data={toolsByUsers}
                series={[{ dataKey: "user_count" }]}
                categoryKey="tool_name"
                layout="vertical"
                height={260}
                barCategoryGap="20%"
                hideHorizontalGrid
                tooltipFormatter={(value) => [typeof value === "number" ? value.toLocaleString() : String(value), "Users"]}
              />
            ) : (
              <NoChartData />
            )}
          </DashboardCard>
        </Stack>
      </Stack>
      <ShadowAIOnboarding
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />
    </PageHeaderExtended>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function NoChartData() {
  return (
    <Box
      sx={{
        height: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Typography sx={{ fontSize: 13, color: palette.text.disabled }}>
        No data available for this period
      </Typography>
    </Box>
  );
}
