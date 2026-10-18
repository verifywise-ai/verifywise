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
  type AedtProfileView,
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

/** A saved or attested profile version, and whether the page now shows it. */
export interface AedtProfileWrite {
  profileId: number;
  version: number;
  /**
   * True once the profile view has been refetched and shows this version
   * (attested, after an attest). False when the refetch failed or returned
   * something else: the page then keeps what is on screen rather than
   * restarting the wizard from answers that predate the write.
   */
  reloaded: boolean;
}

/**
 * Refetches the profile view after a write, inside the mutation, and reports
 * whether it now shows the written version. A failed refetch does not throw;
 * it leaves the query in error with its old data.
 */
function useReloadProfile(projectId: number) {
  const queryClient = useQueryClient();
  return async (
    ref: { profileId: number; version: number },
    expectAttested: boolean,
  ): Promise<AedtProfileWrite> => {
    const queryKey = aedtQueryKeys.profile(projectId);
    await queryClient.invalidateQueries({ queryKey });
    const state = queryClient.getQueryState<AedtProfileView>(queryKey);
    const shown = state?.data?.profile;
    const reloaded =
      state?.status === "success" &&
      shown?.id === ref.profileId &&
      shown.version === ref.version &&
      (!expectAttested || shown.status === "attested");
    return { ...ref, reloaded };
  };
}

export function useSaveAedtAnswers(projectId: number) {
  const reload = useReloadProfile(projectId);
  const invalidate = useInvalidateProfile(projectId);
  return useMutation({
    mutationFn: async (answers: AedtAnswerInput[]) =>
      reload(await saveAedtAnswers(projectId, answers), false),
    // A refusal (409: another save created the version first) may also mean
    // the view is out of date.
    onError: invalidate,
  });
}

export function useAttestAedtProfile(projectId: number) {
  const reload = useReloadProfile(projectId);
  const invalidate = useInvalidateProfile(projectId);
  return useMutation({
    mutationFn: async () => reload(await attestAedtProfile(projectId), true),
    onError: invalidate,
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
 * A new run changes only the run list; the profile and questions stay as they
 * were. The refetch is not awaited, so the caller opens the new run at once.
 * Any 4xx refusal except 413 and 415 (the file itself) may come from the
 * attested profile: 404 nothing attested, 409 out of scope or cutoff open,
 * and a 400 mapping refusal is checked against the attested metric. So all
 * of them refetch the profile view; a network failure or a 5xx does not.
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
      if (status !== null && status >= 400 && status < 500 && status !== 413 && status !== 415) {
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
