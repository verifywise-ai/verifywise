import { useQuery } from "@tanstack/react-query";
import { getFilesWithMetadata } from "../repository/file.repository";
import { transformFilesData } from "../utils/fileTransform.utils";

export const fileQueryKeys = {
  all: ["files"] as const,
  lists: () => [...fileQueryKeys.all, "list"] as const,
  list: (filters: { page?: number; pageSize?: number } = {}) =>
    [...fileQueryKeys.lists(), filters] as const,
  details: () => [...fileQueryKeys.all, "detail"] as const,
  detail: (id: string) => [...fileQueryKeys.details(), id] as const,
};

interface UseFilesOptions {
  page?: number;
  pageSize?: number;
}

export function useFiles(options: UseFilesOptions = {}) {
  const { page, pageSize } = options;

  return useQuery({
    queryKey: fileQueryKeys.list({ page, pageSize }),
    queryFn: async ({ signal }) => {
      const response = await getFilesWithMetadata({ page, pageSize, signal });
      return transformFilesData(response.files);
    },
    staleTime: 2 * 1000,
  });
}
