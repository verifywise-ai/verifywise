import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface RunStatus {
  state: "idle" | "running" | "done" | "failed";
  active_stage: string | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

export interface RunRequest {
  dataset_version: string;
  stages: string[];
  params: Record<string, unknown>;
}

async function fetchStatus(): Promise<RunStatus> {
  const res = await fetch("/api/run/status");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function useRunStatus() {
  return useQuery({
    queryKey: ["run-status"],
    queryFn: fetchStatus,
    refetchInterval: (query) =>
      query.state.data?.state === "running" ? 2000 : false,
  });
}

export function useStartRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (request: RunRequest) => {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail ?? "Failed to start run");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["run-status"] }),
  });
}

export function useStopRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/run", { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["run-status"] }),
  });
}
