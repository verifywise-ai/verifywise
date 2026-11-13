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
  button,
  accent,
  risk as riskTokens,
  score,
  note,
} from "./palette";
import { isClassicUi } from "./uiStyle";

const classicUi = isClassicUi();

/** The classic look's 12 avatar colours, one per vendor name hash. */
const CLASSIC_AVATARS = [
  "#EF4444",
  "#F59E0B",
  "#10B981",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#F97316",
  "#14B8A6",
  "#6366F1",
  "#A855F7",
  "#84CC16",
] as const;

/** The classic look's 15 line colours for charts with many series. */
const CLASSIC_LINES = [
  "#2563EB",
  "#DC2626",
  "#16A34A",
  "#7C3AED",
  "#EA580C",
  "#0891B2",
  "#DB2777",
  "#CA8A04",
  "#0D9488",
  "#4F46E5",
  "#059669",
  "#9333EA",
  "#C026D3",
  "#65A30D",
  "#0284C7",
] as const;

/**
 * The classic look's progress-bar colours, one per 10% band (0-10% is the
 * first, 91-100% the last). Phase 1 uses the 11-step `score` spectrum.
 */
const CLASSIC_PROGRESS = [
  "#FF4500",
  "#FF4500",
  "#FFA500",
  "#FFD700",
  "#E9F14F",
  "#CDDD24",
  "#64E730",
  "#32CD32",
  "#228B22",
  "#008000",
] as const;

/** The classic entity graph risk colours (dot and caption alike). */
const CLASSIC_GRAPH_RISK: Record<string, string> = {
  "Low": "#4caf50",
  "Medium": "#ff9800",
  "High": "#f44336",
  "Critical": "#9c27b0",
  "Very low risk": "#4caf50",
  "Low risk": "#8bc34a",
  "Medium risk": "#ff9800",
  "High risk": "#f44336",
  "Very high risk": "#9c27b0",
};

/** Pick by look: `classic` keeps today's colour, `phase1` is the deliberate phase 1 token. */
const byLook = <C, P>(classic: C, phase1: P): C | P => (classicUi ? classic : phase1);

