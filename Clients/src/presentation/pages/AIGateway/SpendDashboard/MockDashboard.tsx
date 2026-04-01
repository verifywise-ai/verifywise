import { Box, Typography, Stack } from "@mui/material";
import { DollarSign, Hash, Layers, Clock } from "lucide-react";
import { StatCard } from "../../../components/Cards/StatCard";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import palette, { chart as chartPalette } from "../../../themes/palette";
import { sectionTitleSx, useCardSx } from "../shared";

const MOCK_BY_DAY = [
  { day: "Mar 9", total_cost: 5.24 },
  { day: "Mar 10", total_cost: 8.87 },
  { day: "Mar 11", total_cost: 11.43 },
  { day: "Mar 12", total_cost: 4.91 },
  { day: "Mar 13", total_cost: 9.62 },
  { day: "Mar 14", total_cost: 7.15 },
  { day: "Mar 15", total_cost: 0.6 },
];

const MOCK_BY_MODEL = [
  { group_key: "gpt-4o", total_cost: 28.41, total_requests: 621, total_tokens: 498200 },
  { group_key: "claude-sonnet-3-5", total_cost: 12.67, total_requests: 380, total_tokens: 271440 },
  { group_key: "gpt-4o-mini", total_cost: 6.74, total_requests: 246, total_tokens: 122700 },
];

const MOCK_BY_ENDPOINT = [
  { group_key: "prod-gpt4o", total_cost: 35.15, total_requests: 847 },
  { group_key: "staging-claude", total_cost: 12.67, total_requests: 400 },
];

export default function MockDashboard() {
  const cardSx = useCardSx();

  const maxModelCost = Math.max(...MOCK_BY_MODEL.map((m) => m.total_cost));
  const maxEndpointCost = Math.max(...MOCK_BY_ENDPOINT.map((ep) => ep.total_cost));

  return (
    <Stack gap="16px">
      {/* Stat cards */}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
        <StatCard title="Total cost" value="$47.82" Icon={DollarSign} tooltip="Total spend across all endpoints for this period" />
        <StatCard title="Total requests" value="1,247" Icon={Hash} tooltip="Number of completion and embedding requests processed" />
        <StatCard title="Total tokens" value="892,340" Icon={Layers} tooltip="Combined prompt and completion tokens across all requests" />
        <StatCard title="Avg latency" value="245ms" Icon={Clock} tooltip="Average round-trip time from request to complete response" />
      </Box>

      {/* Cost over time chart */}
      <Box sx={cardSx}>
        <Stack gap="12px">
          <Typography sx={sectionTitleSx}>Cost over time</Typography>
          <ResponsiveContainer width="100%" height={260} minWidth={0} style={{ outline: "none" }}>
            <BarChart data={MOCK_BY_DAY}>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.border.light} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: palette.text.tertiary }}
                tickLine={false}
                axisLine={{ stroke: palette.border.light }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: palette.text.tertiary }}
                tickLine={false}
                axisLine={{ stroke: palette.border.light }}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 4, border: `1px solid ${palette.border.light}` }}
                formatter={(value) => { const v = Number(value) || 0; return [`$${v.toFixed(2)}`, "Cost"]; }}
              />
              <Bar dataKey="total_cost" fill={chartPalette[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Stack>
      </Box>

      {/* Two-column: Cost by model + Cost by endpoint */}
      <Stack direction={{ xs: "column", md: "row" }} gap="16px">
        {/* Cost by model */}
        <Box sx={{ ...cardSx, flex: 1 }}>
          <Stack gap="12px">
            <Typography sx={sectionTitleSx}>Cost by model</Typography>
            <Stack gap="6px">
              {MOCK_BY_MODEL.map((m, i) => {
                const pct = (m.total_cost / maxModelCost) * 100;
                return (
                  <Stack
                    key={m.group_key}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{
                      p: "22px 14px",
                      borderRadius: "4px",
                      border: `1px solid ${palette.border.light}`,
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <Box
                      sx={{
                        position: "absolute", left: 0, top: 0, bottom: 0,
                        width: `${pct}%`,
                        backgroundColor: palette.border.light,
                        opacity: 0.4,
                      }}
                    />
                    <Stack direction="row" alignItems="center" gap="8px" sx={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: chartPalette[i % chartPalette.length], flexShrink: 0 }} />
                      <Typography sx={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.group_key}
                      </Typography>
                    </Stack>
                    <Stack direction="row" gap="12px" alignItems="center" sx={{ flexShrink: 0, position: "relative", zIndex: 1 }}>
                      <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>{m.total_requests.toLocaleString()} req</Typography>
                      <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>{m.total_tokens.toLocaleString()} tok</Typography>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, minWidth: 70, textAlign: "right" }}>${m.total_cost.toFixed(2)}</Typography>
                    </Stack>
                  </Stack>
                );
              })}
            </Stack>
          </Stack>
        </Box>

        {/* Cost by endpoint */}
        <Box sx={{ ...cardSx, flex: 1 }}>
          <Stack gap="12px">
            <Typography sx={sectionTitleSx}>Cost by endpoint</Typography>
            <Stack gap="6px">
              {MOCK_BY_ENDPOINT.map((ep, i) => {
                const pct = (ep.total_cost / maxEndpointCost) * 100;
                return (
                  <Stack
                    key={ep.group_key}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{
                      p: "22px 14px",
                      borderRadius: "4px",
                      border: `1px solid ${palette.border.light}`,
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <Box
                      sx={{
                        position: "absolute", left: 0, top: 0, bottom: 0,
                        width: `${pct}%`,
                        backgroundColor: palette.border.light,
                        opacity: 0.4,
                      }}
                    />
                    <Stack direction="row" alignItems="center" gap="8px" sx={{ position: "relative", zIndex: 1 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: chartPalette[i % chartPalette.length], flexShrink: 0 }} />
                      <Typography sx={{ fontSize: 12 }}>{ep.group_key}</Typography>
                    </Stack>
                    <Stack direction="row" gap="12px" alignItems="center" sx={{ position: "relative", zIndex: 1 }}>
                      <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>{ep.total_requests.toLocaleString()} req</Typography>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, minWidth: 70, textAlign: "right" }}>${ep.total_cost.toFixed(2)}</Typography>
                    </Stack>
                  </Stack>
                );
              })}
            </Stack>
          </Stack>
        </Box>
      </Stack>
    </Stack>
  );
}
