/**
 * Word lists and English copy for the intake live-check rules. The client keeps
 * a line-for-line copy; the shared fixtures in __fixtures__ keep the two equal.
 *
 * Terms match case-insensitively at the start of a word, so "candidate" also
 * matches "candidates". A term ending in "$" must also end the word ("exam$"
 * matches "exam" but not "example"). Rules match English answers only.
 */
import { ANNEX_III_ARTICLE, ARTICLE_5 } from "../euAiActClassification/score.v2";

/** Whole answers (trimmed, any case) that say nothing yet. */
export const PLACEHOLDER_ANSWERS = [
  "tbd",
  "tba",
  "n/a",
  "na",
  "not sure",
  "unknown",
  "none",
  "-",
  "?",
  "to be decided",
];

/** A textarea answer shorter than this, after trimming, is too short. */
export const MIN_TEXTAREA_LENGTH = 20;

/**
 * A match is ignored when one of these is among the three words before it in
 * the same sentence (Article 5 and Annex III only).
 */
export const NEGATION_WORDS = ["no", "not", "never", "without"];

const WORK_OR_EDUCATION = [
  "workplace",
  "at work$",
  "employee",
  "staff",
  "worker",
  "job",
  "candidate",
  "applicant",
  "interview",
  "recruit",
  "hiring",
  "student",
  "pupil",
  "school",
  "classroom",
  "university",
  "exam$",
  "exams$",
];

/**
 * Article 5 practices, keyed like ARTICLE_5. Each practice is a list of term
 * groups; every group needs a match in the same answer.
 */
export const ARTICLE_5_TERMS: Record<string, string[][]> = {
  manipulation: [
    [
      "subliminal",
      "manipulative",
      "dark pattern",
      "deceptive technique",
      "manipulate users",
      "manipulate people",
    ],
  ],
  exploit_vulnerabilities: [
    ["exploit", "take advantage of"],
    ["vulnerab", "elderly", "children", "disabilit", "financial hardship", "poverty"],
  ],
  social_scoring: [["social scor", "social credit", "citizen scor", "trustworthiness scor"]],
  crime_prediction: [
    ["predict", "forecast"],
    ["crime", "criminal", "offence", "offense", "reoffend"],
  ],
  facial_scraping: [
    ["scrape$", "scrapes$", "scraped$", "scraper", "scraping"],
    ["face$", "faces$", "facial"],
  ],
  emotion_workplace_education: [
    ["emotion", "mood", "enthusiasm", "facial expression", "affect recognition"],
    WORK_OR_EDUCATION,
  ],
  biometric_categorisation: [
    ["biometric", "face$", "faces$", "facial", "voiceprint"],
    [
      "race$",
      "racial",
      "ethnic",
      "political",
      "religio",
      "sexual orientation",
      "trade union",
      "philosophical",
    ],
  ],
};

/** Annex III areas, keyed like ANNEX_III_ARTICLE. */
export const ANNEX_III_TERMS: Record<string, string[]> = {
  biometrics_use: [
    "biometric identification",
    "remote biometric",
    "biometric categoris",
    "biometric categoriz",
    "facial recognition",
    "face recognition",
    "emotion recognition",
  ],
  critical_infrastructure_use: [
    "critical infrastructure",
    "power grid",
    "electricity grid",
    "electricity supply",
    "water supply",
    "gas supply",
    "heating supply",
    "road traffic",
    "traffic control",
  ],
  education_use: [
    "exam$",
    "exams$",
    "examination",
    "grading",
    "admission",
    "proctoring",
    "student assessment",
    "learning outcome",
  ],
  employment_use: [
    "recruit",
    "hiring",
    "cv$",
    "cvs$",
    "candidate",
    "applicant",
    "shortlist",
    "promotion",
    "termination",
    "job interview",
    "performance review",
    "employee monitoring",
  ],
  essential_services_use: [
    "credit scor",
    "creditworth",
    "credit check",
    "loan approval",
    "insurance pricing",
    "life insurance",
    "health insurance",
    "benefits eligibility",
    "social benefit",
    "public assistance",
    "emergency call",
  ],
  law_enforcement_use: [
    "law enforcement",
    "police",
    "policing",
    "crime analytic",
    "polygraph",
    "recidivism",
    "reoffend",
  ],
  migration_use: [
    "migrant",
    "asylum",
    "immigration",
    "border control",
    "visa application",
    "residence permit",
  ],
  justice_democracy_use: [
    "judicial",
    "judge$",
    "judges$",
    "court$",
    "courts$",
    "legal dispute",
    "election",
    "voting",
    "voter",
  ],
};

/**
 * Phrases that describe a decision made with no person involved. Not
 * negation-checked: the spec limits negation to Article 5 and Annex III, and
 * these phrases already name the risky case, so a "not" before one (rare) still
 * gives a hint. Hints are non-blocking.
 */
export const GDPR_ART22_TERMS = [
  "automatically reject",
  "auto-reject",
  "automatically approve",
  "auto-approve",
  "automatically deny",
  "without human review",
  "without human intervention",
  "no human review",
  "no human in the loop",
  "fully automated decision",
];

export interface RuleCopy {
  title: string;
  text: string;
  ref?: string;
}

const VAGUE_TITLE = "Needs more detail";
const VAGUE_ASK = "Describe the task, what the output is and what happens with it.";

const ANNEX_III_AREA: Record<string, string> = {
  biometrics_use: "biometrics",
  critical_infrastructure_use: "critical infrastructure",
  education_use: "education or vocational training",
  employment_use: "employment or worker management",
  essential_services_use: "access to essential private or public services",
  law_enforcement_use: "law enforcement",
  migration_use: "migration, asylum or border control",
  justice_democracy_use: "the administration of justice or democratic processes",
};

/**
 * English title, text and reference for every rule id. The strings are fixed
 * sentences so they double as i18n keys; matched words go in the hint's
 * excerpt, never in this copy.
 */
export const RULE_COPY: Record<string, RuleCopy> = {
  placeholder: { title: VAGUE_TITLE, text: `This answer looks like a placeholder. ${VAGUE_ASK}` },
  too_short: { title: VAGUE_TITLE, text: `This answer is very short. ${VAGUE_ASK}` },
  ...Object.fromEntries(
    Object.keys(ARTICLE_5_TERMS).map((key) => [
      `art5_${key}`,
      {
        title: "Possible prohibited practice",
        text: `This answer may describe a practice prohibited under the EU AI Act. ${ARTICLE_5[key].text}`,
        ref: `EU AI Act, ${ARTICLE_5[key].article}`,
      },
    ]),
  ),
  ...Object.fromEntries(
    Object.keys(ANNEX_III_TERMS).map((key) => [
      `annex3_${key}`,
      {
        title: "Possible high-risk use",
        text: `This answer mentions ${ANNEX_III_AREA[key]}. AI used in this area may be high-risk under the EU AI Act.`,
        ref: `EU AI Act, ${ANNEX_III_ARTICLE[key]}`,
      },
    ]),
  ),
  gdpr_art22: {
    title: "Decisions without human review",
    text: "This answer may describe decisions made without human review. Under GDPR, people have the right not to be subject to a decision based solely on automated processing that significantly affects them.",
    ref: "GDPR, Article 22",
  },
};
