/**
 * Renders a composed stance to HTML and PDF and stores it, insert-only.
 *
 * I/O layer: reads the template, drives a headless browser and writes the
 * `files` and `bias_audit_stances` rows. Composition stays pure in compose.ts.
 *
 * Immutability: a stance is never updated. A regenerate inserts the next
 * version for the run and the earlier one stays readable. The utils module
 * exports no update function for stances, and a test asserts that.
 *
 * Versioning caveat: the unique index `bias_audit_stances_run_version_uq`
 * constrains (run_id, version) only while run_id is set. Once a run is
 * deleted run_id becomes NULL (ON DELETE SET NULL, so the stance survives)
 * and NULLs never collide, so the index no longer protects an orphaned
 * stance. Do not rely on it, or on getNextStanceVersionQuery, to version
 * stances across a deleted run.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as ejs from "ejs";
import { chromium } from "playwright";
import { sequelize } from "../../../database/db";
import {
  ConflictException,
  ValidationException,
} from "../../../domain.layer/exceptions/custom.exception";
import {
  createStanceQuery,
  getNextStanceVersionQuery,
  getRunProjectIdQuery,
} from "../../../utils/biasAudit.utils";
import { uploadFile } from "../../../utils/fileUpload.utils";
import { REQUIRED_SECTIONS, type StanceModel, type StanceSection } from "./compose";
import { checkSections } from "./sectionChecker";
import { blankFieldLabel, metricLabel, presetLabel } from "./labels";
import { findForbidden } from "./vocabulary";

/**
 * What the stored run holds that the model does not: the dataset hash and
 * what was tested. Build it from the run row with `evidenceFromRun`.
 */
export interface StanceEvidence {
  datasetSha256: string | null;
  datasetRetained: boolean;
  rowCount: number | null;
  presetId: string;
  metric: string;
  threshold: number | null;
  thresholdSource: string | null;
  smallSampleExclusion: number | null;
  categories: string[];
  /** `gates.mayExportPdf` of the run's outcome. False refuses rendering. */
  mayExportPdf: boolean;
}

/** The subset of a stored run row the evidence reads. */
export interface RunEvidenceRow {
  dataset_sha256?: string | null;
  dataset_retained?: boolean | null;
  row_count?: number | null;
  preset_id: string;
  metric: string;
  threshold?: number | string | null;
  threshold_source?: string | null;
  small_sample_exclusion?: number | string | null;
}

export function evidenceFromRun(
  run: RunEvidenceRow,
  categories: string[],
  mayExportPdf: boolean,
): StanceEvidence {
  const num = (v: number | string | null | undefined) =>
    v === null || v === undefined ? null : Number(v);
  return {
    datasetSha256: run.dataset_sha256 ?? null,
    datasetRetained: Boolean(run.dataset_retained),
    rowCount: run.row_count ?? null,
    presetId: run.preset_id,
    metric: run.metric,
    threshold: num(run.threshold),
    thresholdSource: run.threshold_source ?? null,
    smallSampleExclusion: num(run.small_sample_exclusion),
    categories,
    mayExportPdf,
  };
}

/** Sections an out-of-scope or undetermined stance legitimately carries. */
const REQUIRED_BY_SCOPE: Record<StanceModel["scope"], readonly string[]> = {
  in_scope: [...REQUIRED_SECTIONS, "readiness"],
  out_of_scope: ["scope", "party", "open_items", "expiry"],
  undetermined: ["scope", "party", "open_items"],
};

const TEMPLATE_PATH = path.join(__dirname, "../../../templates/biasAudit/stance.ejs");

type Part = { kind: "text" | "customer"; text: string };

/**
 * Split a body around its customer-authored strings so each can be marked,
 * never altered. Every occurrence of `lead + text + tail` is found, ordered by
 * position in the body, so the order of the list does not matter. An overlap
 * keeps the earlier span.
 */
function toParts(section: StanceSection): Part[] {
  const spans: Array<{ start: number; end: number }> = [];
  for (const c of section.customerText ?? []) {
    if (c.text === "") continue;
    const needle = c.lead + c.text + c.tail;
    for (
      let at = section.body.indexOf(needle);
      at >= 0;
      at = section.body.indexOf(needle, at + 1)
    ) {
      const start = at + c.lead.length;
      spans.push({ start, end: start + c.text.length });
    }
  }
  spans.sort((a, b) => a.start - b.start);

  const parts: Part[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    parts.push({ kind: "text", text: section.body.slice(cursor, span.start) });
    parts.push({ kind: "customer", text: section.body.slice(span.start, span.end) });
    cursor = span.end;
  }
  parts.push({ kind: "text", text: section.body.slice(cursor) });
  return parts.filter((p) => p.text !== "");
}

const EXCLUSION_CITATION = "§ 5-301(d)";
const CONVENTION_PROVENANCE = "EEOC four-fifths convention; the statute does not adopt it";

function fixed(n: number | null): string {
  return n === null ? "not recorded" : n.toFixed(2);
}

function percent(n: number | null): string {
  return n === null ? "not recorded" : `${Number((n * 100).toFixed(2))}% (${EXCLUSION_CITATION})`;
}

/** The reference line with its source, claiming the convention only when that is the source. */
function referenceLine(evidence: StanceEvidence): string {
  if (evidence.threshold === null) return "not recorded";
  const source =
    evidence.thresholdSource === null
      ? "source not recorded"
      : evidence.thresholdSource === "convention"
        ? CONVENTION_PROVENANCE
        : `source recorded as ${evidence.thresholdSource}`;
  return `${fixed(evidence.threshold)} (${source})`;
}

