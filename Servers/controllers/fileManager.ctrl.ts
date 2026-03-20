/**
 * @fileoverview File Manager Controller
 *
 * Handles HTTP requests for file manager operations:
 * - Upload files (POST /file-manager)
 * - List files (GET /file-manager)
 * - Download files (GET /file-manager/:id)
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
  ReviewStatus,
  UploadOrganizationFileOptions,
  searchFilesByContent,
  FileContentSearchOptions,
} from "../repositories/file.repository";
import { sequelize } from "../database/db";
import { ApprovalWorkflowStepModel } from "../domain.layer/models/approvalWorkflow/approvalWorkflowStep.model";
import { ApprovalRequestStatus } from "../domain.layer/enums/approval-workflow.enum";
import { createApprovalRequestQuery, rejectApprovalRequestOnEntityDelete } from "../utils/approvalRequest.utils";
import { notifyStepApprovers, notifyRequesterRejected } from "../services/notification.service";
import {
  validateFileUpload,
  formatFileSize,
} from "../utils/validations/fileManagerValidation.utils";
import {
  logProcessing,
  logSuccess,
  logFailure,
} from "../utils/logger/logHelper";
import { getUserProjects } from "../utils/user.utils";
import { getProjectByIdQuery } from "../utils/project.utils";
import {
  trackEntityChanges,
  recordMultipleFieldChanges,
} from "../utils/changeHistory.base.utils";
import { extractText, normalizeText } from "../services/fileIngestion/textExtractor";

/**
 * Helper function to validate and parse request authentication data
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @returns {{ userId: number; orgId: number } | null} Parsed values or null if validation fails
 */
const validateAndParseAuth = (
  req: Request,
  res: Response
): { userId: number; orgId: number } | null => {
  const userId = Number(req.userId);
  const orgId = Number(req.organizationId);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    res.status(400).json(STATUS_CODE[400]("Invalid user ID"));
    return null;
  }

  if (!Number.isSafeInteger(orgId) || orgId <= 0) {
    res.status(400).json(STATUS_CODE[400]("Invalid organization ID"));
    return null;
  }

  return { userId, orgId };
};

/**
 * Helper function to check if user has permission for a specific action
 * Provides defense-in-depth security layer in addition to route middleware
 *
 * @param {Request} req - Express request with role information
 * @param {string} action - Action to check permission for (e.g., 'delete', 'upload')
 * @param {string[]} allowedRoles - Roles allowed to perform this action
 * @returns {boolean} True if user has permission
 */
const hasPermission = (
  req: Request,
  action: string,
  allowedRoles: string[]
): boolean => {
  const userRole = (req as any).role;

  if (!userRole) {
    console.warn(
      `Permission check failed for action '${action}': No role found in request`
    );
    return false;
  }

  const hasAccess = allowedRoles.includes(userRole);

  if (!hasAccess) {
    console.warn(
      `Permission denied: User with role '${userRole}' attempted '${action}' action. Allowed roles: [${allowedRoles.join(", ")}]`
    );
  }

  return hasAccess;
};

/**
 * Pagination limits to prevent unbounded queries
 */
const PAGINATION_LIMITS = {
  maxPageSize: 100,
  maxPage: 10000,
  defaultPageSize: 20,
};

/**
 * Validates and normalizes pagination parameters
 * @param page - Page number from query
 * @param pageSize - Page size from query
 * @returns Validated pagination parameters or null if invalid
 */
const validatePagination = (
  page: number | undefined,
  pageSize: number | undefined
): { page: number | undefined; pageSize: number | undefined; offset: number | undefined } | { error: string } => {
  // Validate page if provided
  if (page !== undefined) {
    if (!Number.isSafeInteger(page) || page < 1 || page > PAGINATION_LIMITS.maxPage) {
      return { error: `Page must be a positive integer between 1 and ${PAGINATION_LIMITS.maxPage}` };
    }
  }

  // Validate pageSize if provided
  if (pageSize !== undefined) {
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > PAGINATION_LIMITS.maxPageSize) {
      return { error: `Page size must be a positive integer between 1 and ${PAGINATION_LIMITS.maxPageSize}` };
    }
  }

  const validPage = page && page > 0 ? page : undefined;
  const validPageSize = pageSize && pageSize > 0 ? Math.min(pageSize, PAGINATION_LIMITS.maxPageSize) : undefined;
  const offset =
    validPage !== undefined && validPageSize !== undefined
      ? (validPage - 1) * validPageSize
      : undefined;

  return { page: validPage, pageSize: validPageSize, offset };
};

/**
 * Validates tags array
 * @param tags - Tags array to validate
 * @returns Validated tags array or error
 */
