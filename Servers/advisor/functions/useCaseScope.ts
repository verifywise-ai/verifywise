/**
 * Who an advisor tool runs for, and which use cases that user may read.
 *
 * Every advisor read that lists or opens use cases goes through here, so the
 * advisor sees what the user's use case list shows (projectVisibilitySql, the
 * rule of GET /api/projects) and opens one use case only where
 * GET /api/projects/:id would (getProjectReadAccessQuery).
 */
import { getProjectReadAccessQuery } from "../../utils/project.utils";
import { getUserRoleInOrganization } from "../../utils/userPermission.utils";

export interface ProjectViewer {
  userId: number;
  role: string;
}

/** Matches no owner, member or group: sees no use case. */
export const NO_PROJECT_VIEWER: ProjectViewer = Object.freeze({ userId: 0, role: "" });

/**
 * The user the tool runs for: the user who asked (an approved write carries
 * them as _requesterId), else the chatting or approving user (_userId,
 * injected by toolBridge and the approval gateway).
 */
export const actingUserId = (params: Record<string, unknown>): number | undefined => {
  const id = Number(params._requesterId) || Number(params._userId);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
};

/**
 * The acting user with their role in the organization, for projectVisibilitySql
 * and getUserProjects. NO_PROJECT_VIEWER when the user is unknown or not a
 * member of the organization: it fails closed.
 */
export const actingProjectViewer = async (
  params: Record<string, unknown>,
  organizationId: number,
): Promise<ProjectViewer> => {
  const userId = actingUserId(params);
  const role = userId ? await getUserRoleInOrganization(organizationId, userId) : undefined;
  return userId && role ? { userId, role: role.name } : NO_PROJECT_VIEWER;
};

/**
 * Throws unless the acting user may open this use case: "not found" for one
 * outside the organization, "no access" for one they cannot see.
 */
export const assertCanReadUseCase = async (
  params: Record<string, unknown>,
  projectId: unknown,
  organizationId: number,
): Promise<void> => {
  const id = Number(projectId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Use case ${projectId} not found`);
  const viewer = await actingProjectViewer(params, organizationId);
  const access =
    viewer === NO_PROJECT_VIEWER
      ? "denied"
      : await getProjectReadAccessQuery(id, viewer, organizationId);
  if (access === "not_found") throw new Error(`Use case ${id} not found`);
  if (access === "denied") throw new Error(`You do not have access to use case ${id}`);
};
