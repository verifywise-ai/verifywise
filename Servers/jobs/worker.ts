// Load .env before anything reads the environment, as the API entry does.
import "dotenv/config";
import { Worker } from "bullmq";
import { createNotificationWorker } from "../services/slack/slackWorker";
import { createAutomationWorker } from "../services/automations/automationWorker";
import { createCorpusGenerationWorker } from "../services/biasAudit/generation/generationJob";
import logger from "../utils/logger/fileLogger";
import { warnIfGatewayKeyMissing } from "../utils/aiGatewayKeyCheck";

// The worker runs the daily retention job, which calls the AI Gateway. Same
// rule as the API server; runs in the background.
void warnIfGatewayKeyMissing(logger);

const notificationWorker = createNotificationWorker();
const automationWorker = createAutomationWorker();
const corpusGenerationWorker = createCorpusGenerationWorker();

// Add workers here as you add on new workers within the application
const workers: Worker[] = [notificationWorker, automationWorker, corpusGenerationWorker];

// Global error handler for all workers
workers.forEach((worker) => {
  worker.on("error", (err) => {
    logger.debug(`Worker error on queue ${worker.name}:`, err);
  });
});

logger.debug("All workers started and waiting for jobs...");

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.debug("Shutting down all workers...");
  await Promise.all(workers.map((worker) => worker.close()));
  logger.debug("All workers shut down successfully");
  notificationWorker.close();
  automationWorker.close();
  process.exit(0);
});