export const chartTheme = {
  /** Categorical series in fixed order; the last entry is Other. */
  series: chart,
  /** Avatar backgrounds (12 in classic, the nine series in phase 1), indexed by hash. */
  avatars: classicUi ? CLASSIC_AVATARS : chart.slice(0, 9),
  /**
   * Line colours for a chart with up to 15 distinct measures: classic keeps its
   * 15. Phase 1 takes the nine series, then a slate grey and five darker badge-family shades
   * (no risk, brand or part hue), so every measure keeps its own colour.
   */
  lines: classicUi
    ? CLASSIC_LINES
    : [
        ...chart.slice(0, 9),
        primitives.grey[500],
        primitives.cocoa[500],
        primitives.indigo[600],
        primitives.pink[800],
        primitives.blue[800],
        primitives.purple[600],
      ],
  /**
   * Named single-purpose marks for icons, chips and decoration. Classic keeps
   * the colour each screen had before the restyle; phase 1 maps to a series
   * (or the brand action fill). Prefer these over indexing `series`.
   */
  entity: {
    indigo: byLook("#6366F1", chart[0]),
    pink: byLook("#EC4899", chart[1]),
    blue: byLook("#3B82F6", chart[0]),
    teal: byLook("#0CA5AF", chart[3]),
    heart: byLook("#FF1493", chart[1]),
  },
  /** Blue action buttons in popups and forms: fill, hover and border. Phase 1 uses the primary button tokens. */
  action: {
    fill: byLook("#4C7DE7", button.primary.contained.bg.default),
    hover: byLook("#175CD3", button.primary.contained.bg.hover),
    border: byLook("#175CD3", button.primary.contained.bg.default),
  },
  /** Node colours in the entity graph. */
  entityTypes: {
    model: byLook("#2196F3", chart[0]),
    risk: byLook("#F44336", chart[4]),
    vendor: byLook("#9C27B0", chart[5]),
    evidence: byLook("#FF9800", chart[2]),
    framework: byLook("#607D8B", chart[9]),
  },
  /**
   * Risk levels on entity graph nodes: `mark` fills the 6px dot, `text` colours
   * the 9px caption on the white node. Phase 1 uses the risk text tokens for
   * the caption, since the pale marks (Very low) cannot be read as text.
   * Classic keeps its one colour per level for both.
   */
  graphRisk: {
    mark: byLook(CLASSIC_GRAPH_RISK, {
      "Low": riskMark.low,
      "Medium": riskMark.medium,
      "High": riskMark.high,
      "Critical": riskMark.critical,
      "Very low risk": riskMark.veryLow,
      "Low risk": riskMark.low,
      "Medium risk": riskMark.medium,
      "High risk": riskMark.high,
      "Very high risk": riskMark.critical,
    }),
    text: byLook(CLASSIC_GRAPH_RISK, {
      "Low": riskTokens.low.text,
      "Medium": riskTokens.medium.text,
      "High": riskTokens.high.text,
      "Critical": riskTokens.critical.text,
      "Very low risk": riskTokens.veryLow.text,
      "Low risk": riskTokens.low.text,
      "Medium risk": riskTokens.medium.text,
      "High risk": riskTokens.high.text,
      "Very high risk": riskTokens.critical.text,
    }),
  } as { mark: Record<string, string>; text: Record<string, string> },
  /** File type icons in the file picker. */
  fileTypes: {
    pdf: byLook("#E53935", chart[4]),
    image: byLook("#1E88E5", chart[7]),
    doc: byLook("#00ACC1", chart[3]),
    sheet: byLook("#43A047", chart[6]),
  },
  /** Gold and bronze for ranking medals (silver is a neutral text token). */
  medal: {
    gold: byLook("#D4AF37", chart[2]),
    bronze: byLook("#CD7F32", chart[4]),
  },
  /** Bars in the MCP audit log charts. */
  bars: {
    primary: byLook("#5C8A7D", chart[3]),
    secondary: byLook("#7986CB", chart[0]),
  },
  /** LLM provider colours in charts. */
  providers: {
    openai: byLook("#10A37F", chart[3]),
    anthropic: byLook("#D4A574", chart[4]),
    gemini: byLook("#4285F4", chart[7]),
    google: byLook("#4285F4", chart[7]),
    mistral: byLook("#FF7000", chart[2]),
    xai: byLook("#1DA1F2", chart[0]),
    bedrock: byLook("#FF9900", chart[8]),
    azure: byLook("#0078D4", chart[5]),
    together_ai: byLook("#6366F1", chart[9]),
    deepinfra: byLook("#06B6D4", chart[1]),
    cohere: byLook("#39B89D", chart[6]),
  },
  /** Fallback provider colours by index. */
  providerFallback: byLook(
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
    ],
    chart,
  ),
  /**
   * Six contestants in the LLM arena: solid colour, tint and text. Phase 1 takes
   * all three from one hue (series colour with its matching accent family).
   */
  contestants: byLook(
    [
      { main: "#3b82f6", light: "#eff6ff", text: "#1e40af" },
      { main: "#ef4444", light: "#fef2f2", text: "#991b1b" },
      { main: "#10b981", light: "#ecfdf5", text: "#065f46" },
      { main: "#f59e0b", light: "#fffbeb", text: "#92400e" },
      { main: "#8b5cf6", light: "#f5f3ff", text: "#5b21b6" },
      { main: "#ec4899", light: "#fdf2f8", text: "#9d174d" },
    ],
    [
      { main: chart[0], light: accent.indigo.bg, text: accent.indigo.text },
      { main: chart[1], light: accent.pink.bg, text: accent.pink.text },
      { main: chart[2], light: accent.amber.bg, text: accent.amber.text },
      { main: chart[3], light: accent.teal.bg, text: accent.teal.text },
      { main: chart[4], light: accent.orange.bg, text: accent.orange.text },
      { main: chart[5], light: accent.purple.bg, text: accent.purple.text },
    ],
  ),
  /** Nine tile colours on the Start here page. */
  tiles: byLook(
    [
      "#1E88E5",
      "#F4511E",
      "#7B1FA2",
      "#00796B",
      "#D84315",
      "#283593",
      "#558B2F",
      "#C2185B",
      "#1565C0",
    ],
    chart.slice(0, 9),
  ),
  /** Nine icon colours in the add-new menu. */
  menuIcons: byLook(
    [
      "#81C784",
      "#64B5F6",
      "#BA68C8",
      "#FFB74D",
      "#7986CB",
      "#E57373",
      "#F06292",
      "#4DD0E1",
      "#FF8A65",
    ],
    chart.slice(0, 9),
  ),
  /** Celebration colours for the flying hearts. */
  confetti: byLook(
    [
      "#FF1493",
      "#FF69B4",
      "#9D4EDD",
      "#06FFA5",
      "#FFD60A",
      "#FF006E",
      "#FB5607",
      "#3A86FF",
      "#8338EC",
      "#FFBE0B",
      "#FF006E",
      "#06FFA5",
    ],
    chart.slice(0, 9),
  ),
  /**
   * Work status dots (StatusDropdown, framework dashboard cards). Phase 1:
   * In progress is the Medium signal (user decision), Needs rework the High
   * signal, done states the success green; the others take distinct series
   * hues so no two non-done states look alike.
   */
  workStatus: {
    notStarted: byLook("#475467", text.tertiary),
    draft: byLook("#D97706", primitives.series.violet),
    inProgress: byLook("#2563EB", riskMark.medium),
    awaitingReview: byLook("#7C3AED", primitives.series.sky),
    awaitingApproval: byLook("#4F46E5", primitives.series.indigo),
    implemented: byLook("#059669", statusTokens.success.strong),
    done: byLook("#059669", statusTokens.success.strong),
    audited: byLook("#0D9488", primitives.series.teal),
    needsRework: byLook("#EA580C", riskMark.high),
  },
  /**
   * Status donut on the framework dashboard, in the order Not started, Draft,
   * In progress, Awaiting review, Implemented, Needs rework. Phase 1 matches
   * the status dots (`workStatus`).
   */
  statusBreakdown: byLook(
    ["#9CA3AF", "#D1D5DB", "#F59E0B", "#3B82F6", "#13715B", "#EA580C"],
    [
      text.tertiary,
      primitives.series.violet,
      riskMark.medium,
      primitives.series.sky,
      statusTokens.success.strong,
      riskMark.high,
    ],
  ),
  /** Icon tile accents for the collapsible empty-state tips; phase 1 shows every tip as an amber note. */
  tipAccents: byLook(
    [
      { bg: "#ECFDF3", icon: "#039855", border: "#A6F4C5" },
      { bg: "#EFF8FF", icon: "#1570EF", border: "#84CAFF" },
      { bg: "#FFFAEB", icon: "#DC6803", border: "#FEDF89" },
    ],
    [
      { bg: note.bg, icon: note.text, border: note.border },
      { bg: note.bg, icon: note.text, border: note.border },
      { bg: note.bg, icon: note.text, border: note.border },
    ],
  ),
  /**
   * Shared form controls. `inputHoverBorder` is the hover border of every
   * input and search box built with `utils/inputStyles`; `tabBadge` is the
   * classic green count pill on tabs (phase 1 shows a plain count instead).
   */
  controls: {
    inputHoverBorder: byLook("#5FA896", accent.primary.border),
    tabBadge: {
      text: byLook("#047857", accent.primary.text),
      bg: byLook("#D1FAE5", accent.primary.bg),
    },
    /** Destructive confirm button in the basic modal: fill and a darker hover. */
    dangerButton: {
      bg: byLook("#DB504A", riskMark.critical),
      hover: byLook("#C23C34", primitives.red[700]),
    },
  },
  /** Risk level label text (components/RiskLevel). Low and Minor use status.success.text in both looks. */
  riskLabel: {
    medium: byLook("#8D6E63", riskTokens.medium.text),
    high: byLook("#E65100", riskTokens.high.text),
    critical: byLook("#B71C1C", riskTokens.critical.text),
    veryLow: byLook("#33691E", riskTokens.veryLow.text),
  },
  /** Status count cards on the Incidents page. */
  incidentStatus: {
    open: byLook("#F9A825", primitives.series.sky),
    investigating: byLook("#FB8C00", riskMark.medium),
    mitigated: byLook("#2E7D32", statusTokens.success.strong),
    closed: byLook("#455A64", primitives.neutral[500]),
    suspended: byLook("#7B1FA2", primitives.series.violet),
    emergency: byLook("#C62828", riskMark.critical),
  },
  /** The framework chip (EU AI Act and others) on project cards. */
  frameworkChip: byLook("#014576", statusTokens.info.text),
  /** Lines in the risk history chart, where classic differs from `risk`. */
  riskHistory: {
    negligible: byLook(statusTokens.success.strong, riskMark.veryLow),
    minor: byLook("#84CC16", riskMark.low),
    major: byLook("#F97316", riskMark.high),
    noRisk: byLook(statusTokens.success.strong, primitives.neutral[500]),
    veryLow: byLook("#84CC16", riskMark.veryLow),
    low: byLook("#FCD34D", riskMark.low),
  },
  /** Count badges on the classic Filter and Group buttons. */
  countBadge: {
    filter: {
      bg: byLook("#dbeafe", statusTokens.info.bg),
      text: byLook("#1e40af", statusTokens.info.text),
    },
    group: {
      bg: byLook("#dcfce7", statusTokens.success.bg),
      text: byLook("#166534", statusTokens.success.text),
    },
  },
  /** "Reconnecting" footer in the notification panel. */
  connectionNotice: {
    bg: byLook("#FEF3C7", riskTokens.medium.bg),
    text: byLook("#92400E", statusTokens.warning.text),
  },
  /** The 30-60% band of framework progress (other bands use risk marks in both looks). */
  progressOrange: byLook("#EA580C", riskMark.high),
  /** Label text for in-flight rows (Update, processing) in log and event tables. */
  pendingLabelText: byLook("#795000", riskTokens.medium.text),
  /** Status dots on the model evaluations tab (pending uses text.disabled in both looks). */
  evaluationStatus: {
    completed: byLook("#4caf50", statusTokens.success.strong),
    running: byLook("#ff9800", riskMark.medium),
    failed: byLook("#f44336", riskMark.critical),
  },
  /** Assessment question priorities. */
  priority: {
    high: byLook("#FD7E14", riskMark.high),
    medium: byLook("#EFB70E", riskMark.medium),
    low: byLook("#ABBDA1", riskMark.low),
  },
  /**
   * The sidebar's demo data button: `remove` when demo data exists, `add`
   * otherwise. Classic draws gradients from `fill` to `fillEnd`; phase 1 uses
   * `fill` (and `hoverFill`) as plain backgrounds.
   */
  demoButton: {
    remove: {
      fill: byLook("#FEF3F2", accent.red.bg),
      fillEnd: byLook("#FEE4E2", accent.red.bg),
      hoverFill: byLook("#FEE4E2", statusTokens.error.bg),
      hoverFillEnd: byLook("#FECDCA", statusTokens.error.bg),
      border: byLook("#FECDCA", statusTokens.error.border),
      icon: byLook("#D92D20", text.error),
      hoverIcon: statusTokens.error.text,
    },
    add: {
      fill: statusTokens.success.bg,
      fillEnd: byLook("#D1FADF", statusTokens.success.bg),
      hoverFill: byLook("#D1FADF", statusTokens.success.border),
      hoverFillEnd: byLook("#A6F4C5", statusTokens.success.border),
      border: byLook("#A6F4C5", statusTokens.success.border),
      icon: byLook("#039855", statusTokens.success.strong),
      hoverIcon: byLook("#027A48", statusTokens.success.text),
    },
  },
  /** Progress-bar colours, low to high (see `scoreColor`). */
  progress: byLook(CLASSIC_PROGRESS, score),
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
 * Phase 1 rounds to the nearest of 11 `score` steps; classic keeps its old
 * 10% bands (0-10%, 11-20%, ... 91-100%). Always show the value beside it.
 */
export const scoreColor = (value: number): string => {
  const clamped = Math.min(Math.max(value, 0), 100);
  if (classicUi) return CLASSIC_PROGRESS[Math.max(Math.ceil(clamped / 10) - 1, 0)];
  return score[Math.round(clamped / 10)];
};

export default chartTheme;
