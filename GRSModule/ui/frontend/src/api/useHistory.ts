import { useQuery } from "@tanstack/react-query";

export interface RunHistoryEntry {
  timestamp: string;
  dataset_version: string | null;
  stages: string[] | null;
  status: string;
  error_message: string | null;
}

export function useRunHistory() {
  return useQuery({
    queryKey: ["run-history"],
    queryFn: async (): Promise<RunHistoryEntry[]> => {
      const res = await fetch("/api/runs");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data.runs;
    },
  });
}
