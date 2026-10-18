import type { ReactNode } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { TrendingDown } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "../../components/EmptyState";
import useFormattedDate from "../../../application/hooks/useFormattedDate";
import { useAedtRunTrend } from "../../../application/hooks/useAedtBiasAudit";
import {
  describeAedtError,
  type AedtTrendPoint,
  type AedtTrendSegment,
  type AedtTrendSeries,
} from "../../../application/repository/aedtBiasAudit.repository";
import { palette } from "../../themes/palette";
import { categoryLabel } from "./categoryLabels";
import { cardSx, cellSx, headSx, titleSx } from "./styles";

/**
 * The lowest impact ratio of each run over time, broken wherever the
 * configuration changed.
 *
 * Each segment is its own `Line`, never one series with a gap, so nothing is
 * interpolated across a break: a line across a configuration change would
 * assert that the runs either side measured the same thing, and nobody
 * established that. Each break is marked on the chart by number and listed
 * below with what changed. The server builds the series; raw results never
 * reach this page.
 */

/** The four-fifths convention's line. Not a statutory threshold. */
const CONVENTION = 0.8;

const METRIC_LABEL: Record<string, string> = {
  selection_rate: "Selection rate",
  scoring_rate: "Scoring rate",
};

const ratioText = (r: number | null) => (r === null ? "—" : r.toFixed(3));

interface ChartRow {
  key: string;
  runId: number;
  date: string;
  category: string | null;
  flagged: boolean;
  lowestRatio: number | null;
  /** `s0`, `s1`, … hold the ratio for the segment the run belongs to only. */
  [segment: `s${number}`]: number | null | undefined;
}

function chartRows(segments: AedtTrendSegment[]): ChartRow[] {
  return segments.flatMap((segment, i) =>
    segment.points.map((p) => {
      const row: ChartRow = {
        key: String(p.runId),
        runId: p.runId,
        date: p.date,
        category: p.category,
        flagged: p.flagged,
        lowestRatio: p.lowestRatio,
      };
      row[`s${i}`] = p.lowestRatio;
      return row;
    }),
  );
}

const Frame = ({ children, testId }: { children: ReactNode; testId: string }) => (
  <Box sx={cardSx} data-testid={testId}>
    <Typography sx={{ ...titleSx, mb: "4px" }}>Lowest impact ratio across runs</Typography>
    <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mb: "12px" }}>
      Each point is the lowest impact ratio of any group in one run. The line breaks wherever the
      profile, question set, job description or measure changed, and each break says what changed.
    </Typography>
    {children}
  </Box>
);

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: ChartRow }>;
  formatDate: (d: string) => string;
}

const TrendTooltip = ({ active, payload, formatDate }: TooltipProps) => {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <Box
      sx={{
        backgroundColor: palette.background.main,
        border: `1px solid ${palette.border.dark}`,
        borderRadius: "4px",
        p: "8px",
      }}
    >
      <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
        {formatDate(row.date)}
      </Typography>
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.primary }}>
        {ratioText(row.lowestRatio)}
      </Typography>
      {row.category && (
        <Typography sx={{ fontSize: 12, color: palette.text.secondary }}>
          {categoryLabel(row.category)}
        </Typography>
      )}
    </Box>
  );
};

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: ChartRow;
}

/** A flagged run's point in the warning colour, every other point in the line's. */
const TrendDot = ({ cx, cy, payload }: DotProps) => {
  if (cx == null || cy == null || !payload) return <g />;
  const color = payload.flagged ? palette.status.warning.text : palette.brand.primary;
  return <circle cx={cx} cy={cy} r={4} fill={color} stroke={color} />;
};

const SegmentHeading = ({ segment }: { segment: AedtTrendSegment }) => (
  <Typography sx={{ fontSize: 12, fontWeight: 600, color: palette.text.secondary }}>
    <span>Profile version</span> <span>{segment.profileVersion}</span>
    <span>{" · "}</span>
    <span>Question set</span> <span>{segment.questionSetVersion}</span>
    <span>{" · "}</span>
    <span>{METRIC_LABEL[segment.metric] ?? segment.metric}</span>
    {segment.jobDescriptionKey && (
      <>
        <span>{" · "}</span>
        <span>Job description</span> <span>{segment.jobDescriptionKey}</span>
      </>
    )}
  </Typography>
);

