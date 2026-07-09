/**
 * Evidence Analyzer — system prompts with explicit A–F rubric anchors.
 *
 * The LLM grades all five dimensions (relevance, completeness, recency,
 * reliability, specificity) as letters A–F and returns a holistic overall
 * grade. Recency and reliability are judged from the file metadata passed in
 * the user prompt — there is no deterministic scoring in code.
 */

export const ANALYZER_VERSION = "evidence-analyzer-v3";

/**
 * Rubric anchors — one A–F ladder per dimension. Used in the prompt.
 *
 * Anti-inflation policy:
 *  - Grade A is RARE. It requires evidence of execution (audit logs, signed
 *    completed reviews, populated KPI trackers, quantified thresholds), not
 *    just forward-looking policy intent.
 *  - Default to the LOWER grade when on the boundary.
 */
export const RUBRIC = {
  relevance: [
    {
      grade: "A",
      anchor:
        "Cites named controls/articles (e.g., 'EU AI Act Article 10', 'ISO 42001 §6.1.3') AND demonstrates the control HAS BEEN satisfied with concrete artifacts (audit log entries, completed conformity assessments, signed dated reviews). Pure 'we shall'/'we will' policy statements do NOT reach A.",
    },
    {
      grade: "B",
      anchor:
        "Cites named controls/articles AND describes how they will be satisfied via specific procedures. Typical ceiling for a well-written policy not yet operationalized.",
    },
    {
      grade: "C",
      anchor:
        "Discusses the compliance domain (risk, data governance, security) with concrete procedures, but lacks specific control references.",
    },
    {
      grade: "D",
      anchor:
        "Mentions compliance topics tangentially or only surface-level terminology without procedures or detail.",
    },
    {
      grade: "F",
      anchor: "No compliance content, garbled OCR, or too short/empty to evaluate.",
    },
  ],
  completeness: [
    {
      grade: "A",
      anchor:
        "Policy + procedures + roles + measurement criteria + EMBEDDED EVIDENCE OF EXECUTION (completed audit log table, signed-off review history, exception reports with dates, populated KPI tracker). Plans-only documents do NOT qualify.",
    },
    {
      grade: "B",
      anchor:
        "Policy + procedures + named roles + measurement criteria, but execution evidence is missing or schedule-only ('monthly review' stated, no logs of past reviews). Typical ceiling for a board-approved policy framework.",
    },
    {
      grade: "C",
      anchor: "Policy + procedures with named roles, but missing explicit measurement criteria.",
    },
    {
      grade: "D",
      anchor: "Policy stated; procedures partial or absent; no roles or metrics.",
    },
    {
      grade: "F",
      anchor: "No content beyond a title or placeholder.",
    },
  ],
  recency: [
    {
      grade: "A",
      anchor:
        "Uploaded/effective within the last ~6 months and not expired. Content references current dates/periods. Clearly up to date.",
    },
    {
      grade: "B",
      anchor: "Roughly 6–18 months old, not expired. Still reasonably current.",
    },
    {
      grade: "C",
      anchor:
        "Roughly 18–36 months old, or approaching an expiry date. Aging but usable.",
    },
    {
      grade: "D",
      anchor: "Over ~3 years old, or past/near expiry. Likely stale.",
    },
    {
      grade: "F",
      anchor:
        "Expired, or so old it is no longer credible as current evidence. If no dates are available at all, grade D (cannot confirm currency) rather than F unless the content itself is clearly obsolete.",
    },
  ],
  reliability: [
    {
      grade: "A",
      anchor:
        "Authoritative and trustworthy source: board-/executive-approved, signed and dated, versioned, clean high-fidelity parse. No signs of tampering or draft status.",
    },
    {
      grade: "B",
      anchor:
        "Management-approved or a published internal policy with a named owner/version. Good parse fidelity.",
    },
    {
      grade: "C",
      anchor:
        "Internal working document or memo without formal approval, OR content is sound but parse fidelity is medium.",
    },
    {
      grade: "D",
      anchor:
        "Draft/unsigned/unattributed, OR low parse fidelity (garbled OCR, structure lost) making the content hard to trust.",
    },
    {
      grade: "F",
      anchor: "Unattributed and unusable, or parse quality so poor the content cannot be trusted.",
    },
  ],
  specificity: [
    {
      grade: "A",
      anchor:
        "Named owners + named systems + exact dates + at least TWO quantified numerical thresholds ('<5% bias rate', '≥99.5% uptime', '≤24h response', '≥0.95 F1') + explicit data flows. Qualitative scales (High/Medium/Low) do NOT count as quantified thresholds.",
    },
    {
      grade: "B",
      anchor:
        "Named owners + named systems + exact dates, but thresholds are qualitative or absent. Typical ceiling for policies without engineering-grade SLAs.",
    },
    {
      grade: "C",
      anchor: "Procedures use action verbs and clear sequencing, but lack named systems or numbers.",
    },
    {
      grade: "D",
      anchor:
        "Generic boilerplate ('appropriate measures', 'reasonable steps') or aspirational statements of intent without procedures.",
    },
    {
      grade: "F",
      anchor: "Empty platitudes or pure marketing.",
    },
  ],
} as const;

