import { cellKey } from "./allocation";

export interface AssignedRow {
  candidateId: string;
  demographics: { sex: string; raceEthnicity: string };
  tierKey: string;
}

export interface GenerationLogEntry {
  candidateId: string;
  attempt: number;
  validationStatus: "valid" | "invalid";
  modelName: string;
  promptHash: string;
}

export interface ManifestRow {
  candidateId: string;
  sex: string;
  raceEthnicity: string;
  tierKey: string;
  modelName: string;
  promptHash: string;
}

export interface Manifest {
  /** Valid candidates only, in candidate-ID order. */
  rows: ManifestRow[];
  /** "sex:Male", "raceEthnicity:Asian", over the valid rows. */
  counts: Record<string, number>;
  /** Keyed by cellKey(): "Male|Asian", over the valid rows. */
  cellSizes: Record<string, number>;
  /** Log entries whose candidate is not in the plan, sorted. */
  unknownCandidateIds: string[];
}

/** Each candidate's highest attempt in the log. */
export function latestAttempts(log: GenerationLogEntry[]): Map<string, GenerationLogEntry> {
  const latest = new Map<string, GenerationLogEntry>();
  for (const e of log) {
    const seen = latest.get(e.candidateId);
    if (!seen || e.attempt > seen.attempt) latest.set(e.candidateId, e);
  }
  return latest;
}

/**
 * Joins the deterministic plan to the generation log. A candidate is in the
 * manifest when its highest attempt is valid.
 *
 * The caller passes the WHOLE log, every attempt from every pass. A resumed
 * run that wrote the manifest from the records of its own pass alone left a
 * 30-row manifest beside 340 artifacts on a real engagement: analysing
 * against it would have computed the verdict on 30 candidates and reported
 * it as 340.
 */
export function buildManifest(args: {
  assigned: AssignedRow[];
  log: GenerationLogEntry[];
}): Manifest {
  const latest = latestAttempts(args.log);
  const planned = new Set(args.assigned.map((a) => a.candidateId));
  const unknownCandidateIds = [...latest.keys()].filter((id) => !planned.has(id)).sort();

  const rows: ManifestRow[] = [];
  const counts: Record<string, number> = {};
  const cellSizes: Record<string, number> = {};
  const bump = (m: Record<string, number>, k: string) => {
    m[k] = (m[k] ?? 0) + 1;
  };
  for (const a of args.assigned) {
    const e = latest.get(a.candidateId);
    if (!e || e.validationStatus !== "valid") continue;
    rows.push({
      candidateId: a.candidateId,
      sex: a.demographics.sex,
      raceEthnicity: a.demographics.raceEthnicity,
      tierKey: a.tierKey,
      modelName: e.modelName,
      promptHash: e.promptHash,
    });
    bump(counts, `sex:${a.demographics.sex}`);
    bump(counts, `raceEthnicity:${a.demographics.raceEthnicity}`);
    bump(cellSizes, cellKey(a.demographics));
  }
  // Code-unit order, the order the download pages in; IDs are fixed width.
  rows.sort((x, y) => (x.candidateId < y.candidateId ? -1 : x.candidateId > y.candidateId ? 1 : 0));
  return { rows, counts, cellSizes, unknownCandidateIds };
}