const PointsTable = ({
  points,
  formatDate,
}: {
  points: AedtTrendPoint[];
  formatDate: (d: string) => string;
}) => (
  <Box sx={{ overflowX: "auto" }}>
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell sx={headSx}>Recorded</TableCell>
          <TableCell sx={headSx}>Run</TableCell>
          <TableCell sx={headSx} align="right">
            Lowest impact ratio
          </TableCell>
          <TableCell sx={headSx}>Category</TableCell>
          <TableCell sx={headSx}>Notes</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {points.map((p) => (
          <TableRow key={p.runId} data-testid={`aedt-trend-point-${p.runId}`}>
            <TableCell sx={cellSx}>{formatDate(p.date)}</TableCell>
            <TableCell sx={cellSx}>{p.runId}</TableCell>
            <TableCell
              sx={{
                ...cellSx,
                color: p.flagged ? palette.status.warning.text : cellSx.color,
                fontWeight: p.flagged ? 600 : 400,
              }}
              align="right"
            >
              {ratioText(p.lowestRatio)}
            </TableCell>
            <TableCell sx={cellSx}>{p.category ? categoryLabel(p.category) : "—"}</TableCell>
            <TableCell sx={cellSx}>
              {p.lowestRatio === null ? (
                <span>No impact ratio was computed for this run.</span>
              ) : p.flagged ? (
                <span>Below 0.80</span>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </Box>
);

const BreakNotice = ({ number, reasons }: { number: number; reasons: string[] }) => (
  <Box
    sx={{
      border: `1px solid ${palette.status.warning.border}`,
      backgroundColor: palette.status.warning.bg,
      borderRadius: "4px",
      p: "12px",
    }}
  >
    <Typography sx={{ fontSize: 12, fontWeight: 600, color: palette.status.warning.text }}>
      <span>Break</span> <span>{number}</span>
    </Typography>
    <Typography sx={{ fontSize: 13, color: palette.text.secondary, mt: "4px" }}>
      The line stops here because:
    </Typography>
    {/* Each reason in its own element, so the page translator finds it whole. */}
    <Box component="ul" sx={{ m: 0, pl: "18px" }}>
      {reasons.map((reason) => (
        <Typography
          component="li"
          key={reason}
          sx={{ fontSize: 13, color: palette.text.secondary }}
        >
          {reason}
        </Typography>
      ))}
    </Box>
    <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mt: "4px" }}>
      Runs either side of a break are not comparable, so they are not joined by a line.
    </Typography>
  </Box>
);

export interface RatioTrendProps {
  series: AedtTrendSeries;
}

const RatioTrend = ({ series }: RatioTrendProps) => {
  const formatDate = useFormattedDate();
  const rows = chartRows(series.segments);
  const plotted = rows.filter((r) => r.lowestRatio !== null).length;

  if (plotted < 2) {
    return (
      <Frame testId="aedt-ratio-trend">
        <Box data-testid="aedt-trend-empty">
          <EmptyState
            icon={TrendingDown}
            message="Not enough runs to show a trend yet. A trend needs two or more runs that computed impact ratios."
            showBorder
          />
        </Box>
      </Frame>
    );
  }

  const dateOf = new Map(rows.map((r) => [r.key, r.date]));
  // A break is drawn at the first run after it.
  const breakMarks = series.breaks.map((b, i) => {
    const at = rows.findIndex((r) => r.runId === b.afterRunId);
    return { number: i + 1, x: rows[at + 1]?.key, afterRunId: b.afterRunId };
  });

  return (
    <Frame testId="aedt-ratio-trend">
      <Stack gap="16px">
        <Box sx={{ width: "100%", height: "240px" }} data-testid="aedt-trend-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={palette.border.light} strokeDasharray="3 3" />
              <XAxis
                dataKey="key"
                tickFormatter={(key: string) => formatDate(dateOf.get(key) ?? "")}
                tick={{ fontSize: 11, fill: palette.text.tertiary }}
                stroke={palette.border.dark}
              />
              <YAxis
                domain={[0, 1]}
                ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
                tick={{ fontSize: 11, fill: palette.text.tertiary }}
                stroke={palette.border.dark}
                width={36}
              />
              <Tooltip content={<TrendTooltip formatDate={formatDate} />} />
              <ReferenceLine
                y={CONVENTION}
                stroke={palette.text.tertiary}
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
              />
              {breakMarks.map((m) =>
                m.x ? (
                  <ReferenceLine
                    key={m.afterRunId}
                    x={m.x}
                    stroke={palette.status.warning.text}
                    strokeDasharray="2 2"
                    label={{
                      value: String(m.number),
                      position: "top",
                      fontSize: 11,
                      fill: palette.status.warning.text,
                    }}
                  />
                ) : null,
              )}
              {series.segments.map((segment, i) => (
                <Line
                  key={`segment-${i}-${segment.points[0]?.runId ?? i}`}
                  type="linear"
                  dataKey={`s${i}`}
                  stroke={palette.brand.primary}
                  strokeWidth={2}
                  connectNulls={false}
                  dot={<TrendDot />}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Box>
        <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
          The dashed line at 0.80 marks the EEOC four-fifths convention. Local Law 144 does not
          adopt it: a ratio below it is a number to report and investigate, and a ratio above it is
          not a clearance.
        </Typography>

        {series.segments.map((segment, i) => {
          const last = segment.points[segment.points.length - 1];
          const breakIndex = last
            ? series.breaks.findIndex((b) => b.afterRunId === last.runId)
            : -1;
          return (
            <Stack key={`segment-${i}`} gap="8px" data-testid={`aedt-trend-segment-${i}`}>
              <SegmentHeading segment={segment} />
              <PointsTable points={segment.points} formatDate={formatDate} />
              {breakIndex !== -1 && (
                <Box data-testid={`aedt-trend-break-${series.breaks[breakIndex].afterRunId}`}>
                  <BreakNotice
                    number={breakIndex + 1}
                    reasons={series.breaks[breakIndex].reasons}
                  />
                </Box>
              )}
            </Stack>
          );
        })}
      </Stack>
    </Frame>
  );
};

/** The trend for a use case, loaded from the server, with its loading and error states. */
export const RatioTrendSection = ({ projectId }: { projectId: number }) => {
  const { data, isLoading, error } = useAedtRunTrend(projectId);
  if (isLoading) {
    return (
      <Frame testId="aedt-ratio-trend-loading">
        <Stack alignItems="center" sx={{ py: "16px" }}>
          <CircularProgress size={20} />
        </Stack>
      </Frame>
    );
  }
  if (error || !data) {
    return (
      <Frame testId="aedt-ratio-trend-error">
        <Alert severity="error" sx={{ borderRadius: "4px" }}>
          {describeAedtError(error).message}
        </Alert>
      </Frame>
    );
  }
  return <RatioTrend series={data} />;
};

export default RatioTrend;
