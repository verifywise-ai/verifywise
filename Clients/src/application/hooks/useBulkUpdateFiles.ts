import { useMutation } from "@tanstack/react-query";
import { bulkUpdateFileTags, type BulkUpdateFileTagsPayload } from "../repository/file.repository";
import { assignFilesToFolder } from "../repository/virtualFolder.repository";

export type BulkFileAction =
  | { type: "move_to_folder"; folderId: number; ids: number[] }
  | { type: "update_tags"; payload: BulkUpdateFileTagsPayload };

interface UseBulkUpdateFilesOptions {
  onSuccess?: (action: BulkFileAction) => void;
  onError?: (error: unknown, action: BulkFileAction) => void;
}

async function runBulkAction(action: BulkFileAction) {
  if (action.type === "move_to_folder") {
    return assignFilesToFolder(action.folderId, action.ids);
  }
  return bulkUpdateFileTags(action.payload);
}

export function useBulkUpdateFiles(options: UseBulkUpdateFilesOptions = {}) {
  return useMutation({
    mutationFn: (action: BulkFileAction) => runBulkAction(action),
    onSuccess: (_data, action) => options.onSuccess?.(action),
    onError: (error, action) => options.onError?.(error, action),
  });
}
