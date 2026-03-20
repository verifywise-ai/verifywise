/**
 * @fileoverview Scheduled AI Detection Scan Processor
 *
 * BullMQ worker handler that checks for repositories due for scheduled scans
 * and triggers them automatically.
 *
 * Runs every 5 minutes via the "ai_detection_scheduled_scan_check" job.
 *
 * Uses a Redis distributed lock per tenant to prevent concurrent workers
 * from processing the same repositories simultaneously.
 *
 * @module services/aiDetection/scheduledScanProcessor
 */

import logger from "../../utils/logger/fileLogger";
import { getAllOrganizationsQuery } from "../../utils/organization.utils";
import {
  getRepositoriesDueForScanQuery,
  updateRepositoryNextScanAtQuery,
  computeNextScanAt,
} from "../../utils/aiDetectionRepository.utils";
import { getActiveScanForRepoQuery, markStaleScansFailed } from "../../utils/aiDetection.utils";
import { startScan } from "../aiDetection.service";
import { IServiceContext } from "../../domain.layer/interfaces/i.aiDetection";
import { ScheduleFrequency } from "../../domain.layer/interfaces/i.aiDetectionRepository";
import redisClient from "../../database/redis";

/** Scans stuck longer than this are marked as failed */
const STALE_SCAN_TIMEOUT_MINUTES = 30;

/**
 * Lock TTL: 4 minutes. The scheduled check runs every 5 minutes,
 * so a 4-minute lock prevents overlapping runs while ensuring the
 * lock expires before the next scheduled check.
 */
const LOCK_TTL_MS = 4 * 60 * 1000;

/**
 * Try to acquire a Redis distributed lock.
 * Returns true if lock acquired, false if already held.
 */
async function acquireLock(key: string): Promise<boolean> {
  const result = await redisClient.set(key, Date.now().toString(), "PX", LOCK_TTL_MS, "NX");
  return result === "OK";
}

/**
 * Release a Redis distributed lock.
 */
async function releaseLock(key: string): Promise<void> {
  await redisClient.del(key);
}

export async function processScheduledAiDetectionScans(): Promise<void> {
  logger.info("Processing scheduled AI detection scans...");
  console.log(`[ScheduledScan] ${new Date().toISOString()} — Starting scheduled scan check`);

  try {
    const organizations = await getAllOrganizationsQuery();
    console.log(`[ScheduledScan] Found ${organizations.length} organization(s) to check`);

    for (const org of organizations) {
      const orgId = org.id!;
      const lockKey = `ai-detection-scan-lock:org-${orgId}`;

      // Acquire distributed lock — only one worker processes per organization
      const locked = await acquireLock(lockKey);
      if (!locked) {
        console.log(`[ScheduledScan] Lock held for org ${orgId}, skipping`);
        logger.info(
          `Another worker is processing scheduled scans for org ${orgId}, skipping`
        );
        continue;
      }
      console.log(`[ScheduledScan] Acquired lock for org ${orgId}`);

      try {
        // Recover stale scans stuck in active states (server crash/restart)
        const staleCount = await markStaleScansFailed(orgId, STALE_SCAN_TIMEOUT_MINUTES);
        if (staleCount > 0) {
          console.log(`[ScheduledScan] Org ${orgId}: marked ${staleCount} stale scan(s) as failed`);
          logger.warn(`Marked ${staleCount} stale scan(s) as failed for org ${orgId}`);
        }

        const dueRepos = await getRepositoriesDueForScanQuery(orgId);
        console.log(`[ScheduledScan] Org ${orgId}: ${dueRepos.length} repo(s) due for scan`);

        if (dueRepos.length === 0) continue;

        logger.info(
          `Found ${dueRepos.length} repositories due for scheduled scan in org ${orgId}`
        );

        for (const repo of dueRepos) {
          try {
            // Check if a scan is already running for this repo
            const activeScan = await getActiveScanForRepoQuery(
              repo.repository_owner,
              repo.repository_name,
              orgId
            );

            if (activeScan) {
              console.log(`[ScheduledScan] SKIP ${repo.repository_owner}/${repo.repository_name} — scan already in progress (scan #${activeScan.id})`);
              logger.info(
                `Skipping scheduled scan for ${repo.repository_owner}/${repo.repository_name} - scan already in progress`
              );
              continue;
            }

            // Advance next_scan_at BEFORE starting the scan to prevent
            // the same repo being picked up by the next check cycle
            if (repo.schedule_frequency) {
              const nextScanAt = computeNextScanAt(
                repo.schedule_frequency as ScheduleFrequency,
                repo.schedule_day_of_week ?? null,
                repo.schedule_day_of_month ?? null,
                repo.schedule_hour,
                repo.schedule_minute
              );
              await updateRepositoryNextScanAtQuery(repo.id!, nextScanAt, orgId);
              console.log(`[ScheduledScan] Next scan for ${repo.repository_owner}/${repo.repository_name}: ${nextScanAt.toISOString()}`);
              logger.info(
                `Next scheduled scan for ${repo.repository_owner}/${repo.repository_name}: ${nextScanAt.toISOString()}`
              );
            }

            // Use the repo's created_by user as the triggering user
            const ctx: IServiceContext = {
              userId: repo.created_by,
              role: "Admin",
              organizationId: orgId,
              tenantId: orgId.toString(),  // For interface compatibility
            };

            console.log(`[ScheduledScan] STARTING scan for ${repo.repository_owner}/${repo.repository_name} (repo #${repo.id}, user #${repo.created_by})`);
            logger.info(
              `Starting scheduled scan for ${repo.repository_owner}/${repo.repository_name}`
            );

            await startScan(repo.repository_url, ctx, {
              repositoryId: repo.id,
              triggeredByType: "scheduled",
            });
            console.log(`[ScheduledScan] STARTED scan for ${repo.repository_owner}/${repo.repository_name}`);
          } catch (repoError) {
            console.error(`[ScheduledScan] FAILED for ${repo.repository_owner}/${repo.repository_name}:`, repoError);
            logger.error(
              `Failed to process scheduled scan for repo ${repo.repository_owner}/${repo.repository_name}:`,
              repoError
            );
          }
        }
      } catch (tenantError) {
        logger.error(
          `Error processing scheduled scans for org ${orgId}:`,
          tenantError
        );
      } finally {
        // Release lock after processing this tenant
        await releaseLock(lockKey);
      }
    }

    console.log(`[ScheduledScan] ${new Date().toISOString()} — Check completed`);
    logger.info("Scheduled AI detection scan check completed");
  } catch (error) {
    console.error(`[ScheduledScan] FATAL ERROR:`, error);
    logger.error("Failed to process scheduled AI detection scans:", error);
  }
}
