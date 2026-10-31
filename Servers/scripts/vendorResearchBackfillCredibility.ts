#!/usr/bin/env ts-node
/**
 * Gives the findings of the runs before the credibility rule a label (spec D4.6, Rulings 2 to 8 of
 * the M3 plan), for the maintainer of a deployment: once, before the old path is removed (Part B
 * of the M3 plan). Nothing runs it at startup or in a migration. It walks the organizations one at
 * a time, in id order, and reads the findings without a label of one organization in batches of
 * 500 (utils/vendorResearchBackfill.utils.ts):
 *
 * - a pending finding gets the label the rule gives it now, from what its run stored, under the
 *   rule's backfill name (services/vendorResearch/backfill.ts);
 * - an accepted or dismissed finding keeps its confidence as a label carried over
 *   (`legacy_confidence`).
 *
 * The default is a dry run: it writes nothing and prints what it would write. `--apply` writes,
 * and refuses while VENDOR_RESEARCH_VRDB is off, before it reads anything: labels of the new rule
 * beside the confidence chips of the old one would mix two rules. A finding decided, or labelled by
 * a live run, between the read and the write is left as it is and counted as skipped; a later run
 * of the script gives one decided meanwhile its carried-over label. `--undo` clears what the
 * backfill wrote, whatever the flag, but for the label of a finding a person accepted or dismissed
 * since, which is what they decided it by: that one is kept and counted. The script prints
 * organization ids and counts only: never a finding's text, an address or the message of an error.
 *
 * Exit codes:
 *   0 - done: a dry run, an apply or an undo
 *   1 - the database could not be read or written
 *   2 - an argument is not one of the options, the organization does not exist, or --apply was
 *       refused because the flag is off
 *
 * Usage, in the backend's container (the image has no npx; its environment holds the flag the
 * servers read, so --apply refuses exactly when they run with the flag off):
 *   docker compose exec backend node dist/scripts/vendorResearchBackfillCredibility.js [--apply | --undo] [--organization N]
 * and from a checkout:
 *   cd Servers && npx ts-node scripts/vendorResearchBackfillCredibility.ts [--apply | --undo] [--organization N]
 */
import { sequelize } from "../database/db";
import type { CredibilityLabel } from "../domain.layer/interfaces/i.vendorResearch";
import { backfillCredibilityOf } from "../services/vendorResearch/backfill";
import { getVendorResearchConfig } from "../services/vendorResearch/config";
import { type ResearchTarget, buildTarget } from "../services/vendorResearch/target";
import {
  type RunForBackfill,
  findFindingsToBackfillQuery,
  getRunForBackfillQuery,
  getVendorForBackfillQuery,
  listOrganizationIdsQuery,
  undoBackfillQuery,
  writeBackfillQuery,
} from "../utils/vendorResearchBackfill.utils";

const USAGE =
  "Usage: node dist/scripts/vendorResearchBackfillCredibility.js [--apply | --undo] [--organization N]" +
  " in the backend's container, or npx ts-node scripts/vendorResearchBackfillCredibility.ts" +
  " with the same options from a checkout of Servers.";

/** The findings read and written at a time. */
const BATCH = 500;

/** Why `--undo` kept a label: a person decided its finding with it in front of them. */
const DECIDED_AFTER = " (decided after the backfill)";

/** The queries the script runs, and whether the vendor risk database flag is on. */
export interface BackfillDeps {
  flagOn(): boolean;
  listOrganizationIdsQuery: typeof listOrganizationIdsQuery;
  findFindingsToBackfillQuery: typeof findFindingsToBackfillQuery;
  getRunForBackfillQuery: typeof getRunForBackfillQuery;
  getVendorForBackfillQuery: typeof getVendorForBackfillQuery;
  writeBackfillQuery: typeof writeBackfillQuery;
  undoBackfillQuery: typeof undoBackfillQuery;
}

export const defaultDeps: BackfillDeps = {
  flagOn: () => getVendorResearchConfig().vrdb,
  listOrganizationIdsQuery,
  findFindingsToBackfillQuery,
  getRunForBackfillQuery,
  getVendorForBackfillQuery,
  writeBackfillQuery,
  undoBackfillQuery,
};

type Mode = "dry_run" | "apply" | "undo";

/** The name of an error, never its message, which can hold the address of the database. */
const nameOf = (error: unknown): string => {
  const name = (error as { name?: unknown } | null)?.name;
  return typeof name === "string" && /^[A-Za-z_$][\w$.]{0,59}$/.test(name) ? name : "unknown";
};

/** The options of the command line, or the reason they are refused. */
function optionsOf(argv: readonly string[]): { mode: Mode; organization: number | null } | string {
  let mode: Mode = "dry_run";
  let organization: number | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--apply" || option === "--undo") {
      if (mode !== "dry_run") return "--apply and --undo are given together, or one of them twice.";
      mode = option === "--apply" ? "apply" : "undo";
    } else if (option === "--organization") {
      if (organization !== null) return "--organization is given twice.";
      const value = argv[index + 1] ?? "";
      // A whole number written as one, without a sign, a fraction or a leading zero.
      if (!/^[1-9]\d{0,9}$/.test(value) || Number(value) > 2_147_483_647) {
        return "--organization takes the id of an organization.";
      }
      organization = Number(value);
      index += 1;
    } else {
      return `Unknown argument: ${option}.`;
    }
  }
  return { mode, organization };
}

