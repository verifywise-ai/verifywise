import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";
import { createNewProjectQuery } from "./project.utils";
import { createEUAIActOrganizationFrameworkQuery } from "./eu.utils";
import { EU_AI_ACT_FRAMEWORK_ID } from "./validations/projectValidation.utils";
import { EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID } from "../structures";
import { getDeadlineAdminIdsQuery } from "./deadline.utils";
import { notifyEuAiActOrganizationAdded } from "../services/inAppNotification.service";
import logger from "./logger/fileLogger";

/**
 * Attach EU AI Act (organization) to the organization's organizational project
 * once EU AI Act is on one of its use cases. Idempotent: does nothing when an
 * organizational project already has it. Creates the organizational project
 * when the organization has none. Demo use cases do not trigger it. Once the
 * transaction commits, the organization's Admins, the user who enabled EU AI
 * Act and the organizational project's owner get an in-app notification.
 *
 * Returns whether this call attached the framework.
 */
export const ensureEuAiActOrganizationFrameworkQuery = async (
  useCaseId: number,
  organizationId: number,
  actorUserId: number | null,
  transaction: Transaction,
): Promise<boolean> => {
  const [useCase] = (await sequelize.query(
    `SELECT project_title, owner, is_demo FROM projects
      WHERE organization_id = :organizationId AND id = :useCaseId;`,
    { replacements: { organizationId, useCaseId }, type: QueryTypes.SELECT, transaction },
  )) as Array<{ project_title: string; owner: number | null; is_demo: boolean }>;
  if (!useCase || useCase.is_demo) return false;

  // Two use cases enabling EU AI Act at once would otherwise both find no
  // organizational project and create one each.
  await sequelize.query(
    `SELECT pg_advisory_xact_lock(hashtext('eu_ai_act_organization'), :organizationId);`,
    { replacements: { organizationId }, transaction },
  );

  const [{ attached }] = (await sequelize.query(
    `SELECT EXISTS (
       SELECT 1 FROM projects_frameworks pf
         JOIN projects p ON p.id = pf.project_id AND p.organization_id = pf.organization_id
        WHERE pf.organization_id = :organizationId
          AND pf.framework_id = :frameworkId
          AND p.is_organizational = true
          AND p.is_demo = false
     ) AS attached;`,
    {
      replacements: { organizationId, frameworkId: EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{ attached: boolean }>;
  if (attached) return false;

  // The Frameworks page shows the first organizational project of the list,
  // which is ordered created_at DESC, id ASC (getUserProjects). A demo one is
  // skipped: deleting the demo data removes it.
  const [existing] = (await sequelize.query(
    `SELECT id, project_title, owner FROM projects
      WHERE organization_id = :organizationId AND is_organizational = true AND is_demo = false
      ORDER BY created_at DESC, id ASC
      LIMIT 1;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT, transaction },
  )) as Array<{ id: number; project_title: string; owner: number | null }>;

  let organizationalProject = existing;
  if (!organizationalProject) {
    const [organization] = (await sequelize.query(
      `SELECT name FROM organizations WHERE id = :organizationId;`,
      { replacements: { organizationId }, type: QueryTypes.SELECT, transaction },
    )) as Array<{ name: string }>;
    const owner = actorUserId ?? useCase.owner;
    const created = await createNewProjectQuery(
      {
        project_title: organization.name,
        owner,
        start_date: new Date(),
        is_organizational: true,
      },
      [],
      [],
      organizationId,
      owner,
      transaction,
    );
    organizationalProject = {
      id: created.id!,
      project_title: created.project_title,
      owner: created.owner ?? null,
    };
  }
  const organizationalProjectId = organizationalProject.id;

  await sequelize.query(
    `INSERT INTO projects_frameworks (organization_id, project_id, framework_id, is_demo)
     VALUES (:organizationId, :projectId, :frameworkId, false);`,
    {
      replacements: {
        organizationId,
        projectId: organizationalProjectId,
        frameworkId: EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID,
      },
      transaction,
    },
  );
  await createEUAIActOrganizationFrameworkQuery(
    organizationalProjectId,
    false,
    organizationId,
    transaction,
  );

  const notified = {
    projectId: organizationalProjectId,
    projectTitle: organizationalProject.project_title,
    useCaseTitle: useCase.project_title,
    projectCreated: !existing,
  };
  const ownerId = organizationalProject.owner;
  // A savepoint runs its afterCommit hooks when it is released, before the
  // outer transaction commits, so the hook goes on the outermost one.
  let outermost = transaction as Transaction & { parent?: Transaction };
  while (outermost.parent) outermost = outermost.parent;
  outermost.afterCommit(async () => {
    try {
      const adminIds = await getDeadlineAdminIdsQuery(organizationId);
      const recipientIds = [
        ...new Set([...adminIds, actorUserId, ownerId].filter((id): id is number => id !== null)),
      ];
      await notifyEuAiActOrganizationAdded(organizationId, recipientIds, notified);
    } catch (error) {
      // The framework is added; a failed notification does not undo it.
      logger.error(
        `EU AI Act (organization) notification failed for organization ${organizationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });
  return true;
};

/** Whether a non-demo use case of the organization has EU AI Act. */
const isEuAiActInUseQuery = async (
  organizationId: number,
  transaction: Transaction,
): Promise<boolean> => {
  const [{ in_use }] = (await sequelize.query(
    `SELECT EXISTS (
       SELECT 1 FROM projects_frameworks pf
         JOIN projects p ON p.id = pf.project_id AND p.organization_id = pf.organization_id
        WHERE pf.organization_id = :organizationId
          AND pf.framework_id = :frameworkId
          AND p.is_organizational = false
          AND p.is_demo = false
     ) AS in_use;`,
    {
      replacements: { organizationId, frameworkId: EU_AI_ACT_FRAMEWORK_ID },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{ in_use: boolean }>;
  return in_use;
};

/**
 * Refuse removing EU AI Act (organization) while a use case still has EU AI Act.
 */
export const assertEuAiActOrganizationRemovableQuery = async (
  organizationId: number,
  transaction: Transaction,
): Promise<void> => {
  if (await isEuAiActInUseQuery(organizationId, transaction)) {
    throw new ValidationException(
      "EU AI Act (organization) can't be removed while a use case has EU AI Act",
      "framework",
      EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID,
      { i18nKey: "EU AI Act (organization) can't be removed while a use case has EU AI Act" },
    );
  }
};

/**
 * Refuse deleting the organizational project that holds EU AI Act
 * (organization) while a use case still has EU AI Act. Any other project, or
 * an organizational project without it, may be deleted.
 */
export const assertProjectDeletableForEuAiActQuery = async (
  projectId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<void> => {
  const [{ holds }] = (await sequelize.query(
    `SELECT EXISTS (
       SELECT 1 FROM projects_frameworks pf
         JOIN projects p ON p.id = pf.project_id AND p.organization_id = pf.organization_id
        WHERE pf.organization_id = :organizationId
          AND pf.project_id = :projectId
          AND pf.framework_id = :frameworkId
          AND p.is_organizational = true
     ) AS holds;`,
    {
      replacements: {
        organizationId,
        projectId,
        frameworkId: EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{ holds: boolean }>;
  if (holds && (await isEuAiActInUseQuery(organizationId, transaction))) {
    throw new ValidationException(
      "This project holds EU AI Act (organization) and can't be deleted while a use case has EU AI Act",
      "project",
      projectId,
      {
        i18nKey:
          "This project holds EU AI Act (organization) and can't be deleted while a use case has EU AI Act",
      },
    );
  }
};
