/**
 * @fileoverview Field-level change detection for the framework save routes.
 *
 * The framework drawers save through one route per framework (EU AI Act
 * controls and answers, ISO 42001 / 27001 clauses and annexes, NIST AI RMF
 * subcategories, the 21 bundled frameworks and imported frameworks). The same
 * request carries implementation fields ("framework.edit") and audit fields
 * ("framework.audit"), and the drawers always send the whole form, unchanged
 * fields included. So the permission a save needs depends on which fields it
 * actually changes, not on which fields it carries.
 *
 * Each detector below loads the stored row (scoped to the caller's
 * organization) and compares it with the request using the same write rules
 * as the route's update query: a value that query would skip is not a change.
 * The result says whether the request changes edit fields, audit fields, or
 * both; requireFrameworkWriteAccess turns that into a 403 or a pass.
 *
 * Comparisons are tolerant where the screens are imprecise:
 * - rich text is compared as text (a read-only editor can re-emit stored
 *   text as HTML, e.g. "foo" as "<p>foo</p>");
 * - due dates are compared by calendar day with one day of slack, because
 *   the drawers send dates rendered in the browser's time zone;
 * - an empty status equals the default "Not started" the ISO 27001 drawer
 *   falls back to.
 * Anything the detector cannot parse counts as a change (fail closed).
 *
 * @module utils/frameworkWriteAccess
 */

import { Request } from "express";
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { toId } from "./validations/validation.utils";
import { getImplByIdQuery, ImplLevel } from "./frameworkImpl.utils";
import {
  getImplQuery as getImportedImplQuery,
  parseLevel as parseImportedLevel,
} from "../extensions/framework-import/importedAssessment.service";

export type FrameworkFieldClass = "edit" | "audit";

/** Which classes of field a request changes. */
export interface FrameworkChanges {
  edit: boolean;
  audit: boolean;
}

export type FrameworkChangeDetector = (req: Request) => Promise<FrameworkChanges>;

type Row = Record<string, unknown>;
type RowWithRisks = Row & { risks: number[] };
type UploadedFiles = Array<{ fieldname?: string }>;

const noChanges = (): FrameworkChanges => ({ edit: false, audit: false });

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STATUS = "Not started";

/** Returned by a user-field parser when the update query would skip the value. */
const SKIP = Symbol("skip");
type UserValue = number | null | typeof SKIP;

const isBlank = (value: unknown): boolean => value === undefined || value === null || value === "";

// ── Value normalizers ───────────────────────────────────────────────────────

const decodeEntity = (code: number): string => {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
};

/**
 * Text content of a stored or submitted text field: tags stripped, common
 * entities decoded, whitespace collapsed. "undefined" and "null" (what a form
 * sends for a missing value) read as empty.
 */
