import { NextFunction, Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logFailure } from "../utils/logger/logHelper";
import {
  getProjectAccessQuery,
  getProjectReadAccessQuery,
  type ProjectAccess,
} from "../utils/project.utils";
import { seesAllProjects } from "../utils/projectVisibility.utils";
import { toId } from "../utils/validations/validation.utils";

const FILE = "projectAccess.middleware.ts";

type IdSource = "params" | "query";
type AccessRule = "method" | "write";

/**
 * The use case a child id belongs to, looked up in the caller's organization
 * only; null when there is no such child there. Receives the request for
 * resolvers that need another route field (the framework of an impl row).
 */
export type UseCaseOfChild = (
  childId: number,
  organizationId: number,
  req: Request,
) => Promise<number | null>;

export interface UseCaseAccessOptions {
  /** Name of the field holding the id. Default "id". */
  param?: string;
  /**
   * Where the handler reads that field. It must be the same place: a repeated
   * query field is refused rather than resolved, so the id checked here is the
   * id the handler acts on. Default "params".
   */
  source?: IdSource;
  /**
   * "write" applies the write rule to a GET as well, for a read that only
   * someone who could change the use case may make. The default picks the
   * rule from the method.
   */
  access?: AccessRule;
  /** Let a request without the field through unchecked (the handler then does not scope by it). */
  optional?: boolean;
  /**
   * A child or use case that is not in the caller's organization: "pass" lets
   * the handler answer its usual 404. "refuseWrites" (the default for child
   * routes) does that for a GET and answers 404 itself for any other method,
   * since several legacy write handlers never check that the row exists and
   * would write against another organization's id. "seesAll" lets through
   * only a role that sees every use case and refuses anyone else with 403,
   * for rows that outlive their use case (its change history).
   */
  missing?: "pass" | "refuseWrites" | "seesAll";
}

const eventTypeFor = (method: string): "Read" | "Delete" | "Update" => {
  if (method === "GET") return "Read";
  if (method === "DELETE") return "Delete";
  return "Update";
};

const sameUseCase: UseCaseOfChild = async (id) => id;

const buildGuard = (
  resolveUseCase: UseCaseOfChild,
  options: Required<Pick<UseCaseAccessOptions, "missing">> & UseCaseAccessOptions,
  functionName: string,
  invalidIdMessage: string,
) => {
  const { param = "id", source = "params", access = "method", optional = false, missing } = options;
  const label = resolveUseCase === sameUseCase ? "project ID" : `the use case of ${param}`;

  return async (req: Request, res: Response, next: NextFunction) => {
    const { userId, role, organizationId } = req;
    if (!userId || !role) {
      return res.status(401).json(STATUS_CODE[401](req.t!("Unauthorized")));
    }

    const raw = req[source]?.[param];
    if (optional && raw === undefined) return next();

    const eventType = eventTypeFor(req.method);
    const id = toId(raw);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json(STATUS_CODE[400](req.t!(invalidIdMessage)));
    }

    const refuse = async (reason: string) => {
      await logFailure({
        eventType,
        description: `${req.method} refused, ${reason} ${label} ${id}`,
        functionName,
        fileName: FILE,
        error: new Error("Access denied"),
        userId,
        organizationId,
      });
      return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
    };

    try {
      // No organization means nothing to scope the check to (a pure SuperAdmin).
      if (!organizationId) return await refuse("no access to");

      const accessQuery =
        req.method === "GET" && access === "method"
          ? getProjectReadAccessQuery
          : getProjectAccessQuery;
      const projectId = await resolveUseCase(id, organizationId, req);
      const result: ProjectAccess =
        projectId === null
          ? "not_found"
          : await accessQuery(projectId, { userId, role }, organizationId);

      if (result === "denied") return await refuse("no access to");
      // The use case checked, for handlers that need its id: they use this,
      // never a project_id from the body.
      if (result === "allowed") res.locals.useCaseId = projectId;
      if (result === "not_found") {
        if (missing === "seesAll" && !seesAllProjects(role)) return await refuse("no use case for");
        if (missing === "refuseWrites" && req.method !== "GET") {
          return res.status(404).json(STATUS_CODE[404](req.t!("Record not found")));
        }
      }
      return next();
    } catch (error) {
      await logFailure({
        eventType,
        description: `Use case access check failed for ${label} ${id}`,
        functionName,
        fileName: FILE,
        error: error as Error,
        userId,
        organizationId,
      });
      return res.status(500).json(STATUS_CODE[500](req.t!("Internal server error")));
    }
  };
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
 * @param access "write" applies the write rule to a GET as well, for a read
 * that only someone who could change the use case may make (what deleting it
 * would do, for example). The default picks the rule from the method.
 * @param missing see UseCaseAccessOptions.missing
 */
export const requireProjectAccess = (
  paramName: string = "id",
  source: IdSource = "params",
  access: AccessRule = "method",
  missing: "pass" | "seesAll" = "pass",
) =>
  buildGuard(
    sameUseCase,
    { param: paramName, source, access, missing },
    "requireProjectAccess",
    "Invalid project ID",
  );

/**
 * requireProjectAccess for a route keyed by something that belongs to a use
 * case (a projects_frameworks row, a framework requirement row, a FRIA)
 * rather than by the use case id. `resolveUseCase` finds the use case in the
 * caller's organization (see utils/useCaseOfChild.utils.ts); the same rule,
 * statuses and logging then apply: 403 without access, 400 for a malformed
 * id, 500 when the check fails. A child that is not in the organization is
 * passed on for a GET and answered 404 for a write (see `missing`).
 */
export const requireUseCaseAccessVia = (
  resolveUseCase: UseCaseOfChild,
  options: UseCaseAccessOptions = {},
) =>
  buildGuard(
    resolveUseCase,
    { ...options, missing: options.missing ?? "refuseWrites" },
    "requireUseCaseAccessVia",
    "Invalid ID",
  );

/**
 * The use case the guard on this route checked and allowed, or undefined
 * when no guard ran or the row was not found (the handler then answers 404).
 */
export const checkedUseCaseId = (res: Response): number | undefined => {
  const id = res.locals?.useCaseId;
  return typeof id === "number" ? id : undefined;
};
