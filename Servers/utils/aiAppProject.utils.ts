import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";
import { IAIAppDetail } from "../domain.layer/interfaces/i.aiApp";
import { createAiAppQuery } from "./aiApp.utils";
import { recordEntityChange } from "./changeHistory.base.utils";
import { projectVisibilitySql } from "./projectVisibility.utils";

export interface ProjectViewer {
  userId: number;
  role: string;
}

interface VisibleProject {
  id: number;
  uc_id: string | null;
  project_title: string;
  description: string | null;
  owner: number | null;
  is_demo: boolean;
  is_organizational: boolean;
}

export interface LinkedAiApp {
  id: number;
  name: string;
  status: string;
  lifecycle_stage: string;
}

export interface LinkedUseCase {
  id: number;
  uc_id: string | null;
  project_title: string;
  status: string;
}

/** Field names for ai_app_change_history; the free-form columns keep the rest. */
const HISTORY_CREATED_FROM = "Created from use case";
const HISTORY_LINKED = "Linked use case";

const ORGANIZATIONAL_REFUSAL = "Organizational use cases cannot be linked to an AI app";

/**
 * How the AI app's change history names a use case. Anyone in the org can read
 * that history, including people who cannot see the use case, so never the title.
 */
function useCaseLabel(project: Pick<VisibleProject, "id" | "uc_id">): string {
  return project.uc_id ?? `#${project.id}`;
}

function refuseOrganizational(project: VisibleProject): void {
  if (project.is_organizational) {
    throw new ValidationException(ORGANIZATIONAL_REFUSAL, "project_id", project.id);
  }
}

