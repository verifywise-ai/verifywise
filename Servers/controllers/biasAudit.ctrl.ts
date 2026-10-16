/**
 * Bias audit (NYC Local Law 144) controller.
 *
 * Thin by design: each handler validates the request shape and hands off to
 * services/biasAudit. The organization is always the caller's
 * (`req.organizationId`), never a value from the body or query. Expected
 * refusals arrive as CustomExceptions and are answered with their own status
 * by controllerWrapper: not found 404, invalid input 400, a conflict 409, an
 * export the gates withhold 422, a stance file that is gone 410.
 */
import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { controllerWrapper } from "../utils/controllerWrapper.utils";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import {
  isCustomException,
  NotFoundException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";
import {
  attestProfile as attestProfileService,
  getApplicableQuestions,
  getProfileView,
  saveAnswers,
  type AnswerInput,
} from "../services/biasAudit/profileService";
import {
  confirmDerivedBasis as confirmDerivedBasisService,
  createRun as createRunService,
  getRunView,
  getTrendRows,
  listRuns as listRunsService,
} from "../services/biasAudit/runService";
import {
  generateStance as generateStanceService,
  getStanceDownload,
} from "../services/biasAudit/stanceService";
import { nycLocalLaw144Structure } from "../structures/NYC-Local-Law-144/nyc-local-law-144.structure";

const FILE_NAME = "biasAudit.ctrl.ts";

/** The one framework this module serves. */
export const LL144_FRAMEWORK_ID = nycLocalLaw144Structure.id;

/** Upload limit for a dataset, matching the shared upload default. */
export const DATASET_MAX_BYTES = 30 * 1024 * 1024;

// ----------------------------------------------------------- validation

function positiveInt(raw: unknown, field: string): number {
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (typeof text === "number" && Number.isSafeInteger(text) && text > 0) return text;
  if (typeof text !== "string" || !/^\d+$/.test(text)) {
    throw new ValidationException(`${field} must be a positive whole number`, field, raw);
  }
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new ValidationException(`${field} must be a positive whole number`, field, raw);
  }
  return n;
}

function frameworkId(raw: unknown): number {
  const id = positiveInt(raw, "frameworkId");
  if (id !== LL144_FRAMEWORK_ID) {
    throw new NotFoundException(
      `The bias audit module covers NYC Local Law 144 (framework ${LL144_FRAMEWORK_ID}) only`,
      "Framework",
      id,
    );
  }
  return id;
}

/** The caller, for the project-member rule the services enforce. */
function viewerOf(req: Request) {
  return { userId: req.userId!, role: req.role ?? "" };
}

function projectScope(projectRaw: unknown, frameworkRaw: unknown, req: Request) {
  return {
    projectId: positiveInt(projectRaw, "projectId"),
    frameworkId: frameworkId(frameworkRaw),
    organizationId: req.organizationId!,
  };
}

/** A project scope plus the caller, for endpoints limited to project members. */
function memberScope(projectRaw: unknown, frameworkRaw: unknown, req: Request) {
  return { ...projectScope(projectRaw, frameworkRaw, req), ...viewerOf(req) };
}

const isNullableString = (v: unknown) => v === null || typeof v === "string";

/** Shape only; option membership and notes rules are the service's. */
function parseAnswers(raw: unknown): AnswerInput[] {
  if (!Array.isArray(raw)) {
    throw new ValidationException("answers must be an array", "answers", raw);
  }
  return raw.map((a, i) => {
    const ok =
      a !== null &&
      typeof a === "object" &&
      typeof a.questionKey === "string" &&
      a.questionKey !== "" &&
      isNullableString(a.value ?? null) &&
      isNullableString(a.notes ?? null) &&
      typeof a.dontKnow === "boolean";
    if (!ok) {
      throw new ValidationException(
        `answers[${i}] must have a questionKey, a text or null value, text or null notes, and a true or false dontKnow`,
        `answers[${i}]`,
      );
    }
    return {
      questionKey: a.questionKey,
      value: a.value ?? null,
      notes: a.notes ?? null,
      dontKnow: a.dontKnow,
    };
  });
}

/**
 * The column mapping arrives as a JSON string in the multipart body. Every
 * value must name a column, and no column may stand for two keys: a column
 * read as both sex and race would produce figures for neither.
 */
function parseMapping(raw: unknown): Record<string, string> {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new ValidationException("mapping must be a JSON object", "mapping");
    }
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationException("mapping must be a JSON object", "mapping");
  }
  const mapping: Record<string, string> = {};
  const byColumn = new Map<string, string>();
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== "string" || raw.trim() === "") {
      throw new ValidationException(
        `mapping.${key} must name a column of the file`,
        `mapping.${key}`,
      );
    }
    // The parser trims header names before matching, so "Gender " and
    // "Gender" are the same column and are compared that way here.
    const column = raw.trim();
    const prior = byColumn.get(column);
    if (prior !== undefined) {
      throw new ValidationException(
        `"${prior}" and "${key}" are both mapped to the column "${column}". Map each to its own column.`,
        "mapping",
      );
    }
    byColumn.set(column, key);
    mapping[key] = column;
  }
  return mapping;
}

// ---------------------------------------------------------------- intake

export const getQuestions = controllerWrapper(
  async (req) => ({
    status: 200,
    data: await getApplicableQuestions(
      memberScope(req.query.projectId, req.params.frameworkId, req),
    ),
  }),
  { functionName: "getQuestions", fileName: FILE_NAME, eventType: "Read" },
);