/**
 * Build the system prompt for the evidence analyzer.
 * Keep this stable — changing it changes grades across the org.
 */
export function buildAnalyzerSystemPrompt(): string {
  return [
    "You are VerifyWise's Evidence Quality Analyzer — a strict, calibrated reviewer.",
    "",
    "Grade compliance evidence documents on FIVE dimensions, each as a letter A–F:",
    "RELEVANCE, COMPLETENESS, RECENCY, RELIABILITY, SPECIFICITY.",
    "Then assign a single HOLISTIC OVERALL grade A–F for the document as a whole.",
    "",
    "Grade meanings: A = Excellent, B = Good, C = Adequate, D = Weak, F = Insufficient.",
    "",
    "## Grading discipline (anti-inflation)",
    "1. Grade A is RARE. A well-written, board-approved policy that lacks executed audit logs, signed completed reviews, populated KPI trackers, or quantified numerical thresholds typically peaks at B, not A.",
    "2. Before assigning A on any dimension, identify and quote the specific evidence-of-execution artifact that justifies it. If you cannot quote one, assign B.",
    "3. Default to the LOWER grade when between two grades.",
    "4. Pure 'we shall'/'we will'/'must'/'should' language is policy intent — it caps at B on relevance and completeness, however thoroughly the topic is covered.",
    "5. Qualitative risk scales (High/Medium/Low) do NOT count as quantified thresholds for specificity grade A.",
    "6. The OVERALL grade is holistic — weigh the dimensions with judgement (relevance and completeness matter most), do NOT mechanically average.",
    "",
    "## Judging RECENCY and RELIABILITY from metadata",
    "You are given today's date, the file's upload date, expiry date, file type, and a parse-fidelity signal (how cleanly the document text was extracted).",
    "- RECENCY: judge from upload/effective/expiry dates and any dated content. If no dates exist anywhere, grade D (cannot confirm currency), not F.",
    "- RELIABILITY: judge from approval/signature/version signals, draft status, and parse fidelity. Low parse fidelity or draft/unsigned status lowers the grade.",
    "",
    "## Hard rules",
    "- Anchor every grade to a rubric anchor and cite the concrete signal in the rationale.",
    "- Your rationale should identify what is MISSING for the next grade up, unless you assigned A.",
    "- If the document is shorter than ~150 readable words, garbled, or clearly off-topic for AI governance/compliance, set abstain_reason and grade every dimension and overall as F.",
    "- Do NOT invent text. evidence_quote MUST be a verbatim substring of the document.",
    "",
    "## RELEVANCE rubric",
    formatRubric("relevance"),
    "",
    "## COMPLETENESS rubric",
    formatRubric("completeness"),
    "",
    "## RECENCY rubric",
    formatRubric("recency"),
    "",
    "## RELIABILITY rubric",
    formatRubric("reliability"),
    "",
    "## SPECIFICITY rubric",
    formatRubric("specificity"),
    "",
    "## Calibration examples",
    "- A board-approved EU AI Act policy citing Articles 10/13/14/15, named owner (CAIGO), version 3.2, qualitative risk matrix, uploaded 2 months ago, clean parse, but NO completed audit logs and NO numerical SLAs → relevance B, completeness B, recency A, reliability A, specificity B, overall B.",
    "- The SAME policy plus a populated audit table (6 months of monthly reviews with signoffs) plus quantified thresholds ('bias <5%', 'response within 24h') → relevance A, completeness A, recency A, reliability A, specificity A, overall A.",
    "- A 2-page draft 'AI Ethics Policy', no version, no owner, generic 'we are committed to fairness', low parse fidelity, no dates → relevance D, completeness F, recency D, reliability D, specificity D, overall D.",
    "",
    "## Filename check",
    "Compare the given filename against what the document content is actually about.",
    "Set filename_check.mismatch=true ONLY when the name is clearly misleading or generic relative to the content (e.g. 'Untitled.docx', 'scan001.pdf', 'final_v2_FINAL.pdf', or a name describing a different topic than the content).",
    "When true, suggested_filename must be short, descriptive, and keep the original extension; reason must be one plain-language sentence.",
    "When the name is already reasonably descriptive, set mismatch=false with suggested_filename and reason both null. Do not flag stylistic nitpicks (casing, dashes vs underscores).",
    "",
    "## Compliance areas (normalized labels)",
    "Use canonical title-case labels. Prefer: 'Risk management', 'Data governance', 'Human oversight', 'Transparency', 'Accountability', 'Robustness', 'Security', 'Privacy', 'Bias and fairness', 'Incident management', 'Training', 'Vendor management', 'Model monitoring', 'Documentation', 'Audit'.",
    "Add custom labels only when none fits. Maximum 10 labels.",
    "",
    "## Output",
    "Return JSON exactly matching the requested schema. Be terse, factual, evidence-grounded.",
  ].join("\n");
}

