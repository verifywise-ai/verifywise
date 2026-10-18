/**
 * Stance composition: the document model the customer holds after a run.
 * Pure computation; rendering is a separate step.
 *
 * The module records the customer's determination and makes none of its own.
 * Each veto answer is quoted in the customer's words with the person who
 * answered it and the date, and the document says the determination was not
 * verified. Scope is read from the readiness result and the answers, never
 * from `gates.mayGenerate`, which stays true for a tool outside the rule so
 * that such a customer still receives a document.
 *
 * A run that stored a stop has no result. The stance then names each stop and
 * reports no figures, so nothing is shown that was not computed.
 */
import { LL144_QUESTIONS } from "../../../structures/NYC-Local-Law-144/intake.questions";
import type { AnswerWithNotes } from "../applicability";
import type { AnswerGateResult } from "../answerGates";
import type { DerivedBasis } from "../deriveBasis";
import type { ReadinessResult } from "../readinessScore";
import { FORBIDDEN_WORDS } from "./vocabulary";
import type { BiasAuditResult, GateFinding, OrderFinding } from "../index";

export interface StanceSection {
  key: string;
  title: string;
  body: string;
  /**
   * Customer-authored strings that appear verbatim in `body`: answer notes,
   * the tool name and the names of the people who answered. The renderer
   * puts each in one structural marker that the vocabulary lint skips, so
   * the customer's words are never altered and everything else is linted.
   */
  customerText?: CustomerSpan[];
}

/**
 * A customer-authored string and the exact text around it in the body. The
 * renderer finds `lead + text + tail` and marks only `text`, so a short note
 * such as "No" is never marked inside some other word.
 */
export interface CustomerSpan {
  lead: string;
  text: string;
  tail: string;
}

/**
 * Who did something (answered a question, attested the profile) and when.
 * With no name to print, `reason` says why: the user is no longer in the
 * organization ("departed"), or is but has no recorded name ("unnamed").
 */
export type StanceAttribution =
  { user: string; date: string } | { user: null; date: string; reason: "departed" | "unnamed" };

export interface StanceModel {
  heading: string;
  scope: "in_scope" | "out_of_scope" | "undetermined";
  sections: StanceSection[];
  blankFields: Array<{ field: string; instruction: string }>;
  openItems: string[];
  expiry: { date: string | null; trigger: string };
  derivedBasis: DerivedBasis | null;
  /** Who attested the profile and when; the attestation stands either way. */
  attestation: StanceAttribution | null;
}

export interface ComposeStanceArgs {
  projectName: string;
  readiness: ReadinessResult;
  gates: AnswerGateResult;
  answers: AnswerWithNotes;
  /**
   * The user and date of each answer, by question key. Carried-forward
   * answers keep their original author. A key with no entry has no recorded
   * date.
   */
  answerAuthors: Record<string, StanceAttribution>;
  result: BiasAuditResult | null;
  gateFindings: GateFinding[];
  order: OrderFinding[];
  expiry: { date: string | null; trigger: string };
  derivedBasis: DerivedBasis | null;
  attestation: StanceAttribution | null;
  jobDescriptionKey: string | null;
}

export const REQUIRED_SECTIONS = [
  "scope",
  "party",
  "basis",
  "what_was_tested",
  "results",
  "open_items",
  "independence",
  "expiry",
  "data_relied_on",
] as const;

const CONVENTION_NOTE =
  "The 0.80 line is the four-fifths convention from federal employment-selection guidance. " +
  "The rule does not adopt it as a threshold, so a ratio below it is reported here as a finding " +
  "for the deploying party to consider, not as a conclusion.";

const NOT_VERIFIED =
  "VerifyWise recorded this answer and did not verify it. The determination belongs to the " +
  "deploying party.";

const CATEGORY_LABEL: Record<string, string> = {
  sex: "Sex",
  race_ethnicity: "Race and ethnicity",
  intersectional: "Intersectional categories",
};

const BASIS_LABEL: Record<string, string> = {
  historical: "historical data",
  test_volume: "test data, because historical volume is too low",
  test_attribute: "test data, because the characteristic is not captured",
  test_availability: "test data, because historical data is not available to you",
  not_applicable: "not applicable",
};

function optionLabel(key: string, value: string | null): string {
  const option = LL144_QUESTIONS.find((q) => q.key === key)?.options.find((o) => o.value === value);
  return option?.label ?? value ?? "";
}

/**
 * Short wording for an open item whose question text carries a word the
 * document never uses, keyed by question.
 */
