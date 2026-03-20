import { Request, Response } from "express";
import { QueryTypes } from "sequelize";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { notifyUserAssigned, AssignmentRoleType } from "../services/inAppNotification.service";
import {
  getAllNISTAIRMFSubcategoriesBycategoryIdAndtitleQuery,
  getNISTAIRMFSubcategoryByIdQuery,
  getNISTAIRMFSubcategoryRisksQuery,
  updateNISTAIRMFSubcategoryByIdQuery,
  updateNISTAIRMFSubcategoryStatusByIdQuery,
  countNISTAIRMFSubcategoriesProgress,
  countNISTAIRMFSubcategoriesAssignments,
  countNISTAIRMFSubcategoriesAssignmentsByFunction,
  countNISTAIRMFSubcategoriesProgressByFunction,
  getNISTAIRMFSubcategoriesStatusBreakdown,
  getNISTAIRMFDashboardOverview,
} from "../utils/nist_ai_rmf.subcategory.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logEvent } from "../utils/logger/dbLogger";
import { sequelize } from "../database/db";
import { NISTAIMRFSubcategoryModel } from "../domain.layer/frameworks/NIST-AI-RMF/nist_ai_rmf_subcategory.model";
import {
  logFailure,
  logProcessing,
  logSuccess,
} from "../utils/logger/logHelper";
import { uploadFile } from "../utils/fileUpload.utils";
import { UploadedFile, RequestWithFile } from "../utils/question.utils";
import { getUserProjects } from "../utils/user.utils";

// Note: Files are only unlinked from evidence_links, not deleted from file manager
// This allows the same file to be used as evidence in multiple places

