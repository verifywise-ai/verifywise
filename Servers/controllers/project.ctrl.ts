import { Request, Response } from "express";

import { STATUS_CODE } from "../utils/statusCode.utils";
import { PluginService } from "../services/plugin/pluginService";
import {
  calculateProjectRisks,
  calculateVendirRisks,
  countAnswersByProjectId,
  countSubControlsByProjectId,
  createNewProjectQuery,
  deleteProjectByIdQuery,
  getAllProjectsQuery,
  getProjectByIdQuery,
  updateProjectByIdQuery,
  getCurrentProjectMembers,
} from "../utils/project.utils";
import { getUserByIdQuery } from "../utils/user.utils";
import { getControlCategoryByProjectIdQuery } from "../utils/controlCategory.utils";
import { ProjectModel } from "../domain.layer/models/project/project.model";
import { getAllControlsByControlGroupQuery } from "../utils/control.utils";
import { getAllSubcontrolsByControlIdQuery } from "../utils/subControl.utils";
import { createEUFrameworkQuery } from "../utils/eu.utils";
import { sequelize } from "../database/db";
import { createISOFrameworkQuery } from "../utils/iso42001.utils";
import { IProjectAttributes } from "../domain.layer/interfaces/i.project";
import { IControl } from "../domain.layer/interfaces/i.control";
import { IControlCategory } from "../domain.layer/interfaces/i.controlCategory";
import {
  logProcessing,
  logSuccess,
  logFailure,
} from "../utils/logger/logHelper";
import { createISO27001FrameworkQuery } from "../utils/iso27001.utils";
import { createNISTAI_RMFFrameworkQuery } from "../utils/nistAiRmfCorrect.utils";
import {
  ValidationException,
  BusinessLogicException,
} from "../domain.layer/exceptions/custom.exception";
import {
  sendProjectCreatedNotification,
  sendUserAddedToProjectNotification,
  ProjectRole,
} from "../services/userNotification/projectNotifications";
import { sendSlackNotification } from "../services/slack/slackNotificationService";
import { SlackNotificationRoutingType } from "../domain.layer/enums/slack.enum";
import {
  recordUseCaseCreation,
  trackUseCaseChanges,
  recordMultipleFieldChanges,
  recordUseCaseDeletion,
} from "../utils/useCaseChangeHistory.utils";
import { getApprovalWorkflowByIdQuery } from "../utils/approvalWorkflow.utils";
import { createApprovalRequestQuery, hasPendingApprovalQuery, getPendingApprovalRequestIdQuery, withdrawApprovalRequestQuery } from "../utils/approvalRequest.utils";
// SSE notifications disabled for now - can be re-enabled later if needed
// import { notifyStepApprovers } from "../services/notification.service";
import { ApprovalRequestStatus } from "../domain.layer/enums/approval-workflow.enum";
import { notifyUserAssigned } from "../services/inAppNotification.service";

