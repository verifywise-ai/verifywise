import { SimConfig, Finding } from "./types.js";
import { JwtClient } from "./jwtClient.js";
import { FLEET } from "../scenarios/fleet.js";
import { readCache, writeCache } from "./config.js";

export const runSetup = async (
  cfg: SimConfig,
): Promise<{ token: string; models: Record<string, number>; findings: Finding[] }> => {
  const findings: Finding[] = [];
  const cache = readCache();
  const client = new JwtClient(cfg);
  await client.login();

  for (const model of FLEET) {
    if (cache.models[model.externalKey]) continue; // idempotent reuse

    const modelId = await client.createModel(model.name, model.provider);

    // external_key is NOT on the tier endpoint — set it via modelInventory PATCH.
    // This split is itself a contract friction worth recording.
    await client.setExternalKey(modelId, model.externalKey);
    findings.push({
      category: "contract",
      severity: "low",
      title: "external_key requires a separate PATCH call",
      expected: "Setting the ingestion key alongside tier in one MRM call",
      actual: "external_key is only settable via PATCH /api/modelInventory/:id, separate from PUT /api/mrm/models/:id/tier",
      repro: "Attempt to set external_key in the tier PUT body; it is ignored.",
    });

    await client.assignTier(modelId, model.tier, model.materialityDrivers);
    for (const key of model.metricKeys) await client.createMetricKey(key);
    for (const spec of model.thresholds) await client.createThreshold(modelId, spec);

    cache.models[model.externalKey] = modelId;
    writeCache(cache);
  }

  if (!cache.token) {
    cache.token = await client.createIngestionToken("mrm-simulator");
    writeCache(cache);
  }

  return { token: cache.token, models: cache.models, findings };
};
