/**
 * The scheduled scan: once an hour it starts the research of the vendors that are due, in each
 * organization whose administrator chose a scan interval (Off is the default, and an organization
 * stays on it until an administrator chooses another).
 *
 * A vendor is due when no run that counts (`COUNTS_AS_A_RUN`) was created for it within the
 * interval, whoever started that run, so a run by hand or the automatic one after the vendor was
 * created puts the vendor back to the end of the line. The vendors that were researched longest ago,
 * or never, come first (`listDueVendorsQuery`).
 *
 * The scan is the lowest priority of the three ways to start a run. It uses at most half of the
 * daily run cap of the organization, counted over the runs of the last 24 hours whoever started
 * them, and it starts a few vendors at a time, so a large register is spread over the day and a
 * person who asks for a run by hand still finds room under the cap. Each run is started the way a
 * person's is (`startVendorResearch`), so it checks the same things: the vendor is still there, the
 * organization still has an LLM key, no run is already on its way, and the cap holds.
 *
 * An organization goes on its own: a failure in one is logged by the name of the error and the others
 * are still scanned. Only the failure to find the organizations rejects, so that the job fails and
 * the next hour tries again.
 */
import logger from "../../utils/logger/fileLogger";
import {
  countRunsSinceQuery,
  listDueVendorsQuery,
  listScanOrganizationsQuery,
} from "../../utils/vendorResearch.utils";
import { getVendorResearchConfig } from "./config";
import { startVendorResearch } from "./trigger";

/** How many vendors one scan starts at most in one organization. */
export const SCAN_BATCH_SIZE = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ScanSummary {
  /** The organizations that chose an interval. */
  organizations: number;
  /** The runs that the scan started. */
  started: number;
}

/**
 * What a start answers that the next vendor of the same organization would meet again: the
 * organization has no key, its cap is reached, or the queue does not take jobs.
 */
const LEAVES_THE_ORGANIZATION = new Set(["llm_key_missing", "daily_cap", "enqueue_failed"]);

/** The name of an error, for a log line: its message can carry a host or a query. */
function nameOf(error: unknown): string {
  try {
    return error instanceof Error ? String(error.name) : typeof error;
  } catch {
    return "unknown error";
  }
}

/**
 * How many runs the scan may still start in an organization: half of the daily cap is its share,
 * and a batch is at most SCAN_BATCH_SIZE. The cap is read now, as a start reads it.
 */
function roomOf(runsInLastDay: number): number {
  const share = Math.floor(getVendorResearchConfig().dailyRunCap / 2);
  return Math.max(0, Math.min(SCAN_BATCH_SIZE, share - runsInLastDay));
}

/**
 * Starts the runs of one organization, and adds each to `tally` as it starts, so that a failure
 * halfway does not lose the count of the runs that did start.
 */
async function scanOrganization(
  organizationId: number,
  intervalDays: number,
  now: Date,
  tally: { started: number },
): Promise<void> {
  const runsInLastDay = await countRunsSinceQuery(organizationId, new Date(now.getTime() - DAY_MS));
  const room = roomOf(runsInLastDay);
  if (room === 0) return;

  const vendorIds = await listDueVendorsQuery({ organizationId, intervalDays, limit: room });
  for (const vendorId of vendorIds) {
    const result = await startVendorResearch({
      organizationId,
      vendorId,
      triggerType: "scheduled",
      requestedBy: null,
    });
    if (result.ok) {
      // A run that was already on its way is that run, not one that the scan started.
      if (!result.alreadyRunning) tally.started += 1;
    } else if (LEAVES_THE_ORGANIZATION.has(result.error.code)) {
      return;
    }
  }
}

/** One pass of the scan. `now` is the clock, for a test. It resolves with the counts it logs. */
export async function runVendorResearchScan(
  options: { now?: () => Date } = {},
): Promise<ScanSummary> {
  const now = (options.now ?? (() => new Date()))();
  const organizations = await listScanOrganizationsQuery();

  const tally = { started: 0 };
  for (const { organizationId, intervalDays } of organizations) {
    try {
      await scanOrganization(organizationId, intervalDays, now, tally);
    } catch (error) {
      logger.error(`vendor research scan: organization ${organizationId} failed: ${nameOf(error)}`);
    }
  }

  if (tally.started > 0) {
    const count = organizations.length;
    logger.info(
      `vendor research scan: started ${tally.started} runs in ${count} organization${count === 1 ? "" : "s"}`,
    );
  }
  return { organizations: organizations.length, started: tally.started };
}
