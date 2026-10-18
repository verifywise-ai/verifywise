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
  compareAedtCriteria,
  confirmAedtDerivedBasis,
  createAedtCorpus,
  createAedtRun,
  describeAedtError,
  generateAedtRunStance,
  generateAedtScopeDetermination,
  getAedtJobDescriptions,
  getAedtProfile,
  getAedtQuestions,
  getAedtRun,
  getAedtRunTrend,
  listAedtCorpora,
  listAedtRuns,
  resumeAedtCorpus,
  saveAedtAnswers,
  type AedtAnswerInput,
  type AedtCorpus,
} from "../repository/aedtBiasAudit.repository";

export const aedtQueryKeys = {
  all: ["aedt-bias-audit"] as const,
  project: (projectId: number) => [...aedtQueryKeys.all, "project", projectId] as const,
  questions: (projectId: number) => [...aedtQueryKeys.project(projectId), "questions"] as const,
  profile: (projectId: number) => [...aedtQueryKeys.project(projectId), "profile"] as const,
  runs: (projectId: number) => [...aedtQueryKeys.project(projectId), "runs"] as const,
  /** Under `runs`, so a new run, which invalidates the run list, refreshes the trend too. */
  trend: (projectId: number) => [...aedtQueryKeys.runs(projectId), "trend"] as const,
  run: (runId: number) => [...aedtQueryKeys.all, "run", runId] as const,
  corpora: (projectId: number) => [...aedtQueryKeys.project(projectId), "corpora"] as const,
  jobDescriptions: () => [...aedtQueryKeys.all, "job-descriptions"] as const,
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

export function useAedtRunTrend(projectId: number | null) {
  return useQuery({
    queryKey: aedtQueryKeys.trend(projectId ?? 0),
    queryFn: () => getAedtRunTrend(projectId as number),
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
 * POST /runs refusals that can reflect the attested profile: 404 nothing
 * attested, 409 out of scope or cutoff open, and 400, whose mapping check
 * uses the attested metric. Others (401, 403, 413, 415, 429, network, 5xx)
 * say nothing about it.
 */
const PROFILE_REFUSALS = new Set([400, 404, 409]);

/**
 * A new run changes only the run list; the profile and questions stay as they
 * were. The refetch is not awaited, so the caller opens the new run at once.
 * A refusal in PROFILE_REFUSALS refetches the profile view.
 */
export function useCreateAedtRun(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      file: File;
      mapping: Record<string, string>;
      jobDescription: string;
      corpusId?: number | null;
    }) =>
      createAedtRun(projectId, args.file, args.mapping, args.jobDescription, args.corpusId ?? null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: aedtQueryKeys.runs(projectId) });
    },
    onError: (error) => {
      const { status } = describeAedtError(error);
      if (status !== null && PROFILE_REFUSALS.has(status)) {
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

/** The fixed job descriptions change only with a deploy, like the question set. */
export function useAedtJobDescriptions() {
  return useQuery({
    queryKey: aedtQueryKeys.jobDescriptions(),
    queryFn: getAedtJobDescriptions,
    staleTime: QUESTIONS_STALE_MS,
    ...NO_RETRY,
  });
}

/** How often the corpus list is refetched while a corpus is still generating. */
export const CORPUS_POLL_MS = 5000;

export function useAedtCorpora(projectId: number | null) {
  return useQuery({
    queryKey: aedtQueryKeys.corpora(projectId ?? 0),
    queryFn: () => listAedtCorpora(projectId as number),
    enabled: projectId !== null,
    refetchInterval: (query) =>
      (query.state.data as AedtCorpus[] | undefined)?.some((c) => c.status === "running")
        ? CORPUS_POLL_MS
        : false,
    ...NO_RETRY,
  });
}

/** A preview; it changes nothing on the server, so nothing is invalidated. */
export function useCompareAedtCriteria() {
  return useMutation({
    mutationFn: (args: { jobDescriptionKey: string; criteriaSupplied: string | null }) =>
      compareAedtCriteria(args.jobDescriptionKey, args.criteriaSupplied),
  });
}

/**
 * A new corpus changes the corpus list. A 409 can mean the attested profile
 * now blocks generation, so it refetches the profile view too.
 */
export function useCreateAedtCorpus(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      jobDescriptionKey: string;
      criteriaSupplied: string | null;
      count: number;
    }) => createAedtCorpus(projectId, args),
    onSettled: (_data, error) => {
      void queryClient.invalidateQueries({ queryKey: aedtQueryKeys.corpora(projectId) });
      if (error && describeAedtError(error).status === 409) {
        void queryClient.invalidateQueries({ queryKey: aedtQueryKeys.profile(projectId) });
      }
    },
  });
}

export function useResumeAedtCorpus(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (corpusId: number) => resumeAedtCorpus(corpusId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: aedtQueryKeys.corpora(projectId) }),
  });
}
