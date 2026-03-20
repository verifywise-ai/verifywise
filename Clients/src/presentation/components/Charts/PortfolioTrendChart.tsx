import { useMemo } from "react";
import { Stack, Typography } from "@mui/material";
import { DASHBOARD_COLORS } from "../../styles/colors";
import type { IPortfolioSnapshot } from "../../../domain/interfaces/i.quantitativeRisk";
import { VWLineChart } from "./VWCharts";

const C = DASHBOARD_COLORS;

interface PortfolioTrendChartProps {
  snapshots: IPortfolioSnapshot[];
  height?: number;
}

export function PortfolioTrendChart({
  snapshots,
  height = 200,
}: PortfolioTrendChartProps) {
  const sorted = useMemo(
    () =>
      [...snapshots].sort(
        (a, b) =>
          new Date(a.snapshot_date).getTime() -
          new Date(b.snapshot_date).getTime()
      ),
    [snapshots]
  );

  // Merge xLabels + both series into a single data array for Recharts
  const chartData = useMemo(
    () =>
      sorted.map((s) => {
        const d = new Date(s.snapshot_date);
        return {
          label: `${d.getMonth() + 1}/${d.getDate()}`,
          "Total ALE": s.total_ale,
          "Residual ALE": s.total_residual_ale,
        };
      }),
    [sorted]
  );

  if (snapshots.length === 0) {
    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        sx={{ height, opacity: 0.5 }}
      >
        <Typography sx={{ fontSize: 13, color: C.textSecondary }}>
          No trend data available yet
        </Typography>
      </Stack>
    );
  }

  return (
    <VWLineChart
      data={chartData}
      series={[
        {
          dataKey: "Total ALE",
          name: "Total ALE",
          color: C.critical,
          dot: false,
        },
        {
          dataKey: "Residual ALE",
          name: "Residual ALE",
          color: C.medium,
          dot: false,
        },
      ]}
      categoryKey="label"
      height={height}
      showLegend={true}
      margin={{ left: 8, right: 16, top: 10, bottom: 10 }}
      legendFormatter={(value: string) => value}
    />
  );
}
