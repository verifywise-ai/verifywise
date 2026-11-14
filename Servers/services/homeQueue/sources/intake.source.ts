import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { IntakeSubmissionStatus } from "../../../domain.layer/enums/intake-submission-status.enum";
import { laneReviewerIdsFor } from "../../intakeRouting/routingRules";
import type { HomeQueueItem, HomeQueueSource } from "../../../domain.layer/interfaces/i.homeQueue";
import type { IFormRouting } from "../../../domain.layer/interfaces/i.intakeForm";
import type { ISubmissionRouting } from "../../../domain.layer/interfaces/i.intakeSubmission";

export type IntakeReviewKind = "review" | "second-review";

export interface IntakeSubmissionFacts {
  status: string;
  /** The first approver (or rejecter); null while pending. */
  reviewedBy: number | null;
  routing: ISubmissionRouting | null;
}

/** Older forms can store routing without one or both reviewer lists. */
const withLists = (routing: IFormRouting): IFormRouting => ({
  ...routing,
  seniorReviewerIds: routing.seniorReviewerIds ?? [],
  standardReviewerIds: routing.standardReviewerIds ?? [],
});

const secondReviewNeedsSomeone = (routing: ISubmissionRouting | null): boolean => {
  const second = routing?.secondReview;
  return (
    !!second && (second.status === "open" || (second.status === "missed" && !second.resolvedAt))
  );
};

/**
 * Whether a submission needs this user, who already holds intakeForm.edit.
 *
 * Pending: mine when routing is off, when no lane is stored yet, or when I am
 * one of the lane's named reviewers (laneReviewerIdsFor, so senior reviewers
 * also cover the standard lane). An Admin who could override another lane
 * (canDecideLane) is not counted: only named reviewers see a routed
 * submission, or every Admin would see every one (spec, source 3).
 *
 * Approved with a second review open, or missed and not yet resolved: mine
 * when I am a senior reviewer of the form and not the first approver. This is
 * getPendingSubmissions' secondReviewerIds rule; seniors keep it even after
 * routing is turned off.
 */
export function isIntakeReviewFor(
  userId: number,
  submission: IntakeSubmissionFacts,
  formRouting: IFormRouting | null,
): IntakeReviewKind | null {
  const routing = formRouting ? withLists(formRouting) : null;

  if (submission.status === IntakeSubmissionStatus.PENDING) {
    const lane = submission.routing?.lane ?? null;
    if (!routing?.enabled || lane === null) return "review";
    return laneReviewerIdsFor(lane, routing).includes(userId) ? "review" : null;
  }

  if (
    submission.status === IntakeSubmissionStatus.APPROVED &&
    secondReviewNeedsSomeone(submission.routing) &&
    submission.reviewedBy !== userId &&
    (routing?.seniorReviewerIds.includes(userId) ?? false)
  ) {
    return "second-review";
  }

  return null;
}

interface IntakeRow {
  id: number;
  status: string;
  reviewed_by: number | null;
  routing: ISubmissionRouting | null;
  submitter_name: string | null;
  submitter_email: string | null;
  created_at: Date | string | null;
  form_name: string | null;
  form_routing: IFormRouting | null;
}

/**
 * Candidates: every pending submission, and every approved one whose second
 * review is open or missed and unresolved (the oversight query's condition,
 * oversight.ts ROWS_SQL). Which of them are mine is decided per row above.
 */
const CANDIDATES_SQL = `
  SELECT s.id, s.status, s.reviewed_by, s.routing,
         s.submitter_name, s.submitter_email, s.created_at,
         f.name AS form_name, f.routing AS form_routing
  FROM intake_submissions s
  JOIN intake_forms f ON f.id = s.form_id AND f.organization_id = s.organization_id
  WHERE s.organization_id = :organizationId
    AND (
      s.status = :pending
      OR (
        s.status = :approved
        AND (
          s.routing->'secondReview'->>'status' = 'open'
          OR (s.routing->'secondReview'->>'status' = 'missed'
              AND s.routing->'secondReview'->>'resolvedAt' IS NULL)
        )
      )
    )`;

const toIso = (value: Date | string | null | undefined): string | null =>
  value ? new Date(value).toISOString() : null;

/**
 * Intake submissions waiting on my review or second review. Opens the
 * submission on the Intake Submissions tab, the deep link the second-review
 * email already uses (intakeFormEmail.service.ts).
 */
export const intakeSource: HomeQueueSource = {
  id: "intake",
  part: "record",
  isVisible: (ctx) => ctx.can("intakeForm.edit"),
  async load(ctx) {
    const rows = await sequelize.query<IntakeRow>(CANDIDATES_SQL, {
      replacements: {
        organizationId: ctx.organizationId,
        pending: IntakeSubmissionStatus.PENDING,
        approved: IntakeSubmissionStatus.APPROVED,
      },
      type: QueryTypes.SELECT,
    });

    const items: HomeQueueItem[] = [];
    for (const row of rows) {
      const kind = isIntakeReviewFor(
        ctx.userId,
        { status: row.status, reviewedBy: row.reviewed_by, routing: row.routing },
        row.form_routing,
      );
      if (!kind) continue;

      items.push({
        id: `intake:${row.id}`,
        source: "intake",
        part: "record",
        entityType: "intake_submission",
        entityId: row.id,
        // The Submissions list names a row by its submitter; "" is anonymous.
        name: row.submitter_name || row.submitter_email || "",
        url: `/intake-forms/submissions?submission=${row.id}`,
        dueDate: null,
        waitingSince:
          kind === "second-review"
            ? toIso(row.routing?.secondReview?.selectedAt)
            : toIso(row.created_at),
        overdue: false,
        meta: { kind, formName: row.form_name, lane: row.routing?.lane ?? null },
      });
    }
    return items;
  },
};
