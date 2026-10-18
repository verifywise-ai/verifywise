/**
 * Corpora: start, list, view, download and resume generation, and the fixed
 * job descriptions a corpus is built from.
 *
 * Every read and write goes through utils/biasAudit.utils, filtered on the
 * caller's organization. A corpus-scoped call loads the corpus by id and
 * organization, then applies the project-member rule with the corpus's own
 * not-found, so a corpus in another organization and one in a project the
 * caller is not a member of get the same answer.
 *
 * A worker that dies leaves its corpus running. Before each create, list,
 * view and resume, the caller's organization is swept for corpora with no
 * heartbeat for STALE_AFTER_SECONDS, which fails them and frees the
 * one-running-per-project index.
 */
import { createHash } from "node:crypto";
import {
  ConflictException,
  NotFoundException,
} from "../../domain.layer/exceptions/custom.exception";
import {
  JOB_DESCRIPTIONS,
  JOB_DESCRIPTION_KEYS,
  type JobDescriptionKey,
} from "../../structures/NYC-Local-Law-144/job-descriptions";
import {
  countValidCorpusRecordsQuery,
  getAttestedProfileQuery,
  getCorpusQuery,
  getProfileAnswersQuery,
  listCorporaQuery,
  listLatestValidRecordsPageQuery,
  markStaleCorporaFailedQuery,
  resumeCorpusQuery,
  updateCorpusStatusQuery,
  type CorpusRow,
  type CorpusSummaryRow,
} from "../../utils/biasAudit.utils";
import type { AnswerMap } from "./applicability";
import { compareCriteria } from "./criteriaComparison";
import { DEFAULT_COUNT, MAX_COUNT, MIN_COUNT } from "./generation/allocation";
import { corpusCsvHeaderLine, corpusCsvRow } from "./generation/corpusCsv";
import { createCorpus, STALE_AFTER_SECONDS, type Knockout } from "./generation/generateCorpus";
import { enqueueCorpusGeneration } from "./generation/generationJob";
import { ARTIFACT_KINDS, type ArtifactKind } from "./generation/prompt";
import { isGatewayConfigured } from "./generation/settings";
import { decideProfile } from "./profileDecision";
import { assertProjectAccess, type Viewer } from "./projectAccess";
import { answerMapFromRows, assertProject, isUniqueViolation } from "./serviceHelpers";

/** The record counts a generation may ask for. */
export const CORPUS_COUNT = { default: DEFAULT_COUNT, min: MIN_COUNT, max: MAX_COUNT } as const;

const PAGE_SIZE = 500;

export const corpusNotFound = (corpusId: number) => () =>
  new NotFoundException(`Corpus ${corpusId} was not found`, "Corpus", corpusId);

const alreadyRunning = (corpusId: number) =>
  new ConflictException(
    `Corpus ${corpusId} is already running, or another corpus is running for this project.`,
    "Corpus",
  );

interface ProjectScope extends Viewer {
  projectId: number;
  frameworkId: number;
  organizationId: number;
}

export interface StartCorpusInput extends ProjectScope {
  jobDescriptionKey: JobDescriptionKey;
  criteriaSupplied: string | null;
  count: number;
}

const sweep = (organizationId: number) =>
  markStaleCorporaFailedQuery(organizationId, STALE_AFTER_SECONDS);

/**
 * The page polls the list every few seconds while a corpus runs, so the list
 * sweeps an organization at most this often. Create, view and resume always
 * sweep.
 */
export const LIST_SWEEP_INTERVAL_MS = 60_000;
const lastListSweep = new Map<number, number>();

async function sweepForList(organizationId: number): Promise<void> {
  const now = Date.now();
  const last = lastListSweep.get(organizationId);
  if (last !== undefined && now - last < LIST_SWEEP_INTERVAL_MS) return;
  lastListSweep.set(organizationId, now);
  await sweep(organizationId);
}

/** The form generated records take, from pipeline.input_form. */
function artifactKindOf(answers: AnswerMap): ArtifactKind {
  const value = answers["pipeline.input_form"]?.value;
  if (typeof value === "string" && (ARTIFACT_KINDS as readonly string[]).includes(value)) {
    return value as ArtifactKind;
  }
  throw new ConflictException(
    "The attested profile does not record what the tool takes as input " +
      "(pipeline.input_form), so there is no form to generate.",
    "AedtProfile",
    "pipeline.input_form",
  );
}

/** knockout.exists as the corpus records it; a don't-know or no answer is "dont_know". */
function knockoutOf(answers: AnswerMap): Knockout {
  const value = answers["knockout.exists"]?.value;
  return value === "yes" || value === "no" ? value : "dont_know";
}

