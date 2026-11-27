import { Request, Response } from "express";

import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  calculateProjectRisks,
  calculateVendirRisks,
  canViewProjectQuery,
  countAnswersByProjectId,
  countSubControlsByProjectId,
  getAllProjectsQuery,
  getProjectAccessQuery,
  getProjectByIdQuery,
  getUseCaseApprovalSnapshotQuery,
  getUseCaseApprovalWorkflowQuery,
  getEuAiActWorkQuery,
  lockUseCaseWorkflowQuery,
  updateProjectByIdQuery,
} from "../utils/project.utils";
import { getUserByIdQuery } from "../utils/user.utils";
import { getControlCategoryByProjectIdQuery } from "../utils/controlCategory.utils";
import { ProjectModel } from "../domain.layer/models/project/project.model";
import { getAllControlsByControlGroupQuery } from "../utils/control.utils";
import { getAllSubcontrolsByControlIdQuery } from "../utils/subControl.utils";
import { sequelize } from "../database/db";
import { IProjectAttributes } from "../domain.layer/interfaces/i.project";
import { IControl } from "../domain.layer/interfaces/i.control";
import { IControlCategory } from "../domain.layer/interfaces/i.controlCategory";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import {
  ForbiddenException,
  ValidationException,
  BusinessLogicException,
} from "../domain.layer/exceptions/custom.exception";
import { recordMultipleFieldChanges } from "../utils/useCaseChangeHistory.utils";
import { recordEntityChange } from "../utils/changeHistory.base.utils";
import {
  hasPendingApprovalQuery,
  getApprovalStatusQuery,
  getPendingApprovalRequestIdQuery,
  withdrawApprovalRequestQuery,
  createPendingFrameworksForApprovedUseCase,
} from "../utils/approvalRequest.utils";
import { deleteProjectWithSideEffects } from "../utils/projectDeletion.utils";
import { getRisksLinkedOnlyToProjectQuery } from "../utils/risk.utils";
import {
  createUseCaseApprovalRequest,
  getUsableUseCaseWorkflow,
  type UsableUseCaseWorkflow,
} from "../services/projects/approvalRequest.service";
import { roleHasPermission } from "../utils/rolePermissions.utils";
import { createUseCaseService, updateUseCaseService } from "../services/useCase.service";
import {
  notifyUseCaseApprovalOutcome,
  notifyUseCaseCreated,
  notifyUseCaseUpdated,
} from "../services/useCaseNotifications.service";
import { stripExternalOwnerFields } from "../utils/externalOwner.utils";

import { translateError } from "../utils/i18n.utils";

const CREATE_LOG = { functionName: "createProject", fileName: "project.ctrl.ts" };
const UPDATE_LOG = { functionName: "updateProjectById", fileName: "project.ctrl.ts" };

/**
 * A ValidationException as a 400 body. On /api/v1/projects one that names a
 * field is answered in the shape the request validators already use
 * ({ errors: [{ field, message, location }] }), so the use case form shows it
 * on that field. The legacy /api/projects contract is frozen, so there, and
 * for an exception without a field, the body stays the plain message.
 */
function validationErrorBody(req: Request, res: Response, error: ValidationException) {
  const message = translateError(req, error);
  const field = error.metadata?.field;
  const isV1 = res.locals?.acceptsExternalOwner === true;
  return isV1 && typeof field === "string"
    ? STATUS_CODE[400]({ errors: [{ field, message, location: "body" }] })
    : STATUS_CODE[400](message);
}

/**
 * The approval_workflow_id a PATCH body sets, or undefined when the body does
 * not carry the field. The validator has already checked it is a positive
 * integer or empty; empty values (null, 0, "") clear the workflow, and a
 * numeric string becomes a number, so "5" never reads as a change from 5.
 */
