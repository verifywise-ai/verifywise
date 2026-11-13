import { useState, useEffect, useCallback } from "react";
import { Box, Typography } from "@mui/material";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  getAllExperiments,
  type Experiment,
} from "../../../../application/repository/deepEval.repository";
import { vwTooltipStyle, ChartOutlineWrapper } from "../../../components/Charts/VWCharts";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import { displayFormattedTime } from "../../../tools/isoDateToString";
import { lowerIsBetter } from "../metricScore";
import { palette } from "../../../themes/palette";
import { metricLabel as sharedMetricLabel } from "../metricLabels";
import { chartTheme } from "../../../themes/chartTheme";

export type TimeRange = "7d" | "30d" | "100d" | "all";

export const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "100d", label: "Last 100 days" },
  { value: "all", label: "All time" },
];

interface PerformanceChartProps {
  projectId: string;
  timeRange: TimeRange;
}

// Fixed series order; classic keeps 15 distinct colours, phase 1 folds past nine into Other.
const CHART_COLORS = chartTheme.lines;

// Legend and tooltip label. Lower is better metrics (bias, toxicity, hallucination) share
// the 0-100% axis with the rest, so say which way is good: 0% is the best score for them.
export const metricLabel = (metricKey: string): string => {
  const label = sharedMetricLabel(metricKey);
  return lowerIsBetter(metricKey) ? `${label} (lower is better)` : label;
};

// Get color for a metric by index to ensure unique colors
const getMetricColor = (index: number): string => {
  return CHART_COLORS[index % CHART_COLORS.length];
};

type ChartPoint = {
  name: string;
  date: string;
  uniqueId: string; // Unique identifier for each experiment (date + time)
  index: number; // Sequential index for even spacing on X-axis
  _calculatedMetrics: string[]; // Track which metrics were actually calculated for this point
  [key: string]: number | string | string[] | null;
};