const OPEN_ITEM_TEXT: Record<string, string> = {
  "history.prior_audit":
    "Say whether this tool has had a bias review before, and whether it has changed since.",
};

function openItemText(key: string, prompt: string): string {
  const text = OPEN_ITEM_TEXT[key] ?? prompt;
  const lower = text.toLowerCase();
  return FORBIDDEN_WORDS.some((w) => lower.includes(w))
    ? `Answer the question recorded as ${key}.`
    : text;
}

/** What the customer was told the chosen option means, which names the rule's limb. */
function chosenConsequence(key: string, value: string | null | undefined): string {
  const option = LL144_QUESTIONS.find((q) => q.key === key)?.options.find((o) => o.value === value);
  return option?.consequence ?? "";
}

function questionPrompt(key: string): string {
  return LL144_QUESTIONS.find((q) => q.key === key)?.prompt ?? key;
}

/**
 * Our own wording of who answered: by name, or, for a user found in the
 * organization with no recorded name, said so as the attestation line says
 * it. An author no longer in the organization, or an answer with no date,
 * is not recorded.
 */
function authorLine(author: StanceAttribution | undefined): string {
  if (author?.user) return `Answered by ${author.user} on ${author.date}.`;
  if (author && author.user === null && author.reason === "unnamed") {
    return `Answered on ${author.date} by a user with no recorded name.`;
  }
  return "The author and date of this answer are not recorded.";
}

/** One veto answer in the customer's words, with who answered it and when. */
function vetoBlock(args: ComposeStanceArgs, key: string): string {
  const answer = args.answers[key];
  const lines = [`Question: ${questionPrompt(key)}`];
  if (!answer || (answer.value === null && !answer.dontKnow)) {
    lines.push("Answer: not given.");
    return lines.join("\n");
  }
  lines.push(
    answer.dontKnow ? "Answer: I don't know." : `Answer: ${optionLabel(key, answer.value)}.`,
  );
  if (answer.notes) lines.push(`In your words: "${answer.notes}"`);
  lines.push(authorLine(args.answerAuthors[key]));
  return lines.join("\n");
}

function fixed(n: number | null): string {
  return n === null ? "not computed" : n.toFixed(2);
}

/**
 * An impact ratio to two decimals, truncated rather than rounded, so a ratio
 * flagged below the 0.80 convention (say 0.7996) never reads "0.80". Ratios
 * are stored at six decimals, so `toFixed(6)` reproduces them before the cut.
 */
function ratioText(n: number | null): string {
  if (n === null) return "not computed";
  const [whole, fraction = ""] = n.toFixed(6).split(".");
  return `${whole}.${fraction.slice(0, 2)}`;
}

function resultsBody(args: ComposeStanceArgs): string {
  const { result, gateFindings } = args;
  if (result === null) {
    const stops = gateFindings.filter((f) => f.severity === "stop");
    const lines = ["No ratios were computed for this run. It stopped for the following reasons."];
    for (const s of stops) lines.push(`- ${s.message}`);
    if (stops.length === 0) lines.push("- No result is stored for this run.");
    return lines.join("\n");
  }
  const rateName = result.metric === "scoring_rate" ? "scoring rate" : "selection rate";
  const lines: string[] = [CONVENTION_NOTE, ""];
  for (const table of result.tables) {
    lines.push(table.title);
    for (const r of table.rows) {
      const note = r.excluded
        ? " (excluded from ratios as a small sample)"
        : r.flagged
          ? " (below the 0.80 convention)"
          : "";
      lines.push(
        `- ${r.categoryName}: ${r.applicantCount} individuals, ${rateName} ${fixed(r.selectionRate)}, ` +
          `impact ratio ${ratioText(r.impactRatio)}${note}`,
      );
    }
    lines.push("");
  }
  lines.push(`Total individuals assessed: ${result.totalApplicants}.`);
  lines.push(
    `Individuals whose category is unknown: ${result.unknownCount}. This number is stated because ` +
      "5-301(c) asks for it.",
  );
  return lines.join("\n").trim();
}

function basisBody(args: ComposeStanceArgs): string {
  const parts = [vetoBlock(args, "data.held")];
  const d = args.derivedBasis;
  if (d) {
    parts.push(
      [
        d.summary,
        ...d.perCategory.map(
          (c) =>
            `- ${CATEGORY_LABEL[c.category] ?? c.category}: ${BASIS_LABEL[c.basis] ?? c.basis}`,
        ),
        d.confirmed
          ? "You have confirmed this reading."
          : "This is our reading of your answers, not something you stated. It is not yet confirmed.",
      ].join("\n"),
    );
  }
  return parts.join("\n\n");
}

