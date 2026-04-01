import { Request, Response } from "express";
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { notifyUserAssigned, AssignmentRoleType } from "../services/inAppNotification.service";
import { uploadFile } from "../utils/fileUpload.utils";
import { RequestWithFile, UploadedFile } from "../utils/question.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  countAnnexControlsISOByProjectId,
  countSubClausesISOByProjectId,
  countSubClauseAssignmentsISOByProjectId,
  countAnnexControlAssignmentsISOByProjectId,
  deleteAnnexControlsISO27001ByProjectIdQuery,
  deleteSubClausesISO27001ByProjectIdQuery,
  getAllAnnexesQuery,
  getAllAnnexesWithControlsQuery,
  getAllClausesQuery,
  getAllClausesWithSubClauseQuery,
  getAnnexControlsByAnnexIdQuery,
  getAnnexControlByIdForProjectQuery,
  getAnnexesByProjectIdQuery,
  getClausesByProjectIdQuery,
  getSubClauseByIdForProjectQuery,
  getSubClausesByClauseIdQuery,
  updateAnnexControlQuery,
  updateSubClauseQuery,
} from "../utils/iso27001.utils";
import { FileType } from "../domain.layer/models/file/file.model";
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
import { IISO27001SubClause } from "../domain.layer/interfaces/i.ISO27001SubClause";
import { IISO27001AnnexControl } from "../domain.layer/interfaces/i.iso27001AnnexControl";

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

