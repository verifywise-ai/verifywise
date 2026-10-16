/**
 * Who may touch a project's bias audit data.
 *
 * Every bias-audit endpoint that reads or writes a project's profile, runs or
 * stances applies this one rule, the same one canUserAccessFile applies to
 * project files: the organization's Admin, or the project's owner or a
 * member, all within the organization. SuperAdmin gets no bypass, being
 * cross-tenant administration and not an in-org Admin. Anyone else is
 * answered with the not-found a project in another organization gets, so its
 * existence is not disclosed.
 *
 * Enforced here, in the service layer, so a controller cannot forget it and
 * a service called from a second caller cannot skip it.
 */
import { NotFoundException } from "../../domain.layer/exceptions/custom.exception";
import { userCanAccessProjectQuery } from "../../utils/biasAudit.utils";

export interface Viewer {
  userId: number;
  role: string;
}

export async function assertProjectAccess(
  projectId: number,
  organizationId: number,
  viewer: Viewer,
): Promise<void> {
  if (viewer.role === "Admin") return;
  if (await userCanAccessProjectQuery(projectId, viewer.userId, organizationId)) return;
  throw new NotFoundException(`Project ${projectId} was not found`, "Project", projectId);
}
