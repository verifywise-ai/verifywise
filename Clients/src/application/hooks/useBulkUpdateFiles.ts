import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  bulkUpdateFileTags,
  type BulkUpdateFileTagsPayload,
  type BulkFileTagMode,
} from "../repository/file.repository";
import { assignFilesToFolder } from "../repository/virtualFolder.repository";
import { fileQueryKeys } from "./useFiles";
import { FileModel } from "../../domain/models/Common/file/file.model";

export type BulkFileAction =
  | { type: "move_to_folder"; folderId: number; ids: number[] }
  | { type: "update_tags"; payload: BulkUpdateFileTagsPayload };

interface UseBulkUpdateFilesOptions {
  onSuccess?: (action: BulkFileAction) => void;
  onError?: (error: unknown, action: BulkFileAction) => void;
}

interface TagMutationContext {
  previousData: FileModel[] | undefined;
  queryKey: readonly unknown[];
}

async function runBulkAction(action: BulkFileAction) {
  if (action.type === "move_to_folder") {
    return assignFilesToFolder(action.folderId, action.ids);
  }
  return bulkUpdateFileTags(action.payload);
}

function applyTagUpdate(
  currentTags: string[] | undefined,
  newTags: string[],
  mode: BulkFileTagMode,
): string[] {
  if (mode === "set") return newTags;
  const current = currentTags ?? [];
  if (mode === "add") return Array.from(new Set([...current, ...newTags]));
  return current.filter((tag) => !newTags.includes(tag));
}

export function useBulkUpdateFiles(options: UseBulkUpdateFilesOptions = {}) {
  const queryClient = useQueryClient();
  const { onSuccess, onError } = options;

  return useMutation<unknown, Error, BulkFileAction, TagMutationContext | undefined>({
    mutationFn: (action) => runBulkAction(action),
    onMutate: async (action) => {
      if (action.type !== "update_tags") return undefined;

      const queryKey = fileQueryKeys.list();
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<FileModel[]>(queryKey);

      if (previousData) {
        const targetIds = new Set(action.payload.ids.map((id) => String(id)));
        queryClient.setQueryData<FileModel[]>(queryKey, (old) =>
          old?.map((file) => {
            if (!targetIds.has(String(file.id))) return file;
            return FileModel.createNewFile({
              ...file,
              tags: applyTagUpdate(file.tags, action.payload.tags, action.payload.mode),
            });
          }),
        );
      }

      return { previousData, queryKey };
    },
    onError: (error, action, context) => {
      if (action.type === "update_tags" && context?.previousData !== undefined) {
        queryClient.setQueryData(context.queryKey, context.previousData);
      }
      onError?.(error, action);
    },
    onSuccess: (_data, action) => {
      if (action.type === "update_tags") {
        queryClient.invalidateQueries({ queryKey: fileQueryKeys.lists() });
      }
      onSuccess?.(action);
    },
  });
}