const validateTags = (
  tags: unknown
): { tags: string[] } | { error: string } => {
  if (!Array.isArray(tags)) {
    return { error: "Tags must be an array" };
  }

  // Limit number of tags
  if (tags.length > 50) {
    return { error: "Maximum 50 tags allowed" };
  }

  // Validate each tag
  const validatedTags: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== 'string') {
      return { error: "Each tag must be a string" };
    }
    const trimmedTag = tag.trim();
    if (trimmedTag.length === 0) {
      continue; // Skip empty tags
    }
    if (trimmedTag.length > 100) {
      return { error: "Tag length must not exceed 100 characters" };
    }
    // Only allow alphanumeric, spaces, hyphens, and underscores
    if (!/^[\w\s-]+$/u.test(trimmedTag)) {
      return { error: "Tags can only contain letters, numbers, spaces, hyphens, and underscores" };
    }
    validatedTags.push(trimmedTag);
  }

  return { tags: validatedTags };
};

/**
 * Upload file to file manager
 *
 * POST /file-manager
 *
 * @param {Request} req - Express request with file upload
 * @param {Response} res - Express response
 * @returns {Promise<Response>} Created file metadata
 */
export const uploadFile = async (req: Request, res: Response): Promise<any> => {
  logProcessing({
    description: "Starting file upload to file manager",
    functionName: "uploadFile",
    fileName: "fileManager.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const file = req.file as Express.Multer.File;
    // Parse model_id from request body
    let modelId: number | undefined;
    if (req.body.model_id != null && req.body.model_id !== "") {
      const parsed = Number(req.body.model_id);
      if (!isNaN(parsed)) modelId = parsed;
    }

    // Parse approval_workflow_id from request body
    let approvalWorkflowId: number | undefined;
    if (req.body.approval_workflow_id != null && req.body.approval_workflow_id !== "") {
      const parsed = Number(req.body.approval_workflow_id);
      if (!isNaN(parsed)) approvalWorkflowId = parsed;
    }

    // Parse source from request body
    const source: FileSource = (req.body.source as FileSource) || "File Manager";

    if (!file) {
      await logFailure({
        eventType: "Error",
        description: "No file provided in upload request",
        functionName: "uploadFile",
        fileName: "fileManager.ctrl.ts",
        error: new Error("No file provided"),
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(400).json(STATUS_CODE[400]("No file provided"));
    }

    // Validate authentication
    const auth = validateAndParseAuth(req, res);
    if (!auth) {
      return;
    }

    const { userId, orgId } = auth;

    // Validate file type and size
    const validation = validateFileUpload(file);
    if (!validation.valid) {
      await logFailure({
        eventType: "Error",
        description: `File validation failed: ${validation.error}`,
        functionName: "uploadFile",
        fileName: "fileManager.ctrl.ts",
        error: new Error(validation.error),
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(400).json(STATUS_CODE[400](validation.error));
    }

    // If approval workflow is specified, validate it exists and is for files
    if (approvalWorkflowId) {
      const [workflow] = await sequelize.query(
        `SELECT id, workflow_title, entity_type FROM approval_workflows WHERE organization_id = :orgId AND id = :workflowId`,
        {
          replacements: { orgId, workflowId: approvalWorkflowId },
          type: "SELECT" as any,
        }
      ) as any[];

      if (!workflow) {
        return res.status(400).json(STATUS_CODE[400]("Invalid approval workflow ID"));
      }

      if (workflow.entity_type !== "file") {
        return res.status(400).json(STATUS_CODE[400]("Selected workflow is not configured for files"));
      }
    }

    // Variables to store transaction results
    let uploadedFile: any;
    let approvalRequestId: number | undefined;

    // Start transaction for file upload and approval request creation
    const transaction = await sequelize.transaction();

    try {
      // Upload file to files table with org_id and project_id = NULL
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
        uploadOptions
      );

      // If approval workflow is specified, create an approval request
      if (approvalWorkflowId && uploadedFile.id) {
        // Get workflow steps with approvers
        const workflowStepsResult = await sequelize.query(
          `SELECT aws.*,
            COALESCE(
              json_agg(
                json_build_object('approver_id', asa.approver_id)
              ) FILTER (WHERE asa.approver_id IS NOT NULL),
              '[]'
            ) as approvers
           FROM approval_workflow_steps aws
           LEFT JOIN approval_step_approvers asa ON aws.id = asa.workflow_step_id
           WHERE aws.organization_id = :orgId AND aws.workflow_id = :workflowId
           GROUP BY aws.id
           ORDER BY aws.step_number ASC`,
          {
            replacements: { orgId, workflowId: approvalWorkflowId },
            type: "SELECT" as const,
            transaction,
          }
        );
        const workflowSteps = workflowStepsResult as unknown as ApprovalWorkflowStepModel[];

        if (workflowSteps.length > 0) {
          // Create the approval request
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
            transaction
          );

          approvalRequestId = (approvalRequest as any).id;

          // Update file with approval_request_id
          await sequelize.query(
            `UPDATE files SET approval_request_id = :approvalRequestId WHERE organization_id = :orgId AND id = :fileId`,
            {
              replacements: { approvalRequestId, orgId, fileId: uploadedFile.id },
              transaction,
            }
          );
        }
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    // POST-COMMIT OPERATIONS (outside transaction try-catch)
    // These are best-effort and should not fail the request

    // Best-effort: extract text content for full-text search
    try {
      const rawText = await extractText(file.buffer, file.mimetype);
      const normalized = rawText ? normalizeText(rawText) : "";

      if (normalized && uploadedFile.id) {
        await sequelize.query(
          `UPDATE files
           SET content_text = :content_text,
               content_search = to_tsvector('english', :content_text)
           WHERE organization_id = :orgId AND id = :fileId`,
          {
            replacements: {
              content_text: normalized,
              orgId,
              fileId: uploadedFile.id,
            },
            type: "UPDATE" as const,
          }
        );
      }
    } catch (extractionError) {
      // Do not fail the request if extraction or indexing fails
      console.error(
        "Failed to extract or index file content for search:",
        extractionError
      );
    }

    // Send notifications to first step approvers
    if (approvalRequestId) {
      try {
        await notifyStepApprovers(
          orgId,
          approvalRequestId,
          1,
          `File Approval: ${uploadedFile.filename}`
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
      fileName: "fileManager.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
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
      })
    );
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to upload file",
      functionName: "uploadFile",
      fileName: "fileManager.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
};

/**
 * Get list of files in file manager
 *
 * GET /file-manager
 *
 * Query parameters:
 * - page: Page number (optional)
 * - pageSize: Items per page (optional)
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @returns {Promise<Response>} List of files with metadata
 */
export const listFiles = async (req: Request, res: Response): Promise<any> => {
  // Validate authentication
  const auth = validateAndParseAuth(req, res);
  if (!auth) return; // Response already sent

  const { orgId } = auth;

  // Parse pagination parameters
  const page = req.query.page ? Number(Array.isArray(req.query.page) ? req.query.page[0] : req.query.page) : undefined;
  const pageSize = req.query.pageSize ? Number(Array.isArray(req.query.pageSize) ? req.query.pageSize[0] : req.query.pageSize) : undefined;

  // Validate pagination
  const paginationResult = validatePagination(page, pageSize);
  if ('error' in paginationResult) {
    return res.status(400).json(STATUS_CODE[400](paginationResult.error));
  }
  const { page: validPage, pageSize: validPageSize, offset } = paginationResult;

  logProcessing({
    description: `Retrieving file list for organization ${orgId}`,
    functionName: "listFiles",
    fileName: "fileManager.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
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
      fileName: "fileManager.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
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
          totalPages: validPageSize ? Math.ceil(total / validPageSize) : 1,
        },
      })
    );
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to retrieve file list",
      functionName: "listFiles",
      fileName: "fileManager.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
};

/**
 * Search organization-level files by extracted content (full-text search).
 *
 * GET /file-manager/search?q=...&page=&pageSize=
 */
export const searchFiles = async (req: Request, res: Response): Promise<any> => {
  // Validate authentication
  const auth = validateAndParseAuth(req, res);
  if (!auth) return; // Response already sent

  const { orgId } = auth;

  const qParam = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
  const queryText = typeof qParam === "string" ? qParam.trim() : "";

  if (!queryText) {
    return res
      .status(400)
      .json(STATUS_CODE[400]("Query parameter 'q' is required"));
  }

  const pageParam = req.query.page;
  const pageSizeParam = req.query.pageSize;

  const page = pageParam ? Number(Array.isArray(pageParam) ? pageParam[0] : pageParam) : 1;
  const pageSize = pageSizeParam
    ? Number(Array.isArray(pageSizeParam) ? pageSizeParam[0] : pageSizeParam)
    : 20;

  const paginationResult = validatePagination(page, pageSize);
  if ("error" in paginationResult) {
    return res.status(400).json(STATUS_CODE[400](paginationResult.error));
  }

  // validatePagination guarantees these are defined when there is no error
  const validPage = paginationResult.page!;
  const validPageSize = paginationResult.pageSize!;
  const limit = validPageSize;
  const offset = (validPage - 1) * validPageSize;

  try {
    const options: FileContentSearchOptions = {
      limit,
      offset,
    };

    const { files } = await searchFilesByContent(
      orgId,
      queryText,
      options
    );

    return res.status(200).json(
      STATUS_CODE[200]({
        files,
        page: validPage,
        pageSize: validPageSize,
        query: queryText,
      })
    );
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to search files by content",
      functionName: "searchFiles",
      fileName: "fileManager.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: orgId,
    });

    return res
      .status(500)
      .json(STATUS_CODE[500]("Internal server error while searching files"));
  }
};

/**
 * Download file from file manager
 *
 * GET /file-manager/:id
 *
 * @param {Request} req - Express request with file ID in params
 * @param {Response} res - Express response
 * @returns {Promise<Response>} File content with appropriate headers
 */
export const downloadFile = async (
  req: Request,
  res: Response
): Promise<any> => {
  // Validate file ID is numeric-only string before parsing
  if (!/^\d+$/.test(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid file ID"));
  }

  const fileId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  // Validate parsed file ID is a safe integer
  if (!Number.isSafeInteger(fileId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid file ID"));
  }

  // Validate authentication
  const auth = validateAndParseAuth(req, res);
  if (!auth) return; // Response already sent

  const { userId, orgId } = auth;

  logProcessing({
    description: `Starting file download for file ID ${fileId}`,
    functionName: "downloadFile",
    fileName: "fileManager.ctrl.ts",
    userId,
    organizationId: orgId,
  });

  try {
    // Get file metadata from unified files table
    const file = await getFileById(fileId, orgId);

    if (!file) {
      await logFailure({
        eventType: "Error",
        description: `File not found: ID ${fileId}`,
        functionName: "downloadFile",
        fileName: "fileManager.ctrl.ts",
        error: new Error("File not found"),
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]("File not found"));
    }

    // Authorization check based on file type:
    // - Organization files (project_id IS NULL): check org_id
    // - Project files (project_id IS NOT NULL): check project access
    const isOrganizationFile = file.project_id == null;

    if (isOrganizationFile) {
      // Organization-level file: verify user belongs to the same org
      if (Number(file.org_id) !== orgId) {
        await logFailure({
          eventType: "Error",
          description: `Unauthorized access attempt to file ${fileId}`,
          functionName: "downloadFile",
          fileName: "fileManager.ctrl.ts",
          error: new Error("Access denied"),
          userId: req.userId!,
          tenantId: req.organizationId!,
        });
        return res.status(403).json(STATUS_CODE[403]("Access denied"));
      }
    } else {
      // Project-level file: verify user has access to the project
      const userProjects = await getUserProjects(userId, req.organizationId!);
      const userProjectIds = userProjects.map((p) => p.id);

      // Get the project to check ownership (project_id is guaranteed non-null in this branch)
      const projectId = file.project_id!;
      const project = await getProjectByIdQuery(projectId, req.organizationId!);

      // Allow access if:
      // 1. User is a member of the project, OR
      // 2. User is the owner of the project, OR
      // 3. User is the one who uploaded/generated the file
      const isProjectMember = userProjectIds.includes(projectId);
      const isProjectOwner = project && Number(project.owner) === userId;
      const isFileOwner = Number(file.uploaded_by) === userId;

      if (!isProjectMember && !isProjectOwner && !isFileOwner) {
        await logFailure({
          eventType: "Error",
          description: `Unauthorized access attempt to file ${fileId} - user doesn't have access to project ${projectId}, is not the project owner, and is not the file owner`,
          functionName: "downloadFile",
          fileName: "fileManager.ctrl.ts",
          error: new Error("Access denied"),
          userId: req.userId!,
          tenantId: req.organizationId!,
        });
        return res.status(403).json(STATUS_CODE[403]("Access denied"));
      }
    }

    // Log file access for organization-level files
    if (isOrganizationFile) {
      try {
        await logFileAccess(fileId, userId, req.organizationId!, "download", orgId);
      } catch (error) {
        // Don't fail the download if logging fails
        console.error("Failed to log file access:", error);
      }
    }

    // Check if file content exists in database
    if (!file.content) {
      await logFailure({
        eventType: "Error",
        description: `File content not found in database for file ID ${fileId}`,
        functionName: "downloadFile",
        fileName: "fileManager.ctrl.ts",
        error: new Error("File content missing"),
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]("File content not available. This file may need to be re-uploaded."));
    }

    // Set headers for file download (unified files table uses 'type' for mimetype)
    res.setHeader("Content-Type", file.type || "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const safeFilename = file.filename
      .replace(/["\r\n]/g, '')
      .replace(/[^\x20-\x7E]/g, '_');
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFilename}"`
    );

    // Set Content-Length
    const contentLength = file.content ? file.content.length : 0;
    res.setHeader("Content-Length", contentLength);

    await logSuccess({
      eventType: "Read",
      description: `File downloaded successfully: ${file.filename}`,
      functionName: "downloadFile",
      fileName: "fileManager.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    // Send file content from database (after logging to avoid async interference)
    res.end(file.content);
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to download file",
      functionName: "downloadFile",
      fileName: "fileManager.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
};

/**
 * Delete file from file manager
 *
 * DELETE /file-manager/:id
 *
 * @param {Request} req - Express request with file ID in params
 * @param {Response} res - Express response
 * @returns {Promise<Response>} Success message or error
 */
export const removeFile = async (req: Request, res: Response): Promise<any> => {
  // Validate file ID is numeric-only string before parsing
  if (!/^\d+$/.test(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid file ID"));
  }

  const fileId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  // Validate parsed file ID is a safe integer
  if (!Number.isSafeInteger(fileId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid file ID"));
  }

  // Validate authentication
  const auth = validateAndParseAuth(req, res);
  if (!auth) return; // Response already sent

  const { userId, orgId } = auth;

  // Defense-in-depth: Verify user has delete permission (in addition to route middleware)
  if (!hasPermission(req, "delete:file", ["Admin", "Reviewer", "Editor"])) {
    await logFailure({
      eventType: "Error",
      description: `Unauthorized role attempted to delete file ${fileId}`,
      functionName: "removeFile",
      fileName: "fileManager.ctrl.ts",
      error: new Error("Insufficient permissions"),
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res
      .status(403)
      .json(STATUS_CODE[403]("Insufficient permissions to delete files"));
  }

  logProcessing({
    description: `Starting file deletion for file ID ${fileId}`,
    functionName: "removeFile",
    fileName: "fileManager.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    // Get file metadata from unified files table
    const file = await getFileById(fileId, orgId);

    if (!file) {
      await logFailure({
        eventType: "Error",
        description: `File not found: ID ${fileId}`,
        functionName: "removeFile",
        fileName: "fileManager.ctrl.ts",
        error: new Error("File not found"),
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]("File not found"));
    }

    // Authorization check based on file type:
    // - Organization files (project_id IS NULL): check org_id
    // - Project files (project_id IS NOT NULL): check project access
    const isOrganizationFile = file.project_id == null;

    if (isOrganizationFile) {
      // Organization-level file: verify user belongs to the same org
      if (Number(file.org_id) !== orgId) {
        await logFailure({
          eventType: "Error",
          description: `Unauthorized deletion attempt for file ${fileId}`,
          functionName: "removeFile",
          fileName: "fileManager.ctrl.ts",
          error: new Error("Access denied"),
          userId: req.userId!,
          tenantId: req.organizationId!,
        });
        return res.status(403).json(STATUS_CODE[403]("Access denied"));
      }
    } else {
      // Project-level file: verify user has access to the project
      const userProjects = await getUserProjects(userId, req.organizationId!);
      const userProjectIds = userProjects.map((p) => p.id);

      // Get the project to check ownership (project_id is guaranteed non-null in this branch)
      const projectId = file.project_id!;
      const project = await getProjectByIdQuery(projectId, req.organizationId!);

      // Allow access if:
      // 1. User is a member of the project, OR
      // 2. User is the owner of the project, OR
      // 3. User is the one who uploaded/generated the file
      const isProjectMember = userProjectIds.includes(projectId);
      const isProjectOwner = project && Number(project.owner) === userId;
      const isFileOwner = Number(file.uploaded_by) === userId;

      if (!isProjectMember && !isProjectOwner && !isFileOwner) {
        await logFailure({
          eventType: "Error",
          description: `Unauthorized deletion attempt for file ${fileId} - user doesn't have access to project ${projectId}, is not the project owner, and is not the file owner`,
          functionName: "removeFile",
          fileName: "fileManager.ctrl.ts",
          error: new Error("Access denied"),
          userId: req.userId!,
          tenantId: req.organizationId!,
        });
        return res.status(403).json(STATUS_CODE[403]("Access denied"));
      }
    }

    // If file has a pending approval request, reject it first
    if (file.approval_request_id) {
      try {
        const rejectionReason = `File deleted: The file "${file.filename}" associated with this request has been deleted.`;
        const notificationInfo = await rejectApprovalRequestOnEntityDelete(
          file.approval_request_id,
          req.organizationId!,
          rejectionReason
        );

        // Notify the requester that their request was rejected
        if (notificationInfo && notificationInfo.requesterId) {
          await notifyRequesterRejected(
            orgId,
            notificationInfo.requesterId,
            notificationInfo.requestId,
            notificationInfo.requestName,
            {
              rejector_name: "System",
              rejection_reason: rejectionReason,
            }
          );
        }
      } catch (approvalError) {
        console.error(`Failed to reject approval request for file ${fileId}:`, approvalError);
        // Continue with file deletion even if approval rejection fails
      }
    }

    // Delete the file from database
    const deleted = await deleteFileById(fileId, orgId);

    if (!deleted) {
      await logFailure({
        eventType: "Error",
        description: `File not found during deletion: ID ${fileId}`,
        functionName: "removeFile",
        fileName: "fileManager.ctrl.ts",
        error: new Error("File not found during deletion"),
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]("File not found"));
    }

    await logSuccess({
      eventType: "Delete",
      description: `File deleted successfully: ${file.filename}`,
      functionName: "removeFile",
      fileName: "fileManager.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(
      STATUS_CODE[200]({
        message: "File deleted successfully",
        fileId,
      })
    );
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to delete file",
      functionName: "removeFile",
      fileName: "fileManager.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
};

/**
 * Get file with full metadata
 *
 * GET /file-manager/:id/metadata
 *
 * @param {Request} req - Express request with file ID in params
 * @param {Response} res - Express response
 * @returns {Promise<Response>} File metadata including tags, status, version, etc.
 */
export const getFileMetadata = async (
  req: Request,
  res: Response
): Promise<any> => {
  // Validate file ID is numeric-only string before parsing
  if (!/^\d+$/.test(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid file ID"));
  }

  const fileId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  if (!Number.isSafeInteger(fileId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid file ID"));
  }

  const auth = validateAndParseAuth(req, res);
  if (!auth) return;

  const { userId, orgId } = auth;

  logProcessing({
    description: `Getting metadata for file ID ${fileId}`,
    functionName: "getFileMetadata",
    fileName: "fileManager.ctrl.ts",
    userId,
    organizationId: orgId,
  });

  try {
    const file = await getFileWithMetadata(fileId, orgId);

    if (!file) {
      return res.status(404).json(STATUS_CODE[404]("File not found"));
    }

    // Authorization check based on file type
    const isOrganizationFile = file.project_id == null;

    if (isOrganizationFile) {
      // Organization-level file: verify user belongs to the same org
      if (Number(file.org_id) !== orgId) {
        return res.status(403).json(STATUS_CODE[403]("Access denied"));
      }
    } else {
      // Project-level file: verify user has access to the project
      const userProjects = await getUserProjects(userId, req.organizationId!);
      const userProjectIds = userProjects.map((p) => p.id);
      const projectId = file.project_id!;
      const project = await getProjectByIdQuery(projectId, req.organizationId!);

      const isProjectMember = userProjectIds.includes(projectId);
      const isProjectOwner = project && Number(project.owner) === userId;
      const isFileOwner = Number(file.uploaded_by) === userId;

      if (!isProjectMember && !isProjectOwner && !isFileOwner) {
        return res.status(403).json(STATUS_CODE[403]("Access denied"));
      }
    }

    await logSuccess({
      eventType: "Read",
      description: `Retrieved metadata for file: ${file.filename}`,
      functionName: "getFileMetadata",
      fileName: "fileManager.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](file));
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to get file metadata",
      functionName: "getFileMetadata",
      fileName: "fileManager.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
};

/**
 * Update file metadata
 *
 * PATCH /file-manager/:id/metadata
 *
 * @param {Request} req - Express request with file ID in params and metadata in body
 * @param {Response} res - Express response
 * @returns {Promise<Response>} Updated file metadata
 */
export const updateMetadata = async (
  req: Request,
  res: Response
): Promise<any> => {
  // Validate file ID is numeric-only string before parsing
  if (!/^\d+$/.test(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid file ID"));
  }

  const fileId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  if (!Number.isSafeInteger(fileId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid file ID"));
  }

  const auth = validateAndParseAuth(req, res);
  if (!auth) return;

  const { userId, orgId } = auth;

  // Defense-in-depth: Verify user has edit permission
  if (!hasPermission(req, "update:file-metadata", ["Admin", "Reviewer", "Editor"])) {
    return res
      .status(403)
      .json(STATUS_CODE[403]("Insufficient permissions to update file metadata"));
  }

  logProcessing({
    description: `Updating metadata for file ID ${fileId}`,
    functionName: "updateMetadata",
    fileName: "fileManager.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    // Get current file to verify access
    const currentFile = await getFileById(fileId, orgId);

    if (!currentFile) {
      return res.status(404).json(STATUS_CODE[404]("File not found"));
    }

    // Authorization check based on file type
    const isOrganizationFile = currentFile.project_id == null;

    if (isOrganizationFile) {
      // Organization-level file: verify user belongs to the same org
      if (Number(currentFile.org_id) !== orgId) {
        return res.status(403).json(STATUS_CODE[403]("Access denied"));
      }
    } else {
      // Project-level file: verify user has access to the project
      const userProjects = await getUserProjects(userId, req.organizationId!);
      const userProjectIds = userProjects.map((p) => p.id);
      const projectId = currentFile.project_id!;
      const project = await getProjectByIdQuery(projectId, req.organizationId!);

      const isProjectMember = userProjectIds.includes(projectId);
      const isProjectOwner = project && Number(project.owner) === userId;
      const isFileOwner = Number(currentFile.uploaded_by) === userId;

      if (!isProjectMember && !isProjectOwner && !isFileOwner) {
        return res.status(403).json(STATUS_CODE[403]("Access denied"));
      }
    }

    // Validate input
    const { tags, review_status, version, expiry_date, description } = req.body;

    // Validate review_status if provided
    const validStatuses: ReviewStatus[] = ['draft', 'pending_review', 'approved', 'rejected', 'expired', 'superseded'];
    if (review_status && !validStatuses.includes(review_status)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid review status"));
    }

    // Validate version format if provided (semver-like: X.Y or X.Y.Z)
    if (version && !/^[0-9]+\.[0-9]+(\.[0-9]+)?$/.test(version)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid version format. Use X.Y or X.Y.Z"));
    }

    // Validate tags using helper function if provided
    let validatedTags: string[] | undefined;
    if (tags !== undefined) {
      const tagsResult = validateTags(tags);
      if ('error' in tagsResult) {
        return res.status(400).json(STATUS_CODE[400](tagsResult.error));
      }
      validatedTags = tagsResult.tags;
    }

    // Validate expiry_date format and value if provided
    if (expiry_date && expiry_date !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry_date)) {
        return res.status(400).json(STATUS_CODE[400]("Invalid date format. Use YYYY-MM-DD"));
      }
      // Validate it's a real date
      const parsedDate = new Date(expiry_date);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json(STATUS_CODE[400]("Invalid date value"));
      }
    }

    // Validate description length if provided
    if (description !== undefined && description !== null) {
      if (typeof description !== 'string') {
        return res.status(400).json(STATUS_CODE[400]("Description must be a string"));
      }
      if (description.length > 2000) {
        return res.status(400).json(STATUS_CODE[400]("Description must not exceed 2000 characters"));
      }
    }

    const updates: UpdateFileMetadataInput = {
      last_modified_by: userId,
    };

    if (validatedTags !== undefined) updates.tags = validatedTags;
    if (review_status !== undefined) updates.review_status = review_status;
    if (version !== undefined) updates.version = version;
    if (expiry_date !== undefined) updates.expiry_date = expiry_date;
    if (description !== undefined) updates.description = description;

    // Fetch current metadata state before update (for change tracking)
    const beforeState = await getFileWithMetadata(fileId, orgId);

    const updatedFile = await updateFileMetadata(fileId, updates, orgId);

    if (!updatedFile) {
      return res.status(404).json(STATUS_CODE[404]("File not found after update"));
    }

    // Record changes in file change history
    try {
      if (beforeState) {
        const changes = await trackEntityChanges(
          "file",
          beforeState,
          updatedFile
        );
        if (changes.length > 0) {
          await recordMultipleFieldChanges(
            "file",
            fileId,
            userId,
            req.organizationId!,
            changes
          );
        }
      }
    } catch (historyError) {
      // Don't fail the update if history recording fails
      console.error("Failed to record file change history:", historyError);
    }

    await logSuccess({
      eventType: "Update",
      description: `Updated metadata for file: ${currentFile.filename}`,
      functionName: "updateMetadata",
      fileName: "fileManager.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](updatedFile));
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to update file metadata",
      functionName: "updateMetadata",
      fileName: "fileManager.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
};

/**
 * Get list of files with full metadata
 *
 * GET /file-manager/with-metadata
 *
 * Query parameters:
 * - page: Page number (optional)
 * - pageSize: Items per page (optional)
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @returns {Promise<Response>} List of files with full metadata
 */
export const listFilesWithMetadata = async (
  req: Request,
  res: Response
): Promise<any> => {
  const auth = validateAndParseAuth(req, res);
  if (!auth) return;

  const { orgId } = auth;

  const page = req.query.page ? Number(Array.isArray(req.query.page) ? req.query.page[0] : req.query.page) : undefined;
  const pageSize = req.query.pageSize ? Number(Array.isArray(req.query.pageSize) ? req.query.pageSize[0] : req.query.pageSize) : undefined;

  // Validate pagination
  const paginationResult = validatePagination(page, pageSize);
  if ('error' in paginationResult) {
    return res.status(400).json(STATUS_CODE[400](paginationResult.error));
  }
  const { page: validPage, pageSize: validPageSize, offset } = paginationResult;

  logProcessing({
    description: `Retrieving files with metadata for organization ${orgId}`,
    functionName: "listFilesWithMetadata",
    fileName: "fileManager.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
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
      fileName: "fileManager.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(
      STATUS_CODE[200]({
        files,
        pagination: {
          total,
          page: validPage,
          pageSize: validPageSize,
          totalPages: validPageSize ? Math.ceil(total / validPageSize) : 1,
        },
      })
    );
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to retrieve files with metadata",
      functionName: "listFilesWithMetadata",
      fileName: "fileManager.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
};

/**
 * Get highlighted files (due for update, pending approval, recently modified)
 *
 * GET /file-manager/highlighted
 *
 * Query parameters:
 * - daysUntilExpiry: Days before expiry to flag (default 30)
 * - recentDays: Days to consider as recent (default 7)
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @returns {Promise<Response>} Categorized file IDs
 */
export const getHighlighted = async (
  req: Request,
  res: Response
): Promise<any> => {
  const auth = validateAndParseAuth(req, res);
  if (!auth) return;

  const { orgId } = auth;

  const daysUntilExpiry = req.query.daysUntilExpiry
    ? Number(Array.isArray(req.query.daysUntilExpiry) ? req.query.daysUntilExpiry[0] : req.query.daysUntilExpiry)
    : 30;
  const recentDays = req.query.recentDays
    ? Number(Array.isArray(req.query.recentDays) ? req.query.recentDays[0] : req.query.recentDays)
    : 7;

  logProcessing({
    description: `Getting highlighted files for organization ${orgId}`,
    functionName: "getHighlighted",
    fileName: "fileManager.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const highlighted = await getHighlightedFiles(req.organizationId!, daysUntilExpiry, recentDays);

    await logSuccess({
      eventType: "Read",
      description: `Retrieved highlighted files for organization ${orgId}`,
      functionName: "getHighlighted",
      fileName: "fileManager.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](highlighted));
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to get highlighted files",
      functionName: "getHighlighted",
      fileName: "fileManager.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
};

/**
 * Get file preview content
 *
 * GET /file-manager/:id/preview
 *
 * @param {Request} req - Express request with file ID in params
 * @param {Response} res - Express response
 * @returns {Promise<Response>} File content for preview or error if too large
 */
export const previewFile = async (
  req: Request,
  res: Response
): Promise<any> => {
  // Validate file ID is numeric-only string before parsing
  if (!/^\d+$/.test(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid file ID"));
  }

  const fileId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  if (!Number.isSafeInteger(fileId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid file ID"));
  }

  const auth = validateAndParseAuth(req, res);
  if (!auth) return;

  const { userId, orgId } = auth;

  logProcessing({
    description: `Getting preview for file ID ${fileId}`,
    functionName: "previewFile",
    fileName: "fileManager.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    // First check file access
    const fileMeta = await getFileById(fileId, orgId);

    if (!fileMeta) {
      return res.status(404).json(STATUS_CODE[404]("File not found"));
    }

    // Authorization check based on file type
    const isOrganizationFile = fileMeta.project_id == null;

    if (isOrganizationFile) {
      // Organization-level file: verify user belongs to the same org
      if (Number(fileMeta.org_id) !== orgId) {
        return res.status(403).json(STATUS_CODE[403]("Access denied"));
      }
    } else {
      // Project-level file: verify user has access to the project
      const userProjects = await getUserProjects(userId, req.organizationId!);
      const userProjectIds = userProjects.map((p) => p.id);
      const projectId = fileMeta.project_id!;
      const project = await getProjectByIdQuery(projectId, req.organizationId!);

      const isProjectMember = userProjectIds.includes(projectId);
      const isProjectOwner = project && Number(project.owner) === userId;
      const isFileOwner = Number(fileMeta.uploaded_by) === userId;

      if (!isProjectMember && !isProjectOwner && !isFileOwner) {
        return res.status(403).json(STATUS_CODE[403]("Access denied"));
      }
    }

    // Get preview content
    const preview = await getFilePreview(fileId, orgId);

    if (!preview) {
      return res.status(404).json(STATUS_CODE[404]("File not found"));
    }

    if (!preview.canPreview) {
      // Check if file has no content vs too large
      if (preview.content.length === 0) {
        return res.status(404).json(STATUS_CODE[404]("File content not available. This file may need to be re-uploaded."));
      }
      return res.status(413).json(STATUS_CODE[400]("File too large for preview"));
    }

    // Log file access for preview
    try {
      await logFileAccess(fileId, userId, req.organizationId!, "view", orgId);
    } catch (error) {
      console.error("Failed to log file access:", error);
    }

    // Allowlist of safe MIME types for preview to prevent XSS
    const SAFE_PREVIEW_MIMETYPES = new Set([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml', // Note: SVG can contain scripts but browser should respect nosniff
      'text/plain',
      'text/csv',
      'text/html', // Will be treated as plain text due to CSP
      'application/json',
      'application/xml',
      'text/xml',
    ]);

    // Sanitize MIME type - only allow known safe types, default to octet-stream
    const requestedMimetype = preview.mimetype?.toLowerCase()?.trim() || '';
    const safeMimetype = SAFE_PREVIEW_MIMETYPES.has(requestedMimetype)
      ? requestedMimetype
      : 'application/octet-stream';

    // Sanitize filename to prevent header injection
    const safeFilename = preview.filename
      .replace(/["\r\n]/g, '') // Remove quotes and newlines
      .replace(/[^\x20-\x7E]/g, '_'); // Replace non-ASCII with underscore

    // Set headers for inline display with XSS protection
    res.setHeader("Content-Type", safeMimetype);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${safeFilename}"`
    );
    res.setHeader("Content-Length", preview.content.length);

    res.send(preview.content);

    await logSuccess({
      eventType: "Read",
      description: `Preview served for file: ${preview.filename}`,
      functionName: "previewFile",
      fileName: "fileManager.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to get file preview",
      functionName: "previewFile",
      fileName: "fileManager.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
};

/**
 * Get file version history (all files in the same file group)
 *
 * GET /file-manager/:id/versions
 *
 * @param {Request} req - Express request with file ID in params
 * @param {Response} res - Express response
 * @returns {Promise<Response>} List of file versions in the same group
 */
export const getFileVersionHistory = async (
  req: Request,
  res: Response
): Promise<any> => {
  // Validate file ID is numeric-only string before parsing
  if (!/^\d+$/.test(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid file ID"));
  }

  const fileId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  if (!Number.isSafeInteger(fileId)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid file ID"));
  }

  const auth = validateAndParseAuth(req, res);
  if (!auth) return;

  const { userId, orgId } = auth;

  logProcessing({
    description: `Getting version history for file ID ${fileId}`,
    functionName: "getFileVersionHistory",
    fileName: "fileManager.ctrl.ts",
    userId,
    organizationId: orgId,
  });

  try {
    // Get the file to extract file_group_id
    const file = await getFileWithMetadata(fileId, orgId);

    if (!file) {
      return res.status(404).json(STATUS_CODE[404]("File not found"));
    }

    if (!file.file_group_id) {
      // No group ID means no version history — return just this file
      return res.status(200).json(STATUS_CODE[200]({ versions: [file] }));
    }

    const versions = await getFileVersionHistoryRepo(file.file_group_id, orgId);

    await logSuccess({
      eventType: "Read",
      description: `Retrieved ${versions.length} versions for file group: ${file.file_group_id}`,
      functionName: "getFileVersionHistory",
      fileName: "fileManager.ctrl.ts",
      userId,
      organizationId: orgId,
    });

    return res.status(200).json(STATUS_CODE[200]({ versions }));
  } catch (error) {
    await logFailure({
      eventType: "Error",
      description: "Failed to get file version history",
      functionName: "getFileVersionHistory",
      fileName: "fileManager.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
};