/**
 * Plans and inserts a corpus from the project's attested profile, then queues
 * its generation. Refused with 409, before anything is created, when the
 * attested answers withhold generation.
 */
export async function startCorpusGeneration(
  input: StartCorpusInput,
): Promise<{ corpusId: number }> {
  const { projectId, frameworkId, organizationId, userId } = input;
  await assertProject(projectId, organizationId, input);

  const profile = await getAttestedProfileQuery(projectId, frameworkId, organizationId);
  if (!profile) {
    throw new NotFoundException(
      "There is no attested profile for this project, so a corpus cannot be generated for it. " +
        "Attest the profile first.",
      "AedtProfile",
    );
  }
  const answers = answerMapFromRows(
    await getProfileAnswersQuery(profile.id!, organizationId),
    "without_notes",
  );
  // The same reading the profile view reports as the attested decision.
  const decision = decideProfile(answers);
  if (!decision.mayGenerate) {
    throw new ConflictException(
      `The attested profile withholds corpus generation: ${decision.generationBlocked.join("; ")}.`,
      "AedtProfile",
    );
  }

  const criteriaComparison = compareCriteria(input.jobDescriptionKey, input.criteriaSupplied);
  const artifactKind = artifactKindOf(answers);
  await sweep(organizationId);
  const { corpusId } = await createCorpus({
    projectId,
    profileId: profile.id!,
    profileVersion: profile.version!,
    organizationId,
    userId,
    jobDescriptionKey: input.jobDescriptionKey,
    artifactKind,
    knockout: knockoutOf(answers),
    criteriaSupplied: input.criteriaSupplied,
    criteriaComparison,
    count: input.count,
  });
  try {
    await enqueueCorpusGeneration(corpusId, organizationId);
  } catch (e) {
    // Nothing will run it: fail it now rather than hold the project until the sweep.
    await updateCorpusStatusQuery(
      { corpusId, status: "failed", failureCode: "enqueue_failed" },
      organizationId,
    ).catch(() => false);
    throw e;
  }
  return { corpusId };
}

export async function listCorpora(scope: ProjectScope): Promise<{ corpora: CorpusSummaryRow[] }> {
  const { projectId, organizationId, userId, role } = scope;
  await assertProject(projectId, organizationId, { userId, role });
  await sweepForList(organizationId);
  return { corpora: await listCorporaQuery(projectId, organizationId) };
}

/** The corpus, once the viewer passes the project-member rule; otherwise its not-found. */
async function loadCorpus(
  corpusId: number,
  organizationId: number,
  viewer: Viewer,
): Promise<CorpusRow> {
  const corpus = await getCorpusQuery(corpusId, organizationId);
  if (!corpus) throw corpusNotFound(corpusId)();
  await assertProjectAccess(corpus.project_id, organizationId, viewer, corpusNotFound(corpusId));
  return corpus;
}

export interface CorpusView {
  id: number;
  project_id: number;
  profile_id: number;
  profile_version: number;
  job_description_key: string;
  artifact_kind: string;
  knockout: string;
  requested_count: number;
  planned_count: number;
  record_count: number | null;
  valid_record_count: number;
  model_pinned: string;
  name_method: string;
  criteria_supplied: string | null;
  criteria_comparison_json: unknown;
  models_observed_json: Record<string, number> | null;
  cell_sizes_json: Record<string, number> | null;
  id_order_check_json: unknown;
  release_findings_json: unknown;
  manifest_sha256: string | null;
  corpus_sha256: string | null;
  status: CorpusRow["status"];
  failure_code: string | null;
  heartbeat_at: Date;
  generated_by: number | null;
  generated_at: Date;
  completed_at: Date | null;
  may_download: boolean;
}

/** A corpus and its progress. Never the manifest, the lease token or record text. */
export async function getCorpusView(
  corpusId: number,
  organizationId: number,
  viewer: Viewer,
): Promise<CorpusView> {
  await sweep(organizationId);
  const c = await loadCorpus(corpusId, organizationId, viewer);
  return {
    id: c.id,
    project_id: c.project_id,
    profile_id: c.profile_id,
    profile_version: c.profile_version,
    job_description_key: c.job_description_key,
    artifact_kind: c.artifact_kind,
    knockout: c.knockout,
    requested_count: c.requested_count,
    planned_count: c.planned_count,
    record_count: c.record_count,
    valid_record_count: await countValidCorpusRecordsQuery(corpusId, organizationId),
    model_pinned: c.model_pinned,
    name_method: c.name_method,
    criteria_supplied: c.criteria_supplied,
    criteria_comparison_json: c.criteria_comparison_json,
    models_observed_json: c.models_observed_json,
    cell_sizes_json: c.cell_sizes_json,
    id_order_check_json: c.id_order_check_json,
    release_findings_json: c.release_findings_json,
    manifest_sha256: c.manifest_sha256,
    corpus_sha256: c.corpus_sha256,
    status: c.status,
    failure_code: c.failure_code,
    heartbeat_at: c.heartbeat_at,
    generated_by: c.generated_by,
    generated_at: c.generated_at,
    completed_at: c.completed_at,
    may_download: c.status === "complete",
  };
}