export function normalizeText(value: unknown): string {
  if (value === undefined || value === null) return "";
  const raw = String(value);
  if (raw === "undefined" || raw === "null") return "";
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_m, n: string) => decodeEntity(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => decodeEntity(parseInt(n, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[\s ]+/g, " ")
    .trim();
}

/** Calendar day number of a date value; null when blank, NaN when unparsable. */
function dayNumber(value: unknown): number | null {
  if (isBlank(value)) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (Number.isNaN(time)) return NaN;
  return Math.floor(time / DAY_MS);
}

/** Parse a JSON id list; null when it cannot be read (counts as a change). */
export function parseIdList(raw: unknown): number[] | null {
  if (isBlank(raw)) return [];
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (value === null) return [];
  if (!Array.isArray(value)) return null;
  const ids: number[] = [];
  for (const item of value) {
    const id = typeof item === "number" ? item : toId(item);
    if (!Number.isInteger(id)) return null;
    ids.push(id);
  }
  return ids;
}

const uploadedFiles = (req: Request): UploadedFiles => {
  const files = (req as Request & { files?: unknown }).files;
  if (!files) return [];
  if (Array.isArray(files)) return files as UploadedFiles;
  return Object.values(files as Record<string, UploadedFiles>).flat();
};

// ── Field comparisons ───────────────────────────────────────────────────────

/**
 * Text field. `emptyClears`: the update query writes "" (as empty or null);
 * otherwise it skips "".
 */
export function textChanged(sent: unknown, current: unknown, emptyClears: boolean): boolean {
  if (sent === undefined) return false;
  if (sent === "" && !emptyClears) return false;
  return normalizeText(sent) !== normalizeText(current);
}

/** Status: blank is never written; a blank stored value equals the default. */
export function statusChanged(sent: unknown, current: unknown): boolean {
  if (isBlank(sent)) return false;
  const next = String(sent).trim();
  const stored = isBlank(current) ? DEFAULT_STATUS : String(current).trim();
  return next !== stored;
}

/**
 * Due date, compared by calendar day with one day of slack (time zones).
 * `absentClears`: a missing value is written as null too (EU controls).
 */
export function dateChanged(
  sent: unknown,
  current: unknown,
  emptyClears: boolean,
  absentClears = false,
): boolean {
  if (sent === undefined && !absentClears) return false;
  if (isBlank(sent) && !emptyClears && !absentClears) return false;
  const next = dayNumber(sent);
  const stored = dayNumber(current);
  if (next === null || stored === null) return next !== stored;
  if (Number.isNaN(next)) return true;
  if (Number.isNaN(stored)) return true;
  return Math.abs(next - stored) > 1;
}

export function boolChanged(sent: unknown, current: unknown): boolean {
  if (isBlank(sent)) return false;
  return String(sent).trim().toLowerCase() !== String(current ?? false).toLowerCase();
}

/** ISO and NIST queries: "" clears, junk is skipped (toId). */
const parseUserStrict = (raw: unknown): UserValue => {
  if (raw === undefined) return SKIP;
  if (raw === "" || raw === null) return null;
  const id = toId(raw);
  return Number.isNaN(id) ? SKIP : id;
};

/** Generic and imported queries: "" clears, otherwise a leading integer. */
const parseUserLoose = (raw: unknown): UserValue => {
  if (raw === undefined) return SKIP;
  if (raw === "" || raw === null) return null;
  const id = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(id) ? id : SKIP;
};

/** EU controls: always written; anything but a positive integer is null. */
const parseUserOrNull = (raw: unknown): UserValue => {
  if (isBlank(raw)) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const userChanged = (
  sent: unknown,
  current: unknown,
  parse: (raw: unknown) => UserValue,
): boolean => {
  const next = parse(sent);
  if (next === SKIP) return false;
  const stored = isBlank(current) ? null : Number(current);
  return next !== stored;
};

/**
 * Risk links: the save queries compute (current − risksDelete) ∪
 * risksMitigated, so only a different resulting set is a change. The inline
 * status dropdowns resend every linked risk in risksMitigated.
 */
export function riskLinksChanged(
  risksMitigated: unknown,
  risksDelete: unknown,
  current: number[],
): boolean {
  const added = parseIdList(risksMitigated);
  const removed = parseIdList(risksDelete);
  if (added === null || removed === null) return true;
  const stored = new Set(current.map(Number));
  const next = new Set([...stored].filter((id) => !removed.includes(id)));
  added.forEach((id) => next.add(id));
  if (next.size !== stored.size) return true;
  return [...next].some((id) => !stored.has(id));
}

// ── Flat implementation rows (ISO, NIST, bundled, imported) ─────────────────

type FieldKind = "text" | "status" | "user" | "date" | "bool";

interface FlatField {
  field: string;
  kind: FieldKind;
  cls: FrameworkFieldClass;
}

export interface FlatRowRules {
  fields: FlatField[];
  /** "" on a text or date field clears it (bundled, imported) or is skipped (ISO, NIST). */
  emptyClears: boolean;
  parseUser: (raw: unknown) => UserValue;
}

const WORKFLOW_FIELDS: FlatField[] = [
  { field: "implementation_description", kind: "text", cls: "edit" },
  { field: "status", kind: "status", cls: "edit" },
  { field: "owner", kind: "user", cls: "edit" },
  { field: "reviewer", kind: "user", cls: "edit" },
  { field: "approver", kind: "user", cls: "edit" },
  { field: "due_date", kind: "date", cls: "edit" },
  { field: "auditor_feedback", kind: "text", cls: "audit" },
];

export const ISO_NIST_RULES: FlatRowRules = {
  fields: WORKFLOW_FIELDS,
  emptyClears: false,
  parseUser: parseUserStrict,
};

export const ISO42001_ANNEX_RULES: FlatRowRules = {
  fields: [
    ...WORKFLOW_FIELDS,
    { field: "is_applicable", kind: "bool", cls: "edit" },
    { field: "justification_for_exclusion", kind: "text", cls: "edit" },
  ],
  emptyClears: false,
  parseUser: parseUserStrict,
};

export const IMPL_RULES: FlatRowRules = {
  fields: WORKFLOW_FIELDS,
  emptyClears: true,
  parseUser: parseUserLoose,
};

const fieldChanged = (spec: FlatField, sent: unknown, current: unknown, rules: FlatRowRules) => {
  switch (spec.kind) {
    case "text":
      return textChanged(sent, current, rules.emptyClears);
    case "status":
      return statusChanged(sent, current);
    case "user":
      return userChanged(sent, current, rules.parseUser);
    case "date":
      return dateChanged(sent, current, rules.emptyClears);
    case "bool":
      return boolChanged(sent, current);
    default:
      return true;
  }
};

/**
 * Changes a flat save makes to `current`. Uploaded files and unlinked files
 * are evidence (edit); linked risks are edit.
 */
export function detectFlatChanges(
  body: Row,
  files: UploadedFiles,
  current: RowWithRisks,
  rules: FlatRowRules,
): FrameworkChanges {
  const changes = noChanges();
  for (const spec of rules.fields) {
    if (fieldChanged(spec, body[spec.field], current[spec.field], rules)) {
      changes[spec.cls] = true;
    }
  }
  if (files.length > 0) changes.edit = true;
  const unlinked = parseIdList(body.delete);
  if (unlinked === null || unlinked.length > 0) changes.edit = true;
  if (riskLinksChanged(body.risksMitigated, body.risksDelete, current.risks ?? [])) {
    changes.edit = true;
  }
  return changes;
}

// ── Stored rows ─────────────────────────────────────────────────────────────

interface FlatTable {
  table: string;
  columns: string[];
  risksTable: string;
  risksCol: string;
}

const WORKFLOW_COLUMNS = WORKFLOW_FIELDS.map((f) => f.field);

/** Table and column names are constants, never request input. */
const FLAT_TABLES = {
  iso42001Subclause: {
    table: "subclauses_iso",
    columns: WORKFLOW_COLUMNS,
    risksTable: "subclauses_iso__risks",
    risksCol: "subclause_id",
  },
  iso42001Annex: {
    table: "annexcategories_iso",
    columns: [...WORKFLOW_COLUMNS, "is_applicable", "justification_for_exclusion"],
    risksTable: "annexcategories_iso__risks",
    risksCol: "annexcategory_id",
  },
  iso27001Subclause: {
    table: "subclauses_iso27001",
    columns: WORKFLOW_COLUMNS,
    risksTable: "subclauses_iso27001__risks",
    risksCol: "subclause_id",
  },
  iso27001Annex: {
    table: "annexcontrols_iso27001",
    columns: WORKFLOW_COLUMNS,
    risksTable: "annexcontrols_iso27001__risks",
    risksCol: "annexcontrol_id",
  },
  nistSubcategory: {
    table: "nist_ai_rmf_subcategories",
    columns: WORKFLOW_COLUMNS,
    risksTable: "nist_ai_rmf_subcategories__risks",
    risksCol: "nist_ai_rmf_subcategory_id",
  },
} satisfies Record<string, FlatTable>;

async function loadRiskIds(
  risksTable: string,
  risksCol: string,
  ids: number[],
  organizationId: number,
): Promise<Map<number, number[]>> {
  const byId = new Map<number, number[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return byId;
  const rows = (await sequelize.query(
    `SELECT ${risksCol} AS entity_id, projects_risks_id
       FROM ${risksTable}
      WHERE organization_id = :organizationId AND ${risksCol} IN (:ids);`,
    { replacements: { organizationId, ids }, type: QueryTypes.SELECT },
  )) as Array<{ entity_id: number; projects_risks_id: number }>;
  rows.forEach((r) => byId.get(Number(r.entity_id))?.push(Number(r.projects_risks_id)));
  return byId;
}

async function loadFlatRow(
  spec: FlatTable,
  id: number,
  organizationId: number,
): Promise<RowWithRisks | null> {
  const rows = (await sequelize.query(
    `SELECT ${spec.columns.join(", ")} FROM ${spec.table}
      WHERE organization_id = :organizationId AND id = :id;`,
    { replacements: { organizationId, id }, type: QueryTypes.SELECT },
  )) as Row[];
  if (!rows[0]) return null;
  const risks = await loadRiskIds(spec.risksTable, spec.risksCol, [id], organizationId);
  return { ...rows[0], risks: risks.get(id) ?? [] };
}

const routeId = (req: Request, name: string): number => toId(req.params[name]);

const requestBody = (req: Request): Row => (req.body ?? {}) as Row;

/**
 * Detector for a built-in framework row saved by `:id`. A row that does not
 * exist in the caller's organization changes nothing (the route answers it).
 */
function flatRowDetector(table: FlatTable, rules: FlatRowRules): FrameworkChangeDetector {
  return async (req) => {
    const id = routeId(req, "id");
    if (!Number.isInteger(id) || !req.organizationId) return noChanges();
    const current = await loadFlatRow(table, id, req.organizationId);
    if (!current) return noChanges();
    return detectFlatChanges(requestBody(req), uploadedFiles(req), current, rules);
  };
}

export const iso42001SubclauseChanges = flatRowDetector(
  FLAT_TABLES.iso42001Subclause,
  ISO_NIST_RULES,
);
export const iso42001AnnexChanges = flatRowDetector(
  FLAT_TABLES.iso42001Annex,
  ISO42001_ANNEX_RULES,
);
export const iso27001SubclauseChanges = flatRowDetector(
  FLAT_TABLES.iso27001Subclause,
  ISO_NIST_RULES,
);
export const iso27001AnnexChanges = flatRowDetector(FLAT_TABLES.iso27001Annex, ISO_NIST_RULES);
export const nistSubcategoryChanges = flatRowDetector(FLAT_TABLES.nistSubcategory, ISO_NIST_RULES);

const asRowWithRisks = (row: Row | null): RowWithRisks | null =>
  row ? { ...row, risks: Array.isArray(row.risks) ? (row.risks as number[]) : [] } : null;

/** PATCH /api/frameworks/:frameworkId/impl/:level/:id (bundled frameworks). */
export const frameworkImplChanges: FrameworkChangeDetector = async (req) => {
  const frameworkId = routeId(req, "frameworkId");
  const id = routeId(req, "id");
  const level = req.params.level;
  if (
    !Number.isInteger(frameworkId) ||
    !Number.isInteger(id) ||
    (level !== "l2" && level !== "l3") ||
    !req.organizationId
  ) {
    return noChanges();
  }
  const current = asRowWithRisks(
    (await getImplByIdQuery(frameworkId, level as ImplLevel, id, req.organizationId)) as Row | null,
  );
  if (!current) return noChanges();
  return detectFlatChanges(requestBody(req), uploadedFiles(req), current, IMPL_RULES);
};

/** PATCH /api/v1/imported-framework-assessments/links/:linkId/impl/:level/:implId. */
export const importedImplChanges: FrameworkChangeDetector = async (req) => {
  const linkId = routeId(req, "linkId");
  const implId = routeId(req, "implId");
  const level = parseImportedLevel(req.params.level);
  if (!Number.isInteger(linkId) || !Number.isInteger(implId) || !level || !req.organizationId) {
    return noChanges();
  }
  const current = asRowWithRisks(
    await getImportedImplQuery(linkId, level, implId, req.organizationId),
  );
  if (!current) return noChanges();
  return detectFlatChanges(requestBody(req), uploadedFiles(req), current, IMPL_RULES);
};

// ── EU AI Act controls (PATCH /api/eu-ai-act/saveControls/:id) ──────────────

export interface EuControlSnapshot {
  control: Row | null;
  subcontrols: Map<number, RowWithRisks>;
  /** Ids of files linked as auditor feedback to the subcontrols in the request. */
  feedbackFileIds: Set<number>;
}

interface SubcontrolInput {
  id?: unknown;
  status?: unknown;
  implementation_details?: unknown;
  evidence_description?: unknown;
  feedback_description?: unknown;
  risksDelete?: unknown;
  risksMitigated?: unknown;
}

/** The subControls JSON of a control save; null when it cannot be read. */
export function parseSubcontrols(raw: unknown): SubcontrolInput[] | null {
  if (isBlank(raw)) return [];
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return Array.isArray(value) ? (value as SubcontrolInput[]) : null;
}

/**
 * Control fields (owner, reviewer, approver, due date, risk review) and
 * subcontrol implementation fields, evidence files and risks are edit; the
 * subcontrol auditor feedback and its files are audit. The control fields
 * are always written by saveControls, so a missing one clears the field.
 */
export function detectEuControlChanges(
  body: Row,
  files: UploadedFiles,
  snapshot: EuControlSnapshot,
): FrameworkChanges {
  const changes = noChanges();
  const control = snapshot.control;
  if (control) {
    if (
      userChanged(body.owner, control.owner, parseUserOrNull) ||
      userChanged(body.reviewer, control.reviewer, parseUserOrNull) ||
      userChanged(body.approver, control.approver, parseUserOrNull) ||
      dateChanged(body.due_date, control.due_date, true, true) ||
      (isBlank(body.risk_review) ? null : String(body.risk_review)) !==
        (isBlank(control.risk_review) ? null : String(control.risk_review))
    ) {
      changes.edit = true;
    }
  }

  const subcontrols = parseSubcontrols(body.subControls);
  if (subcontrols === null) {
    changes.edit = true;
    return changes;
  }
  const savedIds: number[] = [];
  for (const sc of subcontrols) {
    const id = toId(sc?.id);
    const current = Number.isInteger(id) ? snapshot.subcontrols.get(id) : undefined;
    if (!current) continue;
    savedIds.push(id);
    if (
      statusChanged(sc.status, current.status) ||
      textChanged(sc.implementation_details, current.implementation_details, true) ||
      textChanged(sc.evidence_description, current.evidence_description, true)
    ) {
      changes.edit = true;
    }
    if (textChanged(sc.feedback_description, current.feedback_description, true)) {
      changes.audit = true;
    }
    if (
      (sc.risksDelete !== undefined || sc.risksMitigated !== undefined) &&
      riskLinksChanged(sc.risksMitigated, sc.risksDelete, current.risks)
    ) {
      changes.edit = true;
    }
  }

  for (const file of files) {
    if (String(file.fieldname ?? "").startsWith("feedback_files_")) changes.audit = true;
    else changes.edit = true;
  }

  // saveControls unlinks the listed files from every subcontrol it saves.
  const unlinked = parseIdList(body.delete);
  if (unlinked === null) {
    changes.edit = true;
  } else if (savedIds.length > 0) {
    for (const fileId of unlinked) {
      if (snapshot.feedbackFileIds.has(fileId)) changes.audit = true;
      else changes.edit = true;
    }
  }
  return changes;
}

export const euControlChanges: FrameworkChangeDetector = async (req) => {
  const controlId = routeId(req, "id");
  const organizationId = req.organizationId;
  if (!organizationId) return noChanges();
  const body = requestBody(req);

  const subcontrolIds = Array.from(
    new Set(
      (parseSubcontrols(body.subControls) ?? [])
        .map((sc) => toId(sc?.id))
        .filter((id) => Number.isInteger(id)),
    ),
  );

  const [controlRows, subcontrolRows, feedbackRows, risks] = await Promise.all([
    Number.isInteger(controlId)
      ? (sequelize.query(
          `SELECT owner, reviewer, approver, due_date, risk_review FROM controls_eu
            WHERE organization_id = :organizationId AND id = :controlId;`,
          { replacements: { organizationId, controlId }, type: QueryTypes.SELECT },
        ) as Promise<Row[]>)
      : Promise.resolve([] as Row[]),
    subcontrolIds.length > 0
      ? (sequelize.query(
          `SELECT id, status, implementation_details, evidence_description, feedback_description
             FROM subcontrols_eu
            WHERE organization_id = :organizationId AND id IN (:subcontrolIds);`,
          { replacements: { organizationId, subcontrolIds }, type: QueryTypes.SELECT },
        ) as Promise<Row[]>)
      : Promise.resolve([] as Row[]),
    subcontrolIds.length > 0
      ? (sequelize.query(
          `SELECT file_id FROM file_entity_links
            WHERE organization_id = :organizationId
              AND framework_type = 'eu_ai_act'
              AND entity_type = 'subcontrol'
              AND link_type = 'feedback'
              AND entity_id IN (:subcontrolIds);`,
          { replacements: { organizationId, subcontrolIds }, type: QueryTypes.SELECT },
        ) as Promise<Array<{ file_id: number }>>)
      : Promise.resolve([] as Array<{ file_id: number }>),
    loadRiskIds("subcontrols_eu__risks", "subcontrol_id", subcontrolIds, organizationId),
  ]);

  const subcontrols = new Map<number, RowWithRisks>();
  subcontrolRows.forEach((row) => {
    const id = Number(row.id);
    subcontrols.set(id, { ...row, risks: risks.get(id) ?? [] });
  });

  return detectEuControlChanges(body, uploadedFiles(req), {
    control: controlRows[0] ?? null,
    subcontrols,
    feedbackFileIds: new Set(feedbackRows.map((r) => Number(r.file_id))),
  });
};

// ── EU AI Act assessment answers (PATCH /api/eu-ai-act/saveAnswer/:id) ──────

/**
 * The answer text, evidence files and linked risks are edit. The status is
 * not checked: the assessment tracker offers its status menu to every role.
 */
export function detectEuAnswerChanges(
  body: Row,
  files: UploadedFiles,
  current: RowWithRisks,
): FrameworkChanges {
  const changes = noChanges();
  if (body.answer !== undefined && normalizeText(body.answer) !== normalizeText(current.answer)) {
    changes.edit = true;
  }
  if (files.length > 0) changes.edit = true;
  const unlinked = parseIdList(body.delete);
  if (unlinked === null || unlinked.length > 0) changes.edit = true;
  if (riskLinksChanged(body.risksMitigated, body.risksDelete, current.risks)) changes.edit = true;
  return changes;
}

export const euAnswerChanges: FrameworkChangeDetector = async (req) => {
  const id = routeId(req, "id");
  const organizationId = req.organizationId;
  if (!Number.isInteger(id) || !organizationId) return noChanges();
  const rows = (await sequelize.query(
    `SELECT answer FROM answers_eu WHERE organization_id = :organizationId AND id = :id;`,
    { replacements: { organizationId, id }, type: QueryTypes.SELECT },
  )) as Row[];
  if (!rows[0]) return noChanges();
  const risks = await loadRiskIds("answers_eu__risks", "answer_id", [id], organizationId);
  return detectEuAnswerChanges(requestBody(req), uploadedFiles(req), {
    ...rows[0],
    risks: risks.get(id) ?? [],
  });
};
