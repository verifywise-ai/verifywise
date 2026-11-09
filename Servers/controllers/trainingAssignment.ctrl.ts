import { Request, Response } from "express";

import { STATUS_CODE } from "../utils/statusCode.utils";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import { translateError } from "../utils/i18n.utils";
import {
  ICreateTrainingAssignmentInput,
  completeAssignmentQuery,
  createAssignmentsQuery,
  deleteAssignmentQuery,
  listAssignmentsQuery,
  statsForTrainingQuery,
} from "../utils/trainingAssignment.utils";

const FILE_NAME = "trainingAssignment.ctrl.ts";

const parseIntParam = (raw: unknown): number => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(value as string, 10);
};

// Map our CustomException subclasses to HTTP status, mirroring the
// customField pattern. Falls back to 500 for unknown errors.
const respondWithError = (req: Request, res: Response, error: unknown): Response => {
  const statusCode =
    error instanceof Error && "statusCode" in error
      ? (error as Error & { statusCode: number }).statusCode
      : 500;
  const statusFn = (STATUS_CODE as any)[statusCode];
  if (typeof statusFn === "function") {
    return res.status(statusCode).json(statusFn((error as Error).message));
  }
  return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
};

// GET / — list assignments, filterable by training_id and status.
export async function listTrainingAssignments(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting listTrainingAssignments",
    functionName: "listTrainingAssignments",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const trainingId = req.query.training_id ? parseIntParam(req.query.training_id) : undefined;
    const status = req.query.status as "pending" | "completed" | "overdue" | undefined;
    const assignments = await listAssignmentsQuery(req.organizationId!, {
      trainingId: trainingId && !Number.isNaN(trainingId) ? trainingId : undefined,
      status,
    });
    await logSuccess({
      eventType: "Read",
      description: `Retrieved ${assignments.length} training assignments`,
      functionName: "listTrainingAssignments",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](assignments));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to list training assignments",
      functionName: "listTrainingAssignments",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

// POST / — bulk-create assignments.
export async function createTrainingAssignments(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting createTrainingAssignments",
    functionName: "createTrainingAssignments",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const assignments = (req.body?.assignments ?? []) as ICreateTrainingAssignmentInput[];
    const result = await createAssignmentsQuery(
      assignments,
      req.organizationId!,
      req.userId ?? null,
    );
    await logSuccess({
      eventType: "Create",
      description: `Created ${result.created.length} training assignments (${result.errors.length} failed)`,
      functionName: "createTrainingAssignments",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(201).json(STATUS_CODE[201](result));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "Failed to create training assignments",
      functionName: "createTrainingAssignments",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

// POST /:id/complete — mark one assignment completed (idempotent).
export async function completeTrainingAssignment(req: Request, res: Response): Promise<any> {
  const id = parseIntParam(req.params.id);

  logProcessing({
    description: `starting completeTrainingAssignment for ID ${id}`,
    functionName: "completeTrainingAssignment",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const assignment = await completeAssignmentQuery(id, req.organizationId!);
    await logSuccess({
      eventType: "Update",
      description: `Completed training assignment ${id}`,
      functionName: "completeTrainingAssignment",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](assignment));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "Failed to complete training assignment",
      functionName: "completeTrainingAssignment",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

// DELETE /:id — remove an assignment.
export async function deleteTrainingAssignment(req: Request, res: Response): Promise<any> {
  const id = parseIntParam(req.params.id);

  logProcessing({
    description: `starting deleteTrainingAssignment for ID ${id}`,
    functionName: "deleteTrainingAssignment",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const deleted = await deleteAssignmentQuery(id, req.organizationId!);
    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404]({}));
    }
    await logSuccess({
      eventType: "Delete",
      description: `Deleted training assignment ${id}`,
      functionName: "deleteTrainingAssignment",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(202).json(STATUS_CODE[202]({ id }));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: "Failed to delete training assignment",
      functionName: "deleteTrainingAssignment",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

// GET /stats — pending/completed/overdue counts for a training or the org.
export async function getTrainingAssignmentStats(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getTrainingAssignmentStats",
    functionName: "getTrainingAssignmentStats",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const trainingId = req.query.training_id ? parseIntParam(req.query.training_id) : undefined;
    const stats = await statsForTrainingQuery(
      req.organizationId!,
      trainingId && !Number.isNaN(trainingId) ? trainingId : undefined,
    );
    await logSuccess({
      eventType: "Read",
      description: `Computed training assignment stats (training=${stats.training_id ?? "all"})`,
      functionName: "getTrainingAssignmentStats",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](stats));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to compute training assignment stats",
      functionName: "getTrainingAssignmentStats",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}
