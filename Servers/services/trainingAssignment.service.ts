/**
 * Assigning a training (#5260), shared by the console (POST
 * /api/v1/training/assignments) and the Advisor's assign tool, so a write from
 * either is the same write: same validation, organization scoping, membership
 * check, change history and notifications.
 *
 * The caller checks training.edit before calling: the console through
 * authorize() on the route, the Advisor in its executor.
 */
import logger from "../utils/logger/fileLogger";
import { recordMultipleFieldChanges } from "../utils/changeHistory.base.utils";
import { notifyTrainingAssigned } from "./inAppNotification.service";
import {
  createTrainingAssignmentsQuery,
  getAssignableTrainingQuery,
  getNonMemberUserIdsQuery,
  getUserFullNameQuery,
  type AssignableTraining,
  type TrainingAssignment,
} from "../utils/trainingAssignment.utils";
import { parseCreateAssignments } from "../utils/validations/trainingAssignmentValidation.utils";

/** Who makes the change, and in which organization. */
export interface TrainingAssignmentActor {
  userId: number;
  organizationId: number;
}

export type AssignTrainingResult =
  | { ok: true; created: TrainingAssignment[]; skippedUserIds: number[] }
  | { ok: false; status: 400 | 404; message: string; vars?: Record<string, string | number> };

export const personName = (name: string, surname: string): string => `${name} ${surname}`.trim();

/**
 * Writes assignment events to the training's change history, so reopening or
 * removing an assignment leaves a record of what it was and who changed it.
 * Ledger entries run one at a time afterwards: an assignment can name 500
 * people, and each ledger append takes a pool connection.
 *
 * The change itself is already saved, so a history failure is logged rather
 * than turned into an error that would hide a completed change.
 */
export async function recordAssignmentHistory(
  actor: TrainingAssignmentActor,
  trainingId: number,
  entries: Array<{ person: string; oldValue: string; newValue: string }>,
): Promise<void> {
  const ledgerAppends: Array<() => void> = [];
  try {
    await recordMultipleFieldChanges(
      "training",
      trainingId,
      actor.userId,
      actor.organizationId,
      entries.map(({ person, oldValue, newValue }) => ({
        // field_name is VARCHAR(255).
        fieldName: `Assignment: ${person}`.slice(0, 255),
        oldValue,
        newValue,
      })),
      undefined,
      false,
      (append) => {
        ledgerAppends.push(append);
      },
    );
  } catch (error) {
    logger.error(`Failed to record assignment history for training ${trainingId}:`, error);
  }
  void (async () => {
    for (const append of ledgerAppends) await append();
  })();
}

/**
 * One failed notice never fails the save. These awaits are short: the emails
 * themselves join a queue un-awaited inside notifyTrainingAssigned.
 */
async function notifyAssignees(
  actor: TrainingAssignmentActor,
  training: AssignableTraining,
  created: TrainingAssignment[],
): Promise<void> {
  if (created.length === 0) return;
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  let assignerName = "A colleague";
  try {
    assignerName = (await getUserFullNameQuery(actor.userId)) || assignerName;
  } catch (error) {
    logger.error(`Failed to load the name of training assigner ${actor.userId}:`, error);
  }

  for (const assignment of created) {
    try {
      await notifyTrainingAssigned(
        actor.organizationId,
        assignment.user_id,
        {
          id: training.id,
          name: training.training_name,
          description: training.description ?? undefined,
          duration: training.duration ?? undefined,
          dueDate: assignment.due_date,
        },
        assignerName,
        baseUrl,
      );
    } catch (error) {
      logger.error(
        `Failed to notify user ${assignment.user_id} about training ${training.id}:`,
        error,
      );
    }
  }
}

/**
 * Assign a training to people of the actor's organization. `input` is the
 * unvalidated request: { training_id, user_ids, due_date }. Refusals carry an
 * English message (a locale key) and its variables. People already assigned
 * keep their row and due date and come back in skippedUserIds.
 */
export async function assignTraining(
  input: Record<string, unknown> | undefined,
  actor: TrainingAssignmentActor,
): Promise<AssignTrainingResult> {
  const parsed = parseCreateAssignments(input);
  if (!parsed.ok) return { ok: false, status: 400, message: parsed.message, vars: parsed.vars };
  const { training_id: trainingId, user_ids: userIds, due_date: dueDate } = parsed.value;

  const training = await getAssignableTrainingQuery(trainingId, actor.organizationId);
  if (!training) return { ok: false, status: 404, message: "Training not found" };

  const nonMembers = await getNonMemberUserIdsQuery(userIds, actor.organizationId);
  if (nonMembers.length > 0) {
    return {
      ok: false,
      status: 400,
      message: "Every person must be a member of this organization",
    };
  }

  const { created, skippedUserIds } = await createTrainingAssignmentsQuery(
    { trainingId, userIds, dueDate, assignedBy: actor.userId },
    actor.organizationId,
  );
  await recordAssignmentHistory(
    actor,
    trainingId,
    created.map((assignment) => ({
      person: personName(assignment.user_name, assignment.user_surname),
      oldValue: "-",
      newValue: `Assigned, due ${assignment.due_date}`,
    })),
  );
  await notifyAssignees(actor, training, created);
  return { ok: true, created, skippedUserIds };
}
