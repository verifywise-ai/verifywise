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
import { ConflictException } from "../../../domain.layer/exceptions/custom.exception";
import { createStanceQuery, getNextStanceVersionQuery } from "../../../utils/biasAudit.utils";
import { uploadFile } from "../../../utils/fileUpload.utils";
import { REQUIRED_SECTIONS, type StanceModel, type StanceSection } from "./compose";
import { checkSections } from "./sectionChecker";
import { FORBIDDEN_WORDS } from "./vocabulary";

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
  in_scope: REQUIRED_SECTIONS,
  out_of_scope: ["scope", "party", "open_items", "expiry"],
  undetermined: ["scope", "party", "open_items"],
};

const TEMPLATE_PATH = path.join(__dirname, "../../../templates/biasAudit/stance.ejs");

type Part = { kind: "text" | "quote"; text: string };

/** Split a body around its customer quotes so each can be marked, never altered. */
function toParts(section: StanceSection): Part[] {
  let rest = section.body;
  const parts: Part[] = [];
  for (const q of section.quotes ?? []) {
    const lead = `In your words: "`;
    const needle = `${lead}${q}"`;
    const at = rest.indexOf(needle);
    if (at < 0) continue;
    parts.push({ kind: "text", text: rest.slice(0, at) + lead });
    parts.push({ kind: "quote", text: q });
    rest = `"` + rest.slice(at + needle.length);
  }
  parts.push({ kind: "text", text: rest });
  return parts.filter((p) => p.text !== "");
}

function fixed(n: number | null): string {
  return n === null ? "not recorded" : n.toFixed(2);
}

export function renderStanceHtml(
  model: StanceModel,
  evidence: StanceEvidence | null = null,
): string {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  return ejs.render(template, {
    model,
    sections: model.sections.map((s) => ({ ...s, parts: toParts(s) })),
    tested: {
      presetId: evidence?.presetId ?? "not recorded",
      metric: evidence?.metric ?? "not recorded",
      threshold: evidence
        ? `${fixed(evidence.threshold)} (${evidence.thresholdSource ?? "source not recorded"})`
        : "not recorded",
      smallSampleExclusion: fixed(evidence?.smallSampleExclusion ?? null),
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
 * Forbidden words found in rendered HTML, ignoring customer quotes. Only
 * elements marked `data-customer-quote` are skipped; every other byte of the
 * output is checked, so the exemption cannot widen by accident.
 */
export function findForbiddenWords(html: string): string[] {
  const ours = html
    .replace(/<blockquote data-customer-quote[^>]*>[\s\S]*?<\/blockquote>/g, "")
    .toLowerCase();
  return FORBIDDEN_WORDS.filter((w) => ours.includes(w));
}

export async function renderStancePdf(
  model: StanceModel,
  evidence: StanceEvidence | null = null,
): Promise<{ pdf: Buffer; sha256: string }> {
  if (evidence && evidence.mayExportPdf === false) {
    throw new Error("The data checks for this run do not allow the stance to be exported.");
  }
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
  const { pdf, sha256 } = await renderStancePdf(model, evidence);

  try {
    return await sequelize.transaction(async (transaction) => {
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
        projectId,
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
