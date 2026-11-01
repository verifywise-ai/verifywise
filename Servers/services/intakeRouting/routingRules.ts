import type { ScoreBand } from "../intakeScoring/scoreMath";
import type { IFormRouting } from "../../domain.layer/interfaces/i.intakeForm";
import type { ReviewLane, RoutingReason } from "../../domain.layer/interfaces/i.intakeSubmission";

export const DEFAULT_ROUTING: Omit<
  IFormRouting,
  "enabled" | "seniorReviewerIds" | "standardReviewerIds"
> = { threshold: 50, closeCallMargin: 10, secondReviewRate: 10 };

/** Lowest score of each band, used to re-route after a band override. */
export const BAND_LOWER_BOUND: Record<ScoreBand, number> = {
  Low: 0,
  Medium: 26,
  High: 51,
  Critical: 76,
};

/** First matching rule wins. */
export function laneFor(
  input: { level: string | null; finalScore: number | null; scoringStatus: string | null },
  cfg: Pick<IFormRouting, "threshold" | "closeCallMargin">,
): { lane: ReviewLane; reason: RoutingReason } {
  if (input.level === "Prohibited") return { lane: "senior", reason: "prohibited" };
  if (input.finalScore === null || input.scoringStatus === "ai_failed") {
    return { lane: "senior", reason: "no_score" };
  }
  if (Math.abs(input.finalScore - cfg.threshold) < cfg.closeCallMargin) {
    return { lane: "senior", reason: "close_call" };
  }
  if (input.finalScore >= cfg.threshold) {
    return { lane: "senior", reason: "at_or_above_threshold" };
  }
  return { lane: "standard", reason: "below_threshold" };
}

const RANGES = {
  threshold: { min: 1, max: 99 },
  closeCallMargin: { min: 0, max: 25 },
  secondReviewRate: { min: 0, max: 100 },
} as const;

export type RoutingValidationFailure = {
  ok: false;
  /** English message, kept for logs and tests */
  error: string;
  /** Locale key and placeholders for req.t */
  i18nKey: string;
  i18nVars?: Record<string, string | number>;
};

const fail = (
  i18nKey: string,
  i18nVars?: Record<string, string | number>,
): RoutingValidationFailure => ({
  ok: false,
  i18nKey,
  i18nVars,
  error: i18nKey.replace(/\{(\w+)\}/g, (_, k) => String(i18nVars?.[k] ?? `{${k}}`)),
});

function parseIds(raw: unknown, name: string): number[] | RoutingValidationFailure {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return fail("{name} must be an array", { name });
  const ids: number[] = [];
  for (const v of raw) {
    if (!Number.isSafeInteger(v) || (v as number) <= 0) {
      return fail("{name} must contain positive integer user ids", { name });
    }
    if (!ids.includes(v as number)) ids.push(v as number);
  }
  return ids;
}

export function validateRoutingSettings(
  raw: unknown,
): { ok: true; value: IFormRouting } | RoutingValidationFailure {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return fail("routing must be an object");
  }
  const body = raw as Record<string, unknown>;
  if (typeof body.enabled !== "boolean") {
    return fail("enabled must be a boolean");
  }

  const senior = parseIds(body.seniorReviewerIds, "seniorReviewerIds");
  if (!Array.isArray(senior)) return senior;
  const standard = parseIds(body.standardReviewerIds, "standardReviewerIds");
  if (!Array.isArray(standard)) return standard;

  const numbers = {} as Record<keyof typeof RANGES, number>;
  for (const key of Object.keys(RANGES) as Array<keyof typeof RANGES>) {
    const value = body[key] === undefined ? DEFAULT_ROUTING[key] : body[key];
    const { min, max } = RANGES[key];
    if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
      return fail("{key} must be a whole number from {min} to {max}", { key, min, max });
    }
    numbers[key] = value as number;
  }

  if (body.enabled && (senior.length === 0 || standard.length === 0)) {
    return fail("seniorReviewerIds and standardReviewerIds must each have at least one reviewer");
  }

  return {
    ok: true,
    value: {
      enabled: body.enabled,
      seniorReviewerIds: senior,
      standardReviewerIds: standard,
      ...numbers,
    },
  };
}

export function canDecideLane(
  lane: ReviewLane | null,
  userId: number,
  isAdmin: boolean,
  cfg: IFormRouting | null,
): boolean {
  if (!cfg?.enabled || lane === null || isAdmin) return true;
  if (cfg.seniorReviewerIds.includes(userId)) return true;
  return lane === "standard" && cfg.standardReviewerIds.includes(userId);
}

/** Ids of the users who can decide a submission in a lane: senior reviewers sit in both. */
export function laneReviewerIdsFor(lane: ReviewLane | null, cfg: IFormRouting | null): number[] {
  if (!cfg?.enabled || lane === null) return [];
  if (lane === "senior") return cfg.seniorReviewerIds;
  return [...new Set([...cfg.standardReviewerIds, ...cfg.seniorReviewerIds])];
}

/**
 * The reviewers a lane is assigned to, for emails: that lane's own list, or
 * both lists while no lane is stored yet. Senior reviewers are not added to
 * the standard lane here (unlike laneReviewerIdsFor, which is about who may
 * decide).
 */
export function laneAssigneeIds(
  cfg: Pick<IFormRouting, "seniorReviewerIds" | "standardReviewerIds">,
  lane: ReviewLane | null | undefined,
): number[] {
  const senior = cfg.seniorReviewerIds ?? [];
  const standard = cfg.standardReviewerIds ?? [];
  if (lane === "senior") return senior;
  if (lane === "standard") return standard;
  return [...senior, ...standard];
}