function dataBody(args: ComposeStanceArgs): string {
  const lines: string[] = [];
  if (args.result) {
    lines.push(`Individuals in the file: ${args.result.totalApplicants}.`);
    lines.push(`Individuals whose category is unknown: ${args.result.unknownCount}.`);
  } else {
    lines.push("No result is stored for this run, so no data summary is given.");
  }
  const findings = args.gateFindings.filter((f) => f.severity !== "stop");
  if (findings.length > 0) {
    lines.push("", "Findings recorded when the file was read:");
    for (const f of findings) lines.push(`- ${f.message}`);
  }
  if (args.order.length > 0) {
    lines.push("", "Row-order check by attribute:");
    for (const o of args.order) {
      lines.push(
        `- ${o.attribute}: ${o.observedRuns} runs observed against ${o.expectedRuns} expected` +
          `${o.blocked ? ", which withholds the export" : ""}`,
      );
    }
  }
  return lines.join("\n");
}

/** `args.expiry.trigger` already joins the per-category triggers, so it is printed once. */
function expiryBody(args: ComposeStanceArgs): string {
  const lines = [
    args.expiry.date
      ? `This result expires on ${args.expiry.date} (5-301(a)).`
      : "No expiry date is recorded for this result.",
  ];
  if (args.expiry.trigger) {
    lines.push(args.expiry.trigger);
  } else {
    for (const c of args.derivedBasis?.perCategory ?? []) {
      if (c.expiryTrigger) lines.push(c.expiryTrigger);
    }
  }
  return lines.join("\n");
}

/** Notes the gates collected from one question, by the question that emitted them. */
function notesFrom(args: ComposeStanceArgs, test: (key: string | undefined) => boolean): string[] {
  return args.gates.consequences
    .filter((c) => c.kind === "scope_note" && test(c.sourceKey))
    .map((c) => c.text);
}

const isIndependenceKey = (k: string | undefined) => k === "independence.auditor";
const isPartyKey = (k: string | undefined) => k === "role.party";
const isScopeKey = (k: string | undefined) => !isIndependenceKey(k) && !isPartyKey(k);

function readinessBody(args: ComposeStanceArgs): string {
  return (
    `Readiness score: ${args.readiness.score ?? "not computed"} of 100. ` +
    "This is VerifyWise's own measure of how ready you are to commission an independent audit. " +
    "No regulator recognises it, and it is not a finding of compliance."
  );
}

function testedBody(args: ComposeStanceArgs): string {
  const role = args.jobDescriptionKey
    ? `Job description tested: ${args.jobDescriptionKey.replace(/-/g, " ")}.`
    : "Job description tested: not recorded.";
  const lines = [
    role,
    "The result describes the tool on that role, as run on the file supplied. It is not across other roles or other uses of the tool.",
  ];
  const limits = args.gates.consequences.filter((c) => c.kind === "limitation");
  if (limits.length > 0) {
    lines.push("", "Limits recorded from your answers:");
    for (const l of limits) lines.push(`- ${l.text}`);
  }
  return lines.join("\n");
}

function independenceBody(args: ComposeStanceArgs): string {
  return [
    vetoBlock(args, "independence.auditor"),
    ...notesFrom(args, isIndependenceKey),
    "5-300 calls for an independent auditor. What is described here was run by the party named above through this module, and the document should be read with that in mind.",
  ].join("\n\n");
}

function openItemsOf(args: ComposeStanceArgs, scope: StanceModel["scope"]): string[] {
  const items: string[] = [];
  if (scope === "undetermined") {
    for (const k of args.readiness.missingVetoes) items.push(`Answer: ${questionPrompt(k)}`);
    return items;
  }
  if (scope === "out_of_scope") return items;
  for (const o of args.readiness.openItems) {
    items.push(`Not established: ${openItemText(o.key, o.prompt)}`);
  }
  if (args.derivedBasis && !args.derivedBasis.confirmed) {
    items.push("Confirm or correct how we read your answers about the data you hold.");
  }
  if (args.result === null) {
    for (const f of args.gateFindings.filter((x) => x.severity === "stop")) items.push(f.message);
  }
  for (const o of args.order.filter((x) => x.blocked)) {
    items.push(`Row-order check for ${o.attribute} withholds the export until it is resolved.`);
  }
  return items;
}

function listBody(items: string[]): string {
  return items.length === 0 ? "None recorded." : items.map((i) => `- ${i}`).join("\n");
}

