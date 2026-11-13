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

/**
 * The organization's imported frameworks. Pass `enabled: false` while the
 * framework-import extension is off: the endpoint answers 403 then, and
 * querying it would only produce failed requests and retries.
 */
export function useImportedFrameworks({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: frameworkImportKeys.imported(),
    queryFn: () => getImportedFrameworks(),
    enabled,
  });
}

export function useImportFramework() {
  const qc = useQueryClient();
  return useMutation<FrameworkImportResult, Error, FrameworkImportRow[]>({
    mutationFn: (rows) => importFramework(rows),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: frameworkImportKeys.imported() });
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
    },
  });
}

export function useDeleteImportedFramework() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteImportedFramework(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: frameworkImportKeys.imported() });
    },
  });
}