/** Preview rendering; `evidence` is optional here only. The PDF path requires it. */
export function renderStanceHtml(
  model: StanceModel,
  evidence: StanceEvidence | null = null,
): string {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  return ejs.render(template, {
    model,
    sections: model.sections.map((s) => ({ ...s, parts: toParts(s) })),
    blankFieldLabel,
    tested: {
      presetId: evidence ? presetLabel(evidence.presetId) : "not recorded",
      metric: evidence ? metricLabel(evidence.metric) : "not recorded",
      threshold: evidence ? referenceLine(evidence) : "not recorded",
      smallSampleExclusion: percent(evidence?.smallSampleExclusion ?? null),
      categories: evidence?.categories.join(", ") || "not recorded",
      rowCount: evidence?.rowCount ?? "not recorded",
    },
    data: {
      sha256: evidence?.datasetSha256 ?? "not recorded",
      retained: evidence
        ? evidence.datasetRetained
          ? "Yes"
          : "No, not retained: only the hash above is kept"
        : "not recorded",
    },
  });
}

/**
 * Forbidden words found in rendered HTML, ignoring customer-authored text.
 * Only `<span data-customer-text>` elements are skipped. Customer text is
 * HTML-escaped inside them, so it holds no `<` and cannot close the element
 * early; our own text is escaped too, so it cannot forge the marker. Every
 * other byte of the output is checked.
 */
export function findForbiddenWords(html: string): string[] {
  return findForbidden(html.replace(/<span data-customer-text>[^<]*<\/span>/g, ""));
}

/** The export gate. Fails closed: no evidence, or evidence that withholds export, refuses. */
function assertMayExport(
  evidence: StanceEvidence | null | undefined,
): asserts evidence is StanceEvidence {
  if (!evidence) {
    throw new Error("A stance PDF cannot be rendered without the run's evidence.");
  }
  if (evidence.mayExportPdf !== true) {
    throw new Error("The data checks for this run do not allow the stance to be exported.");
  }
}

export async function renderStancePdf(
  model: StanceModel,
  evidence: StanceEvidence,
): Promise<{ pdf: Buffer; sha256: string }> {
  assertMayExport(evidence);
  const html = renderStanceHtml(model, evidence);

  const { missing } = checkSections(html, REQUIRED_BY_SCOPE[model.scope]);
  if (missing.length > 0) {
    throw new Error(`Stance is missing required section(s): ${missing.join(", ")}`);
  }
  const forbidden = findForbiddenWords(html);
  if (forbidden.length > 0) {
    throw new Error(`Stance contains forbidden vocabulary: ${forbidden.join(", ")}`);
  }

  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    ...(executablePath ? { executablePath } : {}),
  });
  try {
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: "load" });
      const pdf = Buffer.from(
        await page.pdf({
          format: "A4",
          margin: { top: "0.75in", right: "0.75in", bottom: "0.75in", left: "0.75in" },
          printBackground: true,
        }),
      );
      return { pdf, sha256: createHash("sha256").update(pdf).digest("hex") };
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

export interface PersistStanceArgs {
  runId: number;
  projectId: number;
  organizationId: number;
  userId: number;
  model: StanceModel;
  evidence: StanceEvidence;
  scoreAtGeneration: number | null;
}

/** A concurrent regenerate that took the same version loses to the unique index. */
function isUniqueViolation(error: unknown): boolean {
  const e = error as { name?: string; original?: { code?: string } };
  return e?.original?.code === "23505" || e?.name === "SequelizeUniqueConstraintError";
}

/**
 * Insert the next stance version with its PDF. The profile and question-set
 * versions come from the run inside createStanceQuery. The PDF row is created
 * with the caller's organization id and linked only by the id just returned,
 * so a stance never points at another organization's file.
 */
export async function persistStance(
  args: PersistStanceArgs,
): Promise<{ stanceId: number; version: number; sha256: string }> {
  const { runId, projectId, organizationId, userId, model, evidence, scoreAtGeneration } = args;
  assertMayExport(evidence);
  // The run decides the project. A caller-supplied id that disagrees is a bug
  // or an attempt to file the PDF under another project, so it is refused.
  const runProjectId = await getRunProjectIdQuery(runId, organizationId);
  if (runProjectId !== projectId) {
    throw new ValidationException(
      "The project does not match the run's project",
      "projectId",
      projectId,
    );
  }
  const { pdf, sha256 } = await renderStancePdf(model, evidence);

  try {
    return await sequelize.transaction(async (transaction) => {
      // This lookup runs on its own connection, outside the transaction, so
      // two concurrent regenerates can read the same number. The unique index
      // on (run_id, version) rejects the second insert, and that 23505 is
      // mapped to a conflict below.
      const version = await getNextStanceVersionQuery(runId, organizationId);
      const file = await uploadFile(
        {
          fieldname: "file",
          originalname: `bias-audit-stance-run-${runId}-v${version}.pdf`,
          mimetype: "application/pdf",
          buffer: pdf,
          size: pdf.length,
        },
        userId,
        runProjectId,
        "Bias audit stance report",
        organizationId,
        transaction,
      );
      const row = await createStanceQuery(
        {
          runId,
          version,
          pdfSha256: sha256,
          pdfFileId: file.id!,
          scoreAtGeneration,
          scopeAtGeneration: model.scope,
          generatedBy: userId,
        },
        organizationId,
        transaction,
      );
      return { stanceId: row.id!, version: row.version, sha256 };
    });
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      throw new ConflictException(
        "Another stance was generated for this run first. Reload and retry.",
        "AedtStance",
        "version",
      );
    }
    throw error;
  }
}
