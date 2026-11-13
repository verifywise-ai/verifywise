import { Request, Response } from "express";
import { STATUS_CODE } from "../../utils/statusCode.utils";
import { translateError } from "../../utils/i18n.utils";
import { logFailure, logProcessing, logSuccess } from "../../utils/logger/logHelper";
import { CustomException } from "../../domain.layer/exceptions/custom.exception";
import {
  buildExcelTemplate,
  deleteImportedFrameworkQuery,
  importFramework,
  listImportedFrameworksQuery,
  updateImportedFrameworkQuery,
  FrameworkImportRow,
  ImportedFrameworkPatch,
} from "./frameworkImport.service";

const fileName = "frameworkImport.ctrl.ts";

function statusOf(error: unknown): number {
  return error instanceof CustomException ? error.statusCode : 500;
}

/** A positive safe-integer route id, or null ("12abc", "-1", "1e3" are all rejected). */
export function parseFrameworkId(raw: unknown): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export async function downloadExcelTemplate(req: Request, res: Response): Promise<void> {
  const organizationId = (req as any).organizationId as number;
  const userId = (req as any).userId as number;
  logProcessing({
    description: "starting downloadExcelTemplate (framework-import)",
    functionName: "downloadExcelTemplate",
    fileName,
    userId,
    organizationId,
  });
  try {
    const { buffer, filename } = await buildExcelTemplate(organizationId);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(buffer);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to build framework-import Excel template",
      functionName: "downloadExcelTemplate",
      fileName,
      userId,
      organizationId,
      error: error as Error,
    });
    res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function bulkImportFrameworks(req: Request, res: Response): Promise<any> {
  const organizationId = (req as any).organizationId as number;
  const userId = (req as any).userId as number;
  const csvData = (req.body?.csvData ?? []) as FrameworkImportRow[];

  if (!Array.isArray(csvData)) {
    return res
      .status(400)
      .json(STATUS_CODE[400](req.t!("csvData is required and must be an array")));
  }
  if (csvData.length === 0) {
    return res.status(400).json(STATUS_CODE[400](req.t!("No rows to import")));
  }
  if (!csvData.every((row) => typeof row === "object" && row !== null && !Array.isArray(row))) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Every row must be an object")));
  }

  logProcessing({
    description: `starting bulkImportFrameworks with ${csvData.length} rows`,
    functionName: "bulkImportFrameworks",
    fileName,
    userId,
    organizationId,
  });

  try {
    const result = await importFramework(csvData, organizationId, userId);
    // Validation-only failure = 400 (client error), same contract as risk-import.
    // The body still carries the full result (errors per row) under `data`;
    // the client repository unwraps it so the modal can list them.
    const status = result.success ? 200 : 400;
    if (result.success) {
      await logSuccess({
        eventType: "Create",
        description: `imported framework structure (${result.imported_topics} topics, ${result.imported_subtopics} subtopics)`,
        functionName: "bulkImportFrameworks",
        fileName,
        userId,
        organizationId,
      });
    }
    return res.status(status).json(STATUS_CODE[status](result));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "framework-import failed",
      functionName: "bulkImportFrameworks",
      fileName,
      userId,
      organizationId,
      error: error as Error,
    });
    return res
      .status(statusOf(error))
      .json((STATUS_CODE as any)[statusOf(error)](translateError(req, error)));
  }
}

export async function listImportedFrameworks(req: Request, res: Response): Promise<any> {
  const organizationId = (req as any).organizationId as number;
  const userId = (req as any).userId as number;
  logProcessing({
    description: "starting listImportedFrameworks",
    functionName: "listImportedFrameworks",
    fileName,
    userId,
    organizationId,
  });
  try {
    const frameworks = await listImportedFrameworksQuery(organizationId);
    return res.status(200).json(STATUS_CODE[200](frameworks));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to list imported frameworks",
      functionName: "listImportedFrameworks",
      fileName,
      userId,
      organizationId,
      error: error as Error,
    });
    return res
      .status(statusOf(error))
      .json((STATUS_CODE as any)[statusOf(error)](translateError(req, error)));
  }
}

export async function updateImportedFramework(req: Request, res: Response): Promise<any> {
  const organizationId = (req as any).organizationId as number;
  const userId = (req as any).userId as number;
  const id = parseFrameworkId(req.params.id);
  if (id === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid framework id")));
  }
  const body = req.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Request body must be an object")));
  }
  const patch = body as ImportedFrameworkPatch;

  logProcessing({
    description: `starting updateImportedFramework for ID ${id}`,
    functionName: "updateImportedFramework",
    fileName,
    userId,
    organizationId,
  });

  try {
    await updateImportedFrameworkQuery(id, organizationId, patch);
    await logSuccess({
      eventType: "Update",
      description: `updated imported framework ID ${id}`,
      functionName: "updateImportedFramework",
      fileName,
      userId,
      organizationId,
    });
    return res.status(200).json(STATUS_CODE[200]({ id }));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: `failed to update imported framework ID ${id}`,
      functionName: "updateImportedFramework",
      fileName,
      userId,
      organizationId,
      error: error as Error,
    });
    return res
      .status(statusOf(error))
      .json((STATUS_CODE as any)[statusOf(error)](translateError(req, error)));
  }
}

export async function deleteImportedFramework(req: Request, res: Response): Promise<any> {
  const organizationId = (req as any).organizationId as number;
  const userId = (req as any).userId as number;
  const id = parseFrameworkId(req.params.id);
  if (id === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid framework id")));
  }

  logProcessing({
    description: `starting deleteImportedFramework for ID ${id}`,
    functionName: "deleteImportedFramework",
    fileName,
    userId,
    organizationId,
  });

  try {
    await deleteImportedFrameworkQuery(id, organizationId);
    await logSuccess({
      eventType: "Delete",
      description: `deleted imported framework ID ${id}`,
      functionName: "deleteImportedFramework",
      fileName,
      userId,
      organizationId,
    });
    return res.status(200).json(STATUS_CODE[200]({ id }));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: `failed to delete imported framework ID ${id}`,
      functionName: "deleteImportedFramework",
      fileName,
      userId,
      organizationId,
      error: error as Error,
    });
    const body = (STATUS_CODE as any)[statusOf(error)](translateError(req, error));
    // In use by use cases: name them so the client can list them.
    const useCases =
      error instanceof CustomException ? (error.metadata?.use_cases as unknown) : undefined;
    if (Array.isArray(useCases)) body.use_cases = useCases;
    return res.status(statusOf(error)).json(body);
  }
}
