import { useEffect, useState } from "react";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from "@mui/material";
import Chip from "../../../components/Chip";
import Select from "../../../components/Inputs/Select";
import { EmptyState } from "../../../components/EmptyState";
import CustomizableSkeleton from "../../../components/Skeletons";
import { displayFormattedDate } from "../../../tools/isoDateToString";
import {
  useFleetTiering,
  useMetricTrend,
  useModelBreaches,
  useModelMonitoring,
  useThresholds,
} from "../../../../application/hooks/useMrm";
import { IMrmMonitoringRow, IMrmTrendPoint } from "../../../../domain/interfaces/i.mrm";
import {
  evalStatusChipVariant,
  evalStatusLabel,
  findMatchingThreshold,
  fleetModelName,
  thresholdSummary,
} from "./constants";
import { relativeTime } from "./dateUtils";
import {
  mrmSectionIntroStyle,
  mrmTableCellStyle,
  mrmTableContainerStyle,
  mrmTableHeadCellStyle,
} from "./mrmStyles";

interface MonitoringTabProps {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

/**
 * A tiny inline sparkline for a metric's recent trend. Renders nothing meaningful
 * with fewer than two points (shows an em dash instead). Pure presentational SVG —
 * no chart library dependency, matches the mockup's compact trend cell.
 */
const TrendSparkline = ({ points }: { points: IMrmTrendPoint[] }) => {
  const theme = useTheme();
  if (points.length < 2) {
    return (
      <Typography component="span" sx={{ fontSize: "13px", color: "text.tertiary" }}>
        —
      </Typography>
    );
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = 72;
  const height = 20;
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const d = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / span) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} role="img" aria-label="Metric trend">
      <path d={d} fill="none" stroke={theme.palette.primary.main} strokeWidth={1.5} />
    </svg>
  );
};

/** Self-fetching trend cell — pulls the metric's own value/time series lazily. */
const MetricTrendCell = ({ modelId, metric }: { modelId: number; metric: string }) => {
  const { data: points = [] } = useMetricTrend(modelId, metric);
  return <TrendSparkline points={points} />;
};