export function submittedWorkflowId(body: unknown): number | null | undefined {
  if (!body || typeof body !== "object") return undefined;
  if (!Object.prototype.hasOwnProperty.call(body, "approval_workflow_id")) return undefined;
  const raw = (body as { approval_workflow_id?: unknown }).approval_workflow_id;
  if (raw === null || raw === undefined || raw === "" || raw === 0 || raw === false) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function getAllProjects(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getAllProjects",
    functionName: "getAllProjects",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const { userId, role } = req;
    if (!userId || !role) {
      return res.status(401).json(STATUS_CODE[401](req.t!("Unauthorized")));
    }

    const projects = (await getAllProjectsQuery(
      { userId, role },
      req.organizationId!,
    )) as IProjectAttributes[];

    // Add approval status fields to each project

    await Promise.all(
      projects.map(async (project) => {
        if (project.id) {
          // Check if project has a pending approval request
          const hasPendingApproval = await hasPendingApprovalQuery(
            project.id,
            "use_case",
            req.organizationId!,
          );

          // Get the approval status (pending, rejected, or null)
          const approvalStatus = await getApprovalStatusQuery(
            project.id,
            "use_case",
            req.organizationId!,
          );

          // Add approval status to project response
          ((project as any).dataValues as any).has_pending_approval = hasPendingApproval;
          ((project as any).dataValues as any).approval_status = approvalStatus;
        }
      }),
    );

    await logSuccess({
      eventType: "Read",
      description: "Retrieved all projects",
      functionName: "getAllProjects",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](projects));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve all projects",
      functionName: "getAllProjects",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getProjectById(req: Request, res: Response): Promise<any> {
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  logProcessing({
    description: `starting getProjectById for ID ${projectId}`,
    functionName: "getProjectById",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const project = await getProjectByIdQuery(projectId, req.organizationId!);

    if (project) {
      // Check if project has a pending approval request
      const hasPendingApproval = await hasPendingApprovalQuery(
        projectId,
        "use_case",
        req.organizationId!,
      );

      // Get the approval status (pending, rejected, or null)
      const approvalStatus = await getApprovalStatusQuery(
        projectId,
        "use_case",
        req.organizationId!,
      );

      // Add approval status to project response
      // Must add to dataValues for Sequelize model serialization
      ((project as any).dataValues as any).has_pending_approval = hasPendingApproval;
      ((project as any).dataValues as any).approval_status = approvalStatus;

      await logSuccess({
        eventType: "Read",
        description: `Retrieved project ID ${projectId}`,
        functionName: "getProjectById",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });

      return res.status(200).json(STATUS_CODE[200](project));
    }

    await logSuccess({
      eventType: "Read",
      description: `Project not found: ID ${projectId}`,
      functionName: "getProjectById",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(404).json(STATUS_CODE[404](project));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve project by ID",
      functionName: "getProjectById",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function createProject(req: Request, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();
  const projectData = {
    ...req.body,
    framework: req.body.framework || [],
  };

  logProcessing({
    description: "starting createProject",
    functionName: "createProject",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    // Only /api/v1/projects accepts external owners; the legacy body is frozen.
    const acceptsExternalOwner = res.locals?.acceptsExternalOwner === true;
    if (!acceptsExternalOwner) stripExternalOwnerFields(projectData);

    const {
      useCase: createdProject,
      frameworks,
      approvalResult,
    } = await createUseCaseService(
      projectData,
      {
        userId: req.userId!,
        organizationId: req.organizationId!,
        actorRole: req.role,
        requireOwner: acceptsExternalOwner,
      },
      transaction,
    );

    if (createdProject) {
      await transaction.commit();

      await logSuccess({
        eventType: "Create",
        description: "Created new project",
        functionName: "createProject",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });

      // The approval notice, the creation email, Slack and the owner's
      // assignment notice; best effort, after commit.
      await notifyUseCaseCreated(
        createdProject,
        approvalResult,
        req.userId!,
        req.organizationId!,
        CREATE_LOG,
      );

      return res.status(201).json(
        STATUS_CODE[201]({
          project: createdProject,
          frameworks,
        }),
      );
    }

    await logSuccess({
      eventType: "Create",
      description: "Project creation returned null",
      functionName: "createProject",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(503).json(STATUS_CODE[503]({}));
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      await logFailure({
        eventType: "Create",
        description: `Validation failed: ${error.message}`,
        functionName: "createProject",
        fileName: "project.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(400).json(validationErrorBody(req, res, error));
    }

    if (error instanceof BusinessLogicException) {
      await logFailure({
        eventType: "Create",
        description: `Business logic error: ${error.message}`,
        functionName: "createProject",
        fileName: "project.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](translateError(req, error)));
    }

    await logFailure({
      eventType: "Create",
      description: "Failed to create project",
      functionName: "createProject",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function updateProjectById(req: Request, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updateData = req.body;

  logProcessing({
    description: `starting updateProjectById for ID ${projectId}`,
    functionName: "updateProjectById",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const { userId, role } = req;
    if (!userId || !role) {
      await logFailure({
        eventType: "Update",
        description: "Unauthorized access attempt to update project",
        functionName: "updateProjectById",
        fileName: "project.ctrl.ts",
        error: new Error("Unauthorized"),
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      await transaction.rollback();
      return res.status(401).json(STATUS_CODE[401](req.t!("Unauthorized")));
    }

    // Find existing project
    const existingProject = await getProjectByIdQuery(projectId, req.organizationId!);

    if (!existingProject) {
      await transaction.rollback();
      await logSuccess({
        eventType: "Update",
        description: `Project not found for update: ID ${projectId}`,
        functionName: "updateProjectById",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    // The useCase.edit permission alone would let an Editor change any use case
    // in the organization, including adding themselves as a member.
    if (
      !(await canViewProjectQuery(projectId, { userId, role }, req.organizationId!, transaction))
    ) {
      await transaction.rollback();
      await logFailure({
        eventType: "Update",
        description: `Update refused, no access to project ID ${projectId}`,
        functionName: "updateProjectById",
        fileName: "project.ctrl.ts",
        error: new Error("Access denied"),
        userId,
        organizationId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
    }

    const updatedProject: Partial<ProjectModel> & { members?: number[] } = updateData;

    // Only /api/v1/projects accepts external owners; the legacy body is frozen.
    const acceptsExternalOwner = res.locals?.acceptsExternalOwner === true;
    if (!acceptsExternalOwner) stripExternalOwnerFields(updatedProject);

    // Only a body that carries the field changes the workflow. The update
    // query leaves an omitted column as it is, so reading "absent" as
    // "cleared" withdrew the request while the workflow stayed attached.
    const nextWorkflowId = submittedWorkflowId(updateData);
    let previousWorkflowId: number | null = null;
    if (nextWorkflowId !== undefined) {
      (updatedProject as { approval_workflow_id?: number | null }).approval_workflow_id =
        nextWorkflowId;
      // The stored workflow is read under a row lock in this transaction, not
      // from the unlocked read above: two saves attaching a workflow at once
      // each saw none and each opened a pending request. The second now waits
      // and sees the first one's workflow.
      const locked = await lockUseCaseWorkflowQuery(projectId, req.organizationId!, transaction);
      if (!locked) {
        await transaction.rollback();
        return res.status(404).json(STATUS_CODE[404]({}));
      }
      previousWorkflowId = locked.approval_workflow_id;
    }
    const workflowChanged = nextWorkflowId !== undefined && nextWorkflowId !== previousWorkflowId;

    // Pending or rejected: the latest decision on this use case (audit U-H2).
    let approvalStatus: Awaited<ReturnType<typeof getApprovalStatusQuery>> = null;
    let usableWorkflow: UsableUseCaseWorkflow | null = null;
    if (workflowChanged) {
      approvalStatus = await getApprovalStatusQuery(
        projectId,
        "use_case",
        req.organizationId!,
        transaction,
      );
      // Clearing the workflow under review withdrew the request and attached
      // the frameworks it held back, and replacing it let the editor pick a
      // workflow they approve themselves. While a request is pending or
      // rejected only an approval workflow admin may change it; the requester
      // withdraws through the approval request route instead.
      if (
        approvalStatus &&
        !(await roleHasPermission(req.organizationId ?? null, role, "approvalWorkflow.admin"))
      ) {
        await transaction.rollback();
        await logFailure({
          eventType: "Update",
          description: `Workflow change refused on use case ${projectId}: approval ${approvalStatus}`,
          functionName: "updateProjectById",
          fileName: "project.ctrl.ts",
          error: new Error("Access denied"),
          userId,
          organizationId: req.organizationId!,
        });
        return res
          .status(403)
          .json(
            STATUS_CODE[403](
              req.t!(
                "Only an approval workflow admin can change the workflow while its approval is pending or rejected",
              ),
            ),
          );
      }
      // Refused before the write: a missing id fails the foreign key (500),
      // and another organization's would be saved with no review.
      if (nextWorkflowId !== null) {
        usableWorkflow = await getUsableUseCaseWorkflow(
          nextWorkflowId,
          req.organizationId!,
          transaction,
        );
      }
    }

    const { useCase: project, currentMembers } = await updateUseCaseService(
      projectId,
      updatedProject,
      existingProject,
      {
        userId,
        organizationId: req.organizationId!,
        actorRole: role,
        requireOwner: acceptsExternalOwner,
      },
      transaction,
    );

    if (project) {
      // #4904: a workflow attached on edit (not set before) starts an approval
      // request, exactly as create does. An inactive or wrong-entity workflow
      // throws ValidationException, which rolls back and maps to 400.
      let updateApprovalResult: Awaited<ReturnType<typeof createUseCaseApprovalRequest>> = null;
      if (workflowChanged) {
        // Replacing or clearing the workflow makes any pending request under
        // the old workflow obsolete (review: A→B left A pending). Withdraw it
        // in the same transaction so a use case never has two pending
        // requests; approved/rejected history is untouched.
        const staleRequestId = previousWorkflowId
          ? await getPendingApprovalRequestIdQuery(
              projectId,
              "use_case",
              req.organizationId!,
              transaction,
            )
          : null;
        if (staleRequestId) {
          await withdrawApprovalRequestQuery(staleRequestId, req.organizationId!, transaction, {
            changedBy: req.userId!,
          });
        }
        if (nextWorkflowId === null) {
          // Cleared: the frameworks chosen at creation waited for an approval
          // that no longer exists, so create them now rather than never. Not
          // for a rejected use case: a rejection never attaches them, and they
          // stay parked until a new review approves it. Read after the
          // withdrawal: a re-review withdrawn here leaves the rejection
          // before it as the latest decision.
          const statusAfter = staleRequestId
            ? await getApprovalStatusQuery(projectId, "use_case", req.organizationId!, transaction)
            : approvalStatus;
          if (statusAfter !== "rejected") {
            await createPendingFrameworksForApprovedUseCase(
              projectId,
              req.organizationId!,
              transaction,
              req.userId!,
            );
          }
        } else {
          updateApprovalResult = await createUseCaseApprovalRequest(
            project as unknown as ProjectModel,
            req.userId!,
            req.organizationId!,
            transaction,
            usableWorkflow,
          );
        }
      }

      await transaction.commit();

      // Same approval notice as on create (#4904, #4905).
      notifyUseCaseApprovalOutcome(
        project as unknown as ProjectModel,
        updateApprovalResult,
        req.userId!,
        req.organizationId!,
        "Update",
        UPDATE_LOG,
      );

      await logSuccess({
        eventType: "Update",
        description: `Updated project ID ${projectId}`,
        functionName: "updateProjectById",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });

      // A new owner's assignment notice and the email to each added member.
      await notifyUseCaseUpdated(
        existingProject,
        project,
        currentMembers,
        userId,
        req.organizationId!,
        UPDATE_LOG,
      );

      return res.status(202).json(STATUS_CODE[202](project));
    }

    // The row disappeared between the existence check and the update: undo any
    // member changes made inside the transaction and release its connection.
    await transaction.rollback();
    await logSuccess({
      eventType: "Update",
      description: `Project not found for update: ID ${projectId}`,
      functionName: "updateProjectById",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ForbiddenException) {
      await logFailure({
        eventType: "Update",
        description: `Forbidden: ${error.message}`,
        functionName: "updateProjectById",
        fileName: "project.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](translateError(req, error)));
    }

    if (error instanceof ValidationException) {
      await logFailure({
        eventType: "Update",
        description: `Validation failed: ${error.message}`,
        functionName: "updateProjectById",
        fileName: "project.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(400).json(validationErrorBody(req, res, error));
    }

    if (error instanceof BusinessLogicException) {
      await logFailure({
        eventType: "Update",
        description: `Business logic error: ${error.message}`,
        functionName: "updateProjectById",
        fileName: "project.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](translateError(req, error)));
    }

    await logFailure({
      eventType: "Update",
      description: "Failed to update project",
      functionName: "updateProjectById",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * DELETE /api/projects/:id (legacy, frozen): deletes the use case and keeps
 * its risks. A risk left with no use case link is visible to everyone in the
 * organization while it is active; API callers that want those risks kept
 * private use DELETE /api/v1/projects/:id with archive_risks_linked_only_here.
 */
export async function deleteProjectById(req: Request, res: Response): Promise<any> {
  return deleteProject(req, res, null);
}

/**
 * DELETE /api/v1/projects/:id?archive_risks_linked_only_here=true|false.
 * With true, the active risks linked to this use case and to no other are
 * archived in the delete's transaction (so they stay private: an archived risk
 * with no use case link is visible only to Admins, its owner and its
 * approver). The route has already checked risks.edit for that case and
 * parsed the flag into res.locals.archiveRisksLinkedOnlyHere.
 */
export async function deleteProjectByIdV1(req: Request, res: Response): Promise<any> {
  return deleteProject(req, res, res.locals.archiveRisksLinkedOnlyHere === true);
}

/**
 * The one body of both delete routes. `archiveRisks` null is the legacy
 * route: no archive and its frozen response (202 with `true`). A boolean is
 * the v1 route: 202 with { deleted: true, archived_risk_ids }. Anything that
 * fails rolls back the archive and the delete together.
 */
async function deleteProject(
  req: Request,
  res: Response,
  archiveRisks: boolean | null,
): Promise<any> {
  const transaction = await sequelize.transaction();
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  logProcessing({
    description: `starting deleteProjectById for ID ${projectId}`,
    functionName: "deleteProjectById",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    // Lock, withdraw a pending approval, record the deletion, delete: one
    // shared order for every path that deletes a project.
    const {
      deleted: deletedProject,
      withdrawnApprovalId,
      archivedRiskIds,
    } = await deleteProjectWithSideEffects(projectId, req.organizationId!, transaction, {
      userId: req.userId ?? null,
      archiveRisksLinkedOnlyHere: archiveRisks === true,
    });
    if (withdrawnApprovalId) {
      await logSuccess({
        eventType: "Update",
        description: `withdrew approval request ${withdrawnApprovalId} for project ${projectId}`,
        functionName: "deleteProjectById",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
    }

    if (deletedProject) {
      await transaction.commit();

      await logSuccess({
        eventType: "Delete",
        description: archivedRiskIds.length
          ? `Deleted project ID ${projectId} and archived ${archivedRiskIds.length} risks linked only to it`
          : `Deleted project ID ${projectId}`,
        functionName: "deleteProjectById",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });

      if (archiveRisks === null) {
        return res.status(202).json(STATUS_CODE[202](deletedProject));
      }
      return res
        .status(202)
        .json(STATUS_CODE[202]({ deleted: true, archived_risk_ids: archivedRiskIds }));
    }

    await transaction.rollback();
    await logSuccess({
      eventType: "Delete",
      description: `Project not found for deletion: ID ${projectId}`,
      functionName: "deleteProjectById",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await transaction.rollback();

    await logFailure({
      eventType: "Delete",
      description: "Failed to delete project",
      functionName: "deleteProjectById",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * GET /api/v1/projects/:id/risks-linked-only-here: the active risks that
 * deleting this use case would leave linked to no use case, which makes them
 * visible to everyone in the organization unless the delete archives them
 * (DELETE /api/v1/projects/:id). The delete dialog asks first. The
 * route lets through only callers who could delete the use case, and every
 * such caller can see these risks (they are linked to a use case the caller
 * has write access to).
 */
export async function getRisksLinkedOnlyToProject(req: Request, res: Response): Promise<any> {
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  logProcessing({
    description: `starting getRisksLinkedOnlyToProject for project ID ${projectId}`,
    functionName: "getRisksLinkedOnlyToProject",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const risks = await getRisksLinkedOnlyToProjectQuery(projectId, req.organizationId!);
    if (!risks) {
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    await logSuccess({
      eventType: "Read",
      description: `Retrieved ${risks.length} risks linked only to project ID ${projectId}`,
      functionName: "getRisksLinkedOnlyToProject",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200]({ count: risks.length, risks }));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to read the risks linked only to project ID ${projectId}`,
      functionName: "getRisksLinkedOnlyToProject",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * GET /api/v1/projects/:id/approval-workflow: the use case's approval
 * workflow (id, title, still active or archived) and the status of its latest
 * approval request. The legacy project responses never carried the workflow
 * id and are frozen, so the use case overview reads it here.
 *
 * viewer_can_write says whether the caller has write access to this use case
 * by the rule requireProjectAccess(..., "write") applies (getProjectAccessQuery:
 * Admin, owner, member, or a group attached to the use case), so the overview
 * offers resubmitting to exactly those the resubmit route lets through. It
 * leaves out the useCase.edit permission, which the client checks itself.
 */
export async function getUseCaseApprovalWorkflow(req: Request, res: Response): Promise<any> {
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const log = { functionName: "getUseCaseApprovalWorkflow", fileName: "project.ctrl.ts" };

  try {
    const workflow = await getUseCaseApprovalWorkflowQuery(projectId, req.organizationId!);
    if (!workflow) {
      return res.status(404).json(STATUS_CODE[404]({}));
    }
    const [approvalStatus, writeAccess] = await Promise.all([
      getApprovalStatusQuery(projectId, "use_case", req.organizationId!),
      // Only feeds the optional flag: if it fails, the workflow and status
      // still come back and the flag says no.
      getProjectAccessQuery(
        projectId,
        { userId: req.userId!, role: req.role! },
        req.organizationId!,
      ).catch(() => "denied" as const),
    ]);

    return res.status(200).json(
      STATUS_CODE[200]({
        ...workflow,
        approval_status: approvalStatus,
        viewer_can_write: writeAccess === "allowed",
      }),
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to read the approval workflow of project ID ${projectId}`,
      ...log,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Whether the use case's FRIA and CE marking hold work, so the use case page
 * keeps those tabs on a use case without the EU AI Act when they do.
 */
export async function getUseCaseEuAiActWork(req: Request, res: Response): Promise<any> {
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  try {
    const work = await getEuAiActWorkQuery(projectId, req.organizationId!);
    if (!work) {
      return res.status(404).json(STATUS_CODE[404]({}));
    }
    return res.status(200).json(STATUS_CODE[200](work));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to read the FRIA and CE marking work of project ID ${projectId}`,
      functionName: "getUseCaseEuAiActWork",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * POST /api/v1/projects/:id/resubmit-approval: send a rejected use case for
 * approval again under the workflow already attached to it. Saving the same
 * workflow is a no-op and, while the request is rejected, only an approval
 * workflow admin may change it, so without this a rejected use case could
 * never be reviewed again.
 *
 * The use case row is locked first, so two resubmits at once cannot both open
 * a request: the second waits, then sees the first one's pending request (409).
 * The request is opened as attaching a workflow opens it
 * (createUseCaseApprovalRequest: planned moves to in review), and the step 1
 * approvers get the same notice once the transaction commits. It is never
 * auto-approved: a person rejected the use case, so a person reviews it
 * again. Otherwise an owner could lower the risk classification to the
 * workflow's auto-approve level and resubmit past the rejection.
 */
export async function resubmitUseCaseApproval(req: Request, res: Response): Promise<any> {
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const organizationId = req.organizationId!;
  const userId = req.userId!;
  const log = { functionName: "resubmitUseCaseApproval", fileName: "project.ctrl.ts" };

  logProcessing({
    description: `starting resubmitUseCaseApproval for project ID ${projectId}`,
    ...log,
    userId,
    organizationId,
  });

  const transaction = await sequelize.transaction();
  // Set once the transaction is committed or rolled back, so the catch below
  // never rolls it back a second time (that throws, and the request hangs).
  let finished = false;
  const rollback = async () => {
    if (finished) return;
    finished = true;
    await transaction.rollback();
  };
  const refuse = async (status: 400 | 404 | 409, message: string | object, reason: string) => {
    await rollback();
    await logFailure({
      eventType: "Update",
      description: `Resubmit refused on use case ${projectId}: ${reason}`,
      ...log,
      error: new Error(reason),
      userId,
      organizationId,
    });
    return res.status(status).json(STATUS_CODE[status](message));
  };

  try {
    const locked = await lockUseCaseWorkflowQuery(projectId, organizationId, transaction);
    // Read under the lock, on the transaction's connection.
    const project = locked
      ? await getUseCaseApprovalSnapshotQuery(projectId, organizationId, transaction)
      : null;
    if (!locked || !project) {
      return refuse(404, {}, "not found");
    }

    const approvalStatus = await getApprovalStatusQuery(
      projectId,
      "use_case",
      organizationId,
      transaction,
    );
    if (approvalStatus === "pending") {
      return refuse(
        409,
        req.t!("This use case is already waiting for approval"),
        "approval already pending",
      );
    }
    if (approvalStatus !== "rejected") {
      return refuse(
        409,
        req.t!("Only a rejected use case can be resubmitted for approval"),
        "latest approval is not rejected",
      );
    }

    const workflowId = locked.approval_workflow_id;
    if (!workflowId) {
      return refuse(
        400,
        req.t!("This use case has no approval workflow. Attach one to send it for approval."),
        "no workflow attached",
      );
    }

    let usable: UsableUseCaseWorkflow;
    try {
      usable = await getUsableUseCaseWorkflow(workflowId, organizationId, transaction);
    } catch (error) {
      if (!(error instanceof ValidationException)) throw error;
      return refuse(
        400,
        req.t!(
          "{reason}. Ask an approval workflow admin to change this use case's approval workflow.",
          { reason: translateError(req, error) },
        ),
        `workflow ${workflowId} unusable: ${error.message}`,
      );
    }

    const useCase = {
      ...project,
      id: projectId,
      approval_workflow_id: workflowId,
    } as unknown as ProjectModel;
    const approval = await createUseCaseApprovalRequest(
      useCase,
      userId,
      organizationId,
      transaction,
      usable,
      { allowAutoApprove: false },
    );
    if (!approval) {
      // Unreachable with a workflow attached; never commit without a request.
      throw new Error(`No approval request opened for use case ${projectId}`);
    }

    // The resubmission is part of the use case's record, as the lifecycle
    // move it causes already is.
    await recordEntityChange(
      "use_case",
      projectId,
      "updated",
      userId,
      organizationId,
      "approval_status",
      "Rejected",
      "Pending",
      transaction,
    );

    finished = true;
    await transaction.commit();

    // The same notice as attaching a workflow: the step 1 approvers.
    notifyUseCaseApprovalOutcome(useCase, approval, userId, organizationId, "Update", log);

    await logSuccess({
      eventType: "Update",
      description: `Resubmitted use case ${projectId} for approval (request ${approval.request.id})`,
      ...log,
      userId,
      organizationId,
    });

    return res.status(201).json(
      STATUS_CODE[201]({
        approval_request_id: approval.request.id,
        // Never auto-approved (see above); the fields keep the contract.
        status: "pending",
        auto_approved: false,
      }),
    );
  } catch (error) {
    await rollback();

    // Raised by opening the request (createApprovalRequestQuery); the
    // workflow itself was checked above.
    if (error instanceof ValidationException) {
      await logFailure({
        eventType: "Update",
        description: `Resubmit failed validation: ${error.message}`,
        ...log,
        error,
        userId,
        organizationId,
      });
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }

    await logFailure({
      eventType: "Update",
      description: `Failed to resubmit use case ${projectId} for approval`,
      ...log,
      error: error as Error,
      userId,
      organizationId,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getProjectStatsById(req: Request, res: Response): Promise<any> {
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  logProcessing({
    description: `starting getProjectStatsById for project ID ${projectId}`,
    functionName: "getProjectStatsById",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const project: any = await getProjectByIdQuery(projectId, req.organizationId!);
    if (!project) {
      await logSuccess({
        eventType: "Read",
        description: `Project not found for stats: ID ${projectId}`,
        functionName: "getProjectStatsById",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]({}));
    }
    const project_last_updated = project.last_updated;
    const project_last_updated_by = project.last_updated_by;
    // owner is NULL for an external owner; there is no user row to look up.
    // Both users are read within this organization, since older rows can hold
    // a client-set owner or last_updated_by; only the fields a reader needs
    // are returned.
    const [ownerUser, updater]: [any, any] = await Promise.all([
      project.owner ? getUserByIdQuery(project.owner, null, req.organizationId!) : null,
      project_last_updated_by
        ? getUserByIdQuery(project_last_updated_by, null, req.organizationId!)
        : null,
    ]);
    const userWhoUpdated = updater
      ? { id: updater.id, name: updater.name, surname: updater.surname, email: updater.email }
      : null;

    const overviewDetails = {
      user: {
        name: ownerUser?.name ?? project.external_owner_name ?? null,
        surname: ownerUser?.surname ?? null,
        email: ownerUser?.email ?? project.external_owner_email ?? null,
        project_last_updated,
        userWhoUpdated,
      },
    };

    await logSuccess({
      eventType: "Read",
      description: `Retrieved project stats for project ID ${projectId}`,
      functionName: "getProjectStatsById",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(202).json(STATUS_CODE[202](overviewDetails));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve project stats",
      functionName: "getProjectStatsById",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getProjectRisksCalculations(req: Request, res: Response): Promise<any> {
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  logProcessing({
    description: `starting getProjectRisksCalculations for project ID ${projectId}`,
    functionName: "getProjectRisksCalculations",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const projectRisksCalculations = await calculateProjectRisks(projectId, req.organizationId!);

    await logSuccess({
      eventType: "Read",
      description: `Calculated risks for project ID ${projectId}`,
      functionName: "getProjectRisksCalculations",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res
      .status(projectRisksCalculations ? 200 : 204)
      .json(STATUS_CODE[projectRisksCalculations ? 200 : 204](projectRisksCalculations));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to calculate project risks",
      functionName: "getProjectRisksCalculations",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getVendorRisksCalculations(req: Request, res: Response): Promise<any> {
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  logProcessing({
    description: `starting getVendorRisksCalculations for project ID ${projectId}`,
    functionName: "getVendorRisksCalculations",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const vendorRisksCalculations = await calculateVendirRisks(projectId, req.organizationId!);

    await logSuccess({
      eventType: "Read",
      description: `Calculated vendor risks for project ID ${projectId}`,
      functionName: "getVendorRisksCalculations",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res
      .status(vendorRisksCalculations ? 200 : 204)
      .json(STATUS_CODE[vendorRisksCalculations ? 200 : 204](vendorRisksCalculations));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to calculate vendor risks",
      functionName: "getVendorRisksCalculations",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getCompliances(req: Request, res: Response) {
  const projectId = parseInt(
    Array.isArray(req.params.projid) ? req.params.projid[0] : req.params.projid,
    10,
  );

  logProcessing({
    description: `starting getCompliances for project ID ${projectId}`,
    functionName: "getCompliances",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const project = await getProjectByIdQuery(projectId, req.organizationId!);
    if (project) {
      const controlCategories = (await getControlCategoryByProjectIdQuery(
        project.id!,
        req.organizationId!,
      )) as IControlCategory[];
      for (const category of controlCategories) {
        if (category) {
          const controls = (await getAllControlsByControlGroupQuery(
            category.id,
            req.organizationId!,
          )) as IControl[];
          for (const control of controls) {
            if (control && control.id) {
              const subControls = await getAllSubcontrolsByControlIdQuery(
                control.id,
                req.organizationId!,
              );
              control.numberOfSubcontrols = subControls.length;
              control.numberOfDoneSubcontrols = subControls.filter(
                (sub) => sub.status === "Done",
              ).length;
              control.subControls = subControls;
            }
          }
          category.controls = controls;
        }
      }

      await logSuccess({
        eventType: "Read",
        description: `Retrieved compliance data for project ID ${projectId}`,
        functionName: "getCompliances",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });

      return res.status(200).json(STATUS_CODE[200](controlCategories));
    }

    await logSuccess({
      eventType: "Read",
      description: `Project not found for compliance lookup: ID ${projectId}`,
      functionName: "getCompliances",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(404).json(STATUS_CODE[404](project));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to fetch compliance data",
      functionName: "getCompliances",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function projectComplianceProgress(req: Request, res: Response) {
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  logProcessing({
    description: `starting projectComplianceProgress for ID ${projectId}`,
    functionName: "projectComplianceProgress",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const project = await getProjectByIdQuery(projectId, req.organizationId!);
    if (project) {
      const { totalSubcontrols, doneSubcontrols } = await countSubControlsByProjectId(
        project.id!,
        req.organizationId!,
      );

      await logSuccess({
        eventType: "Read",
        description: `Compliance progress calculated for project ID ${projectId}`,
        functionName: "projectComplianceProgress",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });

      return res.status(200).json(
        STATUS_CODE[200]({
          allsubControls: totalSubcontrols,
          allDonesubControls: doneSubcontrols,
        }),
      );
    }

    await logSuccess({
      eventType: "Read",
      description: `Project not found: ID ${projectId}`,
      functionName: "projectComplianceProgress",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(404).json(STATUS_CODE[404](project));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to get compliance progress",
      functionName: "projectComplianceProgress",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function projectAssessmentProgress(req: Request, res: Response) {
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  logProcessing({
    description: `starting projectAssessmentProgress for ID ${projectId}`,
    functionName: "projectAssessmentProgress",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const project = await getProjectByIdQuery(projectId, req.organizationId!);
    if (project) {
      const { totalAssessments, answeredAssessments } = await countAnswersByProjectId(
        project.id!,
        req.organizationId!,
      );

      await logSuccess({
        eventType: "Read",
        description: `Assessment progress calculated for project ID ${projectId}`,
        functionName: "projectAssessmentProgress",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });

      return res.status(200).json(
        STATUS_CODE[200]({
          totalQuestions: totalAssessments,
          answeredQuestions: answeredAssessments,
        }),
      );
    }

    await logSuccess({
      eventType: "Read",
      description: `Project not found: ID ${projectId}`,
      functionName: "projectAssessmentProgress",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(404).json(STATUS_CODE[404](project));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to get assessment progress",
      functionName: "projectAssessmentProgress",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function allProjectsComplianceProgress(req: Request, res: Response) {
  let totalNumberOfSubcontrols = 0;
  let totalNumberOfDoneSubcontrols = 0;
  logProcessing({
    description: "starting allProjectsComplianceProgress",
    functionName: "allProjectsComplianceProgress",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const { userId, role } = req;
    if (!userId || !role) {
      return res.status(401).json(STATUS_CODE[401](req.t!("Unauthorized")));
    }

    const projects = await getAllProjectsQuery({ userId, role }, req.organizationId!);
    if (projects && projects.length > 0) {
      await Promise.all(
        projects.map(async (project) => {
          const { totalSubcontrols, doneSubcontrols } = await countSubControlsByProjectId(
            project.id!,
            req.organizationId!,
          );
          totalNumberOfSubcontrols += parseInt(totalSubcontrols, 10);
          totalNumberOfDoneSubcontrols += parseInt(doneSubcontrols, 10);
        }),
      );

      await logSuccess({
        eventType: "Read",
        description: "Compliance progress calculated across all projects",
        functionName: "allProjectsComplianceProgress",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });

      return res.status(200).json(
        STATUS_CODE[200]({
          allsubControls: totalNumberOfSubcontrols,
          allDonesubControls: totalNumberOfDoneSubcontrols,
        }),
      );
    }

    await logSuccess({
      eventType: "Read",
      description: "No projects found for compliance progress",
      functionName: "allProjectsComplianceProgress",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(404).json(STATUS_CODE[404](projects));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to get compliance progress for all projects",
      functionName: "allProjectsComplianceProgress",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function allProjectsAssessmentProgress(req: Request, res: Response) {
  let totalNumberOfQuestions = 0;
  let totalNumberOfAnsweredQuestions = 0;
  logProcessing({
    description: "starting allProjectsAssessmentProgress",
    functionName: "allProjectsAssessmentProgress",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const { userId, role } = req;
    if (!userId || !role) {
      return res.status(401).json(STATUS_CODE[401](req.t!("Unauthorized")));
    }

    const projects = await getAllProjectsQuery({ userId, role }, req.organizationId!);
    if (projects && projects.length > 0) {
      await Promise.all(
        projects.map(async (project) => {
          const { totalAssessments, answeredAssessments } = await countAnswersByProjectId(
            project.id!,
            req.organizationId!,
          );
          totalNumberOfQuestions += parseInt(totalAssessments, 10);
          totalNumberOfAnsweredQuestions += parseInt(answeredAssessments, 10);
        }),
      );

      await logSuccess({
        eventType: "Read",
        description: "Assessment progress calculated across all projects",
        functionName: "allProjectsAssessmentProgress",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });

      return res.status(200).json(
        STATUS_CODE[200]({
          totalQuestions: totalNumberOfQuestions,
          answeredQuestions: totalNumberOfAnsweredQuestions,
        }),
      );
    }

    await logSuccess({
      eventType: "Read",
      description: "No projects found for assessment progress",
      functionName: "allProjectsAssessmentProgress",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(404).json(STATUS_CODE[404](projects));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to get assessment progress for all projects",
      functionName: "allProjectsAssessmentProgress",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function updateProjectStatus(req: Request, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { status } = req.body;

  logProcessing({
    description: `starting updateProjectStatus for ID ${projectId}`,
    functionName: "updateProjectStatus",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    // Check if project exists
    const existingProject = await getProjectByIdQuery(projectId, req.organizationId!);
    if (!existingProject) {
      await logSuccess({
        eventType: "Update",
        description: `Project not found for status update: ID ${projectId}`,
        functionName: "updateProjectStatus",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });

      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    // Update project status
    const updatedProject = await updateProjectByIdQuery(
      projectId,
      { status, last_updated: new Date(), last_updated_by: req.userId! },
      undefined, // leave members unchanged
      req.organizationId!,
      transaction,
    );

    if (updatedProject) {
      // Track and record status change
      if (req.userId && existingProject && existingProject.status !== status) {
        await recordMultipleFieldChanges(
          projectId,
          req.userId,
          req.organizationId!,
          [
            {
              fieldName: "status",
              oldValue: String(existingProject.status || "-"),
              newValue: String(status || "-"),
            },
          ],
          transaction,
        );
      }

      await transaction.commit();

      await logSuccess({
        eventType: "Update",
        description: `Updated project status to ${status} for ID ${projectId}`,
        functionName: "updateProjectStatus",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });

      return res.status(200).json(STATUS_CODE[200](updatedProject));
    }

    // The row disappeared between the existence check and the update.
    await transaction.rollback();
    await logSuccess({
      eventType: "Update",
      description: `Project not found for status update: ID ${projectId}`,
      functionName: "updateProjectStatus",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await transaction.rollback();

    await logFailure({
      eventType: "Update",
      description: "Failed to update project status",
      functionName: "updateProjectStatus",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
