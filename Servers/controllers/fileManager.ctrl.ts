/**
 * @fileoverview File Manager Controller
 *
 * Handles HTTP requests for file manager operations: upload, list, search,
 * download, remove, metadata get/update, listFilesWithMetadata, highlighted,
 * preview, version history. Per-file authorization is delegated to
 * services/fileIngestion/fileAccessControl.service.
 *
 * Access Control:
 * - Upload: Admin, Reviewer, Editor only (enforced by route middleware)
 * - List/Download: All authenticated users
 *
 * @module controllers/fileManager
 */

import { Request, Response } from "express";
import "multer";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  uploadOrganizationFile,
  getFileById,
  getOrganizationFiles,
  getOrganizationFilesWithMetadata,
  logFileAccess,
  deleteFileById,
  updateFileMetadata,
  getFileWithMetadata,
  getHighlightedFiles,
  getFilePreview,
  getFileVersionHistory as getFileVersionHistoryRepo,
  FileSource,
  UpdateFileMetadataInput,
  UploadOrganizationFileOptions,
  searchFilesByContent,
  FileContentSearchOptions,
  getApprovalWorkflowForFile,
  getApprovalWorkflowStepsWithApprovers,
  setFileApprovalRequestId,
} from "../repositories/file.repository";
import { sequelize } from "../database/db";
import { ApprovalWorkflowStepModel } from "../domain.layer/models/approvalWorkflow/approvalWorkflowStep.model";
import { ApprovalRequestStatus } from "../domain.layer/enums/approval-workflow.enum";
import {
  createApprovalRequestQuery,
  rejectApprovalRequestOnEntityDelete,
} from "../utils/approvalRequest.utils";
import { notifyStepApprovers, notifyRequesterRejected } from "../services/notification.service";
import {
  validateFileUpload,
  formatFileSize,
  parseValidFileId,
  parsePaginationQuery,
  validatePagination,
  validateFileMetadataUpdate,
} from "../utils/validations/fileManagerValidation.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import { trackEntityChanges, recordMultipleFieldChanges } from "../utils/changeHistory.base.utils";
import { assertFileAccess } from "../services/fileIngestion/fileAccessControl.service";
import { indexFileContent } from "../services/fileIngestion/fileContentIndexer.service";

const FILE_NAME = "fileManager.ctrl.ts";

// ---------------------------------------------------------------------------
// Local helpers (controller-scoped wiring, not domain logic)
// ---------------------------------------------------------------------------

const validateAndParseAuth = (
  req: Request,
  res: Response,
): { userId: number; orgId: number } | null => {
  const userId = Number(req.userId);
  const orgId = Number(req.organizationId);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    res.status(400).json(STATUS_CODE[400](req.t!("Invalid user ID")));
    return null;
  }
  if (!Number.isSafeInteger(orgId) || orgId <= 0) {
    res.status(400).json(STATUS_CODE[400](req.t!("Invalid organization ID")));
    return null;
  }
  return { userId, orgId };
};

const hasPermission = (req: Request, action: string, allowedRoles: string[]): boolean => {
  const userRole = (req as any).role;
  if (!userRole) {
    console.warn(`Permission check failed for action '${action}': No role found in request`);
    return false;
  }
  const hasAccess = allowedRoles.includes(userRole);
  if (!hasAccess) {
    console.warn(
      `Permission denied: User with role '${userRole}' attempted '${action}' action. Allowed roles: [${allowedRoles.join(", ")}]`,
    );
  }
  return hasAccess;
};

