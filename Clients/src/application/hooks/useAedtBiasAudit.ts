/**
 * React Query hooks for the NYC Local Law 144 bias audit module.
 *
 * None of them retries a refusal: a 404 (not found, or a project the caller
 * is not a member of), 409, 410, 413, 415 or 422 is an answer, not a fault,
 * and asking again gets the same answer.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  attestAedtProfile,
  confirmAedtDerivedBasis,
  createAedtRun,
  generateAedtRunStance,
  generateAedtScopeDetermination,
  getAedtProfile,
  getAedtQuestions,
  getAedtRun,
  listAedtRuns,
  saveAedtAnswers,
  type AedtAnswerInput,
} from "../repository/aedtBiasAudit.repository";

export const aedtQueryKeys = {
  all: ["aedt-bias-audit"] as const,
  project: (projectId: number) => [...aedtQueryKeys.all, "project", projectId] as const,
  questions: (projectId: number) => [...aedtQueryKeys.project(projectId), "questions"] as const,
  profile: (projectId: number) => [...aedtQueryKeys.project(projectId), "profile"] as const,
  runs: (projectId: number) => [...aedtQueryKeys.project(projectId), "runs"] as const,
  run: (runId: number) => [...aedtQueryKeys.all, "run", runId] as const,
};

const NO_RETRY = { retry: false } as const;

export function useAedtQuestions(projectId: number | null) {
  return useQuery({
    queryKey: aedtQueryKeys.questions(projectId ?? 0),
    queryFn: () => getAedtQuestions(projectId as number),
    enabled: projectId !== null,
    ...NO_RETRY,
  });
}

export function useAedtProfile(projectId: number | null) {
  return useQuery({
    queryKey: aedtQueryKeys.profile(projectId ?? 0),
    queryFn: () => getAedtProfile(projectId as number),
    enabled: projectId !== null,
    ...NO_RETRY,
  });
}

export function useAedtRuns(projectId: number | null) {
  return useQuery({
    queryKey: aedtQueryKeys.runs(projectId ?? 0),
    queryFn: () => listAedtRuns(projectId as number),
    enabled: projectId !== null,
    ...NO_RETRY,
  });
}

export function useAedtRun(runId: number | null) {
  return useQuery({
    queryKey: aedtQueryKeys.run(runId ?? 0),
    queryFn: () => getAedtRun(runId as number),
    enabled: runId !== null,
    ...NO_RETRY,
  });
}

/** Everything a project shows depends on its saved answers, so all of it is refetched. */
function useInvalidateProject(projectId: number) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: aedtQueryKeys.project(projectId) });
}

export function useSaveAedtAnswers(projectId: number) {
  const invalidate = useInvalidateProject(projectId);
  return useMutation({
    mutationFn: (answers: AedtAnswerInput[]) => saveAedtAnswers(projectId, answers),
    onSettled: invalidate,
  });
}

export function useAttestAedtProfile(projectId: number) {
  const invalidate = useInvalidateProject(projectId);
  return useMutation({
    mutationFn: () => attestAedtProfile(projectId),
    onSettled: invalidate,
  });
}

export function useGenerateAedtScopeDetermination(projectId: number) {
  const invalidate = useInvalidateProject(projectId);
  return useMutation({
    mutationFn: () => generateAedtScopeDetermination(projectId),
    onSuccess: invalidate,
  });
}

export function useCreateAedtRun(projectId: number) {
  const invalidate = useInvalidateProject(projectId);
  return useMutation({
    mutationFn: (args: { file: File; mapping: Record<string, string> }) =>
      createAedtRun(projectId, args.file, args.mapping),
    onSuccess: invalidate,
  });
}

export function useConfirmAedtDerivedBasis(runId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => confirmAedtDerivedBasis(runId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: aedtQueryKeys.run(runId) }),
  });
}

export function useGenerateAedtRunStance(runId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => generateAedtRunStance(runId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aedtQueryKeys.run(runId) }),
  });
}
