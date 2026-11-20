/**
 * Who an advisor tool runs for, and which use cases that user may read.
 *
 * The listing tools scope by actingProjectViewer, so the advisor sees what the
 * user's use case list shows (projectVisibilitySql, the rule of
 * GET /api/projects). Every tool call that names a use case, or a row of one,
 * is checked once by the tool bridge with useCaseRefusalForTool.
 */
import type { Request } from "express";
import {
  getProjectAccessQuery,
  getProjectReadAccessQuery,
  type ProjectAccess,
} from "../../utils/project.utils";
import { getUserRoleInOrganization } from "../../utils/userPermission.utils";
import type { UseCaseOfChild } from "../../middleware/projectAccess.middleware";
import {
  useCaseOfEuAnswer,
  useCaseOfEuControl,
  useCaseOfIso27001AnnexControl,
  useCaseOfIso27001Subclause,
  useCaseOfIso42001AnnexCategory,
  useCaseOfIso42001Subclause,
  useCaseOfNistSubcategory,
} from "../../utils/useCaseOfChild.utils";
import {
  isStakeholderOfPmmConfig,
  isStakeholderOfPmmCycle,
  useCaseOfPmmConfig,
  useCaseOfPmmCycle,
} from "../../utils/pmmUseCaseAccess.utils";

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

/** Tool parameters that name a use case directly. */
const USE_CASE_PARAMS = ["project_id", "projectId", "use_case_id"] as const;

interface ChildParam {
  param: string;
  resolve: UseCaseOfChild;
  /** Lets the caller through when the use case rule refuses (as the REST orAllow). */
  orAllow?: (id: number, organizationId: number, req: Request) => Promise<boolean>;
}

const cycleOrStakeholder: ChildParam = {
  param: "cycle_id",
  resolve: useCaseOfPmmCycle,
  orAllow: isStakeholderOfPmmCycle,
};
const configId: ChildParam = { param: "config_id", resolve: useCaseOfPmmConfig };

/**
 * Tool parameters that name a row of a use case, per tool: the row's use case
 * is checked as if the tool named it, with the rules of the matching REST
 * route (a monitoring cycle's stakeholder may open and answer it).
 */
const CHILD_PARAMS: Record<string, ChildParam[]> = {
  agent_save_eu_ai_act_control: [{ param: "control_id", resolve: useCaseOfEuControl }],
  agent_save_eu_ai_act_assessment_answer: [{ param: "question_id", resolve: useCaseOfEuAnswer }],
  agent_save_iso42001_clauses: [{ param: "clause_id", resolve: useCaseOfIso42001Subclause }],
  agent_save_iso42001_annexes: [{ param: "annex_id", resolve: useCaseOfIso42001AnnexCategory }],
  agent_save_iso27001_clauses: [{ param: "clause_id", resolve: useCaseOfIso27001Subclause }],
  agent_save_iso27001_annexes: [{ param: "annex_id", resolve: useCaseOfIso27001AnnexControl }],
  get_nist_subcategory_detail: [{ param: "subcategory_id", resolve: useCaseOfNistSubcategory }],
  agent_update_nist_subcategory: [{ param: "subcategory_id", resolve: useCaseOfNistSubcategory }],
  get_pmm_cycle_detail: [cycleOrStakeholder],
  get_pmm_cycle_responses: [cycleOrStakeholder],
  get_pmm_questions: [{ ...configId, orAllow: isStakeholderOfPmmConfig }],
  agent_update_pmm_config: [configId],
  agent_add_pmm_question: [configId],
  agent_start_pmm_cycle: [configId],
  agent_submit_pmm_responses: [cycleOrStakeholder],
  agent_flag_pmm_concern: [cycleOrStakeholder],
};

const noAccess = (projectId: number) => `You do not have access to use case ${projectId}`;

/**
 * Decision 7 for one advisor tool call, checked once by the tool bridge:
 * every use case the call names, directly (project_id, projectId,
 * use_case_id) or through a row of one (CHILD_PARAMS), must pass the read
 * rule for a read tool or the write rule for a write tool (the rules of
 * GET and PATCH /api/projects/:id) for the acting user. A row of another use
 * case than the one named is refused. Returns the refusal to give the model
 * instead of calling the tool, or null when the call may run.
 */
export const useCaseRefusalForTool = async (
  toolName: string,
  params: Record<string, unknown>,
  organizationId: number,
  isWrite: boolean,
): Promise<string | null> => {
  const named = USE_CASE_PARAMS.filter((k) => params[k] !== undefined);
  const children = (CHILD_PARAMS[toolName] ?? []).filter((c) => params[c.param] !== undefined);
  if (named.length === 0 && children.length === 0) return null;

  const viewer = await actingProjectViewer(params, organizationId);
  const accessQuery = isWrite ? getProjectAccessQuery : getProjectReadAccessQuery;
  const accessTo = (projectId: number): Promise<ProjectAccess> =>
    viewer === NO_PROJECT_VIEWER
      ? Promise.resolve("denied")
      : accessQuery(projectId, viewer, organizationId);

  const namedIds: number[] = [];
  for (const key of named) {
    const id = Number(params[key]);
    if (!Number.isSafeInteger(id) || id <= 0) return `Use case ${params[key]} not found`;
    const access = await accessTo(id);
    if (access === "not_found") return `Use case ${id} not found`;
    if (access === "denied") return noAccess(id);
    namedIds.push(id);
  }

  for (const c of children) {
    const rowId = Number(params[c.param]);
    if (!Number.isSafeInteger(rowId) || rowId <= 0)
      return `${c.param} ${params[c.param]} not found`;
    const projectId = await c.resolve(rowId, organizationId, {} as Request);
    if (projectId === null) return `${c.param} ${rowId} not found`;
    const mismatch = namedIds.find((id) => id !== projectId);
    if (mismatch !== undefined) return noAccess(mismatch);
    const access = await accessTo(projectId);
    if (access === "not_found") return `${c.param} ${rowId} not found`;
    if (
      access === "denied" &&
      !(
        c.orAllow &&
        viewer !== NO_PROJECT_VIEWER &&
        (await c.orAllow(rowId, organizationId, { userId: viewer.userId } as Request))
      )
    ) {
      return noAccess(projectId);
    }
  }
  return null;
};
