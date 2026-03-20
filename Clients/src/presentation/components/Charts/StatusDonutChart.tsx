import { Box, Typography } from "@mui/material";
import { StatusDonutChartProps } from "../../types/interfaces/i.chart";
import { text, background, status } from "../../themes/palette";
import { VWDonutChart } from "./VWCharts";

export function StatusDonutChart({
  data,
  total,
  size = 100,
}: StatusDonutChartProps) {
  // Filter out zero values for cleaner visualization
  const filteredData = data.filter((item) => item.value > 0);

  if (filteredData.length === 0 || total === 0) {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: `2px solid ${status.default.border}`,
          borderRadius: "50%",
          backgroundColor: `${background.accent}`,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: `${text.disabled}`,
            fontSize: "10px",
            textAlign: "center",
          }}
        >
          No Data
        </Typography>
      </Box>
    );
  }

  // VWDonutChart expects data with a single dataKey and a parallel colors array
  const chartData = filteredData.map((item) => ({
    value: item.value,
    label: item.label,
  }));
  const colors = filteredData.map((item) => item.color);

  const innerRadius = Math.round(size * 0.28);
  const outerRadius = Math.round(size * 0.48);

  return (
    <Box
      sx={{
        position: "relative",
        width: size,
        height: size,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Background shadow ring */}
      <Box
        sx={{
          position: "absolute",
          width: size * 0.96,
          height: size * 0.96,
          borderRadius: "50%",
          backgroundColor: `${background.hover}`,
          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.1)",
        }}
      />
      <VWDonutChart
        data={chartData}
        dataKey="value"
        nameKey="label"
        colors={colors}
        size={size}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
      />
      {/* Center circle with total */}
      <Box
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        <Box
          sx={{
            width: size * 0.52,
            height: size * 0.52,
            borderRadius: "50%",
            backgroundColor: `${background.main}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        >
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              fontSize: "16px",
              color: text.primary,
            }}
          >
            {total}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
