import { createHash, randomInt } from "node:crypto";
import {
  JOB_DESCRIPTIONS,
  type JobDescription,
  type JobDescriptionKey,
} from "../../../structures/NYC-Local-Law-144/job-descriptions";
import {
  ConflictException,
  NotFoundException,
  ValidationException,
} from "../../../domain.layer/exceptions/custom.exception";
import {
  appendCorpusRecordQuery,
  createCorpusQuery,
  getCorpusQuery,
  listCorpusLogQuery,
  listLatestValidRecordsPageQuery,
  touchCorpusHeartbeatQuery,
  updateCorpusStatusQuery,
  type CorpusLogRow,
} from "../../../utils/biasAudit.utils";
import { isUniqueViolation } from "../serviceHelpers";
import { LL144_CONFIG } from "../runService";
import { buildAllocation } from "./allocation";
import {
  assignCandidateIds,
  MAX_SEED_ATTEMPTS,
  verifyIdOrder,
  type OrderAttribute,
} from "./assignCandidateIds";
import { corpusCsvHeaderLine, corpusCsvRow } from "./corpusCsv";
import { complete } from "./gatewayClient";
import { buildManifest, latestAttempts, type GenerationLogEntry } from "./manifest";
import { NAME_METHOD, nameFor } from "./names";
import { ARTIFACT_KINDS, buildPrompt, validateRecord, type ArtifactKind } from "./prompt";
import { getGatewaySettings } from "./settings";

export type Knockout = "yes" | "no" | "dont_know";

export interface CreateCorpusArgs {
  projectId: number;
  profileId: number;
  profileVersion: number;
  organizationId: number;
  userId: number;
  jobDescriptionKey: JobDescriptionKey;
  /** From pipeline.input_form. */
  artifactKind: ArtifactKind;
  /** From knockout.exists; recorded, does not change generation in v1. */
  knockout: Knockout;
  criteriaSupplied: string | null;
  /** Task 6's CriteriaComparison, stored as JSON. */
  criteriaComparison: unknown;
  count: number;
}

const KNOCKOUTS: readonly Knockout[] = ["yes", "no", "dont_know"];
const ORDER_ATTRIBUTES: OrderAttribute[] = ["sex", "raceEthnicity", "tierKey"];
/** Attempts per record, across every pass, before it is left out. */
const MAX_ATTEMPTS = 3;
const HEARTBEAT_EVERY = 25;
const PAGE_SIZE = 500;
const GATEWAY_RETRIES = 3;
// The gate may redraw up to seed + MAX_SEED_ATTEMPTS - 1, and the stored seed
// is an INTEGER column, so the draw stays that far under 2^31 - 1.
const SEED_LIMIT = 2 ** 31 - MAX_SEED_ATTEMPTS;

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** The hash of the fixed text a corpus is built from: body, criteria and tiers. */
export function jobDescriptionSha256(jd: JobDescription): string {
  return sha256(
    JSON.stringify({
      key: jd.key,
      roleTitle: jd.roleTitle,
      body: jd.body,
      expectedCriteria: jd.expectedCriteria,
      tiers: jd.tiers,
    }),
  );
}

function jobDescriptionFor(key: string): JobDescription {
  const jd = (JOB_DESCRIPTIONS as Record<string, JobDescription | undefined>)[key];
  if (!jd) throw new ValidationException(`Unknown job description "${key}".`, "jobDescriptionKey");
  return jd;
}

function assertArtifactKind(kind: string): asserts kind is ArtifactKind {
  if (!ARTIFACT_KINDS.includes(kind as ArtifactKind)) {
    throw new ValidationException(`Unknown artifact form "${kind}".`, "artifactKind");
  }
}

/**
 * The plan: balanced allocation, then IDs by seeded permutation, then the
 * ID-order gate. Deterministic in (job description, count, seed), so a resume
 * re-derives exactly the plan the corpus began with; it is never stored.
 */
