/**
 * The queue job of one vendor research run: it runs the pipeline for the run, and after an
 * automatic run that stored findings it tells the vendor's assignee, if that is a user of the
 * vendor's organization.
 *
 * Exactly-once: the pipeline ends the run itself, once, and does not throw for a failed search or
 * model call. The only rejection that reaches this file is a failure to mark the run running,
 * which leaves the run queued, so it is not caught here and BullMQ retries the job. The notice
 * comes after the pipeline has returned, in a try/catch of its own: the run is over by then, and
 * nothing the notice does can change it or make the job fail.
 */
import { generateObjectWithSelfCorrection } from "../../advisor/llmSelfCorrect";
import logger from "../../utils/logger/fileLogger";
import { getVendorByIdQuery } from "../../utils/vendor.utils";
import { finishRunQuery, getRunByIdQuery } from "../../utils/vendorResearch.utils";
import { notifyAssigneeOfVendorResearch } from "../inAppNotification.service";
import { isUserOfOrganization } from "./assignee";
import { getVendorResearchConfig } from "./config";
import { PipelineDeps, resolveOrgModel, runVendorResearch } from "./pipeline";
import { createSearchProvider } from "./searchProvider";

export interface VendorResearchJobData {
  organizationId: number;
  vendorId: number;
  runId: number;
}

/** What a run records when the job finds no search provider to work with. */
const NO_SEARCH_PROVIDER_NOTE = "Search provider not configured";

/**
 * Tells the vendor's assignee, when there is one and the assignee is a user of the vendor's
 * organization, that a run stored `count` findings. It never rejects: a failure is logged and
 * nothing else.
 */
async function notifyAssignee(
  organizationId: number,
  vendorId: number,
  runId: number,
  count: number,
): Promise<void> {
  try {
    const vendor = await getVendorByIdQuery(vendorId, organizationId);
    const assignee = vendor?.assignee ?? null;
    if (!vendor || assignee === null) return;

    // Vendor writes do not check the assignee, and the foreign key behind it accepts any user, so
    // it can be someone of another organization. The notice would be stored under the vendor's
    // organization, for a user who never reads it: nothing is written, as for the action owner of
    // an accepted finding. Nothing that someone must read is logged either, and no name.
    if (!(await isUserOfOrganization(assignee, organizationId))) {
      logger.debug(
        `vendor research run ${runId} (vendor ${vendorId}, org ${organizationId}): no notice, the assignee, user ${assignee}, is not a user of the organization`,
      );
      return;
    }

    await notifyAssigneeOfVendorResearch(
      organizationId,
      { id: vendorId, name: vendor.vendor_name, assignee },
      runId,
      count,
    );
  } catch (error) {
    logger.error(
      `vendor research run ${runId} (vendor ${vendorId}, org ${organizationId}): the notice to the assignee failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
}

export async function handleVendorResearchJob(data: VendorResearchJobData): Promise<void> {
  const { organizationId, vendorId, runId } = data;
  const label = `vendor research run ${runId} (vendor ${vendorId}, org ${organizationId})`;

  // Not caught: if the run cannot be read, the job fails and BullMQ retries it.
  const run = await getRunByIdQuery(organizationId, runId);
  if (!run) {
    // Deleted with its vendor or organization. A retry could not bring it back.
    logger.warn(`${label}: the run does not exist, so the job is dropped`);
    return;
  }

  // Read now, not at import: the settings are the environment of the running process.
  const searchProvider = createSearchProvider(getVendorResearchConfig());
  if (!searchProvider) {
    logger.warn(`${label}: search is not configured`);
    // finishRunQuery has no status guard, so only a queued run is ended here, the way the pipeline
    // only starts a queued one. A run that is anything else belongs to another actor.
    if (run.status === "queued") {
      await finishRunQuery({
        organizationId,
        runId,
        status: "failed",
        categories: [],
        categorySummary: [],
        evidence: null,
        searchProvider: null,
        model: null,
        promptVersion: null,
        searchesUsed: 0,
        duplicatesDropped: 0,
        error: NO_SEARCH_PROVIDER_NOTE,
      });
    }
    return;
  }

  const deps: PipelineDeps = {
    searchProvider,
    resolveModel: resolveOrgModel,
    generate: generateObjectWithSelfCorrection,
    now: () => new Date(),
  };
  // Not caught, see the header: a rejection means the run is still queued.
  const result = await runVendorResearch({ organizationId, vendorId, runId }, deps);

  // A manual run is not announced: the person who started it is looking at the result.
  if (result.outcome === "completed" && result.findingsCreated > 0 && run.trigger_type === "auto") {
    await notifyAssignee(organizationId, vendorId, runId, result.findingsCreated);
  }
}
