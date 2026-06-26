/* eslint-disable @typescript-eslint/no-explicit-any */
import { apiServices } from "../../infrastructure/api/networkServices";

// Review status type
export type ReviewStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "expired"
  | "superseded";

// Type definitions for API responses
export interface FileMetadata {
  id: string;
  filename: string;
  size: number;
  mimetype: string;
  upload_date: string;
  uploaded_by: string;
  uploader_name?: string;
  uploader_surname?: string;
  source?: string;
  project_title?: string;
  project_id?: string | number;
  parent_id?: number;
  sub_id?: number;
  meta_id?: number;
  is_evidence?: boolean;
  // Multi-link projections — one entry per row in file_entity_links for this file.
  entity_links?: Array<{
    framework_type: string;
    entity_type: string;
    entity_id: number;
    project_id: number | null;
    link_type: string | null;
    group_label: string | null;
    parent_id: number | null;
    sub_id: number | null;
    meta_id: number | null;
    is_evidence: boolean;
    mapped_model_ids?: number[];
    mapped_training_ids?: number[];
  }>;
  link_groups?: string[];
  // New metadata fields
  tags?: string[];
  review_status?: ReviewStatus;
  version?: string;
  expiry_date?: string;
  last_modified_by?: number;
  last_modifier_name?: string;
  last_modifier_surname?: string;
  description?: string;
  file_group_id?: string;
  // Approval workflow
  approval_workflow_id?: number;
  approval_workflow_name?: string;
  // Attention flags (returned by /file-manager/with-metadata)
  is_due_for_update?: boolean;
  is_pending_approval?: boolean;
  is_recently_modified?: boolean;
}

// Input for updating file metadata
export interface UpdateFileMetadataInput {
  tags?: string[];
  review_status?: ReviewStatus;
  version?: string;
  expiry_date?: string | null;
  description?: string | null;
}

export interface FileManagerResponse {
  success: boolean;
  data: {
    files: FileMetadata[];
    pagination?: {
      page: number;
      limit: number;
      total: number;
    };
  };
}

export interface FileUploadResponse {
  message: string;
  data: {
    id: number;
    filename: string;
    size: number;
    mimetype: string;
    upload_date: string;
    uploaded_by: number;
    modelId?: string; // optional
    review_status?: ReviewStatus;
    approval_workflow_id?: number;
    approval_request_id?: number;
  };
}

export async function getFileById({
  id,
  signal,
  responseType = "json",
}: {
  id: string;
  signal?: AbortSignal;
  responseType?: string;
}): Promise<Blob | ArrayBuffer> {
  const response = await apiServices.get<any>(`/files/${id}`, {
    signal,
    responseType,
  });
  return response.data;
}

/**
 * Get all files metadata for the current user's organization
 *
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<FileMetadata[]>} Array of file metadata
 */
