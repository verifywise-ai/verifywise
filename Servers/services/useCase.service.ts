/**
 * Use case service — shared business logic for use case creation and update.
 *
 * Extracted from project.ctrl.ts so the HTTP controller and the MCP tools share
 * the same in-transaction steps (write, framework instantiation, change
 * history, approval request). Post-commit side effects — the Slack message, the
 * creation email, the owner and approver notifications — remain the caller's
 * responsibility, which is why the approval result is handed back rather than
 * acted on here.
 */

import { Transaction } from "sequelize";
import { ProjectModel } from "../domain.layer/models/project/project.model";
import { IProjectAttributes } from "../domain.layer/interfaces/i.project";
import { HighRiskRole } from "../domain.layer/enums/high-risk-role.enum";
import {
  createNewProjectQuery,
  getCurrentProjectMembers,
  updateProjectByIdQuery,
} from "../utils/project.utils";
import { resolveHighRiskRolesWrite } from "../utils/highRiskRoles.utils";
import { createEUFrameworkQuery } from "../utils/eu.utils";
import { createISOFrameworkQuery } from "../utils/iso42001.utils";
import { createISO27001FrameworkQuery } from "../utils/iso27001.utils";
import { createNISTAI_RMFFrameworkQuery } from "../utils/nistAiRmfCorrect.utils";
import {
  recordMultipleFieldChanges,
  recordUseCaseCreation,
  trackUseCaseChanges,
} from "../utils/useCaseChangeHistory.utils";
import { createUseCaseApprovalRequest } from "./projects/approvalRequest.service";
import { logStructured } from "../utils/logger/fileLogger";

export interface UseCaseServiceContext {
  userId: number;
  organizationId: number;
}

/**
 * The frameworks whose controls, clauses, annexes and assessments are built out
 * when a use case is created, keyed by framework id.
 *
 * This is the chain project.ctrl.ts ran before the service existed, written as
 * a lookup so the set has one name. The other bundled frameworks are still
 * recorded against the use case by `createNewProjectQuery`; they are tracked
 * through their own structures rather than these tables, which is why creation
 * does not build anything for them.
 */
export const CREATE_TIME_FRAMEWORK_BUILDERS: Record<
  number,
  {
    key: string;
    build: (
      projectId: number,
      enableAiDataInsertion: boolean,
      organizationId: number,
      transaction: Transaction,
    ) => Promise<object>;
  }
> = {
  1: { key: "eu", build: createEUFrameworkQuery },
  2: { key: "iso42001", build: createISOFrameworkQuery },
  3: { key: "iso27001", build: createISO27001FrameworkQuery },
  4: { key: "nist_ai_rmf", build: createNISTAI_RMFFrameworkQuery },
};

export type CreateUseCaseServiceInput = Partial<ProjectModel> & {
  members?: number[];
  framework?: number[];
  enable_ai_data_insertion?: boolean;
  /** Legacy single-role field; resolved against `high_risk_roles` then dropped. */
  type_of_high_risk_role?: HighRiskRole | null;
};

export interface CreateUseCaseServiceResult {
  useCase: ProjectModel;
  /** The framework rows instantiated for this use case, keyed by framework. */
  frameworks: { [key: string]: object };
  approvalResult: Awaited<ReturnType<typeof createUseCaseApprovalRequest>>;
}

/**
 * Create a use case. Runs inside the provided transaction.
 *
 * Steps:
 *  1. Resolve the high-risk role list from either role field, dropping the legacy one
 *  2. INSERT the use case (+ projects_members)
 *  3. Instantiate each chosen framework, unless an approval workflow defers it
 *  4. Record the creation in use case history
 *  5. Open an approval request when a workflow is attached
 */
