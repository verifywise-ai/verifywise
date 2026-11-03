// Servers/services/intakeLiveChecks/prefill.ts
// Vendor document prefill: one model call reads an uploaded PDF or DOCX and
// suggests answers for empty questions. Pure service code: no DB, no routes,
// the file is never stored. A suggestion is kept only when it answers a
// question that was asked, quotes the document verbatim and, for a select,
// names a real option. Each kept suggestion carries a signed token so the
// submit step can tell a document-backed answer from one the client made up.
import { extname } from "path";
import { z } from "zod";
import type { GenerateObjectImpl } from "../../advisor/llmSelfCorrect";
import type { PrefillProvenance } from "../../domain.layer/interfaces/i.intakeLiveChecks";
import { createSignedToken, verifySignedToken } from "../../utils/signedToken.utils";
import { extractText, normalizeText } from "../fileIngestion/textExtractor";
import { evaluateForm, isEmptyAnswer, sortFields, type LogicSchema } from "../intakeFormLogic";
import type { FormSchema } from "../intakeRiskScoring.service";
import { newDelimiterNonce } from "../intakeScoring/prompts";
import { toLiveCheckLanguage, type LiveCheckLanguage } from "./aiChecks";
import { isDocxWithinLimits } from "./docxGuard";
import { callModelOnce, MIN_EXCERPT_CHARS, normaliseForMatch } from "./modelCall";
import {
  buildPrefillSystemPrompt,
  buildPrefillUserPrompt,
  type PrefillPromptQuestion,
} from "./prompts";

export const PREFILL_MAX_BYTES = 10 * 1024 * 1024;
export const PREFILL_MAX_CHARS = 60_000;
export const PREFILL_TIMEOUT_MS = 30_000;
export const PREFILL_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Extraction gets at most this much of the 30 second budget. */
export const PREFILL_EXTRACT_TIMEOUT_MS = 15_000;
export const PREFILL_MIN_EXCERPT_CHARS = MIN_EXCERPT_CHARS;

const TOKEN_KIND = "intake_prefill";
const MAX_FILE_NAME_CHARS = 200;
const MAX_LOCATION_CHARS = 100;
const MAX_EXCERPT_CHARS = 500;
/** Same per-answer cap as the scoring input (MAX_ANSWER_CHARS); kept local so this module stays free of the DB-bound scoring service. */
const MAX_VALUE_CHARS = 2000;
/** Tokens are checked on the server that may not have issued them. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/** C0 and C1 controls and bidi marks, embeddings, overrides and isolates. */
const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const stripUnsafe = (value: string): string => value.replace(UNSAFE_CHARS, "");

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MAGIC = Buffer.from("%PDF-", "ascii");
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const ALLOWED_TYPES: ReadonlyArray<{ ext: string; mimetype: string; magic: Buffer }> = [
  { ext: ".pdf", mimetype: PDF_MIME, magic: PDF_MAGIC },
  { ext: ".docx", mimetype: DOCX_MIME, magic: ZIP_MAGIC },
];

const PREFILL_TYPES = ["text", "textarea", "select"] as const;
type PrefillType = (typeof PREFILL_TYPES)[number];

export interface PrefillFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

export interface PrefillSuggestion {
  questionId: string;
  value: string;
  location: string;
  excerpt: string;
  token: string;
}

export type PrefillOutcome =
  | { ok: true; fileName: string; suggestions: PrefillSuggestion[] }
  | { ok: false; reason: "unreadable" | "model_failed" };

interface PrefillTokenPayload {
  kind: typeof TOKEN_KIND;
  formId: number;
  questionId: string;
  value: string;
  fileName: string;
  location: string;
  excerpt: string;
  issuedAt: number;
}

/** PDF or DOCX by extension, mimetype and the file's own first bytes; 10 MB at most. */
export function isAllowedPrefillFile(file: PrefillFile): boolean {
  if (!file || !Buffer.isBuffer(file.buffer)) return false;
  const size = file.buffer.length;
  if (size === 0 || size > PREFILL_MAX_BYTES) return false;
  const ext = extname(String(file.originalname ?? "")).toLowerCase();
  const type = ALLOWED_TYPES.find((t) => t.ext === ext && t.mimetype === file.mimetype);
  return !!type && file.buffer.subarray(0, type.magic.length).equals(type.magic);
}

