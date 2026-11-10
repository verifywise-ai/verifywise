import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import logger from "../utils/logger/fileLogger";
import { roleHasPermission } from "../utils/rolePermissions.utils";
import { recordMultipleFieldChanges } from "../utils/changeHistory.base.utils";
import { notifyTrainingAssigned } from "../services/inAppNotification.service";
import {
  completeAllTrainingAssignmentsQuery,
  completeTrainingAssignmentQuery,
  createTrainingAssignmentsQuery,
  deleteTrainingAssignmentQuery,
  getAssignableTrainingQuery,
  getMyTrainingAssignmentsQuery,
  getNonMemberUserIdsQuery,
  getTrainingAssignmentByIdQuery,
  getTrainingAssignmentsQuery,
  getTrainingAssignmentSummaryQuery,
  getUserFullNameQuery,
  reopenTrainingAssignmentQuery,
  updateTrainingAssignmentDueDateQuery,
  type AssignableTraining,
  type TrainingAssignment,
} from "../utils/trainingAssignment.utils";
import {
  parseAssignmentId,
  parseCreateAssignments,
  parseDueDate,
  parseTrainingId,
  parseTrainingIdQuery,
  type Parsed,
} from "../utils/validations/trainingAssignmentValidation.utils";

const FILE = "trainingAssignment.ctrl.ts";

type Outcome =
  | { status: 200 | 201; data: unknown }
  | { status: 400 | 403 | 404; message: string; vars?: Record<string, string | number> };

type LogEvent = "Read" | "Create" | "Update" | "Delete";

const notFound = (message: string): Outcome => ({ status: 404, message });
const invalid = (parsed: Extract<Parsed<unknown>, { ok: false }>): Outcome => ({
  status: 400,
  message: parsed.message,
  vars: parsed.vars,
});

/**
 * Runs one handler: logs it, then sends. Logging happens before the response,
 * because under RLS enforcement a later query would run on the request's
 * finished transaction.
 */
async function handle(
  req: Request,
  res: Response,
  options: { functionName: string; eventType: LogEvent; description: string; failure: string },
  work: () => Promise<Outcome>,
): Promise<Response> {
  const { functionName, eventType, description, failure } = options;
  const context = {
    functionName,
    fileName: FILE,
    userId: req.userId!,
    organizationId: req.organizationId!,
  };
  logProcessing({ description, ...context });

  try {
    const outcome = await work();
    await logSuccess({ eventType, description: `${description}: ${outcome.status}`, ...context });
    if ("data" in outcome) {
      return res.status(outcome.status).json(STATUS_CODE[outcome.status](outcome.data));
    }
    const message = req.t!(outcome.message, outcome.vars);
    return res.status(outcome.status).json(STATUS_CODE[outcome.status](message));
  } catch (error) {
    await logFailure({ eventType, description, error: error as Error, ...context });
    return res.status(500).json(STATUS_CODE[500](req.t!(failure)));
  }
}

const personName = (name: string, surname: string): string => `${name} ${surname}`.trim();

const dateOnly = (value: string): string => new Date(value).toISOString().slice(0, 10);

const describeAssignment = (assignment: TrainingAssignment): string =>
  assignment.completed_at
    ? `Completed on ${dateOnly(assignment.completed_at)}, due ${assignment.due_date}`
    : `Open, due ${assignment.due_date}`;

/**
 * Writes assignment events to the training's change history, so reopening or
 * removing an assignment leaves a record of what it was and who changed it.
 * Ledger entries run one at a time afterwards: an assignment can name 500
 * people, and each ledger append takes a pool connection.
 */
async function recordAssignmentHistory(
  req: Request,
  trainingId: number,
  entries: Array<{ person: string; oldValue: string; newValue: string }>,
): Promise<void> {
  const ledgerAppends: Array<() => void> = [];
  await recordMultipleFieldChanges(
    "training",
    trainingId,
    req.userId!,
    req.organizationId!,
    entries.map(({ person, oldValue, newValue }) => ({
      fieldName: `Assignment: ${person}`,
      oldValue,
      newValue,
    })),
    undefined,
    false,
    (append) => {
      ledgerAppends.push(append);
    },
  );
  void (async () => {
    for (const append of ledgerAppends) await append();
  })();
}

/**
 * An assignment change by its assignee or by anyone who can edit training.
 * The id is checked against the organization first, so a foreign id is a 404
 * and never reveals who it belongs to.
 */
