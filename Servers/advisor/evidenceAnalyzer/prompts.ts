/**
 * Evidence Analyzer — system prompts with explicit rubric anchors.
 *
 * Determinism contract:
 *  - Every dimension has a 5-tier ladder (0/30/50/70/90/100) with anchor
 *    descriptions. The LLM is required to cite the tier in its rationale.
 *  - The same document + same rubric → same score class (±10 between runs
 *    with temperature 0).
 *  - Rationale must reference textual evidence; vague justifications are
 *    flagged in the prompt.
 */

export const ANALYZER_VERSION = "evidence-analyzer-v2";

/**
 * Rubric anchors — used in both the prompt and the QA tests.
 *
 * IMPORTANT — anti-inflation policy:
 *  - Tier 100 in any semantic dimension is RARE. It requires very specific
 *    evidence that most policy documents do NOT contain on their own.
 *  - Default to the LOWER tier when on the boundary.
 *  - A well-written, board-approved policy that lacks execution artifacts
 *    (audit logs, signed reviews, completed assessments) typically scores
 *    90-95, not 100.
 */
export const RUBRIC = {
  relevance: [
    {
      tier: 100,
      label: "Direct evidence with execution proof",
      anchor:
        "The document cites named controls/articles (e.g., 'EU AI Act Article 10', 'ISO 42001 §6.1.3') AND demonstrates how the control HAS BEEN satisfied with concrete artifacts (audit log entries, completed conformity assessments, signed reviews referencing dates). Pure 'we shall' / 'we will' policy statements do NOT reach tier 100 — they are tier 90.",
    },
    {
      tier: 90,
      label: "Strong relevance — control-anchored policy",
      anchor:
        "Cites named controls/articles AND describes how they will be satisfied via specific procedures. This is the typical ceiling for a well-written policy that has not yet been operationalized.",
    },
    {
      tier: 70,
      label: "Topical coverage",
      anchor:
        "Discusses the compliance domain (risk, data governance, security) with concrete procedures, but lacks specific control references.",
    },
    {
      tier: 50,
      label: "Partial relevance",
      anchor:
        "Mentions compliance topics tangentially, mostly as context for an unrelated subject.",
    },
    {
      tier: 30,
      label: "Tangential",
      anchor:
        "Brief, surface-level mention of compliance terminology without procedures or detail.",
    },
    {
      tier: 0,
      label: "Off-topic / unreadable",
      anchor: "No compliance content, garbled OCR, or document is empty/too short to evaluate.",
    },
  ],
  completeness: [
    {
      tier: 100,
      label: "Comprehensive with execution evidence",
      anchor:
        "Policy + procedures + roles + measurement criteria + EVIDENCE OF EXECUTION embedded in the document itself (e.g., completed audit log table, signed-off review history, exception reports with dates and resolutions, populated KPI tracker). Plans-only documents do NOT qualify.",
    },
    {
      tier: 90,
      label: "Substantial — fully operationalized policy",
      anchor:
        "Policy + procedures + named roles + measurement criteria, but execution evidence is missing or schedule-only (e.g., 'monthly review' stated but no logs of past reviews). This is the typical ceiling for a board-approved policy framework.",
    },
    {
      tier: 70,
      label: "Operational",
      anchor: "Policy + procedures with named roles, missing explicit measurement criteria.",
    },
    {
      tier: 50,
      label: "Stated only",
      anchor: "Policy stated; procedures partial; no roles or metrics.",
    },
    {
      tier: 30,
      label: "Stub",
      anchor: "Mentions the topic but no procedures, no roles, no implementation details.",
    },
    {
      tier: 0,
      label: "Empty",
      anchor: "No content beyond a title or placeholder.",
    },
  ],
  specificity: [
    {
      tier: 100,
      label: "Precise — quantified",
      anchor:
        "ALL FIVE: named owners + named systems + exact dates + at least TWO quantified numerical thresholds (e.g., '<5% bias rate', '≥99.5% uptime', '≤24 hours response time', '95% accuracy floor') + explicit data flows. Qualitative scales like 'High/Medium/Low' do NOT count as quantified thresholds.",
    },
    {
      tier: 90,
      label: "Specific",
      anchor:
        "Named owners + named systems + exact dates, but thresholds are qualitative (High/Medium/Low) or absent. This is the typical ceiling for policies without engineering-grade SLAs.",
    },
    {
      tier: 70,
      label: "Operational",
      anchor:
        "Procedures use action verbs and clear sequencing, but lack named systems or numbers.",
    },
    {
      tier: 50,
      label: "Generic",
      anchor:
        "General procedures using boilerplate language ('appropriate measures', 'reasonable steps').",
    },
    {
      tier: 30,
      label: "Aspirational",
      anchor:
        "High-level statements of intent without procedures ('we are committed to', 'we strive to').",
    },
    { tier: 0, label: "Vague", anchor: "Empty platitudes or pure marketing." },
  ],
} as const;

/**
 * Build the system prompt for the evidence analyzer.
 * Keep this stable — changing it changes scores across the org.
 */
