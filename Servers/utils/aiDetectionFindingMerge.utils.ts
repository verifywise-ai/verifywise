/**
 * @fileoverview AI Detection finding merge
 *
 * Collapses finding inputs that describe the same thing before they are
 * written. Two inputs are the same finding when they share the scan, name and
 * provider, compared case-insensitively. The pattern catalogue lists some
 * libraries twice under different categories (for example "qdrant" as a vector
 * database library and "Qdrant" as a RAG component, or "crewai" and "CrewAI"),
 * and both entries match the same import. Without this step the scan stored
 * two library findings for one library, with different descriptions.
 *
 * Pure function, no database access.
 *
 * @module utils/aiDetectionFindingMerge
 */

import {
  ConfidenceLevel,
  FindingSeverity,
  ICreateFindingInput,
  IFilePath,
  RiskLevel,
} from "../domain.layer/interfaces/i.aiDetection";

/**
 * The fields the merge reads or writes. Library, vulnerability and model
 * security finding inputs all fit this shape (model security inputs use their
 * own finding_type and carry CWE/OWASP fields, listed in SEVERITY_DETAIL_FIELDS).
 */
export interface MergeableFindingInput extends Omit<
  ICreateFindingInput,
  "finding_type" | "severity"
> {
  finding_type: string;
  severity?: FindingSeverity | null;
}

/**
 * Fields that explain a finding's severity. They are taken from the variant
 * that supplied the highest severity, so the stored record never pairs a
 * "critical" severity with the details of a lower-severity variant.
 */
const SEVERITY_DETAIL_FIELDS = [
  "description",
  "mitigation",
  "data_flow_summary",
  "vulnerability_details",
  "cwe_id",
  "cwe_name",
  "owasp_ml_id",
  "owasp_ml_name",
  "threat_type",
  "operator_name",
  "module_name",
] as const;

const LEVEL_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function normalise(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Key matching the (scan_id, name, provider) unique constraint, case-insensitively. */
export function findingMergeKey(input: Pick<ICreateFindingInput, "scan_id" | "name" | "provider">) {
  return `${input.scan_id}::${normalise(input.name)}::${normalise(input.provider) || "NULL"}`;
}

/** A name with capitals ("CrewAI") is the curated display name; all lower case is a package name. */
function isDisplayName(name: string): boolean {
  return name !== name.toLowerCase();
}

function rank(level: string | null | undefined): number {
  return level ? (LEVEL_RANK[level] ?? -1) : -1;
}

function higherLevel<T extends ConfidenceLevel | RiskLevel | FindingSeverity>(
  a: T | undefined,
  b: T | undefined,
): T | undefined {
  if (!a) return b;
  if (!b) return a;
  return rank(b) > rank(a) ? b : a;
}

function mergeFilePaths(a: IFilePath[] = [], b: IFilePath[] = []): IFilePath[] {
  const seen = new Set<string>();
  const merged: IFilePath[] = [];
  for (const fp of [...a, ...b]) {
    const key = `${fp.path}::${fp.line_number ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(fp);
  }
  return merged;
}

function mergeStatus(
  a: ICreateFindingInput["finding_status"],
  b: ICreateFindingInput["finding_status"],
): ICreateFindingInput["finding_status"] {
  // A fresh detection (no status) or "active" wins, then carried forward, then fixed.
  if (!a || a === "active" || !b || b === "active") return a && b ? "active" : undefined;
  if (a === "carried_forward" || b === "carried_forward") return "carried_forward";
  return "fixed";
}

function mergePair(target: MergeableFindingInput, incoming: MergeableFindingInput): void {
  const targetFields = target as unknown as Record<string, unknown>;
  const incomingFields = incoming as unknown as Record<string, unknown>;

  // The curated display name brings its own identity: type, category and copy.
  if (!isDisplayName(target.name) && isDisplayName(incoming.name)) {
    target.name = incoming.name;
    target.finding_type = incoming.finding_type;
    target.description = incoming.description ?? target.description;
    target.documentation_url = incoming.documentation_url ?? target.documentation_url;
    target.category = incoming.category ?? target.category;
  } else {
    target.description = target.description ?? incoming.description;
    target.documentation_url = target.documentation_url ?? incoming.documentation_url;
  }
  if (!target.provider && incoming.provider) target.provider = incoming.provider;

  const incomingRank = rank(incoming.severity);
  const targetRank = rank(target.severity);

  target.confidence = higherLevel(target.confidence, incoming.confidence) ?? target.confidence;
  target.risk_level = higherLevel(target.risk_level, incoming.risk_level);

  // The variant with the highest severity also supplies the details explaining it.
  if (incomingRank > targetRank) {
    target.severity = incoming.severity;
    for (const field of SEVERITY_DETAIL_FIELDS) {
      targetFields[field] = incomingFields[field] ?? targetFields[field];
    }
  } else {
    target.mitigation = target.mitigation ?? incoming.mitigation;
    target.data_flow_summary = target.data_flow_summary ?? incoming.data_flow_summary;
    target.vulnerability_details = target.vulnerability_details ?? incoming.vulnerability_details;
  }

  target.file_paths = mergeFilePaths(target.file_paths, incoming.file_paths);
  target.file_count = target.file_paths.length;

  target.license_id = target.license_id ?? incoming.license_id;
  target.license_name = target.license_name ?? incoming.license_name;
  target.license_risk = target.license_risk ?? incoming.license_risk;
  target.license_source = target.license_source ?? incoming.license_source;

  target.finding_status = mergeStatus(target.finding_status, incoming.finding_status);

  // Fail closed: a suppression only covers the merged finding when it covered
  // the most severe variant (at equal severity, every variant). A rule written
  // for a low-severity variant must not hide a critical one from the score and
  // the CI gate. Name and provider rules match case-insensitively, so a rule on
  // "qdrant" already matches every case variant before the merge.
  if (incomingRank > targetRank) {
    target.suppressed = incoming.suppressed;
    target.suppression_rule_id =
      incoming.suppressed === true ? (incoming.suppression_rule_id ?? null) : null;
  } else if (
    incomingRank === targetRank &&
    target.suppressed === true &&
    incoming.suppressed !== true
  ) {
    target.suppressed = false;
    target.suppression_rule_id = null;
  }
}

/**
 * Merge finding inputs that share scan, name and provider (case-insensitive).
 * File lists are unioned (by path and line) and file_count recomputed; the
 * higher confidence, risk level and severity are kept.
 * Inputs are not mutated; order of first appearance is kept.
 */
export function mergeDuplicateFindings<T extends MergeableFindingInput>(inputs: T[]): T[] {
  const merged = new Map<string, T>();
  for (const input of inputs) {
    const key = findingMergeKey(input);
    const existing = merged.get(key);
    if (existing) {
      mergePair(existing, input);
    } else {
      const copy = { ...input, file_paths: [...(input.file_paths ?? [])] };
      merged.set(key, copy);
    }
  }
  return Array.from(merged.values());
}
