import { Box, Stack, Typography } from "@mui/material";
import { DASHBOARD_COLORS } from "../../styles/colors";

const C = DASHBOARD_COLORS;

const CATEGORY_COLORS = {
  regulatory: "#DC2626",
  operational: "#F59E0B",
  litigation: "#3B82F6",
  reputational: "#8B5CF6",
} as const;

interface LossCategory {
  label: string;
  key: keyof typeof CATEGORY_COLORS;
  value: number;
}

interface LossCategoryBreakdownProps {
  regulatory: number;
  operational: number;
  litigation: number;
  reputational: number;
}

export function LossCategoryBreakdown({
  regulatory,
  operational,
  litigation,
  reputational,
}: LossCategoryBreakdownProps) {
  const categories: LossCategory[] = [
    { label: "Regulatory", key: "regulatory", value: regulatory },
    { label: "Operational", key: "operational", value: operational },
    { label: "Litigation", key: "litigation", value: litigation },
    { label: "Reputational", key: "reputational", value: reputational },
  ];

  const total = categories.reduce((sum, c) => sum + c.value, 0);

  if (total === 0) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ height: 120, opacity: 0.5 }}>
        <Typography sx={{ fontSize: 13, color: C.textSecondary }}>
          No loss data available
        </Typography>
      </Stack>
    );
  }

  const formatValue = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  };

  return (
    <Stack gap="10px">
      {/* Stacked bar */}
      <Stack direction="row" sx={{ height: 24, borderRadius: "4px", overflow: "hidden" }}>
        {categories
          .filter((c) => c.value > 0)
          .map((c) => (
            <Box
              key={c.key}
              sx={{
                width: `${(c.value / total) * 100}%`,
                backgroundColor: CATEGORY_COLORS[c.key],
                minWidth: 4,
              }}
            />
          ))}
      </Stack>

      {/* Legend with values */}
      <Stack gap="6px">
        {categories.map((c) => {
          const pct = total > 0 ? ((c.value / total) * 100).toFixed(0) : "0";
          return (
            <Stack key={c.key} direction="row" alignItems="center" justifyContent="space-between">
              <Stack direction="row" alignItems="center" gap="8px">
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: CATEGORY_COLORS[c.key],
                    flexShrink: 0,
                  }}
                />
                <Typography sx={{ fontSize: 12, color: C.textSecondary }}>
                  {c.label}
                </Typography>
              </Stack>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.textPrimary }}>
                {formatValue(c.value)} ({pct}%)
              </Typography>
            </Stack>
          );
        })}
      </Stack>
    </Stack>
  );
}
