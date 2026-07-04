import { SimConfig, Finding, IngestResultPoint } from "./types.js";
import { JwtClient } from "./jwtClient.js";
import { FLEET } from "../scenarios/fleet.js";

// Which (externalKey, metric) pairs we engineered to breach during backfill.
const EXPECTED_BREACHES: { externalKey: string; metric: string }[] = [
  { externalKey: "credit-scoring-v3", metric: "psi" },
  { externalKey: "loan-approval-v1", metric: "gini" },
  { externalKey: "churn-propensity-v1", metric: "psi" },
];

// Contract check: engineered breaches must appear as warn/breach in results.
export const runContractChecks = (
  resultsByKey: Record<string, IngestResultPoint[]>,
): Finding[] => {
  const findings: Finding[] = [];
  for (const exp of EXPECTED_BREACHES) {
    const results = resultsByKey[exp.externalKey] ?? [];
    const hit = results.some(
      (r) => r.metric === exp.metric && (r.status === "breach" || r.status === "warn"),
    );
    if (!hit) {
      findings.push({
        category: "contract",
        severity: "high",
        title: `Engineered breach never fired for ${exp.externalKey}/${exp.metric}`,
        expected: `At least one warn/breach status for ${exp.metric}`,
        actual: "All points returned ok/no_threshold — threshold match or setup gap",
        repro: `Backfill ${exp.externalKey} and inspect per-point statuses for ${exp.metric}`,
      });
    }
  }
  return findings;
};

// Workflow check: a flagged breach should have opened a revalidation event/task.
export const runVerify = async (
  cfg: SimConfig,
  models: Record<string, number>,
): Promise<Finding[]> => {
  const findings: Finding[] = [];
  const client = new JwtClient(cfg);
  await client.login();

  // credit-scoring-v3 psi breach is notify_flag_revalidation -> expect an event.
  const creditId = models["credit-scoring-v3"];
  if (creditId) {
    const events = await client.getRevalidationEvents(creditId);
    if (events.length === 0) {
      findings.push({
        category: "workflow",
        severity: "high",
        title: "PSI breach did not create a revalidation event",
        expected: "A revalidation event (source=breach) after credit-scoring-v3 PSI crossed 0.20",
        actual: "GET /revalidation-events returned an empty list",
        repro: "Backfill 30d, then GET /api/mrm/models/<credit-scoring-v3 id>/revalidation-events",
      });
    }
  }

  // Attestation should reflect the fleet (>=4 models, some breaches).
  const summary = await client.getAttestationSummary();
  if (summary.models_total < FLEET.length) {
    findings.push({
      category: "workflow",
      severity: "medium",
      title: "Attestation summary undercounts the fleet",
      expected: `models_total >= ${FLEET.length}`,
      actual: `models_total = ${summary.models_total}`,
      repro: "GET /api/mrm/attestation/summary after setup + backfill",
    });
  }

  // UX checklist finding (always emitted — a guided manual pass).
  findings.push({
    category: "ux",
    severity: "low",
    title: "Manual UI review checklist",
    expected: "Monitoring trends, breach chips, revalidation 'Triggered by', and attestation status look correct",
    actual: "Not auto-verifiable — open the URLs and confirm visually",
    repro:
      "Open /model-inventory/model-risk-management (Monitoring, Validation drawer, Overview) and eyeball each model",
  });

  return findings;
};
