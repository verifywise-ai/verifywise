import { Request, Response } from "express";
import { QueryTypes } from "sequelize";
import { ControlEU } from "../domain.layer/frameworks/EU-AI-Act/controlEU.model";
import { notifyUserAssigned, AssignmentRoleType } from "../services/inAppNotification.service";
import { FileType } from "../domain.layer/models/file/file.model";
import { uploadFile } from "../utils/fileUpload.utils";
import { getAllProjectsQuery, updateProjectUpdatedByIdQuery } from "../utils/project.utils";
import { RequestWithFile, UploadedFile } from "../utils/question.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  countAnswersEUByProjectId,
  countSubControlsEUByProjectId,
  deleteAssessmentEUByProjectIdQuery,
  deleteComplianeEUByProjectIdQuery,
  deriveControlStatus,
  findUsersNotInOrganization,
  getAllControlCategoriesQuery,
  getAllTopicsQuery,
  getAssessmentsEUByProjectIdQuery,
  getComplianceEUByProjectIdQuery,
  getControlByIdForProjectQuery,
  getControlStructByControlCategoryIdForAProjectQuery,
  getTopicByIdForProjectQuery,
  getVisibleEuCategoryIdsForProject,
  updateControlEUByIdQuery,
  updateQuestionEUByIdQuery,
  updateSubcontrolEUByIdQuery,
} from "../utils/eu.utils";
import { AnswerEU } from "../domain.layer/frameworks/EU-AI-Act/answerEU.model";
import { sequelize } from "../database/db";
import { IProjectAttributes } from "../domain.layer/interfaces/i.project";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import logger from "../utils/logger/fileLogger";
import { hasPendingApprovalQuery } from "../utils/approvalRequest.utils";

// Helper function to get user name
async function getUserNameById(userId: number): Promise<string> {
  const result = await sequelize.query<{ name: string; surname: string }>(
    `SELECT name, surname FROM users WHERE id = :userId`,
    { replacements: { userId }, type: QueryTypes.SELECT },
  );
  if (result[0]) {
    return `${result[0].name} ${result[0].surname}`.trim();
  }
  return "Someone";
}

async function notifyEuAiActControlAssignment(
  req: Request | RequestWithFile,
  controlId: number,
  roleType: AssignmentRoleType,
  newUserId: number,
  oldUserId: number | null | undefined,
  projectId?: number,
): Promise<void> {
  if (!newUserId || newUserId === oldUserId) return;

  const assignerName = await getUserNameById(req.userId!);
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  const controlResult = await sequelize.query<{
    title: string;
    description: string;
    order_no: number;
  }>(
    `SELECT cs.title, cs.description, cs.order_no
     FROM controls_eu c
     JOIN controls_struct_eu cs ON c.control_meta_id = cs.id
     WHERE c.organization_id = :organizationId AND c.id = :controlId`,
    {
      replacements: { organizationId: req.organizationId!, controlId },
      type: QueryTypes.SELECT,
    },
  );

  const controlMeta = controlResult[0];
  const entityName = controlMeta
    ? `${controlMeta.order_no} ${controlMeta.title}`
    : `Control #${controlId}`;
  const description = controlMeta?.description;

  let projectName: string | undefined;
  if (projectId) {
    const projectResult = await sequelize.query<{ project_title: string }>(
      `SELECT project_title FROM projects WHERE organization_id = :organizationId AND id = :projectId`,
      {
        replacements: { organizationId: req.organizationId!, projectId },
        type: QueryTypes.SELECT,
      },
    );
    projectName = projectResult[0]?.project_title;
  }

  const urlPath = projectId
    ? `/project-view?projectId=${projectId}&tab=frameworks&framework=eu-ai-act&subtab=compliance&controlId=${controlId}`
    : `/project-view`;

  notifyUserAssigned(
    req.organizationId!,
    newUserId,
    {
      entityType: "eu_control",
      entityId: controlId,
      entityName,
      roleType,
      entityUrl: `${baseUrl}${urlPath}`,
    },
    assignerName,
    baseUrl,
    {
      frameworkName: "EU AI Act",
      projectName,
      description,
    },
  ).catch((err) => console.error(`Failed to send ${roleType} notification:`, err));
}

