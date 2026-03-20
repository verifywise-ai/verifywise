/**
 * VerifyWise Reusable Chart Components
 *
 * Thin wrappers around Recharts that enforce consistent styling:
 * - Palette-based axis/grid colors
 * - Styled tooltips with shadow + rounded corners
 * - Gradient area fills
 * - Donut center labels
 * - Responsive containers with outline suppression
 *
 * Components:
 *   VWBarChart        — Vertical or horizontal bar chart
 *   VWAreaChart       — Time-series area chart with gradient fill
 *   VWDonutChart      — Pie/donut chart with optional center label
 *   VWLineChart       — Multi-series line chart
 *   VWChartTooltip    — Pre-styled tooltip (use as contentStyle)
 *   VWAxis            — Shared axis style props
 *   VWGradient        — SVG gradient for area fills
 */

import React from "react";
import { Box, Typography } from "@mui/material";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  LineChart,
  Line,
  Legend,
  TooltipProps,
} from "recharts";
import palette from "../../themes/palette";

// ─── Shared constants ───────────────────────────────────────────────────────

/** Pre-styled tooltip contentStyle object. Use: <Tooltip contentStyle={vwTooltipStyle} /> */
export const vwTooltipStyle: React.CSSProperties = {
  fontSize: 12,
  borderRadius: 8,
  border: `1px solid ${palette.border.light}`,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  padding: "8px 12px",
  backgroundColor: palette.background.main,
};

/** Inline style to suppress blue focus outlines on Recharts SVG elements */
const noOutlineStyle: React.CSSProperties = { outline: "none" };

/** Wrapper that suppresses focus outlines on all chart children. Export for custom charts. */
export const ChartOutlineWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    sx={{
      width: "100%",
      "& *:focus": { outline: "none !important" },
      "& svg *:focus": { outline: "none !important" },
    }}
  >
    {children}
  </Box>
);

/** Default axis tick style — exported for custom charts */
export const axisTick = { fontSize: 11, fill: palette.text.tertiary };
export const axisTickDisabled = { fontSize: 11, fill: palette.text.disabled };
export const axisLine = { stroke: palette.border.light };
export const gridStroke = palette.border.light;

// ─── VWGradient ─────────────────────────────────────────────────────────────

interface VWGradientProps {
  id: string;
  color: string;
  opacity?: number;
}

/** SVG linear gradient for area fills. Place inside <defs> of any Recharts SVG chart. */
export const VWGradient: React.FC<VWGradientProps> = ({ id, color, opacity = 0.12 }) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stopColor={color} stopOpacity={opacity} />
    <stop offset="100%" stopColor={color} stopOpacity={0.01} />
  </linearGradient>
);

// ─── VWBarChart ─────────────────────────────────────────────────────────────

interface BarSeriesConfig {
  dataKey: string;
  color?: string;
  radius?: [number, number, number, number];
  maxBarSize?: number;
  stackId?: string;
  name?: string;
}

interface VWBarChartProps {
  data: any[];
  series: BarSeriesConfig[];
  /** "vertical" makes bars horizontal (category on Y axis) */
  layout?: "horizontal" | "vertical";
  /** Data key for category axis */
  categoryKey: string;
  height?: number;
  /** Custom X axis tick formatter */
  xTickFormatter?: (value: any) => string;
  /** Custom Y axis tick formatter */
  yTickFormatter?: (value: any) => string;
  /** Custom tooltip formatter */
  tooltipFormatter?: TooltipProps<any, any>["formatter"];
  /** Custom tooltip content component */
  tooltipContent?: React.ReactElement;
  /** Y axis width (useful for horizontal bar labels) */
  yAxisWidth?: number;
  /** Chart margins */
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  /** Bar category gap */
  barCategoryGap?: string | number;
  /** Hide horizontal grid lines */
  hideHorizontalGrid?: boolean;
}

