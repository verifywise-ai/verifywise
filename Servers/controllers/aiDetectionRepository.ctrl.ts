/**
 * @fileoverview AI Detection Repository Controller
 *
 * Request handlers for AI Detection repository registry CRUD and scan triggers.
 *
 * @module controllers/aiDetectionRepository
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import {
  createRepositoryQuery,
  getRepositoryByIdQuery,
  getRepositoryByOwnerNameQuery,
  getRepositoriesListQuery,
  updateRepositoryQuery,
  deleteRepositoryQuery,
  updateRepositoryNextScanAtQuery,
  computeNextScanAt,
} from "../utils/aiDetectionRepository.utils";
import { getScansListQuery, getActiveScanForRepoQuery } from "../utils/aiDetection.utils";
import { startScan } from "../services/aiDetection.service";
import { IServiceContext } from "../domain.layer/interfaces/i.aiDetection";
import { ScheduleFrequency } from "../domain.layer/interfaces/i.aiDetectionRepository";

/**
 * Parse GitHub URL to extract owner and repo name
 */
function parseGitHubUrl(url: string): { owner: string; name: string } | null {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!match) return null;
  return { owner: match[1], name: match[2].replace(/\.git$/, "") };
}

// ============================================================================
// List Repositories
// ============================================================================

export async function listRepositories(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "listing repositories",
    functionName: "listRepositories",
    fileName: "aiDetectionRepository.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(100, Math.max(parseInt(req.query.limit as string) || 20, 1));

    const result = await getRepositoriesListQuery(req.organizationId!, page, limit);

    return res.status(200).json(
      STATUS_CODE[200]({
        repositories: result.repositories,
        pagination: {
          total: result.total,
          page,
          limit,
          total_pages: Math.ceil(result.total / limit),
        },
      })
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to list repositories",
      functionName: "listRepositories",
      fileName: "aiDetectionRepository.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================================================
// Get Repository
// ============================================================================

export async function getRepository(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "getting repository",
    functionName: "getRepository",
    fileName: "aiDetectionRepository.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json(STATUS_CODE[400]({ message: "Invalid repository ID" }));
    }

    const repository = await getRepositoryByIdQuery(id, req.organizationId!);
    if (!repository) {
      return res.status(404).json(STATUS_CODE[404]({ message: "Repository not found" }));
    }

    return res.status(200).json(STATUS_CODE[200](repository));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to get repository",
      functionName: "getRepository",
      fileName: "aiDetectionRepository.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================================================
// Create Repository
// ============================================================================

export async function createRepository(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "creating repository",
    functionName: "createRepository",
    fileName: "aiDetectionRepository.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const { repository_url, display_name, default_branch, github_token_id,
      schedule_enabled, schedule_frequency, schedule_day_of_week,
      schedule_day_of_month, schedule_hour, schedule_minute } = req.body;

    if (!repository_url) {
      return res.status(400).json(STATUS_CODE[400]({ message: "repository_url is required" }));
    }

    const parsed = parseGitHubUrl(repository_url);
    if (!parsed) {
      return res.status(400).json(STATUS_CODE[400]({ message: "Invalid GitHub repository URL" }));
    }

    // Check for duplicates
    const existing = await getRepositoryByOwnerNameQuery(parsed.owner, parsed.name, req.organizationId!);
    if (existing) {
      return res.status(409).json(
        STATUS_CODE[409]({ message: `Repository ${parsed.owner}/${parsed.name} is already registered` })
      );
    }

    // Validate schedule fields
    if (schedule_enabled) {
      if (!schedule_frequency || !["daily", "weekly", "monthly"].includes(schedule_frequency)) {
        return res.status(400).json(
          STATUS_CODE[400]({ message: "schedule_frequency must be daily, weekly, or monthly when schedule is enabled" })
        );
      }
      if (schedule_frequency === "weekly" && (schedule_day_of_week === undefined || schedule_day_of_week < 0 || schedule_day_of_week > 6)) {
        return res.status(400).json(
          STATUS_CODE[400]({ message: "schedule_day_of_week must be 0-6 for weekly schedule" })
        );
      }
      if (schedule_frequency === "monthly" && (schedule_day_of_month === undefined || schedule_day_of_month < 1 || schedule_day_of_month > 31)) {
        return res.status(400).json(
          STATUS_CODE[400]({ message: "schedule_day_of_month must be 1-31 for monthly schedule" })
        );
      }
      const hour = schedule_hour ?? 2;
      const minute = schedule_minute ?? 0;
      if (hour < 0 || hour > 23) {
        return res.status(400).json(
          STATUS_CODE[400]({ message: "schedule_hour must be 0-23" })
        );
      }
      if (minute < 0 || minute > 59) {
        return res.status(400).json(
          STATUS_CODE[400]({ message: "schedule_minute must be 0-59" })
        );
      }
    }

    const repository = await createRepositoryQuery(
      {
        repository_url: `https://github.com/${parsed.owner}/${parsed.name}`,
        repository_owner: parsed.owner,
        repository_name: parsed.name,
        display_name: display_name || null,
        default_branch: default_branch || "main",
        github_token_id: github_token_id ?? null,
        schedule_enabled: schedule_enabled ?? false,
        schedule_frequency: schedule_frequency || null,
        schedule_day_of_week: schedule_day_of_week ?? null,
        schedule_day_of_month: schedule_day_of_month ?? null,
        schedule_hour: schedule_hour ?? 2,
        schedule_minute: schedule_minute ?? 0,
        created_by: req.userId!,
      },
      req.organizationId!
    );

    await logSuccess({
      eventType: "Create",
      description: `Registered repository ${parsed.owner}/${parsed.name}`,
      functionName: "createRepository",
      fileName: "aiDetectionRepository.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(201).json(STATUS_CODE[201](repository));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "Failed to create repository",
      functionName: "createRepository",
      fileName: "aiDetectionRepository.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================================================
// Update Repository
// ============================================================================

export async function updateRepository(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "updating repository",
    functionName: "updateRepository",
    fileName: "aiDetectionRepository.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json(STATUS_CODE[400]({ message: "Invalid repository ID" }));
    }

    const existing = await getRepositoryByIdQuery(id, req.organizationId!);
    if (!existing) {
      return res.status(404).json(STATUS_CODE[404]({ message: "Repository not found" }));
    }

    const { display_name, default_branch, github_token_id,
      schedule_enabled, schedule_frequency, schedule_day_of_week,
      schedule_day_of_month, schedule_hour, schedule_minute, is_enabled } = req.body;

    // Validate schedule fields if enabling
    const willBeEnabled = schedule_enabled !== undefined ? schedule_enabled : existing.schedule_enabled;
    const freq = schedule_frequency !== undefined ? schedule_frequency : existing.schedule_frequency;

    if (willBeEnabled) {
      if (!freq || !["daily", "weekly", "monthly"].includes(freq)) {
        return res.status(400).json(
          STATUS_CODE[400]({ message: "schedule_frequency must be daily, weekly, or monthly when schedule is enabled" })
        );
      }
    }

    const updated = await updateRepositoryQuery(
      id,
      {
        display_name,
        default_branch,
        github_token_id,
        schedule_enabled,
        schedule_frequency,
        schedule_day_of_week,
        schedule_day_of_month,
        schedule_hour,
        schedule_minute,
        is_enabled,
      },
      req.organizationId!
    );

    if (!updated) {
      return res.status(404).json(STATUS_CODE[404]({ message: "Repository not found" }));
    }

    // Recompute next_scan_at if schedule changed
    const finalEnabled = updated.schedule_enabled;
    if (finalEnabled && updated.schedule_frequency) {
      const nextScanAt = computeNextScanAt(
        updated.schedule_frequency as ScheduleFrequency,
        updated.schedule_day_of_week ?? null,
        updated.schedule_day_of_month ?? null,
        updated.schedule_hour,
        updated.schedule_minute
      );
      await updateRepositoryNextScanAtQuery(id, nextScanAt, req.organizationId!);
      updated.next_scan_at = nextScanAt;
    } else if (!finalEnabled) {
      await updateRepositoryNextScanAtQuery(id, null, req.organizationId!);
      updated.next_scan_at = null;
    }

    await logSuccess({
      eventType: "Update",
      description: `Updated repository ${updated.repository_owner}/${updated.repository_name}`,
      functionName: "updateRepository",
      fileName: "aiDetectionRepository.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "Failed to update repository",
      functionName: "updateRepository",
      fileName: "aiDetectionRepository.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================================================
// Delete Repository
// ============================================================================

export async function deleteRepository(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "deleting repository",
    functionName: "deleteRepository",
    fileName: "aiDetectionRepository.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json(STATUS_CODE[400]({ message: "Invalid repository ID" }));
    }

    const existing = await getRepositoryByIdQuery(id, req.organizationId!);
    if (!existing) {
      return res.status(404).json(STATUS_CODE[404]({ message: "Repository not found" }));
    }

    // Block deletion if a scan is in progress for this repo
    const activeScan = await getActiveScanForRepoQuery(
      existing.repository_owner,
      existing.repository_name,
      req.organizationId!
    );
    if (activeScan) {
      return res.status(409).json(
        STATUS_CODE[409]({
          message: `Cannot delete repository while a scan is in progress for ${existing.repository_owner}/${existing.repository_name}`,
        })
      );
    }

    await deleteRepositoryQuery(id, req.organizationId!);

    await logSuccess({
      eventType: "Delete",
      description: `Deleted repository ${existing.repository_owner}/${existing.repository_name}`,
      functionName: "deleteRepository",
      fileName: "aiDetectionRepository.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200]({ message: "Repository deleted successfully" }));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: "Failed to delete repository",
      functionName: "deleteRepository",
      fileName: "aiDetectionRepository.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================================================
// Trigger Scan for Repository
// ============================================================================

export async function triggerRepositoryScan(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "triggering repository scan",
    functionName: "triggerRepositoryScan",
    fileName: "aiDetectionRepository.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json(STATUS_CODE[400]({ message: "Invalid repository ID" }));
    }

    const repository = await getRepositoryByIdQuery(id, req.organizationId!);
    if (!repository) {
      return res.status(404).json(STATUS_CODE[404]({ message: "Repository not found" }));
    }

    // Check if a scan is already running for this repo
    const activeScan = await getActiveScanForRepoQuery(
      repository.repository_owner,
      repository.repository_name,
      req.organizationId!
    );
    if (activeScan) {
      return res.status(409).json(
        STATUS_CODE[409]({
          message: `A scan is already in progress for ${repository.repository_owner}/${repository.repository_name}`,
        })
      );
    }

    const ctx: IServiceContext = {
      userId: req.userId!,
      role: req.role!,
      organizationId: req.organizationId!,
      tenantId: req.tenantHash!,
    };

    const scan = await startScan(repository.repository_url, ctx, {
      repositoryId: id,
      triggeredByType: "manual",
    });

    await logSuccess({
      eventType: "Create",
      description: `Triggered scan for repository ${repository.repository_owner}/${repository.repository_name}`,
      functionName: "triggerRepositoryScan",
      fileName: "aiDetectionRepository.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(201).json(STATUS_CODE[201](scan));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "Failed to trigger repository scan",
      functionName: "triggerRepositoryScan",
      fileName: "aiDetectionRepository.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    const statusCode =
      error instanceof Error && "statusCode" in error
        ? (error as Error & { statusCode: number }).statusCode
        : 500;
    const statusFn = STATUS_CODE[statusCode as keyof typeof STATUS_CODE];
    return res.status(statusCode).json(
      typeof statusFn === "function"
        ? statusFn((error as Error).message)
        : STATUS_CODE[500]((error as Error).message)
    );
  }
}

// ============================================================================
// Get Scans for Repository
// ============================================================================

export async function getRepositoryScans(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "getting repository scans",
    functionName: "getRepositoryScans",
    fileName: "aiDetectionRepository.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json(STATUS_CODE[400]({ message: "Invalid repository ID" }));
    }

    const repository = await getRepositoryByIdQuery(id, req.organizationId!);
    if (!repository) {
      return res.status(404).json(STATUS_CODE[404]({ message: "Repository not found" }));
    }

    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(100, Math.max(parseInt(req.query.limit as string) || 20, 1));

    const result = await getScansListQuery(
      req.organizationId!,
      page,
      limit,
      undefined,
      id
    );

    return res.status(200).json(
      STATUS_CODE[200]({
        scans: result.scans.map((s) => ({
          id: s.id,
          repository_url: s.repository_url,
          repository_owner: s.repository_owner,
          repository_name: s.repository_name,
          status: s.status,
          findings_count: s.findings_count || 0,
          files_scanned: s.files_scanned || 0,
          started_at: s.started_at,
          completed_at: s.completed_at,
          duration_ms: s.duration_ms,
          triggered_by: s.triggered_by_user,
          triggered_by_type: (s as any).triggered_by_type || "manual",
          created_at: s.created_at,
        })),
        pagination: {
          total: result.total,
          page,
          limit,
          total_pages: Math.ceil(result.total / limit),
        },
      })
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to get repository scans",
      functionName: "getRepositoryScans",
      fileName: "aiDetectionRepository.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
