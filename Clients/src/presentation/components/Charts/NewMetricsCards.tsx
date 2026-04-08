import { Box, Stack, Typography, LinearProgress } from "@mui/material";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { StatusDonutChart } from "./StatusDonutChart";
import { vwTooltipStyle, ChartOutlineWrapper } from "./VWCharts";
import { DASHBOARD_COLORS, TEXT_STYLES } from "../../styles/colors";
import { border as borderPalette } from "../../themes/palette";

const C = DASHBOARD_COLORS;

// Shared legend item component
function LegendItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Stack direction="row" alignItems="center" gap="8px">
      <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: color, flexShrink: 0 }} />
      <Typography sx={TEXT_STYLES.legendItem}>
        {label}: {value}
      </Typography>
    </Stack>
  );
}

// Shared Recharts bar chart for dashboard metric cards
interface MetricBarChartProps {
  data: { name: string; value: number; color: string }[];
  height?: number;
}

function MetricBarChart({ data, height = 130 }: MetricBarChartProps) {
  return (
    <ChartOutlineWrapper>
      <ResponsiveContainer width="100%" height={height} minWidth={0}>
        <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={borderPalette.light} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: C.textSecondary }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: C.textSecondary }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip contentStyle={vwTooltipStyle} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartOutlineWrapper>
  );
}

// Training Completion Card - Bar chart
interface TrainingCompletionProps {
  total: number;
  distribution: { planned: number; inProgress: number; completed: number };
  completionPercentage: number;
  totalPeople: number;
}

export function TrainingCompletionCard({ distribution }: TrainingCompletionProps) {
  const data = [
    { name: "Planned", value: distribution.planned, color: C.draft },
    { name: "In progress", value: distribution.inProgress, color: C.inProgress },
    { name: "Completed", value: distribution.completed, color: C.completed },
  ];

  return <MetricBarChart data={data} />;
}

// Policy Status Card - Donut with legend
interface PolicyStatusProps {
  total: number;
  distribution: {
    draft: number;
    underReview: number;
    approved: number;
    published: number;
    archived: number;
    deprecated: number;
  };
}

export function PolicyStatusCard({ total, distribution }: PolicyStatusProps) {
  const data = [
    { label: "Published", value: distribution.published, color: C.completed },
    { label: "Approved", value: distribution.approved, color: C.approved },
    { label: "Under review", value: distribution.underReview, color: C.inProgress },
    { label: "Draft", value: distribution.draft, color: C.draft },
    { label: "Archived", value: distribution.archived, color: C.archived },
  ].filter((item) => item.value > 0);

  return (
    <Stack direction="row" alignItems="flex-start" justifyContent="space-around">
      <Box sx={{ pt: "8px" }}>
        <StatusDonutChart data={data} total={total} size={100} />
      </Box>
      <Stack gap="4px" sx={{ pt: "8px" }}>
        {data.map((item) => (
          <LegendItem key={item.label} {...item} />
        ))}
      </Stack>
    </Stack>
  );
}

// Incident Status Card - Bar chart
interface IncidentStatusProps {
  total: number;
  distribution: { open: number; investigating: number; mitigated: number; closed: number };
}

export function IncidentStatusCard({ distribution }: IncidentStatusProps) {
  const data = [
    { name: "Open", value: distribution.open, color: C.open },
    { name: "Investigating", value: distribution.investigating, color: C.investigating },
    { name: "Mitigated", value: distribution.mitigated, color: C.mitigated },
    { name: "Closed", value: distribution.closed, color: C.closed },
  ];

  return <MetricBarChart data={data} />;
}

// Evidence Coverage Card - Progress with counts
interface EvidenceCoverageProps {
  total: number;
  totalFiles: number;
  modelsWithEvidence: number;
  totalModels: number;
  coveragePercentage: number;
}

export function EvidenceCoverageCard({
  total,
  totalFiles,
  modelsWithEvidence,
  totalModels,
  coveragePercentage,
}: EvidenceCoverageProps) {
  return (
  <Box>
    <Stack direction="row" justifyContent="space-between" alignItems="center" mb="16px">
      <Typography sx={TEXT_STYLES.percentage}>{coveragePercentage}%</Typography>
      <Typography sx={{ fontSize: 12, color: C.textSecondary }}>model coverage</Typography>
    </Stack>
    <LinearProgress
      variant="determinate"
      value={coveragePercentage}
      sx={{
        height: 8,
        borderRadius: 4,
        backgroundColor: C.progressBackground,
        mb: "32px",
        "& .MuiLinearProgress-bar": { backgroundColor: C.primary, borderRadius: 4 },
      }}
    />
    <Stack direction="row" justifyContent="space-between">
      <Stack alignItems="center">
        <Typography sx={TEXT_STYLES.valueSmall}>{total}</Typography>
        <Typography sx={TEXT_STYLES.label}>Evidence items</Typography>
      </Stack>
      <Stack alignItems="center">
        <Typography sx={TEXT_STYLES.valueSmall}>{totalFiles}</Typography>
        <Typography sx={TEXT_STYLES.label}>Files uploaded</Typography>
      </Stack>
      <Stack alignItems="center">
        <Typography sx={{ ...TEXT_STYLES.valueSmall, color: C.primary }}>
          {modelsWithEvidence}/{totalModels}
        </Typography>
        <Typography sx={TEXT_STYLES.label}>Models covered</Typography>
      </Stack>
    </Stack>
  </Box>
  );
}

// Model Lifecycle Card - Donut with legend
interface ModelLifecycleProps {
  total: number;
  distribution: { pending: number; approved: number; restricted: number; blocked: number };
}

export function ModelLifecycleCard({ total, distribution }: ModelLifecycleProps) {
  const data = [
    { label: "Approved", value: distribution.approved, color: C.completed },
    { label: "Pending", value: distribution.pending, color: C.inProgress },
    { label: "Restricted", value: distribution.restricted, color: C.restricted },
    { label: "Blocked", value: distribution.blocked, color: C.blocked },
  ].filter((item) => item.value > 0);

  return (
    <Stack direction="row" alignItems="flex-start" justifyContent="space-around">
      <Box sx={{ pt: "8px" }}>
        <StatusDonutChart data={data} total={total} size={100} />
      </Box>
      <Stack gap="4px" sx={{ pt: "8px" }}>
        {data.map((item) => (
          <LegendItem key={item.label} {...item} />
        ))}
      </Stack>
    </Stack>
  );
}
