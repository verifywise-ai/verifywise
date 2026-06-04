import express from "express";
import { Worker } from "bullmq";
import { createNotificationWorker } from "../services/slack/slackWorker";
import { createAutomationWorker } from "../services/automations/automationWorker";
import logger from "../utils/logger/fileLogger";
import { installOutboundHttpLogging } from "../utils/http/outboundLog";
import {
  bullmqJobDurationSeconds,
  bullmqJobsProcessedTotal,
  register as metricsRegister,
} from "../utils/metrics/registry";

process.env.SERVICE_NAME = process.env.SERVICE_NAME || "worker";
installOutboundHttpLogging();

const notificationWorker = createNotificationWorker();
const automationWorker = createAutomationWorker();

// Add workers here as you add on new workers within the application
const workers: Worker[] = [notificationWorker, automationWorker];

function instrument(worker: Worker): void {
  worker.on("active", (job) => {
    logger.info(`job started ${worker.name}#${job.id}`, {
      kind: "bullmq_job",
      event: "active",
      queue: worker.name,
      job_id: job.id,
      job_name: job.name,
      attempts_made: job.attemptsMade,
    });
  });

  worker.on("completed", (job) => {
    bullmqJobsProcessedTotal.inc({ queue: worker.name, status: "completed" });
    const durationMs =
      job.processedOn && job.finishedOn ? job.finishedOn - job.processedOn : undefined;
    if (durationMs !== undefined) {
      bullmqJobDurationSeconds.observe({ queue: worker.name }, durationMs / 1000);
    }
    logger.info(`job completed ${worker.name}#${job.id}`, {
      kind: "bullmq_job",
      event: "completed",
      queue: worker.name,
      job_id: job.id,
      job_name: job.name,
      duration_ms: durationMs,
    });
  });

  worker.on("failed", (job, err) => {
    bullmqJobsProcessedTotal.inc({ queue: worker.name, status: "failed" });
    logger.error(`job failed ${worker.name}#${job?.id}`, {
      kind: "bullmq_job",
      event: "failed",
      queue: worker.name,
      job_id: job?.id,
      job_name: job?.name,
      attempts_made: job?.attemptsMade,
      error: err.message,
    });
  });

  worker.on("error", (err) => {
    logger.error(`Worker error on queue ${worker.name}`, { error: err.message });
  });
}

workers.forEach(instrument);

const metricsApp = express();
metricsApp.get("/metrics", async (_req, res) => {
  try {
    res.set("Content-Type", metricsRegister.contentType);
    res.send(await metricsRegister.metrics());
  } catch (err) {
    res.status(500).send((err as Error).message);
  }
});
metricsApp.get("/health", (_req, res) => res.json({ status: "ok" }));

const METRICS_PORT = parseInt(process.env.WORKER_METRICS_PORT || "9464", 10);
const metricsServer = metricsApp.listen(METRICS_PORT, () => {
  logger.info(`Worker metrics server listening on :${METRICS_PORT}`);
});

logger.info("All workers started and waiting for jobs...");

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received — shutting down workers...`);
  metricsServer.close();
  await Promise.all(workers.map((worker) => worker.close()));
  logger.info("All workers shut down successfully");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
