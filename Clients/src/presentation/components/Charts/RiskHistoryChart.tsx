import { useState, useEffect, useCallback, useMemo } from "react";
import { Typography, Stack } from "@mui/material";
import { getRiskTimeseries } from "../../../application/repository/riskHistory.repository";
import { ButtonToggle } from "../button-toggle";
import CustomizableSkeleton from "../Skeletons";
import { TrendingUp } from "lucide-react";
import { EmptyState } from "../EmptyState";
import { text, background, border as borderPalette } from "../../themes/palette";
import { VWLineChart } from "./VWCharts";

interface RiskHistoryChartProps {
  parameter?: string;
  height?: number;
}

// Color schemes for different risk parameters
const SEVERITY_COLORS: Record<string, string> = {
  "Negligible": "#10B981",
  "Minor": "#84CC16",
  "Moderate": "#F59E0B",
  "Major": "#F97316",
  "Catastrophic": "#DC2626",
};

const LIKELIHOOD_COLORS: Record<string, string> = {
  "Rare": "#10B981",
  "Unlikely": "#84CC16",
  "Possible": "#F59E0B",
  "Likely": "#F97316",
  "Almost Certain": "#DC2626",
};

const MITIGATION_STATUS_COLORS: Record<string, string> = {
  "Not Started": "#94A3B8",
  "In Progress": "#3B82F6",
  "Completed": "#10B981",
  "On Hold": "#F59E0B",
  "Deferred": "#8B5CF6",
  "Canceled": "#EF4444",
  "Requires review": "#F97316",
};

const RISK_LEVEL_COLORS: Record<string, string> = {
  "No risk": "#10B981",
  "Very low risk": "#84CC16",
  "Low risk": "#FCD34D",
  "Medium risk": "#F59E0B",
  "High risk": "#F97316",
  "Very high risk": "#DC2626",
};

const TIMEFRAME_OPTIONS = [
  { value: "7days", label: "7 Days" },
  { value: "15days", label: "15 Days" },
  { value: "1month", label: "1 Month" },
  { value: "3months", label: "3 Months" },
  { value: "6months", label: "6 Months" },
  { value: "1year", label: "1 Year" },
];

const getColorMap = (parameter: string): Record<string, string> => {
  switch (parameter) {
    case "severity":
      return SEVERITY_COLORS;
    case "likelihood":
      return LIKELIHOOD_COLORS;
    case "mitigation_status":
      return MITIGATION_STATUS_COLORS;
    case "risk_level":
      return RISK_LEVEL_COLORS;
    default:
      return {};
  }
};

export function RiskHistoryChart({
  parameter = "risk_level",
  height = 400,
}: RiskHistoryChartProps) {
  const storageKey = "analytics_timeframe_risk";

  const [timeframe, setTimeframe] = useState<string>(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored && TIMEFRAME_OPTIONS.some((opt) => opt.value === stored)) {
      return stored;
    }
    return "1month";
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [timeseriesData, setTimeseriesData] = useState<
    { timestamp: string; data: Record<string, number> }[]
  >([]);

  useEffect(() => {
    localStorage.setItem(storageKey, timeframe);
  }, [timeframe]);

  const fetchTimeseriesData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getRiskTimeseries(parameter, timeframe);
      if (response?.data?.data) {
        setTimeseriesData(response.data.data.data);
      }
    } catch (err: unknown) {
      console.error("Error fetching timeseries data:", err);
      const message =
        err instanceof Error ? err.message : "Failed to load chart data";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [parameter, timeframe]);

  useEffect(() => {
    fetchTimeseriesData();
  }, [fetchTimeseriesData]);

  const handleTimeframeChange = (newTimeframe: string) => {
    setTimeframe(newTimeframe);
  };

  // Build Recharts-compatible flat data array and series config
  const { chartData, series, maxValue } = useMemo(() => {
    if (!timeseriesData || timeseriesData.length === 0) {
      return { chartData: [], series: [], maxValue: 0 };
    }

    const colorMap = getColorMap(parameter);
    const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

    // Collect all unique value keys across all timestamps
    const allValues = new Set<string>();
    timeseriesData.forEach((point) => {
      Object.keys(point.data).forEach((key) => allValues.add(key));
    });

    const valueKeys = Array.from(allValues);

    // Merge parallel arrays into a single array of objects for Recharts
    const chartData = timeseriesData.map((point) => {
      const entry: Record<string, string | number> = { date: fmt.format(new Date(point.timestamp)) };
      valueKeys.forEach((key) => {
        entry[key] = point.data[key] || 0;
      });
      return entry;
    });

    const series = valueKeys.map((value) => ({
      dataKey: value,
      name: value,
      color: colorMap[value] || text.disabled,
      strokeWidth: 2,
      dot: false as const,
    }));

    const maxValue = Math.max(
      ...timeseriesData.flatMap((point) => Object.values(point.data)),
      0
    );

    return { chartData, series, maxValue };
  }, [timeseriesData, parameter]);

  if (loading) {
    return (
      <Stack
        sx={{
          p: 3,
          border: `1px solid ${borderPalette.light}`,
          borderRadius: 2,
          height: height + 120,
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
        }}
      >
        <CustomizableSkeleton variant="circular" width={40} height={40} />
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack
        sx={{
          p: 3,
          border: `1px solid ${borderPalette.light}`,
          borderRadius: 2,
          height: height + 120,
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
        }}
      >
        <Typography sx={{ color: "#F04438", fontSize: 14, fontWeight: 500 }}>
          {error}
        </Typography>
      </Stack>
    );
  }

  if (!timeseriesData || timeseriesData.length === 0) {
    return (
      <EmptyState
        message="There is no historical data here"
        showBorder={true}
        icon={TrendingUp}
      />
    );
  }

  return (
    <Stack
      sx={{
        p: 3,
        border: `1px solid ${borderPalette.light}`,
        borderRadius: 2,
        background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
        boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)",
      }}
    >
      <Stack spacing={3}>
        <Stack direction="row" justifyContent="flex-end" alignItems="center">
          <ButtonToggle
            options={TIMEFRAME_OPTIONS}
            value={timeframe}
            onChange={handleTimeframeChange}
            height={32}
          />
        </Stack>

        <VWLineChart
          data={chartData}
          series={series}
          categoryKey="date"
          height={height}
          showLegend={true}
          margin={{ top: 10, right: 16, bottom: 10, left: 0 }}
          yAxisProps={{
            domain: [0, maxValue > 0 ? Math.ceil(maxValue * 1.15) : 10],
            tickFormatter: (v: number) => v.toString(),
            width: 35,
          }}
        />
      </Stack>
    </Stack>
  );
}
