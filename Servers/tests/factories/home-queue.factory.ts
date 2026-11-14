import { sequelize } from "../../database/db";
import { createTestModelInventory } from "./test-entities.factory";
import { addDays } from "../../services/homeQueue/sources/dateOnly";
import type { HomeQueueContext } from "../../domain.layer/interfaces/i.homeQueue";

/**
 * Seed helpers for the Home queue's ownership sources. Each inserts one row
 * through raw SQL (the factories' convention) and returns its id. Dates are
 * `YYYY-MM-DD` strings; they are stored at noon UTC so no time zone can move
 * the calendar day.
 */

/** Today's UTC date, the same day the queue service uses as `ctx.today`. */
export const utcToday = (): string => new Date().toISOString().slice(0, 10);

/** `today` shifted by `days` (negative for the past). */
export const dayOffset = (days: number): string => addDays(utcToday(), days);

export const homeQueueContext = (organizationId: number, userId: number): HomeQueueContext => ({
  organizationId,
  userId,
  can: () => false,
  isAdmin: false,
  today: utcToday(),
});

const noonUtc = (date: string | null): string | null => (date ? `${date}T12:00:00.000Z` : null);

const firstId = (result: unknown): number => (result as { id: number }[][])[0][0].id;

export interface SeedRiskOptions {
  name: string;
  ownerId: number | null;
  /** NULL stays NULL (the column has no default). */
  mitigationStatus?: string | null;
  deadline?: string | null;
  deleted?: boolean;
}

export async function seedRisk(orgId: number, o: SeedRiskOptions): Promise<number> {
  return firstId(
    await sequelize.query(
      `INSERT INTO risks (organization_id, risk_name, risk_owner, mitigation_status, deadline,
                          is_deleted, created_at, updated_at)
       VALUES (:orgId, :name, :ownerId,
               CAST(:status AS enum_projectrisks_mitigation_status), :deadline,
               :deleted, NOW(), NOW())
       RETURNING id`,
      {
        replacements: {
          orgId,
          name: o.name,
          ownerId: o.ownerId,
          status: o.mitigationStatus ?? null,
          deadline: noonUtc(o.deadline ?? null),
          deleted: o.deleted ?? false,
        },
      },
    ),
  );
}

export interface SeedPolicyOptions {
  title: string;
  ownerId?: number | null;
  reviewerIds?: number[];
  nextReviewDate: string | null;
}

export async function seedPolicy(orgId: number, o: SeedPolicyOptions): Promise<number> {
  const id = firstId(
    await sequelize.query(
      `INSERT INTO policy_manager (organization_id, title, policy_owner_id, next_review_date, created_at)
       VALUES (:orgId, :title, :ownerId, :nextReview, NOW())
       RETURNING id`,
      {
        replacements: {
          orgId,
          title: o.title,
          ownerId: o.ownerId ?? null,
          nextReview: o.nextReviewDate ? `${o.nextReviewDate} 12:00:00` : null,
        },
      },
    ),
  );
  for (const userId of o.reviewerIds ?? []) {
    await sequelize.query(
      `INSERT INTO policy_manager__assigned_reviewer_ids (organization_id, policy_manager_id, user_id)
       VALUES (:orgId, :id, :userId)`,
      { replacements: { orgId, id, userId } },
    );
  }
  return id;
}

export interface SeedVendorOptions {
  name: string;
  assigneeId?: number | null;
  reviewerId?: number | null;
  reviewDate: string | null;
  reviewStatus?: string | null;
}

export async function seedVendor(orgId: number, o: SeedVendorOptions): Promise<number> {
  return firstId(
    await sequelize.query(
      `INSERT INTO vendors (organization_id, vendor_name, vendor_provides, website,
                            vendor_contact_person, assignee, reviewer, review_date, review_status,
                            created_at, updated_at)
       VALUES (:orgId, :name, 'Services', 'https://example.com', 'Contact', :assignee,
               :reviewer, :reviewDate, :reviewStatus, NOW(), NOW())
       RETURNING id`,
      {
        replacements: {
          orgId,
          name: o.name,
          assignee: o.assigneeId ?? null,
          reviewer: o.reviewerId ?? null,
          reviewDate: noonUtc(o.reviewDate),
          reviewStatus: o.reviewStatus ?? null,
        },
      },
    ),
  );
}

export interface SeedIncidentOptions {
  assigneeId: number | null;
  status?: string;
  severity?: string;
  archived?: boolean;
  aiProject?: string;
}

export async function seedIncident(orgId: number, o: SeedIncidentOptions): Promise<number> {
  return firstId(
    await sequelize.query(
      `INSERT INTO ai_incident_managements (organization_id, ai_project, severity, status,
                                            assignee_id, archived, created_at, updated_at)
       VALUES (:orgId, :aiProject, :severity, :status, :assigneeId, :archived, NOW(), NOW())
       RETURNING id`,
      {
        replacements: {
          orgId,
          aiProject: o.aiProject ?? "Test project",
          severity: o.severity ?? "Minor",
          status: o.status ?? "Open",
          assigneeId: o.assigneeId,
          archived: o.archived ?? false,
        },
      },
    ),
  );
}

export interface SeedFindingOptions {
  title: string;
  ownerId: number | null;
  stage?: string;
  dueDate?: string | null;
}

/** A finding needs a model, so one is created per call. */
export async function seedMrmFinding(orgId: number, o: SeedFindingOptions): Promise<number> {
  const modelId = await createTestModelInventory(orgId);
  return firstId(
    await sequelize.query(
      `INSERT INTO mrm_findings (organization_id, model_inventory_id, title, stage, owner_id,
                                 due_date, created_at, updated_at)
       VALUES (:orgId, :modelId, :title, CAST(:stage AS enum_mrm_finding_stage), :ownerId,
               :dueDate, NOW(), NOW())
       RETURNING id`,
      {
        replacements: {
          orgId,
          modelId,
          title: o.title,
          stage: o.stage ?? "open",
          ownerId: o.ownerId,
          dueDate: noonUtc(o.dueDate ?? null),
        },
      },
    ),
  );
}
