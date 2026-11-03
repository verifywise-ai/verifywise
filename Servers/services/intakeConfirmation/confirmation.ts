// Servers/services/intakeConfirmation/confirmation.ts
// The submitter's "submission received" email. It names who reviews the
// submission and by when, so it waits until routing has picked the lane. It
// goes at most once per submission, from whichever path gets there first: the
// submit handler when there is no lane to wait for, the assessment job once
// routing has run, the 2-minute cap job, and the repeating sweep (also run at
// worker start). The atomic claim on confirmation_sent_at makes every later
// call a no-op; a failed send releases the claim so the next path retries.
import { IntakeSubmissionStatus } from "../../domain.layer/enums/intake-submission-status.enum";
import type { IFormRouting } from "../../domain.layer/interfaces/i.intakeForm";
import type {
  ISubmissionConfirmationRow,
  ISubmissionRouting,
} from "../../domain.layer/interfaces/i.intakeSubmission";
import { DEFAULT_REVIEW_DAYS } from "../../constants/intakeReviewTime";
import {
  claimSubmissionConfirmationQuery,
  getEligibleReviewersQuery,
  getSubmissionForConfirmationQuery,
  getSubmissionsAwaitingConfirmationQuery,
  getTenantSlugById,
  releaseSubmissionConfirmationQuery,
} from "../../utils/intakeForm.utils";
import logger from "../../utils/logger/fileLogger";
import { sendSubmissionReceivedEmail } from "../intakeFormEmail.service";
import { laneAssigneeIds } from "../intakeRouting/routingRules";
import {
  addBusinessDays,
  isPastDue,
  REVIEW_TIME_ZONE,
  reviewerNamesText,
  reviewSentence,
} from "./reviewTime";

/** The sweep picks up confirmations still unclaimed this long after submit (past the 2-minute cap). */
export const CONFIRMATION_SWEEP_AFTER_MINUTES = 3;
/** Older submissions are left alone, so stale rows never pile up in the sweep. */
export const CONFIRMATION_SWEEP_WITHIN_DAYS = 7;
/**
 * Minutes before each retry after a failed send: the sweep retries at most
 * this many times, waiting longer each time, then gives up.
 */
export const CONFIRMATION_RETRY_GAPS_MINUTES = [5, 15, 60, 360, 1440];
const MAX_RETRIES = CONFIRMATION_RETRY_GAPS_MINUTES.length;

export interface ConfirmationDeps {
  getSubmission: typeof getSubmissionForConfirmationQuery;
  getReviewers: typeof getEligibleReviewersQuery;
  getTenantSlug: typeof getTenantSlugById;
  claim: typeof claimSubmissionConfirmationQuery;
  release: typeof releaseSubmissionConfirmationQuery;
  /** Resolves true once the email was handed to the mail service. */
  send: typeof sendSubmissionReceivedEmail;
  listAwaiting: typeof getSubmissionsAwaitingConfirmationQuery;
  /** The signed resubmission token for the "Edit submission" link. */
  createToken: (payload: Record<string, unknown>) => string | Promise<string>;
  now: () => Date;
  timeZone: string;
}

const defaultDeps: ConfirmationDeps = {
  getSubmission: getSubmissionForConfirmationQuery,
  getReviewers: getEligibleReviewersQuery,
  getTenantSlug: getTenantSlugById,
  claim: claimSubmissionConfirmationQuery,
  release: releaseSubmissionConfirmationQuery,
  send: sendSubmissionReceivedEmail,
  listAwaiting: getSubmissionsAwaitingConfirmationQuery,
  // Loaded on use: the module throws at import time without a signing secret,
  // and the assessment job (which imports this file) must load without one.
  createToken: async (payload) =>
    (await import("../../utils/signedToken.utils")).createSignedToken(payload),
  now: () => new Date(),
  timeZone: REVIEW_TIME_ZONE,
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * The review time a submission made now gets: the form's setting (read with
 * the form at submit; the default when missing) and the date it runs out.
 */
export function reviewTimeAtSubmit(
  formReviewDays: number | null | undefined,
  now: Date = new Date(),
): { reviewDays: number; reviewDueDate: string } {
  const reviewDays = formReviewDays ?? DEFAULT_REVIEW_DAYS;
  return { reviewDays, reviewDueDate: addBusinessDays(now, reviewDays, REVIEW_TIME_ZONE) };
}

/**
 * The users the email names, or "wait" while routing has yet to pick a lane.
 * Routing on: the assigned lane's reviewers; before a lane is stored it waits,
 * unless `fallback` (routing failed or the 2 minutes ran out) or neither lane
 * has a reviewer. Routing off: the form's notification recipients, who are
 * the people asked to review it. An empty list means "the governance team".
 */
export function reviewerIdsFor(
  formRouting: IFormRouting | null,
  formRecipients: number[] | null,
  routing: ISubmissionRouting | null,
  fallback: boolean,
): number[] | "wait" {
  if (!formRouting?.enabled) return formRecipients ?? [];
  const lane = routing?.lane;
  if (lane) return laneAssigneeIds(formRouting, lane);
  return fallback || laneAssigneeIds(formRouting, null).length === 0 ? [] : "wait";
}

