import { useState, useEffect, useCallback, useMemo } from "react";
import { Typography, Stack } from "@mui/material";
import { getModelInventoryTimeseries } from "../../../application/repository/modelInventoryHistory.repository";
import { ModelInventoryStatus } from "../../../domain/enums/modelInventory.enum";
import { ButtonToggle } from "../button-toggle";
import CustomizableSkeleton from "../Skeletons";
import { TrendingUp } from "lucide-react";
import { EmptyState } from "../EmptyState";
import { text, background, border as borderPalette } from "../../themes/palette";
import { VWLineChart } from "./VWCharts";

interface ModelInventoryHistoryChartProps {
  parameter?: string;
  height?: number;
}

const STATUS_COLORS: Record<string, string> = {
  [ModelInventoryStatus.APPROVED]: "#10B981",
  [ModelInventoryStatus.PENDING]: "#F59E0B",
  [ModelInventoryStatus.RESTRICTED]: "#EF4444",
  [ModelInventoryStatus.BLOCKED]: "#DC2626",
};

const TIMEFRAME_OPTIONS = [
  { value: "7days", label: "7 Days" },
  { value: "15days", label: "15 Days" },
  { value: "1month", label: "1 Month" },
  { value: "3months", label: "3 Months" },
  { value: "6months", label: "6 Months" },
  { value: "1year", label: "1 Year" },
];

export function ModelInventoryHistoryChart({
  parameter = "status",
  height = 400,
}: ModelInventoryHistoryChartProps) {
  const storageKey = "analytics_timeframe_model";

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
      const response = await getModelInventoryTimeseries(parameter, timeframe);
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

    const statusValues = Object.values(ModelInventoryStatus);
    const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

    const chartData = timeseriesData.map((point) => {
      const entry: Record<string, string | number> = { date: fmt.format(new Date(point.timestamp)) };
      statusValues.forEach((status) => {
        entry[status] = point.data[status] || 0;
      });
      return entry;
    });

    const series = statusValues.map((status) => ({
      dataKey: status,
      name: status,
      color: STATUS_COLORS[status] || text.disabled,
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
