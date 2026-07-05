import { SimConfig, FleetModel, MetricPoint, IngestResultPoint, Finding } from "../types.js";
import { ComputeResult } from "../computeClient.js";
import { DashboardEvent } from "./events.js";

export interface IngestLike {
  pushBatch(externalKey: string, points: MetricPoint[]): Promise<IngestResultPoint[]>;
}

export interface RunnerDeps {
  loadConfig: () => FleetModel[];
  runSetup: (cfg: SimConfig) => Promise<{ token: string; models: Record<string, number>; findings: Finding[] }>;
  makeIngestClient: (cfg: SimConfig, token: string) => IngestLike;
  computeMetrics: (dataset: string, period: string, metrics: string[], segmentCol?: string) => ComputeResult;
}

export interface RunnerOpts {
  cfg: SimConfig;
  startDate: Date;
  days: number;
}

// Segments a model reports for a metric, from its segmented thresholds.
const segmentsFor = (model: FleetModel, metric: string): string[] => {
  const segs = model.thresholds.filter((t) => t.metric === metric && t.segment).map((t) => t.segment as string);
  return [...new Set(segs)];
};

// Evaluate a value against a threshold spec, mirroring the server engine.
const evalStatus = (
  value: number,
  t: FleetModel["thresholds"][number] | undefined,
): { status: "ok" | "warn" | "breach" | "no_threshold"; breached: boolean } => {
  if (!t) return { status: "no_threshold", breached: false };
  let breached = false;
  if (t.op === "gt") breached = value > (t.value_num ?? 0);
  else if (t.op === "gte") breached = value >= (t.value_num ?? 0);
  else if (t.op === "lt") breached = value < (t.value_num ?? 0);
  else if (t.op === "lte") breached = value <= (t.value_num ?? 0);
  else if (t.op === "outside") breached = value < (t.value_lo ?? 0) || value > (t.value_hi ?? 0);
  if (!breached) return { status: "ok", breached: false };
  return { status: t.severity === "warn" ? "warn" : "breach", breached: true };
};

export const runDashboardSimulation = async (
  deps: RunnerDeps,
  opts: RunnerOpts,
  emit: (e: DashboardEvent) => void,
): Promise<void> => {
  const totals = { computed: 0, pushed: 0, accepted: 0, breaches: 0 };
  try {
    const fleet = deps.loadConfig();
    emit({
      type: "run_started",
      target: opts.cfg.baseUrl,
      startDate: opts.startDate.toISOString().slice(0, 10),
      days: opts.days,
      models: fleet.map((m) => ({
        externalKey: m.externalKey,
        name: m.name,
        tier: m.tier,
        metrics: m.metricKeys,
        thresholds: m.thresholds,
      })),
    });

    const setup = await deps.runSetup(opts.cfg);
    const client = deps.makeIngestClient(opts.cfg, setup.token);

    for (let d = 0; d < opts.days; d++) {
      const date = new Date(opts.startDate.getTime() + d * 86_400_000);
      const period = date.toISOString().slice(0, 10);
      const at = date.toISOString();

      for (const model of fleet) {
        const result = deps.computeMetrics(model.dataset, period, model.metricKeys, model.segmentCol);
        const points: MetricPoint[] = [];

        for (const metric of model.metricKeys) {
          const overall = (result as Record<string, number>)[metric];
          if (overall === undefined || !Number.isFinite(overall)) continue;
          const rounded = Number(overall.toFixed(4));
          const t = model.thresholds.find((x) => x.metric === metric && !x.segment);
          const { status, breached } = evalStatus(rounded, t);
          totals.computed++;
          emit({ type: "metric", externalKey: model.externalKey, period, metric, value: rounded, segment: "overall", status, threshold: t ?? null });
          if (breached && t) {
            totals.breaches++;
            emit({ type: "breach", externalKey: model.externalKey, period, metric, value: rounded, severity: t.severity, flagged: t.breach_action === "notify_flag_revalidation" });
          }
          points.push({ metric, value: rounded, at, window: "daily", segment: "overall", context: { period } });

          for (const seg of segmentsFor(model, metric)) {
            const segVal = result.fairness?.[seg]?.[metric];
            if (segVal === undefined || !Number.isFinite(segVal)) continue;
            const rSeg = Number(segVal.toFixed(4));
            const ts = model.thresholds.find((x) => x.metric === metric && x.segment === seg);
            const segEval = evalStatus(rSeg, ts);
            totals.computed++;
            emit({ type: "metric", externalKey: model.externalKey, period, metric, value: rSeg, segment: seg, status: segEval.status, threshold: ts ?? null });
            if (segEval.breached && ts) {
              totals.breaches++;
              emit({ type: "breach", externalKey: model.externalKey, period, metric, value: rSeg, severity: ts.severity, flagged: ts.breach_action === "notify_flag_revalidation" });
            }
            points.push({ metric, value: rSeg, at, window: "daily", segment: seg, context: { period } });
          }
        }

        if (points.length) {
          const results = await client.pushBatch(model.externalKey, points);
          totals.pushed += points.length;
          totals.accepted += results.length;
          emit({ type: "push", externalKey: model.externalKey, period, accepted: results.length, results: results.map((r) => ({ metric: r.metric, status: r.status })) });
        }
      }
    }

    emit({ type: "run_done", totals });
  } catch (e) {
    emit({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
