/**
 * One chart theme for every Recharts screen (phase 1 style guide §9).
 *
 * Pick the colours by what the chart shows:
 * - categories: `series`, in the fixed order (series 1 is always Indigo);
 *   past 9 series, fold the rest into the last colour, Other
 * - one measure: `single` (brand green 700)
 * - risk: `risk.*`, the solid signal marks, always beside a label
 * - status: `status.*`, the same signal scale (success = Low green,
 *   warning = High orange, error = Critical red)
 *
 * The classic look keeps today's chart colours.
 */
import {
  brand,
  border,
  chart,
  primitives,
  riskMark,
  status as statusTokens,
  text,
  background,
  accent,
  risk as riskTokens,
  score,
} from "./palette";
import { isClassicUi } from "./uiStyle";

const classicUi = isClassicUi();

export const chartTheme = {
  /** Categorical series in fixed order; the last entry is Other. */
  series: chart,
  /** A chart with a single measure. */
  single: brand.primary,
  /** Risk tiers as solid marks (dots, bars, slices). */
  risk: classicUi
    ? {
        critical: riskTokens.critical.text,
        high: riskTokens.high.text,
        medium: riskTokens.medium.text,
        low: riskTokens.low.text,
        veryLow: riskTokens.veryLow.text,
      }
    : riskMark,
  /** Status marks. */
  status: classicUi
    ? {
        success: statusTokens.success.text,
        warning: statusTokens.warning.text,
        error: statusTokens.error.text,
        info: statusTokens.info.text,
        neutral: statusTokens.default.text,
        pending: text.disabled,
        purple: accent.purple.text,
        orange: accent.orange.text,
      }
    : {
        success: statusTokens.success.strong,
        warning: riskMark.high,
        error: riskMark.critical,
        info: primitives.series.sky,
        neutral: primitives.neutral[500],
        pending: primitives.neutral[300],
        purple: primitives.series.violet,
        orange: primitives.series.clay,
      },
  /** Count cards above risk tables (Total, Very high … Very low). */
  riskSummary: classicUi
    ? {
        total: "#4B5563",
        veryHigh: "#C63622",
        high: "#D68B61",
        medium: "#D6B971",
        low: "#52AB43",
        veryLow: "#B8D39C",
      }
    : {
        total: text.tertiary,
        veryHigh: riskMark.critical,
        high: riskMark.high,
        medium: riskMark.medium,
        low: riskMark.low,
        veryLow: riskMark.veryLow,
      },
  /** Count cards above status tables (tasks, policies). */
  statusSummary: classicUi
    ? {
        total: "#4B5563",
        info: "#2196F3",
        error: "#F44336",
        warning: "#FF9800",
        success: "#4CAF50",
        neutral: "#9E9E9E",
        neutralDark: "#757575",
      }
    : {
        total: text.tertiary,
        info: primitives.series.sky,
        error: riskMark.critical,
        warning: riskMark.high,
        success: statusTokens.success.strong,
        neutral: primitives.neutral[500],
        neutralDark: text.accent,
      },
  /** Gridlines, axes, tracks and labels. */
  grid: classicUi ? border.light : primitives.grey[200],
  axisLabel: { fontSize: 11, fill: text.tertiary },
  track: background.hover,
  /** Stroke width for line series. */
  lineWidth: 2,
  /** Bar corner radius in px. */
  barRadius: classicUi ? 4 : 2,
} as const;

/**
 * Colour for the n-th category. Phase 1 folds anything past series 9 into
 * Other (never repeat series 1); classic keeps its old wrap-around.
 */
export const seriesColor = (index: number): string => {
  const series = chartTheme.series;
  const i = Math.max(index, 0);
  if (classicUi) return series[i % series.length];
  return series[Math.min(i, series.length - 1)];
};

/**
 * Colour for a 0 to 100 completion or score value, red at 0 to green at 100.
 * Same spectrum in both looks. Always show the value beside it.
 */
export const scoreColor = (value: number): string => {
  const step = Math.round(Math.min(Math.max(value, 0), 100) / 10);
  return score[step];
};

export default chartTheme;