// Helper function to notify assignment changes for ISO 27001 entities
async function notifyIso27001Assignment(
  req: Request | RequestWithFile,
  entityType: "ISO 27001 Subclause" | "ISO 27001 Annex Control",
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

    if (entityType === "ISO 27001 Subclause") {
      // Query for parent clause info, subclause order_no for full identifier (e.g., "4.1 Understanding the organization"), and subclause description
      const result = await sequelize.query<{ clause_id: number; clause_arrangement: number; clause_title: string; subclause_order_no: number; requirement_summary: string }>(
        `SELECT scs.clause_id, c.arrangement as clause_arrangement, c.title as clause_title, scs.order_no as subclause_order_no, scs.requirement_summary
         FROM subclauses_iso27001 sc
         JOIN subclauses_struct_iso27001 scs ON sc.subclause_meta_id = scs.id
         JOIN clauses_struct_iso27001 c ON scs.clause_id = c.id
         WHERE sc.organization_id = :organizationId AND sc.id = :entityId`,
        { replacements: { organizationId: req.organizationId!, entityId }, type: QueryTypes.SELECT }
      );
      const clauseId = result[0]?.clause_id;
      parentType = "Clause";
      parentName = result[0] ? `${result[0].clause_arrangement}. ${result[0].clause_title}` : undefined;
      // Build full subclause identifier like "4.1 Understanding the organization and its context"
      if (result[0]) {
        entityName = `${result[0].clause_arrangement}.${result[0].subclause_order_no} ${entityName}`;
      }
      description = result[0]?.requirement_summary;
      urlPath = clauseId
        ? `/framework?framework=iso-27001&clause27001Id=${clauseId}&subClause27001Id=${entityId}`
        : `/framework?framework=iso-27001&subClause27001Id=${entityId}`;
    } else {
      // Query for parent annex info, control order_no for full identifier (e.g., "A.5.1 Policies for information security"), and control description
      const result = await sequelize.query<{ annex_id: number; annex_arrangement: string; annex_order_no: number; annex_title: string; control_order_no: number; requirement_summary: string }>(
        `SELECT acs.annex_id, a.arrangement as annex_arrangement, a.order_no as annex_order_no, a.title as annex_title, acs.order_no as control_order_no, acs.requirement_summary
         FROM annexcontrols_iso27001 ac
         JOIN annexcontrols_struct_iso27001 acs ON ac.annexcontrol_meta_id = acs.id
         JOIN annex_struct_iso27001 a ON acs.annex_id = a.id
         WHERE ac.organization_id = :organizationId AND ac.id = :entityId`,
        { replacements: { organizationId: req.organizationId!, entityId }, type: QueryTypes.SELECT }
      );
      const annexId = result[0]?.annex_id;
      parentType = "Annex";
      parentName = result[0] ? `${result[0].annex_arrangement}.${result[0].annex_order_no} ${result[0].annex_title}` : undefined;
      // Build full control identifier like "A.5.1 Policies for information security"
      if (result[0]) {
        entityName = `${result[0].annex_arrangement}.${result[0].annex_order_no}.${result[0].control_order_no} ${entityName}`;
      }
      description = result[0]?.requirement_summary;
      urlPath = annexId
        ? `/framework?framework=iso-27001&annex27001Id=${annexId}&annexControl27001Id=${entityId}`
        : `/framework?framework=iso-27001&annexControl27001Id=${entityId}`;
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
        frameworkName: "ISO 27001",
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
    fileName: "iso27001.ctrl.ts",
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
      fileName: "iso27001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(clauses);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve clauses",
      functionName: "getAllClauses",
      fileName: "iso27001.ctrl.ts",
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
    fileName: "iso27001.ctrl.ts",
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
      fileName: "iso27001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(clauses);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve clauses structure for project framework ID ${projectFrameworkId}`,
      functionName: "getAllClausesStructForProject",
      fileName: "iso27001.ctrl.ts",
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
    fileName: "iso27001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `🔍 Fetching annexes structure for project framework ID ${projectFrameworkId}`
  );

  try {
    const annexes = await getAllAnnexesWithControlsQuery(
      projectFrameworkId,
      req.organizationId!
    );

    await logSuccess({
      eventType: "Read",
      description: `Retrieved annexes structure for project framework ID ${projectFrameworkId}`,
      functionName: "getAllAnnexesStructForProject",
      fileName: "iso27001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(annexes);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve annexes structure for project framework ID ${projectFrameworkId}`,
      functionName: "getAllAnnexesStructForProject",
      fileName: "iso27001.ctrl.ts",
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
    fileName: "iso27001.ctrl.ts",
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
      fileName: "iso27001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(annexes);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve annexes",
      functionName: "getAllAnnexes",
      fileName: "iso27001.ctrl.ts",
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
    fileName: "iso27001.ctrl.ts",
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
        fileName: "iso27001.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](subClauses));
    }

    await logSuccess({
      eventType: "Read",
      description: `No sub-clauses found for clause ID ${clauseId}`,
      functionName: "getSubClausesByClauseId",
      fileName: "iso27001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400]("No sub clauses found"));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve sub-clauses for clause ID ${clauseId}`,
      functionName: "getSubClausesByClauseId",
      fileName: "iso27001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAnnexControlsByAnnexId(
  req: Request,
  res: Response
): Promise<any> {
  const annexId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getAnnexControlsByAnnexId for annex ID ${annexId}`,
    functionName: "getAnnexControlsByAnnexId",
    fileName: "iso27001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(`🔍 Fetching annex controls for annex ID ${annexId}`);

  try {
    const annexControls = await getAnnexControlsByAnnexIdQuery(
      annexId,
      req.organizationId!
    );
    if (annexControls) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved annex controls for annex ID ${annexId}`,
        functionName: "getAnnexControlsByAnnexId",
        fileName: "iso27001.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](annexControls));
    }

    await logSuccess({
      eventType: "Read",
      description: `No annex controls found for annex ID ${annexId}`,
      functionName: "getAnnexControlsByAnnexId",
      fileName: "iso27001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400]("No annex controls found"));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve annex controls for annex ID ${annexId}`,
      functionName: "getAnnexControlsByAnnexId",
      fileName: "iso27001.ctrl.ts",
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
    fileName: "iso27001.ctrl.ts",
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
        fileName: "iso27001.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](subClause));
    }

    await logSuccess({
      eventType: "Read",
      description: `No sub-clause found: ID ${subClauseId} for project framework ID ${projectFrameworkId}`,
      functionName: "getSubClauseById",
      fileName: "iso27001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400]("No sub clause found"));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve sub-clause ID ${subClauseId} for project framework ID ${projectFrameworkId}`,
      functionName: "getSubClauseById",
      fileName: "iso27001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAnnexControlById(
  req: Request,
  res: Response
): Promise<any> {
  const annexControlId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const projectFrameworkId = parseInt(req.query.projectFrameworkId as string);

  logProcessing({
    description: `starting getAnnexControlById for annex control ID ${annexControlId} and project framework ID ${projectFrameworkId}`,
    functionName: "getAnnexControlById",
    fileName: "iso27001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `🔍 Looking up annex control ID ${annexControlId} for project framework ID ${projectFrameworkId}`
  );

  try {
    const annexControl = await getAnnexControlByIdForProjectQuery(
      annexControlId,
      projectFrameworkId,
      req.organizationId!
    );
    if (annexControl) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved annex control ID ${annexControlId} for project framework ID ${projectFrameworkId}`,
        functionName: "getAnnexControlById",
        fileName: "iso27001.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](annexControl));
    }

    await logSuccess({
      eventType: "Read",
      description: `No annex control found: ID ${annexControlId} for project framework ID ${projectFrameworkId}`,
      functionName: "getAnnexControlById",
      fileName: "iso27001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400]("No annex control found"));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve annex control ID ${annexControlId} for project framework ID ${projectFrameworkId}`,
      functionName: "getAnnexControlById",
      fileName: "iso27001.ctrl.ts",
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
    fileName: "iso27001.ctrl.ts",
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
        fileName: "iso27001.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](subClauses));
    }

    await logSuccess({
      eventType: "Read",
      description: `No clauses found for project framework ID ${projectFrameworkId}`,
      functionName: "getClausesByProjectId",
      fileName: "iso27001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400]("No sub clauses found"));
  } catch (error) {
    console.error(`[ISO27001 Ctrl] ERROR in getClausesByProjectId:`, error);
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve clauses for project framework ID ${projectFrameworkId}`,
      functionName: "getClausesByProjectId",
      fileName: "iso27001.ctrl.ts",
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
    fileName: "iso27001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `🔍 Fetching annexes for project framework ID ${projectFrameworkId}`
  );

  try {
    const annexControls = await getAnnexesByProjectIdQuery(
      projectFrameworkId,
      req.organizationId!
    );
    if (annexControls) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved annexes for project framework ID ${projectFrameworkId}`,
        functionName: "getAnnexesByProjectId",
        fileName: "iso27001.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](annexControls));
    }

    await logSuccess({
      eventType: "Read",
      description: `No annexes found for project framework ID ${projectFrameworkId}`,
      functionName: "getAnnexesByProjectId",
      fileName: "iso27001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400]("No annex controls found"));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve annex controls for project framework ID ${projectFrameworkId}`,
      functionName: "getAnnexesByProjectId",
      fileName: "iso27001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// Note: Files are only unlinked from evidence_links, not deleted from file manager
// This allows the same file to be used as evidence in multiple places
// The actual unlinking happens in updateSubClauseQuery/updateAnnexControlQuery

// helper function to upload files
async function uploadFiles(
  files: UploadedFile[],
  userId: number,
  projectFrameworkId: number,
  source: "Main clauses group" | "Annex controls group",
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

export async function saveClauses(
  req: RequestWithFile,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const subClauseId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting saveClauses for sub-clause ID ${subClauseId}`,
    functionName: "saveClauses",
    fileName: "iso27001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(`💾 Saving clauses for sub-clause ID ${subClauseId}`);

  try {
    const subClause = req.body as IISO27001SubClause & {
      user_id: string;
      delete: string;
      risksDelete: string;
      risksMitigated: string;
      project_id: string;
    };

    // Files to unlink (not delete) - the actual file stays in file manager
    const filesToUnlink = JSON.parse(subClause.delete || "[]") as number[];

    // Get current subclause data for assignment change detection
    const currentSubClauseResult = (await sequelize.query(
      `SELECT sc.owner, sc.reviewer, sc.approver, scs.title as title
       FROM subclauses_iso27001 sc
       LEFT JOIN subclauses_struct_iso27001 scs ON scs.id = sc.subclause_meta_id
       WHERE sc.organization_id = :organizationId AND sc.id = :id;`,
      {
        replacements: { organizationId: req.organizationId!, id: subClauseId },
        transaction,
        type: QueryTypes.SELECT,
      }
    )) as { owner: number | null; reviewer: number | null; approver: number | null; title: string }[];

    const currentData = currentSubClauseResult[0] || { owner: null, reviewer: null, approver: null, title: '' };

    // // Get project_id from subclause
    // const projectIdResult = (await sequelize.query(
    //   `SELECT pf.project_id as id FROM "${req.organizationId!}".subclauses_iso27001 sc JOIN "${req.organizationId!}".projects_frameworks pf ON pf.id = sc.projects_frameworks_id WHERE sc.id = :id;`,
    //   {
    //     replacements: { id: subClauseId },
    //     transaction,
    //   }
    // )) as [{ id: number }[], number];

    // if (projectIdResult[0].length === 0) {
    //   throw new Error("Project ID not found for subclause");
    // }

    // const projectId = projectIdResult[0][0].id;

    let uploadedFiles: FileType[] = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      uploadedFiles = await uploadFiles(
        req.files as UploadedFile[],
        parseInt(subClause.user_id),
        parseInt(subClause.project_id),
        "Main clauses group",
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
      "subclauses_iso27001",
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
      notifyIso27001Assignment(req, "ISO 27001 Subclause", subClauseId, entityName, "Owner", newOwner, currentData.owner);
    }
    if (newReviewer) {
      notifyIso27001Assignment(req, "ISO 27001 Subclause", subClauseId, entityName, "Reviewer", newReviewer, currentData.reviewer);
    }
    if (newApprover) {
      notifyIso27001Assignment(req, "ISO 27001 Subclause", subClauseId, entityName, "Approver", newApprover, currentData.approver);
    }

    await logSuccess({
      eventType: "Update",
      description: `Successfully saved clauses for sub-clause ID ${subClauseId}`,
      functionName: "saveClauses",
      fileName: "iso27001.ctrl.ts",
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
      fileName: "iso27001.ctrl.ts",
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
  const annexControlId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting saveAnnexes for annex control ID ${annexControlId}`,
    functionName: "saveAnnexes",
    fileName: "iso27001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(`💾 Saving annexes for annex control ID ${annexControlId}`);

  try {
    const annexControl = req.body as IISO27001AnnexControl & {
      user_id: string;
      project_id: string;
      delete: string;
      risksDelete: string;
      risksMitigated: string;
    };

    logger.debug(
      `Processing annex control data: ${JSON.stringify(annexControl)}`
    );
    logger.debug(`Files to unlink: ${annexControl.delete}`);
    logger.debug(
      `Files in request: ${Array.isArray(req.files) ? req.files.length : req.files ? 1 : 0
      }`
    );

    // Files to unlink (not delete) - the actual file stays in file manager
    const filesToUnlink = JSON.parse(annexControl.delete || "[]") as number[];

    // Get current annex control data for assignment change detection
    const currentAnnexResult = (await sequelize.query(
      `SELECT ac.owner, ac.reviewer, ac.approver, acs.title as control_title
       FROM annexcontrols_iso27001 ac
       LEFT JOIN annexcontrols_struct_iso27001 acs ON acs.id = ac.annexcontrol_meta_id
       WHERE ac.organization_id = :organizationId AND ac.id = :id;`,
      {
        replacements: { organizationId: req.organizationId!, id: annexControlId },
        transaction,
        type: QueryTypes.SELECT,
      }
    )) as { owner: number | null; reviewer: number | null; approver: number | null; control_title: string }[];

    const currentAnnexData = currentAnnexResult[0] || { owner: null, reviewer: null, approver: null, control_title: '' };

    // // Get project_id from annex control
    // const projectIdResult = (await sequelize.query(
    //   `SELECT pf.project_id as id FROM "${req.organizationId!}".annexcontrols_iso27001 ac JOIN "${req.organizationId!}".projects_frameworks pf ON pf.id = ac.projects_frameworks_id WHERE ac.id = :id;`,
    //   {
    //     replacements: { id: annexControlId },
    //     transaction,
    //   }
    // )) as [{ id: number }[], number];

    // if (projectIdResult[0].length === 0) {
    //   throw new Error("Project ID not found for annex control");
    // }

    // const projectId = projectIdResult[0][0].id;

    let uploadedFiles: FileType[] = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      uploadedFiles = await uploadFiles(
        req.files as UploadedFile[],
        parseInt(annexControl.user_id),
        parseInt(annexControl.project_id),
        "Annex controls group",
        req.organizationId!,
        transaction
      );
    }

    logger.debug(`Calling updateAnnexControlQuery with ID: ${annexControlId}`);
    const updatedAnnexControl = await updateAnnexControlQuery(
      annexControlId,
      annexControl,
      uploadedFiles,
      filesToUnlink,
      req.organizationId!,
      transaction
    );
    logger.debug(`updateAnnexControlQuery completed successfully`);

    // Update the project's last updated date
    try {
      await updateProjectUpdatedByIdQuery(
        annexControlId,
        "annexcontrols_iso27001",
        req.organizationId!,
        transaction
      );
    } catch (error) {
      logger.error(`Error updating project last updated date: ${error}`);
      // Continue with the transaction even if this fails
    }
    await transaction.commit();

    // Notify owner, reviewer, approver if changed
    const annexEntityName = currentAnnexData.control_title || `Annex Control #${annexControlId}`;
    const newAnnexOwner = annexControl.owner ? parseInt(String(annexControl.owner)) : null;
    const newAnnexReviewer = annexControl.reviewer ? parseInt(String(annexControl.reviewer)) : null;
    const newAnnexApprover = annexControl.approver ? parseInt(String(annexControl.approver)) : null;

    if (newAnnexOwner) {
      notifyIso27001Assignment(req, "ISO 27001 Annex Control", annexControlId, annexEntityName, "Owner", newAnnexOwner, currentAnnexData.owner);
    }
    if (newAnnexReviewer) {
      notifyIso27001Assignment(req, "ISO 27001 Annex Control", annexControlId, annexEntityName, "Reviewer", newAnnexReviewer, currentAnnexData.reviewer);
    }
    if (newAnnexApprover) {
      notifyIso27001Assignment(req, "ISO 27001 Annex Control", annexControlId, annexEntityName, "Approver", newAnnexApprover, currentAnnexData.approver);
    }

    await logSuccess({
      eventType: "Update",
      description: `Successfully saved annexes for annex control ID ${annexControlId}`,
      functionName: "saveAnnexes",
      fileName: "iso27001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](updatedAnnexControl));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `Failed to save annexes for annex control ID ${annexControlId}`,
      functionName: "saveAnnexes",
      fileName: "iso27001.ctrl.ts",
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
    fileName: "iso27001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `🗑️ Deleting management system clauses for project framework ID ${projectFrameworkId}`
  );

  try {
    const result = await deleteSubClausesISO27001ByProjectIdQuery(
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
        fileName: "iso27001.ctrl.ts",
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
      fileName: "iso27001.ctrl.ts",
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
      fileName: "iso27001.ctrl.ts",
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
    fileName: "iso27001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `🗑️ Deleting reference controls for project framework ID ${projectFrameworkId}`
  );

  try {
    const result = await deleteAnnexControlsISO27001ByProjectIdQuery(
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
        fileName: "iso27001.ctrl.ts",
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
      fileName: "iso27001.ctrl.ts",
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
      fileName: "iso27001.ctrl.ts",
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
    fileName: "iso27001.ctrl.ts",
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
      fileName: "iso27001.ctrl.ts",
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
      fileName: "iso27001.ctrl.ts",
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
    fileName: "iso27001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `📊 Calculating annexes progress for project framework ID ${projectFrameworkId}`
  );

  try {
    const { totalAnnexControls, doneAnnexControls } =
      await countAnnexControlsISOByProjectId(projectFrameworkId, req.organizationId!);

    await logSuccess({
      eventType: "Read",
      description: `Retrieved annexes progress for project framework ID ${projectFrameworkId}`,
      functionName: "getProjectAnnxesProgress",
      fileName: "iso27001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(
      STATUS_CODE[200]({
        totalAnnexControls: parseInt(totalAnnexControls),
        doneAnnexControls: parseInt(doneAnnexControls),
      })
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to get annexes progress for project framework ID ${projectFrameworkId}`,
      functionName: "getProjectAnnxesProgress",
      fileName: "iso27001.ctrl.ts",
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
    fileName: "iso27001.ctrl.ts",
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
        fileName: "iso27001.ctrl.ts",
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
        fileName: "iso27001.ctrl.ts",
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
        fileName: "iso27001.ctrl.ts",
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
      fileName: "iso27001.ctrl.ts",
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
  let allAnnexControls = 0;
  let allDoneAnnexControls = 0;

  logProcessing({
    description: "starting getAllProjectsAnnxesProgress",
    functionName: "getAllProjectsAnnxesProgress",
    fileName: "iso27001.ctrl.ts",
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
        fileName: "iso27001.ctrl.ts",
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
          const { totalAnnexControls, doneAnnexControls } =
            await countAnnexControlsISOByProjectId(
              projectFrameworkId,
              req.organizationId!
            );
          allAnnexControls += parseInt(totalAnnexControls);
          allDoneAnnexControls += parseInt(doneAnnexControls);
        })
      );

      await logSuccess({
        eventType: "Read",
        description: `Retrieved annexes progress across ${projects.length} projects`,
        functionName: "getAllProjectsAnnxesProgress",
        fileName: "iso27001.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      return res
        .status(200)
        .json(STATUS_CODE[200]({ allAnnexControls, allDoneAnnexControls }));
    } else {
      await logSuccess({
        eventType: "Read",
        description: "No projects found for annexes progress calculation",
        functionName: "getAllProjectsAnnxesProgress",
        fileName: "iso27001.ctrl.ts",
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
      fileName: "iso27001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Retrieves assignment statistics for ISO 27001 subclauses within a project framework.
 * Returns total count and number of subclauses that have been assigned to owners.
 *
 * @route GET /api/iso-27001/clauses/assignments/:id
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
    fileName: "iso27001.ctrl.ts",
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
      fileName: "iso27001.ctrl.ts",
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
      fileName: "iso27001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Retrieves assignment statistics for ISO 27001 annex controls within a project framework.
 * Returns total count and number of annex controls that have been assigned to owners.
 *
 * @route GET /api/iso-27001/annexes/assignments/:id
 * @param req - Express request object with project framework ID in params
 * @param res - Express response object
 * @returns JSON response with totalAnnexControls and assignedAnnexControls counts
 */
export async function getProjectAnnexesAssignments(
  req: Request,
  res: Response
): Promise<any> {
  const projectFrameworkId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getProjectAnnexesAssignments for project framework ID ${projectFrameworkId}`,
    functionName: "getProjectAnnexesAssignments",
    fileName: "iso27001.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(
    `📊 Calculating annexes assignments for project framework ID ${projectFrameworkId}`
  );

  try {
    const { totalAnnexControls, assignedAnnexControls } =
      await countAnnexControlAssignmentsISOByProjectId(
        projectFrameworkId,
        req.organizationId!
      );

    await logSuccess({
      eventType: "Read",
      description: `Retrieved annexes assignments for project framework ID ${projectFrameworkId}`,
      functionName: "getProjectAnnexesAssignments",
      fileName: "iso27001.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(
      STATUS_CODE[200]({
        totalAnnexControls: parseInt(totalAnnexControls),
        assignedAnnexControls: parseInt(assignedAnnexControls),
      })
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to get annexes assignments for project framework ID ${projectFrameworkId}`,
      functionName: "getProjectAnnexesAssignments",
      fileName: "iso27001.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
