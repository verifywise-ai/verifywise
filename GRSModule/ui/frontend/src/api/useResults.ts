import { useQuery } from "@tanstack/react-query";

export function useLeaderboard(datasetVersion: string) {
  return useQuery({
    queryKey: ["leaderboard", datasetVersion],
    queryFn: async () => {
      const res = await fetch(
        `/api/results/leaderboard?dataset_version=${encodeURIComponent(datasetVersion)}`
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!datasetVersion,
  });
}

export function useSummary(datasetVersion: string) {
  return useQuery({
    queryKey: ["summary", datasetVersion],
    queryFn: async () => {
      const res = await fetch(
        `/api/results/summary?dataset_version=${encodeURIComponent(datasetVersion)}`
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!datasetVersion,
  });
}
