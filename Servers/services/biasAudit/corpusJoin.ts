/**
 * Joins a customer's scored corpus to the corpus manifest.
 *
 * The scored file carries the candidate ID and a score or selection, and no
 * demographics, by design: the customer's platform scored material with no
 * group column. Sex and race/ethnicity come back from the manifest on the
 * candidate ID. An ID the manifest does not hold, a duplicate, a blank or a
 * manifest ID absent from the file is refused rather than dropped, since any
 * of them changes which candidates the rates describe.
 */
import type { AuditRecord } from "./engine";
import type { GateFinding } from "./dataGates";
import type { ManifestRow } from "./generation/manifest";

/** The scored file's column for the candidate ID, as the corpus download names it. */
export const CORPUS_ID_KEY = "candidate_id";
/** The least an upper qualification tier must exceed the tier below it by, on a 0–1 scale. */
export const TIER_SEPARATION_MIN = 0.02;

const NAMED_IDS = 5;

function stop(code: string, message: string, detail: Record<string, unknown>): GateFinding {
  return { code, severity: "stop", message, detail };
}

function idOf(record: AuditRecord): string {
  const raw = record[CORPUS_ID_KEY];
  return typeof raw === "string" ? raw.trim() : "";
}

function named(ids: string[]): string {
  const shown = ids.slice(0, NAMED_IDS).join(", ");
  return ids.length > NAMED_IDS ? `${shown} and ${ids.length - NAMED_IDS} more` : shown;
}

export function joinScoresToManifest(
  records: AuditRecord[],
  manifest: ManifestRow[],
): { ok: true; records: AuditRecord[] } | { ok: false; findings: GateFinding[] } {
  const byId = new Map(manifest.map((m) => [m.candidateId, m]));
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const unknownIds = new Set<string>();
  let blank = 0;

  for (const record of records) {
    const id = idOf(record);
    if (id === "") {
      blank++;
      continue;
    }
    if (!byId.has(id)) unknownIds.add(id);
    else if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  const missing = manifest.filter((m) => !seen.has(m.candidateId)).length;
  const unknown = [...unknownIds];

  const findings: GateFinding[] = [];
  if (blank > 0) {
    findings.push(
      stop(
        "corpus_id_blank",
        `${blank} row(s) have a blank candidate_id, so they cannot be matched to the corpus. ` +
          `Fill in the candidate ID for every row and upload again.`,
        { count: blank },
      ),
    );
  }
  if (unknown.length > 0) {
    findings.push(
      stop(
        "corpus_ids_unknown",
        `${unknown.length} candidate ID(s) are not in this corpus: ${named(unknown)}. ` +
          `Check that the file was scored from this corpus.`,
        { count: unknown.length, ids: unknown.slice(0, NAMED_IDS) },
      ),
    );
  }
  if (duplicates.size > 0) {
    const ids = [...duplicates];
    findings.push(
      stop(
        "corpus_ids_duplicate",
        `${ids.length} candidate ID(s) appear more than once: ${named(ids)}. ` +
          `Keep one row per candidate and upload again.`,
        { count: ids.length, ids: ids.slice(0, NAMED_IDS) },
      ),
    );
  }
  if (missing > 0) {
    findings.push(
      stop(
        "corpus_ids_missing",
        `${missing} candidate(s) in the corpus have no row in the file. Score every record ` +
          `of the corpus and upload the whole file.`,
        { count: missing },
      ),
    );
  }
  if (findings.length > 0) return { ok: false, findings };

  return {
    ok: true,
    records: records.map((record) => {
      const m = byId.get(idOf(record))!;
      const joined: AuditRecord = { ...record, sex: m.sex, race_ethnicity: m.raceEthnicity };
      delete joined[CORPUS_ID_KEY];
      return joined;
    }),
  };
}

function formatShare(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Whether each qualification tier sits above the one below it. A tier's value
 * is its selection rate, or its mean score scaled to [0, 1] by the observed
 * minimum and maximum. A note, not a stop: it describes how the customer's
 * tool treated the tiers, and the rates themselves stand.
 */
export function tierSeparationFindings(
  records: AuditRecord[],
  manifest: ManifestRow[],
  metric: "selection_rate" | "scoring_rate",
  tierOrder: string[],
  /** How the finding names each tier; a tier without a label is named by its key. */
  tierLabels: Record<string, string> = {},
): GateFinding[] {
  const tierOf = new Map(manifest.map((m) => [m.candidateId, m.tierKey]));
  const values = new Map<string, number[]>();
  for (const record of records) {
    const tier = tierOf.get(idOf(record));
    if (tier === undefined) continue;
    const raw = metric === "selection_rate" ? record.selected : record.score;
    let value: number | null = null;
    if (metric === "selection_rate") value = raw === true ? 1 : 0;
    else if (typeof raw === "number" && Number.isFinite(raw)) value = raw;
    if (value === null) continue;
    const list = values.get(tier) ?? [];
    list.push(value);
    values.set(tier, list);
  }

  const all = [...values.values()].flat();
  if (all.length === 0) return [];
  const min = Math.min(...all);
  const range = Math.max(...all) - min;
  const level = new Map<string, number>();
  for (const [tier, list] of values) {
    const mean = list.reduce((a, b) => a + b, 0) / list.length;
    level.set(tier, metric === "selection_rate" ? mean : range > 0 ? (mean - min) / range : 0);
  }

  const findings: GateFinding[] = [];
  const present = tierOrder.filter((t) => level.has(t));
  for (let i = 1; i < present.length; i++) {
    const lower = present[i - 1];
    const upper = present[i];
    const gap = level.get(upper)! - level.get(lower)!;
    if (gap < TIER_SEPARATION_MIN) {
      const what = metric === "selection_rate" ? "selection rate" : "scaled mean score";
      const lowerName = tierLabels[lower] ?? lower;
      const upperName = tierLabels[upper] ?? upper;
      findings.push({
        code: "tier_does_not_separate",
        severity: "note",
        message:
          `The qualification tier "${upperName}" does not sit above "${lowerName}": ${what} ` +
          `${formatShare(level.get(lower)!)} for "${lowerName}" and ` +
          `${formatShare(level.get(upper)!)} for "${upperName}". The tool did not distinguish ` +
          `these two levels of qualification in this corpus.`,
        detail: { lower, upper, gap },
      });
    }
  }
  return findings;
}
