#!/usr/bin/env ts-node
/**
 * Scores the golden set of the vendor risk database (spec D6.4) against the runs stored for one
 * organization: for each vendor in the labels file, the first completed run of its vendor row made
 * with the credibility prompt (CREDIBILITY_PROMPT_VERSION), compared with what a person expects
 * (see docs/superpowers/golden-set/2026-10-30-golden-set.md). It only reads: every statement is a
 * SELECT.
 *
 * There is one set of rules and so one run for each vendor. The runs are ordinary research runs
 * that the labeller starts, after the copies of the lists have synced, one on a vendor row of its
 * own for each vendor: a run drops what repeats the findings and risks its row already has. The
 * labels give that row as `vendorId`; a file of the earlier shape, with a row for each flag
 * (`vendorIds: { off, on }`), is read by its `on` row.
 *
 * The bars are precision of at least 0.9, label agreement of at least 80 %, no finding labelled
 * High that the labeller rates Low, no sanctions match stated as a fact, and a coverage with no list
 * that failed. Recall is reported and has no bar.
 *
 * Exit codes:
 *   0 - every bar is met
 *   1 - a bar is missed
 *   2 - the labels file is missing or not filled in, or the database could not be read
 *
 * Usage:
 *   cd Servers && npx ts-node scripts/vendorResearchGoldenSet.ts <labels.json>
 */
import { readFileSync } from "fs";
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import type {
  FindingSource,
  IVendorRiskFinding,
  RunCoverage,
} from "../domain.layer/interfaces/i.vendorResearch";
import {
  checkGoldenLabels,
  formatGoldenReport,
  meetsBars,
  scoreGoldenSet,
} from "../services/vendorResearch/golden/score";
import type { GoldenRun } from "../services/vendorResearch/golden/types";
import { CREDIBILITY_PROMPT_VERSION } from "../services/vendorResearch/prompts";

const USAGE = "Usage: npx ts-node scripts/vendorResearchGoldenSet.ts <labels.json>";

interface RunRow {
  id: number;
  vendor_id: number;
  prompt_version: string;
  coverage: RunCoverage | null;
  /** A count: PostgreSQL gives it as text. */
  earlier: string | number;
}

type FindingRow = Pick<
  IVendorRiskFinding,
  "run_id" | "category" | "risk_description" | "credibility"
> & { sources: FindingSource[] | null };

/** The name of an error, never its message, which can hold the address of the database. */
const nameOf = (error: unknown): string => {
  const name = (error as { name?: unknown } | null)?.name;
  return typeof name === "string" && /^[A-Za-z_$][\w$.]{0,59}$/.test(name) ? name : "unknown";
};

/**
 * The first completed run of each vendor row made with one prompt version, with its findings and
 * the label the run's code gave each, and how many findings of other runs and active risks the row
 * had when the run started: a run drops the candidates that repeat them (dedupe.ts), so only a run
 * that follows none of them is scored as it found. Later runs of the row follow the first one, and
 * are left out, and so is a row whose runs were made with another prompt version.
 */
