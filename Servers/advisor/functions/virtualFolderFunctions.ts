import {
  getAllFoldersQuery,
  getFolderTreeQuery,
  getFilesInFolderQuery,
  getUncategorizedFilesQuery,
} from "../../utils/virtualFolder.utils";
import logger from "../../utils/logger/fileLogger";

// ============================================================================
// Read Tools
// ============================================================================

const fetchVirtualFolders = async (params: { limit?: number }, organizationId: number) => {
  try {
    let folders = await getAllFoldersQuery(organizationId);

    if (params.limit && params.limit > 0) {
      folders = folders.slice(0, params.limit);
    }

    return {
      folders,
      total: folders.length,
    };
  } catch (error) {
    logger.error("Error fetching virtual folders:", error);
    throw new Error(
      `Failed to fetch virtual folders: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getFolderTree = async (_params: Record<string, unknown>, organizationId: number) => {
  try {
    const tree = await getFolderTreeQuery(organizationId);
    return {
      tree,
      total_root_folders: tree.length,
    };
  } catch (error) {
    logger.error("Error fetching folder tree:", error);
    throw new Error(
      `Failed to fetch folder tree: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getFolderFiles = async (
  params: { folder_id: number; limit?: number },
  organizationId: number,
) => {
  try {
    let files = await getFilesInFolderQuery(organizationId, params.folder_id);

    if (params.limit && params.limit > 0) {
      files = files.slice(0, params.limit);
    }

    return {
      folder_id: params.folder_id,
      files,
      total: files.length,
    };
  } catch (error) {
    logger.error("Error fetching folder files:", error);
    throw new Error(
      `Failed to fetch folder files: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getUncategorizedFiles = async (params: { limit?: number }, organizationId: number) => {
  try {
    let files = await getUncategorizedFilesQuery(organizationId);

    if (params.limit && params.limit > 0) {
      files = files.slice(0, params.limit);
    }

    return {
      files,
      total: files.length,
    };
  } catch (error) {
    logger.error("Error fetching uncategorized files:", error);
    throw new Error(
      `Failed to fetch uncategorized files: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// ============================================================================
// Export
// ============================================================================

const availableVirtualFolderTools: any = {
  fetch_virtual_folders: fetchVirtualFolders,
  get_folder_tree: getFolderTree,
  get_folder_files: getFolderFiles,
  get_uncategorized_files: getUncategorizedFiles,
};

export { availableVirtualFolderTools };