const isPrefillType = (type: string): type is PrefillType =>
  (PREFILL_TYPES as readonly string[]).includes(type);

function promptQuestions(
  schema: FormSchema,
  data: Record<string, unknown>,
): Array<PrefillPromptQuestion & { type: PrefillType }> {
  // Stored schemas carry the order and visibility rules FormSchema leaves out.
  const logicSchema = schema as unknown as LogicSchema;
  const fields = Array.isArray(logicSchema?.fields) ? logicSchema.fields : [];
  const { visibleIds, effectiveAnswers } = evaluateForm(logicSchema, data ?? {});
  const questions: Array<PrefillPromptQuestion & { type: PrefillType }> = [];
  for (const field of sortFields(fields)) {
    if (!visibleIds.has(field.id) || !isPrefillType(field.type)) continue;
    if (!isEmptyAnswer(effectiveAnswers[field.id])) continue;
    if (field.type !== "select") {
      questions.push({ id: field.id, label: field.label, type: field.type });
      continue;
    }
    const options = (Array.isArray(field.options) ? field.options : []).filter(
      (o) => o && typeof o.value === "string" && o.value !== "",
    );
    // A select with no options cannot take a suggestion.
    if (options.length === 0) continue;
    questions.push({
      id: field.id,
      label: field.label,
      type: "select",
      options: options.map((o) => ({ value: o.value, label: String(o.label ?? o.value) })),
    });
  }
  return questions;
}

/** Visible, empty text, textarea and select questions, in form order, with select option values. */
export function prefillTargets(
  schema: FormSchema,
  data: Record<string, unknown>,
): Array<{ id: string; label: string; type: PrefillType; options?: string[] }> {
  return promptQuestions(schema, data).map((q) => ({
    id: q.id,
    label: q.label,
    type: q.type,
    ...(q.options ? { options: q.options.map((o) => o.value) } : {}),
  }));
}

