/**
 * Diff-aware preview rendering for `agent_update_risk`.
 *
 * The approval modal needs to show the admin what's *changing*, not
 * just what the new values are. "Update risk X: { mitigation_status:
 * In Progress }" reads like JSON; "Change mitigation status of 'Model
 * drift' from 'Not Started' to 'In Progress'" reads like a sentence.
 *
 * `renderUpdateRiskDiffPreview` is the full version and requires the
 * current entity to be loaded. It's called from `file.ts` at file-time
 * when we have a DB connection available.
 *
 * `renderUpdateRiskPreview` is the fallback required by the
 * `AiActionHandler.renderPreview` interface. It gets only the input
 * and produces a shorter summary without before-values. Callers that
 * want the diff should prefer the diff variant.
 *
 * Note on types: we import `IRisk` directly (type-only, erased at
 * runtime) rather than using a loose `Record<string, unknown>`. That
 * gives the diff loop proper keyof-narrowed reads on both sides and
 * makes `satisfies` on `AGENT_UPDATE_RISK_UPDATABLE_FIELDS` catch any
 * future drift between the input schema and the DB interface.
 */

import type { IRisk } from "../../../domain.layer/interfaces/I.risk";
import type { AgentUpdateRiskInput } from "./schema";
import { AGENT_UPDATE_RISK_UPDATABLE_FIELDS } from "./schema";

/**
 * Full diff preview: lists each changed field with the before and
 * after values. Called from `file.ts` at file-time.
 */
export function renderUpdateRiskDiffPreview(
  input: AgentUpdateRiskInput,
  currentRisk: IRisk | null,
): string {
  if (!currentRisk) {
    // The risk row couldn't be loaded — either it doesn't exist or
    // was soft-deleted. We still file the request; the executor will
    // surface a clear error on approval. Keep the preview honest.
    return `Update risk #${input.risk_id} (risk not found — the update will fail when approved)`;
  }

  const name = currentRisk.risk_name ?? `#${input.risk_id}`;
  const changes: string[] = [];

  for (const { inputKey, dbKey } of AGENT_UPDATE_RISK_UPDATABLE_FIELDS) {
    // `inputKey` is narrowed to `keyof AgentUpdateRiskInput` and `dbKey`
    // to `keyof IRisk` by the `satisfies` clause on the const array, so
    // both reads are fully type-safe with no casts.
    const newValue = input[inputKey];
    if (newValue === undefined) continue;

    const currentValue = currentRisk[dbKey];

    // Skip fields that aren't actually changing — e.g. the LLM sent
    // severity: "Major" and the current value is already "Major".
    // The executor will also no-op these but surfacing them in the
    // preview would confuse the approver.
    if (valuesEqual(currentValue, newValue)) continue;

    changes.push(
      `${humanizeField(inputKey)}: ${formatValue(currentValue)} → ${formatValue(newValue)}`,
    );
  }

  // Project / framework links are handled separately — they live in
  // junction tables, not on the risk row, so we just note that they'll
  // be replaced rather than diffing the arrays.
  if (input.project_ids !== undefined) {
    changes.push(`projects replaced with [${input.project_ids.join(", ") || "none"}]`);
  }
  if (input.framework_ids !== undefined) {
    changes.push(`frameworks replaced with [${input.framework_ids.join(", ") || "none"}]`);
  }

  if (changes.length === 0) {
    // Every field the LLM sent matches the current value — the update
    // would be a no-op. Surface this honestly in the preview so the
    // approver sees what's going on.
    return `Update risk "${name}" (no effective changes — all proposed values match current)`;
  }

  return `Update risk "${name}": ${changes.join("; ")}`;
}

/**
 * Fallback preview required by the handler interface. Called when
 * there's no current-entity context (e.g. if a future caller re-renders
 * from just the stored payload). Produces a one-line summary of which
 * fields are changing without the before-values.
 */
export function renderUpdateRiskPreview(input: AgentUpdateRiskInput): string {
  const touched: string[] = [];
  for (const { inputKey } of AGENT_UPDATE_RISK_UPDATABLE_FIELDS) {
    if (input[inputKey] !== undefined) {
      touched.push(humanizeField(inputKey));
    }
  }
  if (input.project_ids !== undefined) touched.push("project ids");
  if (input.framework_ids !== undefined) touched.push("framework ids");

  if (touched.length === 0) {
    return `Update risk #${input.risk_id} (no fields)`;
  }

  return `Update risk #${input.risk_id}: ${touched.join(", ")}`;
}

/** Convert snake_case field names to something more readable. */
function humanizeField(field: string): string {
  return field.replace(/_/g, " ");
}

/** Render a single value for inclusion in the diff string. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "∅";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) {
    return `[${value.join(", ")}]`;
  }
  if (typeof value === "string") {
    // Trim long strings so the preview stays one line.
    return value.length > 60 ? `"${value.slice(0, 57)}..."` : `"${value}"`;
  }
  return String(value);
}

/** Structural equality for the primitive + array shapes our fields use. */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  // Date columns come back from the DB as Date objects; inputs from
  // the LLM are ISO strings. Normalize before comparing.
  if (a instanceof Date && typeof b === "string") {
    return a.toISOString().slice(0, 10) === b.slice(0, 10);
  }
  if (b instanceof Date && typeof a === "string") {
    return b.toISOString().slice(0, 10) === a.slice(0, 10);
  }
  return false;
}
