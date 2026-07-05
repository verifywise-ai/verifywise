import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { FleetModel, ThresholdSpec } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG = join(HERE, "..", "config.yaml");

const VALID_METRICS = new Set(["psi", "auc", "gini", "ks"]);
const VALID_OPS = new Set(["gt", "gte", "lt", "lte", "outside"]);
const VALID_SEV = new Set(["warn", "high", "critical"]);
const VALID_ACTIONS = new Set(["notify", "notify_flag_revalidation"]);

interface RawThreshold {
  metric: string;
  op: string;
  value_num?: number;
  value_lo?: number;
  value_hi?: number;
  severity: string;
  breach_action: string;
  segment?: string;
  window?: string;
}
interface RawModel {
  external_key: string;
  name: string;
  provider: string;
  tier: string;
  materiality_drivers: string;
  dataset: string;
  segment_col?: string;
  metrics: string[];
  thresholds: RawThreshold[];
}

const fail = (msg: string): never => {
  throw new Error(`invalid config: ${msg}`);
};

export const parseConfig = (yamlText: string): FleetModel[] => {
  const doc = parse(yamlText) as { models?: RawModel[] };
  if (!doc || !Array.isArray(doc.models)) fail("top-level 'models' array is required");
  return doc.models!.map((m, i) => {
    const at = `models[${i}]`;
    if (!m.external_key) fail(`${at}: external_key is required`);
    if (!m.dataset) fail(`${at} (${m.external_key}): dataset is required`);
    if (!["1", "2", "3"].includes(String(m.tier))) fail(`${at}: tier must be "1"|"2"|"3"`);
    if (!Array.isArray(m.metrics) || m.metrics.length === 0) fail(`${at}: metrics is required`);
    for (const mk of m.metrics) if (!VALID_METRICS.has(mk)) fail(`${at}: unknown metric '${mk}'`);
    const thresholds: ThresholdSpec[] = (m.thresholds ?? []).map((t, j) => {
      const tat = `${at}.thresholds[${j}]`;
      if (!VALID_OPS.has(t.op)) fail(`${tat}: unknown op '${t.op}'`);
      if (!VALID_SEV.has(t.severity)) fail(`${tat}: unknown severity '${t.severity}'`);
      if (!VALID_ACTIONS.has(t.breach_action)) fail(`${tat}: unknown breach_action '${t.breach_action}'`);
      return {
        metric: t.metric,
        op: t.op as ThresholdSpec["op"],
        value_num: t.value_num ?? null,
        value_lo: t.value_lo ?? null,
        value_hi: t.value_hi ?? null,
        severity: t.severity as ThresholdSpec["severity"],
        breach_action: t.breach_action as ThresholdSpec["breach_action"],
        segment: t.segment ?? null,
        window: t.window ?? null,
      };
    });
    return {
      externalKey: m.external_key,
      name: m.name,
      provider: m.provider,
      tier: String(m.tier) as FleetModel["tier"],
      materialityDrivers: m.materiality_drivers,
      dataset: m.dataset,
      segmentCol: m.segment_col,
      metricKeys: m.metrics,
      thresholds,
    };
  });
};

export const loadConfig = (path: string = DEFAULT_CONFIG): FleetModel[] =>
  parseConfig(readFileSync(path, "utf8"));