async function changeAsAssigneeOrEditor(
  req: Request,
  change: (existing: TrainingAssignment) => Promise<void>,
): Promise<Outcome> {
  const id = parseAssignmentId(req.params.id);
  if (!id.ok) return invalid(id);

  const existing = await getTrainingAssignmentByIdQuery(id.value, req.organizationId!);
  if (!existing) return notFound("Training assignment not found");

  const allowed =
    existing.user_id === req.userId ||
    (await roleHasPermission(req.organizationId!, req.role!, "training.edit"));
  if (!allowed) {
    return {
      status: 403,
      message: "Only the assignee or someone who can edit training can do this",
    };
  }

  await change(existing);
  const updated = await getTrainingAssignmentByIdQuery(id.value, req.organizationId!);
  return updated ? { status: 200, data: updated } : notFound("Training assignment not found");
}

/**
 * One failed notice never fails the save. These awaits are short: the emails
 * themselves join a queue un-awaited inside notifyTrainingAssigned.
 */
async function notifyAssignees(
  req: Request,
  training: AssignableTraining,
  created: TrainingAssignment[],
): Promise<void> {
  if (created.length === 0) return;
  const organizationId = req.organizationId!;
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  let assignerName = "A colleague";
  try {
    assignerName = (await getUserFullNameQuery(req.userId!)) || assignerName;
  } catch (error) {
    logger.error(`Failed to load the name of training assigner ${req.userId}:`, error);
  }

  for (const assignment of created) {
    try {
      await notifyTrainingAssigned(
        organizationId,
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

export async function listTrainingAssignments(req: Request, res: Response) {
  return handle(
    req,
    res,
    {
      functionName: "listTrainingAssignments",
      eventType: "Read",
      description: "Listing the assignments of a training",
      failure: "Failed to load training assignments",
    },
    async () => {
      const trainingId = parseTrainingIdQuery(req.query.training_id);
      if (!trainingId.ok) return invalid(trainingId);
      const training = await getAssignableTrainingQuery(trainingId.value, req.organizationId!);
      if (!training) return notFound("Training not found");
      const data = await getTrainingAssignmentsQuery(trainingId.value, req.organizationId!);
      return { status: 200, data };
    },
  );
}

export async function listMyTrainingAssignments(req: Request, res: Response) {
  return handle(
    req,
    res,
    {
      functionName: "listMyTrainingAssignments",
      eventType: "Read",
      description: `Listing training assignments of user ID ${req.userId}`,
      failure: "Failed to load training assignments",
    },
    async () => ({
      status: 200,
      data: await getMyTrainingAssignmentsQuery(req.userId!, req.organizationId!),
    }),
  );
}

export async function getTrainingAssignmentSummary(req: Request, res: Response) {
  return handle(
    req,
    res,
    {
      functionName: "getTrainingAssignmentSummary",
      eventType: "Read",
      description: "Loading the training assignment summary",
      failure: "Failed to load training assignments",
    },
    async () => ({
      status: 200,
      data: await getTrainingAssignmentSummaryQuery(req.organizationId!),
    }),
  );
}

export async function createTrainingAssignments(req: Request, res: Response) {
  return handle(
    req,
    res,
    {
      functionName: "createTrainingAssignments",
      eventType: "Create",
      description: "Creating training assignments",
      failure: "Failed to create training assignments",
    },
    async () => {
      const input = parseCreateAssignments(req.body);
      if (!input.ok) return invalid(input);
      const { training_id: trainingId, user_ids: userIds, due_date: dueDate } = input.value;

      const training = await getAssignableTrainingQuery(trainingId, req.organizationId!);
      if (!training) return notFound("Training not found");

      const nonMembers = await getNonMemberUserIdsQuery(userIds, req.organizationId!);
      if (nonMembers.length > 0) {
        return { status: 400, message: "Every person must be a member of this organization" };
      }

      const { created, skippedUserIds } = await createTrainingAssignmentsQuery(
        { trainingId, userIds, dueDate, assignedBy: req.userId! },
        req.organizationId!,
      );
      await recordAssignmentHistory(
        req,
        trainingId,
        created.map((assignment) => ({
          person: personName(assignment.user_name, assignment.user_surname),
          oldValue: "-",
          newValue: `Assigned, due ${assignment.due_date}`,
        })),
      );
      await notifyAssignees(req, training, created);
      return { status: 201, data: { created, skipped_user_ids: skippedUserIds } };
    },
  );
}

export async function completeAllTrainingAssignments(req: Request, res: Response) {
  return handle(
    req,
    res,
    {
      functionName: "completeAllTrainingAssignments",
      eventType: "Update",
      description: "Completing all assignments of a training",
      failure: "Failed to update the training assignment",
    },
    async () => {
      const trainingId = parseTrainingId(req.body?.training_id);
      if (!trainingId.ok) return invalid(trainingId);
      const training = await getAssignableTrainingQuery(trainingId.value, req.organizationId!);
      if (!training) return notFound("Training not found");
      const completed = await completeAllTrainingAssignmentsQuery(
        trainingId.value,
        req.userId!,
        req.organizationId!,
      );
      await recordAssignmentHistory(
        req,
        trainingId.value,
        completed.map(({ name, surname, due_date: dueDate }) => ({
          person: personName(name, surname),
          oldValue: `Open, due ${dueDate}`,
          newValue: "Completed",
        })),
      );
      return { status: 200, data: { completed: completed.length } };
    },
  );
}

export async function updateTrainingAssignment(req: Request, res: Response) {
  return handle(
    req,
    res,
    {
      functionName: "updateTrainingAssignment",
      eventType: "Update",
      description: "Updating a training assignment",
      failure: "Failed to update the training assignment",
    },
    async () => {
      const id = parseAssignmentId(req.params.id);
      if (!id.ok) return invalid(id);
      const dueDate = parseDueDate(req.body?.due_date);
      if (!dueDate.ok) return invalid(dueDate);

      const existing = await getTrainingAssignmentByIdQuery(id.value, req.organizationId!);
      if (!existing) return notFound("Training assignment not found");

      await updateTrainingAssignmentDueDateQuery(id.value, dueDate.value, req.organizationId!);
      if (dueDate.value !== existing.due_date) {
        await recordAssignmentHistory(req, existing.training_id, [
          {
            person: personName(existing.user_name, existing.user_surname),
            oldValue: `Due ${existing.due_date}`,
            newValue: `Due ${dueDate.value}`,
          },
        ]);
      }
      const updated = await getTrainingAssignmentByIdQuery(id.value, req.organizationId!);
      return updated ? { status: 200, data: updated } : notFound("Training assignment not found");
    },
  );
}

export async function completeTrainingAssignment(req: Request, res: Response) {
  return handle(
    req,
    res,
    {
      functionName: "completeTrainingAssignment",
      eventType: "Update",
      description: "Completing a training assignment",
      failure: "Failed to update the training assignment",
    },
    () =>
      changeAsAssigneeOrEditor(req, async (existing) => {
        if (existing.completed_at) return;
        await completeTrainingAssignmentQuery(existing.id, req.userId!, req.organizationId!);
        await recordAssignmentHistory(req, existing.training_id, [
          {
            person: personName(existing.user_name, existing.user_surname),
            oldValue: describeAssignment(existing),
            newValue: "Completed",
          },
        ]);
      }),
  );
}

export async function reopenTrainingAssignment(req: Request, res: Response) {
  return handle(
    req,
    res,
    {
      functionName: "reopenTrainingAssignment",
      eventType: "Update",
      description: "Reopening a training assignment",
      failure: "Failed to update the training assignment",
    },
    () =>
      changeAsAssigneeOrEditor(req, async (existing) => {
        if (!existing.completed_at) return;
        await reopenTrainingAssignmentQuery(existing.id, req.organizationId!);
        await recordAssignmentHistory(req, existing.training_id, [
          {
            person: personName(existing.user_name, existing.user_surname),
            oldValue: describeAssignment(existing),
            newValue: "Reopened",
          },
        ]);
      }),
  );
}

export async function deleteTrainingAssignment(req: Request, res: Response) {
  return handle(
    req,
    res,
    {
      functionName: "deleteTrainingAssignment",
      eventType: "Delete",
      description: "Deleting a training assignment",
      failure: "Failed to delete the training assignment",
    },
    async () => {
      const id = parseAssignmentId(req.params.id);
      if (!id.ok) return invalid(id);
      const existing = await getTrainingAssignmentByIdQuery(id.value, req.organizationId!);
      if (!existing) return notFound("Training assignment not found");
      await deleteTrainingAssignmentQuery(id.value, req.organizationId!);
      await recordAssignmentHistory(req, existing.training_id, [
        {
          person: personName(existing.user_name, existing.user_surname),
          oldValue: describeAssignment(existing),
          newValue: "Removed",
        },
      ]);
      return { status: 200, data: { id: id.value } };
    },
  );
}
