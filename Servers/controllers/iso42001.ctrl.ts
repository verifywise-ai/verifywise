import { Request, Response } from "express";
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { notifyUserAssigned, AssignmentRoleType } from "../services/inAppNotification.service";
import { SubClauseISO } from "../domain.layer/frameworks/ISO-42001/subClauseISO.model";
import { uploadFile } from "../utils/fileUpload.utils";
import { RequestWithFile, UploadedFile } from "../utils/question.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  countAnnexCategoriesISOByProjectId,
  countSubClausesISOByProjectId,
  countSubClauseAssignmentsISOByProjectId,
  countAnnexCategoryAssignmentsISOByProjectId,
  deleteAnnexCategoriesISOByProjectIdQuery,
  deleteSubClausesISOByProjectIdQuery,
  getAllAnnexesQuery,
  getAllAnnexesWithCategoriesQuery,
  getAllClausesQuery,
  getAllClausesWithSubClauseQuery,
  getAnnexCategoriesByAnnexIdQuery,
  getAnnexCategoryByIdForProjectQuery,
  getAnnexesByProjectIdQuery,
  getClausesByProjectIdQuery,
  getSubClauseByIdForProjectQuery,
  getSubClausesByClauseIdQuery,
  getSubClauseRisksQuery,
  getAnnexCategoryRisksQuery,
  updateAnnexCategoryQuery,
  updateSubClauseQuery,
} from "../utils/iso42001.utils";
import { FileType } from "../domain.layer/models/file/file.model";
import { AnnexCategoryISO } from "../domain.layer/frameworks/ISO-42001/annexCategoryISO.model";
import {
  getAllProjectsQuery,
  updateProjectUpdatedByIdQuery,
} from "../utils/project.utils";
import { IProjectAttributes } from "../domain.layer/interfaces/i.project";
import {
  logProcessing,
  logSuccess,
  logFailure,
} from "../utils/logger/logHelper";
import logger from "../utils/logger/fileLogger";

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

// Helper function to notify assignment changes for ISO 42001 entities
async function notifyIso42001Assignment(
  req: Request | RequestWithFile,
  entityType: "ISO 42001 Subclause" | "ISO 42001 Annex",
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

    let urlPath: string;
    let parentType: string | undefined;
    let parentName: string | undefined;
    let description: string | undefined;

    if (entityType === "ISO 42001 Subclause") {
      // Query for parent clause info, subclause order_no for full identifier (e.g., "4.1 Understanding the organization"), and subclause summary
      const result = await sequelize.query<{ clause_id: number; clause_no: number; clause_title: string; subclause_order_no: number; summary: string }>(
        `SELECT scs.clause_id, c.clause_no, c.title as clause_title, scs.order_no as subclause_order_no, scs.summary
         FROM subclauses_iso sc
         JOIN subclauses_struct_iso scs ON sc.subclause_meta_id = scs.id
         JOIN clauses_struct_iso c ON scs.clause_id = c.id
         WHERE sc.organization_id = :organizationId AND sc.id = :entityId`,
        { replacements: { organizationId: req.organizationId!, entityId }, type: QueryTypes.SELECT }
      );
      const clauseId = result[0]?.clause_id;
      parentType = "Clause";
      parentName = result[0]?.clause_title;
      // Build full subclause identifier like "4.1 Understanding the organization and its context"
      if (result[0]) {
        entityName = `${result[0].clause_no}.${result[0].subclause_order_no} ${entityName}`;
      }
      description = result[0]?.summary;
      urlPath = clauseId
        ? `/framework?framework=iso-42001&clauseId=${clauseId}&subClauseId=${entityId}`
        : `/framework?framework=iso-42001&subClauseId=${entityId}`;
    } else {
      // Query for parent annex info, category sub_id for full identifier (e.g., "A.5.1 Policies for AI"), and category description
      const result = await sequelize.query<{ annex_id: number; annex_no: number; annex_title: string; category_sub_id: number; category_description: string }>(
        `SELECT acs.annex_id, a.annex_no, a.title as annex_title, acs.sub_id as category_sub_id, acs.description as category_description
         FROM annexcategories_iso ac
         JOIN annexcategories_struct_iso acs ON ac.annexcategory_meta_id = acs.id
         JOIN annex_struct_iso a ON acs.annex_id = a.id
         WHERE ac.organization_id = :organizationId AND ac.id = :entityId`,
        { replacements: { organizationId: req.organizationId!, entityId }, type: QueryTypes.SELECT }
      );
      const annexId = result[0]?.annex_id;
      parentType = "Annex";
      parentName = result[0]?.annex_title;
      // Build full annex category identifier like "A.5.1 Policies for AI"
      if (result[0]) {
        entityName = `A.${result[0].annex_no}.${result[0].category_sub_id} ${entityName}`;
      }
      description = result[0]?.category_description;
      urlPath = annexId
        ? `/framework?framework=iso-42001&annexId=${annexId}&annexCategoryId=${entityId}`
        : `/framework?framework=iso-42001&annexCategoryId=${entityId}`;
    }

    notifyUserAssigned(
      req.organizationId!,
      newUserId,
      {
        entityType,
        entityId,
        entityName,
        roleType,
        entityUrl: `${baseUrl}${urlPath}`,
      },
      assignerName,
      baseUrl,
      {
        frameworkName: "ISO 42001",
        parentType,
        parentName,
        description,
      }
    ).catch((err) => console.error(`Failed to send ${roleType} notification:`, err));
  }
}

