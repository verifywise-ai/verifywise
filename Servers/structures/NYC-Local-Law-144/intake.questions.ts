import type { IntakeQuestion, Predicate } from "./intake.types";

export const LL144_QUESTION_SET_VERSION = 1;

export const VETO_KEYS = [
  "role.party",
  "scope.weighting",
  "independence.auditor",
  "data.held",
] as const;

/** Everything after the vetoes is moot once the tool is out of scope. */
const IN_SCOPE: Predicate = {
  not: { equals: { key: "scope.weighting", value: "one_of_several" } },
};

export const LL144_QUESTIONS: IntakeQuestion[] = [
  // ---- Tier 1: vetoes -------------------------------------------------
  {
    key: "role.party",
    scope: "profile",
    weight: "veto",
    statutoryRef: "5-303",
    prompt:
      "Do you use this tool to hire your own staff, place candidates with other companies, " +
      "or supply it to employers who use it themselves?",
    notesRequired: true,
    notesPrompt: "In your own words, describe who uses the tool and for whose hiring.",
    allowDontKnow: true,
    options: [
      {
        value: "employer",
        label: "We use it to hire our own staff",
        consequence:
          "The duty to publish a summary of results under 5-303 falls on you, and a " +
          "distribution date exists for your use of the tool.",
      },
      {
        value: "employment_agency",
        label: "We place candidates with other companies",
        consequence:
          "5-303 binds employment agencies in the city as well as employers, so the " +
          "publication duty may fall on you.",
      },
      {
        value: "vendor",
        label: "We supply it to employers who use it themselves",
        consequence:
          "The publication duty falls on each employer deploying the tool, not on you. " +
          "No single distribution date exists for a supplier.",
        emits: [
          {
            kind: "blank_field",
            text:
              "To be completed by the deploying employer or employment " +
              "agency. Under 5-303(a)(2) this is the date a given employer began using the " +
              "tool, which is not within a supplier's knowledge.",
            payload: { field: "distribution_date" },
          },
          {
            kind: "scope_note",
            text:
              "This result was commissioned by the supplier of the tool. It does not " +
              "discharge the publication duty of any employer deploying it.",
          },
        ],
      },
      {
        value: "both",
        label: "Both: we hire with it and supply it",
        consequence: "Both sets of obligations may apply. The result states each separately.",
      },
    ],
  },
  {
    key: "scope.weighting",
    scope: "profile",
    weight: "veto",
    statutoryRef: "5-300",
    prompt:
      "When a candidate is assessed with this tool, how much does the result matter — " +
      "is it the only thing looked at, the biggest single factor, or one of several?",
    notesRequired: true,
    notesPrompt: "In your own words, describe how a reviewer uses the output when deciding.",
    allowDontKnow: true,
    options: [
      {
        value: "only",
        label: "It is the only thing looked at",
        consequence: "This describes the first limb of the 5-300 definition.",
      },
      {
        value: "biggest",
        label: "It is the biggest single factor",
        consequence: "This describes the second limb of the 5-300 definition.",
      },
      {
        value: "overrules",
        label: "It can overrule a person's conclusion",
        consequence:
          "This describes the third limb of the 5-300 definition: output used to overrule a conclusion a person reached.",
      },
      {
        value: "one_of_several",
        label: "It is one of several, with no extra weight",
        consequence:
          "A score that is one input among several with no extra weight falls outside " +
          "the 5-300 definition, so Local Law 144 may not attach to this use. The " +
          "remaining questions are then not applicable and you receive a scope " +
          "determination rather than a set of figures.",
        emits: [
          {
            kind: "scope_note",
            text:
              "On the use described, the tool's output is one input among several with no " +
              "additional weight. VerifyWise did not verify this and does not determine " +
              "whether any deployment is an automated employment decision tool; that " +
              "question belongs to the deploying party and its counsel.",
          },
        ],
      },
    ],
  },
  {
    key: "independence.auditor",
    scope: "profile",
    weight: "veto",
    statutoryRef: "5-300",
    prompt: "Who is performing this test?",
    notesRequired: true,
    notesPrompt: "Name the team or firm performing it.",
    allowDontKnow: false,
    options: [
      {
        value: "self",
        label: "We are, on our own tool",
        consequence:
          "5-300 requires an independent auditor, so a self-administered test is not a " +
          "Local Law 144 bias audit at any level of quality. What it does tell you is " +
          "what an independent audit would find before you commission one.",
        emits: [
          {
            kind: "scope_note",
            text:
              "Self-administered test. 6 RCNY 5-300 requires an independent auditor: a " +
              "person or group not involved in using, developing or distributing the tool, " +
              "with no employment relationship with the deploying party and no financial " +
              "interest in the tool or in its developer. This result is not a Local Law " +
              "144 bias audit.",
          },
        ],
      },
      {
        value: "internal",
        label: "An internal team not involved in building the tool",
        consequence:
          "Internal separation is not independence under 5-300, which excludes an " +
          "employment relationship with the deploying party.",
        emits: [
          {
            kind: "scope_note",
            text:
              "Performed by an internal team. 5-300 excludes a person with an employment " +
              "relationship with the party using the tool, so this is not an independent " +
              "bias audit.",
          },
        ],
      },
      {
        value: "third_party",
        label: "An external third party",
        consequence:
          "Record who, and confirm they have no financial interest in the tool and no " +
          "part in developing it. The test does not verify independence for you.",
      },
    ],
  },
  {
    key: "data.held",
    scope: "profile",
    weight: "veto",
    statutoryRef: "5-302",
    prompt:
      "Do you hold anything on candidates' sex, race or ethnicity — not whether you can " +
      "report on it, whether it exists anywhere in your systems?",
    notesRequired: true,
    notesPrompt: "Say which characteristics are held, for which candidates, and since when.",
    allowDontKnow: true,
    options: [
      {
        value: "none",
        label: "We hold none of it",
        consequence:
          "Historical data cannot produce an impact ratio for a characteristic it does " +
          "not record, at any volume. Test data is then permitted under 5-302(b), and " +
          "that basis ends when you begin collecting self-identification.",
      },
      {
        value: "sex_only",
        label: "Sex only",
        consequence:
          "Sex may be auditable from historical data while race, ethnicity and every " +
          "intersectional category are not. Your basis is then split by characteristic, " +
          "and sex-only records never end a race basis however far their volume grows.",
      },
      {
        value: "all_low_volume",
        label: "All of it, but for few candidates",
        consequence:
          "The basis is then volume rather than availability, and it ends when your " +
          "disclosure counts support the 14 intersectional categories.",
      },
      {
        value: "all_sufficient",
        label: "All of it, for many candidates",
        consequence:
          "Historical data is required under 5-302(a) where it is sufficient; 5-302(b) " +
          "permits test data only where historical data is insufficient for a " +
          "statistically significant audit.",
      },
      {
        value: "customers_hold_it",
        label: "Our customers hold it, we do not",
        consequence: "Availability rather than existence. The basis ends if you gain access to it.",
      },
    ],
  },

  // ---- Tier 2: asked, consequence stated in advance --------------------
  {
    key: "cutoff.applied_by",
    scope: "profile",
    weight: "high",
    statutoryRef: "5-301",
    prompt: "Is any cutoff or ranking applied by the platform, or by a person?",
    notesRequired: false,
    allowDontKnow: true,
    appliesWhen: IN_SCOPE,
    options: [
      {
        value: "platform",
        label: "The platform applies it",
        consequence: "The tool selects, so 5-301(b) governs and a selection rate is computed.",
        emits: [
          {
            kind: "metric_forced",
            text: "selection_rate",
            payload: { metric: "selection_rate", ref: "5-301(b)" },
          },
        ],
      },
      {
        value: "person",
        label: "A person applies it",
        consequence:
          "The tool scores and a person decides, so 5-301(c) governs and a scoring rate " +
          "is computed. The result records that the decision sat with a human and that " +
          "those decisions were not examined.",
        emits: [
          {
            kind: "metric_forced",
            text: "scoring_rate",
            payload: { metric: "scoring_rate", ref: "5-301(c)" },
          },
          {
            kind: "limitation",
            text:
              "The tool scores; a person decides. This result measures the tool's own " +
              "output. No selection or rejection decision was examined.",
          },
        ],
      },
    ],
  },
  {
    key: "cutoff.planned",
    scope: "profile",
    weight: "standard",
    prompt: "If no cutoff is applied automatically today, is that planned?",
    notesRequired: false,
    allowDontKnow: true,
    appliesWhen: { all: [IN_SCOPE, { equals: { key: "cutoff.applied_by", value: "person" } }] },
    options: [
      { value: "no", label: "No", consequence: "The result describes the tool as it runs today." },
      {
        value: "planned",
        label: "Yes, it is planned",
        consequence:
          "The result carries a dated statement of what was tested and stops describing " +
          "your platform when automatic progression ships. Automation converts the " +
          "measure from a scoring rate to a selection rate and requires a fresh run " +
          "against the new configuration.",
        emits: [
          {
            kind: "limitation",
            text:
              "Automatic progression or rejection was described as planned but not live " +
              "when this ran. If it ships, 5-301(b) governs instead of 5-301(c) and the " +
              "required calculation changes from a scoring rate to a selection rate.",
          },
        ],
      },
    ],
  },
  {
    key: "pipeline.input_form",
    scope: "profile",
    weight: "high",
    prompt:
      "What does your tool take as input — a resume document, a transcript of a call, " +
      "structured answers, or audio?",
    notesRequired: false,
    allowDontKnow: false,
    appliesWhen: IN_SCOPE,
    gates: ["generation"],
    generationField: "artifact_kind",
    options: [
      {
        value: "resume",
        label: "A resume or CV document",
        consequence: "Generated candidates will be resume documents.",
      },
      {
        value: "transcript",
        label: "A transcript of a call or interview",
        consequence:
          "Generated candidates will be speaker-labelled transcripts. If your tool asks " +
          "follow-up questions that are themselves scored, say so in the notes: a corpus " +
          "of fixed answers would not represent how the tool is used.",
      },
      {
        value: "structured",
        label: "Structured answers against fixed questions",
        consequence: "Generated candidates will be answer sets against the question list.",
      },
      {
        value: "audio",
        label: "Audio",
        consequence:
          "This module cannot generate audio. Synthesised speech is transcribed less " +
          "accurately than real speech and text-to-speech quality varies across accents, " +
          "so a generated corpus would measure the generator rather than your tool. You " +
          "can still upload results your platform produced.",
        emits: [
          {
            kind: "limitation",
            text: "The tool takes audio. No corpus was generated; results were uploaded.",
          },
        ],
      },
    ],
  },
  {
    key: "pipeline.preprocessing",
    scope: "profile",
    weight: "high",
    prompt:
      "Does anything transform the input before scoring — extraction, normalisation, " +
      "parsing, or redaction of personal details?",
    notesRequired: false,
    allowDontKnow: true,
    appliesWhen: IN_SCOPE,
    options: [
      {
        value: "no",
        label: "No, the tool scores what it receives",
        consequence: "The result describes the tool scoring the material as submitted.",
      },
      {
        value: "yes",
        label: "Yes",
        consequence:
          "The result records that the scored input is not the submitted input. Unless " +
          "you have inspected the intermediate form, that step is unobserved and any " +
          "finding is attributed to the tool including it.",
        emits: [
          {
            kind: "limitation",
            text:
              "The scored input is not the submitted input. The tool transforms the " +
              "material before scoring, and the intermediate form was not examined, so " +
              "no finding can be attributed to the scoring step alone.",
          },
        ],
      },
      {
        value: "unknown_to_us",
        label: "We do not know",
        consequence:
          "Recorded as an open item. It bounds what the result may attribute to the " +
          "scoring model.",
        emits: [
          {
            kind: "limitation",
            text:
              "Whether the input is transformed before scoring was not established, so " +
              "no finding can be attributed to the scoring step alone.",
          },
        ],
      },
    ],
  },
  {
    key: "knockout.exists",
    scope: "run",
    weight: "standard",
    prompt: "Can any single criterion fail a candidate outright, rather than only scoring low?",
    notesRequired: false,
    allowDontKnow: true,
    appliesWhen: IN_SCOPE,
    generationField: "knockout",
    options: [
      {
        value: "no",
        label: "No, everything contributes to a score",
        consequence: "Rates measure one mechanism.",
      },
      {
        value: "yes",
        label: "Yes, at least one criterion is a knockout",
        consequence:
          "A rate then combines two mechanisms: candidates who scored low and candidates " +
          "who were failed outright. Identify the column that records it, or the result " +
          "states that knocked-out candidates are pooled with low scorers.",
        emits: [
          {
            kind: "limitation",
            text:
              "At least one criterion fails a candidate outright. Unless the knockout is " +
              "recorded in its own column, the rate combines candidates who scored low " +
              "with candidates who were failed outright.",
          },
        ],
      },
    ],
  },
  {
    key: "history.prior_audit",
    scope: "profile",
    weight: "standard",
    statutoryRef: "5-301(a)",
    prompt: "Has this tool been audited for bias before, and has it changed since?",
    notesRequired: false,
    allowDontKnow: true,
    appliesWhen: IN_SCOPE,
    options: [
      { value: "never", label: "Never audited", consequence: "Recorded as context." },
      {
        value: "audited_unchanged",
        label: "Audited, and unchanged since",
        consequence:
          "5-301(a) is the only re-audit trigger in the rule: a tool may not be used if " +
          "more than one year has elapsed since its most recent bias audit.",
      },
      {
        value: "audited_changed",
        label: "Audited, but it has changed since",
        consequence:
          "The rule sets no trigger for a change of configuration, weighting or model, " +
          "so what a prior audit still describes is a question for the deploying party. " +
          "The result records that a change was reported.",
        emits: [
          {
            kind: "scope_note",
            text:
              "A change to the tool since its last bias audit was reported. Whether a " +
              "changed tool is still the tool a prior audit covered is a question the " +
              "statute does not answer, and VerifyWise does not answer it either.",
          },
        ],
      },
    ],
  },
  {
    key: "data.basis",
    scope: "run",
    weight: "standard",
    statutoryRef: "5-302(b)",
    prompt:
      "For this run, are you using historical applicant data or test data? If test data, " +
      "which insufficiency in your historical data is the reason?",
    notesRequired: true,
    notesPrompt:
      "5-302(b) requires the summary to explain why historical data was not used. " +
      "Describe it in your own words.",
    allowDontKnow: false,
    appliesWhen: IN_SCOPE,
    gates: ["stance"],
    options: [
      {
        value: "historical",
        label: "Historical applicant data",
        consequence: "Historical data is the 5-302(a) basis, and no expiry condition attaches.",
      },
      {
        value: "test_volume",
        label: "Test data: too few historical records",
        consequence:
          "This basis ends when your historical records reach a volume that supports the " +
          "14 intersectional categories.",
      },
      {
        value: "test_attribute",
        label: "Test data: the characteristics are not recorded",
        consequence:
          "This basis ends when the missing characteristics begin to be captured at " +
          "reportable volumes. Records carrying only some characteristics do not end it " +
          "however far their volume grows.",
      },
      {
        value: "test_availability",
        label: "Test data: the records exist but are not ours",
        consequence: "This basis ends if you gain access to the records.",
      },
    ],
  },
  {
    key: "threshold.operational",
    scope: "run",
    weight: "low",
    prompt:
      "If your tool produces a score rather than a decision, what cutoff does your " +
      "process actually use?",
    notesRequired: false,
    allowDontKnow: true,
    appliesWhen: { all: [IN_SCOPE, { equals: { key: "cutoff.applied_by", value: "person" } }] },
    gates: ["scoring_rate"],
    generationField: "score_scale",
    options: [
      {
        value: "stated",
        label: "We have a cutoff and will state it",
        consequence: "The scoring rate is computed against your own cutoff.",
      },
      {
        value: "none",
        label: "There is no fixed cutoff",
        consequence:
          "5-301(c) measures the scoring rate against the sample median, which this " +
          "module computes. It is a property of the sample rather than of your process, " +
          "and the result says so.",
      },
    ],
  },
  {
    key: "data.categories",
    scope: "run",
    weight: "standard",
    statutoryRef: "5-301(c)",
    prompt: "Which protected categories does the data for this run cover?",
    notesRequired: false,
    allowDontKnow: false,
    appliesWhen: IN_SCOPE,
    options: [
      {
        value: "sex_race_both",
        label: "Sex, and race or ethnicity",
        consequence:
          "All three required tables can be produced, including the mandatory " +
          "sex by race/ethnicity intersection under 5-301(c).",
      },
      {
        value: "sex_only",
        label: "Sex only",
        consequence:
          "Two of the three required tables cannot be produced: race/ethnicity and " +
          "every intersectional category. The result states which are missing.",
      },
      {
        value: "race_only",
        label: "Race or ethnicity only",
        consequence: "The sex table and every intersectional category cannot be produced.",
      },
    ],
  },
];
