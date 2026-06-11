import { Box, Stack, Typography } from "@mui/material";
import { StatusDonutChart } from "./StatusDonutChart";
import { DashboardChartLayout, DASHBOARD_CHART_SIZE } from "./DashboardChartLayout";
import { text } from "../../themes/palette";

export interface RiskDataItem {
  label: string;
  value: number;
  color: string;
}

interface RiskDonutWithLegendProps {
  data: RiskDataItem[];
  total: number;
  size?: number;
}

export function RiskDonutWithLegend({
  data,
  total,
  size = DASHBOARD_CHART_SIZE,
}: RiskDonutWithLegendProps) {
  return (
    <DashboardChartLayout
      chart={<StatusDonutChart data={data} total={total} size={size} />}
      sideContent={
        <Stack gap={0.5}>
          {data.map((item) => (
            <Stack key={item.label} direction="row" alignItems="center" gap="8px">
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: item.color,
                  flexShrink: 0,
                }}
              />
              <Typography sx={{ fontSize: 13, color: `${text.icon}` }}>
                {item.label}: {item.value}
              </Typography>
            </Stack>
          ))}
        </Stack>
      }
    />
  );
}
