/**
 * Organization checks for the ids a model or model risk points at.
 *
 * Every write path (REST, advisor, intake, Shadow AI, seeds) goes through
 * the model and model-risk write queries, which call these inside their own
 * transaction, so a reference is checked in the transaction that stores it.
 * A failed check throws a ValidationException whose message is an i18n key;
 * controllers answer it with 400 through translateError.
 */
import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  ForbiddenException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";
import { getProjectAccessQuery } from "./project.utils";

/** A positive integer, or a string of digits. Anything else is null. */
export function toPositiveId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 && value <= 2147483647 ? value : null;
  }
  if (typeof value === "string" && /^[1-9][0-9]{0,9}$/.test(value)) {
    const n = Number(value);
    return n <= 2147483647 ? n : null;
  }
  return null;
}

const isEmpty = (value: unknown) => value === null || value === undefined || value === "";

/**
 * Checks that a user id belongs to a member of the organization. An empty
 * value clears the field and passes (returns null). Returns the parsed id.
 */
export async function assertOrganizationMember(
  value: unknown,
  organizationId: number,
  field: string,
  messageKey: string,
  transaction: Transaction | null,
): Promise<number | null> {
  if (isEmpty(value)) return null;
  const userId = toPositiveId(value);
  if (userId === null) throw new ValidationException(messageKey, field, value);
  const rows = (await sequelize.query(
    `SELECT user_id AS id FROM organization_members
      WHERE organization_id = :organizationId AND user_id IN (:userIds)`,
    {
      replacements: { organizationId, userIds: [userId] },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as { id: number }[];
  if (rows.length === 0) throw new ValidationException(messageKey, field, value);
  return userId;
}

export const MODEL_NOT_IN_ORGANIZATION = "The model was not found in this organization.";

/** Checks that a model inventory id belongs to the organization. Returns the parsed id. */
export async function assertModelInOrganization(
  value: unknown,
  organizationId: number,
  transaction: Transaction | null,
): Promise<number> {
  const modelId = toPositiveId(value);
  if (modelId === null) throw new ValidationException(MODEL_NOT_IN_ORGANIZATION, "model_id", value);
  const rows = (await sequelize.query(
    `SELECT id FROM model_inventories WHERE id = :modelId AND organization_id = :organizationId`,
    {
      replacements: { modelId, organizationId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as { id: number }[];
  if (rows.length === 0) {
    throw new ValidationException(MODEL_NOT_IN_ORGANIZATION, "model_id", value);
  }
  return modelId;
}

export const USE_CASE_NOT_IN_ORGANIZATION =
  "A selected use case was not found in this organization.";
export const FRAMEWORK_NOT_IN_ORGANIZATION =
  "A selected framework is not used by any use case in this organization.";

function parseIdList(value: unknown, field: string, messageKey: string): number[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationException(messageKey, field, value);
  const ids = value.map(toPositiveId);
  if (ids.some((id) => id === null)) throw new ValidationException(messageKey, field, value);
  return Array.from(new Set(ids as number[]));
}

/**
 * Parses the use case and framework ids a model is linked to, dedupes them,
 * and checks each against the organization: a use case must be one of its
 * projects, a framework must be in use by at least one of its projects.
 *
 * `linkedFrameworkIds` are the frameworks the model is already linked to
 * (on update). They are accepted unchanged: a framework link carries no use
 * case, so it outlives the last use case that used the framework, and the
 * model form sends every current framework back on each save.
 */
export async function resolveModelLinkTargets(
  projects: unknown,
  frameworks: unknown,
  organizationId: number,
  transaction: Transaction | null,
  linkedFrameworkIds: readonly number[] = [],
): Promise<{ projectIds: number[]; frameworkIds: number[] }> {
  const projectIds = parseIdList(projects, "projects", USE_CASE_NOT_IN_ORGANIZATION);
  const frameworkIds = parseIdList(frameworks, "frameworks", FRAMEWORK_NOT_IN_ORGANIZATION);
  const addedFrameworkIds = frameworkIds.filter((id) => !linkedFrameworkIds.includes(id));

  if (projectIds.length > 0) {
    const rows = (await sequelize.query(
      `SELECT id FROM projects WHERE organization_id = :organizationId AND id IN (:ids)`,
      { replacements: { organizationId, ids: projectIds }, type: QueryTypes.SELECT, transaction },
    )) as { id: number }[];
    if (rows.length !== projectIds.length) {
      throw new ValidationException(USE_CASE_NOT_IN_ORGANIZATION, "projects", projectIds);
    }
  }

  if (addedFrameworkIds.length > 0) {
    const rows = (await sequelize.query(
      `SELECT DISTINCT framework_id AS id FROM projects_frameworks
        WHERE organization_id = :organizationId AND framework_id IN (:ids)`,
      {
        replacements: { organizationId, ids: addedFrameworkIds },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as { id: number }[];
    if (rows.length !== addedFrameworkIds.length) {
      throw new ValidationException(FRAMEWORK_NOT_IN_ORGANIZATION, "frameworks", addedFrameworkIds);
    }
  }

  return { projectIds, frameworkIds };
}

/** The caller whose use case access a model write checks. */
export type UseCaseViewer = { userId: number; role: string };

/**
 * The use cases among `projectIds` the viewer cannot open (the rule that
 * scopes the use case list: Admin, owner or member). The ids are already
 * checked against the organization.
 */
export async function useCasesWithoutAccess(
  projectIds: number[],
  viewer: UseCaseViewer,
  organizationId: number,
  transaction: Transaction,
): Promise<number[]> {
  const denied: number[] = [];
  for (const projectId of projectIds) {
    const access = await getProjectAccessQuery(projectId, viewer, organizationId, transaction);
    if (access !== "allowed") denied.push(projectId);
  }
  return denied;
}

/**
 * Linking a model to a use case changes that use case, so the caller needs
 * access to each use case linked (decision 8).
 */
export async function assertUseCaseWriteAccess(
  projectIds: number[],
  viewer: UseCaseViewer,
  organizationId: number,
  transaction: Transaction,
): Promise<void> {
  const denied = await useCasesWithoutAccess(projectIds, viewer, organizationId, transaction);
  if (denied.length > 0) throw new ForbiddenException("Access denied", "project", "link");
}
