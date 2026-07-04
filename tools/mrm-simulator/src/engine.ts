import { FleetModel, MetricPoint } from "./types.js";
import { metricValue } from "../scenarios/storylines.js";

// Segments a model reports for a metric, derived from its segmented thresholds.
const segmentsFor = (model: FleetModel, metric: string): string[] => {
  const segs = model.thresholds
    .filter((t) => t.metric === metric && t.segment)
    .map((t) => t.segment as string);
  return [...new Set(segs)];
};

// Rounded metric value with an explicit finite guard: the engine feeds the
// ingestion API, which rejects non-finite values, so surface a clear local
// error rather than pushing a NaN/Infinity that the server would silently drop.
const roundedValue = (
  externalKey: string,
  metric: string,
  dayIndex: number,
  segment?: string,
): number => {
  const raw = metricValue(externalKey, metric, dayIndex, segment);
  if (!Number.isFinite(raw)) {
    throw new Error(
      `Non-finite metric value for ${externalKey}/${metric} (day ${dayIndex}, segment ${segment ?? "overall"})`,
    );
  }
  return Number(raw.toFixed(4));
};

export const generatePoints = (model: FleetModel, dayIndex: number, date: Date): MetricPoint[] => {
  const at = date.toISOString();
  const points: MetricPoint[] = [];
  for (const metric of model.metricKeys) {
    // Base (overall) point.
    points.push({
      metric,
      value: roundedValue(model.externalKey, metric, dayIndex),
      at,
      window: "daily",
      segment: "overall",
      context: { source_job: "nightly-monitor", day_index: dayIndex },
    });
    // Segmented points where a threshold targets a sub-population.
    for (const seg of segmentsFor(model, metric)) {
      points.push({
        metric,
        value: roundedValue(model.externalKey, metric, dayIndex, seg),
        at,
        window: "daily",
        segment: seg,
        context: { source_job: "nightly-monitor", day_index: dayIndex },
      });
    }
  }
  return points;
};

export const generateRange = (model: FleetModel, startDate: Date, days: number): MetricPoint[] => {
  const all: MetricPoint[] = [];
  for (let d = 0; d < days; d++) {
    const date = new Date(startDate.getTime() + d * 86_400_000);
    all.push(...generatePoints(model, d, date));
  }
  return all;
};
