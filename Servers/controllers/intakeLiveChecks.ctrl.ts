// Servers/controllers/intakeLiveChecks.ctrl.ts
// Public (unauthenticated) AI live checks and vendor-document prefill for an
// intake form. resolvePublicIntakeForm runs first and puts the full active
// form on res.locals.intakeForm; the visitor limiters follow it. Every AI call
// also counts against the form's hourly budget in Redis, which refuses when
// Redis is down. Responses never carry the key id, the provider or a raw
// model error.
import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { createModelFromKey, LLMKeyRow } from "../advisor/llmModelFactory";
import type { ResolvedIntakeForm } from "../middleware/intakePublicForm.middleware";
import {
  isAllowedPrefillFile,
  LIVE_CHECK_TIMEOUT_MS,
  PREFILL_MAX_BYTES,
  runAiChecks,
  runPrefill,
  toLiveCheckLanguage,
} from "../services/intakeLiveChecks";
import { isPlainObject, visibleScoringAnswers } from "../services/intakeLiveChecks/answers";
import { formAiAvailable } from "../services/intakeLiveChecks/availability";
import {
  consumeFormBudget,
  FORM_BUDGET_PER_HOUR,
  type FormBudgetEndpoint,
} from "../services/intakeLiveChecks/formBudget";
import type { FormSchema } from "../services/intakeRiskScoring.service";
import { getLLMKeyWithKeyByIdQuery } from "../utils/llmKey.utils";
import logger from "../utils/logger/fileLogger";
import { translateRequest } from "../utils/i18n.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";

const PREFILL_MODEL_FAILED_MESSAGE =
  "We couldn't read answers from this document. You can fill in the form as usual.";
const PREFILL_UNREADABLE_MESSAGE =
  "We couldn't find any text in this document. It may be a scanned image. You can fill in the form as usual.";
const PREFILL_TOO_LARGE_MESSAGE = "The file is larger than 10 MB.";
const PREFILL_WRONG_TYPE_MESSAGE = "Only PDF and Word (.docx) files can be read.";
const PREFILL_NO_FILE_MESSAGE = "Attach a PDF or Word (.docx) file.";
const PREFILL_BAD_UPLOAD_MESSAGE = "The upload could not be read.";
const PREFILL_NOT_AVAILABLE_MESSAGE = "Document prefill is not available for this form";
const PREFILL_ERROR_MESSAGE =
  "Something went wrong reading this document. You can fill in the form as usual.";
const DATA_NOT_OBJECT_MESSAGE = "Form data must be an object";
const BUDGET_MESSAGES: Record<FormBudgetEndpoint, string> = {
  checks: "AI checks are paused for this form. Please try again later.",
  prefill: "Reading documents is paused for this form. Please try again later.",
  explain: "Explanations are paused for this form. Please try again later.",
};

const resolvedForm = (res: Response): ResolvedIntakeForm =>
  res.locals.intakeForm as ResolvedIntakeForm;

/** The form's model, or null when live checks are off or the key is gone. */
async function loadFormModel({ form, organizationId }: ResolvedIntakeForm): Promise<unknown> {
  if (!form.liveChecksEnabled || form.llmKeyId == null) return null;
  const row = await getLLMKeyWithKeyByIdQuery(form.llmKeyId, organizationId);
  return row ? createModelFromKey(row as unknown as LLMKeyRow) : null;
}

/** Counts one call against the form's hourly budget; answers 429 and returns false when spent. */
async function spendFormBudget(
  req: Request,
  res: Response,
  formId: number,
  endpoint: FormBudgetEndpoint,
): Promise<boolean> {
  if (await consumeFormBudget(formId, endpoint, FORM_BUDGET_PER_HOUR[endpoint])) return true;
  // The budget is per clock hour; tell the page how long to stay quiet.
  const secondsToNextHour = 3600 - (Math.floor(Date.now() / 1000) % 3600);
  res.set("Retry-After", String(secondsToNextHour));
  res.set("RateLimit-Reset", String(secondsToNextHour));
  res.status(429).json(STATUS_CODE[429](translateRequest(req, BUDGET_MESSAGES[endpoint])));
  return false;
}

// ============================================================================
// LIVE CHECKS
// ============================================================================

