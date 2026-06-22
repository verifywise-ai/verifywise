import { Box, BoxProps } from "@mui/material";
import { ReactNode } from "react";

export const DASHBOARD_CHART_SIZE = 100;
/** Fixed column width so donut/gauge centers align across dashboard cards. */
export const DASHBOARD_CHART_COLUMN_WIDTH = 110;
/** Fixed legend column width — pinned to the right so left edges align across cards. */
export const DASHBOARD_LEGEND_MAX_WIDTH = 160;

interface DashboardChartLayoutProps {
  chart: ReactNode;
  sideContent: ReactNode;
  alignItems?: BoxProps["alignItems"];
}

export function DashboardChartLayout({
  chart,
  sideContent,
  alignItems = "flex-start",
}: DashboardChartLayoutProps) {
  return (
    <Box sx={{ display: "flex", alignItems, width: "100%" }}>
      <Box
        sx={{
          width: DASHBOARD_CHART_COLUMN_WIDTH,
          flexShrink: 0,
          display: "flex",
          justifyContent: "center",
          pt: "8px",
        }}
      >
        {chart}
      </Box>
      <Box sx={{ flex: 1, minWidth: 16 }} />
      <Box
        sx={{
          width: DASHBOARD_LEGEND_MAX_WIDTH,
          flexShrink: 0,
          pt: "8px",
        }}
      >
        {sideContent}
      </Box>
    </Box>
  );
}
