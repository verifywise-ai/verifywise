// Servers/services/intakeConfirmation/confirmation.ts
// The submitter's "submission received" email. It names who reviews the
// submission and by when, so it waits until routing has picked the lane. It
// goes at most once per submission: from the submit handler when there is no
// lane to wait for, from the assessment job once routing has run, from the
// 2-minute cap job, or from the worker-start backfill. The atomic claim on
// confirmation_sent_at makes every later call a no-op.
import { IntakeSubmissionStatus } from "../../domain.layer/enums/intake-submission-status.enum";
import type { IIntakeForm } from "../../domain.layer/interfaces/i.intakeForm";
import type { IIntakeSubmission } from "../../domain.layer/interfaces/i.intakeSubmission";
import {
  claimSubmissionConfirmationQuery,
  getEligibleReviewersQuery,
  getIntakeFormByIdQuery,
  getSubmissionByIdQuery,
  getSubmissionsAwaitingConfirmationQuery,
  getTenantSlugById,
} from "../../utils/intakeForm.utils";
import logger from "../../utils/logger/fileLogger";
import { sendSubmissionReceivedEmail } from "../intakeFormEmail.service";
import {
  addBusinessDays,
  DEFAULT_REVIEW_DAYS,
  REVIEW_TIME_ZONE,
  reviewerNamesText,
  reviewSentence,
} from "./reviewTime";

export interface ConfirmationDeps {
  getSubmission: (id: number, organizationId: number) => Promise<IIntakeSubmission | null>;
  getForm: (id: number, organizationId: number) => Promise<IIntakeForm | null>;
  getReviewers: typeof getEligibleReviewersQuery;
  getTenantSlug: typeof getTenantSlugById;
  claim: typeof claimSubmissionConfirmationQuery;
  send: typeof sendSubmissionReceivedEmail;
  listAwaiting: typeof getSubmissionsAwaitingConfirmationQuery;
  /** The signed resubmission token for the "Edit submission" link. */
  createToken: (payload: Record<string, unknown>) => string | Promise<string>;
  now: () => Date;
  timeZone: string;
}

const defaultDeps: ConfirmationDeps = {
  getSubmission: (id, organizationId) => getSubmissionByIdQuery(id, organizationId),
  getForm: getIntakeFormByIdQuery,
  getReviewers: getEligibleReviewersQuery,
  getTenantSlug: getTenantSlugById,
  claim: claimSubmissionConfirmationQuery,
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

/** The review due date ("YYYY-MM-DD") of a submission made at `submittedAt`. */
export function reviewDueDateFor(
  submittedAt: Date,
  reviewDays: number | null | undefined,
  timeZone: string = REVIEW_TIME_ZONE,
): string {
  return addBusinessDays(submittedAt, reviewDays ?? DEFAULT_REVIEW_DAYS, timeZone);
}

/**
 * The users the email names, or "wait" while routing has yet to pick a lane.
 * Routing on: the assigned lane's reviewers; before a lane is stored it waits,
 * unless `fallback` (routing failed or the 2 minutes ran out) or neither lane
 * has a reviewer. Routing off: the form's notification recipients, who are
 * the people asked to review it. An empty list means "the governance team".
 */
export function reviewerIdsFor(
  form: Pick<IIntakeForm, "routing" | "recipients">,
  submission: Pick<IIntakeSubmission, "routing">,
  fallback: boolean,
): number[] | "wait" {
  const cfg = form.routing;
  if (!cfg?.enabled) return form.recipients ?? [];
  const lane = submission.routing?.lane;
  if (lane === "senior") return cfg.seniorReviewerIds ?? [];
  if (lane === "standard") return cfg.standardReviewerIds ?? [];
  const anyReviewer =
    (cfg.seniorReviewerIds?.length ?? 0) + (cfg.standardReviewerIds?.length ?? 0) > 0;
  return fallback || !anyReviewer ? [] : "wait";
}

/**
 * Send the submitter's confirmation unless it has gone already, the
 * submission was decided, it has no email, or (without `fallback`) routing
 * has not picked the lane yet. Returns whether this call sent it. Never throws
 * for a reviewer lookup or link failure: the email names the governance team
 * or links to the generic page instead.
 */
export async function sendSubmitterConfirmationOnce(
  organizationId: number,
  submissionId: number,
  lang: string | undefined,
  opts: { fallback: boolean },
  deps?: Partial<ConfirmationDeps>,
): Promise<boolean> {
  const d: ConfirmationDeps = { ...defaultDeps, ...deps };
  const submission = await d.getSubmission(submissionId, organizationId);
  if (
    !submission ||
    submission.status !== IntakeSubmissionStatus.PENDING ||
    !submission.submitterEmail ||
    submission.confirmationSentAt
  ) {
    return false;
  }
  const form = await d.getForm(submission.formId, organizationId);
  if (!form) return false;

  const ids = reviewerIdsFor(form, submission, opts.fallback);
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

  const days = form.reviewDays ?? DEFAULT_REVIEW_DAYS;
  const dueDate =
    submission.reviewDueDate ??
    reviewDueDateFor(new Date(submission.createdAt ?? d.now()), days, d.timeZone);

  // Everything that can fail is built before the claim, so a failure leaves
  // the confirmation unclaimed for the next path to send.
  // Forms made before public ids keep the legacy tenant/slug link.
  let tenantSlug: string | undefined;
  if (!form.publicId) {
    try {
      tenantSlug = (await d.getTenantSlug(organizationId)) ?? undefined;
    } catch (error) {
      logger.error(`Could not load the tenant slug for a resubmit link: ${errorMessage(error)}`);
    }
  }
  const email = submission.submitterEmail;
  const token = await d.createToken({
    submissionId,
    formId: form.id,
    email,
    timestamp: d.now().getTime(),
  });
  const sentence = reviewSentence(reviewerNamesText(names, lang), days, dueDate, lang);

  if (!(await d.claim(submissionId, organizationId, dueDate))) return false;
  await d.send(
    email,
    submission.submitterName || email.split("@")[0],
    form.name,
    submissionId,
    token,
    form.publicId ?? undefined,
    tenantSlug,
    form.slug,
    lang,
    sentence,
  );
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
 * Worker-start backfill: confirmations still unclaimed 10 minutes after
 * submit (job and cap lost) go now, naming the lane if one was stored. The
 * submitter's language is not stored, so they go in the default language.
 * Returns how many were sent.
 */
export async function backfillSubmitterConfirmations(
  deps?: Partial<ConfirmationDeps>,
): Promise<number> {
  const d: ConfirmationDeps = { ...defaultDeps, ...deps };
  const rows = await d.listAwaiting();
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
        `Intake backfill could not confirm submission ${row.id}: ${errorMessage(error)}`,
      );
    }
  }
  return sent;
}
