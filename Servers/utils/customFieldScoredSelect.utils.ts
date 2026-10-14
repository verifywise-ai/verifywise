import { randomBytes } from "crypto";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";

/**
 * Scored select options: a single-choice custom field whose options carry a
 * score. A record stores the option's id; its score is always read from the
 * definition, so rescoring an option rescores every record that picked it.
 */
export interface IScoredOption {
  id: string;
  label: string;
  score: number;
}

export const MAX_SCORED_OPTIONS = 50;
export const OPTION_MIN = 1;
export const OPTION_MAX = 255;

/** Error code on the 409 a definition update returns when removed options are in use. */
export const OPTIONS_IN_USE = "options_in_use";

/** Round to 2 decimals; never store -0. */
export const roundScore = (score: number): number => {
  const rounded = Math.round(score * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
};

/** 3 -> "3", 0.5 -> "0.5", 0.333 -> "0.33". */
export const formatScore = (score: number): string => String(roundScore(score));

export const formatScoredOption = (o: { label: string; score: number }): string =>
  `${o.label} (${formatScore(o.score)})`;

const newOptionId = (taken: Set<string>): string => {
  for (;;) {
    const id = `opt_${randomBytes(4).toString("hex")}`;
    if (!taken.has(id)) return id;
  }
};

/**
 * Validate scored options from a create (existing = null) or update request.
 * An option may carry an id only if `existing` has it; options without one get
 * a new id. Returns options in the given order.
 */
export const validateScoredOptions = (
  input: unknown,
  existing: IScoredOption[] | null,
): IScoredOption[] => {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_SCORED_OPTIONS) {
    throw new ValidationException(
      `scored select fields need 1..${MAX_SCORED_OPTIONS} options`,
      "options",
    );
  }

  const existingIds = new Set((existing ?? []).map((o) => o.id));
  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();
  const parsed: Array<{ id?: string; label: string; score: number }> = [];

  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new ValidationException("each option needs a label and a score", "options");
    }
    const { id, label, score } = raw as Record<string, unknown>;

    if (typeof label !== "string") {
      throw new ValidationException("option label must be a string", "options");
    }
    const trimmed = label.trim();
    if (trimmed.length < OPTION_MIN || trimmed.length > OPTION_MAX) {
      throw new ValidationException(
        `option labels must be ${OPTION_MIN}..${OPTION_MAX} characters`,
        "options",
      );
    }
    const labelKey = trimmed.toLowerCase();
    if (seenLabels.has(labelKey)) {
      throw new ValidationException("option labels must be unique", "options", trimmed);
    }
    seenLabels.add(labelKey);

    // Also check the rounded score: score * 100 overflows to Infinity above ~1.8e306,
    // which JSON would store as null.
    if (typeof score !== "number" || !Number.isFinite(roundScore(score))) {
      throw new ValidationException("option score must be a finite number", "options", trimmed);
    }

    if (id !== undefined && id !== null) {
      if (typeof id !== "string" || !existingIds.has(id)) {
        throw new ValidationException("unknown option id", "options", id);
      }
      if (seenIds.has(id)) {
        throw new ValidationException("option ids must be unique", "options", id);
      }
      seenIds.add(id);
    }

    parsed.push({
      id: typeof id === "string" ? id : undefined,
      label: trimmed,
      score: roundScore(score),
    });
  }

  const taken = new Set([...existingIds, ...seenIds]);
  return parsed.map((o) => {
    const id = o.id ?? newOptionId(taken);
    taken.add(id);
    return { id, label: o.label, score: o.score };
  });
};

/** Options in `before` that `after` no longer has. */
export const removedOptions = <T extends { id: string }>(
  before: ReadonlyArray<T>,
  after: ReadonlyArray<{ id: string }>,
): T[] => {
  const kept = new Set(after.map((o) => o.id));
  return before.filter((o) => !kept.has(o.id));
};

/**
 * Validate `option_moves` ({ removedId: targetId }). A source must be a removed
 * option; a target must be one of the remaining options. For select and
 * multiselect fields an option's id is its text.
 */
export const validateOptionMoves = (
  moves: unknown,
  removed: ReadonlyArray<{ id: string }>,
  after: ReadonlyArray<{ id: string }>,
): Record<string, string> => {
  // No prototype: plain option text such as "constructor" is a valid key.
  const result: Record<string, string> = Object.create(null);
  if (moves === undefined || moves === null) return result;
  if (typeof moves !== "object" || Array.isArray(moves)) {
    throw new ValidationException("option_moves must be an object", "option_moves");
  }
  const removedIds = new Set(removed.map((o) => o.id));
  const targetIds = new Set(after.map((o) => o.id));
  for (const [from, to] of Object.entries(moves as Record<string, unknown>)) {
    if (!removedIds.has(from)) {
      throw new ValidationException(
        "option_moves can only move a removed option",
        "option_moves",
        from,
      );
    }
    if (typeof to !== "string" || !targetIds.has(to)) {
      throw new ValidationException(
        "option_moves target must be a remaining option",
        "option_moves",
        to,
      );
    }
    result[from] = to;
  }
  return result;
};

/**
 * Validate `option_removals`: removed options whose answers are deleted rather
 * than moved. Each must be a removed option, listed once, and not also moved.
 */
export const validateOptionRemovals = (
  removals: unknown,
  removed: ReadonlyArray<{ id: string }>,
  moves: Record<string, string>,
): Set<string> => {
  const result = new Set<string>();
  if (removals === undefined || removals === null) return result;
  if (!Array.isArray(removals)) {
    throw new ValidationException("option_removals must be an array", "option_removals");
  }
  const removedIds = new Set(removed.map((o) => o.id));
  for (const id of removals) {
    if (typeof id !== "string" || !removedIds.has(id)) {
      throw new ValidationException(
        "option_removals can only list a removed option",
        "option_removals",
        id,
      );
    }
    if (result.has(id) || Object.prototype.hasOwnProperty.call(moves, id)) {
      throw new ValidationException(
        "an option can be moved or removed once, not both",
        "option_removals",
        id,
      );
    }
    result.add(id);
  }
  return result;
};
