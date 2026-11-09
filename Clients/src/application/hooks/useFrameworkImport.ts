import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  FrameworkImportResult,
  FrameworkImportRow,
  ImportedFrameworkPatch,
} from "../../domain/interfaces/i.frameworkImport";
import {
  deleteImportedFramework,
  getImportedFrameworks,
  importFramework,
  updateImportedFramework,
} from "../repository/frameworkImport.repository";

export const frameworkImportKeys = {
  all: ["frameworkImport"] as const,
  imported: () => [...frameworkImportKeys.all, "imported"] as const,
};

export function useImportedFrameworks() {
  return useQuery({
    queryKey: frameworkImportKeys.imported(),
    queryFn: () => getImportedFrameworks(),
  });
}

export function useImportFramework() {
  const qc = useQueryClient();
  return useMutation<FrameworkImportResult, Error, FrameworkImportRow[]>({
    mutationFn: (rows) => importFramework(rows),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: frameworkImportKeys.imported() });
      qc.invalidateQueries({ queryKey: ["frameworks"] });
    },
  });
}

export function useUpdateImportedFramework() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: ImportedFrameworkPatch }) =>
      updateImportedFramework({ id, patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: frameworkImportKeys.imported() });
      qc.invalidateQueries({ queryKey: ["frameworks"] });
    },
  });
}

export function useDeleteImportedFramework() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteImportedFramework(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: frameworkImportKeys.imported() });
      qc.invalidateQueries({ queryKey: ["frameworks"] });
    },
  });
}
