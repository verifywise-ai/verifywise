import { FleetModel, MetricPoint } from "./types.js";
import { computeMetrics } from "./computeClient.js";

// Segments a model reports for a metric, from its segmented thresholds.
const segmentsFor = (model: FleetModel, metric: string): string[] => {
  const segs = model.thresholds
    .filter((t) => t.metric === metric && t.segment)
    .map((t) => t.segment as string);
  return [...new Set(segs)];
};

const guardFinite = (v: number, model: string, metric: string, seg: string): number => {
  if (!Number.isFinite(v)) {
    throw new Error(`Non-finite computed value ${model}/${metric} (segment ${seg})`);
  }
  return Number(v.toFixed(4));
};

// Compute one model's points for a given period date (YYYY-MM-DD).
export const generatePoints = (model: FleetModel, _dayIndex: number, date: Date): MetricPoint[] => {
  const at = date.toISOString();
  const period = at.slice(0, 10); // YYYY-MM-DD
  const result = computeMetrics(model.dataset, period, model.metricKeys, model.segmentCol);
  const points: MetricPoint[] = [];

  for (const metric of model.metricKeys) {
    const overall = (result as Record<string, number>)[metric];
    if (overall === undefined) continue; // metric not returned (e.g. no data that period)
    points.push({
      metric,
      value: guardFinite(overall, model.externalKey, metric, "overall"),
      at,
      window: "daily",
      segment: "overall",
      context: { source_job: "nightly-monitor", period },
    });
    // Segmented points from the fairness block, where a threshold targets a segment.
    for (const seg of segmentsFor(model, metric)) {
      const segVal = result.fairness?.[seg]?.[metric];
      if (segVal === undefined) continue;
      points.push({
        metric,
        value: guardFinite(segVal, model.externalKey, metric, seg),
        at,
        window: "daily",
        segment: seg,
        context: { source_job: "nightly-monitor", period },
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
