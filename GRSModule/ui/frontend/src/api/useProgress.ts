import { useQuery } from "@tanstack/react-query";
import { useRunStatus } from "./useRun";

export interface ProgressCounts {
  model_id: string;
  completed: number;
  total: number;
  failures: number;
}

export function useProgress(stage: string, datasetVersion: string) {
  const { data: status } = useRunStatus();
  const isRunning = status?.state === "running";

  return useQuery({
    queryKey: ["progress", stage, datasetVersion],
    queryFn: async (): Promise<ProgressCounts[]> => {
      const res = await fetch(
        `/api/progress/${stage}?dataset_version=${encodeURIComponent(datasetVersion)}`
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data.models;
    },
    refetchInterval: isRunning ? 2000 : false,
    enabled: !!datasetVersion,
  });
}
