/**
 * Renders a composed stance to HTML and PDF and stores it, insert-only.
 *
 * I/O layer: reads the template, drives a headless browser and writes the
 * `files` and `bias_audit_stances` rows. Composition stays pure in compose.ts.
 *
 * Immutability: a stance is never updated. A regenerate inserts the next
 * version for the run (or, for a scope determination, for the project and
 * framework) and the earlier one stays readable. The utils module exports no update function
 * for stances, and a test asserts that.
 *
 * Two parents: a stance is generated from a run, or, when the attested
 * profile places the tool out of scope, from that profile. A scope
 * determination has no dataset, so it is the one document rendered without
 * run evidence; every other document still refuses without it.
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
import type { Transaction } from "sequelize";
import { sequelize } from "../../../database/db";
import {
  BusinessLogicException,
  ConflictException,
  ValidationException,
} from "../../../domain.layer/exceptions/custom.exception";
import {
  createProfileStanceQuery,
  createStanceQuery,
  getNextProfileStanceVersionQuery,
  getNextStanceVersionQuery,
  getRunProjectIdQuery,
  assertProfileAttestedQuery,
  checkProfileAttestedQuery,
} from "../../../utils/biasAudit.utils";
import { BIAS_AUDIT_STANCE_SOURCE, uploadFile } from "../../../utils/fileUpload.utils";
import { getSharedBrowser } from "../../../utils/pdfBrowser.utils";
import {
  REQUIRED_SECTIONS,
  type CorpusStanceFacts,
  type StanceModel,
  type StanceSection,
} from "./compose";
import { checkSections } from "./sectionChecker";
import { blankFieldLabel, metricLabel, presetLabel } from "./labels";
import { findForbidden } from "./vocabulary";
import { isUniqueViolation } from "../serviceHelpers";

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
  /** The generated corpus the run was scored from; null or absent for uploaded data. */
  corpus?: CorpusStanceFacts | null;
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
  corpus: CorpusStanceFacts | null = null,
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
    corpus,
  };
}

const CRITERIA_WORDS: Record<CorpusStanceFacts["criteria"]["verdict"], string> = {
  close: "matched the expected set",
  divergent: "differed from the expected set",
  not_supplied: "not supplied; the expected criteria were not confirmed against the platform",
};

