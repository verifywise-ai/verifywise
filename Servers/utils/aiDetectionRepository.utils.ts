/**
 * @fileoverview AI Detection Repository Database Utils
 *
 * Database query functions for AI Detection repository registry.
 * Follows the established pattern for shared-schema multi-tenant database operations.
 *
 * @module utils/aiDetectionRepository
 */

import { sequelize } from "../database/db";
import { Transaction, QueryTypes } from "sequelize";
import {
  IAIDetectionRepository,
  ICreateRepositoryInput,
  IUpdateRepositoryInput,
  ScheduleFrequency,
} from "../domain.layer/interfaces/i.aiDetectionRepository";

// ============================================================================
// Organization ID Validation
// ============================================================================

function validateOrganizationId(organizationId: number): void {
  if (!organizationId || !Number.isInteger(organizationId) || organizationId <= 0) {
    throw new Error(`Invalid organization identifier: ${organizationId}`);
  }
}

// ============================================================================
// CRUD Queries
// ============================================================================

export async function createRepositoryQuery(
  input: ICreateRepositoryInput,
  organizationId: number,
  transaction?: Transaction
): Promise<IAIDetectionRepository> {
  validateOrganizationId(organizationId);

  const nextScanAt = input.schedule_enabled
    ? computeNextScanAt(
        input.schedule_frequency || "daily",
        input.schedule_day_of_week ?? null,
        input.schedule_day_of_month ?? null,
        input.schedule_hour ?? 2,
        input.schedule_minute ?? 0
      )
    : null;

  const query = `
    INSERT INTO ai_detection_repositories (
      organization_id, repository_url, repository_owner, repository_name,
      display_name, default_branch, github_token_id,
      schedule_enabled, schedule_frequency, schedule_day_of_week,
      schedule_day_of_month, schedule_hour, schedule_minute,
      next_scan_at, is_enabled, created_by,
      created_at, updated_at
    ) VALUES (
      :organizationId, :repository_url, :repository_owner, :repository_name,
      :display_name, :default_branch, :github_token_id,
      :schedule_enabled, :schedule_frequency, :schedule_day_of_week,
      :schedule_day_of_month, :schedule_hour, :schedule_minute,
      :next_scan_at, TRUE, :created_by,
      NOW(), NOW()
    )
    RETURNING *;
  `;

  const [results] = await sequelize.query(query, {
    replacements: {
      organizationId,
      repository_url: input.repository_url,
      repository_owner: input.repository_owner,
      repository_name: input.repository_name,
      display_name: input.display_name || null,
      default_branch: input.default_branch || "main",
      github_token_id: input.github_token_id ?? null,
      schedule_enabled: input.schedule_enabled ?? false,
      schedule_frequency: input.schedule_frequency ?? null,
      schedule_day_of_week: input.schedule_day_of_week ?? null,
      schedule_day_of_month: input.schedule_day_of_month ?? null,
      schedule_hour: input.schedule_hour ?? 2,
      schedule_minute: input.schedule_minute ?? 0,
      next_scan_at: nextScanAt,
      created_by: input.created_by,
    },
    transaction,
  });

  return (results as IAIDetectionRepository[])[0];
}

export async function getRepositoryByIdQuery(
  id: number,
  organizationId: number
): Promise<IAIDetectionRepository | null> {
  validateOrganizationId(organizationId);
  const query = `
    SELECT * FROM ai_detection_repositories
    WHERE id = :id AND organization_id = :organizationId;
  `;

  const results = await sequelize.query(query, {
    replacements: { id, organizationId },
    type: QueryTypes.SELECT,
  });

  return (results as IAIDetectionRepository[])[0] || null;
}

export async function getRepositoryByOwnerNameQuery(
  owner: string,
  name: string,
  organizationId: number
): Promise<IAIDetectionRepository | null> {
  validateOrganizationId(organizationId);
  const query = `
    SELECT * FROM ai_detection_repositories
    WHERE repository_owner = :owner AND repository_name = :name AND organization_id = :organizationId;
  `;

  const results = await sequelize.query(query, {
    replacements: { owner, name, organizationId },
    type: QueryTypes.SELECT,
  });

  return (results as IAIDetectionRepository[])[0] || null;
}

