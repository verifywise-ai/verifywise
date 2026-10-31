/**
 * The worker of the research queue (see queue.ts): it carries out the runs, a few at a time, in the
 * process of the other workers (jobs/worker.ts). It runs nothing else, and nothing else runs on its
 * queue, so the number of runs at the same time is a setting of research alone
 * (VENDOR_RESEARCH_WORKER_CONCURRENCY, see config.ts) and does not take the places of the
 * automations. Besides the runs it takes the hourly job of the scheduled scan (see scan.ts), which
 * only starts runs: it finishes in moments and holds a place of the worker for that long.
 */
import { Job, Worker } from "bullmq";
import { REDIS_URL } from "../../database/redis";
import logger from "../../utils/logger/fileLogger";
import { getVendorResearchConfig } from "./config";
import { handleVendorResearchJob, VendorResearchJobData } from "./job";
import { VENDOR_RESEARCH_JOB, VENDOR_RESEARCH_QUEUE, VENDOR_RESEARCH_SCAN_JOB } from "./queue";
import { runVendorResearchScan } from "./scan";

/**
 * `queueName` is the research queue, except in a test against a real Redis, which uses a queue of
 * its own so that it never takes the jobs of a developer's backend.
 */
export const createVendorResearchWorker = (
  concurrency: number = getVendorResearchConfig().workerConcurrency,
  queueName: string = VENDOR_RESEARCH_QUEUE,
) => {
  const worker = new Worker(
    queueName,
    async (job: Job) => {
      // Two kinds of job are on this queue, told apart by name. Another name is a mistake of whoever
      // added it, and researching a vendor from data that was not meant for that would be worse than
      // failing.
      switch (job.name) {
        case VENDOR_RESEARCH_JOB:
          await handleVendorResearchJob(job.data as VendorResearchJobData);
          return;
        case VENDOR_RESEARCH_SCAN_JOB:
          await runVendorResearchScan();
          return;
        default:
          throw new Error(`Unknown job: ${job.name}`);
      }
    },
    { connection: { url: REDIS_URL }, concurrency },
  );

  worker.on("completed", (job) => {
    logger.debug(`vendor research job ${job.id} has been completed`);
  });
  worker.on("failed", (job, err) => {
    logger.error(`vendor research job ${job?.id} has failed with error: ${err.message}`);
  });

  return worker;
};