function planFor(jd: JobDescription, count: number, seed: number) {
  const exclusion = LL144_CONFIG.smallSampleExclusion;
  if (exclusion === null)
    throw new Error("The LL 144 configuration has no small-sample exclusion.");
  const allocation = buildAllocation({
    count,
    tiers: jd.tiers.map((t) => t.key),
    smallSampleExclusion: exclusion,
  });
  const { assigned, seedUsed } = assignCandidateIds({ rows: allocation.rows, seed });
  // assignCandidateIds already gates internally; this is the gate on the plan
  // as the caller sees it, before anything is inserted or spent.
  const checks = verifyIdOrder(assigned, ORDER_ATTRIBUTES);
  return { assigned, seedUsed, checks, plannedCount: allocation.count };
}

/**
 * Plans a corpus and inserts it as running. Refuses before anything else when
 * the gateway is not configured, and gates ID order on the plan before the
 * insert, since the gate is cheap and generation is not.
 */
export async function createCorpus(args: CreateCorpusArgs): Promise<{ corpusId: number }> {
  const settings = getGatewaySettings();
  const jd = jobDescriptionFor(args.jobDescriptionKey);
  assertArtifactKind(args.artifactKind);
  if (!KNOCKOUTS.includes(args.knockout)) {
    throw new ValidationException(`Unknown knockout answer "${args.knockout}".`, "knockout");
  }

  const plan = planFor(jd, args.count, randomInt(1, SEED_LIMIT));
  try {
    const row = await createCorpusQuery(
      {
        projectId: args.projectId,
        profileId: args.profileId,
        profileVersion: args.profileVersion,
        jobDescriptionKey: jd.key,
        jobDescriptionSha256: jobDescriptionSha256(jd),
        artifactKind: args.artifactKind,
        knockout: args.knockout,
        requestedCount: args.count,
        plannedCount: plan.plannedCount,
        seed: plan.seedUsed,
        modelPinned: settings.model,
        nameMethod: NAME_METHOD,
        criteriaSupplied: args.criteriaSupplied,
        criteriaComparison: args.criteriaComparison,
        idOrderCheck: plan.checks,
        generatedBy: args.userId,
      },
      args.organizationId,
    );
    return { corpusId: row.id };
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new ConflictException(
        "A corpus is already running for this project. Wait for it to finish before starting another.",
        "Corpus",
      );
    }
    throw e;
  }
}

const toEntry = (r: CorpusLogRow): GenerationLogEntry => ({
  candidateId: r.candidate_id,
  attempt: Number(r.attempt),
  validationStatus: r.validation_status,
  modelName: r.model_name,
  promptHash: r.prompt_hash,
});

const notRunning = (corpusId: number) =>
  new ConflictException(`Corpus ${corpusId} is no longer running; generation stopped.`, "Corpus");

/**
 * Generates every record still missing, appending each attempt to the log,
 * then completes the corpus from the whole log. Gateway errors are not
 * caught: the job fails, BullMQ retries it, and the retry resumes from the
 * log with the same plan, names and prompts.
 */