const prefillOutputSchema = z
  .object({
    suggestions: z
      .array(
        z
          .object({
            questionId: z.string(),
            value: z.string().max(MAX_VALUE_CHARS),
            excerpt: z.string().max(1000),
            // Models often send null for an absent optional field.
            location: z.string().max(200).nullish(),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();

type PrefillOutput = z.infer<typeof prefillOutputSchema>;

function keptSuggestions(
  output: PrefillOutput,
  questions: PrefillPromptQuestion[],
  documentText: string,
): Array<Omit<PrefillSuggestion, "token">> {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const source = normaliseForMatch(documentText);
  const seen = new Set<string>();
  const kept: Array<Omit<PrefillSuggestion, "token">> = [];
  for (const s of output.suggestions) {
    const question = byId.get(s.questionId);
    if (!question || seen.has(s.questionId)) continue;
    const value = s.value.trim();
    // Whitespace collapsed first, so the cap never cuts the quote mid-gap.
    const excerpt = s.excerpt.replace(/\s+/g, " ").trim().slice(0, MAX_EXCERPT_CHARS).trim();
    if (!value || excerpt.length < PREFILL_MIN_EXCERPT_CHARS) continue;
    if (!source.includes(normaliseForMatch(excerpt))) continue;
    if (question.options && !question.options.some((o) => o.value === value)) continue;
    seen.add(s.questionId);
    kept.push({
      questionId: s.questionId,
      value,
      location: stripUnsafe(s.location ?? "")
        .trim()
        .slice(0, MAX_LOCATION_CHARS),
      excerpt,
    });
  }
  return kept;
}

export async function runPrefill(params: {
  formId: number;
  schema: FormSchema;
  data: Record<string, unknown>;
  file: PrefillFile;
  language: LiveCheckLanguage;
  model: unknown;
  generate?: GenerateObjectImpl;
  now?: () => number;
  /** Tests only: a shorter extraction deadline. */
  extractTimeoutMs?: number;
}): Promise<PrefillOutcome> {
  const { formId, schema, data, file, language, model, generate } = params;
  const now = params.now ?? Date.now;
  const startedAt = Date.now();
  if (!isAllowedPrefillFile(file)) return { ok: false, reason: "unreadable" };

  const raw = await extractWithinDeadline(
    file,
    Math.min(params.extractTimeoutMs ?? PREFILL_EXTRACT_TIMEOUT_MS, PREFILL_TIMEOUT_MS),
  );
  const documentText = normalizeText(raw ?? "", PREFILL_MAX_CHARS);
  if (!documentText) return { ok: false, reason: "unreadable" };

  const fileName = stripUnsafe(String(file.originalname)).trim().slice(0, MAX_FILE_NAME_CHARS);
  const questions = promptQuestions(schema, data);
  if (questions.length === 0) return { ok: true, fileName, suggestions: [] };

  const nonce = newDelimiterNonce();
  const result = await callModelOnce({
    model,
    schema: prefillOutputSchema,
    system: buildPrefillSystemPrompt(nonce, toLiveCheckLanguage(language)),
    prompt: buildPrefillUserPrompt(questions, documentText, nonce),
    // Extraction and the model call share one 30 second budget.
    timeoutMs: Math.max(1_000, PREFILL_TIMEOUT_MS - (Date.now() - startedAt)),
    generate,
    logLabel: "intake prefill",
  });
  if (!result.ok) return { ok: false, reason: "model_failed" };

  const issuedAt = now();
  const suggestions = keptSuggestions(result.data, questions, documentText).map((s) => {
    const payload: PrefillTokenPayload = { kind: TOKEN_KIND, formId, ...s, fileName, issuedAt };
    return { ...s, token: createSignedToken({ ...payload }) };
  });
  return { ok: true, fileName, suggestions };
}

/**
 * Text of an allowed file, or null when a DOCX breaks the zip caps, the
 * extractor fails, or the guard and extraction together pass `timeoutMs`.
 * The race bounds the request; it cannot stop a parser already running.
 */
async function extractWithinDeadline(file: PrefillFile, timeoutMs: number): Promise<string | null> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  const work = (async () => {
    if (file.mimetype === DOCX_MIME && !(await isDocxWithinLimits(file.buffer))) return null;
    return extractText(file.buffer, file.mimetype);
  })().catch(() => null);
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The provenance a prefill token vouches for, or null when the token is not a
 * valid, unexpired prefill token for this form and question whose value still
 * matches the submitted answer.
 */
export function verifyPrefillToken(
  token: string,
  formId: number | string,
  questionId: string,
  submittedValue: unknown,
  now: number = Date.now(),
): Omit<PrefillProvenance, "confirmed"> | null {
  if (typeof token !== "string" || token === "") return null;
  const p = verifySignedToken<Partial<PrefillTokenPayload>>(token);
  if (!p || typeof p !== "object" || p.kind !== TOKEN_KIND) return null;
  // Route params arrive as strings.
  const expectedFormId = Number(formId);
  if (!Number.isSafeInteger(expectedFormId) || expectedFormId <= 0) return null;
  if (p.formId !== expectedFormId || p.questionId !== questionId) return null;
  if (
    typeof p.value !== "string" ||
    typeof p.fileName !== "string" ||
    typeof p.location !== "string" ||
    typeof p.excerpt !== "string" ||
    typeof p.issuedAt !== "number" ||
    !Number.isFinite(p.issuedAt)
  ) {
    return null;
  }
  const age = now - p.issuedAt;
  if (age > PREFILL_TOKEN_MAX_AGE_MS || age < -CLOCK_SKEW_MS) return null;
  if (typeof submittedValue !== "string" && typeof submittedValue !== "number") return null;
  if (String(submittedValue).trim() !== p.value.trim()) return null;
  return { fileName: p.fileName, location: p.location, excerpt: p.excerpt };
}