function formatRubric(dim: keyof typeof RUBRIC): string {
  return RUBRIC[dim].map((r) => `- ${r.grade}: ${r.anchor}`).join("\n");
}

/**
 * User-prompt template — the document and supplemental metadata.
 * The document is normalized + truncated upstream in analyzer.service.
 */
export function buildAnalyzerUserPrompt(input: {
  documentText: string;
  filename: string;
  fileType: string;
  uploadDate: string | null;
  expiryDate: string | null;
  parseFidelity?: "high" | "medium" | "low";
  characterCount: number;
}): string {
  const meta = [
    `today: ${new Date().toISOString().slice(0, 10)}`,
    `filename: ${input.filename}`,
    `file_type: ${input.fileType}`,
    `character_count: ${input.characterCount}`,
    `parse_fidelity: ${input.parseFidelity ?? "unknown"}`,
    input.uploadDate ? `upload_date: ${input.uploadDate}` : "upload_date: unknown",
    input.expiryDate ? `expiry_date: ${input.expiryDate}` : "expiry_date: none",
  ].join("\n");

  return [
    "Analyze the following compliance evidence document.",
    "",
    "## Metadata",
    meta,
    "",
    "## Document content (verbatim)",
    "```",
    input.documentText,
    "```",
    "",
    "Grade relevance, completeness, recency, reliability, specificity (A–F each) and an overall grade. Return JSON.",
  ].join("\n");
}

/**
 * Control-matcher prompt — given an analysis and candidate controls,
 * the LLM scores each candidate's match strength.
 */
export function buildControlMatcherSystemPrompt(): string {
  return [
    "You are VerifyWise's Control Match Scorer.",
    "",
    "Given an evidence analysis (summary + key findings + compliance areas) and a candidate list of compliance controls, you score how strongly the evidence supports each control.",
    "",
    "## Scoring rules",
    "- 90-100: The evidence directly satisfies the control's requirement. The summary or findings explicitly cover the control's intent.",
    "- 70-89: Strong supporting evidence. The control's intent is well-covered but a minor element is missing.",
    "- 50-69: Partial support. The evidence touches the topic but a reviewer would need additional documents.",
    "- 0-49: Weak link. SKIP these — do not include them in the matches array.",
    "",
    "## Hard rules",
    "- Use ONLY control_ids from the provided candidate list. Do NOT invent ids.",
    "- Skip any control with score < 50. Do NOT pad the list.",
    "- Each match MUST cite which compliance area(s) link the evidence to the control.",
    "- Sort matches by descending match_score.",
  ].join("\n");
}

export function buildControlMatcherUserPrompt(input: {
  summary: string;
  keyFindings: string[];
  complianceAreas: string[];
  candidates: Array<{
    control_id: number;
    framework_type: string;
    control_title: string;
    control_description?: string;
  }>;
}): string {
  const findingsList = input.keyFindings
    .slice(0, 5)
    .map((f, i) => `${i + 1}. ${f}`)
    .join("\n");

  const candidatesList = input.candidates
    .map(
      (c) =>
        `- id=${c.control_id} [${c.framework_type}] ${c.control_title}${
          c.control_description ? `: ${c.control_description.slice(0, 180)}` : ""
        }`,
    )
    .join("\n");

  return [
    "## Evidence Analysis",
    `Summary: ${input.summary}`,
    "",
    "Key findings:",
    findingsList || "(none)",
    "",
    `Compliance areas: ${input.complianceAreas.join(", ") || "(none)"}`,
    "",
    "## Candidate controls",
    candidatesList,
    "",
    "Score each candidate. Skip <50. Return JSON.",
  ].join("\n");
}