export async function createUseCaseService(
  input: CreateUseCaseServiceInput,
  ctx: UseCaseServiceContext,
  transaction: Transaction,
): Promise<CreateUseCaseServiceResult> {
  const projectData = { ...input, framework: input.framework || [] };

  // 1. Either role field may be sent; store the resolved list only.
  const highRiskRoles = resolveHighRiskRolesWrite(projectData, []) ?? [];
  delete projectData.type_of_high_risk_role;
  const newProject = { ...projectData, high_risk_roles: highRiskRoles } as Partial<ProjectModel> & {
    members: number[] | undefined;
    framework: number[];
    enable_ai_data_insertion: boolean;
  };

  // 2. Insert.
  const createdProject = await createNewProjectQuery(
    newProject,
    newProject.members ?? [],
    newProject.framework || [],
    ctx.organizationId,
    ctx.userId,
    transaction,
  );

  // 3. Only create frameworks immediately if NO approval workflow is assigned.
  //    Otherwise they stay on the use case as pending_frameworks and are
  //    created once the request is approved.
  const frameworks: { [key: string]: object } = {};
  if (!createdProject.approval_workflow_id) {
    for (const framework of newProject.framework || []) {
      const builder = CREATE_TIME_FRAMEWORK_BUILDERS[framework];
      if (!builder) continue;
      frameworks[builder.key] = await builder.build(
        createdProject.id!,
        newProject.enable_ai_data_insertion,
        ctx.organizationId,
        transaction,
      );
    }
  }

  // 4. Change history.
  if (createdProject.id) {
    await recordUseCaseCreation(
      createdProject.id,
      ctx.userId,
      ctx.organizationId,
      {
        project_title: createdProject.project_title,
        owner: createdProject.owner,
        start_date: createdProject.start_date,
        geography: createdProject.geography,
        ai_risk_classification: createdProject.ai_risk_classification,
        // An empty list is no value, so creation records no roles line.
        high_risk_roles: createdProject.high_risk_roles?.length
          ? createdProject.high_risk_roles
          : undefined,
        goal: createdProject.goal,
        target_industry: createdProject.target_industry,
        description: createdProject.description,
        status: createdProject.status,
      },
      transaction,
    );
  }

  // Log strings kept verbatim from project.ctrl.ts so existing log searches
  // keep matching after the extraction.
  logStructured(
    "processing",
    `use case ${createdProject.id} created with approval_workflow_id=${createdProject.approval_workflow_id ?? "none"} (body sent ${input.approval_workflow_id ?? "none"})`,
    "createProject",
    "project.ctrl.ts",
  );

  // 5. An inactive or wrong-entity workflow throws ValidationException, which
  //    the caller maps to 400 after rolling back.
  const approvalResult = await createUseCaseApprovalRequest(
    createdProject,
    ctx.userId,
    ctx.organizationId,
    transaction,
  );

  return { useCase: createdProject, frameworks, approvalResult };
}

export type UpdateUseCaseServiceInput = Partial<ProjectModel> & {
  members?: number[] | null;
  /** Legacy single-role field; resolved against the stored list then dropped. */
  type_of_high_risk_role?: HighRiskRole | null;
};

export interface UpdateUseCaseServiceResult {
  useCase: (IProjectAttributes & { members: number[] }) | null;
  /** The member list as it stood before the update, for "who was just added". */
  currentMembers: number[];
}

/**
 * Update a use case. Runs inside the provided transaction.
 *
 * Steps:
 *  1. Resolve the high-risk role list against the stored one
 *  2. Read the current members, so the caller can tell who was added
 *  3. UPDATE the use case (+ projects_members when a list was sent)
 *  4. Diff the fields and the member list, and record both in use case history
 *
 * `input` is mutated the way the controller mutated its request body — the
 * members, id and legacy role fields are removed before the write, and the
 * caller still reads `approval_workflow_id` off it afterwards.
 *
 * Returns a null `useCase` when the row disappeared between the caller's
 * existence check and the locking read inside the update query.
 */
export async function updateUseCaseService(
  useCaseId: number,
  input: UpdateUseCaseServiceInput,
  existingUseCase: IProjectAttributes,
  ctx: UseCaseServiceContext,
  transaction: Transaction,
): Promise<UpdateUseCaseServiceResult> {
  // Only replace members when the request sends a list; a missing field leaves
  // them unchanged. null still clears them, as it did before.
  const rawMembers = input.members as number[] | null | undefined;
  const members = rawMembers === null ? [] : Array.isArray(rawMembers) ? rawMembers : undefined;

  delete input.members;
  delete input.id;

  // 1. Either role field may be sent. Resolve them against the stored list, so
  //    a client that writes back the derived single role cannot drop the other.
  const highRiskRoles = resolveHighRiskRolesWrite(input, existingUseCase.high_risk_roles);
  delete input.type_of_high_risk_role;
  if (highRiskRoles === undefined) delete input.high_risk_roles;
  else input.high_risk_roles = highRiskRoles;

  // 2. Members before the update, to identify the newly added ones.
  const currentMembers = await getCurrentProjectMembers(useCaseId, ctx.organizationId, transaction);

  // 3. Write.
  const useCase = await updateProjectByIdQuery(
    useCaseId,
    input,
    members,
    ctx.organizationId,
    transaction,
  );

  // 4. Change history.
  if (useCase) {
    // members is removed from input above, so compare it on its own. Sorted, so
    // the same members in another order are not recorded as a change.
    const byId = (a: number, b: number) => a - b;
    const memberChanges =
      members !== undefined
        ? await trackUseCaseChanges(
            { members: currentMembers.map(Number).sort(byId) } as any,
            { members: [...useCase.members].sort(byId) } as any,
          )
        : [];
    const changes = [...(await trackUseCaseChanges(existingUseCase, input)), ...memberChanges];
    if (changes.length > 0) {
      await recordMultipleFieldChanges(
        useCaseId,
        ctx.userId,
        ctx.organizationId,
        changes,
        transaction,
      );
    }
  }

  return { useCase, currentMembers: currentMembers.map(Number) };
}