export const getProfile = controllerWrapper(
  async (req) => ({
    status: 200,
    data: await getProfileView(memberScope(req.params.projectId, req.params.frameworkId, req)),
  }),
  { functionName: "getProfile", fileName: FILE_NAME, eventType: "Read" },
);

export const saveProfileAnswers = controllerWrapper(
  async (req) => {
    const scope = memberScope(req.params.projectId, req.params.frameworkId, req);
    const answers = parseAnswers(req.body?.answers);
    return { status: 200, data: await saveAnswers({ ...scope, answers }) };
  },
  {
    functionName: "saveProfileAnswers",
    fileName: FILE_NAME,
    eventType: "Update",
    successDescription: (r) => `Saved bias audit profile answers (version ${r?.version})`,
  },
);

export const attestProfile = controllerWrapper(
  async (req) => {
    const scope = memberScope(req.params.projectId, req.params.frameworkId, req);
    return { status: 200, data: await attestProfileService(scope) };
  },
  {
    functionName: "attestProfile",
    fileName: FILE_NAME,
    eventType: "Update",
    successDescription: (r) => `Attested bias audit profile version ${r?.version}`,
  },
);

// ------------------------------------------------------------------ runs

export const createRun = controllerWrapper(
  async (req) => {
    const scope = memberScope(req.body?.projectId, req.body?.frameworkId, req);
    const file = (req as Request & { file?: { buffer: Buffer } }).file;
    if (!file?.buffer) {
      throw new ValidationException("Attach the dataset as a CSV file in the field 'file'", "file");
    }
    const mapping = parseMapping(req.body?.mapping);
    const result = await createRunService({
      ...scope,
      data: file.buffer,
      mapping,
    });
    return { status: 201, data: result };
  },
  {
    functionName: "createRun",
    fileName: FILE_NAME,
    eventType: "Create",
    successDescription: (r) => `Recorded bias audit run ${r?.runId}`,
  },
);

export const listRuns = controllerWrapper(
  async (req) => ({
    status: 200,
    data: await listRunsService(memberScope(req.query.projectId, req.query.frameworkId, req)),
  }),
  { functionName: "listRuns", fileName: FILE_NAME, eventType: "Read" },
);

export const getRunTrend = controllerWrapper(
  async (req) => ({
    status: 200,
    data: await getTrendRows(memberScope(req.query.projectId, req.query.frameworkId, req)),
  }),
  { functionName: "getRunTrend", fileName: FILE_NAME, eventType: "Read" },
);

export const getRun = controllerWrapper(
  async (req) => ({
    status: 200,
    data: await getRunView(positiveInt(req.params.id, "id"), req.organizationId!, viewerOf(req)),
  }),
  { functionName: "getRun", fileName: FILE_NAME, eventType: "Read" },
);

export const confirmDerivedBasis = controllerWrapper(
  async (req) => ({
    status: 200,
    data: await confirmDerivedBasisService(
      positiveInt(req.params.id, "id"),
      req.organizationId!,
      viewerOf(req),
    ),
  }),
  {
    functionName: "confirmDerivedBasis",
    fileName: FILE_NAME,
    eventType: "Update",
    successDescription: (r) => `Confirmed the derived data basis of bias audit run ${r?.runId}`,
  },
);

// --------------------------------------------------------------- stances

export const generateStance = controllerWrapper(
  async (req) => ({
    status: 201,
    data: await generateStanceService({
      runId: positiveInt(req.params.id, "id"),
      organizationId: req.organizationId!,
      ...viewerOf(req),
    }),
  }),
  {
    functionName: "generateStance",
    fileName: FILE_NAME,
    eventType: "Create",
    successDescription: (r) => `Generated bias audit stance ${r?.stanceId} (version ${r?.version})`,
  },
);

/** Sends bytes, so it cannot use controllerWrapper's JSON response. */
export async function downloadStance(req: Request, res: Response): Promise<Response> {
  const functionName = "downloadStance";
  const log = {
    functionName,
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  };
  logProcessing({ ...log, description: "starting downloadStance" });
  try {
    const stanceId = positiveInt(req.params.id, "id");
    const pdf = await getStanceDownload(stanceId, req.organizationId!, viewerOf(req));
    await logSuccess({ ...log, eventType: "Read", description: `Downloaded stance ${stanceId}` });
    const safeName = pdf.filename.replace(/[^\w.-]/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    res.setHeader("X-Content-SHA256", pdf.sha256);
    return res.status(200).send(pdf.content);
  } catch (error) {
    await logFailure({
      ...log,
      eventType: "Read",
      description: "downloadStance failed",
      error: error as Error,
    });
    if (isCustomException(error)) {
      const status = error.statusCode as 400 | 404 | 409 | 410 | 422;
      return res.status(status).json(STATUS_CODE[status](error.message));
    }
    // The detail is in the failure log above; the client gets a generic answer.
    return res.status(500).json(STATUS_CODE[500](req.t!("Internal server error")));
  }
}

// ---------------------------------------------------------------- upload

/** Maps upload errors from multer to client errors; anything else passes on. */
export function handleDatasetUploadError(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): Response | void {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(413)
        .json(STATUS_CODE[413](`The dataset is larger than the 30 MB upload limit.`));
    }
    return res.status(400).json(STATUS_CODE[400](err.message));
  }
  if (err instanceof Error && err.message === "UNSUPPORTED_FILE_TYPE") {
    return res.status(415).json(STATUS_CODE[415]("Upload the dataset as a .csv file."));
  }
  return next(err);
}
