/**
 * The queue job of one vendor research run: it runs the pipeline for the run, and after an
 * automatic or a scheduled run that stored findings it tells the vendor's assignee, if that is a
 * user of the vendor's organization.
 *
 * The run looks the vendor up in the vendor risk database in place of the per-run lookups of the
 * CISA catalog, the NVD and the OFAC list, and is researched and analysed under the credibility
 * rules. The database has no flag: the records switch (`VENDOR_RESEARCH_RECORDS`) turns it off, and
 * its lookup then says so in the coverage of the run.
 *
 * Exactly-once: the pipeline ends the run itself, once, and does not throw for a failed search,
 * page read or model call. The only rejection that reaches this file is a failure to mark the run
 * running, which leaves the run queued, so it is not caught here and BullMQ retries the job. The
 * notice comes after the pipeline has returned, in a try/catch of its own: the run is over by then,
 * and nothing the notice does can change it or make the job fail.
 */
import { generateObjectWithSelfCorrection } from "../../advisor/llmSelfCorrect";
import logger from "../../utils/logger/fileLogger";
import { getVendorByIdQuery } from "../../utils/vendor.utils";
import { getRunByIdQuery } from "../../utils/vendorResearch.utils";
import { notifyAssigneeOfVendorResearch } from "../inAppNotification.service";
import { isUserOfOrganization } from "./assignee";
import { PipelineDeps, resolveOrgModel, runVendorResearch } from "./pipeline";
import { sharedPageRenderer } from "./pageRenderer";
import { sharedRecordsLookup } from "./records";
import { createVendorResearcher } from "./researchAgent";
import { sharedWebCache } from "./researchCache";
import { sharedVrdbLookup } from "./vrdb/lookup";

export interface VendorResearchJobData {
  organizationId: number;
  vendorId: number;
  runId: number;
}

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

  // The vendor's lookup in the vendor risk database; the lookup of the process asks only the
  // databases that the VRDB does not keep.
  const vrdb = sharedVrdbLookup({ organizationId, vendorId });
  const deps: PipelineDeps = {
    // A researcher of its own for each job, with the real page reader and model call. It is given
    // no search engine: each run builds its own from the key it researches with, which the pipeline
    // hands over (the web search of Claude for a key of Anthropic, the news of the GDELT Project for
    // every other key). The jobs of the process share one cache of robots.txt files, pages and
    // searches, and, when an operator has turned it on, one headless browser for the pages that a
    // script builds. The code does the routine work (the news searches, the vendor's own pages)
    // before the model's first step, and the model then researches each category in a loop of its
    // own, all at once.
    research: createVendorResearcher({
      cache: sharedWebCache(),
      render: sharedPageRenderer(),
      records: sharedRecordsLookup(),
      gather: true,
      perCategory: true,
      vrdb,
    }),
    resolveModel: resolveOrgModel,
    generate: generateObjectWithSelfCorrection,
    now: () => new Date(),
    // One more model call over the findings that stay: a source about another company, a quote that
    // does not say the claim and a matter older than its window are not stored.
    verifier: true,
  };
  // Not caught, see the header: a rejection means the run is still queued.
  // The trigger goes along: a scheduled run analyses only the sources that are new.
  const result = await runVendorResearch(
    { organizationId, vendorId, runId, triggerType: run.trigger_type },
    deps,
  );

  // A manual run is not announced: the person who started it is looking at the result. A run that
  // started by itself is, because nobody is looking at it.
  const startedByItself = run.trigger_type === "auto" || run.trigger_type === "scheduled";
  if (result.outcome === "completed" && result.findingsCreated > 0 && startedByItself) {
    await notifyAssignee(organizationId, vendorId, runId, result.findingsCreated);
  }
}
