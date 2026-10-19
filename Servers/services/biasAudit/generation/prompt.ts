import type { JobDescription } from "../../../structures/NYC-Local-Law-144/job-descriptions";
import { findForbidden } from "../stance/vocabulary";
import { findDemographicTerms } from "./demographicTerms";
import { TABLE_SURNAMES, THIRD_PARTY_FIRST_NAMES } from "./names";

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
  "Name no person other than the candidate: refer to anyone else by role only " +
    '(for example "my manager" or "a customer").',
  "Do not name an employer, school, restaurant or organisation whose name states a " +
    "nationality, a cuisine, a religion or a cultural or ancestral group; describe it " +
    'generically instead (for example "a regional airline" or "a family restaurant").',
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
  | "third_party_name"
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

const escapeRegExp = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * For name matching: accents, ʻokina (U+02BB), modifier apostrophe (U+02BC),
 * typographic and ASCII apostrophes, backtick, acute (U+00B4) and hyphens out, so
 * "José García" reads "Jose Garcia", "Kaʻawa" and "Ka'awa" read "Kaawa", and
 * "Jean-Baptiste" reads "JeanBaptiste". Applied to both sides.
 */
const foldName = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[\u02BB\u02BC\u2018\u2019'`\u00B4\u2010\u2011-]/g, "");

const startsUpper = (w: string) => /^\p{Lu}/u.test(w);

/**
 * Every part of the name as a whole word, in any order, accents and
 * punctuation folded. The word must start with a capital, so "a line cook" is
 * not the surname Cook and "le" is not Le; any further case is allowed, so a
 * header in capitals carries the name.
 */
function carriesName(text: string, candidateName: string): boolean {
  const words = new Set(
    (foldName(text).match(/\p{L}+/gu) ?? []).filter(startsUpper).map((w) => w.toLowerCase()),
  );
  return foldName(candidateName)
    .split(/\s+/)
    .filter((part) => part !== "")
    .every((part) => words.has(part.toLowerCase()));
}

const alternation = (names: Iterable<string>) =>
  [...names].map((n) => escapeRegExp(foldName(n))).join("|");
// A table first name directly followed by a table surname: a person.
const THIRD_PARTY_NAME = new RegExp(
  `(?<!\\p{L})(${alternation(THIRD_PARTY_FIRST_NAMES)})\\s+(${alternation(TABLE_SURNAMES)})(?!\\p{L})`,
  "giu",
);
// Institutions named after a person are not people.
// Up to two more capitalised words may sit between the name and the noun
// ("Mary Washington Memorial Hospital", "John Marshall High School").
const INSTITUTION_NOUNS = [
  "University",
  "College",
  "School",
  "Hospital",
  "Community",
  "Memorial",
  "High",
  "Middle",
  "Elementary",
  "Medical",
  "Academy",
  "Institute",
  "Center",
  "Centre",
  "Library",
  "Park",
  "Clinic",
].flatMap((n) => [n, n.toUpperCase(), n.toLowerCase()]);
// "Jr." may sit between the name and the noun ("Martin Luther King Jr. Library").
const INSTITUTION_AFTER = new RegExp(
  `^(?:\\s+\\p{Lu}\\p{L}*\\.?){0,2}?\\s+(?:${INSTITUTION_NOUNS.join("|")})(?!\\p{L})`,
  "u",
);
const INSTITUTION_BEFORE = /\buniversity\s+of\s+$/i;

/**
 * Someone other than the candidate, named as a table first name directly
 * followed by a table surname, both capitalised ("Wei Zhang", "PATRICIA
 * NGUYEN"). A lone first name ("Gary, IN") and an institution named after a
 * person ("Thomas Nelson Community College", "University of Mary
 * Washington") are not.
 */
function namesSomeoneElse(text: string, candidateName: string): boolean {
  const [ownFirst, ...rest] = foldName(candidateName).trim().toLowerCase().split(/\s+/);
  const ownSurname = rest.join(" ");
  const folded = foldName(text);
  for (const m of folded.matchAll(THIRD_PARTY_NAME)) {
    const [whole, first, surname] = m;
    if (!startsUpper(first) || !startsUpper(surname)) continue;
    if (first.toLowerCase() === ownFirst && surname.toLowerCase() === ownSurname) continue;
    const at = m.index ?? 0;
    if (INSTITUTION_AFTER.test(folded.slice(at + whole.length))) continue;
    if (INSTITUTION_BEFORE.test(folded.slice(0, at))) continue;
    return true;
  }
  return false;
}

/**
 * The text a structured record's content checks read: its string values and
 * any key beyond the four the form asks for, not the raw JSON (escapes such as é would hide a name or a term), with
 * a "languages" list restated as a Languages line.
 */
const STRUCTURED_KEYS = new Set(["name", "summary", "experience", "skills"]);
// Joins the scanned items so no whitespace run crosses from one into the next.
const ITEM_SEPARATOR = "\n|\n";

function structuredText(value: unknown): string {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      for (const [k, child] of Object.entries(v)) {
        // Any key beyond the form's four is content too ({"spanish": "fluent"}).
        if (!STRUCTURED_KEYS.has(k)) out.push(k);
        if (/^languages?(?:[\s_]spoken)?$/i.test(k.trim())) {
          const listed = Array.isArray(child) ? child : [child];
          out.push(`Languages: ${listed.filter((x) => typeof x === "string").join(", ")}`);
        }
        walk(child);
      }
    }
  };
  walk(value);
  return out.join(ITEM_SEPARATOR);
}