/** The review time and date to name, or null when unknown or already past. */
function dueToName(
  row: Pick<ISubmissionConfirmationRow, "reviewDays" | "reviewDueDate">,
  d: ConfirmationDeps,
): { days: number; date: string } | null {
  if (row.reviewDays == null || !row.reviewDueDate) return null;
  if (isPastDue(row.reviewDueDate, d.now(), d.timeZone)) return null;
  return { days: row.reviewDays, date: row.reviewDueDate };
}

/**
 * Send the submitter's confirmation unless it has gone already, the
 * submission was decided, it has no email, or (without `fallback`) routing
 * has not picked the lane yet. A deleted form marks the submission handled
 * and sends nothing. A failed send releases the claim. Returns whether this
 * call sent the email.
 */
export async function sendSubmitterConfirmationOnce(
  organizationId: number,
  submissionId: number,
  lang: string | undefined,
  opts: { fallback: boolean },
  deps?: Partial<ConfirmationDeps>,
): Promise<boolean> {
  const d: ConfirmationDeps = { ...defaultDeps, ...deps };
  const row = await d.getSubmission(submissionId, organizationId);
  if (
    !row ||
    row.status !== IntakeSubmissionStatus.PENDING ||
    !row.submitterEmail ||
    row.confirmationSentAt
  ) {
    return false;
  }
  // After a failed send, only the scheduled retry may send it; after the last
  // retry, nothing does.
  if (row.confirmationAttempts > MAX_RETRIES) return false;
  if (row.confirmationNextAttemptAt && new Date(row.confirmationNextAttemptAt) > d.now()) {
    return false;
  }
  if (!row.formExists) {
    // Nothing to name or link to: mark it handled so the sweep stops listing it.
    await d.claim(submissionId, organizationId);
    logger.warn(`Submission ${submissionId}'s form was deleted; no confirmation sent`);
    return false;
  }

  const ids = reviewerIdsFor(row.formRouting, row.formRecipients, row.routing, opts.fallback);
  if (ids === "wait") return false;

  let names: string[] = [];
  if (ids.length > 0) {
    try {
      const reviewers = await d.getReviewers(organizationId, ids);
      names = reviewers.map((u) => `${u.name ?? ""} ${u.surname ?? ""}`.trim());
    } catch (error) {
      logger.error(
        `Could not load reviewers for submission ${submissionId}'s confirmation: ${errorMessage(error)}`,
      );
    }
  }

  // Everything that can fail is built before the claim. Forms made before
  // public ids keep the legacy tenant/slug link.
  let tenantSlug: string | undefined;
  if (!row.formPublicId) {
    try {
      tenantSlug = (await d.getTenantSlug(organizationId)) ?? undefined;
    } catch (error) {
      logger.error(`Could not load the tenant slug for a resubmit link: ${errorMessage(error)}`);
    }
  }
  const email = row.submitterEmail;
  const token = await d.createToken({
    submissionId,
    formId: row.formId,
    email,
    timestamp: d.now().getTime(),
  });
  const sentence = reviewSentence(reviewerNamesText(names), dueToName(row, d));

  if (!(await d.claim(submissionId, organizationId))) return false;
  const sent = await d.send(
    email,
    row.submitterName || email.split("@")[0],
    row.formName ?? "",
    submissionId,
    token,
    row.formPublicId ?? undefined,
    tenantSlug,
    row.formSlug ?? undefined,
    lang,
    sentence,
  );
  if (!sent) {
    // Release the claim so a later sweep retries. Accepted risk: if the mail
    // provider accepted the message but the call still failed (a timeout
    // after delivery), the retry sends a duplicate.
    const failures = await d.release(submissionId, organizationId, CONFIRMATION_RETRY_GAPS_MINUTES);
    if (failures > MAX_RETRIES) {
      logger.error(
        `Giving up on the confirmation for submission ${submissionId} after ${failures} failed sends`,
      );
    }
    return false;
  }
  return true;
}

/**
 * Fire-and-forget wrapper for the request and job paths: logs instead of
 * throwing, so a confirmation failure never fails a submit or a job.
 */
export async function trySendSubmitterConfirmation(
  organizationId: number,
  submissionId: number,
  lang: string | undefined,
  opts: { fallback: boolean },
  deps?: Partial<ConfirmationDeps>,
): Promise<void> {
  try {
    await sendSubmitterConfirmationOnce(organizationId, submissionId, lang, opts, deps);
  } catch (error) {
    logger.error(
      `Could not send the confirmation for submission ${submissionId}: ${errorMessage(error)}`,
    );
  }
}

/**
 * The repeating sweep (every 5 minutes, and at worker start): confirmations
 * still unclaimed a few minutes after submit, from the last week, go now,
 * naming the lane's reviewers if routing finished or the governance team.
 * Returns how many were sent.
 */
export async function sweepSubmitterConfirmations(
  deps?: Partial<ConfirmationDeps>,
): Promise<number> {
  const d: ConfirmationDeps = { ...defaultDeps, ...deps };
  const rows = await d.listAwaiting(
    CONFIRMATION_SWEEP_AFTER_MINUTES,
    CONFIRMATION_SWEEP_WITHIN_DAYS,
    MAX_RETRIES,
  );
  let sent = 0;
  for (const row of rows) {
    try {
      if (
        await sendSubmitterConfirmationOnce(
          row.organizationId,
          row.id,
          undefined,
          { fallback: true },
          deps,
        )
      ) {
        sent += 1;
      }
    } catch (error) {
      logger.error(
        `Intake confirmation sweep could not confirm submission ${row.id}: ${errorMessage(error)}`,
      );
    }
  }
  return sent;
}
