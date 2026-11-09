import { NextFunction, Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logFailure } from "../utils/logger/logHelper";
import { getProjectAccessQuery, getProjectReadAccessQuery } from "../utils/project.utils";
import { toId } from "../utils/validations/validation.utils";

const FILE = "projectAccess.middleware.ts";
const FUNCTION_NAME = "requireProjectAccess";

const eventTypeFor = (method: string): "Read" | "Delete" | "Update" => {
  if (method === "GET") return "Read";
  if (method === "DELETE") return "Delete";
  return "Update";
};

/**
 * Lets a request through only when the caller can see the use case named by
 * the route: an Admin, its owner or a member, the rule that scopes the use case
 * list. A GET also lets through the assignees of a task linked to the use case
 * and the approvers of its workflow. A permission such as useCase.edit alone says nothing about which use case.
 * Use after authenticateJWT and any param validation.
 *
 * A use case that does not exist, or is in another organization, is passed on
 * so the controller answers its usual 404. An error in the check is a 500:
 * never treated as allowed.
 *
 * @param paramName name of the field holding the use case id
 * @param source where the handler reads that field. It must be the same place:
 * a repeated query field is refused rather than resolved, so the id checked
 * here is the id the handler acts on.
 */
export const requireProjectAccess =
  (paramName: string = "id", source: "params" | "query" = "params") =>
  async (req: Request, res: Response, next: NextFunction) => {
    const { userId, role, organizationId } = req;
    if (!userId || !role) {
      return res.status(401).json(STATUS_CODE[401](req.t!("Unauthorized")));
    }

    const eventType = eventTypeFor(req.method);
    const projectId = toId(req[source][paramName]);
    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid project ID")));
    }

    try {
      const accessQuery = req.method === "GET" ? getProjectReadAccessQuery : getProjectAccessQuery;
      // No organization means nothing to scope the check to (a pure SuperAdmin).
      const access = organizationId
        ? await accessQuery(projectId, { userId, role }, organizationId)
        : "denied";

      if (access === "denied") {
        await logFailure({
          eventType,
          description: `${req.method} refused, no access to project ID ${projectId}`,
          functionName: FUNCTION_NAME,
          fileName: FILE,
          error: new Error("Access denied"),
          userId,
          organizationId,
        });
        return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
      }

      return next();
    } catch (error) {
      await logFailure({
        eventType,
        description: `Project access check failed for project ID ${projectId}`,
        functionName: FUNCTION_NAME,
        fileName: FILE,
        error: error as Error,
        userId,
        organizationId,
      });
      return res.status(500).json(STATUS_CODE[500](req.t!("Internal server error")));
    }
  };
