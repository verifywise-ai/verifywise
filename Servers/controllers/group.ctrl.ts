import { Request, Response } from "express";

import { STATUS_CODE } from "../utils/statusCode.utils";
import { translateError } from "../utils/i18n.utils";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import {
  addGroupMembersQuery,
  createGroupQuery,
  deleteGroupByIdQuery,
  getGroupByIdOrThrowQuery,
  getGroupByIdQuery,
  listGroupMembersQuery,
  listGroupsQuery,
  listProjectGroupsQuery,
  removeGroupMemberQuery,
  setGroupMembersQuery,
  setProjectGroupsQuery,
  updateGroupByIdQuery,
} from "../utils/group.utils";
import { getProjectAccessQuery, getProjectReadAccessQuery } from "../utils/project.utils";

const FILE_NAME = "group.ctrl.ts";

const parseIntParam = (raw: unknown): number => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(value as string, 10);
};

// Map our CustomException subclasses to HTTP status, mirroring the
// customField.ctrl.ts pattern. Falls back to 500 for unknown errors.
const respondWithError = (req: Request, res: Response, error: unknown): Response => {
  const statusCode =
    error instanceof Error && "statusCode" in error
      ? (error as Error & { statusCode: number }).statusCode
      : 500;
  const statusFn = (STATUS_CODE as any)[statusCode];
  if (typeof statusFn === "function") {
    return res.status(statusCode).json(statusFn((error as Error).message));
  }
  return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
};

/**
 * The use case access rule for the project-group routes. useCase.edit alone
 * would let an Editor attach a group they belong to to any use case in the
 * organization and so reach it (the same reason updateProjectById checks
 * canViewProjectQuery). Reads use the read rule of requireProjectAccess.
 * Sends the 404/403 and returns false when the user may not proceed.
 */
const ensureProjectAccess = async (
  req: Request,
  res: Response,
  projectId: number,
  mode: "read" | "write",
): Promise<boolean> => {
  if (!Number.isInteger(projectId) || projectId <= 0) {
    res.status(400).json(STATUS_CODE[400](req.t!("project id must be a positive integer")));
    return false;
  }
  const viewer = { userId: req.userId!, role: req.role ?? "" };
  const access =
    mode === "write"
      ? await getProjectAccessQuery(projectId, viewer, req.organizationId!)
      : await getProjectReadAccessQuery(projectId, viewer, req.organizationId!);
  if (access === "not_found") {
    res.status(404).json(STATUS_CODE[404]({}));
    return false;
  }
  if (access === "denied") {
    res.status(403).json(STATUS_CODE[403](req.t ? req.t("Access denied") : "Access denied"));
    return false;
  }
  return true;
};

// ---------- Groups ----------