/**
 * Streams a complete corpus as CSV: candidate_id, artifact_kind, artifact,
 * with no demographic or tier column. Pages of PAGE_SIZE records go to
 * `write` as they are read; the corpus is never held whole. The bytes are
 * hashed as they go, and a mismatch with the stored corpus_sha256 throws
 * after the last page, so the caller can abort the response rather than
 * finish a file that differs from the one the corpus records.
 */
export async function streamCorpusDownload(
  corpusId: number,
  organizationId: number,
  viewer: Viewer,
  write: (chunk: string) => void | Promise<void>,
): Promise<void> {
  const corpus = await loadCorpus(corpusId, organizationId, viewer);
  if (corpus.status !== "complete") {
    throw new ConflictException(
      `Corpus ${corpusId} is ${corpus.status}; only a complete corpus can be downloaded.`,
      "Corpus",
    );
  }
  const kind = corpus.artifact_kind as ArtifactKind;
  const hash = createHash("sha256");
  const emit = async (chunk: string) => {
    hash.update(chunk, "utf8");
    await write(chunk);
  };

  await emit(corpusCsvHeaderLine());
  let after = "";
  for (;;) {
    const page = await listLatestValidRecordsPageQuery(corpusId, organizationId, after, PAGE_SIZE);
    if (page.length > 0) {
      await emit(
        page
          .map((r) =>
            corpusCsvRow({ candidateId: r.candidate_id, artifactKind: kind, text: r.text }),
          )
          .join(""),
      );
    }
    if (page.length < PAGE_SIZE) break;
    after = page[page.length - 1].candidate_id;
  }
  if (hash.digest("hex") !== corpus.corpus_sha256) {
    throw new Error(`The downloadable records of corpus ${corpusId} do not match its stored hash.`);
  }
}

/**
 * Sets a failed corpus, or a running one whose runner died, running again and
 * queues it; generation resumes from the record log. A finished corpus, or one
 * a runner is working on, is refused with 409.
 */
export async function resumeCorpus(
  corpusId: number,
  organizationId: number,
  viewer: Viewer,
): Promise<{ corpusId: number; status: "running" }> {
  await sweep(organizationId);
  const corpus = await loadCorpus(corpusId, organizationId, viewer);
  if (corpus.status === "complete" || corpus.status === "blocked") {
    throw new ConflictException(
      `Corpus ${corpusId} is ${corpus.status} and cannot be resumed. Start a new corpus instead.`,
      "Corpus",
    );
  }
  if (corpus.status === "running" && corpus.lease_live) throw alreadyRunning(corpusId);

  let moved: boolean;
  try {
    moved = await resumeCorpusQuery(corpusId, organizationId, STALE_AFTER_SECONDS);
  } catch (e) {
    if (isUniqueViolation(e)) throw alreadyRunning(corpusId);
    throw e;
  }
  // A running corpus whose heartbeat is recent is between retries; its job will continue.
  if (!moved) throw alreadyRunning(corpusId);
  await enqueueCorpusGeneration(corpusId, organizationId);
  return { corpusId, status: "running" };
}

export interface JobDescriptionView {
  key: JobDescriptionKey;
  roleTitle: string;
  body: string;
  expectedCriteria: Array<{ key: string; label: string; description: string }>;
}

/**
 * The two fixed job descriptions as the customer sees them. The tier
 * narratives are prompt material and stay on the server.
 */
export function getJobDescriptionsView(): {
  jobDescriptions: JobDescriptionView[];
  generationAvailable: boolean;
  count: typeof CORPUS_COUNT;
} {
  return {
    jobDescriptions: JOB_DESCRIPTION_KEYS.map((key) => {
      const jd = JOB_DESCRIPTIONS[key];
      return {
        key: jd.key,
        roleTitle: jd.roleTitle,
        body: jd.body,
        expectedCriteria: jd.expectedCriteria.map((c) => ({
          key: c.key,
          label: c.label,
          description: c.description,
        })),
      };
    }),
    generationAvailable: isGatewayConfigured(),
    count: CORPUS_COUNT,
  };
}
