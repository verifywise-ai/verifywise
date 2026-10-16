import type { EducationBlock } from "./types";

export type { EducationBlock };

export const EDUCATION: Record<string, EducationBlock> = {
  "profile.party": {
    pageKey: "profile.party",
    decides:
      "Whether the duty to publish a summary of results is yours or your customers', and whether a distribution date exists for you at all.",
    law: {
      text: "Section 5-303 places the publication duty on an employer or employment agency in the city, not on the party that built the tool. DCWP’s FAQ V.1 states that the vendor which created an AEDT is not responsible for a bias audit of it. FAQ V.2 permits a vendor to commission one anyway, which is what this is.",
      refs: ["5-303", "FAQ V.1"],
    },
    goesWrong:
      "A tool supplier is easily assumed to be the employer. A document that states obligations that are not the supplier's has to be reissued, and one that tells a supplier to post a summary on its own careers site is advice to nobody in the room. A supplier also has no single distribution date, because 5-303(a)(2) means the date a given employer began using the tool and that differs for every customer.",
  },

  "profile.scope": {
    pageKey: "profile.scope",
    decides: "Whether Local Law 144 applies to this use of the tool at all.",
    law: {
      text: "Section 5-300 defines an automated employment decision tool by how its output is used: it is the only thing relied on, it is the biggest single factor, or it can overrule a person’s conclusion. A score that is one input among several with no extra weight falls outside that definition.",
      refs: ["5-300"],
    },
    goesWrong:
      "Answering that the score is one of several is a complete and favourable result, not a failure. An audit that asserts a tool is in scope on the client's own description of it can be disputed later by the client's counsel, and the determination then has to be withdrawn from a signed report. VerifyWise does not make this determination for you, and records your answer as yours.",
  },

  "profile.data_held": {
    pageKey: "profile.data_held",
    decides:
      "Which basis under 5-302(b) you rely on for using test data, and the condition on which that basis stops holding.",
    law: {
      text: "Section 5-302(a) requires a bias audit to use historical data where it is sufficient. Section 5-302(b) permits test data where insufficient historical data is available to conduct a statistically significant audit, and then requires the summary to explain why historical data was not used and how the test data was generated.",
      refs: ["5-302(a)", "5-302(b)"],
    },
    goesWrong:
      '"We don\'t have breakdowns" means two different things: you hold none of it, or you hold it and have not separated it out. Reading it the wrong way and never resolving it before signing leaves the basis wrong. Holding sex but not race is the common case and produces a split basis: sex may be auditable from historical data while race, ethnicity and every intersectional category are not, and records carrying only sex never end a race basis however far their volume grows.',
  },

  "profile.independence": {
    pageKey: "profile.independence",
    decides: "Whether this result can be called a bias audit.",
    law: {
      text: "Section 5-300 requires an independent auditor: a person or group not involved in using, developing or distributing the tool, with no employment relationship with the party using it and no financial interest in the tool or in its developer.",
      refs: ["5-300"],
    },
    goesWrong:
      "A test you run on your own tool is not a Local Law 144 bias audit at any level of quality, and this module will not say it is. What it does do is tell you what an independent auditor would find before you pay for one. An internal team that did not build the tool is still not independent, because the employment relationship is itself disqualifying.",
  },

  "run.cutoff": {
    pageKey: "run.cutoff",
    decides: "Which statutory branch governs, and therefore which figure is computed.",
    law: {
      text: "Where the platform applies a cutoff it selects, and 5-301(b) requires selection rates. Where a person applies it the tool scores, and 5-301(c) requires scoring rates: the median for the full sample, a scoring rate and impact ratio per category, and the mandatory sex by race or ethnicity intersection.",
      refs: ["5-301(b)", "5-301(c)"],
    },
    goesWrong:
      "A team can give both answers minutes apart on the same call. A file returned with the decision column entirely blank settles it as a scoring rate, even after the corpus has already been built. If automation is planned but not live, say so: the result then carries a dated statement of what was tested and stops describing your platform when the feature ships.",
  },

  "run.knockout": {
    pageKey: "run.knockout",
    decides: "What your selection or scoring rate is actually measuring.",
    law: {
      text: "Not a statutory item. It determines whether a rate combines two different mechanisms, which affects how every impact ratio in the table should be read.",
      refs: [],
    },
    goesWrong:
      "Asking repeatedly and getting the answer only after shipping is too late. A knockout on a single criterion can cut the usable sample sharply, for example from five thousand candidates to three thousand. Where knocked-out candidates are not recorded in their own column, a rate mixes candidates who scored low with candidates who were failed outright, and the two have different causes and different remedies.",
  },

  "run.preprocessing": {
    pageKey: "run.preprocessing",
    decides: "Whether this result describes what your tool actually scores.",
    law: {
      text: "Not a statutory item. It bounds what any finding may be attributed to, which the summary of results must be accurate about.",
      refs: [],
    },
    goesWrong:
      "An evaluation may run on extracted and normalised answers rather than on the transcripts submitted to it. If the intermediate form is never seen, the report has to disclose that the scored input was not the submitted input, and that remains the largest open gap in the audit. If anything transforms the material before scoring, no finding can be attributed to the scoring step alone.",
  },

  "run.job_description": {
    pageKey: "run.job_description",
    decides:
      "What the generated candidates contain evidence of, and which role this result describes.",
    law: {
      text: "Under 5-301 the audit attaches to the tool rather than to the position. DCWP’s FAQ III.4 confirms that one audit may cover hiring for different positions, and 20-871(a)(1) is the codified duty. So testing a single role is defensible, provided the result names it.",
      refs: ["5-301", "FAQ III.4", "20-871(a)(1)"],
    },
    goesWrong:
      "A sample for a junior hourly role must not be used to reason about a senior role at four times the salary. The two job descriptions offered here are fixed so that the criteria are known in advance and every customer's corpus is comparable; your result states which role was tested and that it describes your platform's behaviour on that role, not across your hiring.",
  },

  "run.criteria_comparison": {
    pageKey: "run.criteria_comparison",
    decides: "Whether the generated candidates exercise your actual configuration.",
    law: {
      text: "Not a statutory item. It is a validity check on the test material, which 5-302(b) requires the summary to describe.",
      refs: ["5-302(b)"],
    },
    goesWrong:
      "A platform may generate five criteria from a job description where eight could be reconstructed from the same text. The qualification gradient then loses its top rung, because the only criterion separating a solid candidate from a strong one is not among the five, and the corpus has to be remapped. Pasting back what your platform generates takes one field and catches that before you spend a scoring cycle.",
  },

  "run.upload": {
    pageKey: "run.upload",
    decides: "Whether impact ratios can be produced from this data at all.",
    law: {
      text: "Section 5-301(d) permits an auditor to exclude a category representing less than 2% of the data, with the reason stated. Section 5-301(c) also calls for the number of individuals assessed who fall into an unknown category to be reported.",
      refs: ["5-301(d)", "5-301(c)"],
    },
    goesWrong:
      "A demographic column that is mostly blank cannot produce a ratio at any volume, and a rate computed from the few populated rows still looks authoritative. If a mapped column is missing from your file the fault is in the mapping rather than the data, and this module says which. With only three distinct score levels the sample median can sit on the modal value, so counting strictly above it gives every group a rate of zero.",
  },

  "results.figures": {
    pageKey: "results.figures",
    decides:
      "What these numbers mean, and what they do not. This page is where a reader decides whether your platform treats groups differently on the material tested.",
    law: {
      text: "Section 5-301(c) requires the median for the full sample, a scoring rate and impact ratio for each category, and the sex by race or ethnicity intersection. The intersectional table is mandatory and is the requirement most often skipped by anyone working from the four-fifths rule rather than the rule text. 0.80 is the EEOC four-fifths convention and this statute does not adopt it; the 2% exclusion in 5-301(d) is the statutory rule.",
      refs: ["5-301(c)", "5-301(d)"],
    },
    goesWrong:
      "There is no pass mark in Local Law 144 and no pass or fail. A ratio below 0.80 is a number to report and investigate, not a failure, and a ratio above it is not a clearance. Reading the convention as a threshold leads teams to treat 0.81 as safe and 0.79 as a crisis when the difference between them can be a single candidate.",
  },

  "results.data_quality": {
    pageKey: "results.data_quality",
    decides: "Whether to trust the figures on the previous page.",
    law: {
      text: "Not a statutory item. Section 5-302(b) requires the summary to describe how the test data was generated, and these checks are what that description can honestly claim.",
      refs: ["5-302(b)"],
    },
    goesWrong:
      "A clean impact ratio from a badly built dataset is more dangerous than a flagged one, because nobody looks at it twice. A corpus that assigns demographics in contiguous blocks while generation runs in order can return a ratio close to 1 on sex precisely because sex is the most perfectly blocked attribute: a two-block split averages position effects over half the data each and they cancel. Every balance check can come back clean throughout.",
  },

  "stance": {
    pageKey: "stance",
    decides: "What you can and cannot say about this result.",
    law: {
      text: "Section 5-300 requires an independent auditor, so a self-administered test is not a bias audit. Section 5-303 requires a published summary of results from the employer or employment agency deploying the tool, which this document does not satisfy.",
      refs: ["5-300", "5-303"],
    },
    goesWrong:
      "This document is not a Local Law 144 bias audit and does not discharge any publication duty. What it is: a record of what your platform did on a named role, what you have established about your own position, and what an independent auditor would still need. The readiness score is VerifyWise's own measure and no regulator recognises it.",
  },

  "expiry": {
    pageKey: "expiry",
    decides: "When this result stops describing your platform.",
    law: {
      text: "Section 5-301(a) is the only re-audit trigger in the rule: a tool may not be used if more than one year has elapsed since its most recent bias audit. Separately, a test-data basis under 5-302(b) ends on its own condition, which may fire well before a year.",
      refs: ["5-301(a)", "5-302(b)"],
    },
    goesWrong:
      "The rule contains no trigger for a change of role, configuration, weighting or model. A report that cites 5-301(a) for re-audit triggers it does not contain has to have the claim withdrawn. Your test-data basis expires on a condition rather than a date: if it rests on race not being recorded, it ends when race begins to be captured, and collecting more records of other characteristics does not end it.",
  },
};
