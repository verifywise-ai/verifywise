import { Request, Response } from "express";
import { sequelize } from "../database/db";
import { SubClauseISO } from "../domain.layer/frameworks/ISO-42001/subClauseISO.model";
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
  getCurrentSubClauseForSaveQuery,
  getCurrentAnnexCategoryForSaveQuery,
  uploadIso42001Files,
  aggregateClausesProgressAcrossProjects,
  aggregateAnnexesProgressAcrossProjects,
} from "../utils/iso42001.utils";
import { FileType } from "../domain.layer/models/file/file.model";
import { AnnexCategoryISO } from "../domain.layer/frameworks/ISO-42001/annexCategoryISO.model";
import { getAllProjectsQuery, updateProjectUpdatedByIdQuery } from "../utils/project.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import { translateError } from "../utils/i18n.utils";
import { controllerWrapper } from "../utils/controllerWrapper.utils";
import { ValidationException, NotFoundException } from "../domain.layer/exceptions/custom.exception";
import { notifyIso42001Assignment } from "../services/iso42001/iso42001Notification.service";

const FILE_NAME = "iso42001.ctrl.ts";

// ---------------------------------------------------------------------------
// Raw-shape responses (frontend reads response body as the data directly).
// Kept manually wrapped to preserve the wire contract.
// ---------------------------------------------------------------------------