export async function getAssessmentsByProjectId(req: Request, res: Response): Promise<any> {
  const projectFrameworkId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
  );
  logProcessing({
    description: `starting getAssessmentsByProjectId for project framework ID ${projectFrameworkId}`,
    functionName: "getAssessmentsByProjectId",
    fileName: "eu.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(`🔍 Fetching assessments for project framework ID ${projectFrameworkId}`);

  try {
    const assessments = await getAssessmentsEUByProjectIdQuery(
      projectFrameworkId,
      req.organizationId!,
    );

    await logSuccess({
      eventType: "Read",
      description: `Retrieved assessments for project framework ID ${projectFrameworkId}`,
      functionName: "getAssessmentsByProjectId",
      fileName: "eu.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    // send calculated progress
    return res.status(200).json(STATUS_CODE[200](assessments));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve assessments for project framework ID ${projectFrameworkId}`,
      functionName: "getAssessmentsByProjectId",
      fileName: "eu.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getCompliancesByProjectId(req: Request, res: Response): Promise<any> {
  const projectFrameworkId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
  );
  logProcessing({
    description: `starting getCompliancesByProjectId for project framework ID ${projectFrameworkId}`,
    functionName: "getCompliancesByProjectId",
    fileName: "eu.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(`🔍 Fetching compliances for project framework ID ${projectFrameworkId}`);

  try {
    const complainces = await getComplianceEUByProjectIdQuery(
      projectFrameworkId,
      req.organizationId!,
    );

    await logSuccess({
      eventType: "Read",
      description: `Retrieved compliances for project framework ID ${projectFrameworkId}`,
      functionName: "getCompliancesByProjectId",
      fileName: "eu.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    // send calculated progress
    return res.status(200).json(STATUS_CODE[200](complainces));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve compliances for project framework ID ${projectFrameworkId}`,
      functionName: "getCompliancesByProjectId",
      fileName: "eu.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getTopicById(req: Request, res: Response): Promise<any> {
  const topicId = parseInt(req.query.topicId as string);
  const projectFrameworkId = parseInt(req.query.projectFrameworkId as string);

  logProcessing({
    description: `starting getTopicById for topic ID ${topicId} and project framework ID ${projectFrameworkId}`,
    functionName: "getTopicById",
    fileName: "eu.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(`🔍 Looking up topic ID ${topicId} for project framework ID ${projectFrameworkId}`);

  try {
    const topic = await getTopicByIdForProjectQuery(
      topicId,
      projectFrameworkId,
      req.organizationId!,
    );

    if (topic) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved topic ID ${topicId} for project framework ID ${projectFrameworkId}`,
        functionName: "getTopicById",
        fileName: "eu.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](topic));
    }

    await logSuccess({
      eventType: "Read",
      description: `Topic not found: ID ${topicId} for project framework ID ${projectFrameworkId}`,
      functionName: "getTopicById",
      fileName: "eu.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404](topic));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve topic ID ${topicId} for project framework ID ${projectFrameworkId}`,
      functionName: "getTopicById",
      fileName: "eu.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getControlById(req: Request, res: Response): Promise<any> {
  const controlId = parseInt(req.query.controlId as string);
  const projectFrameworkId = parseInt(req.query.projectFrameworkId as string);
  const owner = req.query.owner ? parseInt(req.query.owner as string) : undefined;
  const approver = req.query.approver ? parseInt(req.query.approver as string) : undefined;
  const dueDateFilter = req.query.dueDateFilter
    ? parseInt(req.query.dueDateFilter as string)
    : undefined;

  logProcessing({
    description: `starting getControlById for control ID ${controlId} and project framework ID ${projectFrameworkId}`,
    functionName: "getControlById",
    fileName: "eu.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `🔍 Looking up control ID ${controlId} for project framework ID ${projectFrameworkId}`,
  );

  try {
    const topic = await getControlByIdForProjectQuery(
      controlId,
      projectFrameworkId,
      owner,
      approver,
      dueDateFilter,
      req.organizationId!,
    );

    if (topic) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved control ID ${controlId} for project framework ID ${projectFrameworkId}`,
        functionName: "getControlById",
        fileName: "eu.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](topic));
    }

    await logSuccess({
      eventType: "Read",
      description: `Control not found: ID ${controlId} for project framework ID ${projectFrameworkId}`,
      functionName: "getControlById",
      fileName: "eu.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404](topic));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve control ID ${controlId} for project framework ID ${projectFrameworkId}`,
      functionName: "getControlById",
      fileName: "eu.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function saveControls(req: RequestWithFile, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();
  const controlId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting saveControls for control ID ${controlId}`,
    functionName: "saveControls",
    fileName: "eu.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(`💾 Saving controls for control ID ${controlId}`);

  try {
    const Control = req.body as ControlEU & {
      subControls: string;
      user_id: number;
      project_id: number;
      delete: string;
    };

    // Check for pending approval
    if (Control.project_id) {
      const hasPendingApproval = await hasPendingApprovalQuery(
        Control.project_id,
        "use_case",
        req.organizationId!,
        transaction,
      );

      if (hasPendingApproval) {
        await transaction.rollback();
        await logFailure({
          eventType: "Update",
          description: `Cannot save controls for project with pending approval: project ID ${Control.project_id}, control ID ${controlId}`,
          functionName: "saveControls",
          fileName: "eu.ctrl.ts",
          error: new Error("Project has pending approval and controls cannot be modified"),
          userId: req.userId!,
          tenantId: req.organizationId!,
        });
        return res
          .status(403)
          .json(
            STATUS_CODE[403](
              "This use case has a pending approval request. Controls cannot be modified until the approval process is complete.",
            ),
          );
      }
    }

    const currentControlResult = (await sequelize.query(
      `SELECT owner, reviewer, approver FROM controls_eu
       WHERE organization_id = :organizationId AND id = :id;`,
      {
        replacements: { organizationId: req.organizationId!, id: controlId },
        transaction,
        type: QueryTypes.SELECT,
      },
    )) as { owner: number | null; reviewer: number | null; approver: number | null }[];
    const currentControl = currentControlResult[0] || {
      owner: null,
      reviewer: null,
      approver: null,
    };

    const toUserIdOrNull = (v: unknown): number | null => {
      if (v === undefined || v === null || v === "") return null;
      const n = Number(v);
      return Number.isInteger(n) && n > 0 ? n : null;
    };
    const blankToNull = <T>(v: T): T | null => (v === "" || v === undefined ? null : v);

    const newOwner = toUserIdOrNull(Control.owner);
    const newReviewer = toUserIdOrNull(Control.reviewer);
    const newApprover = toUserIdOrNull(Control.approver);
    const newDueDate = blankToNull(Control.due_date);
    const newRiskReview = blankToNull(Control.risk_review) as
      | "Acceptable risk"
      | "Residual risk"
      | "Unacceptable risk"
      | null;

    const candidateAssigneeIds = [newOwner, newReviewer, newApprover].filter(
      (id): id is number => id !== null,
    );
    if (candidateAssigneeIds.length > 0) {
      const invalidIds = await findUsersNotInOrganization(
        candidateAssigneeIds,
        req.organizationId!,
        transaction,
      );
      if (invalidIds.length > 0) {
        await transaction.rollback();
        await logFailure({
          eventType: "Update",
          description: `Rejected control save: assignee user IDs not in organization — ${invalidIds.join(", ")}`,
          functionName: "saveControls",
          fileName: "eu.ctrl.ts",
          error: new Error("Invalid assignee"),
          userId: req.userId!,
          tenantId: req.organizationId!,
        });
        return res
          .status(400)
          .json(
            STATUS_CODE[400](
              `User${invalidIds.length === 1 ? "" : "s"} ${invalidIds.join(", ")} ${invalidIds.length === 1 ? "is" : "are"} not part of this organization and cannot be assigned.`,
            ),
          );
      }
    }

    const filesToUnlink = JSON.parse(Control.delete || "[]") as number[];

    const subControlResp: any[] = [];

    if (Control.subControls) {
      for (const subcontrol of JSON.parse(Control.subControls)) {
        const evidenceFiles = ((req.files as UploadedFile[]) || []).filter(
          (f) => f.fieldname === `evidence_files_${parseInt(subcontrol.id)}`,
        );
        const feedbackFiles = ((req.files as UploadedFile[]) || []).filter(
          (f) => f.fieldname === `feedback_files_${parseInt(subcontrol.id)}`,
        );

        let evidenceUploadedFiles: FileType[] = [];
        for (let f of evidenceFiles) {
          const evidenceUploadedFile = await uploadFile(
            f,
            Control.user_id,
            Control.project_id,
            "Compliance tracker group",
            req.organizationId!,
            transaction,
          );
          evidenceUploadedFiles.push({
            id: evidenceUploadedFile.id!.toString(),
            fileName: evidenceUploadedFile.filename,
            project_id: evidenceUploadedFile.project_id,
            uploaded_by: evidenceUploadedFile.uploaded_by,
            uploaded_time: evidenceUploadedFile.uploaded_time,
            type: evidenceUploadedFile.type,
            source: evidenceUploadedFile.source,
          });
        }

        let feedbackUploadedFiles: FileType[] = [];
        for (let f of feedbackFiles) {
          const feedbackUploadedFile = await uploadFile(
            f,
            Control.user_id,
            Control.project_id,
            "Compliance tracker group",
            req.organizationId!,
            transaction,
          );
          feedbackUploadedFiles.push({
            id: feedbackUploadedFile.id!.toString(),
            fileName: feedbackUploadedFile.filename,
            project_id: feedbackUploadedFile.project_id,
            uploaded_by: feedbackUploadedFile.uploaded_by,
            uploaded_time: feedbackUploadedFile.uploaded_time,
            type: feedbackUploadedFile.type,
            source: feedbackUploadedFile.source,
          });
        }

        const subcontrolToSave: any = await updateSubcontrolEUByIdQuery(
          subcontrol.id!,
          {
            status: (subcontrol.status || undefined) as
              | "Waiting"
              | "In progress"
              | "Done"
              | undefined,
            implementation_details: subcontrol.implementation_details,
            evidence_description: subcontrol.evidence_description,
            feedback_description: subcontrol.feedback_description,
            risksDelete: subcontrol.risksDelete,
            risksMitigated: subcontrol.risksMitigated,
          },
          evidenceUploadedFiles,
          feedbackUploadedFiles,
          filesToUnlink,
          req.organizationId!,
          transaction,
        );
        if (subcontrolToSave) {
          subControlResp.push(subcontrolToSave);
        }
      }
    }

    const subStatusRows = (await sequelize.query(
      `SELECT status FROM subcontrols_eu
       WHERE organization_id = :organizationId AND control_id = :controlId;`,
      {
        replacements: { organizationId: req.organizationId!, controlId },
        transaction,
        type: QueryTypes.SELECT,
      },
    )) as { status: "Waiting" | "In progress" | "Done" | null }[];
    const derivedStatus = deriveControlStatus(subStatusRows.map((r) => r.status));

    const updatedControl = await updateControlEUByIdQuery(
      controlId,
      {
        owner: newOwner,
        reviewer: newReviewer,
        approver: newApprover,
        due_date: newDueDate,
        risk_review: newRiskReview,
        status: derivedStatus,
      },
      req.organizationId!,
      transaction,
    );

    const response = {
      control: updatedControl,
      subControls: subControlResp,
    };
    await updateProjectUpdatedByIdQuery(controlId, "controls", req.organizationId!, transaction);
    await transaction.commit();

    const roleChanges: Array<{
      roleType: AssignmentRoleType;
      newUserId: number | null;
      oldUserId: number | null;
    }> = [
      { roleType: "Owner", newUserId: newOwner, oldUserId: currentControl.owner },
      { roleType: "Reviewer", newUserId: newReviewer, oldUserId: currentControl.reviewer },
      { roleType: "Approver", newUserId: newApprover, oldUserId: currentControl.approver },
    ];
    for (const change of roleChanges) {
      if (change.newUserId) {
        notifyEuAiActControlAssignment(
          req,
          controlId,
          change.roleType,
          change.newUserId,
          change.oldUserId,
          Control.project_id,
        );
      }
    }

    await logSuccess({
      eventType: "Update",
      description: `Successfully saved controls for control ID ${controlId}`,
      functionName: "saveControls",
      fileName: "eu.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200]({ response }));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `Failed to save controls for control ID ${controlId}`,
      functionName: "saveControls",
      fileName: "eu.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateQuestionById(req: RequestWithFile, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();
  const questionId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting updateQuestionById for question ID ${questionId}`,
    functionName: "updateQuestionById",
    fileName: "eu.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(`✏️ Updating question ID ${questionId}`);

  try {
    const body: Partial<
      AnswerEU & {
        risksDelete: number[];
        risksMitigated: number[];
        user_id: string | number;
        project_id: string | number;
        delete: string;
      }
    > = req.body;

    // Get project ID and check for pending approval
    const projectId =
      typeof body.project_id === "string" ? parseInt(body.project_id) : (body.project_id as number);

    if (projectId) {
      const hasPendingApproval = await hasPendingApprovalQuery(
        projectId,
        "use_case",
        req.organizationId!,
        transaction,
      );

      if (hasPendingApproval) {
        await transaction.rollback();
        await logFailure({
          eventType: "Update",
          description: `Cannot update question for project with pending approval: project ID ${projectId}, question ID ${questionId}`,
          functionName: "updateQuestionById",
          fileName: "eu.ctrl.ts",
          error: new Error("Project has pending approval and assessments cannot be modified"),
          userId: req.userId!,
          tenantId: req.organizationId!,
        });
        return res
          .status(403)
          .json(
            STATUS_CODE[403](
              "This use case has a pending approval request. Assessments cannot be modified until the approval process is complete.",
            ),
          );
      }
    }

    // Files to unlink (not delete) - the actual file stays in file manager
    // This allows the same file to be used as evidence in multiple places
    const filesToUnlink = JSON.parse(body.delete || "[]") as number[];

    // Handle file uploads
    // Normalize req.files to always be an array
    // Multer's upload.any() returns an array, but we need to handle it safely
    let filesArray: UploadedFile[] = [];
    if (req.files) {
      if (Array.isArray(req.files)) {
        filesArray = req.files as UploadedFile[];
      } else {
        // If it's an object (key-value pairs), flatten all file arrays into one array
        const filesObject = req.files as { [key: string]: UploadedFile[] };
        filesArray = Object.values(filesObject).flat();
      }
    }

    // Debug: Log what we received
    logger.debug(`📦 Received files: ${filesArray.length}`);
    filesArray.forEach((f, idx) => {
      logger.debug(`  File ${idx}: fieldname="${f.fieldname}", originalname="${f.originalname}"`);
    });

    const evidenceFiles = filesArray.filter((f) => f.fieldname === "files");

    logger.debug(`📋 Filtered evidence files (fieldname="files"): ${evidenceFiles.length}`);

    let uploadedFiles: FileType[] = [];
    const userId =
      typeof body.user_id === "string" ? parseInt(body.user_id) : (body.user_id as number);
    // projectId already declared above for pending approval check

    logger.debug(
      `👤 userId: ${userId}, projectId: ${projectId}, evidenceFiles.length: ${evidenceFiles.length}`,
    );

    if (userId && projectId && evidenceFiles.length > 0) {
      logger.debug(`📤 Uploading ${evidenceFiles.length} file(s) for question ID ${questionId}`);
      for (let f of evidenceFiles) {
        const uploadedFile = await uploadFile(
          f,
          userId,
          projectId,
          "Assessment tracker group",
          req.organizationId!,
          transaction,
        );

        if (!uploadedFile || !uploadedFile.id) {
          logger.error(`❌ Failed to upload file: ${f.originalname}`);
          continue;
        }

        // Convert uploaded_time to ISO string if it's a Date object
        const uploadedTime =
          uploadedFile.uploaded_time instanceof Date
            ? uploadedFile.uploaded_time.toISOString()
            : uploadedFile.uploaded_time;

        uploadedFiles.push({
          id: uploadedFile.id!.toString(),
          fileName: uploadedFile.filename,
          project_id: uploadedFile.project_id,
          uploaded_by: uploadedFile.uploaded_by,
          uploaded_time: uploadedTime,
          type: uploadedFile.type || "application/octet-stream",
          source: uploadedFile.source || "Assessment tracker group",
        });

        logger.debug(
          `✅ File uploaded successfully: ${uploadedFile.filename} (ID: ${uploadedFile.id})`,
        );
      }
      logger.debug(`📦 Total uploaded files: ${uploadedFiles.length}`);
    } else {
      logger.debug(
        `⚠️ Skipping file upload - userId: ${userId}, projectId: ${projectId}, evidenceFiles.length: ${evidenceFiles.length}`,
      );
    }

    // Prepare the update body
    const updateBody: Partial<
      AnswerEU & {
        risksDelete: number[];
        risksMitigated: number[];
        delete?: number[];
        evidence_files?: FileType[];
      }
    > = {
      answer: body.answer,
      status: body.status,
      risksDelete: JSON.parse((body.risksDelete as any) || "[]") || [],
      risksMitigated: JSON.parse((body.risksMitigated as any) || "[]") || [],
      delete: filesToUnlink, // Pass deleted files to query function
    };

    // Always set evidence_files if there are file operations (upload or delete)
    // This ensures the file operations are processed even if only deletions
    if (uploadedFiles.length > 0 || filesToUnlink.length > 0) {
      updateBody.evidence_files = uploadedFiles; // Will be empty array if no uploads, but delete will still be processed
      logger.debug(
        `📋 Setting evidence_files in updateBody: ${uploadedFiles.length} files, ${filesToUnlink.length} deletions`,
      );
    } else {
      logger.debug(
        `⚠️ No file operations - uploadedFiles: ${uploadedFiles.length}, filesToUnlink: ${filesToUnlink.length}`,
      );
    }

    const question = (await updateQuestionEUByIdQuery(
      questionId,
      updateBody,
      req.organizationId!,
      transaction,
    )) as AnswerEU;

    if (!question) {
      await transaction.rollback();
      await logFailure({
        eventType: "Update",
        description: `Question not found: ID ${questionId}`,
        functionName: "updateQuestionById",
        fileName: "eu.ctrl.ts",
        error: new Error("Question not found"),
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    // Update the project's last updated date
    await updateProjectUpdatedByIdQuery(questionId, "answers", req.organizationId!, transaction);
    await transaction.commit();

    await logSuccess({
      eventType: "Update",
      description: `Successfully updated question ID ${questionId}`,
      functionName: "updateQuestionById",
      fileName: "eu.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(202).json(STATUS_CODE[202](question));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `Failed to update question ID ${questionId}`,
      functionName: "updateQuestionById",
      fileName: "eu.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteAssessmentsByProjectId(req: Request, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();
  const projectFrameworkId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
  );

  logProcessing({
    description: `starting deleteAssessmentsByProjectId for project framework ID ${projectFrameworkId}`,
    functionName: "deleteAssessmentsByProjectId",
    fileName: "eu.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(`🗑️ Deleting assessments for project framework ID ${projectFrameworkId}`);

  try {
    const result = await deleteAssessmentEUByProjectIdQuery(
      projectFrameworkId,
      req.organizationId!,
      transaction,
    );

    if (result) {
      await transaction.commit();
      await logSuccess({
        eventType: "Delete",
        description: `Successfully deleted assessments for project framework ID ${projectFrameworkId}`,
        functionName: "deleteAssessmentsByProjectId",
        fileName: "eu.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](result));
    }

    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete assessments for project framework ID ${projectFrameworkId}`,
      functionName: "deleteAssessmentsByProjectId",
      fileName: "eu.ctrl.ts",
      error: new Error("Delete operation failed"),
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400](result));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete assessments for project framework ID ${projectFrameworkId}`,
      functionName: "deleteAssessmentsByProjectId",
      fileName: "eu.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteCompliancesByProjectId(req: Request, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();
  const projectFrameworkId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
  );

  logProcessing({
    description: `starting deleteCompliancesByProjectId for project framework ID ${projectFrameworkId}`,
    functionName: "deleteCompliancesByProjectId",
    fileName: "eu.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(`🗑️ Deleting compliances for project framework ID ${projectFrameworkId}`);

  try {
    const result = await deleteComplianeEUByProjectIdQuery(
      projectFrameworkId,
      req.organizationId!,
      transaction,
    );

    if (result) {
      await transaction.commit();
      await logSuccess({
        eventType: "Delete",
        description: `Successfully deleted compliances for project framework ID ${projectFrameworkId}`,
        functionName: "deleteCompliancesByProjectId",
        fileName: "eu.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](result));
    }

    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete compliances for project framework ID ${projectFrameworkId}`,
      functionName: "deleteCompliancesByProjectId",
      fileName: "eu.ctrl.ts",
      error: new Error("Delete operation failed"),
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400](result));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete compliances for project framework ID ${projectFrameworkId}`,
      functionName: "deleteCompliancesByProjectId",
      fileName: "eu.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getProjectAssessmentProgress(req: Request, res: Response) {
  const projectFrameworkId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
  );

  logProcessing({
    description: `starting getProjectAssessmentProgress for project framework ID ${projectFrameworkId}`,
    functionName: "getProjectAssessmentProgress",
    fileName: "eu.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(`📊 Calculating assessment progress for project framework ID ${projectFrameworkId}`);

  try {
    // const project = await getProjectByIdQuery(projectId);
    // if (project) {

    // } else {
    //   return res.status(404).json(STATUS_CODE[404](project));
    // }
    const { totalAssessments, answeredAssessments } = await countAnswersEUByProjectId(
      projectFrameworkId,
      req.organizationId!,
    );

    await logSuccess({
      eventType: "Read",
      description: `Retrieved assessment progress for project framework ID ${projectFrameworkId}`,
      functionName: "getProjectAssessmentProgress",
      fileName: "eu.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(
      STATUS_CODE[200]({
        totalQuestions: parseInt(totalAssessments),
        answeredQuestions: parseInt(answeredAssessments),
      }),
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to get assessment progress for project framework ID ${projectFrameworkId}`,
      functionName: "getProjectAssessmentProgress",
      fileName: "eu.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getProjectComplianceProgress(req: Request, res: Response) {
  const projectFrameworkId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
  );

  logProcessing({
    description: `starting getProjectComplianceProgress for project framework ID ${projectFrameworkId}`,
    functionName: "getProjectComplianceProgress",
    fileName: "eu.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(`📊 Calculating compliance progress for project framework ID ${projectFrameworkId}`);

  try {
    // const project = await getProjectByIdQuery(projectId);
    // if (project) {

    // } else {
    //   return res.status(404).json(STATUS_CODE[404](project));
    // }
    const { totalSubcontrols, doneSubcontrols } = await countSubControlsEUByProjectId(
      projectFrameworkId,
      req.organizationId!,
    );

    await logSuccess({
      eventType: "Read",
      description: `Retrieved compliance progress for project framework ID ${projectFrameworkId}`,
      functionName: "getProjectComplianceProgress",
      fileName: "eu.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(
      STATUS_CODE[200]({
        allsubControls: parseInt(totalSubcontrols),
        allDonesubControls: parseInt(doneSubcontrols),
      }),
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to get compliance progress for project framework ID ${projectFrameworkId}`,
      functionName: "getProjectComplianceProgress",
      fileName: "eu.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAllProjectsAssessmentProgress(req: Request, res: Response) {
  let totalNumberOfQuestions = 0;
  let totalNumberOfAnsweredQuestions = 0;

  logProcessing({
    description: "starting getAllProjectsAssessmentProgress",
    functionName: "getAllProjectsAssessmentProgress",
    fileName: "eu.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug("📊 Calculating assessment progress across all projects");

  try {
    const { userId, role } = req;
    if (!userId || !role) {
      await logFailure({
        eventType: "Read",
        description: "Unauthorized access attempt for getAllProjectsAssessmentProgress",
        functionName: "getAllProjectsAssessmentProgress",
        fileName: "eu.ctrl.ts",
        error: new Error("Unauthorized"),
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(401).json({ message: "Unauthorized" });
    }

    const projects = await getAllProjectsQuery({ userId, role }, req.organizationId!);
    if (projects && projects.length > 0) {
      await Promise.all(
        projects.map(async (project) => {
          // calculating assessments
          const projectFrameworkId = (
            project as unknown as { dataValues: IProjectAttributes }
          ).dataValues.framework
            ?.filter((f) => f.framework_id === 1)
            .map((f) => f.project_framework_id)[0];
          if (!projectFrameworkId) {
            return;
          }
          const { totalAssessments, answeredAssessments } = await countAnswersEUByProjectId(
            projectFrameworkId,
            req.organizationId!,
          );
          totalNumberOfQuestions += parseInt(totalAssessments);
          totalNumberOfAnsweredQuestions += parseInt(answeredAssessments);
        }),
      );

      await logSuccess({
        eventType: "Read",
        description: `Retrieved assessment progress across ${projects.length} projects`,
        functionName: "getAllProjectsAssessmentProgress",
        fileName: "eu.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      return res.status(200).json(
        STATUS_CODE[200]({
          totalQuestions: totalNumberOfQuestions,
          answeredQuestions: totalNumberOfAnsweredQuestions,
        }),
      );
    } else {
      await logSuccess({
        eventType: "Read",
        description: "No projects found for assessment progress calculation",
        functionName: "getAllProjectsAssessmentProgress",
        fileName: "eu.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](projects));
    }
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to get assessment progress across all projects",
      functionName: "getAllProjectsAssessmentProgress",
      fileName: "eu.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAllProjectsComplianceProgress(req: Request, res: Response) {
  let totalNumberOfSubcontrols = 0;
  let totalNumberOfDoneSubcontrols = 0;

  logProcessing({
    description: "starting getAllProjectsComplianceProgress",
    functionName: "getAllProjectsComplianceProgress",
    fileName: "eu.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug("📊 Calculating compliance progress across all projects");

  try {
    const { userId, role } = req;
    if (!userId || !role) {
      await logFailure({
        eventType: "Read",
        description: "Unauthorized access attempt for getAllProjectsComplianceProgress",
        functionName: "getAllProjectsComplianceProgress",
        fileName: "eu.ctrl.ts",
        error: new Error("Unauthorized"),
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(401).json({ message: "Unauthorized" });
    }

    const projects = await getAllProjectsQuery({ userId, role }, req.organizationId!);
    if (projects && projects.length > 0) {
      await Promise.all(
        projects.map(async (project) => {
          // [0] assuming that the project has only one EU framework (if it has))
          const projectFrameworkId = (
            project as unknown as { dataValues: IProjectAttributes }
          ).dataValues.framework
            ?.filter((f) => f.framework_id === 1)
            .map((f) => f.project_framework_id)[0];
          if (!projectFrameworkId) {
            return;
          }
          const { totalSubcontrols, doneSubcontrols } = await countSubControlsEUByProjectId(
            projectFrameworkId,
            req.organizationId!,
          );
          totalNumberOfSubcontrols += parseInt(totalSubcontrols);
          totalNumberOfDoneSubcontrols += parseInt(doneSubcontrols);
        }),
      );

      await logSuccess({
        eventType: "Read",
        description: `Retrieved compliance progress across ${projects.length} projects`,
        functionName: "getAllProjectsComplianceProgress",
        fileName: "eu.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      return res.status(200).json(
        STATUS_CODE[200]({
          allsubControls: totalNumberOfSubcontrols,
          allDonesubControls: totalNumberOfDoneSubcontrols,
        }),
      );
    } else {
      await logSuccess({
        eventType: "Read",
        description: "No projects found for compliance progress calculation",
        functionName: "getAllProjectsComplianceProgress",
        fileName: "eu.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](projects));
    }
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to get compliance progress across all projects",
      functionName: "getAllProjectsComplianceProgress",
      fileName: "eu.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAllControlCategories(req: Request, res: Response): Promise<any> {
  const projectFrameworkIdRaw = req.query.projectFrameworkId as string | undefined;
  const projectFrameworkId = projectFrameworkIdRaw ? parseInt(projectFrameworkIdRaw) : undefined;

  logProcessing({
    description: `starting getAllControlCategories${projectFrameworkId ? ` (filtered by projectFrameworkId=${projectFrameworkId})` : ""}`,
    functionName: "getAllControlCategories",
    fileName: "eu.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug("🔍 Fetching all control categories");

  try {
    let controlCategories = await getAllControlCategoriesQuery(req.organizationId!);

    if (projectFrameworkId && !isNaN(projectFrameworkId)) {
      const visibleIds = await getVisibleEuCategoryIdsForProject(
        projectFrameworkId,
        req.organizationId!,
      );
      const allowed = new Set(visibleIds);
      controlCategories = (controlCategories as any[]).filter((cc: any) =>
        allowed.has(cc.id),
      ) as typeof controlCategories;
    }

    await logSuccess({
      eventType: "Read",
      description: "Retrieved all control categories",
      functionName: "getAllControlCategories",
      fileName: "eu.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(controlCategories);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve control categories",
      functionName: "getAllControlCategories",
      fileName: "eu.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getControlsByControlCategoryId(req: Request, res: Response): Promise<any> {
  const controlCategoryId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
  );
  const projectFrameworkId = parseInt(req.query.projectFrameworkId as string);
  const owner =
    req.query.owner && req.query.owner !== "" ? parseInt(req.query.owner as string) : undefined;
  const approver =
    req.query.approver && req.query.approver !== ""
      ? parseInt(req.query.approver as string)
      : undefined;
  const dueDateFilter =
    req.query.dueDateFilter && req.query.dueDateFilter !== ""
      ? parseInt(req.query.dueDateFilter as string)
      : undefined;

  logProcessing({
    description: `starting getControlsByControlCategoryId for control category ID ${controlCategoryId} and project framework ID ${projectFrameworkId}`,
    functionName: "getControlsByControlCategoryId",
    fileName: "eu.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `🔍 Fetching controls for control category ID ${controlCategoryId} and project framework ID ${projectFrameworkId}`,
  );

  try {
    const controls = await getControlStructByControlCategoryIdForAProjectQuery(
      controlCategoryId,
      projectFrameworkId,
      owner,
      approver,
      dueDateFilter,
      req.organizationId!,
    );

    await logSuccess({
      eventType: "Read",
      description: `Retrieved controls for control category ID ${controlCategoryId} and project framework ID ${projectFrameworkId}`,
      functionName: "getControlsByControlCategoryId",
      fileName: "eu.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(controls);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve controls for control category ID ${controlCategoryId} and project framework ID ${projectFrameworkId}`,
      functionName: "getControlsByControlCategoryId",
      fileName: "eu.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAllTopics(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getAllTopics",
    functionName: "getAllTopics",
    fileName: "eu.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug("🔍 Fetching all topics");

  try {
    const topics = await getAllTopicsQuery(req.organizationId!);

    await logSuccess({
      eventType: "Read",
      description: "Retrieved all topics",
      functionName: "getAllTopics",
      fileName: "eu.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(topics);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve topics",
      functionName: "getAllTopics",
      fileName: "eu.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