/** POST .../live-checks — body `{ data, language }` → `{ aiAvailable, hints, error? }`. */
export async function postPublicLiveChecks(req: Request, res: Response) {
  const resolved = resolvedForm(res);
  const data = req.body?.data;
  if (!isPlainObject(data)) {
    return res.status(400).json(STATUS_CODE[400](translateRequest(req, DATA_NOT_OBJECT_MESSAGE)));
  }

  try {
    const model = await loadFormModel(resolved);
    if (!model) return res.status(200).json(STATUS_CODE[200]({ aiAvailable: false, hints: [] }));

    const answers = visibleScoringAnswers(resolved.form.schema, data);
    if (answers.length === 0) {
      return res.status(200).json(STATUS_CODE[200]({ aiAvailable: true, hints: [] }));
    }
    if (!(await spendFormBudget(req, res, resolved.form.id, "checks"))) return res;

    const result = await runAiChecks({
      answers,
      language: toLiveCheckLanguage(req.body?.language),
      model,
      timeoutMs: LIVE_CHECK_TIMEOUT_MS,
    });
    if (!result.ok) {
      return res
        .status(200)
        .json(STATUS_CODE[200]({ aiAvailable: true, hints: [], error: "unavailable" }));
    }
    return res.status(200).json(STATUS_CODE[200]({ aiAvailable: true, hints: result.hints }));
  } catch (error) {
    // The message only: never the answers or the key.
    logger.error(
      `Error in postPublicLiveChecks for form ${resolved.form.id}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return res
      .status(200)
      .json(STATUS_CODE[200]({ aiAvailable: true, hints: [], error: "unavailable" }));
  }
}

// ============================================================================
// VENDOR DOCUMENT PREFILL
// ============================================================================

/** 404 before the upload is read when the form cannot make AI calls. */
export async function requirePrefillAvailable(req: Request, res: Response, next: NextFunction) {
  const { form, organizationId } = resolvedForm(res);
  try {
    if (await formAiAvailable(form, organizationId)) return next();
    return res
      .status(404)
      .json(STATUS_CODE[404](translateRequest(req, PREFILL_NOT_AVAILABLE_MESSAGE)));
  } catch (error) {
    logger.error(`Error checking prefill availability for form ${form.id}`, error);
    return res.status(500).json(STATUS_CODE[500](translateRequest(req, PREFILL_ERROR_MESSAGE)));
  }
}

/**
 * Largest `data` text field (the current answers as JSON) a prefill upload may
 * carry: the JSON body limit in app.ts, so answers live checks accept never
 * fail an upload.
 */
const PREFILL_DATA_MAX_BYTES = 10 * 1024 * 1024;

// Held in memory only: the document is never written to disk or the database.
const prefillUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PREFILL_MAX_BYTES, files: 1, fields: 2, fieldSize: PREFILL_DATA_MAX_BYTES },
}).single("file");

/** Multipart parsing for prefill: 413 over 10 MB, 400 for any other upload error. */
export function receivePrefillUpload(req: Request, res: Response, next: NextFunction) {
  prefillUpload(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(413)
        .json(STATUS_CODE[413](translateRequest(req, PREFILL_TOO_LARGE_MESSAGE)));
    }
    logger.warn(
      `Prefill upload refused: ${err instanceof multer.MulterError ? err.code : "parse error"}`,
    );
    return res
      .status(400)
      .json(STATUS_CODE[400](translateRequest(req, PREFILL_BAD_UPLOAD_MESSAGE)));
  });
}

/** The `data` text field as an answers object; undefined when it is not one. */
function parsePrefillData(raw: unknown): Record<string, unknown> | undefined {
  if (raw === undefined || raw === "") return {};
  if (typeof raw !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** POST .../prefill — multipart `file`, `data`, `language` → `{ fileName, suggestions }`. */
export async function postPublicPrefill(req: Request, res: Response) {
  const resolved = resolvedForm(res);
  const file = req.file;
  if (!file)
    return res.status(400).json(STATUS_CODE[400](translateRequest(req, PREFILL_NO_FILE_MESSAGE)));
  if (file.buffer.length === 0) {
    return res
      .status(422)
      .json(STATUS_CODE[422](translateRequest(req, PREFILL_UNREADABLE_MESSAGE)));
  }
  const prefillFile = {
    originalname: file.originalname,
    mimetype: file.mimetype,
    buffer: file.buffer,
  };
  if (!isAllowedPrefillFile(prefillFile)) {
    return res
      .status(415)
      .json(STATUS_CODE[415](translateRequest(req, PREFILL_WRONG_TYPE_MESSAGE)));
  }
  const data = parsePrefillData(req.body?.data);
  if (!data)
    return res.status(400).json(STATUS_CODE[400](translateRequest(req, DATA_NOT_OBJECT_MESSAGE)));

  try {
    const model = await loadFormModel(resolved);
    if (!model) {
      return res
        .status(404)
        .json(STATUS_CODE[404](translateRequest(req, PREFILL_NOT_AVAILABLE_MESSAGE)));
    }
    if (!(await spendFormBudget(req, res, resolved.form.id, "prefill"))) return res;

    const outcome = await runPrefill({
      formId: resolved.form.id,
      schema: resolved.form.schema as unknown as FormSchema,
      data,
      file: prefillFile,
      language: toLiveCheckLanguage(req.body?.language),
      model,
    });
    if (!outcome.ok) {
      return outcome.reason === "unreadable"
        ? res.status(422).json(STATUS_CODE[422](translateRequest(req, PREFILL_UNREADABLE_MESSAGE)))
        : res
            .status(502)
            .json(STATUS_CODE[502](translateRequest(req, PREFILL_MODEL_FAILED_MESSAGE)));
    }
    return res
      .status(200)
      .json(STATUS_CODE[200]({ fileName: outcome.fileName, suggestions: outcome.suggestions }));
  } catch (error) {
    logger.error(
      `Error in postPublicPrefill for form ${resolved.form.id}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return res.status(500).json(STATUS_CODE[500](translateRequest(req, PREFILL_ERROR_MESSAGE)));
  }
}