export async function listGroups(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting listGroups",
    functionName: "listGroups",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const groups = await listGroupsQuery(req.organizationId!);
    await logSuccess({
      eventType: "Read",
      description: `Retrieved ${groups.length} groups`,
      functionName: "listGroups",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](groups));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to list groups",
      functionName: "listGroups",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function getGroupById(req: Request, res: Response): Promise<any> {
  const id = parseIntParam(req.params.id);
  logProcessing({
    description: `starting getGroupById for ID ${id}`,
    functionName: "getGroupById",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const group = await getGroupByIdQuery(id, req.organizationId!);
    if (!group) {
      return res.status(404).json(STATUS_CODE[404]({}));
    }
    await logSuccess({
      eventType: "Read",
      description: `Retrieved group ${id}`,
      functionName: "getGroupById",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](group));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to get group ${id}`,
      functionName: "getGroupById",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function createGroup(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting createGroup",
    functionName: "createGroup",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const group = await createGroupQuery(
      { name: req.body?.name, description: req.body?.description },
      req.organizationId!,
      req.userId!,
    );
    await logSuccess({
      eventType: "Create",
      description: `Created group ${group.id} (${group.name})`,
      functionName: "createGroup",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(201).json(STATUS_CODE[201](group));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "Failed to create group",
      functionName: "createGroup",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function updateGroupById(req: Request, res: Response): Promise<any> {
  const id = parseIntParam(req.params.id);
  logProcessing({
    description: `starting updateGroupById for ID ${id}`,
    functionName: "updateGroupById",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const group = await updateGroupByIdQuery(id, req.organizationId!, {
      name: req.body?.name,
      description: req.body?.description,
    });
    await logSuccess({
      eventType: "Update",
      description: `Updated group ${id}`,
      functionName: "updateGroupById",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](group));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: `Failed to update group ${id}`,
      functionName: "updateGroupById",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function deleteGroupById(req: Request, res: Response): Promise<any> {
  const id = parseIntParam(req.params.id);
  logProcessing({
    description: `starting deleteGroupById for ID ${id}`,
    functionName: "deleteGroupById",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    await deleteGroupByIdQuery(id, req.organizationId!);
    await logSuccess({
      eventType: "Delete",
      description: `Deleted group ${id}`,
      functionName: "deleteGroupById",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(202).json(STATUS_CODE[202]({ ok: true }));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete group ${id}`,
      functionName: "deleteGroupById",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

// ---------- Membership ----------

export async function listGroupMembers(req: Request, res: Response): Promise<any> {
  const id = parseIntParam(req.params.id);
  logProcessing({
    description: `starting listGroupMembers for group ${id}`,
    functionName: "listGroupMembers",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const members = await listGroupMembersQuery(id, req.organizationId!);
    await logSuccess({
      eventType: "Read",
      description: `Retrieved ${members.length} members of group ${id}`,
      functionName: "listGroupMembers",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](members));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to list members of group ${id}`,
      functionName: "listGroupMembers",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function addGroupMembers(req: Request, res: Response): Promise<any> {
  const id = parseIntParam(req.params.id);
  logProcessing({
    description: `starting addGroupMembers for group ${id}`,
    functionName: "addGroupMembers",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    await getGroupByIdOrThrowQuery(id, req.organizationId!);
    const result = await addGroupMembersQuery(id, req.organizationId!, req.body?.userIds);
    await logSuccess({
      eventType: "Update",
      description: `Added ${result.added} members to group ${id}`,
      functionName: "addGroupMembers",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: `Failed to add members to group ${id}`,
      functionName: "addGroupMembers",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function setGroupMembers(req: Request, res: Response): Promise<any> {
  const id = parseIntParam(req.params.id);
  logProcessing({
    description: `starting setGroupMembers for group ${id}`,
    functionName: "setGroupMembers",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    await setGroupMembersQuery(id, req.organizationId!, req.body?.userIds);
    await logSuccess({
      eventType: "Update",
      description: `Replaced membership of group ${id}`,
      functionName: "setGroupMembers",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({ ok: true }));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: `Failed to replace membership of group ${id}`,
      functionName: "setGroupMembers",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function removeGroupMember(req: Request, res: Response): Promise<any> {
  const id = parseIntParam(req.params.id);
  const userId = parseIntParam(req.params.userId);
  logProcessing({
    description: `starting removeGroupMember for group ${id}, user ${userId}`,
    functionName: "removeGroupMember",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    await removeGroupMemberQuery(id, req.organizationId!, userId);
    await logSuccess({
      eventType: "Delete",
      description: `Removed user ${userId} from group ${id}`,
      functionName: "removeGroupMember",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(202).json(STATUS_CODE[202]({ ok: true }));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: `Failed to remove user ${userId} from group ${id}`,
      functionName: "removeGroupMember",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

// ---------- Project <-> Group ----------

export async function listProjectGroups(req: Request, res: Response): Promise<any> {
  const projectId = parseIntParam(req.params.projectId);
  logProcessing({
    description: `starting listProjectGroups for use case ${projectId}`,
    functionName: "listProjectGroups",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    if (!(await ensureProjectAccess(req, res, projectId, "read"))) return;
    const groups = await listProjectGroupsQuery(projectId, req.organizationId!);
    await logSuccess({
      eventType: "Read",
      description: `Retrieved ${groups.length} groups of use case ${projectId}`,
      functionName: "listProjectGroups",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](groups));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to list groups of use case ${projectId}`,
      functionName: "listProjectGroups",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function setProjectGroups(req: Request, res: Response): Promise<any> {
  const projectId = parseIntParam(req.params.projectId);
  logProcessing({
    description: `starting setProjectGroups for use case ${projectId}`,
    functionName: "setProjectGroups",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    if (!(await ensureProjectAccess(req, res, projectId, "write"))) {
      await logFailure({
        eventType: "Update",
        description: `Group set of use case ${projectId} refused, no access`,
        functionName: "setProjectGroups",
        fileName: FILE_NAME,
        error: new Error("Access denied"),
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return;
    }
    await setProjectGroupsQuery(projectId, req.organizationId!, req.body?.groupIds);
    await logSuccess({
      eventType: "Update",
      description: `Replaced group set of use case ${projectId}`,
      functionName: "setProjectGroups",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({ ok: true }));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: `Failed to replace group set of use case ${projectId}`,
      functionName: "setProjectGroups",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}
