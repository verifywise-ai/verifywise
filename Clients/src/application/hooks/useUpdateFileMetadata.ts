import { updateFileMetadata, type UpdateFileMetadataInput } from "../repository/file.repository";
import { fileQueryKeys } from "./useFiles";
import { useOptimisticListMutation } from "./utils/optimisticMutation";
import { FileModel } from "../../domain/models/Common/file/file.model";

export interface UpdateFileMetadataVariables {
  id: string;
  updates: UpdateFileMetadataInput;
}

export function useUpdateFileMetadata() {
  return useOptimisticListMutation<FileModel, unknown, Error, UpdateFileMetadataVariables>({
    mutationFn: ({ id, updates }) => updateFileMetadata({ id, updates }),
    queryKey: () => fileQueryKeys.list(),
    updateItem:
      ({ id, updates }) =>
      (file) =>
        String(file.id) === String(id) ? FileModel.createNewFile({ ...file, ...updates }) : file,
  });
}