export async function loadGoldenRuns(
  organizationId: number,
  vendorIds: readonly number[],
  promptVersion: string,
): Promise<GoldenRun[]> {
  if (vendorIds.length === 0) return [];
  const runs = await sequelize.query<RunRow>(
    `SELECT DISTINCT ON (r.vendor_id) r.id, r.vendor_id, r.prompt_version, r.coverage,
            (SELECT COUNT(*)
               FROM vendor_risk_findings f
              WHERE f.organization_id = r.organization_id
                AND f.vendor_id = r.vendor_id
                AND f.run_id <> r.id
                AND f.created_at < COALESCE(r.started_at, r.created_at))
          + (SELECT COUNT(*)
               FROM vendorrisks v
              WHERE v.organization_id = r.organization_id
                AND v.vendor_id = r.vendor_id
                AND v.is_deleted = false
                AND v.created_at < COALESCE(r.started_at, r.created_at)) AS earlier
       FROM vendor_research_runs r
      WHERE r.organization_id = :organizationId
        AND r.vendor_id IN (:vendorIds)
        AND r.status = 'completed'
        AND r.prompt_version = :promptVersion
      ORDER BY r.vendor_id, r.finished_at ASC NULLS LAST, r.id ASC`,
    {
      replacements: { organizationId, vendorIds: [...vendorIds], promptVersion },
      type: QueryTypes.SELECT,
    },
  );
  if (runs.length === 0) return [];
  const findings = await sequelize.query<FindingRow>(
    `SELECT run_id, category, risk_description, credibility, sources
       FROM vendor_risk_findings
      WHERE organization_id = :organizationId
        AND run_id IN (:runIds)
      ORDER BY id`,
    {
      replacements: { organizationId, runIds: runs.map((run) => run.id) },
      type: QueryTypes.SELECT,
    },
  );
  return runs.map((run) => ({
    vendorId: run.vendor_id,
    earlier: Number(run.earlier),
    promptVersion: run.prompt_version,
    coverage: run.coverage ?? null,
    findings: findings
      .filter((finding) => finding.run_id === run.id)
      .map((finding) => ({
        category: finding.category,
        risk_description: finding.risk_description,
        credibility: finding.credibility ?? null,
        sources: Array.isArray(finding.sources) ? finding.sources : [],
      })),
  }));
}

/** The names the database has for the labelled vendors of the organization, by id. */
export async function loadVendorNames(
  organizationId: number,
  vendorIds: readonly number[],
): Promise<Map<number, string>> {
  if (vendorIds.length === 0) return new Map();
  const rows = await sequelize.query<{ id: number; vendor_name: string }>(
    `SELECT id, vendor_name
       FROM vendors
      WHERE organization_id = :organizationId
        AND id IN (:vendorIds)`,
    {
      replacements: { organizationId, vendorIds: [...vendorIds] },
      type: QueryTypes.SELECT,
    },
  );
  return new Map(rows.map((row) => [row.id, row.vendor_name]));
}

export async function main(
  argv: string[],
  out: (text: string) => void = (text) => console.log(text),
  err: (text: string) => void = (text) => console.error(text),
): Promise<number> {
  const [file] = argv;
  if (file === undefined) {
    err(USAGE);
    return 2;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    err(`The labels file could not be read (${nameOf(error)}). ${USAGE}`);
    return 2;
  }
  const { labels, problems } = checkGoldenLabels(parsed);
  if (labels === null) {
    err(
      ["The labels file is not filled in:", ...problems.map((problem) => `  - ${problem}`)].join(
        "\n",
      ),
    );
    return 2;
  }

  // Each vendor has one row, the one its run was made on.
  const rows = labels.vendors.map((vendor) => ({ id: vendor.vendorId, vendor }));
  const names = await loadVendorNames(
    labels.organizationId,
    rows.map((row) => row.id),
  );
  const unknown = rows.filter((row) => !names.has(row.id));
  if (unknown.length > 0) {
    err(
      [
        `These vendors are not vendors of organization ${labels.organizationId}:`,
        ...unknown.map((row) => `  - ${row.id} (${row.vendor.name})`),
      ].join("\n"),
    );
    return 2;
  }
  // A vendor id with a typo can be another vendor of the organization: say so, and go on.
  for (const row of rows) {
    const stored = names.get(row.id) ?? "";
    if (stored.trim().toLowerCase() !== row.vendor.name.trim().toLowerCase()) {
      out(
        `Note: vendor ${row.id} is "${stored}" in the database and "${row.vendor.name}" in the labels.`,
      );
    }
  }

  const runs = await loadGoldenRuns(
    labels.organizationId,
    labels.vendors.map((vendor) => vendor.vendorId),
    CREDIBILITY_PROMPT_VERSION,
  );
  const report = scoreGoldenSet(labels.vendors, runs);
  const verdict = meetsBars(report);
  out(formatGoldenReport(report, verdict));
  return verdict.ok ? 0 : 1;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .catch((error: unknown) => {
      console.error(`The golden set could not be scored (${nameOf(error)}).`);
      return 2;
    })
    .then(async (code) => {
      await sequelize.close().catch(() => undefined);
      process.exit(code);
    });
}