export async function getAllProjects(
  req: Request,
  res: Response
): Promise<any> {
  logProcessing({
    description: "starting getAllProjects",
    functionName: "getAllProjects",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const { userId, role } = req;
    if (!userId || !role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const projects = (await getAllProjectsQuery(
      { userId, role },
      req.organizationId!
    )) as IProjectAttributes[];

    // Add approval status fields to each project
    const { getApprovalStatusQuery } = require("../utils/approvalRequest.utils");

    await Promise.all(
      projects.map(async (project) => {
        if (project.id) {
          // Check if project has a pending approval request
          const hasPendingApproval = await hasPendingApprovalQuery(
            project.id,
            "use_case",
            req.organizationId!
          );

          // Get the approval status (pending, rejected, or null)
          const approvalStatus = await getApprovalStatusQuery(
            project.id,
            "use_case",
            req.organizationId!
          );

          // Add approval status to project response
          ((project as any).dataValues as any).has_pending_approval = hasPendingApproval;
          ((project as any).dataValues as any).approval_status = approvalStatus;
        }
      })
    );

    // Fetch additional use-cases from plugins (e.g., JIRA Assets)
    let allProjects = [...projects];
    try {
      const pluginUseCases = await PluginService.getDataFromProviders(
        "use-cases",
        req.organizationId!,
        sequelize
      );
      if (pluginUseCases.length > 0) {
        console.log(`[getAllProjects] Merging ${pluginUseCases.length} use-cases from plugins`);
        allProjects = [...projects, ...pluginUseCases];
      }
    } catch (pluginError) {
      console.error("[getAllProjects] Error fetching plugin use-cases:", pluginError);
      // Continue with native projects even if plugin fetch fails
    }

    await logSuccess({
      eventType: "Read",
      description: "Retrieved all projects",
      functionName: "getAllProjects",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](allProjects));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve all projects",
      functionName: "getAllProjects",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getProjectById(
  req: Request,
  res: Response
): Promise<any> {
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getProjectById for ID ${projectId}`,
    functionName: "getProjectById",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const project = await getProjectByIdQuery(projectId, req.organizationId!);

    if (project) {
      // Check if project has a pending approval request
      const hasPendingApproval = await hasPendingApprovalQuery(
        projectId,
        "use_case",
        req.organizationId!
      );

      // Get the approval status (pending, rejected, or null)
      const { getApprovalStatusQuery } = require("../utils/approvalRequest.utils");
      const approvalStatus = await getApprovalStatusQuery(
        projectId,
        "use_case",
        req.organizationId!
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
        tenantId: req.organizationId!,
      });

      return res.status(200).json(STATUS_CODE[200](project));
    }

    await logSuccess({
      eventType: "Read",
      description: `Project not found: ID ${projectId}`,
      functionName: "getProjectById",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
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
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function createProject(req: Request, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();
  const projectData = {
    ...req.body,
    framework: req.body.framework,
  };

  logProcessing({
    description: "starting createProject",
    functionName: "createProject",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const newProject: Partial<ProjectModel> & {
      members: number[] | undefined;
      framework: number[];
      enable_ai_data_insertion: boolean;
    } = projectData;

    const createdProject = await createNewProjectQuery(
      newProject,
      newProject.members ?? [],
      newProject.framework,
      req.organizationId!,
      req.userId!,
      transaction
    );

    // Only create frameworks immediately if NO approval workflow is assigned
    // Otherwise, store frameworks for creation after approval
    const frameworks: { [key: string]: Object } = {};
    if (!createdProject.approval_workflow_id) {
      // No approval workflow - create frameworks immediately
      for (const framework of newProject.framework) {
        if (framework === 1) {
          const eu = await createEUFrameworkQuery(
            createdProject.id!,
            newProject.enable_ai_data_insertion,
            req.organizationId!,
            transaction
          );
          frameworks["eu"] = eu;
        } else if (framework === 2) {
          const iso42001 = await createISOFrameworkQuery(
            createdProject.id!,
            newProject.enable_ai_data_insertion,
            req.organizationId!,
            transaction
          );
          frameworks["iso42001"] = iso42001;
        } else if (framework === 3) {
          const iso27001 = await createISO27001FrameworkQuery(
            createdProject.id!,
            newProject.enable_ai_data_insertion,
            req.organizationId!,
            transaction
          );
          frameworks["iso27001"] = iso27001;
        } else if (framework === 4) {
          const nist = await createNISTAI_RMFFrameworkQuery(
            createdProject.id!,
            newProject.enable_ai_data_insertion,
            req.organizationId!,
            transaction
          );
          frameworks["nist_ai_rmf"] = nist;
        }
      }
    } else {
      // Approval workflow assigned - defer framework creation until approval
      console.log("Approval workflow detected - deferring framework creation until approval");
      console.log("Pending frameworks:", newProject.framework);
      console.log("enable_ai_data_insertion:", newProject.enable_ai_data_insertion);
    }

    if (createdProject) {
      // Record use case creation in change history
      if (createdProject.id && req.userId) {
        await recordUseCaseCreation(
          createdProject.id,
          req.userId,
          req.organizationId!,
          {
            project_title: createdProject.project_title,
            owner: createdProject.owner,
            start_date: createdProject.start_date,
            geography: createdProject.geography,
            ai_risk_classification: createdProject.ai_risk_classification,
            type_of_high_risk_role: createdProject.type_of_high_risk_role,
            goal: createdProject.goal,
            target_industry: createdProject.target_industry,
            description: createdProject.description,
            status: createdProject.status,
          },
          transaction
        );
      }

      // Create approval request if approval_workflow_id is provided
      console.log("=== CHECKING APPROVAL WORKFLOW ===");
      console.log("createdProject.approval_workflow_id:", createdProject.approval_workflow_id);
      console.log("createdProject.id:", createdProject.id);
      console.log("req.userId:", req.userId);

      if (createdProject.approval_workflow_id && createdProject.id && req.userId) {
        console.log("All conditions met, fetching workflow...");
        console.log("Fetching workflow ID:", createdProject.approval_workflow_id);

        const workflow = await getApprovalWorkflowByIdQuery(
          createdProject.approval_workflow_id,
          req.organizationId!,
          transaction
        );

        console.log("Workflow fetched:", workflow ? "YES" : "NO");
        if (workflow) {
          const workflowSteps = workflow.get('steps') as any;
          console.log("Workflow ID:", (workflow as any).id);
          console.log("Workflow steps:", workflowSteps);
          console.log("Number of steps:", workflowSteps?.length);
        }

        const workflowSteps = workflow ? workflow.get('steps') as any : null;
        if (workflow && workflowSteps && workflowSteps.length > 0) {
          console.log("Creating approval request...");
          const approvalRequestData = {
            request_name: `Use Case: ${createdProject.project_title}`,
            workflow_id: createdProject.approval_workflow_id,
            entity_id: createdProject.id,
            entity_type: "use_case",
            entity_data: {
              project_title: createdProject.project_title,
              owner: createdProject.owner,
              ai_risk_classification: createdProject.ai_risk_classification,
            },
            status: ApprovalRequestStatus.PENDING,
            requested_by: req.userId,
          };
          console.log("Approval request data:", JSON.stringify(approvalRequestData, null, 2));

          const createdApprovalRequest = await createApprovalRequestQuery(
            approvalRequestData,
            workflowSteps,
            req.organizationId!,
            transaction
          );
          console.log("Approval request created successfully!");

          // Store approval request info for notification after transaction commits
          (createdProject as any)._approvalRequestId = createdApprovalRequest.id;
          (createdProject as any)._approvalRequestName = approvalRequestData.request_name;
        } else {
          console.log("ERROR: Workflow not found or has no steps!");
          if (!workflow) {
            console.log("Workflow is null/undefined");
          } else if (!workflowSteps || workflowSteps.length === 0) {
            console.log("Workflow has no steps or empty steps array");
          }
        }
      } else {
        console.log("Conditions NOT met for creating approval request:");
        if (!createdProject.approval_workflow_id) {
          console.log("  - approval_workflow_id is missing");
        }
        if (!createdProject.id) {
          console.log("  - createdProject.id is missing");
        }
        if (!req.userId) {
          console.log("  - req.userId is missing");
        }
      }

      await transaction.commit();

      await logSuccess({
        eventType: "Create",
        description: "Created new project",
        functionName: "createProject",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      // SSE notifications disabled for now - can be re-enabled later if needed
      // if ((createdProject as any)._approvalRequestId) {
      //   notifyStepApprovers(
      //     req.organizationId!,
      //     (createdProject as any)._approvalRequestId,
      //     1, // Step 1
      //     (createdProject as any)._approvalRequestName
      //   ).catch(error => {
      //     console.error("Error sending approval notification:", error);
      //   });
      // }

      // Send project creation notification to admin (fire-and-forget, don't block response)
      sendProjectCreatedNotification({
        projectId: createdProject.id!,
        projectName: createdProject.project_title,
        adminId: createdProject.owner,
        organizationId: req.organizationId!,
        userId: req.userId!,
      }).catch(async (emailError) => {
        // Log the email error but don't fail the project creation
        await logFailure({
          eventType: "Create",
          description: "Failed to send project creation notification email",
          functionName: "createProject",
          fileName: "project.ctrl.ts",
          error: emailError as Error,
          userId: req.userId!,
          organizationId: req.organizationId!,
        });
      });

      const actor = await getUserByIdQuery(req.userId!);

      sendSlackNotification(
        {
          userId: actor.id!,
          routingType: SlackNotificationRoutingType.PROJECTS_AND_ORGANIZATIONS,
        },
        {
          title: `Project created`,
          message: `${actor.name} ${actor.surname} created Project ${createdProject.project_title}.`,
        }
      ).catch(async (slackError) => {
        await logFailure({
          eventType: "Create",
          description: "Failed to send Slack notification for project creation",
          functionName: "createProject",
          fileName: "project.ctrl.ts",
          error: slackError as Error,
          userId: req.userId!,
          tenantId: req.organizationId!,
        });
      });

      // Send owner assignment notification
      const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      if (createdProject.owner) {
        const assignerName = `${actor.name} ${actor.surname}`.trim();
        notifyUserAssigned(
          req.organizationId!,
          createdProject.owner,
          {
            entityType: "project",
            entityId: createdProject.id!,
            entityName: createdProject.project_title,
            roleType: "Owner",
            entityUrl: `/project-view?projectId=${createdProject.id}`,
          },
          assignerName,
          baseUrl
        ).catch((err) => console.error("Failed to send owner notification:", err));
      }

      return res.status(201).json(
        STATUS_CODE[201]({
          project: createdProject,
          frameworks,
        })
      );
    }

    await logSuccess({
      eventType: "Create",
      description: "Project creation returned null",
      functionName: "createProject",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
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
        tenantId: req.organizationId!,
      });
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    if (error instanceof BusinessLogicException) {
      await logFailure({
        eventType: "Create",
        description: `Business logic error: ${error.message}`,
        functionName: "createProject",
        fileName: "project.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](error.message));
    }

    await logFailure({
      eventType: "Create",
      description: "Failed to create project",
      functionName: "createProject",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateProjectById(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const updateData = req.body;

  logProcessing({
    description: `starting updateProjectById for ID ${projectId}`,
    functionName: "updateProjectById",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
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
        tenantId: req.organizationId!,
      });
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Find existing project
    const existingProject = await getProjectByIdQuery(projectId, req.organizationId!);

    if (!existingProject) {
      await logSuccess({
        eventType: "Update",
        description: `Project not found for update: ID ${projectId}`,
        functionName: "updateProjectById",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    const updatedProject: Partial<ProjectModel> & { members?: number[] } =
      updateData;
    const members = updatedProject.members || [];

    delete updatedProject.members;
    delete updatedProject.id;

    // if (!updatedProject.project_title || !updatedProject.owner) {
    //   return res.status(400).json(
    //     STATUS_CODE[400]({ message: "project_title and owner are required" })
    //   );
    // }

    // Get current project and members to check for changes
    // const ownerChanged =
    //   existingProject && existingProject.owner !== updatedProject.owner;

    // Get current members before update to identify newly added ones
    const currentMembers = await getCurrentProjectMembers(
      projectId,
      req.organizationId!,
      transaction
    );

    const project = await updateProjectByIdQuery(
      projectId,
      updatedProject,
      members,
      req.organizationId!,
      transaction
    );

    if (project) {
      // Track and record changes for use case history
      if (req.userId && existingProject) {
        const changes = await trackUseCaseChanges(
          existingProject,
          updatedProject
        );
        if (changes.length > 0) {
          await recordMultipleFieldChanges(
            projectId,
            req.userId,
            req.organizationId!,
            changes,
            transaction
          );
        }
      }

      await transaction.commit();

      await logSuccess({
        eventType: "Update",
        description: `Updated project ID ${projectId}`,
        functionName: "updateProjectById",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      // Send owner assignment notification if owner changed
      const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const oldOwner = existingProject.owner;
      const newOwner = project.owner;
      if (newOwner && newOwner !== oldOwner && newOwner !== userId) {
        const assigner = await getUserByIdQuery(userId);
        const assignerName = assigner ? `${assigner.name} ${assigner.surname}`.trim() : "Someone";
        notifyUserAssigned(
          req.organizationId!,
          newOwner,
          {
            entityType: "project",
            entityId: projectId,
            entityName: project.project_title,
            roleType: "Owner",
            entityUrl: `/project-view?projectId=${projectId}`,
          },
          assignerName,
          baseUrl
        ).catch((err) => console.error("Failed to send owner notification:", err));
      }

      // Calculate which members actually got added (both new and re-added)
      // This includes users who weren't in currentMembers but are now in the final project
      const finalMembers = project.members || [];
      const addedMembers = finalMembers.filter(
        (m) => !currentMembers.includes(m)
      );

      // Send notification to users who were added (fire-and-forget, don't block response)
      for (const memberId of addedMembers) {
        try {
          // Get user details to check their role
          const memberUser = await getUserByIdQuery(memberId);

          if (memberUser) {
            // Validate role_id is a number
            if (
              typeof memberUser.role_id !== "number" ||
              !Number.isInteger(memberUser.role_id)
            ) {
              await logFailure({
                eventType: "Update",
                description: `Invalid role_id type for member ${memberId}: expected number, got ${typeof memberUser.role_id} (${memberUser.role_id})`,
                functionName: "updateProjectById",
                fileName: "project.ctrl.ts",
                error: new Error(
                  `Invalid role_id type: ${typeof memberUser.role_id}`
                ),
                userId: req.userId!,
                tenantId: req.organizationId!,
              });
              continue;
            }

            // Map role_id to role name
            const roleMap: Record<number, ProjectRole> = {
              1: "admin",
              2: "reviewer",
              3: "editor",
              4: "auditor",
            };

            const role = roleMap[memberUser.role_id];

            if (role) {
              sendUserAddedToProjectNotification({
                projectId: projectId,
                projectName: project.project_title,
                adminId: req.userId!,
                userId: memberId,
                role: role,
                organizationId: req.organizationId!,
              }).catch(async (emailError) => {
                await logFailure({
                  eventType: "Update",
                  description: `Failed to send user added as ${role} notification email to user ${memberId}`,
                  functionName: "updateProjectById",
                  fileName: "project.ctrl.ts",
                  error: emailError as Error,
                  userId: req.userId!,
                  organizationId: req.organizationId!,
                });
              });
            } else {
              await logFailure({
                eventType: "Update",
                description: `Unmapped role_id ${memberUser.role_id} for member ${memberId} in project ${projectId} (${project.project_title}) - notification skipped`,
                functionName: "updateProjectById",
                fileName: "project.ctrl.ts",
                error: new Error(`Unmapped role_id: ${memberUser.role_id}`),
                userId: req.userId!,
                tenantId: req.organizationId!,
              });
            }
          }
        } catch (userLookupError) {
          await logFailure({
            eventType: "Update",
            description: `Failed to lookup user role for member ${memberId}`,
            functionName: "updateProjectById",
            fileName: "project.ctrl.ts",
            error: userLookupError as Error,
            userId: req.userId!,
            tenantId: req.organizationId!,
          });
        }
      }

      return res.status(202).json(STATUS_CODE[202](project));
    }

    await logSuccess({
      eventType: "Update",
      description: `Project not found for update: ID ${projectId}`,
      functionName: "updateProjectById",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      await logFailure({
        eventType: "Update",
        description: `Validation failed: ${error.message}`,
        functionName: "updateProjectById",
        fileName: "project.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    if (error instanceof BusinessLogicException) {
      await logFailure({
        eventType: "Update",
        description: `Business logic error: ${error.message}`,
        functionName: "updateProjectById",
        fileName: "project.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](error.message));
    }

    await logFailure({
      eventType: "Update",
      description: "Failed to update project",
      functionName: "updateProjectById",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteProjectById(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting deleteProjectById for ID ${projectId}`,
    functionName: "deleteProjectById",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    // Check if project has a pending approval request and withdraw it
    const pendingApprovalRequestId = await getPendingApprovalRequestIdQuery(
      projectId,
      "use_case",
      req.organizationId!,
      transaction
    );

    if (pendingApprovalRequestId) {
      console.log(`Withdrawing approval request ${pendingApprovalRequestId} for project ${projectId} before deletion`);
      await withdrawApprovalRequestQuery(
        pendingApprovalRequestId,
        req.organizationId!,
        transaction
      );
      console.log(`Approval request ${pendingApprovalRequestId} withdrawn successfully`);
    }

    // Record deletion in change history BEFORE deleting the project
    // (due to foreign key constraint on use_case_change_history table)
    if (req.userId) {
      await recordUseCaseDeletion(
        projectId,
        req.userId,
        req.organizationId!,
        transaction
      );
    }

    const deletedProject = await deleteProjectByIdQuery(
      projectId,
      req.organizationId!,
      transaction
    );

    if (deletedProject) {
      await transaction.commit();

      await logSuccess({
        eventType: "Delete",
        description: `Deleted project ID ${projectId}`,
        functionName: "deleteProjectById",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      return res.status(202).json(STATUS_CODE[202](deletedProject));
    }

    await logSuccess({
      eventType: "Delete",
      description: `Project not found for deletion: ID ${projectId}`,
      functionName: "deleteProjectById",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
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
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getProjectStatsById(
  req: Request,
  res: Response
): Promise<any> {
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getProjectStatsById for project ID ${projectId}`,
    functionName: "getProjectStatsById",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const project: any = await getProjectByIdQuery(projectId, req.organizationId!);
    const project_owner = project.owner;
    const ownerUser: any = getUserByIdQuery(project_owner);
    const project_last_updated = project.last_updated;
    const project_last_updated_by = project.last_updated_by;
    const userWhoUpdated: any = getUserByIdQuery(project_last_updated_by);

    const overviewDetails = {
      user: {
        name: ownerUser.name,
        surname: ownerUser.surname,
        email: ownerUser.email,
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
      tenantId: req.organizationId!,
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
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getProjectRisksCalculations(
  req: Request,
  res: Response
): Promise<any> {
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getProjectRisksCalculations for project ID ${projectId}`,
    functionName: "getProjectRisksCalculations",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const projectRisksCalculations = await calculateProjectRisks(
      projectId,
      req.organizationId!
    );

    await logSuccess({
      eventType: "Read",
      description: `Calculated risks for project ID ${projectId}`,
      functionName: "getProjectRisksCalculations",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res
      .status(projectRisksCalculations ? 200 : 204)
      .json(
        STATUS_CODE[projectRisksCalculations ? 200 : 204](
          projectRisksCalculations
        )
      );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to calculate project risks",
      functionName: "getProjectRisksCalculations",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getVendorRisksCalculations(
  req: Request,
  res: Response
): Promise<any> {
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getVendorRisksCalculations for project ID ${projectId}`,
    functionName: "getVendorRisksCalculations",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const vendorRisksCalculations = await calculateVendirRisks(
      projectId,
      req.organizationId!
    );

    await logSuccess({
      eventType: "Read",
      description: `Calculated vendor risks for project ID ${projectId}`,
      functionName: "getVendorRisksCalculations",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res
      .status(vendorRisksCalculations ? 200 : 204)
      .json(
        STATUS_CODE[vendorRisksCalculations ? 200 : 204](
          vendorRisksCalculations
        )
      );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to calculate vendor risks",
      functionName: "getVendorRisksCalculations",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getCompliances(req: Request, res: Response) {
  const projectId = parseInt(Array.isArray(req.params.projid) ? req.params.projid[0] : req.params.projid);

  logProcessing({
    description: `starting getCompliances for project ID ${projectId}`,
    functionName: "getCompliances",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const project = await getProjectByIdQuery(projectId, req.organizationId!);
    if (project) {
      const controlCategories = (await getControlCategoryByProjectIdQuery(
        project.id!,
        req.organizationId!
      )) as IControlCategory[];
      for (const category of controlCategories) {
        if (category) {
          const controls = (await getAllControlsByControlGroupQuery(
            category.id,
            req.organizationId!
          )) as IControl[];
          for (const control of controls) {
            if (control && control.id) {
              const subControls = await getAllSubcontrolsByControlIdQuery(
                control.id,
                req.organizationId!
              );
              control.numberOfSubcontrols = subControls.length;
              control.numberOfDoneSubcontrols = subControls.filter(
                (sub) => sub.status === "Done"
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
        tenantId: req.organizationId!,
      });

      return res.status(200).json(STATUS_CODE[200](controlCategories));
    }

    await logSuccess({
      eventType: "Read",
      description: `Project not found for compliance lookup: ID ${projectId}`,
      functionName: "getCompliances",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
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
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function projectComplianceProgress(req: Request, res: Response) {
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting projectComplianceProgress for ID ${projectId}`,
    functionName: "projectComplianceProgress",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const project = await getProjectByIdQuery(projectId, req.organizationId!);
    if (project) {
      const { totalSubcontrols, doneSubcontrols } =
        await countSubControlsByProjectId(project.id!, req.organizationId!);

      await logSuccess({
        eventType: "Read",
        description: `Compliance progress calculated for project ID ${projectId}`,
        functionName: "projectComplianceProgress",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      return res.status(200).json(
        STATUS_CODE[200]({
          allsubControls: totalSubcontrols,
          allDonesubControls: doneSubcontrols,
        })
      );
    }

    await logSuccess({
      eventType: "Read",
      description: `Project not found: ID ${projectId}`,
      functionName: "projectComplianceProgress",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
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
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function projectAssessmentProgress(req: Request, res: Response) {
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting projectAssessmentProgress for ID ${projectId}`,
    functionName: "projectAssessmentProgress",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const project = await getProjectByIdQuery(projectId, req.organizationId!);
    if (project) {
      const { totalAssessments, answeredAssessments } =
        await countAnswersByProjectId(project.id!, req.organizationId!);

      await logSuccess({
        eventType: "Read",
        description: `Assessment progress calculated for project ID ${projectId}`,
        functionName: "projectAssessmentProgress",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      return res.status(200).json(
        STATUS_CODE[200]({
          totalQuestions: totalAssessments,
          answeredQuestions: answeredAssessments,
        })
      );
    }

    await logSuccess({
      eventType: "Read",
      description: `Project not found: ID ${projectId}`,
      functionName: "projectAssessmentProgress",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
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
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function allProjectsComplianceProgress(
  req: Request,
  res: Response
) {
  let totalNumberOfSubcontrols = 0;
  let totalNumberOfDoneSubcontrols = 0;
  logProcessing({
    description: "starting allProjectsComplianceProgress",
    functionName: "allProjectsComplianceProgress",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const { userId, role } = req;
    if (!userId || !role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const projects = await getAllProjectsQuery({ userId, role }, req.organizationId!);
    if (projects && projects.length > 0) {
      await Promise.all(
        projects.map(async (project) => {
          const { totalSubcontrols, doneSubcontrols } =
            await countSubControlsByProjectId(project.id!, req.organizationId!);
          totalNumberOfSubcontrols += parseInt(totalSubcontrols);
          totalNumberOfDoneSubcontrols += parseInt(doneSubcontrols);
        })
      );

      await logSuccess({
        eventType: "Read",
        description: "Compliance progress calculated across all projects",
        functionName: "allProjectsComplianceProgress",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      return res.status(200).json(
        STATUS_CODE[200]({
          allsubControls: totalNumberOfSubcontrols,
          allDonesubControls: totalNumberOfDoneSubcontrols,
        })
      );
    }

    await logSuccess({
      eventType: "Read",
      description: "No projects found for compliance progress",
      functionName: "allProjectsComplianceProgress",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
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
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function allProjectsAssessmentProgress(
  req: Request,
  res: Response
) {
  let totalNumberOfQuestions = 0;
  let totalNumberOfAnsweredQuestions = 0;
  logProcessing({
    description: "starting allProjectsAssessmentProgress",
    functionName: "allProjectsAssessmentProgress",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const { userId, role } = req;
    if (!userId || !role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const projects = await getAllProjectsQuery({ userId, role }, req.organizationId!);
    if (projects && projects.length > 0) {
      await Promise.all(
        projects.map(async (project) => {
          const { totalAssessments, answeredAssessments } =
            await countAnswersByProjectId(project.id!, req.organizationId!);
          totalNumberOfQuestions += parseInt(totalAssessments);
          totalNumberOfAnsweredQuestions += parseInt(answeredAssessments);
        })
      );

      await logSuccess({
        eventType: "Read",
        description: "Assessment progress calculated across all projects",
        functionName: "allProjectsAssessmentProgress",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      return res.status(200).json(
        STATUS_CODE[200]({
          totalQuestions: totalNumberOfQuestions,
          answeredQuestions: totalNumberOfAnsweredQuestions,
        })
      );
    }

    await logSuccess({
      eventType: "Read",
      description: "No projects found for assessment progress",
      functionName: "allProjectsAssessmentProgress",
      fileName: "project.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
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
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateProjectStatus(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const { status } = req.body;

  logProcessing({
    description: `starting updateProjectStatus for ID ${projectId}`,
    functionName: "updateProjectStatus",
    fileName: "project.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
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
        tenantId: req.organizationId!,
      });

      return res.status(404).json(STATUS_CODE[404]({}));
    }

    // Update project status
    const updatedProject = await updateProjectByIdQuery(
      projectId,
      { status, last_updated: new Date(), last_updated_by: req.userId! },
      [], // no members update
      req.organizationId!,
      transaction
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
          transaction
        );
      }

      await transaction.commit();

      await logSuccess({
        eventType: "Update",
        description: `Updated project status to ${status} for ID ${projectId}`,
        functionName: "updateProjectStatus",
        fileName: "project.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      return res.status(200).json(STATUS_CODE[200](updatedProject));
    }

    await transaction.rollback();
    return res
      .status(500)
      .json(STATUS_CODE[500]("Failed to update project status"));
  } catch (error) {
    await transaction.rollback();

    await logFailure({
      eventType: "Update",
      description: "Failed to update project status",
      functionName: "updateProjectStatus",
      fileName: "project.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
