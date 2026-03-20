import { Box, Stack, Typography } from "@mui/material";
import { StatusDonutChart } from "./StatusDonutChart";
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
  size = 100,
}: RiskDonutWithLegendProps) {
  return (
    <Stack direction="row" alignItems="flex-start" justifyContent="space-around">
      <Box sx={{ pt: "8px" }}>
        <StatusDonutChart data={data} total={total} size={size} />
      </Box>
      <Stack gap={0.5} sx={{ pt: "8px" }}>
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
    </Stack>
  );
}
