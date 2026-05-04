/**
 * @fileoverview Office File Preview Utilities
 *
 * Extracts embedded thumbnail previews from Microsoft Office files.
 * Office files (DOCX, XLSX, PPTX) are ZIP archives that may contain
 * a thumbnail image at docProps/thumbnail.jpeg or docProps/thumbnail.png
 *
 * @module application/utils/officePreview
 */

import JSZip from "jszip";

/**
 * Preview result containing extracted thumbnail or error
 */
export interface OfficePreviewResult {
  success: boolean;
  thumbnailUrl?: string;
  error?: string;
}

/**
 * Supported Office mimetypes
 */
const OFFICE_MIMETYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // XLSX
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // PPTX
];

/**
 * Possible thumbnail paths inside Office files
 */
const THUMBNAIL_PATHS = [
  "docProps/thumbnail.jpeg",
  "docProps/thumbnail.jpg",
  "docProps/thumbnail.png",
  "docProps/thumbnail.wmf",
  "docProps/thumbnail.emf",
];

/**
 * Extract embedded thumbnail preview from an Office file
 *
 * @param blob - The file blob to extract thumbnail from
 * @returns Preview result with thumbnail URL or error
 */
export async function getOfficeThumbnail(blob: Blob): Promise<OfficePreviewResult> {
  try {
    const zip = await JSZip.loadAsync(blob);

    // Try each possible thumbnail path
    for (const path of THUMBNAIL_PATHS) {
      const thumbnailFile = zip.file(path);
      if (thumbnailFile) {
        // Get the thumbnail as a blob
        const thumbnailBlob = await thumbnailFile.async("blob");

        // Determine MIME type based on extension
        let mimeType = "image/jpeg";
        if (path.endsWith(".png")) {
          mimeType = "image/png";
        } else if (path.endsWith(".wmf") || path.endsWith(".emf")) {
          // WMF/EMF are Windows metafiles - browsers can't display them
          continue;
        }

        // Create object URL for the thumbnail
        const thumbnailUrl = URL.createObjectURL(new Blob([thumbnailBlob], { type: mimeType }));

        return {
          success: true,
          thumbnailUrl,
        };
      }
    }

    // No thumbnail found in the file
    return {
      success: false,
      error: "No preview available",
    };
  } catch (error) {
    console.error("Error extracting office thumbnail:", error);
    return {
      success: false,
      error: "Could not extract preview",
    };
  }
}

/**
 * Check if a mimetype is a supported Office format
 */
export function isOfficeFile(mimetype?: string): boolean {
  if (!mimetype) return false;
  return OFFICE_MIMETYPES.includes(mimetype);
}

/**
 * Get a friendly label for the office file type
 */
export function getOfficeFileLabel(mimetype?: string): string {
  if (!mimetype) return "Office document";

  if (mimetype.includes("wordprocessingml")) {
    return "Word document";
  }
  if (mimetype.includes("spreadsheetml")) {
    return "Excel spreadsheet";
  }
  if (mimetype.includes("presentationml")) {
    return "PowerPoint presentation";
  }

  return "Office document";
}
