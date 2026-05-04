/**
 * @fileoverview File Error Handling Utilities
 *
 * Centralized error message mapping for file operations.
 * Provides consistent, user-friendly error messages across the application.
 *
 * @module utils/fileErrorHandler
 */

import { MAX_FILE_SIZE_MB } from "../constants/fileManager";

/**
 * Error context types for different file operations
 */
export type FileErrorContext = "upload" | "download" | "delete" | "general";

/**
 * Maps error objects to user-friendly error messages
 *
 * Checks HTTP status codes first (most specific), then error messages,
 * and provides context-appropriate fallback messages.
 *
 * @param {any} error - The error object from the operation
 * @param {FileErrorContext} context - The operation context
 * @returns {string} User-friendly error message
 *
 * @example
 * try {
 *   await uploadFile(file);
 * } catch (error) {
 *   const message = getFileErrorMessage(error, 'upload');
 *   showToast(message);
 * }
 */
export const getFileErrorMessage = (error: any, context: FileErrorContext = "general"): string => {
  // Check HTTP status codes (most specific)
  if (error?.statusCode === 413) {
    return `File too large (max ${MAX_FILE_SIZE_MB}MB)`;
  }

  if (error?.statusCode === 415) {
    return "Unsupported file type";
  }

  if (error?.statusCode === 403) {
    return context === "upload"
      ? "Permission denied. You don't have permission to upload files."
      : context === "download"
        ? "Access denied. You don't have permission to download this file."
        : context === "delete"
          ? "Access denied. You don't have permission to delete this file."
          : "Permission denied";
  }

  if (error?.statusCode === 404) {
    return context === "download"
      ? "File not found on the server. It may have been deleted.\n\nPlease refresh the page to update the file list."
      : context === "delete"
        ? "File not found on the server. It may have already been deleted.\n\nPlease refresh the page to update the file list."
        : "File not found";
  }

  if (error?.statusCode === 500) {
    return "Server error. Please try again.";
  }

  // Check error messages (fallback)
  if (error?.message) {
    if (error.message.includes("not found")) {
      return context === "download" || context === "delete"
        ? "File not found on the server. It may have been deleted.\n\nPlease refresh the page to update the file list."
        : "File not found";
    }

    if (error.message.includes("permission") || error.message.includes("denied")) {
      return `You don't have permission to ${context} this file.`;
    }

    // Return the original message if it's descriptive
    return error.message;
  }

  // Default context-specific messages
  const defaultMessages: Record<FileErrorContext, string> = {
    upload: "Upload failed",
    download:
      "Failed to download file. The file may have been deleted or you don't have permission.",
    delete: "Failed to delete file. You may not have permission to delete this file.",
    general: "Operation failed",
  };

  return defaultMessages[context];
};