export async function getRepositoriesListQuery(
  organizationId: number,
  page: number = 1,
  limit: number = 20
): Promise<{ repositories: IAIDetectionRepository[]; total: number }> {
  validateOrganizationId(organizationId);
  const offset = (page - 1) * limit;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM ai_detection_repositories
    WHERE organization_id = :organizationId;
  `;

  const dataQuery = `
    SELECT *
    FROM ai_detection_repositories
    WHERE organization_id = :organizationId
    ORDER BY created_at DESC
    LIMIT :limit OFFSET :offset;
  `;

  const [countResults, dataResults] = await Promise.all([
    sequelize.query(countQuery, { replacements: { organizationId }, type: QueryTypes.SELECT }),
    sequelize.query(dataQuery, {
      replacements: { organizationId, limit, offset },
      type: QueryTypes.SELECT,
    }),
  ]);

  return {
    repositories: dataResults as IAIDetectionRepository[],
    total: parseInt((countResults[0] as { total: string }).total, 10),
  };
}

export async function updateRepositoryQuery(
  id: number,
  input: IUpdateRepositoryInput,
  organizationId: number,
  transaction?: Transaction
): Promise<IAIDetectionRepository | null> {
  validateOrganizationId(organizationId);

  const setClauses: string[] = ["updated_at = NOW()"];
  const replacements: Record<string, unknown> = { id, organizationId };

  if (input.display_name !== undefined) {
    setClauses.push("display_name = :display_name");
    replacements.display_name = input.display_name;
  }
  if (input.default_branch !== undefined) {
    setClauses.push("default_branch = :default_branch");
    replacements.default_branch = input.default_branch;
  }
  if (input.github_token_id !== undefined) {
    setClauses.push("github_token_id = :github_token_id");
    replacements.github_token_id = input.github_token_id;
  }
  if (input.schedule_enabled !== undefined) {
    setClauses.push("schedule_enabled = :schedule_enabled");
    replacements.schedule_enabled = input.schedule_enabled;
  }
  if (input.schedule_frequency !== undefined) {
    setClauses.push("schedule_frequency = :schedule_frequency");
    replacements.schedule_frequency = input.schedule_frequency;
  }
  if (input.schedule_day_of_week !== undefined) {
    setClauses.push("schedule_day_of_week = :schedule_day_of_week");
    replacements.schedule_day_of_week = input.schedule_day_of_week;
  }
  if (input.schedule_day_of_month !== undefined) {
    setClauses.push("schedule_day_of_month = :schedule_day_of_month");
    replacements.schedule_day_of_month = input.schedule_day_of_month;
  }
  if (input.schedule_hour !== undefined) {
    setClauses.push("schedule_hour = :schedule_hour");
    replacements.schedule_hour = input.schedule_hour;
  }
  if (input.schedule_minute !== undefined) {
    setClauses.push("schedule_minute = :schedule_minute");
    replacements.schedule_minute = input.schedule_minute;
  }
  if (input.is_enabled !== undefined) {
    setClauses.push("is_enabled = :is_enabled");
    replacements.is_enabled = input.is_enabled;
  }

  const query = `
    UPDATE ai_detection_repositories
    SET ${setClauses.join(", ")}
    WHERE id = :id AND organization_id = :organizationId
    RETURNING *;
  `;

  const [results] = await sequelize.query(query, {
    replacements,
    transaction,
  });

  return (results as IAIDetectionRepository[])[0] || null;
}

export async function deleteRepositoryQuery(
  id: number,
  organizationId: number,
  transaction?: Transaction
): Promise<boolean> {
  validateOrganizationId(organizationId);
  const query = `
    DELETE FROM ai_detection_repositories
    WHERE id = :id AND organization_id = :organizationId;
  `;

  await sequelize.query(query, {
    replacements: { id, organizationId },
    type: QueryTypes.DELETE,
    transaction,
  });

  return true;
}

// ============================================================================
// Scan Integration Queries
// ============================================================================

export async function updateRepositoryLastScanQuery(
  repositoryId: number,
  scanId: number,
  scanStatus: string,
  organizationId: number,
  transaction?: Transaction
): Promise<void> {
  validateOrganizationId(organizationId);
  const query = `
    UPDATE ai_detection_repositories
    SET
      last_scan_id = :scanId,
      last_scan_status = :scanStatus,
      last_scan_at = NOW(),
      updated_at = NOW()
    WHERE id = :repositoryId AND organization_id = :organizationId;
  `;

  await sequelize.query(query, {
    replacements: { repositoryId, scanId, scanStatus, organizationId },
    type: QueryTypes.UPDATE,
    transaction,
  });
}

export async function updateRepositoryNextScanAtQuery(
  repositoryId: number,
  nextScanAt: Date | null,
  organizationId: number,
  transaction?: Transaction
): Promise<void> {
  validateOrganizationId(organizationId);
  const query = `
    UPDATE ai_detection_repositories
    SET next_scan_at = :nextScanAt, updated_at = NOW()
    WHERE id = :repositoryId AND organization_id = :organizationId;
  `;

  await sequelize.query(query, {
    replacements: { repositoryId, nextScanAt, organizationId },
    type: QueryTypes.UPDATE,
    transaction,
  });
}

// ============================================================================
// Scheduled Scan Queries
// ============================================================================

export async function getRepositoriesDueForScanQuery(
  organizationId: number
): Promise<IAIDetectionRepository[]> {
  validateOrganizationId(organizationId);
  const query = `
    SELECT * FROM ai_detection_repositories
    WHERE organization_id = :organizationId
      AND is_enabled = TRUE
      AND schedule_enabled = TRUE
      AND next_scan_at <= NOW()
    ORDER BY next_scan_at ASC;
  `;

  const results = await sequelize.query(query, {
    replacements: { organizationId },
    type: QueryTypes.SELECT,
  });

  return results as IAIDetectionRepository[];
}

export async function getRepositoryCountQuery(
  organizationId: number
): Promise<number> {
  validateOrganizationId(organizationId);
  const query = `
    SELECT COUNT(*) as total
    FROM ai_detection_repositories
    WHERE organization_id = :organizationId;
  `;

  const results = await sequelize.query(query, {
    replacements: { organizationId },
    type: QueryTypes.SELECT,
  });

  return parseInt((results[0] as { total: string }).total, 10);
}

// ============================================================================
// Next Scan At Computation
// ============================================================================

export function computeNextScanAt(
  frequency: ScheduleFrequency,
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  hour: number,
  minute: number
): Date {
  const now = new Date();
  const next = new Date();

  // Set time
  next.setUTCHours(hour, minute, 0, 0);

  switch (frequency) {
    case "daily":
      // Next occurrence: today at scheduled time, or tomorrow if past
      if (next <= now) {
        next.setUTCDate(next.getUTCDate() + 1);
      }
      break;

    case "weekly": {
      const targetDay = dayOfWeek ?? 1; // Default Monday
      const currentDay = next.getUTCDay();
      let daysAhead = targetDay - currentDay;
      if (daysAhead < 0 || (daysAhead === 0 && next <= now)) {
        daysAhead += 7;
      }
      next.setUTCDate(next.getUTCDate() + daysAhead);
      break;
    }

    case "monthly": {
      const targetDayOfMonth = dayOfMonth ?? 1; // Default 1st
      // Set day to 1 first to avoid overflow when changing month
      next.setUTCDate(1);
      const currentMonth = next.getUTCMonth();
      const currentYear = next.getUTCFullYear();

      // Try this month's target day
      const thisMonthLastDay = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();
      const effectiveDay = Math.min(targetDayOfMonth, thisMonthLastDay);
      next.setUTCDate(effectiveDay);

      if (next <= now) {
        // Move to next month
        next.setUTCDate(1);
        next.setUTCMonth(next.getUTCMonth() + 1);
        const nextMonthLastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
        next.setUTCDate(Math.min(targetDayOfMonth, nextMonthLastDay));
      }
      break;
    }
  }

  return next;
}