export default function PerformanceChart({ projectId, timeRange }: PerformanceChartProps) {
  const formatDate = useFormattedDate();
  const [data, setData] = useState<ChartPoint[]>([]);
  const [activeMetrics, setActiveMetrics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  // Measured chart width, for the legend height estimate below
  const [chartWidth, setChartWidth] = useState(900);

  // Get cutoff date based on time range
  const getCutoffDate = useCallback((range: TimeRange): Date | null => {
    if (range === "all") return null;
    const now = new Date();
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 100;
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }, []);

  // Load experiments and compute metric averages from evaluation logs
  const loadPerformanceData = useCallback(async () => {
    try {
      setLoading(true);
      const expsResp = await getAllExperiments({ project_id: projectId });
      const experiments: Experiment[] = expsResp.experiments || [];

      // Get cutoff date for filtering
      const cutoffDate = getCutoffDate(timeRange);

      // Filter completed experiments by date range and sort by date
      const completedExps = experiments
        .filter((exp) => {
          if (exp.status !== "completed") return false;
          if (cutoffDate) {
            return new Date(exp.created_at) >= cutoffDate;
          }
          return true;
        })
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      if (completedExps.length === 0) {
        setData([]);
        setActiveMetrics([]);
        return;
      }

      // Use pre-computed avg_scores from experiment results (no need to fetch logs)
      const chartData: ChartPoint[] = [];
      const metricsFound = new Set<string>();

      completedExps.forEach((exp, i) => {
        // Use pre-computed avg_scores from experiment results
        const avgScores = exp.results?.avg_scores || {};

        // Track which metrics this experiment has
        const calculatedMetrics: string[] = [];
        Object.keys(avgScores).forEach((key) => {
          metricsFound.add(key);
          calculatedMetrics.push(key);
        });

        // Build chart point
        const dateStr = formatDate(exp.created_at);
        const timeStr = displayFormattedTime(exp.created_at);
        const point: ChartPoint = {
          name: `Run ${i + 1}`,
          date: `${dateStr}`,
          uniqueId: `${dateStr} ${timeStr}`,
          index: i,
          _calculatedMetrics: calculatedMetrics,
          ...avgScores, // Spread all avg_scores directly
        };

        chartData.push(point);
      });

      setData(chartData);
      // Show all metrics that have data (including custom scorers)
      setActiveMetrics(Array.from(metricsFound));
    } catch (err: unknown) {
      console.error("Failed to load performance data:", err);
      setData([]);
      setActiveMetrics([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, timeRange, getCutoffDate, formatDate]);

  useEffect(() => {
    void loadPerformanceData();
  }, [loadPerformanceData]);

  if (loading) {
    return (
      <Box textAlign="center" py="8px">
        <Typography variant="body2" color="text.secondary">
          Loading performance data...
        </Typography>
      </Box>
    );
  }

  if (data.length === 0) {
    return (
      <Box textAlign="center" py="24px">
        <Typography variant="body2" color="text.secondary">
          No completed experiments in this time range.
        </Typography>
      </Box>
    );
  }

  // A trend needs two runs; a single point says nothing and takes the space of a chart
  if (data.length === 1) {
    return (
      <Box textAlign="center" py="24px">
        <Typography variant="body2" color="text.secondary">
          Run another experiment in this project to see how scores change over time.
        </Typography>
      </Box>
    );
  }

  // Get the metrics to display - only those that have data
  // Only metrics that have data; an empty series per known metric would just clutter the legend
  const metricsToDisplay = activeMetrics;

  // Calculate dynamic height based on the legend's length against the measured chart
  // width. Rough estimate: ~7px per character at 12px plus ~34px for each item's icon
  // and gap; labels vary in length (e.g. "Hallucination (lower is better)").
  const legendLineHeight = 20;
  const legendWidth = metricsToDisplay.reduce(
    (width, metricKey) => width + metricLabel(metricKey).length * 7 + 34,
    0,
  );
  const legendLines = Math.max(1, Math.ceil(legendWidth / Math.max(chartWidth - 40, 200)));
  const baseChartHeight = 200; // Base height for chart area
  const legendHeight = legendLines * legendLineHeight + 12; // +12 for padding
  const dynamicHeight = baseChartHeight + legendHeight;

  // Custom tick formatter to show date/time label for each index
  const formatXAxisTick = (index: number) => {
    const point = data[index];
    return point?.uniqueId || "";
  };

  // Create a color map for metrics (used by custom tooltip)
  const metricColorMap: Record<string, string> = {};
  metricsToDisplay.forEach((metricKey, index) => {
    metricColorMap[metricKey] = getMetricColor(index);
  });

  // Custom tooltip that only shows metrics that were actually calculated for this data point
  interface TooltipEntry {
    dataKey: string;
    value: number | null | undefined;
    color?: string;
    payload?: ChartPoint;
  }

  interface CustomTooltipProps {
    active?: boolean;
    payload?: TooltipEntry[];
    label?: string;
  }

  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (!active || !payload || payload.length === 0) return null;

    // Get the actual data point from recharts payload
    const dataPoint = payload[0]?.payload;
    if (!dataPoint) return null;

    // Only show metrics that actually exist as a key in this data point
    // (not name, date, uniqueId, or _calculatedMetrics)
    const excludeKeys = ["name", "date", "uniqueId", "_calculatedMetrics"];

    const validEntries = payload.filter((entry: TooltipEntry) => {
      const metricKey = entry.dataKey as string;
      // Check if this metric key actually exists in the data point with a real value
      const hasValue =
        metricKey in dataPoint &&
        !excludeKeys.includes(metricKey) &&
        dataPoint[metricKey] !== null &&
        dataPoint[metricKey] !== undefined;
      return hasValue;
    });

    if (validEntries.length === 0) return null;

    return (
      <Box
        sx={{
          ...vwTooltipStyle,
          minWidth: "180px",
        }}
      >
        <Typography sx={{ fontWeight: 600, fontSize: "13px", mb: "2px" }}>
          {dataPoint.uniqueId || label}
        </Typography>
        {validEntries.map((entry: TooltipEntry) => {
          const metricKey = entry.dataKey as string;
          const label = metricLabel(metricKey);
          const color = metricColorMap[metricKey] || entry.color;
          // Use the actual value from the data point, not from entry.value (which can be interpolated)
          const rawValue = dataPoint[metricKey];
          const value = typeof rawValue === "number" ? (rawValue * 100).toFixed(1) : "0";

          return (
            <Box
              key={metricKey}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "2px",
                py: "0.5px",
              }}
            >
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  backgroundColor: color,
                  flexShrink: 0,
                }}
              />
              <Typography sx={{ fontSize: "12px", color: palette.text.secondary }}>
                {label} : <span style={{ fontWeight: 600 }}>{value}%</span>
              </Typography>
            </Box>
          );
        })}
      </Box>
    );
  };

  return (
    <ChartOutlineWrapper>
      <ResponsiveContainer
        key={`rc-${projectId}-${data.length}-${activeMetrics.join(",")}-${timeRange}`}
        width="100%"
        height={Math.max(dynamicHeight, 220)}
        minWidth={0}
        debounce={1}
        onResize={(width) => setChartWidth((prev) => (Math.abs(prev - width) > 1 ? width : prev))}
      >
        <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={palette.border.light} />
          <XAxis
            dataKey="index"
            type="number"
            domain={
              data.length > 4 ? [0, data.length - 1] : [-0.5, Math.max(data.length - 0.5, 1.5)]
            }
            ticks={data.map((_, i) => i)}
            tickFormatter={formatXAxisTick}
            tick={{ fontSize: 12, fill: palette.text.secondary, dy: 10 }}
            axisLine={{ stroke: palette.border.light }}
            interval={0}
            angle={-25}
            textAnchor="end"
            height={65}
            tickMargin={10}
            allowDataOverflow={false}
          />
          <YAxis
            domain={[0, 1]}
            tick={{ fontSize: 12, fill: palette.text.secondary }}
            axisLine={{ stroke: palette.border.light }}
            tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ paddingTop: 12, fontSize: 12 }}
            formatter={(value: string) => metricLabel(value)}
          />
          {metricsToDisplay.map((metricKey, index) => {
            const color = getMetricColor(index);
            return (
              <Line
                key={metricKey}
                type="monotone"
                dataKey={metricKey}
                stroke={color}
                strokeWidth={1.5}
                name={metricKey}
                dot={{ r: 3, fill: color }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
                connectNulls={false}
                legendType="plainline"
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </ChartOutlineWrapper>
  );
}
