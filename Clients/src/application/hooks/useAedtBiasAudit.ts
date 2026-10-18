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
  describeAedtError,
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

/**
 * The question set changes only with a deploy, so it is kept for ten
 * minutes rather than refetched on every mount; a finite time lets a new set
 * reach a page left open across a deploy.
 */
const QUESTIONS_STALE_MS = 10 * 60 * 1000;

export function useAedtQuestions(projectId: number | null) {
  return useQuery({
    queryKey: aedtQueryKeys.questions(projectId ?? 0),
    queryFn: () => getAedtQuestions(projectId as number),
    enabled: projectId !== null,
    staleTime: QUESTIONS_STALE_MS,
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

/**
 * Saving or attesting changes only the profile view (answers, readiness and
 * the attested decision that gates runs). The run list and the question set
 * stay as they were.
 */
function useInvalidateProfile(projectId: number) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: aedtQueryKeys.profile(projectId) });
}

export function useSaveAedtAnswers(projectId: number) {
  const invalidate = useInvalidateProfile(projectId);
  return useMutation({
    mutationFn: (answers: AedtAnswerInput[]) => saveAedtAnswers(projectId, answers),
    onSettled: invalidate,
  });
}

export function useAttestAedtProfile(projectId: number) {
  const invalidate = useInvalidateProfile(projectId);
  return useMutation({
    mutationFn: () => attestAedtProfile(projectId),
    onSettled: invalidate,
  });
}

/** A scope determination is listed in the profile view and changes nothing else. */
export function useGenerateAedtScopeDetermination(projectId: number) {
  const invalidate = useInvalidateProfile(projectId);
  return useMutation({
    mutationFn: () => generateAedtScopeDetermination(projectId),
    onSuccess: invalidate,
  });
}

/**
 * Run refusals caused by the attested profile's state, after which the page
 * refetches it. POST /runs answers 404 when nothing is attested and 409 when
 * the attested profile places the tool out of scope or leaves the cutoff
 * open (runService.createRun). Its 400s (no file, unreadable CSV, unknown
 * mapping key), 413, 415, a network failure or a 5xx say nothing about the
 * profile and refetch nothing.
 */
const STALE_PROFILE_STATUSES = new Set([404, 409]);

/**
 * A new run changes only the run list; the profile and questions stay as they
 * were. The refetch is not awaited, so the caller opens the new run at once.
 * A refusal that may mean the attested decision the page gated on is stale
 * (see STALE_PROFILE_STATUSES) refetches the profile view.
 */
export function useCreateAedtRun(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { file: File; mapping: Record<string, string> }) =>
      createAedtRun(projectId, args.file, args.mapping),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: aedtQueryKeys.runs(projectId) });
    },
    onError: (error) => {
      const { status } = describeAedtError(error);
      if (status !== null && STALE_PROFILE_STATUSES.has(status)) {
        void queryClient.invalidateQueries({ queryKey: aedtQueryKeys.profile(projectId) });
      }
    },
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
