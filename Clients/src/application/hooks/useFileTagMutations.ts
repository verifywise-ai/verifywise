/**
 * @fileoverview Single-file tag mutations with optimistic updates.
 *
 * Both hooks go through the updateFileMetadata PATCH endpoint with the merged
 * tags array. The tags are patched optimistically on the file in every cached
 * fileQueryKeys list variant, rolled back on error, and replaced with the
 * server-returned tags on success (no list refetch).
 *
 * Note: folder views (useFolderFiles) keep files in local component state, not
 * in the query cache, so there is nothing further to patch here.
 *
 * @module application/hooks/useFileTagMutations
 */
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { updateFileMetadata, type FileMetadata } from "../repository/file.repository";
import { fileQueryKeys } from "./useFiles";
import { showMutationErrorToast } from "./utils/mutationErrorToast";
import { FileModel } from "../../domain/models/Common/file/file.model";

type ListSnapshot = [readonly unknown[], FileModel[]][];

/**
 * Snapshots every cached ["files"] list variant and applies `updater` to each.
 */
function patchFileLists(
  queryClient: QueryClient,
  updater: (list: FileModel[]) => FileModel[],
): ListSnapshot {
  const matches = queryClient.getQueriesData<FileModel[]>({ queryKey: fileQueryKeys.all });
  const snapshots: ListSnapshot = [];
  for (const [queryKey, data] of matches) {
    if (!Array.isArray(data)) continue;
    snapshots.push([queryKey, data]);
    queryClient.setQueryData<FileModel[]>(queryKey, updater(data));
  }
  return snapshots;
}

function restoreFileLists(queryClient: QueryClient, snapshots: ListSnapshot | undefined): void {
  if (!snapshots) return;
  for (const [queryKey, data] of snapshots) {
    queryClient.setQueryData(queryKey, data);
  }
}

function withTags(file: FileModel, id: string, tags: string[]): FileModel {
  return String(file.id) === String(id) ? FileModel.createNewFile({ ...file, tags }) : file;
}

export interface AddFileTagsVariables {
  id: string;
  /** Tags currently on the file — the PATCH endpoint replaces the whole array. */
  currentTags: string[];
  tags: string[];
}

export interface RemoveFileTagVariables {
  id: string;
  /** Tags currently on the file — the PATCH endpoint replaces the whole array. */
  currentTags: string[];
  tag: string;
}

export function useAddFileTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, currentTags, tags }: AddFileTagsVariables) => {
      const merged = Array.from(new Set([...currentTags, ...tags]));
      return updateFileMetadata({ id, updates: { tags: merged } });
    },
    onMutate: async ({ id, currentTags, tags }) => {
      await queryClient.cancelQueries({ queryKey: fileQueryKeys.all });
      const merged = Array.from(new Set([...currentTags, ...tags]));
      const snapshots = patchFileLists(queryClient, (list) =>
        list.map((file) => withTags(file, id, merged)),
      );
      return { snapshots, id };
    },
    onSuccess: (serverFile: FileMetadata, _variables, context) => {
      if (serverFile?.tags) {
        patchFileLists(queryClient, (list) =>
          list.map((file) => withTags(file, context?.id ?? "", serverFile.tags ?? [])),
        );
      }
    },
    onError: (error, _variables, context) => {
      restoreFileLists(queryClient, context?.snapshots);
      showMutationErrorToast(error, "Failed to update file tags. Please try again.");
    },
  });
}

export function useRemoveFileTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, currentTags, tag }: RemoveFileTagVariables) =>
      updateFileMetadata({ id, updates: { tags: currentTags.filter((t) => t !== tag) } }),
    onMutate: async ({ id, currentTags, tag }) => {
      await queryClient.cancelQueries({ queryKey: fileQueryKeys.all });
      const remaining = currentTags.filter((t) => t !== tag);
      const snapshots = patchFileLists(queryClient, (list) =>
        list.map((file) => withTags(file, id, remaining)),
      );
      return { snapshots, id };
    },
    onSuccess: (serverFile: FileMetadata, _variables, context) => {
      if (serverFile?.tags) {
        patchFileLists(queryClient, (list) =>
          list.map((file) => withTags(file, context?.id ?? "", serverFile.tags ?? [])),
        );
      }
    },
    onError: (error, _variables, context) => {
      restoreFileLists(queryClient, context?.snapshots);
      showMutationErrorToast(error, "Failed to update file tags. Please try again.");
    },
  });
}