export async function getAllClauses(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getAllClauses",
    functionName: "getAllClauses",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const clauses = await getAllClausesQuery(req.organizationId!);
    await logSuccess({
      eventType: "Read",
      description: "Retrieved all clauses",
      functionName: "getAllClauses",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(clauses);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve clauses",
      functionName: "getAllClauses",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getAllClausesStructForProject(req: Request, res: Response): Promise<any> {
  const projectFrameworkId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
  );

  logProcessing({
    description: `starting getAllClausesStructForProject for project framework ID ${projectFrameworkId}`,
    functionName: "getAllClausesStructForProject",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const clauses = await getAllClausesWithSubClauseQuery(projectFrameworkId, req.organizationId!);
    await logSuccess({
      eventType: "Read",
      description: `Retrieved clauses structure for project framework ID ${projectFrameworkId}`,
      functionName: "getAllClausesStructForProject",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(clauses);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve clauses structure for project framework ID ${projectFrameworkId}`,
      functionName: "getAllClausesStructForProject",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getAllAnnexesStructForProject(req: Request, res: Response): Promise<any> {
  const projectFrameworkId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
  );

  logProcessing({
    description: `starting getAllAnnexesStructForProject for project framework ID ${projectFrameworkId}`,
    functionName: "getAllAnnexesStructForProject",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const annexes = await getAllAnnexesWithCategoriesQuery(projectFrameworkId, req.organizationId!);
    await logSuccess({
      eventType: "Read",
      description: `Retrieved annexes structure for project framework ID ${projectFrameworkId}`,
      functionName: "getAllAnnexesStructForProject",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(annexes);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve annexes structure for project framework ID ${projectFrameworkId}`,
      functionName: "getAllAnnexesStructForProject",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getAllAnnexes(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getAllAnnexes",
    functionName: "getAllAnnexes",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const annexes = await getAllAnnexesQuery(req.organizationId!);
    await logSuccess({
      eventType: "Read",
      description: "Retrieved all annexes",
      functionName: "getAllAnnexes",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(annexes);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve annexes",
      functionName: "getAllAnnexes",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

// ---------------------------------------------------------------------------
// STATUS_CODE-wrapped reads (controllerWrapper handles the boilerplate).
// ---------------------------------------------------------------------------

export const getSubClausesByClauseId = controllerWrapper(
  async (req) => {
    const clauseId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const projectFrameworkId = parseInt(req.query.projectFrameworkId as string);

    if (!projectFrameworkId || isNaN(projectFrameworkId)) {
      throw new ValidationException(
        req.t!("projectFrameworkId query param is required"),
        "projectFrameworkId",
      );
    }

    const subClauses = await getSubClausesByClauseIdQuery(
      clauseId,
      req.organizationId!,
      projectFrameworkId,
    );
    if (!subClauses) {
      throw new ValidationException(req.t!("No sub clauses found"), "clauseId", clauseId);
    }
    return { status: 200, data: subClauses };
  },
  { functionName: "getSubClausesByClauseId", fileName: FILE_NAME, eventType: "Read" },
);

export const getAnnexCategoriesByAnnexId = controllerWrapper(
  async (req) => {
    const annexId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const annexCategories = await getAnnexCategoriesByAnnexIdQuery(annexId, req.organizationId!);
    if (!annexCategories) {
      throw new ValidationException(req.t!("No annex categories found"), "annexId", annexId);
    }
    return { status: 200, data: annexCategories };
  },
  { functionName: "getAnnexCategoriesByAnnexId", fileName: FILE_NAME, eventType: "Read" },
);

export const getSubClauseById = controllerWrapper(
  async (req) => {
    const subClauseId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const projectFrameworkId = parseInt(req.query.projectFrameworkId as string);
    const subClause = await getSubClauseByIdForProjectQuery(
      subClauseId,
      projectFrameworkId,
      req.organizationId!,
    );
    if (!subClause) {
      throw new ValidationException(req.t!("No sub clause found"), "subClauseId", subClauseId);
    }
    return { status: 200, data: subClause };
  },
  { functionName: "getSubClauseById", fileName: FILE_NAME, eventType: "Read" },
);

export const getAnnexCategoryById = controllerWrapper(
  async (req) => {
    const annexCategoryId = parseInt(
      Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    );
    const projectFrameworkId = parseInt(req.query.projectFrameworkId as string);
    const annexCategory = await getAnnexCategoryByIdForProjectQuery(
      annexCategoryId,
      projectFrameworkId,
      req.organizationId!,
    );
    if (!annexCategory) {
      throw new ValidationException(
        req.t!("No annex category found"),
        "annexCategoryId",
        annexCategoryId,
      );
    }
    return { status: 200, data: annexCategory };
  },
  { functionName: "getAnnexCategoryById", fileName: FILE_NAME, eventType: "Read" },
);

export const getClausesByProjectId = controllerWrapper(
  async (req) => {
    const projectFrameworkId = parseInt(
      Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    );
    const subClauses = await getClausesByProjectIdQuery(projectFrameworkId, req.organizationId!);
    if (!subClauses) {
      throw new ValidationException(
        req.t!("No sub clauses found"),
        "projectFrameworkId",
        projectFrameworkId,
      );
    }
    return { status: 200, data: subClauses };
  },
  { functionName: "getClausesByProjectId", fileName: FILE_NAME, eventType: "Read" },
);

export const getAnnexesByProjectId = controllerWrapper(
  async (req) => {
    const projectFrameworkId = parseInt(
      Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    );
    const annexCategories = await getAnnexesByProjectIdQuery(
      projectFrameworkId,
      req.organizationId!,
    );
    if (!annexCategories) {
      throw new ValidationException(
        req.t!("No annex categories found"),
        "projectFrameworkId",
        projectFrameworkId,
      );
    }
    return { status: 200, data: annexCategories };
  },
  { functionName: "getAnnexesByProjectId", fileName: FILE_NAME, eventType: "Read" },
);

export const getSubClauseRisks = controllerWrapper(
  async (req) => {
    const subclauseId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const risks = await getSubClauseRisksQuery(subclauseId, req.organizationId!);
    return { status: 200, data: risks };
  },
  { functionName: "getSubClauseRisks", fileName: FILE_NAME, eventType: "Read" },
);

export const getAnnexCategoryRisks = controllerWrapper(
  async (req) => {
    const annexCategoryId = parseInt(
      Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    );
    const risks = await getAnnexCategoryRisksQuery(annexCategoryId, req.organizationId!);
    return { status: 200, data: risks };
  },
  { functionName: "getAnnexCategoryRisks", fileName: FILE_NAME, eventType: "Read" },
);

export const getProjectClausesProgress = controllerWrapper(
  async (req) => {
    const projectFrameworkId = parseInt(
      Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    );
    const { totalSubclauses, doneSubclauses } = await countSubClausesISOByProjectId(
      projectFrameworkId,
      req.organizationId!,
    );
    return {
      status: 200,
      data: {
        totalSubclauses: parseInt(totalSubclauses),
        doneSubclauses: parseInt(doneSubclauses),
      },
    };
  },
  { functionName: "getProjectClausesProgress", fileName: FILE_NAME, eventType: "Read" },
);

export const getProjectAnnxesProgress = controllerWrapper(
  async (req) => {
    const projectFrameworkId = parseInt(
      Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    );
    const { totalAnnexcategories, doneAnnexcategories } = await countAnnexCategoriesISOByProjectId(
      projectFrameworkId,
      req.organizationId!,
    );
    return {
      status: 200,
      data: {
        totalAnnexcategories: parseInt(totalAnnexcategories),
        doneAnnexcategories: parseInt(doneAnnexcategories),
      },
    };
  },
  { functionName: "getProjectAnnxesProgress", fileName: FILE_NAME, eventType: "Read" },
);

export const getAllProjectsClausesProgress = controllerWrapper(
  async (req) => {
    const { userId, role } = req;
    if (!userId || !role) {
      throw new ValidationException(req.t!("Unauthorized"), "userId");
    }
    const projects = await getAllProjectsQuery({ userId, role }, req.organizationId!);
    if (!projects || projects.length === 0) {
      throw new NotFoundException("No projects found", "projects");
    }
    const aggregate = await aggregateClausesProgressAcrossProjects(projects, req.organizationId!);
    return { status: 200, data: aggregate };
  },
  { functionName: "getAllProjectsClausesProgress", fileName: FILE_NAME, eventType: "Read" },
);

export const getAllProjectsAnnxesProgress = controllerWrapper(
  async (req) => {
    const { userId, role } = req;
    if (!userId || !role) {
      throw new ValidationException(req.t!("Unauthorized"), "userId");
    }
    const projects = await getAllProjectsQuery({ userId, role }, req.organizationId!);
    if (!projects || projects.length === 0) {
      throw new NotFoundException("No projects found", "projects");
    }
    const aggregate = await aggregateAnnexesProgressAcrossProjects(projects, req.organizationId!);
    return { status: 200, data: aggregate };
  },
  { functionName: "getAllProjectsAnnxesProgress", fileName: FILE_NAME, eventType: "Read" },
);

export const getProjectClausesAssignments = controllerWrapper(
  async (req) => {
    const projectFrameworkId = parseInt(
      Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    );
    const { totalSubclauses, assignedSubclauses } = await countSubClauseAssignmentsISOByProjectId(
      projectFrameworkId,
      req.organizationId!,
    );
    return {
      status: 200,
      data: {
        totalSubclauses: parseInt(totalSubclauses),
        assignedSubclauses: parseInt(assignedSubclauses),
      },
    };
  },
  { functionName: "getProjectClausesAssignments", fileName: FILE_NAME, eventType: "Read" },
);

export const getProjectAnnexesAssignments = controllerWrapper(
  async (req) => {
    const projectFrameworkId = parseInt(
      Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    );
    const { totalAnnexcategories, assignedAnnexcategories } =
      await countAnnexCategoryAssignmentsISOByProjectId(projectFrameworkId, req.organizationId!);
    return {
      status: 200,
      data: {
        totalAnnexcategories: parseInt(totalAnnexcategories),
        assignedAnnexcategories: parseInt(assignedAnnexcategories),
      },
    };
  },
  { functionName: "getProjectAnnexesAssignments", fileName: FILE_NAME, eventType: "Read" },
);

// ---------------------------------------------------------------------------
// Save / delete operations (transactional, mixed concerns, kept manual)
// ---------------------------------------------------------------------------

function parseFilesToUnlink(raw: string | undefined): number[] {
  const parsed = JSON.parse(raw || "[]");
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((id: string | number) => (typeof id === "string" ? parseInt(id) : id))
    .filter((id: number) => !isNaN(id));
}

export async function saveClauses(req: RequestWithFile, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();
  const subClauseId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting saveClauses for sub-clause ID ${subClauseId}`,
    functionName: "saveClauses",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const subClause = req.body as SubClauseISO & {
      user_id: string;
      delete: string;
      risksDelete: string;
      risksMitigated: string;
      project_id: string;
    };

    const filesToUnlink = parseFilesToUnlink(subClause.delete);

    const currentData = await getCurrentSubClauseForSaveQuery(
      subClauseId,
      req.organizationId!,
      transaction,
    );
    if (!currentData) {
      throw new Error("Subclause not found");
    }

    let uploadedFiles: FileType[] = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      uploadedFiles = await uploadIso42001Files(
        req.files as UploadedFile[],
        parseInt(subClause.user_id),
        currentData.project_id,
        "Management system clauses group",
        req.organizationId!,
        transaction,
      );
    }

    const updatedSubClause = await updateSubClauseQuery(
      subClauseId,
      subClause,
      uploadedFiles,
      filesToUnlink,
      req.organizationId!,
      transaction,
    );

    await updateProjectUpdatedByIdQuery(
      subClauseId,
      "subclauses",
      req.organizationId!,
      transaction,
    );
    await transaction.commit();

    const entityName = currentData.title || `Subclause #${subClauseId}`;
    const newOwner = subClause.owner ? parseInt(String(subClause.owner)) : null;
    const newReviewer = subClause.reviewer ? parseInt(String(subClause.reviewer)) : null;
    const newApprover = subClause.approver ? parseInt(String(subClause.approver)) : null;

    if (newOwner) {
      notifyIso42001Assignment({
        organizationId: req.organizationId!,
        assignerUserId: req.userId!,
        entityType: "ISO 42001 Subclause",
        entityId: subClauseId,
        entityName,
        roleType: "Owner",
        newUserId: newOwner,
        oldUserId: currentData.owner,
      });
    }
    if (newReviewer) {
      notifyIso42001Assignment({
        organizationId: req.organizationId!,
        assignerUserId: req.userId!,
        entityType: "ISO 42001 Subclause",
        entityId: subClauseId,
        entityName,
        roleType: "Reviewer",
        newUserId: newReviewer,
        oldUserId: currentData.reviewer,
      });
    }
    if (newApprover) {
      notifyIso42001Assignment({
        organizationId: req.organizationId!,
        assignerUserId: req.userId!,
        entityType: "ISO 42001 Subclause",
        entityId: subClauseId,
        entityName,
        roleType: "Approver",
        newUserId: newApprover,
        oldUserId: currentData.approver,
      });
    }

    await logSuccess({
      eventType: "Update",
      description: `Successfully saved clauses for sub-clause ID ${subClauseId}`,
      functionName: "saveClauses",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](updatedSubClause));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `Failed to save clauses for sub-clause ID ${subClauseId}`,
      functionName: "saveClauses",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function saveAnnexes(req: RequestWithFile, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();
  const annexCategoryId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting saveAnnexes for annex category ID ${annexCategoryId}`,
    functionName: "saveAnnexes",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const annexCategory = req.body as AnnexCategoryISO & {
      user_id: string;
      project_id: string;
      delete: string;
      risksDelete: string;
      risksMitigated: string;
    };

    const filesToUnlink = parseFilesToUnlink(annexCategory.delete);

    const currentAnnexData = await getCurrentAnnexCategoryForSaveQuery(
      annexCategoryId,
      req.organizationId!,
      transaction,
    );
    if (!currentAnnexData) {
      throw new Error("Annex category not found");
    }

    let uploadedFiles: FileType[] = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      uploadedFiles = await uploadIso42001Files(
        req.files as UploadedFile[],
        parseInt(annexCategory.user_id),
        currentAnnexData.project_id,
        "Reference controls group",
        req.organizationId!,
        transaction,
      );
    }

    const updatedAnnexCategory = await updateAnnexCategoryQuery(
      annexCategoryId,
      annexCategory,
      uploadedFiles,
      filesToUnlink,
      req.organizationId!,
      transaction,
    );

    await updateProjectUpdatedByIdQuery(
      annexCategoryId,
      "annexcategories",
      req.organizationId!,
      transaction,
    );
    await transaction.commit();

    const annexEntityName = currentAnnexData.title || `Annex Category #${annexCategoryId}`;
    const newAnnexOwner = annexCategory.owner ? parseInt(String(annexCategory.owner)) : null;
    const newAnnexReviewer = annexCategory.reviewer
      ? parseInt(String(annexCategory.reviewer))
      : null;
    const newAnnexApprover = annexCategory.approver
      ? parseInt(String(annexCategory.approver))
      : null;

    if (newAnnexOwner) {
      notifyIso42001Assignment({
        organizationId: req.organizationId!,
        assignerUserId: req.userId!,
        entityType: "ISO 42001 Annex",
        entityId: annexCategoryId,
        entityName: annexEntityName,
        roleType: "Owner",
        newUserId: newAnnexOwner,
        oldUserId: currentAnnexData.owner,
      });
    }
    if (newAnnexReviewer) {
      notifyIso42001Assignment({
        organizationId: req.organizationId!,
        assignerUserId: req.userId!,
        entityType: "ISO 42001 Annex",
        entityId: annexCategoryId,
        entityName: annexEntityName,
        roleType: "Reviewer",
        newUserId: newAnnexReviewer,
        oldUserId: currentAnnexData.reviewer,
      });
    }
    if (newAnnexApprover) {
      notifyIso42001Assignment({
        organizationId: req.organizationId!,
        assignerUserId: req.userId!,
        entityType: "ISO 42001 Annex",
        entityId: annexCategoryId,
        entityName: annexEntityName,
        roleType: "Approver",
        newUserId: newAnnexApprover,
        oldUserId: currentAnnexData.approver,
      });
    }

    await logSuccess({
      eventType: "Update",
      description: `Successfully saved annexes for annex category ID ${annexCategoryId}`,
      functionName: "saveAnnexes",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](updatedAnnexCategory));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `Failed to save annexes for annex category ID ${annexCategoryId}`,
      functionName: "saveAnnexes",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function deleteManagementSystemClauses(req: Request, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();
  const projectFrameworkId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
  );

  logProcessing({
    description: `starting deleteManagementSystemClauses for project framework ID ${projectFrameworkId}`,
    functionName: "deleteManagementSystemClauses",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const result = await deleteSubClausesISOByProjectIdQuery(
      projectFrameworkId,
      req.organizationId!,
      transaction,
    );

    if (result) {
      await transaction.commit();
      await logSuccess({
        eventType: "Delete",
        description: `Successfully deleted management system clauses for project framework ID ${projectFrameworkId}`,
        functionName: "deleteManagementSystemClauses",
        fileName: FILE_NAME,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](result));
    }

    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete management system clauses for project framework ID ${projectFrameworkId}`,
      functionName: "deleteManagementSystemClauses",
      fileName: FILE_NAME,
      error: new Error("Delete operation failed"),
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400](result));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete management system clauses for project framework ID ${projectFrameworkId}`,
      functionName: "deleteManagementSystemClauses",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function deleteReferenceControls(req: Request, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();
  const projectFrameworkId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
  );

  logProcessing({
    description: `starting deleteReferenceControls for project framework ID ${projectFrameworkId}`,
    functionName: "deleteReferenceControls",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const result = await deleteAnnexCategoriesISOByProjectIdQuery(
      projectFrameworkId,
      req.organizationId!,
      transaction,
    );

    if (result) {
      await transaction.commit();
      await logSuccess({
        eventType: "Delete",
        description: `Successfully deleted reference controls for project framework ID ${projectFrameworkId}`,
        functionName: "deleteReferenceControls",
        fileName: FILE_NAME,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](result));
    }

    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete reference controls for project framework ID ${projectFrameworkId}`,
      functionName: "deleteReferenceControls",
      fileName: FILE_NAME,
      error: new Error("Delete operation failed"),
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400](result));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete reference controls for project framework ID ${projectFrameworkId}`,
      functionName: "deleteReferenceControls",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