const sendInvalidFileId = (req: Request, res: Response) =>
  res.status(400).json(STATUS_CODE[400](req.t!("Invalid file ID")));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const uploadFile = async (req: Request, res: Response): Promise<any> => {
  logProcessing({
    description: "Starting file upload to file manager",
    functionName: "uploadFile",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const file = req.file as Express.Multer.File;

    let modelId: number | undefined;
    if (req.body.model_id != null && req.body.model_id !== "") {
      const parsed = Number(req.body.model_id);
      if (!isNaN(parsed)) modelId = parsed;
    }

    let approvalWorkflowId: number | undefined;
    if (req.body.approval_workflow_id != null && req.body.approval_workflow_id !== "") {
      const parsed = Number(req.body.approval_workflow_id);
      if (!isNaN(parsed)) approvalWorkflowId = parsed;
    }

    const source: FileSource = (req.body.source as FileSource) || "File Manager";

    if (!file) {
      await logFailure({
        eventType: "Error",
        description: "No file provided in upload request",
        functionName: "uploadFile",
        fileName: FILE_NAME,
        error: new Error("No file provided"),
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(400).json(STATUS_CODE[400](req.t!("No file provided")));
    }

    const auth = validateAndParseAuth(req, res);
    if (!auth) return;
    const { userId, orgId } = auth;

    const validation = validateFileUpload(file);
    if (!validation.valid) {
      await logFailure({
        eventType: "Error",
        description: `File validation failed: ${validation.error}`,
        functionName: "uploadFile",
        fileName: FILE_NAME,
        error: new Error(validation.error),
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(400).json(STATUS_CODE[400](validation.error));
    }

    if (approvalWorkflowId) {
      const workflow = await getApprovalWorkflowForFile(approvalWorkflowId, orgId);
      if (!workflow) {
        return res.status(400).json(STATUS_CODE[400](req.t!("Invalid approval workflow ID")));
      }
      if (workflow.entity_type !== "file") {
        return res
          .status(400)
          .json(STATUS_CODE[400](req.t!("Selected workflow is not configured for files")));
      }
    }

    let uploadedFile: any;
    let approvalRequestId: number | undefined;

    const transaction = await sequelize.transaction();
    try {
      const uploadOptions: UploadOrganizationFileOptions = {
        modelId,
        source,
        approvalWorkflowId,
        transaction,
      };

      uploadedFile = await uploadOrganizationFile(
        file,
        userId,
        req.organizationId!,
        orgId,
        uploadOptions,
      );

      if (approvalWorkflowId && uploadedFile.id) {
        const workflowSteps = (await getApprovalWorkflowStepsWithApprovers(
          approvalWorkflowId,
          orgId,
          transaction,
        )) as unknown as ApprovalWorkflowStepModel[];

        if (workflowSteps.length > 0) {
          const approvalRequest = await createApprovalRequestQuery(
            {
              request_name: `File Approval: ${uploadedFile.filename}`,
              workflow_id: approvalWorkflowId,
              entity_id: uploadedFile.id,
              entity_type: "file",
              entity_data: {
                filename: uploadedFile.filename,
                size: uploadedFile.size,
                mimetype: uploadedFile.mimetype,
              },
              status: ApprovalRequestStatus.PENDING,
              requested_by: userId,
            },
            workflowSteps,
            req.organizationId!,
            transaction,
          );

          approvalRequestId = (approvalRequest as any).id;
          await setFileApprovalRequestId(uploadedFile.id, approvalRequestId!, orgId, transaction);
        }
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    // POST-COMMIT best-effort operations
    if (uploadedFile.id) {
      await indexFileContent(uploadedFile.id, file.buffer, file.mimetype, orgId);
    }

    if (approvalRequestId) {
      try {
        await notifyStepApprovers(
          orgId,
          approvalRequestId,
          1,
          `File Approval: ${uploadedFile.filename}`,
        );
      } catch (notifyError) {
        console.error("Failed to send approval notifications:", notifyError);
      }
    }

    await logSuccess({
      eventType: "Create",
      description: `File uploaded successfully: ${uploadedFile.filename}${
        approvalWorkflowId ? " (pending approval)" : ""
      }`,
      functionName: "uploadFile",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(201).json(
      STATUS_CODE[201]({
        id: uploadedFile.id,
        filename: uploadedFile.filename,
        size: uploadedFile.size,
        mimetype: uploadedFile.mimetype,
        upload_date: uploadedFile.upload_date,
        uploaded_by: uploadedFile.uploaded_by,
        modelId: uploadedFile.model_id,
        review_status: approvalWorkflowId ? "pending_review" : "draft",
        approval_workflow_id: approvalWorkflowId,
        approval_request_id: approvalRequestId,
      }),
    );
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to upload file",
      functionName: "uploadFile",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](req.t!("Internal server error")));
  }
};

export const listFiles = async (req: Request, res: Response): Promise<any> => {
  const auth = validateAndParseAuth(req, res);
  if (!auth) return;
  const { orgId } = auth;

  const { page: queryPage, pageSize: queryPageSize } = parsePaginationQuery(
    req.query.page,
    req.query.pageSize,
  );
  const page = queryPage ?? 1;
  const pageSize = queryPageSize ?? 20;
  const paginationResult = validatePagination(page, pageSize);
  if ("error" in paginationResult) {
    return res.status(400).json(STATUS_CODE[400](paginationResult.error));
  }
  const validPage = paginationResult.page!;
  const validPageSize = paginationResult.pageSize!;
  const offset = (validPage - 1) * validPageSize;

  logProcessing({
    description: `Retrieving file list for organization ${orgId}`,
    functionName: "listFiles",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const { files, total } = await getOrganizationFiles(req.organizationId!, {
      limit: validPageSize,
      offset,
    });

    await logSuccess({
      eventType: "Read",
      description: `Retrieved ${files.length} files for organization ${orgId}`,
      functionName: "listFiles",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(
      STATUS_CODE[200]({
        files: files.map((file) => ({
          id: file.id,
          filename: file.filename,
          size: file.size,
          formattedSize: formatFileSize(file.size ?? 0),
          mimetype: file.mimetype,
          upload_date: file.upload_date,
          uploaded_by: file.uploaded_by,
          uploader_name: file.uploader_name,
          uploader_surname: file.uploader_surname,
          review_status: file.review_status,
          approval_workflow_id: file.approval_workflow_id,
        })),
        pagination: {
          total,
          page: validPage,
          pageSize: validPageSize,
          totalPages: Math.ceil(total / validPageSize),
        },
      }),
    );
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to retrieve file list",
      functionName: "listFiles",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](req.t!("Internal server error")));
  }
};

export const searchFiles = async (req: Request, res: Response): Promise<any> => {
  const auth = validateAndParseAuth(req, res);
  if (!auth) return;
  const { orgId } = auth;

  const qParam = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
  const queryText = typeof qParam === "string" ? qParam.trim() : "";
  if (!queryText) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Query parameter 'q' is required")));
  }

  const { page: queryPage, pageSize: queryPageSize } = parsePaginationQuery(
    req.query.page,
    req.query.pageSize,
  );
  const page = queryPage ?? 1;
  const pageSize = queryPageSize ?? 20;

  const paginationResult = validatePagination(page, pageSize);
  if ("error" in paginationResult) {
    return res.status(400).json(STATUS_CODE[400](paginationResult.error));
  }
  const validPage = paginationResult.page!;
  const validPageSize = paginationResult.pageSize!;

  try {
    const options: FileContentSearchOptions = {
      limit: validPageSize,
      offset: (validPage - 1) * validPageSize,
    };
    const { files } = await searchFilesByContent(orgId, queryText, options);

    return res.status(200).json(
      STATUS_CODE[200]({
        files,
        page: validPage,
        pageSize: validPageSize,
        query: queryText,
      }),
    );
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to search files by content",
      functionName: "searchFiles",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: orgId,
    });
    return res
      .status(500)
      .json(STATUS_CODE[500](req.t!("Internal server error while searching files")));
  }
};

export const downloadFile = async (req: Request, res: Response): Promise<any> => {
  const fileId = parseValidFileId(req.params.id);
  if (fileId === null) return sendInvalidFileId(req, res);

  const auth = validateAndParseAuth(req, res);
  if (!auth) return;
  const { userId, orgId } = auth;

  logProcessing({
    description: `Starting file download for file ID ${fileId}`,
    functionName: "downloadFile",
    fileName: FILE_NAME,
    userId,
    organizationId: orgId,
  });

  try {
    const file = await getFileById(fileId, orgId);
    if (!file) {
      return res.status(404).json(STATUS_CODE[404](req.t!("File not found")));
    }

    const access = await assertFileAccess(file, userId, orgId);
    if (!access.allowed) {
      await logFailure({
        eventType: "Error",
        description: `Unauthorized access attempt to file ${fileId}`,
        functionName: "downloadFile",
        fileName: FILE_NAME,
        error: new Error("Access denied"),
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
    }

    if (file.project_id == null) {
      try {
        await logFileAccess(fileId, userId, req.organizationId!, "download", orgId);
      } catch (error) {
        console.error("Failed to log file access:", error);
      }
    }

    if (!file.content) {
      return res
        .status(404)
        .json(
          STATUS_CODE[404](
            req.t!("File content not available. This file may need to be re-uploaded."),
          ),
        );
    }

    res.setHeader("Content-Type", file.type || "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const safeFilename = file.filename.replace(/["\r\n]/g, "").replace(/[^\x20-\x7E]/g, "_");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
    res.setHeader("Content-Length", file.content.length);

    await logSuccess({
      eventType: "Read",
      description: `File downloaded successfully: ${file.filename}`,
      functionName: "downloadFile",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    res.end(file.content);
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to download file",
      functionName: "downloadFile",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](req.t!("Internal server error")));
  }
};

export const removeFile = async (req: Request, res: Response): Promise<any> => {
  const fileId = parseValidFileId(req.params.id);
  if (fileId === null) return sendInvalidFileId(req, res);

  const auth = validateAndParseAuth(req, res);
  if (!auth) return;
  const { userId, orgId } = auth;

  if (!hasPermission(req, "delete:file", ["Admin", "SuperAdmin", "Reviewer", "Editor"])) {
    return res
      .status(403)
      .json(STATUS_CODE[403](req.t!("Insufficient permissions to delete files")));
  }

  logProcessing({
    description: `Starting file deletion for file ID ${fileId}`,
    functionName: "removeFile",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const file = await getFileById(fileId, orgId);
    if (!file) {
      return res.status(404).json(STATUS_CODE[404](req.t!("File not found")));
    }

    const access = await assertFileAccess(file, userId, orgId);
    if (!access.allowed) {
      return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
    }

    if (file.approval_request_id) {
      try {
        const rejectionReason = `File deleted: The file "${file.filename}" associated with this request has been deleted.`;
        const notificationInfo = await rejectApprovalRequestOnEntityDelete(
          file.approval_request_id,
          req.organizationId!,
          rejectionReason,
        );
        if (notificationInfo && notificationInfo.requesterId) {
          await notifyRequesterRejected(
            orgId,
            notificationInfo.requesterId,
            notificationInfo.requestId,
            notificationInfo.requestName,
            {
              rejector_name: "System",
              rejection_reason: rejectionReason,
            },
          );
        }
      } catch (approvalError) {
        console.error(`Failed to reject approval request for file ${fileId}:`, approvalError);
      }
    }

    const deleted = await deleteFileById(fileId, orgId);
    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404](req.t!("File not found")));
    }

    await logSuccess({
      eventType: "Delete",
      description: `File deleted successfully: ${file.filename}`,
      functionName: "removeFile",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(
      STATUS_CODE[200]({
        message: req.t!("File deleted successfully"),
        fileId,
      }),
    );
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to delete file",
      functionName: "removeFile",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](req.t!("Internal server error")));
  }
};

export const getFileMetadata = async (req: Request, res: Response): Promise<any> => {
  const fileId = parseValidFileId(req.params.id);
  if (fileId === null) return sendInvalidFileId(req, res);

  const auth = validateAndParseAuth(req, res);
  if (!auth) return;
  const { userId, orgId } = auth;

  logProcessing({
    description: `Getting metadata for file ID ${fileId}`,
    functionName: "getFileMetadata",
    fileName: FILE_NAME,
    userId,
    organizationId: orgId,
  });

  try {
    const file = await getFileWithMetadata(fileId, orgId);
    if (!file) {
      return res.status(404).json(STATUS_CODE[404](req.t!("File not found")));
    }

    const access = await assertFileAccess(file, userId, orgId);
    if (!access.allowed) {
      return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
    }

    await logSuccess({
      eventType: "Read",
      description: `Retrieved metadata for file: ${file.filename}`,
      functionName: "getFileMetadata",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](file));
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to get file metadata",
      functionName: "getFileMetadata",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](req.t!("Internal server error")));
  }
};

export const updateMetadata = async (req: Request, res: Response): Promise<any> => {
  const fileId = parseValidFileId(req.params.id);
  if (fileId === null) return sendInvalidFileId(req, res);

  const auth = validateAndParseAuth(req, res);
  if (!auth) return;
  const { userId, orgId } = auth;

  if (!hasPermission(req, "update:file-metadata", ["Admin", "SuperAdmin", "Reviewer", "Editor"])) {
    return res
      .status(403)
      .json(STATUS_CODE[403](req.t!("Insufficient permissions to update file metadata")));
  }

  logProcessing({
    description: `Updating metadata for file ID ${fileId}`,
    functionName: "updateMetadata",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const currentFile = await getFileById(fileId, orgId);
    if (!currentFile) {
      return res.status(404).json(STATUS_CODE[404](req.t!("File not found")));
    }

    const access = await assertFileAccess(currentFile, userId, orgId);
    if (!access.allowed) {
      return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
    }

    const validation = validateFileMetadataUpdate(req.body);
    if ("error" in validation) {
      return res.status(400).json(STATUS_CODE[400](req.t!(validation.error)));
    }

    const updates: UpdateFileMetadataInput = {
      last_modified_by: userId,
      ...validation.update,
    };

    const beforeState = await getFileWithMetadata(fileId, orgId);
    const updatedFile = await updateFileMetadata(fileId, updates, orgId);

    if (!updatedFile) {
      return res.status(404).json(STATUS_CODE[404](req.t!("File not found after update")));
    }

    try {
      if (beforeState) {
        const changes = await trackEntityChanges("file", beforeState, updatedFile);
        if (changes.length > 0) {
          await recordMultipleFieldChanges("file", fileId, userId, req.organizationId!, changes);
        }
      }
    } catch (historyError) {
      console.error("Failed to record file change history:", historyError);
    }

    await logSuccess({
      eventType: "Update",
      description: `Updated metadata for file: ${currentFile.filename}`,
      functionName: "updateMetadata",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](updatedFile));
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to update file metadata",
      functionName: "updateMetadata",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](req.t!("Internal server error")));
  }
};

export const listFilesWithMetadata = async (req: Request, res: Response): Promise<any> => {
  const auth = validateAndParseAuth(req, res);
  if (!auth) return;
  const { orgId } = auth;

  const { page: queryPage, pageSize: queryPageSize } = parsePaginationQuery(
    req.query.page,
    req.query.pageSize,
  );
  const page = queryPage ?? 1;
  const pageSize = queryPageSize ?? 20;
  const paginationResult = validatePagination(page, pageSize);
  if ("error" in paginationResult) {
    return res.status(400).json(STATUS_CODE[400](paginationResult.error));
  }
  const validPage = paginationResult.page!;
  const validPageSize = paginationResult.pageSize!;
  const offset = (validPage - 1) * validPageSize;

  logProcessing({
    description: `Retrieving files with metadata for organization ${orgId}`,
    functionName: "listFilesWithMetadata",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const { files, total } = await getOrganizationFilesWithMetadata(req.organizationId!, {
      limit: validPageSize,
      offset,
    });

    await logSuccess({
      eventType: "Read",
      description: `Retrieved ${files.length} files with metadata for organization ${orgId}`,
      functionName: "listFilesWithMetadata",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(
      STATUS_CODE[200]({
        files,
        pagination: {
          total,
          page: validPage,
          pageSize: validPageSize,
          totalPages: Math.ceil(total / validPageSize),
        },
      }),
    );
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to retrieve files with metadata",
      functionName: "listFilesWithMetadata",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](req.t!("Internal server error")));
  }
};

export const getHighlighted = async (req: Request, res: Response): Promise<any> => {
  const auth = validateAndParseAuth(req, res);
  if (!auth) return;
  const { orgId } = auth;

  const daysUntilExpiry = req.query.daysUntilExpiry
    ? Number(
        Array.isArray(req.query.daysUntilExpiry)
          ? req.query.daysUntilExpiry[0]
          : req.query.daysUntilExpiry,
      )
    : 30;
  const recentDays = req.query.recentDays
    ? Number(Array.isArray(req.query.recentDays) ? req.query.recentDays[0] : req.query.recentDays)
    : 7;

  logProcessing({
    description: `Getting highlighted files for organization ${orgId}`,
    functionName: "getHighlighted",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const highlighted = await getHighlightedFiles(req.organizationId!, daysUntilExpiry, recentDays);

    await logSuccess({
      eventType: "Read",
      description: `Retrieved highlighted files for organization ${orgId}`,
      functionName: "getHighlighted",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](highlighted));
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to get highlighted files",
      functionName: "getHighlighted",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](req.t!("Internal server error")));
  }
};

const SAFE_PREVIEW_MIMETYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "text/plain",
  "text/csv",
  "text/html",
  "application/json",
  "application/xml",
  "text/xml",
]);