/** Customer-authored strings in a section body, found by the exact text this file wrote. */
function withCustomerText(args: ComposeStanceArgs, section: StanceSection): StanceSection {
  const candidates: CustomerSpan[] = [];
  for (const a of Object.values(args.answers)) {
    if (a.notes) candidates.push({ lead: `In your words: "`, text: a.notes, tail: `"` });
  }
  for (const author of Object.values(args.answerAuthors)) {
    if (author.user) {
      candidates.push({ lead: "Answered by ", text: author.user, tail: ` on ${author.date}.` });
    }
  }
  if (args.projectName) candidates.push({ lead: "Tool: ", text: args.projectName, tail: "." });

  const seen = new Set<string>();
  const found = candidates.filter((c) => {
    const id = `${c.lead}\u0000${c.text}\u0000${c.tail}`;
    if (seen.has(id) || !section.body.includes(c.lead + c.text + c.tail)) return false;
    seen.add(id);
    return true;
  });
  return found.length > 0 ? { ...section, customerText: found } : section;
}

export function composeStance(args: ComposeStanceArgs): StanceModel {
  const model = composeSections(args);
  return { ...model, sections: model.sections.map((s) => withCustomerText(args, s)) };
}

function composeSections(args: ComposeStanceArgs): StanceModel {
  const scope = args.readiness.scope;
  const openItems = openItemsOf(args, scope);
  const sections: StanceSection[] = [];

  if (scope === "out_of_scope") {
    sections.push({
      key: "scope",
      title: "Scope determination",
      body: [
        `Tool: ${args.projectName}.`,
        vetoBlock(args, "scope.weighting"),
        chosenConsequence("scope.weighting", args.answers["scope.weighting"]?.value),
        ...notesFrom(args, isScopeKey),
        NOT_VERIFIED,
        "A change in how the output is used may bring the tool into scope. Revisit this determination if the use changes.",
      ]
        .filter((p) => p !== "")
        .join("\n\n"),
    });
    sections.push({
      key: "party",
      title: "Party",
      body: [vetoBlock(args, "role.party"), ...notesFrom(args, isPartyKey)].join("\n\n"),
    });
    sections.push({ key: "open_items", title: "Open items", body: listBody(openItems) });
    sections.push({
      key: "expiry",
      title: "Expiry",
      body: "No basis expiry applies to a scope determination. Revisit it if the way the output is used changes.",
    });
    return {
      heading: "Scope determination",
      scope,
      sections,
      blankFields: [],
      openItems,
      expiry: { date: null, trigger: "" },
      derivedBasis: null,
      attestation: args.attestation,
    };
  }

  sections.push({
    key: "scope",
    title: "Scope",
    body: [
      `Tool: ${args.projectName}.`,
      scope === "undetermined"
        ? "Scope is not established: a required answer is missing."
        : vetoBlock(args, "scope.weighting"),
      NOT_VERIFIED,
      ...notesFrom(args, isScopeKey),
    ].join("\n\n"),
  });
  sections.push({
    key: "party",
    title: "Party",
    body: [vetoBlock(args, "role.party"), ...notesFrom(args, isPartyKey)].join("\n\n"),
  });

  if (scope === "undetermined") {
    sections.push({ key: "open_items", title: "Open items", body: listBody(openItems) });
    return {
      heading: "Scope not established",
      scope,
      sections,
      blankFields: [],
      openItems,
      expiry: args.expiry,
      derivedBasis: null,
      attestation: args.attestation,
    };
  }

  sections.push({ key: "readiness", title: "Readiness", body: readinessBody(args) });
  sections.push({ key: "basis", title: "Basis for the data", body: basisBody(args) });
  sections.push({ key: "what_was_tested", title: "What was tested", body: testedBody(args) });
  sections.push({ key: "results", title: "Results", body: resultsBody(args) });
  sections.push({ key: "open_items", title: "Open items", body: listBody(openItems) });
  sections.push({ key: "independence", title: "Independence", body: independenceBody(args) });
  sections.push({ key: "expiry", title: "Expiry", body: expiryBody(args) });
  sections.push({ key: "data_relied_on", title: "Data relied on", body: dataBody(args) });

  const blankFields = args.gates.consequences
    .filter((c) => c.kind === "blank_field" && c.payload?.field)
    .map((c) => ({ field: c.payload!.field, instruction: c.text }));
  if (args.jobDescriptionKey === null) {
    blankFields.push({
      field: "job_description",
      instruction: "Job description tested: to be completed by the party that ran the test.",
    });
  }

  return {
    heading: "Result",
    scope,
    sections,
    blankFields,
    openItems,
    expiry: args.expiry,
    derivedBasis: args.derivedBasis,
    attestation: args.attestation,
  };
}
