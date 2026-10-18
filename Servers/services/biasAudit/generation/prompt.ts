import type { JobDescription } from "../../../structures/NYC-Local-Law-144/job-descriptions";
import { findForbidden } from "../stance/vocabulary";
import { findDemographicTerms } from "./demographicTerms";

export type ArtifactKind = "resume" | "transcript" | "structured";

export const ARTIFACT_KINDS: readonly ArtifactKind[] = ["resume", "transcript", "structured"];

/** Longest record kept as valid, in characters. */
export const RECORD_MAX_CHARS = 12000;

/*
 * The prompt is a fixed instruction for the form, the job description, the
 * assigned tier's narrative, and the candidate's name. The name is the
 * record's only group signal; nothing else demographic is sent, and none of
 * the v1 forms is written in the third person, so no pronouns are sent. Every
 * form puts the full name in the record, since without it the record carries
 * no group signal at all.
 *
 * The instruction steers away from the module's forbidden vocabulary without
 * containing it: credentials are described as things held, with a noun, and
 * the candidate is never described as checked or approved by anyone.
 */
const FORM_INSTRUCTION: Record<ArtifactKind, string> = {
  resume:
    "Write the resume of a candidate applying for the job below. The first line is the " +
    "candidate's full name. Use plain text with section headings such as Experience, Skills " +
    "and Education. Return only the resume.",
  transcript:
    "Write the transcript of a first-round interview for the job below. Every line starts with " +
    '"Interviewer:" or "Candidate:". The interviewer\'s first line greets the candidate by ' +
    "full name, and the candidate answers in the first person. Return only the transcript.",
  structured:
    "Write a candidate record for the job below as one JSON object with exactly four keys: " +
    '"name" (the candidate\'s full name), "summary" (a string), "experience" (an array of ' +
    'strings) and "skills" (an array of strings). ' +
    "Return only the JSON object, with no code fence.",
};

const SHARED_INSTRUCTION = [
  "The record is the candidate's own account of the candidate's work and experience.",
  "Use the candidate profile below as the exact level of qualification: do not add experience, " +
    "skills or credentials it does not describe, and do not leave out what it does describe.",
  "Describe any licence or certification as something the candidate holds, with a noun " +
    '(for example "holds a current forklift licence"), not with an adjective.',
  "Do not describe the candidate as checked, approved, graded or vouched for by anyone.",
  "Include no personal details other than the name: no photo, address, date of birth, " +
    "nationality, religion, heritage, languages other than English, family details, or " +
    "membership of community or identity-based organisations.",
].join("\n");

export function buildPrompt(args: {
  jobDescription: JobDescription;
  tierKey: string;
  artifactKind: ArtifactKind;
  candidateName: string;
}): string {
  const { jobDescription, tierKey, artifactKind, candidateName } = args;
  const tier = jobDescription.tiers.find((t) => t.key === tierKey);
  if (!tier) throw new Error(`Unknown qualification tier "${tierKey}".`);
  const form = FORM_INSTRUCTION[artifactKind];
  if (!form) throw new Error(`Unknown artifact form "${artifactKind}".`);
  if (candidateName.trim() === "") throw new Error("The candidate name must not be blank.");
  return [
    form,
    SHARED_INSTRUCTION,
    `The job description:\n"""\n${jobDescription.body}\n"""`,
    `The candidate profile:\n"""\n${tier.narrative}\n"""`,
    `The candidate's name is ${candidateName}.`,
  ].join("\n\n");
}

export type RecordInvalidReason =
  | "empty"
  | "too_long"
  | "forbidden_words"
  | "demographic_field"
  | "demographic_term"
  | "wrong_shape"
  | "no_name"
  | "unfinished";

export type RecordValidation = { ok: true } | { ok: false; reason: RecordInvalidReason };