export const previewFile = async (req: Request, res: Response): Promise<any> => {
  const fileId = parseValidFileId(req.params.id);
  if (fileId === null) return sendInvalidFileId(req, res);

  const auth = validateAndParseAuth(req, res);
  if (!auth) return;
  const { userId, orgId } = auth;

  logProcessing({
    description: `Getting preview for file ID ${fileId}`,
    functionName: "previewFile",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const fileMeta = await getFileById(fileId, orgId);
    if (!fileMeta) {
      return res.status(404).json(STATUS_CODE[404](req.t!("File not found")));
    }

    const access = await assertFileAccess(fileMeta, userId, orgId);
    if (!access.allowed) {
      return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
    }

    const preview = await getFilePreview(fileId, orgId);
    if (!preview) {
      return res.status(404).json(STATUS_CODE[404](req.t!("File not found")));
    }

    if (!preview.canPreview) {
      if (preview.content.length === 0) {
        return res
          .status(404)
          .json(
            STATUS_CODE[404](
              req.t!("File content not available. This file may need to be re-uploaded."),
            ),
          );
      }
      return res.status(413).json(STATUS_CODE[400](req.t!("File too large for preview")));
    }

    try {
      await logFileAccess(fileId, userId, req.organizationId!, "view", orgId);
    } catch (error) {
      console.error("Failed to log file access:", error);
    }

    const requestedMimetype = preview.mimetype?.toLowerCase()?.trim() || "";
    const safeMimetype = SAFE_PREVIEW_MIMETYPES.has(requestedMimetype)
      ? requestedMimetype
      : "application/octet-stream";

    const safeFilename = preview.filename
      .replace(/["\r\n]/g, "")
      .replace(/[^\x20-\x7E]/g, "_");

    res.setHeader("Content-Type", safeMimetype);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    );
    res.setHeader("Content-Disposition", `inline; filename="${safeFilename}"`);
    res.setHeader("Content-Length", preview.content.length);
    res.send(preview.content);

    await logSuccess({
      eventType: "Read",
      description: `Preview served for file: ${preview.filename}`,
      functionName: "previewFile",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to get file preview",
      functionName: "previewFile",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](req.t!("Internal server error")));
  }
};

export const getFileVersionHistory = async (req: Request, res: Response): Promise<any> => {
  const fileId = parseValidFileId(req.params.id);
  if (fileId === null) return sendInvalidFileId(req, res);

  const auth = validateAndParseAuth(req, res);
  if (!auth) return;
  const { userId, orgId } = auth;

  logProcessing({
    description: `Getting version history for file ID ${fileId}`,
    functionName: "getFileVersionHistory",
    fileName: FILE_NAME,
    userId,
    organizationId: orgId,
  });

  try {
    const file = await getFileWithMetadata(fileId, orgId);
    if (!file) {
      return res.status(404).json(STATUS_CODE[404](req.t!("File not found")));
    }

    if (!file.file_group_id) {
      return res.status(200).json(STATUS_CODE[200]({ versions: [file] }));
    }

    const versions = await getFileVersionHistoryRepo(file.file_group_id, orgId);

    await logSuccess({
      eventType: "Read",
      description: `Retrieved ${versions.length} versions for file group: ${file.file_group_id}`,
      functionName: "getFileVersionHistory",
      fileName: FILE_NAME,
      userId,
      organizationId: orgId,
    });
    return res.status(200).json(STATUS_CODE[200]({ versions }));
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to get file version history",
      functionName: "getFileVersionHistory",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](req.t!("Internal server error")));
  }
};