/** The corpus rows of "What was tested", or null for uploaded data. */
function corpusRows(corpus: CorpusStanceFacts | null | undefined) {
  if (!corpus) return null;
  const sizes = Object.values(corpus.cellSizes);
  const models = Object.entries(corpus.modelsObserved)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([m, n]) => `${m} (${n})`);
  const unmatched =
    corpus.criteria.verdict === "divergent" && corpus.criteria.unmatchedExpected.length > 0
      ? `; not matched: ${corpus.criteria.unmatchedExpected.join(", ")}`
      : "";
  return {
    corpus: `#${corpus.corpusId}, ${corpus.recordCount} synthetic records`,
    models: models.length > 0 ? models.join(", ") : "not recorded",
    cellSizes:
      sizes.length > 0
        ? `smallest ${Math.min(...sizes)}, largest ${Math.max(...sizes)} across ${sizes.length} cells`
        : "not recorded",
    criteria: CRITERIA_WORDS[corpus.criteria.verdict] + unmatched,
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
    // The footer says whether figures were computed from a file. That follows
    // the run evidence, not the scope: an out-of-scope run still has a file.
    hasEvidence: evidence !== null,
    sections: model.sections.map((s) => ({ ...s, parts: toParts(s) })),
    blankFieldLabel,
    tested: {
      presetId: evidence ? presetLabel(evidence.presetId) : "not recorded",
      metric: evidence ? metricLabel(evidence.metric) : "not recorded",
      threshold: evidence ? referenceLine(evidence) : "not recorded",
      smallSampleExclusion: percent(evidence?.smallSampleExclusion ?? null),
      categories: evidence?.categories.join(", ") || "not recorded",
      rowCount: evidence?.rowCount ?? "not recorded",
      corpus: corpusRows(evidence?.corpus),
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

/** What a stance is generated from. The export gate must be told which. */
export type StanceParentKind = "run" | "profile";

/**
 * The export gate, and the one place the evidence rule lives. Fails closed: no
 * evidence, or evidence that withholds export, refuses. The one exception is a
 * scope determination: a document generated from a profile has no run and so
 * no dataset to gate, and an out-of-scope one may pass with no evidence. A run
 * stance never renders without its run's evidence, whatever its scope. The
 * parent is a required argument so no caller can skip that distinction. It
 * reads nothing from the database, so persistStance runs it before any read.
 * Every refusal here and in the render is a BusinessLogicException (422), so a
 * caller maps it to a client error rather than a server fault.
 */
function assertMayExport(
  evidence: StanceEvidence | null | undefined,
  scope: StanceModel["scope"],
  parent: StanceParentKind,
): void {
  if (!evidence && scope === "out_of_scope" && parent === "profile") return;
  if (!evidence) {
    throw new BusinessLogicException(
      "A stance PDF cannot be rendered without the run's evidence.",
      "stance_evidence",
    );
  }
  if (evidence.mayExportPdf !== true) {
    throw new BusinessLogicException(
      "The data checks for this run do not allow the stance to be exported.",
      "stance_export_gate",
    );
  }
}

/**
 * The render after the export gate. Not exported: the one way to a stance PDF
 * is persistStance, which runs assertMayExport before any database read and
 * then calls this, so the gate runs once per persist and cannot be skipped.
 */
async function renderGatedPdf(
  model: StanceModel,
  evidence: StanceEvidence | null,
): Promise<{ pdf: Buffer; sha256: string }> {
  const html = renderStanceHtml(model, evidence);

  const { missing } = checkSections(html, REQUIRED_BY_SCOPE[model.scope], {
    corpus: Boolean(evidence?.corpus),
  });
  if (missing.length > 0) {
    throw new BusinessLogicException(
      `Stance is missing required section(s): ${missing.join(", ")}`,
      "stance_sections",
    );
  }
  const forbidden = findForbiddenWords(html);
  if (forbidden.length > 0) {
    throw new BusinessLogicException(
      `Stance contains forbidden vocabulary: ${forbidden.join(", ")}`,
      "stance_vocabulary",
    );
  }

  // The browser is the server's shared one; this render owns only its page.
  // browser.newPage opens the page in its own context, which page.close ends.
  const browser = await getSharedBrowser();
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
}

interface PersistStanceCommon {
  projectId: number;
  organizationId: number;
  userId: number;
  model: StanceModel;
  scoreAtGeneration: number | null;
}

/**
 * A run stance needs the run's evidence. A profile stance is a scope
 * determination: no run, no dataset, so no evidence and no score.
 */
export type PersistStanceArgs = PersistStanceCommon &
  (
    | { runId: number; profileId?: never; evidence: StanceEvidence }
    | { profileId: number; runId?: never; evidence: null }
  );

/**
 * What differs between the two parents, resolved and checked before anything
 * is rendered. `nextVersion` runs inside the persist transaction.
 */
interface StanceParent {
  projectId: number;
  label: StanceParentKind;
  nextVersion: (transaction: Transaction) => Promise<number>;
  filename: (version: number) => string;
  insert: (
    row: { version: number; pdfSha256: string; pdfFileId: number },
    transaction: Transaction,
  ) => Promise<{ id?: number; version: number }>;
}

function parentKindOf(args: PersistStanceArgs): StanceParentKind {
  return args.profileId !== undefined ? "profile" : "run";
}

async function resolveParent(args: PersistStanceArgs): Promise<StanceParent> {
  const { organizationId, userId, model } = args;
  const common = { scopeAtGeneration: model.scope, generatedBy: userId };

  if (args.profileId !== undefined) {
    // The service decides that only an out-of-scope profile gets a scope
    // determination (422 otherwise); that rule is not repeated here. This
    // cheap, unlocked check only refuses a profile that is missing, another
    // project's or no longer attested (404/409) before the browser renders.
    // The lock taken in nextVersion, and the insert, stay the authority.
    const { profileId, projectId } = args;
    await checkProfileAttestedQuery(profileId, projectId, organizationId);
    return {
      projectId,
      label: "profile",
      // Lock the profile FOR SHARE first, so no re-attestation commits
      // between this version read and the insert (see the query's comment).
      nextVersion: async (transaction) => {
        await assertProfileAttestedQuery(profileId, projectId, organizationId, transaction);
        return getNextProfileStanceVersionQuery(profileId, organizationId, transaction);
      },
      filename: (v) => `bias-audit-scope-determination-profile-${profileId}-v${v}.pdf`,
      insert: (row, transaction) =>
        createProfileStanceQuery(
          { ...row, ...common, profileId, projectId },
          organizationId,
          transaction,
        ),
    };
  }

  const runId = args.runId;
  // The run decides the project. A caller-supplied id that disagrees is a bug
  // or an attempt to file the PDF under another project, so it is refused.
  const runProjectId = await getRunProjectIdQuery(runId, organizationId);
  if (runProjectId !== args.projectId) {
    throw new ValidationException(
      "The project does not match the run's project",
      "projectId",
      args.projectId,
    );
  }
  return {
    projectId: runProjectId,
    label: "run",
    // Read on its own connection, outside the transaction, so two concurrent
    // regenerates can read the same number; the unique index on
    // (run_id, version) rejects the second insert (23505, mapped below).
    nextVersion: () => getNextStanceVersionQuery(runId, organizationId),
    filename: (v) => `bias-audit-stance-run-${runId}-v${v}.pdf`,
    insert: (row, transaction) =>
      createStanceQuery(
        { ...row, ...common, runId, scoreAtGeneration: args.scoreAtGeneration },
        organizationId,
        transaction,
      ),
  };
}

/**
 * Insert the next stance version with its PDF. The profile and question-set
 * versions come from the run, or from the attested profile, inside the insert
 * query. The PDF row is created with the caller's organization id and linked
 * only by the id just returned, so a stance never points at another
 * organization's file. Run and profile stances share the files source, so
 * every stance-file protection applies to both.
 */
export async function persistStance(
  args: PersistStanceArgs,
): Promise<{ stanceId: number; version: number; sha256: string }> {
  const { organizationId, userId, model, evidence } = args;
  // The export gate runs first, before any database read, so an export
  // refusal (422) answers ahead of any parent refusal (400/404/409). Then
  // resolveParent checks the parent, and the render runs without gating
  // again. All of it runs before the transaction, so a refusal writes nothing.
  assertMayExport(evidence, model.scope, parentKindOf(args));
  const parent = await resolveParent(args);
  const { pdf, sha256 } = await renderGatedPdf(model, evidence);

  try {
    return await sequelize.transaction(async (transaction) => {
      // A lost version race is rejected by the unique index on
      // (run_id, version) or the partial one on (profile_id, version), and
      // that 23505 is mapped to a conflict below.
      const version = await parent.nextVersion(transaction);
      const file = await uploadFile(
        {
          fieldname: "file",
          originalname: parent.filename(version),
          mimetype: "application/pdf",
          buffer: pdf,
          size: pdf.length,
        },
        userId,
        parent.projectId,
        BIAS_AUDIT_STANCE_SOURCE,
        organizationId,
        transaction,
      );
      const row = await parent.insert(
        { version, pdfSha256: sha256, pdfFileId: file.id! },
        transaction,
      );
      return { stanceId: row.id!, version: row.version, sha256 };
    });
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      throw new ConflictException(
        `Another stance was generated for this ${parent.label} first. Reload and retry.`,
        "AedtStance",
        "version",
      );
    }
    throw error;
  }
}