export async function getUserFilesMetaData({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<FileMetadata[]> {
  const [fileManageResponse, fileResponse] = await Promise.all([
    apiServices.get<FileManagerResponse>("/file-manager", { signal }),
    apiServices.get<any[]>("/files", { signal }),
  ]);

  // Extract and return all file data from API
  const rawFiles = [...(fileManageResponse.data?.data?.files ?? []), ...(fileResponse.data ?? [])];

  return rawFiles.map((f: any) => ({
    id: String(f.id),
    filename: f.filename,
    size: f?.size,
    mimetype: f?.mimetype,
    upload_date: f?.upload_date || f?.uploaded_time,
    uploaded_by: String(f?.uploaded_by),
    uploader_name: f?.uploader_name,
    uploader_surname: f?.uploader_surname,
    source: f?.source,
    project_title: f?.project_title,
    project_id: f?.project_id,
    parent_id: f?.parent_id,
    sub_id: f?.sub_id,
    meta_id: f?.meta_id,
    is_evidence: f?.is_evidence,
    // Per-link projections (from /files endpoint) used to render the File
    // Manager Source column when a file is attached in multiple places.
    entity_links: f?.entity_links ?? [],
    link_groups: f?.link_groups ?? [],
    // Metadata fields (may not be present in all responses)
    tags: f?.tags || [],
    review_status: f?.review_status,
    version: f?.version,
    expiry_date: f?.expiry_date,
    description: f?.description,
    file_group_id: f?.file_group_id,
    approval_workflow_id: f?.approval_workflow_id,
    approval_workflow_name: f?.approval_workflow_name,
  })) as FileMetadata[];
}

/**
 * Upload a file to the file manager
 *
 * @param {File} file - The file to upload
 * @param {string} model_id - Optional model ID to associate with the file
 * @param {string} source - Optional source identifier (e.g., "policy_editor", "evidence")
 * @param {number} approval_workflow_id - Optional approval workflow ID for file review
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<FileUploadResponse>} Upload response with file metadata
 */
export async function uploadFileToManager({
  file,
  model_id,
  source,
  approval_workflow_id,
  signal,
}: {
  file: File;
  model_id?: string | number | undefined | null;
  source?: string;
  approval_workflow_id?: number;
  signal?: AbortSignal;
}): Promise<FileUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  // Append model_id only if it's defined and valid
  formData.append("model_id", model_id ? String(model_id) : "");

  // Append source to identify where the file was uploaded from
  if (source) {
    formData.append("source", source);
  }

  // Append approval_workflow_id for file review workflow
  if (approval_workflow_id) {
    formData.append("approval_workflow_id", String(approval_workflow_id));
  }

  // Delete Content-Type header to let axios auto-detect and set the proper boundary
  const response = await apiServices.post<FileUploadResponse>("/file-manager", formData, {
    signal,
    headers: {
      "Content-Type": undefined,
    },
  });

  return response.data;
}

/**
 * Download a file from the file manager
 *
 * @param {string} id - The file ID to download
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<Blob>} File blob response
 */
export async function downloadFileFromManager({
  id,
  signal,
}: {
  id: string;
  signal?: AbortSignal;
}): Promise<Blob> {
  const response = await apiServices.get<Blob>(`/file-manager/${id}`, {
    signal,
    responseType: "blob",
  });
  return response.data;
}

/**
 * Delete a file from the file manager
 *
 * @param {string} id - The file ID to delete
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<any>} Delete response
 */
export async function deleteFileFromManager({
  id,
  signal,
}: {
  id: string;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.delete<any>(`/file-manager/${id}`, {
    signal,
  });
  return response.data;
}

/**
 * Delete question evidence file(s) using multipart form data
 *
 * @param {number[]} deleteFileIds - Array of file IDs to delete
 * @param {string} questionId - The question ID
 * @param {string} userId - The user ID
 * @param {string} projectId - The project ID (optional)
 * @returns {Promise<any>} Delete response
 */
export async function deleteQuestionEvidenceFiles({
  deleteFileIds,
  questionId,
  userId,
  projectId,
}: {
  deleteFileIds: number[];
  questionId: string;
  userId: string;
  projectId?: string;
}): Promise<any> {
  const formData = new FormData();
  formData.append("delete", JSON.stringify(deleteFileIds));
  formData.append("question_id", questionId);
  formData.append("user_id", userId);
  if (projectId) {
    formData.append("project_id", projectId);
  }

  const response = await apiServices.post("/files", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response;
}

/**
 * Get all files with full metadata + attention flags.
 *
 * @param {object} options
 * @param {number} options.page - Page number
 * @param {number} options.pageSize - Items per page
 * @param {number} options.daysUntilExpiry - Threshold for is_due_for_update flag (default 30)
 * @param {number} options.recentDays - Threshold for is_recently_modified flag (default 7)
 * @param {AbortSignal} options.signal - Optional abort signal for cancellation
 */
export async function getFilesWithMetadata({
  page,
  pageSize,
  daysUntilExpiry,
  recentDays,
  signal,
}: {
  page?: number;
  pageSize?: number;
  daysUntilExpiry?: number;
  recentDays?: number;
  signal?: AbortSignal;
} = {}): Promise<{ files: FileMetadata[]; pagination: any }> {
  const params = new URLSearchParams();
  if (page) params.append("page", String(page));
  if (pageSize) params.append("pageSize", String(pageSize));
  if (daysUntilExpiry !== undefined) params.append("daysUntilExpiry", String(daysUntilExpiry));
  if (recentDays !== undefined) params.append("recentDays", String(recentDays));

  const queryString = params.toString();
  const url = `/file-manager/with-metadata${queryString ? `?${queryString}` : ""}`;

  const response = await apiServices.get<any>(url, { signal });
  const data = response.data?.data || response.data;

  return {
    files: (data?.files || []).map((f: any) => ({
      id: String(f.id),
      filename: f.filename,
      size: f?.size,
      mimetype: f?.mimetype,
      upload_date: f?.upload_date,
      uploaded_by: String(f?.uploaded_by),
      uploader_name: f?.uploader_name,
      uploader_surname: f?.uploader_surname,
      source: f?.source,
      // Carry the multi-link payload so the File Manager Source column can
      // render the tooltip + popover for files attached in multiple places.
      entity_links: f?.entity_links ?? [],
      link_groups: f?.link_groups ?? [],
      // Hierarchy fields backfilled by attachLinkProjections (first link) so
      // single-link click navigation still works without consulting entity_links.
      parent_id: f?.parent_id,
      sub_id: f?.sub_id,
      meta_id: f?.meta_id,
      is_evidence: f?.is_evidence,
      project_id: f?.project_id,
      tags: f?.tags || [],
      review_status: f?.review_status,
      version: f?.version,
      expiry_date: f?.expiry_date,
      last_modified_by: f?.last_modified_by,
      last_modifier_name: f?.last_modifier_name,
      last_modifier_surname: f?.last_modifier_surname,
      description: f?.description,
      file_group_id: f?.file_group_id,
      approval_workflow_id: f?.approval_workflow_id,
      approval_workflow_name: f?.approval_workflow_name,
      is_due_for_update: Boolean(f?.is_due_for_update),
      is_pending_approval: Boolean(f?.is_pending_approval),
      is_recently_modified: Boolean(f?.is_recently_modified),
    })),
    pagination: data?.pagination,
  };
}

/**
 * Get file metadata by ID
 *
 * @param {string} id - File ID
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<FileMetadata>} File metadata
 */
export async function getFileMetadata({
  id,
  signal,
}: {
  id: string;
  signal?: AbortSignal;
}): Promise<FileMetadata> {
  const response = await apiServices.get<any>(`/file-manager/${id}/metadata`, { signal });
  const f = response.data?.data || response.data;

  return {
    id: String(f.id),
    filename: f.filename,
    size: f?.size,
    mimetype: f?.mimetype,
    upload_date: f?.upload_date,
    uploaded_by: String(f?.uploaded_by),
    uploader_name: f?.uploader_name,
    uploader_surname: f?.uploader_surname,
    source: f?.source,
    tags: f?.tags || [],
    review_status: f?.review_status,
    version: f?.version,
    expiry_date: f?.expiry_date,
    last_modified_by: f?.last_modified_by,
    last_modifier_name: f?.last_modifier_name,
    last_modifier_surname: f?.last_modifier_surname,
    description: f?.description,
    file_group_id: f?.file_group_id,
    approval_workflow_id: f?.approval_workflow_id,
    approval_workflow_name: f?.approval_workflow_name,
  };
}

/**
 * Update file metadata
 *
 * @param {string} id - File ID
 * @param {UpdateFileMetadataInput} updates - Metadata updates
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<FileMetadata>} Updated file metadata
 */
export async function updateFileMetadata({
  id,
  updates,
  signal,
}: {
  id: string;
  updates: UpdateFileMetadataInput;
  signal?: AbortSignal;
}): Promise<FileMetadata> {
  const response = await apiServices.patch<any>(`/file-manager/${id}/metadata`, updates, {
    signal,
  });
  const f = response.data?.data || response.data;

  return {
    id: String(f.id),
    filename: f.filename,
    size: f?.size,
    mimetype: f?.mimetype,
    upload_date: f?.upload_date,
    uploaded_by: String(f?.uploaded_by),
    uploader_name: f?.uploader_name,
    uploader_surname: f?.uploader_surname,
    source: f?.source,
    tags: f?.tags || [],
    review_status: f?.review_status,
    version: f?.version,
    expiry_date: f?.expiry_date,
    last_modified_by: f?.last_modified_by,
    last_modifier_name: f?.last_modifier_name,
    last_modifier_surname: f?.last_modifier_surname,
    description: f?.description,
    file_group_id: f?.file_group_id,
    approval_workflow_id: f?.approval_workflow_id,
    approval_workflow_name: f?.approval_workflow_name,
  };
}

/**
 * Get file preview content
 *
 * @param {string} id - File ID
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<Blob>} File content blob
 */
export async function getFilePreview({
  id,
  signal,
}: {
  id: string;
  signal?: AbortSignal;
}): Promise<Blob> {
  const response = await apiServices.get<Blob>(`/file-manager/${id}/preview`, {
    signal,
    responseType: "blob",
  });
  return response.data;
}

export interface FileVersionHistoryPage {
  versions: FileMetadata[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

/**
 * Get a paginated page of file version history (all files in the same group).
 *
 * @param {string}      id        - File ID
 * @param {number}      [page]    - Page number (default 1, server-side)
 * @param {number}      [pageSize] - Items per page (default 20, server-side)
 * @param {AbortSignal} [signal]  - Optional abort signal for cancellation
 * @returns {Promise<FileVersionHistoryPage>} Versions plus pagination metadata
 */
export async function getFileVersionHistory({
  id,
  page,
  pageSize,
  signal,
}: {
  id: string;
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}): Promise<FileVersionHistoryPage> {
  const params = new URLSearchParams();
  if (page !== undefined) params.set("page", String(page));
  if (pageSize !== undefined) params.set("pageSize", String(pageSize));
  const qs = params.toString();
  const url = `/file-manager/${id}/versions${qs ? `?${qs}` : ""}`;
  const response = await apiServices.get<any>(url, { signal });

  const data = response.data?.data || response.data;
  const versions: any[] = data?.versions || [];
  // Backend always returns a `pagination` envelope post-PR; old responses
  // (or the no-group-id branch) may not, so default to a single-page shape.
  const paginationRaw = data?.pagination;
  const total = typeof paginationRaw?.total === "number" ? paginationRaw.total : versions.length;
  const pageOut = typeof paginationRaw?.page === "number" ? paginationRaw.page : 1;
  const pageSizeOut =
    typeof paginationRaw?.pageSize === "number" ? paginationRaw.pageSize : versions.length || 20;
  const totalPages =
    typeof paginationRaw?.totalPages === "number"
      ? paginationRaw.totalPages
      : Math.max(1, Math.ceil(total / (pageSizeOut || 1)));

  return {
    versions: versions.map((f: any) => ({
      id: String(f.id),
      filename: f.filename,
      size: f?.size,
      mimetype: f?.mimetype,
      upload_date: f?.upload_date,
      uploaded_by: String(f?.uploaded_by),
      uploader_name: f?.uploader_name,
      uploader_surname: f?.uploader_surname,
      source: f?.source,
      tags: f?.tags || [],
      review_status: f?.review_status,
      version: f?.version,
      expiry_date: f?.expiry_date,
      description: f?.description,
      file_group_id: f?.file_group_id,
    })),
    pagination: { total, page: pageOut, pageSize: pageSizeOut, totalPages },
  };
}

// ============================================================================
// File Entity Linking (Framework-agnostic evidence attachment)
// ============================================================================

export type FrameworkType = "eu_ai_act" | "nist_ai" | "iso_27001" | "iso_42001" | string;
export type EntityType =
  | "assessment"
  | "subcontrol"
  | "subclause"
  | "annex_control"
  | "annex_category"
  | string;
export type LinkType = "evidence" | "feedback" | "attachment" | "reference";

export interface FileEntityLink {
  id?: number;
  file_id: number;
  framework_type: FrameworkType;
  entity_type: EntityType;
  entity_id: number;
  project_id?: number;
  link_type?: LinkType;
  created_by?: number;
  created_at?: string;
}

export interface AttachFileParams {
  file_id: number;
  framework_type: FrameworkType;
  entity_type: EntityType;
  entity_id: number;
  project_id?: number;
  link_type?: LinkType;
}

export interface AttachFilesParams {
  file_ids: number[];
  framework_type: FrameworkType;
  entity_type: EntityType;
  entity_id: number;
  project_id?: number;
  link_type?: LinkType;
}

/**
 * Attach a single file to an entity (control, assessment, subclause, etc.)
 * Works across all frameworks.
 *
 * @param {AttachFileParams} params - File attachment parameters
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<{ message: string; link?: FileEntityLink }>}
 */
export async function attachFileToEntity(
  params: AttachFileParams,
  signal?: AbortSignal,
): Promise<{ message: string; link?: FileEntityLink }> {
  const response = await apiServices.post<any>("/files/attach", params, { signal });
  return response.data;
}

/**
 * Attach multiple files to an entity at once
 *
 * @param {AttachFilesParams} params - Bulk file attachment parameters
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<{ message: string; results: { file_id: number; success: boolean; message: string }[] }>}
 */
export async function attachFilesToEntity(
  params: AttachFilesParams,
  signal?: AbortSignal,
): Promise<{
  message: string;
  results: { file_id: number; success: boolean; message: string }[];
}> {
  const response = await apiServices.post<any>("/files/attach-bulk", params, { signal });
  return response.data;
}

/**
 * Detach a file from an entity
 *
 * @param {AttachFileParams} params - File detachment parameters (file_id, framework_type, entity_type, entity_id)
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<{ message: string }>}
 */
export async function detachFileFromEntity(
  params: Pick<AttachFileParams, "file_id" | "framework_type" | "entity_type" | "entity_id">,
  signal?: AbortSignal,
): Promise<{ message: string }> {
  const response = await apiServices.delete<any>("/files/detach", {
    data: params,
    signal,
  });
  return response.data;
}

/**
 * Get all files attached to a specific entity
 *
 * @param {FrameworkType} frameworkType - The framework type
 * @param {EntityType} entityType - The entity type
 * @param {number} entityId - The entity ID
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<FileMetadata[]>}
 */
export interface EntityFilesPage {
  files: FileMetadata[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export async function getEntityFiles(
  frameworkType: FrameworkType,
  entityType: EntityType,
  entityId: number,
  signalOrOptions?: AbortSignal | { page?: number; pageSize?: number; signal?: AbortSignal },
): Promise<EntityFilesPage> {
  // Backwards-compatible call signatures:
  //   getEntityFiles(ft, et, id)
  //   getEntityFiles(ft, et, id, signal)
  //   getEntityFiles(ft, et, id, { page, pageSize, signal })
  let page: number | undefined;
  let pageSize: number | undefined;
  let signal: AbortSignal | undefined;
  if (signalOrOptions instanceof AbortSignal) {
    signal = signalOrOptions;
  } else if (signalOrOptions && typeof signalOrOptions === "object") {
    page = signalOrOptions.page;
    pageSize = signalOrOptions.pageSize;
    signal = signalOrOptions.signal;
  }

  const params = new URLSearchParams();
  if (page !== undefined) params.set("page", String(page));
  if (pageSize !== undefined) params.set("pageSize", String(pageSize));
  const qs = params.toString();
  const url = `/files/entity/${frameworkType}/${entityType}/${entityId}${qs ? `?${qs}` : ""}`;

  const response = await apiServices.get<any>(url, { signal });
  const body = response.data;

  // Backend response is `{ files, pagination }` (new shape). Tolerate the
  // pre-pagination raw-array shape for transitional clients.
  const rawFiles: any[] = Array.isArray(body) ? body : body?.files || [];
  const paginationRaw = Array.isArray(body) ? null : body?.pagination;

  const total = typeof paginationRaw?.total === "number" ? paginationRaw.total : rawFiles.length;
  const pageOut = typeof paginationRaw?.page === "number" ? paginationRaw.page : 1;
  const pageSizeOut =
    typeof paginationRaw?.pageSize === "number" ? paginationRaw.pageSize : rawFiles.length || 50;
  const totalPages =
    typeof paginationRaw?.totalPages === "number"
      ? paginationRaw.totalPages
      : Math.max(1, Math.ceil(total / (pageSizeOut || 1)));

  return {
    files: rawFiles.map((f: any) => ({
      id: String(f.id),
      filename: f.filename,
      size: f?.size,
      mimetype: f?.mimetype,
      upload_date: f?.upload_date,
      uploaded_by: String(f?.uploaded_by),
      uploader_name: f?.uploader_name,
      uploader_surname: f?.uploader_surname,
      source: f?.source,
      project_id: f?.project_id,
      tags: f?.tags || [],
      review_status: f?.review_status,
      version: f?.version,
      link_type: f?.link_type,
    })),
    pagination: { total, page: pageOut, pageSize: pageSizeOut, totalPages },
  };
}

export type BulkFileTagMode = "set" | "add" | "remove";

export interface BulkUpdateFileTagsPayload {
  ids: number[];
  tags: string[];
  mode: BulkFileTagMode;
}

export async function bulkUpdateFileTags(payload: BulkUpdateFileTagsPayload): Promise<any> {
  try {
    const response = await apiServices.patch("/files/bulk-tags", payload);
    return response.data;
  } catch (error) {
    console.error("Error performing bulk file tag update:", error);
    throw error;
  }
}