/** What the backfill decided in one organization. */
interface Counts {
  pending: number;
  pendingByLabel: Record<CredibilityLabel, number>;
  decided: number;
  legacy: number;
  written: number;
  skipped: number;
}

const noCounts = (): Counts => ({
  pending: 0,
  pendingByLabel: { high: 0, medium: 0, low: 0 },
  decided: 0,
  legacy: 0,
  written: 0,
  skipped: 0,
});

/**
 * Decides the label of each finding of the organization without one, and writes it when `apply`.
 * Only a pending finding reads its run and its vendor. A vendor is read once for the organization;
 * a run is held only while its findings come, one after another (they are stored together, in the
 * transaction that finishes the run), since its pack and its trace can weigh 300 KB together.
 */
async function backfillOrganization(
  organizationId: number,
  apply: boolean,
  deps: BackfillDeps,
): Promise<Counts> {
  const counts = noCounts();
  // The run whose findings are coming now, with what it stored.
  let held: { id: number; stored: RunForBackfill | null } | undefined;
  const targets = new Map<number, ResearchTarget | null>();
  let afterId = 0;
  for (;;) {
    const batch = await deps.findFindingsToBackfillQuery(organizationId, afterId, BATCH);
    for (const finding of batch) {
      let label: ReturnType<typeof backfillCredibilityOf> = null;
      if (finding.status === "pending") {
        if (held === undefined || held.id !== finding.run_id) {
          held = {
            id: finding.run_id,
            stored: await deps.getRunForBackfillQuery(organizationId, finding.run_id),
          };
        }
        if (!targets.has(finding.vendor_id)) {
          const vendor = await deps.getVendorForBackfillQuery(organizationId, finding.vendor_id);
          targets.set(finding.vendor_id, vendor === null ? null : buildTarget(vendor));
        }
        const stored = held.stored;
        const target = targets.get(finding.vendor_id) ?? null;
        // A finding's vendor and run are deleted with it, so a missing one went with the finding.
        if (target === null) {
          counts.skipped += 1;
          continue;
        }
        label = backfillCredibilityOf({
          finding,
          evidence: stored?.evidence ?? null,
          trace: stored?.trace ?? null,
          target,
        });
        if (label !== null) {
          counts.pending += 1;
          counts.pendingByLabel[label.credibility] += 1;
        }
      } else {
        counts.decided += 1;
        label = backfillCredibilityOf({ finding, evidence: null, trace: null, target: EMPTY });
        if (label !== null) counts.legacy += 1;
      }
      if (!apply || label === null) continue;
      const written = await deps.writeBackfillQuery({
        organizationId,
        id: finding.id,
        status: finding.status,
        credibility: label.credibility,
        basis: label.basis,
      });
      if (written) counts.written += 1;
      else counts.skipped += 1;
    }
    if (batch.length < BATCH) return counts;
    afterId = batch[batch.length - 1].id;
  }
}

/** The vendor a decided finding needs: none, as its label is the confidence it had. */
const EMPTY: ResearchTarget = { name: "", domain: null, provides: "" };

export async function main(
  argv: string[],
  out: (text: string) => void = (text) => console.log(text),
  err: (text: string) => void = (text) => console.error(text),
  deps: BackfillDeps = defaultDeps,
): Promise<number> {
  const options = optionsOf(argv);
  if (typeof options === "string") {
    err(`${options} ${USAGE}`);
    return 2;
  }
  const { mode, organization } = options;
  if (mode === "apply" && !deps.flagOn()) {
    err("VENDOR_RESEARCH_VRDB is off: --apply needs the flag");
    return 2;
  }

  try {
    const ids = await deps.listOrganizationIdsQuery();
    if (organization !== null && !ids.includes(organization)) {
      err(`There is no organization ${organization}.`);
      return 2;
    }
    const organizations = organization === null ? ids : [organization];

    if (mode === "undo") {
      let cleared = 0;
      let kept = 0;
      for (const id of organizations) {
        const counts = await deps.undoBackfillQuery(id);
        cleared += counts.cleared;
        kept += counts.kept;
        out(`organization ${id}: cleared ${counts.cleared}, kept ${counts.kept}${DECIDED_AFTER}`);
      }
      out(`total: cleared ${cleared}, kept ${kept}${DECIDED_AFTER}`);
      return 0;
    }

    const total = noCounts();
    for (const id of organizations) {
      const counts = await backfillOrganization(id, mode === "apply", deps);
      const { high, medium, low } = counts.pendingByLabel;
      out(
        counts.pending === 0 && counts.decided === 0
          ? `organization ${id}: nothing to backfill`
          : `organization ${id}: ${counts.pending} pending (high ${high}, medium ${medium}, low ${low}), ${counts.decided} decided (legacy ${counts.legacy})`,
      );
      total.pending += counts.pending;
      total.decided += counts.decided;
      total.written += counts.written;
      total.skipped += counts.skipped;
    }
    out(
      `total: ${total.pending} pending, ${total.decided} decided; ${
        mode === "apply"
          ? `written ${total.written}, skipped ${total.skipped} (decided or labelled meanwhile)`
          : "dry run, nothing written"
      }`,
    );
    return 0;
  } catch (error) {
    err(`The backfill failed (${nameOf(error)}).`);
    return 1;
  }
}

if (require.main === module) {
  main(process.argv.slice(2))
    .catch((error: unknown) => {
      console.error(`The backfill failed (${nameOf(error)}).`);
      return 1;
    })
    .then(async (code) => {
      await sequelize.close().catch(() => undefined);
      process.exit(code);
    });
}