export async function runCorpusGeneration(args: {
  corpusId: number;
  organizationId: number;
}): Promise<{ status: "complete"; recordCount: number; modelsObserved: Record<string, number> }> {
  const { corpusId, organizationId } = args;
  const corpus = await getCorpusQuery(corpusId, organizationId);
  if (!corpus) throw new NotFoundException(`Corpus ${corpusId} was not found`, "Corpus", corpusId);
  if (corpus.status === "complete") {
    // A retry after the completion write: nothing left to do.
    return {
      status: "complete",
      recordCount: corpus.record_count ?? 0,
      modelsObserved: corpus.models_observed_json ?? {},
    };
  }
  if (corpus.status !== "running") {
    throw new ConflictException(`Corpus ${corpusId} is not running (${corpus.status}).`, "Corpus");
  }

  const jd = jobDescriptionFor(corpus.job_description_key);
  if (jobDescriptionSha256(jd) !== corpus.job_description_sha256) {
    throw new ConflictException(
      `The job description text changed after corpus ${corpusId} began, so it cannot be resumed.`,
      "Corpus",
    );
  }
  const kind = corpus.artifact_kind;
  assertArtifactKind(kind);
  const settings = getGatewaySettings();
  const { assigned, seedUsed } = planFor(jd, corpus.planned_count, corpus.seed);
  if (seedUsed !== corpus.seed) {
    throw new Error(`The stored seed no longer reproduces the plan of corpus ${corpusId}.`);
  }

  const heartbeat = async () => {
    if (!(await touchCorpusHeartbeatQuery(corpusId, organizationId))) throw notRunning(corpusId);
  };
  await heartbeat();

  const latest = latestAttempts((await listCorpusLogQuery(corpusId, organizationId)).map(toEntry));
  let sinceHeartbeat = 0;
  for (const a of assigned) {
    const seen = latest.get(a.candidateId);
    if (seen?.validationStatus === "valid") continue;
    const prompt = buildPrompt({
      jobDescription: jd,
      tierKey: a.tierKey,
      artifactKind: kind,
      candidateName: nameFor(a.demographics, a.candidateId, corpus.seed),
    });
    for (let attempt = (seen?.attempt ?? 0) + 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const res = await complete(settings, prompt, { retries: GATEWAY_RETRIES });
      const check = validateRecord(res.text, kind, { finishReason: res.finishReason });
      await appendCorpusRecordQuery(
        {
          corpusId,
          candidateId: a.candidateId,
          attempt,
          text: res.text,
          modelName: res.modelObserved,
          promptHash: res.promptHash,
          validationStatus: check.ok ? "valid" : "invalid",
          invalidReason: check.ok ? null : check.reason,
        },
        organizationId,
      );
      if (++sinceHeartbeat >= HEARTBEAT_EVERY) {
        sinceHeartbeat = 0;
        await heartbeat();
      }
      if (check.ok) break;
    }
  }

  // The manifest comes from the whole log, re-read, never from this pass.
  const log = (await listCorpusLogQuery(corpusId, organizationId)).map(toEntry);
  const manifest = buildManifest({ assigned, log });
  if (manifest.unknownCandidateIds.length > 0) {
    throw new Error(
      `The log of corpus ${corpusId} names candidates outside its plan: ` +
        manifest.unknownCandidateIds.slice(0, 5).join(", "),
    );
  }
  const finalLatest = latestAttempts(log);
  const unfinished = assigned.filter((a) => {
    const e = finalLatest.get(a.candidateId);
    return !e || (e.validationStatus !== "valid" && e.attempt < MAX_ATTEMPTS);
  });
  if (unfinished.length > 0) {
    throw new Error(`Corpus ${corpusId} still has ${unfinished.length} records to generate.`);
  }

  const modelsObserved: Record<string, number> = {};
  for (const r of manifest.rows)
    modelsObserved[r.modelName] = (modelsObserved[r.modelName] ?? 0) + 1;

  const corpusSha256 = await hashDownload(corpusId, organizationId, kind, manifest.rows);
  const manifestSha256 = sha256(JSON.stringify(manifest.rows));

  const moved = await updateCorpusStatusQuery(
    {
      corpusId,
      status: "complete",
      recordCount: manifest.rows.length,
      modelsObserved,
      cellSizes: manifest.cellSizes,
      manifest: manifest.rows,
      manifestSha256,
      corpusSha256,
    },
    organizationId,
  );
  if (!moved) throw notRunning(corpusId);
  return { status: "complete", recordCount: manifest.rows.length, modelsObserved };
}

/**
 * sha256 over exactly the bytes the download serves (header line, then each
 * latest valid record in candidate-ID order, UTF-8, no BOM), so a customer's
 * hash of the file matches. The served IDs must be the manifest's, in order.
 */
async function hashDownload(
  corpusId: number,
  organizationId: number,
  kind: ArtifactKind,
  manifestRows: Array<{ candidateId: string }>,
): Promise<string> {
  const hash = createHash("sha256").update(corpusCsvHeaderLine(), "utf8");
  const served: string[] = [];
  let after = "";
  for (;;) {
    const page = await listLatestValidRecordsPageQuery(corpusId, organizationId, after, PAGE_SIZE);
    for (const r of page) {
      hash.update(
        corpusCsvRow({ candidateId: r.candidate_id, artifactKind: kind, text: r.text }),
        "utf8",
      );
      served.push(r.candidate_id);
    }
    if (page.length < PAGE_SIZE) break;
    after = page[page.length - 1].candidate_id;
  }
  const expected = manifestRows.map((r) => r.candidateId);
  if (served.length !== expected.length || served.some((id, i) => id !== expected[i])) {
    throw new Error(
      `The downloadable records of corpus ${corpusId} do not match its manifest ` +
        `(${served.length} served, ${expected.length} in the manifest).`,
    );
  }
  return hash.digest("hex");
}