/** A use case in this org that the viewer may see; null answers 404 either way. */
export async function getVisibleProjectQuery(
  projectId: number,
  viewer: ProjectViewer,
  organizationId: number,
  transaction?: Transaction,
): Promise<VisibleProject | null> {
  const visibility = projectVisibilitySql("p", viewer);
  const rows = await sequelize.query<VisibleProject>(
    `SELECT p.id, p.uc_id, p.project_title, p.description, p.owner, p.is_demo, p.is_organizational
       FROM projects p
      WHERE p.organization_id = :organizationId AND p.id = :projectId${visibility.sql}`,
    {
      replacements: { organizationId, projectId, ...visibility.replacements },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  return rows[0] ?? null;
}

async function aiAppExistsQuery(
  aiAppId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<boolean> {
  const rows = await sequelize.query(
    `SELECT 1 FROM ai_apps WHERE organization_id = :organizationId AND id = :aiAppId`,
    { replacements: { organizationId, aiAppId }, type: QueryTypes.SELECT, transaction },
  );
  return rows.length > 0;
}

/**
 * The models a use case hands to a new AI app: the ones on its Linked models tab
 * (getModelByProjectIdQuery). Rows with a framework_id belong to the framework;
 * their project_id is just the first project found using that framework.
 */
async function getProjectModelIdsQuery(
  projectId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<number[]> {
  const rows = await sequelize.query<{ model_inventory_id: number }>(
    `SELECT DISTINCT model_inventory_id
       FROM model_inventories_projects_frameworks
      WHERE organization_id = :organizationId
        AND project_id = :projectId
        AND framework_id IS NULL
        AND model_inventory_id IS NOT NULL`,
    { replacements: { organizationId, projectId }, type: QueryTypes.SELECT, transaction },
  );
  return rows.map((row) => row.model_inventory_id);
}

/** What creating an AI app from this use case would copy; null when it is not visible. */
export async function getCreateAiAppPreviewQuery(
  projectId: number,
  viewer: ProjectViewer,
  organizationId: number,
): Promise<{ model_count: number } | null> {
  const project = await getVisibleProjectQuery(projectId, viewer, organizationId);
  if (!project) return null;
  const modelIds = await getProjectModelIdsQuery(projectId, organizationId);
  return { model_count: modelIds.length };
}

/** External owners (#5256) leave the owner null; a former member is not eligible either. */
async function resolveAiAppOwnerQuery(
  projectOwner: number | null,
  fallbackUserId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<number> {
  if (projectOwner === null) return fallbackUserId;
  const rows = await sequelize.query(
    `SELECT 1 FROM organization_members
      WHERE organization_id = :organizationId AND user_id = :userId`,
    {
      replacements: { organizationId, userId: projectOwner },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  return rows.length > 0 ? projectOwner : fallbackUserId;
}

/** Insert the link; false when the pair was already linked. */
async function insertLinkQuery(
  aiAppId: number,
  projectId: number,
  organizationId: number,
  createdBy: number,
  transaction: Transaction,
): Promise<boolean> {
  const [rows] = await sequelize.query(
    `INSERT INTO ai_apps_projects (ai_app_id, project_id, organization_id, created_by)
     VALUES (:aiAppId, :projectId, :organizationId, :createdBy)
     ON CONFLICT (ai_app_id, project_id) DO NOTHING
     RETURNING ai_app_id`,
    { replacements: { aiAppId, projectId, organizationId, createdBy }, transaction },
  );
  return (rows as unknown[]).length > 0;
}

/**
 * Create a draft AI app from a use case and link the two (#5259), inside the
 * caller's transaction. Returns null when the use case is not visible.
 */
export async function createAiAppFromProjectQuery(
  projectId: number,
  requestedName: string | undefined,
  viewer: ProjectViewer,
  organizationId: number,
  transaction: Transaction,
): Promise<IAIAppDetail | null> {
  const project = await getVisibleProjectQuery(projectId, viewer, organizationId, transaction);
  if (!project) return null;
  refuseOrganizational(project);

  const ownerId = await resolveAiAppOwnerQuery(
    project.owner,
    viewer.userId,
    organizationId,
    transaction,
  );
  const modelIds = await getProjectModelIdsQuery(projectId, organizationId, transaction);

  const aiApp = await createAiAppQuery(
    {
      name: requestedName || project.project_title,
      description: project.description ?? undefined,
      owner_id: ownerId,
      is_demo: project.is_demo,
      model_inventory_ids: modelIds,
    },
    organizationId,
    transaction,
    viewer.userId,
  );

  await insertLinkQuery(aiApp.id!, projectId, organizationId, viewer.userId, transaction);
  await recordEntityChange(
    "ai_app",
    aiApp.id!,
    "created",
    viewer.userId,
    organizationId,
    HISTORY_CREATED_FROM,
    "-",
    useCaseLabel(project),
    transaction,
  );
  return aiApp;
}

/** AI apps linked to a use case the caller has already been shown. */
export async function getProjectAiAppsQuery(
  projectId: number,
  organizationId: number,
): Promise<LinkedAiApp[]> {
  return sequelize.query<LinkedAiApp>(
    `SELECT a.id, a.name, a.status, a.lifecycle_stage
       FROM ai_apps_projects l
       JOIN ai_apps a ON a.id = l.ai_app_id AND a.organization_id = l.organization_id
      WHERE l.organization_id = :organizationId AND l.project_id = :projectId
      ORDER BY a.name, a.id`,
    { replacements: { organizationId, projectId }, type: QueryTypes.SELECT },
  );
}

/**
 * Use cases linked to an AI app that the viewer may see, plus how many others
 * are linked. Null when the AI app is not in this org.
 */
export async function getAiAppUseCasesQuery(
  aiAppId: number,
  viewer: ProjectViewer,
  organizationId: number,
): Promise<{ use_cases: LinkedUseCase[]; hidden_count: number } | null> {
  if (!(await aiAppExistsQuery(aiAppId, organizationId))) return null;

  const visibility = projectVisibilitySql("p", viewer);
  const linkedFrom = `FROM ai_apps_projects l
       JOIN projects p ON p.id = l.project_id AND p.organization_id = l.organization_id
      WHERE l.organization_id = :organizationId AND l.ai_app_id = :aiAppId`;

  const useCases = await sequelize.query<LinkedUseCase>(
    `SELECT p.id, p.uc_id, p.project_title, p.status
       ${linkedFrom}${visibility.sql}
      ORDER BY p.project_title, p.id`,
    {
      replacements: { organizationId, aiAppId, ...visibility.replacements },
      type: QueryTypes.SELECT,
    },
  );
  const [{ total }] = await sequelize.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total ${linkedFrom}`,
    { replacements: { organizationId, aiAppId }, type: QueryTypes.SELECT },
  );

  return { use_cases: useCases, hidden_count: Math.max(total - useCases.length, 0) };
}

/** Link a use case to an AI app, idempotently. False when either side is not found. */
export async function linkUseCaseToAiAppQuery(
  aiAppId: number,
  projectId: number,
  viewer: ProjectViewer,
  organizationId: number,
  transaction: Transaction,
): Promise<boolean> {
  if (!(await aiAppExistsQuery(aiAppId, organizationId, transaction))) return false;
  const project = await getVisibleProjectQuery(projectId, viewer, organizationId, transaction);
  if (!project) return false;
  refuseOrganizational(project);

  const inserted = await insertLinkQuery(
    aiAppId,
    projectId,
    organizationId,
    viewer.userId,
    transaction,
  );
  if (inserted) {
    await recordEntityChange(
      "ai_app",
      aiAppId,
      "updated",
      viewer.userId,
      organizationId,
      HISTORY_LINKED,
      "-",
      useCaseLabel(project),
      transaction,
    );
  }
  return true;
}

/** Remove a link. False when the use case is not visible or the link does not exist. */
export async function unlinkUseCaseFromAiAppQuery(
  aiAppId: number,
  projectId: number,
  viewer: ProjectViewer,
  organizationId: number,
  transaction: Transaction,
): Promise<boolean> {
  const project = await getVisibleProjectQuery(projectId, viewer, organizationId, transaction);
  if (!project) return false;

  const [rows] = await sequelize.query(
    `DELETE FROM ai_apps_projects
      WHERE organization_id = :organizationId
        AND ai_app_id = :aiAppId
        AND project_id = :projectId
      RETURNING ai_app_id`,
    { replacements: { organizationId, aiAppId, projectId }, transaction },
  );
  if ((rows as unknown[]).length === 0) return false;

  await recordEntityChange(
    "ai_app",
    aiAppId,
    "updated",
    viewer.userId,
    organizationId,
    HISTORY_LINKED,
    useCaseLabel(project),
    "-",
    transaction,
  );
  return true;
}
