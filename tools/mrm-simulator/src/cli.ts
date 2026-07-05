import { loadConfig, assertSafeTarget, readCache, writeCache } from "./config.js";
import { runSetup } from "./setup.js";
import { runVerify, runContractChecks } from "./verify.js";
import { writeReport } from "./report.js";
import { IngestClient } from "./ingestClient.js";
import { generateRange, generatePoints } from "./engine.js";
import { loadConfig as loadFleetConfig } from "./configLoader.js";
import { Finding, IngestResultPoint, MetricPoint } from "./types.js";

const arg = (name: string, def: string): string => {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
};
const dryRun = process.argv.includes("--dry-run");

const chunk = <T>(xs: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const main = async () => {
  const cmd = process.argv[2];
  const cfg = loadConfig(process.argv);
  assertSafeTarget(cfg);
  const FLEET = loadFleetConfig();

  if (cmd === "setup") {
    const { token, models, findings } = await runSetup(cfg);
    console.log(`setup complete. token cached. models: ${Object.keys(models).join(", ")}`);
    const cache = readCache();
    cache.token = token;
    writeCache(cache);
    if (findings.length) console.log(`${findings.length} setup finding(s) recorded`);
    return;
  }

  if (cmd === "backfill") {
    const days = Number(arg("--days", "30"));
    const cache = readCache();
    if (!cache.token) throw new Error("run `setup` first (no token cached)");
    const client = new IngestClient(cfg, cache.token);
    // The bundled datasets are fixed-date (2026-06-01 onward), so pass
    // --start-date to map the backfill onto the dataset's dates. Without it,
    // backfill walks the last N days ending today, which only works when the
    // datasets cover that range.
    const startArg = arg("--start-date", "");
    const start = startArg
      ? new Date(`${startArg}T00:00:00.000Z`)
      : new Date(Date.now() - days * 86_400_000);
    const resultsByKey: Record<string, IngestResultPoint[]> = {};
    for (const model of FLEET) {
      const points = generateRange(model, start, days);
      if (dryRun) {
        console.log(`[dry-run] ${model.externalKey}: ${points.length} points`);
        continue;
      }
      resultsByKey[model.externalKey] = [];
      for (const batch of chunk(points, 200)) {
        const results = await client.pushBatch(model.externalKey, batch);
        resultsByKey[model.externalKey].push(...results);
      }
      const breaches = resultsByKey[model.externalKey].filter((r) => r.status === "breach" || r.status === "warn").length;
      console.log(`${model.externalKey}: pushed ${points.length}, ${breaches} warn/breach`);
    }
    if (!dryRun) {
      cache.lastBackfill = new Date(start.getTime()).toISOString();
      writeCache(cache);
      const contractFindings = runContractChecks(resultsByKey);
      writeReport(contractFindings);
    }
    return;
  }

  if (cmd === "live") {
    const interval = Number(arg("--interval", "5").replace("s", "")) * 1000;
    const cache = readCache();
    if (!cache.token) throw new Error("run `setup` first");
    const client = new IngestClient(cfg, cache.token);
    let day = 0;
    console.log(`live mode: pushing every ${interval / 1000}s (Ctrl-C to stop)`);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      for (const model of FLEET) {
        const points = generatePoints(model, day, new Date());
        if (dryRun) {
          console.log(`[dry-run] ${model.externalKey} day ${day}: ${points.length} points`);
        } else {
          const results = await client.pushBatch(model.externalKey, points);
          const b = results.filter((r) => r.status === "breach" || r.status === "warn").length;
          if (b) console.log(`${model.externalKey} day ${day}: ${b} warn/breach`);
        }
      }
      day++;
      await sleep(interval);
    }
  }

  if (cmd === "verify") {
    const cache = readCache();
    const findings: Finding[] = await runVerify(cfg, cache.models);
    writeReport(findings);
    console.log(`verify complete: ${findings.length} finding(s) -> gaps-report.md`);
    return;
  }

  if (cmd === "report") {
    console.log("gaps-report.md is written by `backfill` and `verify`.");
    return;
  }

  if (cmd === "teardown") {
    console.log("teardown: decommission the created models in the UI, then delete .mrm-simulator.json");
    return;
  }

  console.log("usage: sim <setup|backfill|live|verify|report|teardown> [--days N] [--interval Ns] [--dry-run] [--base-url URL]");
};

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