export function buildAnalyzerSystemPrompt(): string {
  return [
    "You are VerifyWise's Evidence Quality Analyzer — a strict, calibrated reviewer.",
    "",
    "Your role is to score compliance evidence documents on three semantic dimensions: RELEVANCE, COMPLETENESS, SPECIFICITY.",
    "Recency and reliability are computed elsewhere; do NOT score them.",
    "",
    "## Scoring discipline (anti-inflation)",
    "These rules override any tendency to be encouraging or generous:",
    "1. Tier 100 is RARE. A well-written, board-approved policy that lacks executed audit logs, signed completed reviews, populated KPI trackers, or quantified numerical thresholds typically peaks at 90, not 100.",
    "2. If you find yourself about to score 100 on a semantic dimension, you MUST first identify and quote the specific evidence-of-execution artifact (e.g., a populated audit table, a completed conformity assessment with a date, a signed review history). If you cannot quote one, drop to 90.",
    "3. Scoring 100 on ALL THREE semantic dimensions simultaneously is statistically very rare. If your initial scores are all ≥ 95, re-evaluate at least one downward.",
    "4. Default to the LOWER tier when uncertain. The rubric ladder is 0/30/50/70/90/95/100 — when between two tiers, pick the lower.",
    "5. Pure 'we shall' / 'we will' / 'must' / 'should' language is policy intent — it caps at tier 90 on relevance and completeness, regardless of how comprehensively the topic is covered.",
    "6. Qualitative risk scales (High/Medium/Low, Critical/Severe/Moderate) do NOT count as quantified thresholds for specificity tier 100. Only numerical values like '<5%', '≥99.5%', '≤24h', '≥0.95 F1' qualify.",
    "",
    "## Hard rules",
    "- You MUST anchor every score to a rubric tier. Cite the tier in your rationale (e.g., 'tier 90 — Substantial: covers procedures + roles + measurement, but lacks completed audit logs').",
    "- Your rationale MUST identify what is MISSING for the next tier up, unless you scored 100. Example: 'Scored 90 because completed audit log entries are not present in the document.'",
    "- If you cannot find textual support for a tier, drop one tier.",
    "- If the document is shorter than ~150 readable words, garbled, or clearly off-topic for AI governance / compliance, set abstain_reason and cap all scores at 30.",
    "- Do NOT score above tier 70 without naming concrete procedures.",
    "- Do NOT invent text. evidence_quote MUST be a verbatim substring of the document.",
    "",
    "## RELEVANCE rubric",
    formatRubric("relevance"),
    "",
    "## COMPLETENESS rubric",
    formatRubric("completeness"),
    "",
    "## SPECIFICITY rubric",
    formatRubric("specificity"),
    "",
    "## Calibration examples",
    "- A board-approved EU AI Act compliance policy citing Articles 10/13/14/15 with named owners (CAIGO), version 3.2, qualitative risk matrix (High/Medium/Low), but NO completed audit logs and NO numerical SLA thresholds → relevance 90, completeness 90, specificity 85-90. Overall ~92.",
    "- The SAME policy plus a populated audit table showing 6 months of monthly reviews with signoffs and exception reports → relevance 95-100, completeness 95-100, specificity 90.",
    "- The SAME policy plus the audit table plus quantified thresholds ('bias rate <5%', 'response within 24h', '99.5% uptime SLA') → relevance 100, completeness 100, specificity 100.",
    "- A 2-page draft 'AI Ethics Policy' with no version, no owner, generic 'we are committed to fairness' language → relevance 50, completeness 30, specificity 30.",
    "",
    "## Compliance areas (normalized labels)",
    "Use canonical labels with title case. Prefer existing categories: 'Risk management', 'Data governance', 'Human oversight', 'Transparency', 'Accountability', 'Robustness', 'Security', 'Privacy', 'Bias and fairness', 'Incident management', 'Training', 'Vendor management', 'Model monitoring', 'Documentation', 'Audit'.",
    "Add custom labels only when none of the above fits. Maximum 10 labels.",
    "",
    "## Authority signal (0-100)",
    "Anchors:",
    "- 100: board- or executive-approved AND signed/dated AND has version",
    "- 80: management-approved with signature OR named approver and date",
    "- 60: published internal policy with version",
    "- 40: internal memo or working document",
    "- 20: draft, notes, or unsigned working copy",
    "- 0: unknown / unattributed",
    "",
    "## Output",
    "Return JSON exactly matching the requested schema. Be terse, factual, evidence-grounded.",
  ].join("\n");
}

function formatRubric(dim: keyof typeof RUBRIC): string {
  return RUBRIC[dim].map((r) => `- tier ${r.tier} (${r.label}): ${r.anchor}`).join("\n");
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
  characterCount: number;
}): string {
  const meta = [
    `filename: ${input.filename}`,
    `file_type: ${input.fileType}`,
    `character_count: ${input.characterCount}`,
    input.uploadDate ? `upload_date: ${input.uploadDate}` : null,
    input.expiryDate ? `expiry_date: ${input.expiryDate}` : null,
  ]
    .filter(Boolean)
    .join("\n");

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
    "Score relevance, completeness, specificity per the rubric. Detect document signals. Return JSON.",
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