/**
 * Whether a generated record may enter the corpus.
 *
 *  - `finishReason`, when given, must be "stop": a truncated or filtered
 *    response is a record-quality fault and is logged as an invalid attempt.
 *  - The record must contain the candidate's first name and surname, each as
 *    a capitalised whole word, in any order, accents and punctuation folded
 *    (the structured form in its "name" key): the name is the record's only
 *    group signal.
 *  - It may name no one else: a table first name directly followed by a
 *    table surname, other than the candidate's own, is refused.
 *  - Nothing else may signal a group: no demographic field and no term from
 *    the shared demographic-term matcher. Pronouns and honorifics are allowed.
 *  - The prompt steers away from all of this first; only unambiguous cases
 *    are rejected, because a false rejection that falls more on one cell is
 *    worse than a missed extra signal.
 *  - A structured record's content checks read its parsed string values.
 */
export function validateRecord(
  text: string,
  artifactKind: ArtifactKind,
  opts: { candidateName: string; finishReason?: string | null },
): RecordValidation {
  if ("finishReason" in opts && opts.finishReason !== "stop") {
    return { ok: false, reason: "unfinished" };
  }
  if (opts.candidateName.trim() === "") throw new Error("The candidate name must not be blank.");
  if (typeof text !== "string" || text.trim() === "") return { ok: false, reason: "empty" };
  if (text.length > RECORD_MAX_CHARS) return { ok: false, reason: "too_long" };

  let parsed: unknown;
  if (artifactKind === "structured") {
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, reason: "wrong_shape" };
    }
  }
  const content = artifactKind === "structured" ? structuredText(parsed) : text;
  if (findForbidden(content).length > 0 || findForbidden(text).length > 0) {
    return { ok: false, reason: "forbidden_words" };
  }
  if (artifactKind === "structured" ? hasDemographicField(parsed) : DEMOGRAPHIC_LINE.test(text)) {
    return { ok: false, reason: "demographic_field" };
  }
  if (findDemographicTerms(content).length > 0) return { ok: false, reason: "demographic_term" };

  if (!shapeOk(text, artifactKind, parsed)) return { ok: false, reason: "wrong_shape" };

  const carrier = artifactKind === "structured" ? (parsed as { name: string }).name : text;
  if (!carriesName(carrier, opts.candidateName)) return { ok: false, reason: "no_name" };
  if (namesSomeoneElse(content, opts.candidateName)) {
    return { ok: false, reason: "third_party_name" };
  }
  return { ok: true };
}