export const VWBarChart: React.FC<VWBarChartProps> = ({
  data,
  series,
  layout = "horizontal",
  categoryKey,
  height = 260,
  xTickFormatter,
  yTickFormatter,
  tooltipFormatter,
  tooltipContent,
  yAxisWidth,
  margin = { left: 8, right: 24, top: 8, bottom: 8 },
  barCategoryGap,
  hideHorizontalGrid = false,
}) => {
  const isVertical = layout === "vertical";
  return (
    <ChartOutlineWrapper>
    <ResponsiveContainer width="100%" height={height} style={noOutlineStyle}>
      <BarChart data={data} layout={layout} margin={margin} barCategoryGap={barCategoryGap}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={gridStroke}
          horizontal={!hideHorizontalGrid}
        />
        {isVertical ? (
          <>
            <XAxis
              type="number"
              tick={axisTickDisabled}
              axisLine={axisLine}
              tickLine={false}
              tickFormatter={xTickFormatter}
            />
            <YAxis
              type="category"
              dataKey={categoryKey}
              tick={{ fontSize: 12, fill: palette.text.secondary }}
              width={yAxisWidth || 90}
              axisLine={false}
              tickLine={false}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={categoryKey}
              tick={axisTick}
              tickLine={false}
              axisLine={axisLine}
              tickFormatter={xTickFormatter}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={axisLine}
              tickFormatter={yTickFormatter}
              width={yAxisWidth}
            />
          </>
        )}
        {tooltipContent ? (
          <Tooltip content={tooltipContent} />
        ) : (
          <Tooltip
            contentStyle={vwTooltipStyle}
            formatter={tooltipFormatter}
            cursor={isVertical ? { fill: "rgba(19, 113, 91, 0.04)" } : undefined}
          />
        )}
        {series.map((s, _i) => (
          <Bar
            key={s.dataKey}
            dataKey={s.dataKey}
            fill={s.color || palette.brand.primary}
            radius={s.radius || (isVertical ? [0, 4, 4, 0] : [4, 4, 0, 0])}
            maxBarSize={s.maxBarSize || 28}
            stackId={s.stackId}
            name={s.name}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
    </ChartOutlineWrapper>
  );
};

// ─── VWAreaChart ─────────────────────────────────────────────────────────────

interface AreaSeriesConfig {
  dataKey: string;
  color: string;
  gradientId?: string;
  strokeWidth?: number;
  stackId?: string;
  name?: string;
}

interface VWAreaChartProps {
  data: any[];
  series: AreaSeriesConfig[];
  categoryKey: string;
  height?: number;
  xTickFormatter?: (value: any) => string;
  yTickFormatter?: (value: any) => string;
  tooltipFormatter?: TooltipProps<any, any>["formatter"];
  tooltipContent?: React.ReactElement;
  yAxisWidth?: number;
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  /** Gradient opacity (default 0.12) */
  gradientOpacity?: number;
}

export const VWAreaChart: React.FC<VWAreaChartProps> = ({
  data,
  series,
  categoryKey,
  height = 180,
  xTickFormatter,
  yTickFormatter,
  tooltipFormatter,
  tooltipContent,
  yAxisWidth = 30,
  margin,
  gradientOpacity = 0.12,
}) => (
  <ChartOutlineWrapper>
  <ResponsiveContainer width="100%" height={height} style={noOutlineStyle}>
    <AreaChart data={data} margin={margin}>
      <defs>
        {series.map((s) => (
          <VWGradient
            key={s.gradientId || `${s.dataKey}Gradient`}
            id={s.gradientId || `${s.dataKey}Gradient`}
            color={s.color}
            opacity={gradientOpacity}
          />
        ))}
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
      <XAxis
        dataKey={categoryKey}
        tick={axisTick}
        tickLine={false}
        axisLine={axisLine}
        tickFormatter={xTickFormatter}
      />
      <YAxis
        tick={axisTick}
        tickLine={false}
        axisLine={axisLine}
        tickFormatter={yTickFormatter}
        width={yAxisWidth}
      />
      {tooltipContent ? (
        <Tooltip content={tooltipContent} />
      ) : (
        <Tooltip contentStyle={vwTooltipStyle} formatter={tooltipFormatter} />
      )}
      {series.map((s) => (
        <Area
          key={s.dataKey}
          type="monotone"
          dataKey={s.dataKey}
          stroke={s.color}
          fill={`url(#${s.gradientId || `${s.dataKey}Gradient`})`}
          strokeWidth={s.strokeWidth || 2}
          stackId={s.stackId}
          name={s.name}
        />
      ))}
    </AreaChart>
  </ResponsiveContainer>
  </ChartOutlineWrapper>
);

// ─── VWDonutChart ───────────────────────────────────────────────────────────

interface VWDonutChartProps {
  data: any[];
  dataKey: string;
  nameKey?: string;
  colors: string[];
  /** Size of the chart container */
  size?: number;
  /** Inner radius — 0 for pie, >0 for donut */
  innerRadius?: number;
  outerRadius?: number;
  /** Center label (only shown if innerRadius > 0) */
  centerValue?: string;
  centerLabel?: string;
  tooltipFormatter?: TooltipProps<any, any>["formatter"];
}

export const VWDonutChart: React.FC<VWDonutChartProps> = ({
  data,
  dataKey,
  nameKey,
  colors,
  size = 160,
  innerRadius = 50,
  outerRadius,
  centerValue,
  centerLabel = "Total",
  tooltipFormatter,
}) => {
  const computedOuter = outerRadius || Math.floor(size / 2) - 5;
  return (
    <Box sx={{ position: "relative", width: size, height: size, "& .recharts-tooltip-wrapper": { zIndex: "10 !important" }, "& *:focus": { outline: "none !important" }, "& svg *:focus": { outline: "none !important" } }}>
      <ResponsiveContainer width="100%" height="100%" style={noOutlineStyle}>
        <PieChart>
          <Pie
            data={data}
            dataKey={dataKey}
            nameKey={nameKey}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={computedOuter}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={vwTooltipStyle} formatter={tooltipFormatter} />
        </PieChart>
      </ResponsiveContainer>
      {innerRadius > 0 && centerValue && (
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2, color: palette.text.primary }}>
            {centerValue}
          </Typography>
          <Typography sx={{ fontSize: 10, color: palette.text.tertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {centerLabel}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

// ─── VWLineChart ────────────────────────────────────────────────────────────

interface LineSeriesConfig {
  dataKey: string;
  color: string;
  strokeWidth?: number;
  dot?: boolean | object;
  name?: string;
  connectNulls?: boolean;
}

interface VWLineChartProps {
  data: any[];
  series: LineSeriesConfig[];
  categoryKey: string;
  height?: number;
  xTickFormatter?: (value: any) => string;
  yTickFormatter?: (value: any) => string;
  tooltipContent?: React.ReactElement;
  tooltipFormatter?: TooltipProps<any, any>["formatter"];
  xAxisProps?: Record<string, any>;
  yAxisProps?: Record<string, any>;
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  showLegend?: boolean;
  legendFormatter?: (value: string) => string;
}

export const VWLineChart: React.FC<VWLineChartProps> = ({
  data,
  series,
  categoryKey,
  height = 260,
  xTickFormatter,
  yTickFormatter,
  tooltipContent,
  tooltipFormatter,
  xAxisProps,
  yAxisProps,
  margin = { top: 5, right: 20, left: 10, bottom: 20 },
  showLegend = false,
  legendFormatter,
}) => {
  return (
    <ChartOutlineWrapper>
    <ResponsiveContainer width="100%" height={height} style={noOutlineStyle}>
      <LineChart data={data} margin={margin}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
        <XAxis
          dataKey={categoryKey}
          tick={axisTick}
          tickLine={false}
          axisLine={axisLine}
          tickFormatter={xTickFormatter}
          {...xAxisProps}
        />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={axisLine}
          tickFormatter={yTickFormatter}
          {...yAxisProps}
        />
        {tooltipContent ? (
          <Tooltip content={tooltipContent} />
        ) : (
          <Tooltip contentStyle={vwTooltipStyle} formatter={tooltipFormatter} />
        )}
        {showLegend && (
          <Legend
            wrapperStyle={{ paddingTop: 12, fontSize: 13 }}
            formatter={legendFormatter}
          />
        )}
        {series.map((s) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            stroke={s.color}
            strokeWidth={s.strokeWidth || 1.5}
            dot={s.dot ?? { r: 3, fill: s.color }}
            name={s.name || s.dataKey}
            isAnimationActive={false}
            connectNulls={s.connectNulls ?? false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
    </ChartOutlineWrapper>
  );
};