const MonitoringTab = ({ onError }: MonitoringTabProps) => {
  const theme = useTheme();
  const { data: fleet = [] } = useFleetTiering();
  const [modelId, setModelId] = useState<number | "">("");
  const numericModelId = modelId === "" ? null : Number(modelId);

  const { data: rows = [], isLoading, isError, error } = useModelMonitoring(numericModelId);
  const {
    data: thresholds = [],
    isError: isThresholdsError,
    error: thresholdsError,
  } = useThresholds(numericModelId ? { modelId: numericModelId } : undefined);
  const { data: breaches = [] } = useModelBreaches(numericModelId);

  useEffect(() => {
    if (isError && error) onError(error.message);
    if (isThresholdsError && thresholdsError) onError(thresholdsError.message);
  }, [isError, error, isThresholdsError, thresholdsError, onError]);

  return (
    <Box>
      <Typography sx={mrmSectionIntroStyle}>
        Ongoing monitoring. Your pipeline pushes raw metrics to one open ingestion endpoint;
        VerifyWise owns thresholds, evaluation, alerting and the audit trail — the receiving end
        only. Configure the endpoint and tokens in Settings &rarr; Metrics feed &amp; tokens.
      </Typography>

      <Box sx={{ maxWidth: "360px", marginBottom: "24px" }}>
        <Select
          id="mrm-monitoring-model"
          label="Model"
          placeholder="Select a model"
          value={modelId}
          items={fleet.map((row) => ({ _id: row.id, name: fleetModelName(row) }))}
          onChange={(e) => setModelId(Number(e.target.value))}
        />
      </Box>

      {modelId === "" ? (
        <EmptyState message="Select a model to view its monitored metrics." />
      ) : isLoading ? (
        <CustomizableSkeleton variant="rectangular" width="100%" height={200} />
      ) : rows.length === 0 ? (
        <EmptyState message="No data yet. This model is awaiting its first metric from your monitoring feed." />
      ) : (
        <TableContainer sx={mrmTableContainerStyle}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={mrmTableHeadCellStyle}>Metric</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Latest</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Threshold</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Trend</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Last received</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {numericModelId !== null &&
                rows.map((row: IMrmMonitoringRow) => {
                  const resolvedModelId: number = numericModelId;
                  const threshold = findMatchingThreshold(
                    thresholds,
                    row.metric,
                    row.segment,
                    row.window,
                  );
                  return (
                    <TableRow key={`${row.metric}-${row.segment}-${row.window}`} hover>
                      <TableCell sx={mrmTableCellStyle}>
                        {row.metric}
                        {row.segment && row.segment !== "overall" ? (
                          <Typography
                            component="span"
                            sx={{ fontSize: "12px", color: "text.tertiary", marginLeft: "6px" }}
                          >
                            ({row.segment})
                          </Typography>
                        ) : null}
                      </TableCell>
                      <TableCell sx={mrmTableCellStyle}>{row.value}</TableCell>
                      <TableCell sx={mrmTableCellStyle}>
                        {threshold ? (
                          thresholdSummary(threshold)
                        ) : (
                          <Typography component="span" sx={{ color: "text.tertiary" }}>
                            No threshold defined
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={mrmTableCellStyle}>
                        <MetricTrendCell modelId={resolvedModelId} metric={row.metric} />
                      </TableCell>
                      <TableCell sx={mrmTableCellStyle}>{relativeTime(row.at)}</TableCell>
                      <TableCell sx={mrmTableCellStyle}>
                        <Chip
                          label={evalStatusLabel(row.status)}
                          variant={evalStatusChipVariant(row.status)}
                          uppercase={false}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {modelId !== "" && (
        <Box sx={{ marginTop: "32px" }}>
          <Typography
            sx={{ fontSize: "15px", fontWeight: 600, color: "text.primary", marginBottom: "8px" }}
          >
            Breach history
          </Typography>
          <Typography sx={mrmSectionIntroStyle}>
            Every warning and breach evaluation for this model, newest first, with the threshold as
            it stood at evaluation time. A breach raises an alert and can flag the model for
            revalidation.
          </Typography>
          {breaches.length === 0 ? (
            <EmptyState message="No breaches recorded. Every metric is within its threshold." />
          ) : (
            <TableContainer sx={mrmTableContainerStyle}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={mrmTableHeadCellStyle}>Metric</TableCell>
                    <TableCell sx={mrmTableHeadCellStyle}>Value</TableCell>
                    <TableCell sx={mrmTableHeadCellStyle}>Threshold at evaluation</TableCell>
                    <TableCell sx={mrmTableHeadCellStyle}>Metric date</TableCell>
                    <TableCell sx={mrmTableHeadCellStyle}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {breaches.map((b) => (
                    <TableRow key={b.evaluation_id} hover>
                      <TableCell sx={mrmTableCellStyle}>
                        {b.metric}
                        {b.segment && b.segment !== "overall" ? (
                          <Typography
                            component="span"
                            sx={{ fontSize: "12px", color: "text.tertiary", marginLeft: "6px" }}
                          >
                            ({b.segment})
                          </Typography>
                        ) : null}
                      </TableCell>
                      <TableCell sx={mrmTableCellStyle}>{b.value}</TableCell>
                      <TableCell sx={mrmTableCellStyle}>
                        {b.threshold_snapshot
                          ? thresholdSummary({
                              op: b.threshold_snapshot.op!,
                              value_num: b.threshold_snapshot.value_num,
                              value_lo: b.threshold_snapshot.value_lo,
                              value_hi: b.threshold_snapshot.value_hi,
                            })
                          : "—"}
                      </TableCell>
                      <TableCell sx={mrmTableCellStyle}>{displayFormattedDate(b.at)}</TableCell>
                      <TableCell sx={mrmTableCellStyle}>
                        <Chip
                          label={evalStatusLabel(b.status)}
                          variant={evalStatusChipVariant(b.status)}
                          uppercase={false}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      <Typography
        sx={{
          fontSize: "12px",
          color: "text.tertiary",
          marginTop: "12px",
          lineHeight: 1.6,
          borderTop: `1px solid ${theme.palette.border.light}`,
          paddingTop: "12px",
        }}
      >
        Five threshold shapes cover the common cases: floor (≥), above (&gt;), ceiling (≤), below
        (&lt;) and band (outside a min–max). Manage them in Settings &rarr; Default thresholds. A
        breach raises an alert and can flag the model for revalidation.
      </Typography>
    </Box>
  );
};

export default MonitoringTab;
