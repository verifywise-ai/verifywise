/**
 * @fileoverview File Data Transformation Utilities
 *
 * Shared utilities for transforming file data from API responses to application format.
 * Ensures consistent data structure across the application (DRY principle).
 *
 * @module utils/fileTransform
 */

import { FileModel } from "../../domain/models/Common/file/file.model";

/**
 * Transforms raw file data from API to application FileModel format
 *
 * Handles missing or malformed data gracefully with defensive checks.
 * Server response fields: id, filename, size, mimetype, upload_date, uploaded_by,
 * uploader_name, uploader_surname, existsOnDisk
 *
 * @param {any} file - Raw file data from API
 * @returns {FileModel} Formatted file data for application use
 */
export const transformFileData = (file: any): FileModel => {
  // Server sends 'upload_date' not 'uploaded_time'
  const uploadDate = file.upload_date || file.uploaded_time;

  // Construct uploader name from uploader_name and uploader_surname fields
  const uploaderName =
    file.uploader_name && file.uploader_surname
      ? `${file.uploader_name} ${file.uploader_surname}`
      : file.uploader_name || file.uploader_surname || "Unknown";

  return FileModel.fromApiData({
    id: file.id ?? "",
    fileName: file.filename ?? "Unknown",
    uploadDate: uploadDate ? new Date(uploadDate) : new Date(),
    uploader: file.uploaded_by || "unknown",
    uploaderName: uploaderName,
    source: file.source ?? "File Manager",
    projectTitle: file.project_title ?? "N/A",
    projectId: file.project_id != null ? String(file.project_id) : "0",
    parentId: file.parent_id ?? null,
    subId: file.sub_id ?? null,
    metaId: file.meta_id ?? null,
    isEvidence: file.is_evidence ?? false,
    type: file.mimetype || file.type,
    size: file.size,
    version: file.version,
    reviewStatus: file.review_status,
    fileGroupId: file.file_group_id,
    entityLinks: file.entity_links ?? [],
    linkGroups: file.link_groups ?? [],
  });
};

/**
 * Transforms an array of raw file data to FileModel format
 *
 * @param {any[]} files - Array of raw file data from API
 * @returns {FileModel[]} Array of formatted file data
 */
export const transformFilesData = (files: any[]): FileModel[] => {
  if (!Array.isArray(files)) {
    return [];
  }
  return files.map(transformFileData);
};