// Helper function to get user name
async function getUserNameById(userId: number): Promise<string> {
  const result = await sequelize.query<{ name: string; surname: string }>(
    `SELECT name, surname FROM users WHERE id = :userId`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  if (result[0]) {
    return `${result[0].name} ${result[0].surname}`.trim();
  }
  return "Someone";
}

// Helper function to notify assignment changes for NIST AI RMF entities
async function notifyNistAiRmfAssignment(
  req: Request | RequestWithFile,
  entityId: number,
  entityName: string,
  roleType: AssignmentRoleType,
  newUserId: number,
  oldUserId: number | null | undefined
): Promise<void> {
  // Only notify if assigned to a new user
  if (newUserId && newUserId !== oldUserId) {
    const assignerName = await getUserNameById(req.userId!);
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    // Query for function type, category info, subcategory index and description
    // Uses struct tables for hierarchy data
    const result = await sequelize.query<{ func_type: string; category_struct_id: number; category_id: number; subcategory_id: number; subcategory_description: string }>(
      `SELECT ss.function as func_type, cs.id as category_struct_id, cs.category_id, ss.subcategory_id, ss.description as subcategory_description
       FROM nist_ai_rmf_subcategories s
       JOIN nist_ai_rmf_subcategories_struct ss ON s.subcategory_meta_id = ss.id
       JOIN nist_ai_rmf_categories_struct cs ON ss.category_struct_id = cs.id
       WHERE s.organization_id = :organizationId AND s.id = :entityId`,
      { replacements: { organizationId: req.organizationId!, entityId }, type: QueryTypes.SELECT }
    );

    let urlPath: string;
    let functionName: string | undefined;
    let categoryName: string | undefined;
    let description: string | undefined;

    if (result[0]) {
      // Tabs expect lowercase: govern, map, measure, manage
      const funcType = result[0].func_type.toLowerCase();
      functionName = result[0].func_type; // Original case for display
      categoryName = `Category ${result[0].category_id}`;
      description = result[0].subcategory_description;
      // Build subcategory identifier like "GV-1.1"
      const funcAbbrev = result[0].func_type.substring(0, 2).toUpperCase();
      entityName = `${funcAbbrev}-${result[0].category_id}.${result[0].subcategory_id} ${entityName}`;
      urlPath = `/framework?framework=nist-ai-rmf&functionId=${funcType}&categoryId=${result[0].category_struct_id}&subcategoryId=${entityId}`;
    } else {
      urlPath = `/framework?framework=nist-ai-rmf&subcategoryId=${entityId}`;
    }

    notifyUserAssigned(
      req.organizationId!,
      newUserId,
      {
        entityType: "NIST AI RMF Subcategory",
        entityId,
        entityName,
        roleType,
        entityUrl: `${baseUrl}${urlPath}`,
      },
      assignerName,
      baseUrl,
      {
        frameworkName: "NIST AI RMF",
        parentType: functionName ? "Function / Category" : undefined,
        parentName: functionName && categoryName ? `${functionName} → ${categoryName}` : undefined,
        description,
      }
    ).catch((err) => console.error(`Failed to send ${roleType} notification:`, err));
  }
}

export async function getAllNISTAIRMFSubcategoriesBycategoryIdAndtitle(
  req: Request,
  res: Response
): Promise<any> {
  logStructured(
    "processing",
    "starting to get all NIST AI RMF subcategories by title",
    "getAllNISTAIRMFSubcategoriesBycategoryIdAndtitle",
    "nist_ai_rmf.subcategory.ctrl.ts"
  );
  logger.debug("🔍 Fetching all NIST AI RMF subcategories by title");
  try {
    const subcategories =
      await getAllNISTAIRMFSubcategoriesBycategoryIdAndtitleQuery(
        Number(req.params.categoryId),
        Array.isArray(req.params.title) ? req.params.title[0] : req.params.title,
        req.organizationId!
      );
    if (subcategories && subcategories.length > 0) {
      logStructured(
        "successful",
        `retrieved ${subcategories.length} NIST AI RMF subcategories by title`,
        "getAllNISTAIRMFSubcategoriesBycategoryIdAndtitle",
        "nist_ai_rmf.subcategory.ctrl.ts:"
      );
      return res.status(200).json(STATUS_CODE[200](subcategories));
    }
    logStructured(
      "error",
      "no NIST AI RMF subcategories found by title",
      "getAllNISTAIRMFSubcategoriesBycategoryIdAndtitle:",
      "nist_ai_rmf.subcategory.ctrl.ts"
    );
    return res.status(404).json(STATUS_CODE[404](subcategories));
  } catch (error) {
    await logEvent(
      "Error",
      `Failed to retrieve NIST AI RMF subcategories by category id and title: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    logger.error(
      "❌ Error in getAllNISTAIRMFSubcategoriesBycategoryIdAndtitle:",
      error
    );
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getNISTAIRMFSubcategoryById(
  req: Request,
  res: Response
): Promise<any> {
  logStructured(
    "processing",
    "starting to get NIST AI RMF subcategory by id",
    "getNISTAIRMFSubcategoryByIdQuery",
    "nist_ai_rmf.subcategory.ctrl.ts"
  );
  logger.debug("🔍 Fetching NIST AI RMF subcategory by id");
  try {
    const subcategory = await getNISTAIRMFSubcategoryByIdQuery(
      Number(req.params.id),
      req.organizationId!
    );
    if (subcategory) {
      logStructured(
        "successful",
        "NIST AI RMF subcategory found by id",
        "getNISTAIRMFSubcategoryByIdQuery",
        "nist_ai_rmf.subcategory.ctrl.ts"
      );
      return res.status(200).json(STATUS_CODE[200](subcategory));
    }
    logStructured(
      "error",
      "NIST AI RMF subcategory not found by id",
      "getNISTAIRMFSubcategoryByIdQuery",
      "nist_ai_rmf.subcategory.ctrl.ts"
    );
    return res.status(404).json(STATUS_CODE[404](subcategory));
  } catch (error) {
    await logEvent(
      "Error",
      `Failed to retrieve NIST AI RMF subcategory by id: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
  }
}

/**
 * Get all risks linked to a NIST AI RMF subcategory
 */
export async function getNISTAIRMFSubcategoryRisks(
  req: Request,
  res: Response
): Promise<any> {
  const subcategoryId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getNISTAIRMFSubcategoryRisks for subcategory ID ${subcategoryId}`,
    functionName: "getNISTAIRMFSubcategoryRisks",
    fileName: "nist_ai_rmf.subcategory.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `🔍 Fetching risks for NIST AI RMF subcategory ${subcategoryId}`
  );

  try {
    const risks = await getNISTAIRMFSubcategoryRisksQuery(
      subcategoryId,
      req.organizationId!
    );

    await logSuccess({
      eventType: "Read",
      description: `Successfully retrieved ${risks.length} risks for NIST AI RMF subcategory ${subcategoryId}`,
      functionName: "getNISTAIRMFSubcategoryRisks",
      fileName: "nist_ai_rmf.subcategory.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json({
      message: "Risks retrieved successfully",
      data: risks,
    });
  } catch (error) {
    await logEvent(
      "Error",
      `Failed to get NIST AI RMF subcategory risks: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    await logFailure({
      eventType: "Read",
      description: `Failed to get NIST AI RMF subcategory risks: ${(error as Error).message}`,
      functionName: "getNISTAIRMFSubcategoryRisks",
      fileName: "nist_ai_rmf.subcategory.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateNISTAIRMFSubcategoryById(
  req: RequestWithFile,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const subcategoryId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting updateNISTAIRMFSubcategoryById for subcategory ID ${subcategoryId}`,
    functionName: "updateNISTAIRMFSubcategoryById",
    fileName: "nist_ai_rmf.subcategory.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(`💾 Updating NIST AI RMF subcategory by id ${subcategoryId}`);

  try {
    const subcategory = req.body as Partial<NISTAIMRFSubcategoryModel> & {
      user_id?: string;
      delete?: string;
      project_id?: string;
      tags?: string | string[]; // Tags come as JSON string from FormData
      risksDelete?: string; // JSON string of risk IDs to delete
      risksMitigated?: string; // JSON string of risk IDs to add
    };

    // Get current subcategory data for assignment change detection
    // Join with struct table to get description (used as title for display)
    const currentSubcategoryResult = (await sequelize.query(
      `SELECT s.owner, s.reviewer, s.approver, ss.description as title
       FROM nist_ai_rmf_subcategories s
       LEFT JOIN nist_ai_rmf_subcategories_struct ss ON s.subcategory_meta_id = ss.id
       WHERE s.organization_id = :organizationId AND s.id = :id;`,
      {
        replacements: { organizationId: req.organizationId!, id: subcategoryId },
        transaction,
        type: QueryTypes.SELECT,
      }
    )) as { owner: number | null; reviewer: number | null; approver: number | null; title: string }[];

    const currentData = currentSubcategoryResult[0] || { owner: null, reviewer: null, approver: null, title: '' };

    // Parse tags from JSON string if present
    if (subcategory.tags && typeof subcategory.tags === "string") {
      try {
        (subcategory as any).tags = JSON.parse(subcategory.tags) as string[];
      } catch (error) {
        // If parsing fails, treat as empty array
        (subcategory as any).tags = [];
      }
    }

    // Parse deleted files if present - convert to numbers for database deletion
    // Files to unlink (not delete) - the actual file stays in file manager
    const filesToUnlink = subcategory.delete
      ? ((JSON.parse(subcategory.delete || "[]") as (string | number)[])
        .map((id) => (typeof id === "string" ? parseInt(id, 10) : id))
        .filter((id) => !isNaN(id)) as number[])
      : [];

    // Get user's project ID for file uploads
    let userProjectId = 1; // Default fallback
    try {
      const userProjects = await getUserProjects(
        Number(req.userId),
        req.organizationId!
      );
      if (userProjects && userProjects.length > 0) {
        userProjectId = userProjects[0].id!; // Use first project user has access to
      }
    } catch (error) {
      logger.warn("Could not fetch user projects, using default project ID 1");
    }

    // Handle file uploads
    let uploadedFiles: {
      id: string;
      fileName: string;
      project_id?: number;
      uploaded_by: number;
      uploaded_time: string;
      type: string;
      source: string;
    }[] = [];

    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      for (const file of req.files as UploadedFile[]) {
        const uploadedFile = await uploadFile(
          file,
          subcategory.user_id
            ? parseInt(subcategory.user_id)
            : Number(req.userId),
          subcategory.project_id
            ? parseInt(subcategory.project_id)
            : userProjectId,
          "Main clauses group",
          req.organizationId!,
          transaction
        );

        uploadedFiles.push({
          id: uploadedFile.id!.toString(),
          fileName: uploadedFile.filename,
          project_id: uploadedFile.project_id,
          uploaded_by: uploadedFile.uploaded_by,
          uploaded_time: uploadedFile.uploaded_time.toISOString().split("T")[0], // Simple date format
          type: uploadedFile.type || "application/octet-stream",
          source: uploadedFile.source || "Main clauses group",
        });
      }
    }

    // Convert file IDs to strings for evidence_links filtering (evidence_links stores IDs as strings)
    const filesToUnlinkAsStrings = filesToUnlink.map((id) => id.toString());

    const updatedSubcategory = await updateNISTAIRMFSubcategoryByIdQuery(
      subcategoryId,
      {
        ...subcategory,
        risksDelete: subcategory.risksDelete,
        risksMitigated: subcategory.risksMitigated,
      },
      uploadedFiles,
      filesToUnlinkAsStrings,
      req.organizationId!,
      transaction
    );

    await transaction.commit();

    // Notify owner, reviewer, approver if changed
    const entityName = currentData.title || `Subcategory #${subcategoryId}`;
    const newOwner = subcategory.owner ? parseInt(String(subcategory.owner)) : null;
    const newReviewer = subcategory.reviewer ? parseInt(String(subcategory.reviewer)) : null;
    const newApprover = subcategory.approver ? parseInt(String(subcategory.approver)) : null;

    if (newOwner) {
      notifyNistAiRmfAssignment(req, subcategoryId, entityName, "Owner", newOwner, currentData.owner);
    }
    if (newReviewer) {
      notifyNistAiRmfAssignment(req, subcategoryId, entityName, "Reviewer", newReviewer, currentData.reviewer);
    }
    if (newApprover) {
      notifyNistAiRmfAssignment(req, subcategoryId, entityName, "Approver", newApprover, currentData.approver);
    }

    await logEvent(
      "Update",
      `NIST AI RMF subcategory updated: ID ${subcategoryId}`,
      req.userId!,
      req.organizationId!
    );
    logStructured(
      "successful",
      `NIST AI RMF subcategory updated: ID ${subcategoryId}`,
      "updateNISTAIRMFSubcategoryById",
      "nist_ai_rmf.subcategory.ctrl.ts"
    );
    await logSuccess({
      eventType: "Update",
      description: `Successfully updated NIST AI RMF subcategory by id: ${subcategoryId}`,
      functionName: "updateNISTAIRMFSubcategoryById",
      fileName: "nist_ai_rmf.subcategory.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](updatedSubcategory));
  } catch (error) {
    await transaction.rollback();
    await logEvent(
      "Error",
      `Failed to update NIST AI RMF subcategory by id: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    await logFailure({
      eventType: "Update",
      description: `Failed to update NIST AI RMF subcategory by id: ${(error as Error).message}`,
      functionName: "updateNISTAIRMFSubcategoryById",
      fileName: "nist_ai_rmf.subcategory.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateNISTAIRMFSubcategoryStatus(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const subcategoryId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const { status } = req.body;

  logProcessing({
    description: `starting updateNISTAIRMFSubcategoryStatus for subcategory ID ${subcategoryId} with status: ${status}`,
    functionName: "updateNISTAIRMFSubcategoryStatus",
    fileName: "nist_ai_rmf.subcategory.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `🔄 Updating NIST AI RMF subcategory status: ID ${subcategoryId}, status: ${status}`
  );

  try {
    // Validate request body
    if (!status) {
      await transaction.rollback();
      await logFailure({
        eventType: "Update",
        description: `Failed to update NIST AI RMF subcategory status: Status is required`,
        functionName: "updateNISTAIRMFSubcategoryStatus",
        fileName: "nist_ai_rmf.subcategory.ctrl.ts",
        error: new Error("Status is required"),
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(400).json(STATUS_CODE[400]("Status is required"));
    }

    const updatedSubcategory = await updateNISTAIRMFSubcategoryStatusByIdQuery(
      subcategoryId,
      status,
      req.organizationId!,
      transaction
    );

    await transaction.commit();
    await logEvent(
      "Update",
      `NIST AI RMF subcategory status updated: ID ${subcategoryId}, status: ${status}`,
      req.userId!,
      req.organizationId!
    );
    logStructured(
      "successful",
      `NIST AI RMF subcategory status updated: ID ${subcategoryId}, status: ${status}`,
      "updateNISTAIRMFSubcategoryStatus",
      "nist_ai_rmf.subcategory.ctrl.ts"
    );
    await logSuccess({
      eventType: "Update",
      description: `Successfully updated NIST AI RMF subcategory status: ID ${subcategoryId}, status: ${status}`,
      functionName: "updateNISTAIRMFSubcategoryStatus",
      fileName: "nist_ai_rmf.subcategory.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](updatedSubcategory));
  } catch (error) {
    await transaction.rollback();
    await logEvent(
      "Error",
      `Failed to update NIST AI RMF subcategory status: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    await logFailure({
      eventType: "Update",
      description: `Failed to update NIST AI RMF subcategory status: ${(error as Error).message}`,
      functionName: "updateNISTAIRMFSubcategoryStatus",
      fileName: "nist_ai_rmf.subcategory.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    // Handle validation errors differently
    if (
      error instanceof Error &&
      error.message.includes("Invalid status value")
    ) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get NIST AI RMF subcategories progress (total and completed)
 */
export async function getNISTAIRMFProgress(
  req: Request,
  res: Response
): Promise<any> {
  logProcessing({
    description: "starting getNISTAIRMFProgress",
    functionName: "getNISTAIRMFProgress",
    fileName: "nist_ai_rmf.subcategory.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug("📊 Calculating NIST AI RMF progress");

  try {
    const progress = await countNISTAIRMFSubcategoriesProgress(req.organizationId!);

    await logSuccess({
      eventType: "Read",
      description: `Successfully retrieved NIST AI RMF progress: ${progress.doneSubcategories}/${progress.totalSubcategories}`,
      functionName: "getNISTAIRMFProgress",
      fileName: "nist_ai_rmf.subcategory.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](progress));
  } catch (error) {
    await logEvent(
      "Error",
      `Failed to get NIST AI RMF progress: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    await logFailure({
      eventType: "Read",
      description: `Failed to get NIST AI RMF progress: ${(error as Error).message}`,
      functionName: "getNISTAIRMFProgress",
      fileName: "nist_ai_rmf.subcategory.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get NIST AI RMF subcategories assignments (total and assigned)
 */
export async function getNISTAIRMFAssignments(
  req: Request,
  res: Response
): Promise<any> {
  logProcessing({
    description: "starting getNISTAIRMFAssignments",
    functionName: "getNISTAIRMFAssignments",
    fileName: "nist_ai_rmf.subcategory.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug("📊 Calculating NIST AI RMF assignments");

  try {
    const assignments = await countNISTAIRMFSubcategoriesAssignments(
      req.organizationId!
    );

    await logSuccess({
      eventType: "Read",
      description: `Successfully retrieved NIST AI RMF assignments: ${assignments.assignedSubcategories}/${assignments.totalSubcategories}`,
      functionName: "getNISTAIRMFAssignments",
      fileName: "nist_ai_rmf.subcategory.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](assignments));
  } catch (error) {
    await logEvent(
      "Error",
      `Failed to get NIST AI RMF assignments: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    await logFailure({
      eventType: "Read",
      description: `Failed to get NIST AI RMF assignments: ${(error as Error).message}`,
      functionName: "getNISTAIRMFAssignments",
      fileName: "nist_ai_rmf.subcategory.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get NIST AI RMF subcategories assignments grouped by function (Govern, Map, Measure, Manage)
 */
export async function getNISTAIRMFAssignmentsByFunction(
  req: Request,
  res: Response
): Promise<any> {
  logProcessing({
    description: "starting getNISTAIRMFAssignmentsByFunction",
    functionName: "getNISTAIRMFAssignmentsByFunction",
    fileName: "nist_ai_rmf.subcategory.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug("📊 Calculating NIST AI RMF assignments by function");

  try {
    const assignments = await countNISTAIRMFSubcategoriesAssignmentsByFunction(
      req.organizationId!
    );

    await logSuccess({
      eventType: "Read",
      description: "Successfully retrieved NIST AI RMF assignments by function",
      functionName: "getNISTAIRMFAssignmentsByFunction",
      fileName: "nist_ai_rmf.subcategory.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](assignments));
  } catch (error) {
    await logEvent(
      "Error",
      `Failed to get NIST AI RMF assignments by function: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    await logFailure({
      eventType: "Read",
      description: `Failed to get NIST AI RMF assignments by function: ${(error as Error).message}`,
      functionName: "getNISTAIRMFAssignmentsByFunction",
      fileName: "nist_ai_rmf.subcategory.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get NIST AI RMF subcategories progress grouped by function (Govern, Map, Measure, Manage)
 */
export async function getNISTAIRMFProgressByFunction(
  req: Request,
  res: Response
): Promise<any> {
  logProcessing({
    description: "starting getNISTAIRMFProgressByFunction",
    functionName: "getNISTAIRMFProgressByFunction",
    fileName: "nist_ai_rmf.subcategory.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug("📊 Calculating NIST AI RMF progress by function");

  try {
    const progress = await countNISTAIRMFSubcategoriesProgressByFunction(
      req.organizationId!
    );

    await logSuccess({
      eventType: "Read",
      description: "Successfully retrieved NIST AI RMF progress by function",
      functionName: "getNISTAIRMFProgressByFunction",
      fileName: "nist_ai_rmf.subcategory.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](progress));
  } catch (error) {
    await logEvent(
      "Error",
      `Failed to get NIST AI RMF progress by function: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    await logFailure({
      eventType: "Read",
      description: `Failed to get NIST AI RMF progress by function: ${(error as Error).message}`,
      functionName: "getNISTAIRMFProgressByFunction",
      fileName: "nist_ai_rmf.subcategory.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get NIST AI RMF subcategories status breakdown
 */
export async function getNISTAIRMFStatusBreakdown(
  req: Request,
  res: Response
): Promise<any> {
  logProcessing({
    description: "starting getNISTAIRMFStatusBreakdown",
    functionName: "getNISTAIRMFStatusBreakdown",
    fileName: "nist_ai_rmf.subcategory.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug("📊 Calculating NIST AI RMF status breakdown");

  try {
    const statusBreakdown = await getNISTAIRMFSubcategoriesStatusBreakdown(
      req.organizationId!
    );

    await logSuccess({
      eventType: "Read",
      description: "Successfully retrieved NIST AI RMF status breakdown",
      functionName: "getNISTAIRMFStatusBreakdown",
      fileName: "nist_ai_rmf.subcategory.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](statusBreakdown));
  } catch (error) {
    await logEvent(
      "Error",
      `Failed to get NIST AI RMF status breakdown: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    await logFailure({
      eventType: "Read",
      description: `Failed to get NIST AI RMF status breakdown: ${(error as Error).message}`,
      functionName: "getNISTAIRMFStatusBreakdown",
      fileName: "nist_ai_rmf.subcategory.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get NIST AI RMF dashboard overview with all functions, categories, and subcategories
 */
export async function getNISTAIRMFOverview(
  req: Request,
  res: Response
): Promise<any> {
  logProcessing({
    description: "starting getNISTAIRMFOverview",
    functionName: "getNISTAIRMFOverview",
    fileName: "nist_ai_rmf.subcategory.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug("📊 Fetching NIST AI RMF dashboard overview");

  try {
    const overview = await getNISTAIRMFDashboardOverview(req.organizationId!);

    await logSuccess({
      eventType: "Read",
      description: `Successfully retrieved NIST AI RMF overview with ${overview.functions.length} functions`,
      functionName: "getNISTAIRMFOverview",
      fileName: "nist_ai_rmf.subcategory.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](overview));
  } catch (error) {
    await logEvent(
      "Error",
      `Failed to get NIST AI RMF overview: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    await logFailure({
      eventType: "Read",
      description: `Failed to get NIST AI RMF overview: ${(error as Error).message}`,
      functionName: "getNISTAIRMFOverview",
      fileName: "nist_ai_rmf.subcategory.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
