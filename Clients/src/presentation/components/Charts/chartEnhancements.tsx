/**
 * Shared chart enhancement utilities for VerifyWise dashboards.
 *
 * 8 reusable enhancements:
 * 1. ChartCard — consistent card with gradient background + header separator
 * 2. GradientDefs — SVG gradient definitions for area/bar fills
 * 3. AnimatedNumber — count-up animation for stat values
 * 4. GradientProgressBar — progress bar with gradient fill + rounded ends
 * 5. DonutCenterLabel — label in the center of a donut/pie chart
 * 6. Sparkline — micro trend line for stat cards
 * 7. ChartTooltip — styled tooltip with icon + shadow
 * 8. providerColorMap — consistent color mapping for providers
 */

import React, { useState, useEffect, useRef } from "react";
import { Box, Typography, Stack } from "@mui/material";
import { Tooltip as MuiTooltip } from "@mui/material";
import { Info } from "lucide-react";
import { ResponsiveContainer, LineChart, Line } from "recharts";
import palette from "../../themes/palette";

// ─── 1. ChartCard ──────────────────────────────────────────────────────────

interface ChartCardProps {
  title: string;
  tooltip?: string;
  children: React.ReactNode;
  flex?: number;
  sx?: Record<string, any>;
}

export const ChartCard: React.FC<ChartCardProps> = ({ title, tooltip, children, flex = 1, sx }) => (
  <Box
    sx={{
      background: `linear-gradient(180deg, ${palette.background.main} 0%, #F8FAFB 100%)`,
      border: `1.5px solid ${palette.border.light}`,
      borderRadius: "4px",
      p: "16px",
      boxShadow: "none",
      flex,
      ...sx,
    }}
  >
    <Stack gap="12px">
      <Stack
        direction="row"
        alignItems="center"
        gap="6px"
        sx={{ pb: "8px", borderBottom: `1px solid ${palette.border.light}` }}
      >
        <Typography sx={{ fontWeight: 600, fontSize: 16 }}>{title}</Typography>
        {tooltip && (
          <MuiTooltip title={tooltip} arrow placement="top">
            <Box sx={{ display: "flex", cursor: "help" }}>
              <Info size={14} color={palette.text.disabled} />
            </Box>
          </MuiTooltip>
        )}
      </Stack>
      {children}
    </Stack>
  </Box>
);

// ─── 2. GradientDefs ────────────────────────────────────────────────────────

interface GradientDefProps {
  id: string;
  color: string;
  opacity?: number;
}

/** SVG gradient definition for area chart fills. Place inside <defs> in any Recharts chart. */
export const GradientDef: React.FC<GradientDefProps> = ({ id, color, opacity = 0.12 }) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stopColor={color} stopOpacity={opacity} />
    <stop offset="100%" stopColor={color} stopOpacity={0.01} />
  </linearGradient>
);

// ─── 3. AnimatedNumber ──────────────────────────────────────────────────────

interface AnimatedNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  sx?: Record<string, any>;
}

/** Count-up animation for stat values. */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 600,
  sx,
}) => {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const from = display;
    const to = value;

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return (
    <Typography component="span" sx={sx}>
      {prefix}
      {decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString()}
      {suffix}
    </Typography>
  );
};

// ─── 4. GradientProgressBar ─────────────────────────────────────────────────

interface GradientProgressBarProps {
  pct: number;
  color?: string;
  height?: number;
}

/** Progress bar with gradient fill + rounded ends. */
export const GradientProgressBar: React.FC<GradientProgressBarProps> = ({
  pct,
  color = palette.brand.primary,
  height = 6,
}) => (
  <Box
    sx={{
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: `${Math.min(100, pct)}%`,
      background: `linear-gradient(90deg, ${color}30 0%, ${color}10 100%)`,
      borderRadius: `${height / 2}px`,
      transition: "width 0.5s ease-out",
    }}
  />
);

// ─── 5. DonutCenterLabel ────────────────────────────────────────────────────

interface DonutCenterLabelProps {
  value: string;
  label?: string;
}

/** Centered label inside a donut chart. Position absolutely over the PieChart. */
export const DonutCenterLabel: React.FC<DonutCenterLabelProps> = ({ value, label = "Total" }) => (
  <Box
    sx={{
      position: "absolute",
      top: "50%",
      left: 80, // center of 160px container
      transform: "translate(-50%, -50%)",
      textAlign: "center",
      pointerEvents: "none",
    }}
  >
    <Typography
      sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2, color: palette.text.primary }}
    >
      {value}
    </Typography>
    <Typography
      sx={{
        fontSize: 10,
        color: palette.text.tertiary,
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      {label}
    </Typography>
  </Box>
);

// ─── 6. Sparkline ───────────────────────────────────────────────────────────

interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

/** Micro sparkline for stat cards — shows 7-day trend. */
export const Sparkline: React.FC<SparklineProps> = ({
  data,
  color = palette.brand.primary,
  width = 80,
  height = 24,
}) => {
  if (!data || data.length < 2) return null;
  const chartData = data.map((v, i) => ({ v, i }));
  return (
    <ResponsiveContainer width={width} height={height} minWidth={0} style={{ outline: "none" }}>
      <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

// ─── 7. ChartTooltip ────────────────────────────────────────────────────────

/** Styled tooltip content style object for Recharts <Tooltip contentStyle={...}>. */
export const chartTooltipStyle = {
  fontSize: 12,
  borderRadius: 8,
  border: `1px solid ${palette.border.light}`,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  padding: "8px 12px",
  backgroundColor: palette.background.main,
};

// ─── 8. Provider Color Map ──────────────────────────────────────────────────

/** Consistent color mapping for LLM providers across all charts. */
export const PROVIDER_COLORS: Record<string, string> = {
  openai: "#10A37F",
  anthropic: "#D4A574",
  gemini: "#4285F4",
  google: "#4285F4",
  mistral: "#FF7000",
  xai: "#1DA1F2",
  bedrock: "#FF9900",
  azure: "#0078D4",
  together_ai: "#6366F1",
  openrouter: "#8B5CF6",
  fireworks_ai: "#EF4444",
  deepinfra: "#06B6D4",
  cohere: "#39B89D",
  replicate: "#1A1A1A",
};

/** Get provider color — falls back to chart palette by index. */
export const getProviderColor = (provider: string, index: number = 0): string => {
  const p = provider.toLowerCase().replace(/[^a-z_]/g, "");
  return (
    PROVIDER_COLORS[p] ||
    [
      "#13715B",
      "#3B82F6",
      "#F59E0B",
      "#EF4444",
      "#8B5CF6",
      "#06B6D4",
      "#EC4899",
      "#14B8A6",
      "#F97316",
      "#6366F1",
    ][index % 10]
  );
};