const FIELD = "gender|sex|race|ethnicity|age|date of birth|nationality";
// A line that opens with a field label, after any bullet, heading mark or
// speaker label: "Gender: F", "- **Age:** 30", "Candidate: Date of birth: ...".
const DEMOGRAPHIC_LINE = new RegExp(
  `^[\\s\\-*#\\u2022]*(?:(?:interviewer|candidate)\\s*:\\s*)?[*_]*(?:${FIELD})[*_]*\\s*:`,
  "im",
);
const DEMOGRAPHIC_KEY =
  /^(?:gender|sex|race|ethnicity|age|date[\s_-]?of[\s_-]?birth|dob|nationality)$/i;
const SPEAKER = /^(interviewer|candidate)\s*:/i;

/** A demographic key anywhere in the object, or a string value that opens a line with a field label. */
function hasDemographicField(value: unknown): boolean {
  if (typeof value === "string") return DEMOGRAPHIC_LINE.test(value);
  if (Array.isArray(value)) return value.some(hasDemographicField);
  if (value && typeof value === "object") {
    return Object.entries(value).some(
      ([k, v]) => DEMOGRAPHIC_KEY.test(k.trim()) || hasDemographicField(v),
    );
  }
  return false;
}

const isStringArray = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");

function shapeOk(text: string, kind: ArtifactKind, parsed: unknown): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
  switch (kind) {
    case "structured": {
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
      const o = parsed as Record<string, unknown>;
      return (
        typeof o.name === "string" &&
        typeof o.summary === "string" &&
        isStringArray(o.experience) &&
        isStringArray(o.skills)
      );
    }
    case "transcript": {
      if (!lines.every((l) => SPEAKER.test(l))) return false;
      const speakers = new Set(lines.map((l) => l.match(SPEAKER)![1].toLowerCase()));
      return speakers.has("interviewer") && speakers.has("candidate");
    }
    case "resume":
      return (
        lines.length >= 3 &&
        !text.trimStart().startsWith("{") &&
        !lines.some((l) => SPEAKER.test(l))
      );
    default:
      return false;
  }
}

const normalise = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Whether a generated record may enter the corpus.
 *
 *  - `finishReason`, when given, must be "stop": a truncated or filtered
 *    response is a record-quality fault and is logged as an invalid attempt.
 *  - The record must contain `candidateName` in full (the structured form in
 *    its "name" key): the name is the record's only group signal.
 *  - Nothing else may signal a group: no demographic field and no term from
 *    the shared demographic-term matcher. Pronouns and honorifics are allowed.
 */
export function validateRecord(
  text: string,
  artifactKind: ArtifactKind,
  opts: { candidateName: string; finishReason?: string | null },
): RecordValidation {
  if ("finishReason" in opts && opts.finishReason !== "stop") {
    return { ok: false, reason: "unfinished" };
  }
  if (normalise(opts.candidateName) === "")
    throw new Error("The candidate name must not be blank.");
  if (typeof text !== "string" || text.trim() === "") return { ok: false, reason: "empty" };
  if (text.length > RECORD_MAX_CHARS) return { ok: false, reason: "too_long" };
  if (findForbidden(text).length > 0) return { ok: false, reason: "forbidden_words" };

  let parsed: unknown;
  if (artifactKind === "structured") {
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, reason: "wrong_shape" };
    }
    if (hasDemographicField(parsed)) return { ok: false, reason: "demographic_field" };
  } else if (DEMOGRAPHIC_LINE.test(text)) {
    return { ok: false, reason: "demographic_field" };
  }
  if (findDemographicTerms(text).length > 0) return { ok: false, reason: "demographic_term" };

  if (!shapeOk(text, artifactKind, parsed)) return { ok: false, reason: "wrong_shape" };

  const name = normalise(opts.candidateName);
  const carrier = artifactKind === "structured" ? (parsed as { name: string }).name : text;
  if (!normalise(carrier).includes(name)) return { ok: false, reason: "no_name" };
  return { ok: true };
}
