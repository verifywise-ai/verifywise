/**
 * File access-control checks shared across the fileManager controller.
 *
 * Files in the unified `files` table can be either:
 *  - Organization-level (project_id IS NULL) — authorized by org_id match
 *  - Project-level — authorized by project membership, project ownership,
 *    or file ownership
 *
 * `assertFileAccess` returns either { allowed: true } or a tagged failure that
 * the caller maps to a 403 response.
 */

import { getUserProjects } from "../../utils/user.utils";
import { getProjectByIdQuery } from "../../utils/project.utils";

export interface AccessCheckFile {
  org_id?: number | string | null;
  project_id?: number | null;
  uploaded_by?: number | string | null;
}

export type AccessDecision = { allowed: true } | { allowed: false; reason: "access_denied" };

/**
 * Determine whether a user may access a given file. Pure authorization
 * decision — caller is responsible for mapping `access_denied` to a 403.
 */
export async function assertFileAccess(
  file: AccessCheckFile,
  userId: number,
  orgId: number,
): Promise<AccessDecision> {
  const isOrganizationFile = file.project_id == null;

  if (isOrganizationFile) {
    return Number(file.org_id) === orgId
      ? { allowed: true }
      : { allowed: false, reason: "access_denied" };
  }

  const userProjects = await getUserProjects(userId, orgId);
  const userProjectIds = userProjects.map((p) => p.id);

  const projectId = file.project_id!;
  const project = await getProjectByIdQuery(projectId, orgId);

  const isProjectMember = userProjectIds.includes(projectId);
  const isProjectOwner = project ? Number(project.owner) === userId : false;
  const isFileOwner = Number(file.uploaded_by) === userId;

  return isProjectMember || isProjectOwner || isFileOwner
    ? { allowed: true }
    : { allowed: false, reason: "access_denied" };
}