export async function getAllClauses(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getAllClauses",
    functionName: "getAllClauses",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug("🔍 Fetching all clauses");

  try {
    const clauses = await getAllClausesQuery(req.organizationId!);

    await logSuccess({
      eventType: "Read",
      description: "Retrieved all clauses",
      functionName: "getAllClauses",
      fileName: "iso42001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(clauses);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve clauses",
      functionName: "getAllClauses",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAllClausesStructForProject(
  req: Request,
  res: Response
): Promise<any> {
  const projectFrameworkId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getAllClausesStructForProject for project framework ID ${projectFrameworkId}`,
    functionName: "getAllClausesStructForProject",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `🔍 Fetching clauses structure for project framework ID ${projectFrameworkId}`
  );

  try {
    const clauses = await getAllClausesWithSubClauseQuery(
      projectFrameworkId,
      req.organizationId!
    );

    await logSuccess({
      eventType: "Read",
      description: `Retrieved clauses structure for project framework ID ${projectFrameworkId}`,
      functionName: "getAllClausesStructForProject",
      fileName: "iso42001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(clauses);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve clauses structure for project framework ID ${projectFrameworkId}`,
      functionName: "getAllClausesStructForProject",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAllAnnexesStructForProject(
  req: Request,
  res: Response
): Promise<any> {
  const projectFrameworkId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getAllAnnexesStructForProject for project framework ID ${projectFrameworkId}`,
    functionName: "getAllAnnexesStructForProject",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `🔍 Fetching annexes structure for project framework ID ${projectFrameworkId}`
  );

  try {
    const annexes = await getAllAnnexesWithCategoriesQuery(
      projectFrameworkId,
      req.organizationId!
    );

    await logSuccess({
      eventType: "Read",
      description: `Retrieved annexes structure for project framework ID ${projectFrameworkId}`,
      functionName: "getAllAnnexesStructForProject",
      fileName: "iso42001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(annexes);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve annexes structure for project framework ID ${projectFrameworkId}`,
      functionName: "getAllAnnexesStructForProject",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAllAnnexes(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getAllAnnexes",
    functionName: "getAllAnnexes",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug("🔍 Fetching all annexes");

  try {
    const annexes = await getAllAnnexesQuery(req.organizationId!);

    await logSuccess({
      eventType: "Read",
      description: "Retrieved all annexes",
      functionName: "getAllAnnexes",
      fileName: "iso42001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(annexes);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve annexes",
      functionName: "getAllAnnexes",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getSubClausesByClauseId(
  req: Request,
  res: Response
): Promise<any> {
  const clauseId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getSubClausesByClauseId for clause ID ${clauseId}`,
    functionName: "getSubClausesByClauseId",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(`🔍 Fetching sub-clauses for clause ID ${clauseId}`);

  try {
    const subClauses = await getSubClausesByClauseIdQuery(
      clauseId,
      req.organizationId!
    );
    if (subClauses) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved sub-clauses for clause ID ${clauseId}`,
        functionName: "getSubClausesByClauseId",
        fileName: "iso42001.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](subClauses));
    }

    await logSuccess({
      eventType: "Read",
      description: `No sub-clauses found for clause ID ${clauseId}`,
      functionName: "getSubClausesByClauseId",
      fileName: "iso42001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400]("No sub clauses found"));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve sub-clauses for clause ID ${clauseId}`,
      functionName: "getSubClausesByClauseId",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAnnexCategoriesByAnnexId(
  req: Request,
  res: Response
): Promise<any> {
  const annexId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getAnnexCategoriesByAnnexId for annex ID ${annexId}`,
    functionName: "getAnnexCategoriesByAnnexId",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(`🔍 Fetching annex categories for annex ID ${annexId}`);

  try {
    const annexCategories = await getAnnexCategoriesByAnnexIdQuery(
      annexId,
      req.organizationId!
    );
    if (annexCategories) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved annex categories for annex ID ${annexId}`,
        functionName: "getAnnexCategoriesByAnnexId",
        fileName: "iso42001.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](annexCategories));
    }

    await logSuccess({
      eventType: "Read",
      description: `No annex categories found for annex ID ${annexId}`,
      functionName: "getAnnexCategoriesByAnnexId",
      fileName: "iso42001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400]("No annex categories found"));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve annex categories for annex ID ${annexId}`,
      functionName: "getAnnexCategoriesByAnnexId",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getSubClauseById(
  req: Request,
  res: Response
): Promise<any> {
  const subClauseId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const projectFrameworkId = parseInt(req.query.projectFrameworkId as string);

  logProcessing({
    description: `starting getSubClauseById for sub-clause ID ${subClauseId} and project framework ID ${projectFrameworkId}`,
    functionName: "getSubClauseById",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `🔍 Looking up sub-clause ID ${subClauseId} for project framework ID ${projectFrameworkId}`
  );

  try {
    const subClause = await getSubClauseByIdForProjectQuery(
      subClauseId,
      projectFrameworkId,
      req.organizationId!
    );
    if (subClause) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved sub-clause ID ${subClauseId} for project framework ID ${projectFrameworkId}`,
        functionName: "getSubClauseById",
        fileName: "iso42001.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](subClause));
    }

    await logSuccess({
      eventType: "Read",
      description: `No sub-clause found: ID ${subClauseId} for project framework ID ${projectFrameworkId}`,
      functionName: "getSubClauseById",
      fileName: "iso42001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400]("No sub clause found"));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve sub-clause ID ${subClauseId} for project framework ID ${projectFrameworkId}`,
      functionName: "getSubClauseById",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAnnexCategoryById(
  req: Request,
  res: Response
): Promise<any> {
  const annexCategoryId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const projectFrameworkId = parseInt(req.query.projectFrameworkId as string);

  logProcessing({
    description: `starting getAnnexCategoryById for annex category ID ${annexCategoryId} and project framework ID ${projectFrameworkId}`,
    functionName: "getAnnexCategoryById",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `🔍 Looking up annex category ID ${annexCategoryId} for project framework ID ${projectFrameworkId}`
  );

  try {
    const annexCategory = await getAnnexCategoryByIdForProjectQuery(
      annexCategoryId,
      projectFrameworkId,
      req.organizationId!
    );
    if (annexCategory) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved annex category ID ${annexCategoryId} for project framework ID ${projectFrameworkId}`,
        functionName: "getAnnexCategoryById",
        fileName: "iso42001.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](annexCategory));
    }

    await logSuccess({
      eventType: "Read",
      description: `No annex category found: ID ${annexCategoryId} for project framework ID ${projectFrameworkId}`,
      functionName: "getAnnexCategoryById",
      fileName: "iso42001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400]("No annex category found"));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve annex category ID ${annexCategoryId} for project framework ID ${projectFrameworkId}`,
      functionName: "getAnnexCategoryById",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getClausesByProjectId(
  req: Request,
  res: Response
): Promise<any> {
  const projectFrameworkId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getClausesByProjectId for project framework ID ${projectFrameworkId}`,
    functionName: "getClausesByProjectId",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `🔍 Fetching clauses for project framework ID ${projectFrameworkId}`
  );

  try {
    const subClauses = await getClausesByProjectIdQuery(
      projectFrameworkId,
      req.organizationId!
    );
    if (subClauses) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved clauses for project framework ID ${projectFrameworkId}`,
        functionName: "getClausesByProjectId",
        fileName: "iso42001.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](subClauses));
    }

    await logSuccess({
      eventType: "Read",
      description: `No clauses found for project framework ID ${projectFrameworkId}`,
      functionName: "getClausesByProjectId",
      fileName: "iso42001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400]("No sub clauses found"));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve clauses for project framework ID ${projectFrameworkId}`,
      functionName: "getClausesByProjectId",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAnnexesByProjectId(
  req: Request,
  res: Response
): Promise<any> {
  const projectFrameworkId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getAnnexesByProjectId for project framework ID ${projectFrameworkId}`,
    functionName: "getAnnexesByProjectId",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `🔍 Fetching annexes for project framework ID ${projectFrameworkId}`
  );

  try {
    const annexCategories = await getAnnexesByProjectIdQuery(
      projectFrameworkId,
      req.organizationId!
    );
    if (annexCategories) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved annexes for project framework ID ${projectFrameworkId}`,
        functionName: "getAnnexesByProjectId",
        fileName: "iso42001.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](annexCategories));
    }

    await logSuccess({
      eventType: "Read",
      description: `No annexes found for project framework ID ${projectFrameworkId}`,
      functionName: "getAnnexesByProjectId",
      fileName: "iso42001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400]("No annex categories found"));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve annexes for project framework ID ${projectFrameworkId}`,
      functionName: "getAnnexesByProjectId",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// Note: Files are only unlinked from evidence_links, not deleted from file manager
// This allows the same file to be used as evidence in multiple places

// helper function to upload files
async function uploadFiles(
  files: UploadedFile[],
  userId: number,
  projectFrameworkId: number,
  source: "Management system clauses group" | "Reference controls group",
  organizationId: number,
  transaction: any
): Promise<FileType[]> {
  let uploadedFiles: FileType[] = [];
  await Promise.all(
    files.map(async (file) => {
      const uploadedFile = await uploadFile(
        file,
        userId,
        projectFrameworkId,
        source,
        organizationId,
        transaction
      );

      uploadedFiles.push({
        id: uploadedFile.id!.toString(),
        fileName: uploadedFile.filename,
        project_id: uploadedFile.project_id,
        uploaded_by: uploadedFile.uploaded_by,
        uploaded_time: uploadedFile.uploaded_time,
        type: uploadedFile.type,
        source: uploadedFile.source,
      });
    })
  );
  return uploadedFiles;
}

/**
 * Get all risks linked to an ISO 42001 subclause
 * @route GET /api/iso-42001/subclauses/:id/risks
 */
export async function getSubClauseRisks(
  req: Request,
  res: Response
): Promise<any> {
  const subclauseId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getSubClauseRisks for subclause ID ${subclauseId}`,
    functionName: "getSubClauseRisks",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  logger.debug(`🔍 Fetching risks for ISO 42001 subclause ${subclauseId}`);

  try {
    const risks = await getSubClauseRisksQuery(subclauseId, req.organizationId!);

    await logSuccess({
      eventType: "Read",
      description: `Successfully retrieved ${risks.length} risks for ISO 42001 subclause ${subclauseId}`,
      functionName: "getSubClauseRisks",
      fileName: "iso42001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json({
      message: "Risks retrieved successfully",
      data: risks,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to get ISO 42001 subclause risks: ${(error as Error).message}`,
      functionName: "getSubClauseRisks",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    logger.error(`❌ Error fetching ISO 42001 subclause risks:`, error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get all risks linked to a specific ISO 42001 annex category
 * @route GET /api/iso-42001/annexCategories/:id/risks
 */
export async function getAnnexCategoryRisks(
  req: Request,
  res: Response
): Promise<any> {
  const annexCategoryId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getAnnexCategoryRisks for annex category ID ${annexCategoryId}`,
    functionName: "getAnnexCategoryRisks",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  logger.debug(
    `🔍 Fetching risks for ISO 42001 annex category ${annexCategoryId}`
  );

  try {
    const risks = await getAnnexCategoryRisksQuery(
      annexCategoryId,
      req.organizationId!
    );

    await logSuccess({
      eventType: "Read",
      description: `Successfully retrieved ${risks.length} risks for ISO 42001 annex category ${annexCategoryId}`,
      functionName: "getAnnexCategoryRisks",
      fileName: "iso42001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json({
      message: "Risks retrieved successfully",
      data: risks,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to get ISO 42001 annex category risks: ${(error as Error).message}`,
      functionName: "getAnnexCategoryRisks",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    logger.error(`❌ Error fetching ISO 42001 annex category risks:`, error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function saveClauses(
  req: RequestWithFile,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const subClauseId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting saveClauses for sub-clause ID ${subClauseId}`,
    functionName: "saveClauses",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(`💾 Saving clauses for sub-clause ID ${subClauseId}`);

  try {
    const subClause = req.body as SubClauseISO & {
      user_id: string;
      delete: string;
      risksDelete: string;
      risksMitigated: string;
      project_id: string;
    };

    // Files to unlink (not delete) - the actual file stays in file manager
    const filesToUnlinkRaw = JSON.parse(subClause.delete || "[]");
    // Ensure all file IDs are numbers (handle cases where frontend sends strings)
    const filesToUnlink = Array.isArray(filesToUnlinkRaw)
      ? filesToUnlinkRaw
        .map((id: string | number) => (typeof id === "string" ? parseInt(id) : id))
        .filter((id: number) => !isNaN(id))
      : [];

    // Get current subclause data for assignment change detection
    const currentSubClauseResult = (await sequelize.query(
      `SELECT sc.owner, sc.reviewer, sc.approver, pf.project_id as project_id, scs.title as title
       FROM subclauses_iso sc
       JOIN projects_frameworks pf ON pf.id = sc.projects_frameworks_id AND pf.organization_id = sc.organization_id
       LEFT JOIN subclauses_struct_iso scs ON scs.id = sc.subclause_meta_id
       WHERE sc.organization_id = :organizationId AND sc.id = :id;`,
      {
        replacements: { organizationId: req.organizationId!, id: subClauseId },
        transaction,
        type: QueryTypes.SELECT,
      }
    )) as { project_id: number; owner: number | null; reviewer: number | null; approver: number | null; title: string }[];

    if (currentSubClauseResult.length === 0) {
      throw new Error("Subclause not found");
    }

    const currentData = currentSubClauseResult[0];
    const projectId = currentData.project_id;

    let uploadedFiles: FileType[] = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      uploadedFiles = await uploadFiles(
        req.files as UploadedFile[],
        parseInt(subClause.user_id),
        projectId,
        "Management system clauses group",
        req.organizationId!,
        transaction
      );
    }

    const updatedSubClause = await updateSubClauseQuery(
      subClauseId,
      subClause,
      uploadedFiles,
      filesToUnlink,
      req.organizationId!,
      transaction
    );

    // Update the project's last updated date
    await updateProjectUpdatedByIdQuery(
      subClauseId,
      "subclauses",
      req.organizationId!,
      transaction
    );
    await transaction.commit();

    // Notify owner, reviewer, approver if changed
    const entityName = currentData.title || `Subclause #${subClauseId}`;
    const newOwner = subClause.owner ? parseInt(String(subClause.owner)) : null;
    const newReviewer = subClause.reviewer ? parseInt(String(subClause.reviewer)) : null;
    const newApprover = subClause.approver ? parseInt(String(subClause.approver)) : null;

    if (newOwner) {
      notifyIso42001Assignment(req, "ISO 42001 Subclause", subClauseId, entityName, "Owner", newOwner, currentData.owner);
    }
    if (newReviewer) {
      notifyIso42001Assignment(req, "ISO 42001 Subclause", subClauseId, entityName, "Reviewer", newReviewer, currentData.reviewer);
    }
    if (newApprover) {
      notifyIso42001Assignment(req, "ISO 42001 Subclause", subClauseId, entityName, "Approver", newApprover, currentData.approver);
    }

    await logSuccess({
      eventType: "Update",
      description: `Successfully saved clauses for sub-clause ID ${subClauseId}`,
      functionName: "saveClauses",
      fileName: "iso42001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](updatedSubClause));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `Failed to save clauses for sub-clause ID ${subClauseId}`,
      functionName: "saveClauses",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function saveAnnexes(
  req: RequestWithFile,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const annexCategoryId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting saveAnnexes for annex category ID ${annexCategoryId}`,
    functionName: "saveAnnexes",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(`💾 Saving annexes for annex category ID ${annexCategoryId}`);

  try {
    const annexCategory = req.body as AnnexCategoryISO & {
      user_id: string;
      project_id: string;
      delete: string;
      risksDelete: string;
      risksMitigated: string;
    };

    // Files to unlink (not delete) - the actual file stays in file manager
    const filesToUnlinkRaw = JSON.parse(annexCategory.delete || "[]");
    // Ensure all file IDs are numbers (handle cases where frontend sends strings)
    const filesToUnlink = Array.isArray(filesToUnlinkRaw)
      ? filesToUnlinkRaw
        .map((id: string | number) => (typeof id === "string" ? parseInt(id) : id))
        .filter((id: number) => !isNaN(id))
      : [];

    // Get current annex category data for assignment change detection
    const currentAnnexResult = (await sequelize.query(
      `SELECT ac.owner, ac.reviewer, ac.approver, pf.project_id as project_id, acs.title as title
       FROM annexcategories_iso ac
       JOIN projects_frameworks pf ON pf.id = ac.projects_frameworks_id AND pf.organization_id = ac.organization_id
       LEFT JOIN annexcategories_struct_iso acs ON acs.id = ac.annexcategory_meta_id
       WHERE ac.organization_id = :organizationId AND ac.id = :id;`,
      {
        replacements: { organizationId: req.organizationId!, id: annexCategoryId },
        transaction,
        type: QueryTypes.SELECT,
      }
    )) as { project_id: number; owner: number | null; reviewer: number | null; approver: number | null; title: string }[];

    if (currentAnnexResult.length === 0) {
      throw new Error("Annex category not found");
    }

    const currentAnnexData = currentAnnexResult[0];
    const projectId = currentAnnexData.project_id;

    let uploadedFiles: FileType[] = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      uploadedFiles = await uploadFiles(
        req.files as UploadedFile[],
        parseInt(annexCategory.user_id),
        projectId,
        "Reference controls group",
        req.organizationId!,
        transaction
      );
    }

    const updatedAnnexCategory = await updateAnnexCategoryQuery(
      annexCategoryId,
      annexCategory,
      uploadedFiles,
      filesToUnlink,
      req.organizationId!,
      transaction
    );

    // Update the project's last updated date
    await updateProjectUpdatedByIdQuery(
      annexCategoryId,
      "annexcategories",
      req.organizationId!,
      transaction
    );
    await transaction.commit();

    // Notify owner, reviewer, approver if changed
    const annexEntityName = currentAnnexData.title || `Annex Category #${annexCategoryId}`;
    const newAnnexOwner = annexCategory.owner ? parseInt(String(annexCategory.owner)) : null;
    const newAnnexReviewer = annexCategory.reviewer ? parseInt(String(annexCategory.reviewer)) : null;
    const newAnnexApprover = annexCategory.approver ? parseInt(String(annexCategory.approver)) : null;

    if (newAnnexOwner) {
      notifyIso42001Assignment(req, "ISO 42001 Annex", annexCategoryId, annexEntityName, "Owner", newAnnexOwner, currentAnnexData.owner);
    }
    if (newAnnexReviewer) {
      notifyIso42001Assignment(req, "ISO 42001 Annex", annexCategoryId, annexEntityName, "Reviewer", newAnnexReviewer, currentAnnexData.reviewer);
    }
    if (newAnnexApprover) {
      notifyIso42001Assignment(req, "ISO 42001 Annex", annexCategoryId, annexEntityName, "Approver", newAnnexApprover, currentAnnexData.approver);
    }

    await logSuccess({
      eventType: "Update",
      description: `Successfully saved annexes for annex category ID ${annexCategoryId}`,
      functionName: "saveAnnexes",
      fileName: "iso42001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](updatedAnnexCategory));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `Failed to save annexes for annex category ID ${annexCategoryId}`,
      functionName: "saveAnnexes",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteManagementSystemClauses(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const projectFrameworkId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting deleteManagementSystemClauses for project framework ID ${projectFrameworkId}`,
    functionName: "deleteManagementSystemClauses",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `🗑️ Deleting management system clauses for project framework ID ${projectFrameworkId}`
  );

  try {
    const result = await deleteSubClausesISOByProjectIdQuery(
      projectFrameworkId,
      req.organizationId!,
      transaction
    );

    if (result) {
      await transaction.commit();
      await logSuccess({
        eventType: "Delete",
        description: `Successfully deleted management system clauses for project framework ID ${projectFrameworkId}`,
        functionName: "deleteManagementSystemClauses",
        fileName: "iso42001.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](result));
    }

    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete management system clauses for project framework ID ${projectFrameworkId}`,
      functionName: "deleteManagementSystemClauses",
      fileName: "iso42001.ctrl.ts",
      error: new Error("Delete operation failed"),
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400](result));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete management system clauses for project framework ID ${projectFrameworkId}`,
      functionName: "deleteManagementSystemClauses",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteReferenceControls(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const projectFrameworkId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting deleteReferenceControls for project framework ID ${projectFrameworkId}`,
    functionName: "deleteReferenceControls",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `🗑️ Deleting reference controls for project framework ID ${projectFrameworkId}`
  );

  try {
    const result = await deleteAnnexCategoriesISOByProjectIdQuery(
      projectFrameworkId,
      req.organizationId!,
      transaction
    );

    if (result) {
      await transaction.commit();
      await logSuccess({
        eventType: "Delete",
        description: `Successfully deleted reference controls for project framework ID ${projectFrameworkId}`,
        functionName: "deleteReferenceControls",
        fileName: "iso42001.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](result));
    }

    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete reference controls for project framework ID ${projectFrameworkId}`,
      functionName: "deleteReferenceControls",
      fileName: "iso42001.ctrl.ts",
      error: new Error("Delete operation failed"),
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400](result));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete reference controls for project framework ID ${projectFrameworkId}`,
      functionName: "deleteReferenceControls",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getProjectClausesProgress(
  req: Request,
  res: Response
): Promise<any> {
  const projectFrameworkId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getProjectClausesProgress for project framework ID ${projectFrameworkId}`,
    functionName: "getProjectClausesProgress",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `📊 Calculating clauses progress for project framework ID ${projectFrameworkId}`
  );

  try {
    const { totalSubclauses, doneSubclauses } =
      await countSubClausesISOByProjectId(projectFrameworkId, req.organizationId!);

    await logSuccess({
      eventType: "Read",
      description: `Retrieved clauses progress for project framework ID ${projectFrameworkId}`,
      functionName: "getProjectClausesProgress",
      fileName: "iso42001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(
      STATUS_CODE[200]({
        totalSubclauses: parseInt(totalSubclauses),
        doneSubclauses: parseInt(doneSubclauses),
      })
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to get clauses progress for project framework ID ${projectFrameworkId}`,
      functionName: "getProjectClausesProgress",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getProjectAnnxesProgress(
  req: Request,
  res: Response
): Promise<any> {
  const projectFrameworkId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getProjectAnnxesProgress for project framework ID ${projectFrameworkId}`,
    functionName: "getProjectAnnxesProgress",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `📊 Calculating annexes progress for project framework ID ${projectFrameworkId}`
  );

  try {
    const { totalAnnexcategories, doneAnnexcategories } =
      await countAnnexCategoriesISOByProjectId(
        projectFrameworkId,
        req.organizationId!
      );

    await logSuccess({
      eventType: "Read",
      description: `Retrieved annexes progress for project framework ID ${projectFrameworkId}`,
      functionName: "getProjectAnnxesProgress",
      fileName: "iso42001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(
      STATUS_CODE[200]({
        totalAnnexcategories: parseInt(totalAnnexcategories),
        doneAnnexcategories: parseInt(doneAnnexcategories),
      })
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to get annexes progress for project framework ID ${projectFrameworkId}`,
      functionName: "getProjectAnnxesProgress",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAllProjectsClausesProgress(
  req: Request,
  res: Response
): Promise<any> {
  let allSubclauses = 0;
  let allDoneSubclauses = 0;

  logProcessing({
    description: "starting getAllProjectsClausesProgress",
    functionName: "getAllProjectsClausesProgress",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug("📊 Calculating clauses progress across all projects");

  try {
    const { userId, role } = req;
    if (!userId || !role) {
      await logFailure({
        eventType: "Read",
        description:
          "Unauthorized access attempt for getAllProjectsClausesProgress",
        functionName: "getAllProjectsClausesProgress",
        fileName: "iso42001.ctrl.ts",
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
          const projectFrameworkId = (
            project as unknown as { dataValues: IProjectAttributes }
          ).dataValues.framework
            ?.filter((f) => f.framework_id === 2)
            .map((f) => f.project_framework_id)[0];
          if (!projectFrameworkId) {
            return;
          }
          const { totalSubclauses, doneSubclauses } =
            await countSubClausesISOByProjectId(
              projectFrameworkId,
              req.organizationId!
            );
          allSubclauses += parseInt(totalSubclauses);
          allDoneSubclauses += parseInt(doneSubclauses);
        })
      );

      await logSuccess({
        eventType: "Read",
        description: `Retrieved clauses progress across ${projects.length} projects`,
        functionName: "getAllProjectsClausesProgress",
        fileName: "iso42001.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      return res
        .status(200)
        .json(STATUS_CODE[200]({ allSubclauses, allDoneSubclauses }));
    } else {
      await logSuccess({
        eventType: "Read",
        description: "No projects found for clauses progress calculation",
        functionName: "getAllProjectsClausesProgress",
        fileName: "iso42001.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404](projects));
    }
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to get clauses progress across all projects",
      functionName: "getAllProjectsClausesProgress",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAllProjectsAnnxesProgress(
  req: Request,
  res: Response
): Promise<any> {
  let allAnnexcategories = 0;
  let allDoneAnnexcategories = 0;

  logProcessing({
    description: "starting getAllProjectsAnnxesProgress",
    functionName: "getAllProjectsAnnxesProgress",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug("📊 Calculating annexes progress across all projects");

  try {
    const { userId, role } = req;
    if (!userId || !role) {
      await logFailure({
        eventType: "Read",
        description:
          "Unauthorized access attempt for getAllProjectsAnnxesProgress",
        functionName: "getAllProjectsAnnxesProgress",
        fileName: "iso42001.ctrl.ts",
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
          const projectFrameworkId = (
            project as unknown as { dataValues: IProjectAttributes }
          ).dataValues.framework
            ?.filter((f) => f.framework_id === 2)
            .map((f) => f.project_framework_id)[0];
          if (!projectFrameworkId) {
            return;
          }
          const { totalAnnexcategories, doneAnnexcategories } =
            await countAnnexCategoriesISOByProjectId(
              projectFrameworkId,
              req.organizationId!
            );
          allAnnexcategories += parseInt(totalAnnexcategories);
          allDoneAnnexcategories += parseInt(doneAnnexcategories);
        })
      );

      await logSuccess({
        eventType: "Read",
        description: `Retrieved annexes progress across ${projects.length} projects`,
        functionName: "getAllProjectsAnnxesProgress",
        fileName: "iso42001.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      return res
        .status(200)
        .json(STATUS_CODE[200]({ allAnnexcategories, allDoneAnnexcategories }));
    } else {
      await logSuccess({
        eventType: "Read",
        description: "No projects found for annexes progress calculation",
        functionName: "getAllProjectsAnnxesProgress",
        fileName: "iso42001.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404](projects));
    }
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to get annexes progress across all projects",
      functionName: "getAllProjectsAnnxesProgress",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Retrieves assignment statistics for ISO 42001 subclauses within a project framework.
 * Returns total count and number of subclauses that have been assigned to owners.
 *
 * @route GET /api/iso-42001/clauses/assignments/:id
 * @param req - Express request object with project framework ID in params
 * @param res - Express response object
 * @returns JSON response with totalSubclauses and assignedSubclauses counts
 */
export async function getProjectClausesAssignments(
  req: Request,
  res: Response
): Promise<any> {
  const projectFrameworkId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getProjectClausesAssignments for project framework ID ${projectFrameworkId}`,
    functionName: "getProjectClausesAssignments",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `📊 Calculating clauses assignments for project framework ID ${projectFrameworkId}`
  );

  try {
    const { totalSubclauses, assignedSubclauses } =
      await countSubClauseAssignmentsISOByProjectId(
        projectFrameworkId,
        req.organizationId!
      );

    await logSuccess({
      eventType: "Read",
      description: `Retrieved clauses assignments for project framework ID ${projectFrameworkId}`,
      functionName: "getProjectClausesAssignments",
      fileName: "iso42001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(
      STATUS_CODE[200]({
        totalSubclauses: parseInt(totalSubclauses),
        assignedSubclauses: parseInt(assignedSubclauses),
      })
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to get clauses assignments for project framework ID ${projectFrameworkId}`,
      functionName: "getProjectClausesAssignments",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Retrieves assignment statistics for ISO 42001 annex categories within a project framework.
 * Returns total count and number of annex categories that have been assigned to owners.
 *
 * @route GET /api/iso-42001/annexes/assignments/:id
 * @param req - Express request object with project framework ID in params
 * @param res - Express response object
 * @returns JSON response with totalAnnexcategories and assignedAnnexcategories counts
 */
export async function getProjectAnnexesAssignments(
  req: Request,
  res: Response
): Promise<any> {
  const projectFrameworkId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getProjectAnnexesAssignments for project framework ID ${projectFrameworkId}`,
    functionName: "getProjectAnnexesAssignments",
    fileName: "iso42001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `📊 Calculating annexes assignments for project framework ID ${projectFrameworkId}`
  );

  try {
    const { totalAnnexcategories, assignedAnnexcategories } =
      await countAnnexCategoryAssignmentsISOByProjectId(
        projectFrameworkId,
        req.organizationId!
      );

    await logSuccess({
      eventType: "Read",
      description: `Retrieved annexes assignments for project framework ID ${projectFrameworkId}`,
      functionName: "getProjectAnnexesAssignments",
      fileName: "iso42001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(
      STATUS_CODE[200]({
        totalAnnexcategories: parseInt(totalAnnexcategories),
        assignedAnnexcategories: parseInt(assignedAnnexcategories),
      })
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to get annexes assignments for project framework ID ${projectFrameworkId}`,
      functionName: "getProjectAnnexesAssignments",
      fileName: "iso42001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
