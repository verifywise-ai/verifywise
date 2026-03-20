import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  deleteFileById,
  getFileById,
  getFileMetadataByProjectId,
  uploadFile,
  canUserAccessFile,
} from "../utils/fileUpload.utils";
import { RequestWithFile, UploadedFile } from "../utils/question.utils";
import { FileType } from "../domain.layer/models/file/file.model";
import { addFileToAnswerEU } from "../utils/eu.utils";
import { sequelize } from "../database/db";
import getUserFilesMetaDataQuery from "../utils/files/getUserFilesMetaData.utils";
import {
  logProcessing,
  logSuccess,
  logFailure,
} from "../utils/logger/logHelper";
import {
  createFileEntityLink,
  deleteFileEntityLink,
  getFilesWithMetadataForEntity,
  FrameworkType,
  EntityType,
  LinkType,
} from "../repositories/file.repository";

export async function getFileContentById(
  req: Request,
  res: Response
): Promise<any> {
  const fileId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  // Validate fileId is a valid number
  if (isNaN(fileId)) {
    return res.status(400).json({ message: "Invalid file ID" });
  }

  // Validate authentication - these should be set by authenticateJWT middleware
  if (!req.userId) {
    return res.status(401).json({ message: "Unauthenticated" });
  }
  if (!req.organizationId) {
    return res.status(400).json({ message: "Missing tenant" });
  }

  const userId = req.userId;
  const role = req.role || "";

  logProcessing({
    description: `starting getFileContentById for ID ${fileId}`,
    functionName: "getFileContentById",
    fileName: "file.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    // Authorization check: verify user has access to this file
    const orgId = req.organizationId ? Number(req.organizationId) : undefined;
    const hasAccess = await canUserAccessFile(fileId, userId, role, req.organizationId!, orgId);
    if (!hasAccess) {
      await logFailure({
        eventType: "Read",
        description: `Access denied to file ID ${fileId} for user ${userId}`,
        functionName: "getFileContentById",
        fileName: "file.ctrl.ts",
        error: new Error(`User ${userId} with role '${role}' denied access to file ${fileId}`),
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(403).json({ message: "Access denied" });
    }

    const file = await getFileById(fileId, req.organizationId!);
    if (file) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved file content for ID ${req.params.id}`,
        functionName: "getFileContentById",
        fileName: "file.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      res.setHeader("Content-Type", file.type);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${file.filename}"`
      );
      return res.status(200).end(file.content);
    }

    await logSuccess({
      eventType: "Read",
      description: `File not found: ID ${req.params.id}`,
      functionName: "getFileContentById",
      fileName: "file.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve file content",
      functionName: "getFileContentById",
      fileName: "file.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getFileMetaByProjectId(
  req: Request,
  res: Response
): Promise<any> {
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getFileMetaByProjectId for project ID ${projectId}`,
    functionName: "getFileMetaByProjectId",
    fileName: "file.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const files = await getFileMetadataByProjectId(projectId, req.organizationId!);
    await logSuccess({
      eventType: "Read",
      description: `Retrieved file metadata for project ID ${projectId}`,
      functionName: "getFileMetaByProjectId",
      fileName: "file.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    if (files && files.length > 0) {
      return res.status(200).send(files);
    }
    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve file metadata",
      functionName: "getFileMetaByProjectId",
      fileName: "file.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export const getUserFilesMetaData = async (req: Request, res: Response) => {
  const userId = Number(req.userId);

  // Validate pagination parameters
  const page = req.query.page ? Number(Array.isArray(req.query.page) ? req.query.page[0] : req.query.page) : undefined;
  const pageSize = req.query.pageSize ? Number(Array.isArray(req.query.pageSize) ? req.query.pageSize[0] : req.query.pageSize) : undefined;

  logProcessing({
    description: `starting getUserFilesMetaData for user ID ${userId}`,
    functionName: "getUserFilesMetaData",
    fileName: "file.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const validPage = page && page > 0 ? page : undefined;
    const validPageSize = pageSize && pageSize > 0 ? pageSize : undefined;
    const offset =
      validPage !== undefined && validPageSize !== undefined
        ? (validPage - 1) * validPageSize
        : undefined;

    const files = await getUserFilesMetaDataQuery(
      req.role || "",
      userId,
      req.organizationId!,
      {
        limit: validPageSize,
        offset,
      }
    );

    await logSuccess({
      eventType: "Read",
      description: `Retrieved user files metadata for user ID ${userId}`,
      functionName: "getUserFilesMetaData",
      fileName: "file.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).send(files);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve user files metadata",
      functionName: "getUserFilesMetaData",
      fileName: "file.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json({ error: "Internal server error" });
  }
};

export async function postFileContent(
  req: RequestWithFile,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();

  logProcessing({
    description: "starting postFileContent",
    functionName: "postFileContent",
    fileName: "file.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const body = req.body as {
      question_id: string;
      project_id: number;
      user_id: number;
      delete: string;
    };

    const filesToDelete = JSON.parse(body.delete || "[]") as number[];
    for (let fileToDelete of filesToDelete) {
      await deleteFileById(fileToDelete, req.organizationId!, transaction);
    }

    const questionId = parseInt(body.question_id);
    let uploadedFiles: FileType[] = [];
    for (let file of req.files! as UploadedFile[]) {
      const uploadedFile = await uploadFile(
        file,
        body.user_id,
        body.project_id,
        "Assessment tracker group",
        req.organizationId!,
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
    }

    const question = await addFileToAnswerEU(
      questionId,
      body.project_id,
      uploadedFiles,
      filesToDelete,
      req.organizationId!,
      transaction
    );
    await transaction.commit();

    await logSuccess({
      eventType: "Create",
      description: "Posted file content and updated answer evidence",
      functionName: "postFileContent",
      fileName: "file.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(201).json(STATUS_CODE[201](question.evidence_files));
  } catch (error) {
    await transaction.rollback();

    await logFailure({
      eventType: "Create",
      description: "Failed to upload and associate file content",
      functionName: "postFileContent",
      fileName: "file.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Attaches an existing file to an entity (control, assessment, subclause, etc.)
 * Works across all frameworks: EU AI Act, NIST AI, ISO 27001, ISO 42001, plugins
 *
 * POST /files/attach
 * Body: { file_id, framework_type, entity_type, entity_id, project_id?, link_type? }
 */
export async function attachFileToEntity(
  req: Request,
  res: Response
): Promise<any> {
  const { file_id, framework_type, entity_type, entity_id, project_id, link_type } = req.body;

  // Validate required fields
  if (!file_id || !framework_type || !entity_type || !entity_id) {
    return res.status(400).json({
      message: "Missing required fields: file_id, framework_type, entity_type, entity_id",
    });
  }

  if (!req.userId) {
    return res.status(401).json({ message: "Unauthenticated" });
  }
  if (!req.organizationId) {
    return res.status(400).json({ message: "Missing tenant" });
  }

  logProcessing({
    description: `Attaching file ${file_id} to ${framework_type}/${entity_type}/${entity_id}`,
    functionName: "attachFileToEntity",
    fileName: "file.ctrl.ts",
    userId: req.userId,
    tenantId: req.organizationId,
  });

  try {
    const link = await createFileEntityLink(
      {
        file_id: parseInt(file_id, 10),
        framework_type: framework_type as FrameworkType,
        entity_type: entity_type as EntityType,
        entity_id: parseInt(entity_id, 10),
        project_id: project_id ? parseInt(project_id, 10) : undefined,
        link_type: (link_type as LinkType) || "evidence",
        created_by: req.userId,
      },
      req.organizationId!
    );

    await logSuccess({
      eventType: "Create",
      description: `Attached file ${file_id} to ${framework_type}/${entity_type}/${entity_id}`,
      functionName: "attachFileToEntity",
      fileName: "file.ctrl.ts",
      userId: req.userId,
      tenantId: req.organizationId,
    });

    if (link) {
      return res.status(201).json({ message: "File attached successfully", link });
    } else {
      // ON CONFLICT DO NOTHING means already exists
      return res.status(200).json({ message: "File already attached to this entity" });
    }
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "Failed to attach file to entity",
      functionName: "attachFileToEntity",
      fileName: "file.ctrl.ts",
      error: error as Error,
      userId: req.userId,
      tenantId: req.organizationId,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Detaches a file from an entity
 *
 * DELETE /files/detach
 * Body: { file_id, framework_type, entity_type, entity_id }
 */
export async function detachFileFromEntity(
  req: Request,
  res: Response
): Promise<any> {
  const { file_id, framework_type, entity_type, entity_id } = req.body;

  // Validate required fields
  if (!file_id || !framework_type || !entity_type || !entity_id) {
    return res.status(400).json({
      message: "Missing required fields: file_id, framework_type, entity_type, entity_id",
    });
  }

  if (!req.userId) {
    return res.status(401).json({ message: "Unauthenticated" });
  }
  if (!req.organizationId) {
    return res.status(400).json({ message: "Missing tenant" });
  }

  logProcessing({
    description: `Detaching file ${file_id} from ${framework_type}/${entity_type}/${entity_id}`,
    functionName: "detachFileFromEntity",
    fileName: "file.ctrl.ts",
    userId: req.userId,
    tenantId: req.organizationId,
  });

  try {
    const deleted = await deleteFileEntityLink(
      parseInt(file_id, 10),
      framework_type as FrameworkType,
      entity_type as EntityType,
      parseInt(entity_id, 10),
      req.organizationId!
    );

    await logSuccess({
      eventType: "Delete",
      description: `Detached file ${file_id} from ${framework_type}/${entity_type}/${entity_id}`,
      functionName: "detachFileFromEntity",
      fileName: "file.ctrl.ts",
      userId: req.userId,
      tenantId: req.organizationId,
    });

    if (deleted) {
      return res.status(200).json({ message: "File detached successfully" });
    } else {
      return res.status(404).json({ message: "File link not found" });
    }
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: "Failed to detach file from entity",
      functionName: "detachFileFromEntity",
      fileName: "file.ctrl.ts",
      error: error as Error,
      userId: req.userId,
      tenantId: req.organizationId,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Attaches multiple files to an entity at once
 *
 * POST /files/attach-bulk
 * Body: { file_ids: number[], framework_type, entity_type, entity_id, project_id?, link_type? }
 */
export async function attachFilesToEntity(
  req: Request,
  res: Response
): Promise<any> {
  const { file_ids, framework_type, entity_type, entity_id, project_id, link_type } = req.body;

  // Validate required fields
  if (!file_ids || !Array.isArray(file_ids) || file_ids.length === 0) {
    return res.status(400).json({
      message: "Missing or invalid file_ids array",
    });
  }
  if (!framework_type || !entity_type || !entity_id) {
    return res.status(400).json({
      message: "Missing required fields: framework_type, entity_type, entity_id",
    });
  }

  if (!req.userId) {
    return res.status(401).json({ message: "Unauthenticated" });
  }
  if (!req.organizationId) {
    return res.status(400).json({ message: "Missing tenant" });
  }

  logProcessing({
    description: `Attaching ${file_ids.length} files to ${framework_type}/${entity_type}/${entity_id}`,
    functionName: "attachFilesToEntity",
    fileName: "file.ctrl.ts",
    userId: req.userId,
    tenantId: req.organizationId,
  });

  try {
    const results: { file_id: number; success: boolean; message: string }[] = [];

    for (const fileId of file_ids) {
      try {
        const link = await createFileEntityLink(
          {
            file_id: parseInt(fileId, 10),
            framework_type: framework_type as FrameworkType,
            entity_type: entity_type as EntityType,
            entity_id: parseInt(entity_id, 10),
            project_id: project_id ? parseInt(project_id, 10) : undefined,
            link_type: (link_type as LinkType) || "evidence",
            created_by: req.userId,
          },
          req.organizationId!
        );

        results.push({
          file_id: fileId,
          success: true,
          message: link ? "Attached" : "Already attached",
        });
      } catch (err) {
        results.push({
          file_id: fileId,
          success: false,
          message: (err as Error).message,
        });
      }
    }

    await logSuccess({
      eventType: "Create",
      description: `Attached ${results.filter(r => r.success).length}/${file_ids.length} files to ${framework_type}/${entity_type}/${entity_id}`,
      functionName: "attachFilesToEntity",
      fileName: "file.ctrl.ts",
      userId: req.userId,
      tenantId: req.organizationId,
    });

    return res.status(200).json({
      message: "Bulk attach completed",
      results,
    });
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "Failed to bulk attach files to entity",
      functionName: "attachFilesToEntity",
      fileName: "file.ctrl.ts",
      error: error as Error,
      userId: req.userId,
      tenantId: req.organizationId,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Gets all files attached to a specific entity
 *
 * GET /files/entity/:framework_type/:entity_type/:entity_id
 */
export async function getEntityFiles(
  req: Request,
  res: Response
): Promise<any> {
  const { framework_type, entity_type, entity_id } = req.params;

  // Validate required params
  if (!framework_type || !entity_type || !entity_id) {
    return res.status(400).json({
      message: "Missing required params: framework_type, entity_type, entity_id",
    });
  }

  if (!req.userId) {
    return res.status(401).json({ message: "Unauthenticated" });
  }
  if (!req.organizationId) {
    return res.status(400).json({ message: "Missing tenant" });
  }

  logProcessing({
    description: `Getting files for ${framework_type}/${entity_type}/${entity_id}`,
    functionName: "getEntityFiles",
    fileName: "file.ctrl.ts",
    userId: req.userId,
    tenantId: req.organizationId,
  });

  try {
    const entityIdStr = Array.isArray(entity_id) ? entity_id[0] : entity_id;
    const files = await getFilesWithMetadataForEntity(
      framework_type as FrameworkType,
      entity_type as EntityType,
      parseInt(entityIdStr, 10),
      req.organizationId!
    );

    await logSuccess({
      eventType: "Read",
      description: `Retrieved ${files.length} files for ${framework_type}/${entity_type}/${entity_id}`,
      functionName: "getEntityFiles",
      fileName: "file.ctrl.ts",
      userId: req.userId,
      tenantId: req.organizationId,
    });

    return res.status(200).json(files);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to get entity files",
      functionName: "getEntityFiles",
      fileName: "file.ctrl.ts",
      error: error as Error,
      userId: req.userId,
      tenantId: req.organizationId,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
