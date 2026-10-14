// Servers/services/euAiActClassification/score.v2.ts
import { ANNEX_III_HIGH_RISK_USES } from "./questionnaire.v2";
import {
  Answers,
  ClassificationLevel,
  ClassificationReason,
  ClassificationResult,
  ClassificationRole,
} from "./types";

const DATES = {
  article5: "2025-02-02",
  article4: "2025-02-02",
  omnibusBans: "2026-12-02",
  article50: "2026-08-02",
  annexIII: "2027-12-02",
  annexI: "2028-08-02",
};

const ARTICLE_5: Record<string, ClassificationReason> = {
  manipulation: {
    article: "Article 5(1)(a)",
    text: "Manipulative or deceptive techniques that materially distort behaviour and are likely to cause significant harm are prohibited.",
  },
  exploit_vulnerabilities: {
    article: "Article 5(1)(b)",
    text: "Exploiting vulnerabilities due to age, disability or a social or economic situation is prohibited.",
  },
  social_scoring: {
    article: "Article 5(1)(c)",
    text: "Social scoring that leads to unjustified or unrelated detrimental treatment is prohibited.",
  },
  crime_prediction: {
    article: "Article 5(1)(d)",
    text: "Predicting criminal offences based solely on profiling or personality traits is prohibited.",
  },
  facial_scraping: {
    article: "Article 5(1)(e)",
    text: "Building facial recognition databases through untargeted scraping is prohibited.",
  },
  emotion_workplace_education: {
    article: "Article 5(1)(f)",
    text: "Emotion recognition at work or in education institutions, other than for medical or safety reasons, is prohibited.",
  },
  biometric_categorisation: {
    article: "Article 5(1)(g)",
    text: "Biometric categorisation to infer sensitive characteristics is prohibited.",
  },
};

const OMNIBUS_BAN = {
  inForce: {
    text: "AI systems that generate non-consensual intimate imagery of real people or child sexual abuse material are prohibited.",
  },
  upcoming: {
    text: "Prohibited from 2 December 2026: AI systems that generate non-consensual intimate imagery of real people or child sexual abuse material.",
  },
};

const ANNEX_III_ARTICLE: Record<string, string> = {
  biometrics_use: "Annex III, point 1",
  critical_infrastructure_use: "Annex III, point 2",
  education_use: "Annex III, point 3",
  employment_use: "Annex III, point 4",
  essential_services_use: "Annex III, point 5",
  law_enforcement_use: "Annex III, point 6",
  migration_use: "Annex III, point 7",
  justice_democracy_use: "Annex III, point 8",
};

const CARVE_OUTS: Record<string, Record<string, ClassificationReason>> = {
  biometrics_use: {
    verification_only: {
      article: "Annex III, point 1(a)",
      text: "Biometric verification whose sole purpose is to confirm that a person is who they claim to be is excluded from the high-risk list.",
    },
  },
  essential_services_use: {
    fraud_detection: {
      article: "Annex III, point 5(b)",
      text: "AI systems used to detect financial fraud are excluded from the high-risk list.",
    },
  },
  migration_use: {
    travel_document_verification: {
      article: "Annex III, point 7(d)",
      text: "Verification of travel documents is excluded from the high-risk list.",
    },
  },
  justice_democracy_use: {
    campaign_logistics: {
      article: "Annex III, point 8(b)",
      text: "Tools that organise, optimise or structure political campaigns administratively or logistically are excluded from the high-risk list.",
    },
  },
};

// Every user-facing sentence is a whole literal (no template strings) so the
// DOM translator can match it against translations.ts.
const DEROGATIONS: Record<string, ClassificationReason> = {
  narrow_procedural: {
    article: "Article 6(3)(a)",
    text: "The system performs a narrow procedural task, so it is not high risk.",
  },
  improve_human_activity: {
    article: "Article 6(3)(b)",
    text: "The system improves the result of a previously completed human activity, so it is not high risk.",
  },
  detect_patterns: {
    article: "Article 6(3)(c)",
    text: "The system detects decision-making patterns without replacing or influencing the human assessment without review, so it is not high risk.",
  },
  preparatory_task: {
    article: "Article 6(3)(d)",
    text: "The system performs a preparatory task to an Annex III assessment, so it is not high risk.",
  },
};

const TRANSPARENCY: Record<
  string,
  { reason: ClassificationReason; obligation: ClassificationReason; role: ClassificationRole }
> = {
  interacts: {
    reason: {
      article: "Article 50(1)",
      text: "The system interacts directly with people.",
      appliesFrom: DATES.article50,
    },
    obligation: {
      article: "Article 50(1)",
      text: "Inform people that they are interacting with an AI system.",
      appliesFrom: DATES.article50,
    },
    role: "Provider",
  },
  generates: {
    reason: {
      article: "Article 50(2)",
      text: "The system generates synthetic audio, images, video or text.",
      appliesFrom: DATES.article50,
    },
    obligation: {
      article: "Article 50(2)",
      text: "Mark generated content in a machine-readable format. Systems already on the market must comply by 2 December 2026.",
      appliesFrom: DATES.article50,
    },
    role: "Provider",
  },
  emotion_biometric: {
    reason: {
      article: "Article 50(3)",
      text: "The system recognises emotions or categorises people using biometric data.",
      appliesFrom: DATES.article50,
    },
    obligation: {
      article: "Article 50(3)",
      text: "Inform the people exposed to the system.",
      appliesFrom: DATES.article50,
    },
    role: "Deployer",
  },
  deepfake: {
    reason: {
      article: "Article 50(4)",
      text: "The system produces deepfakes or public-interest text.",
      appliesFrom: DATES.article50,
    },
    obligation: {
      article: "Article 50(4)",
      text: "Disclose that the content is artificially generated or manipulated.",
      appliesFrom: DATES.article50,
    },
    role: "Deployer",
  },
};

// High-risk obligations depend on the route that made the system high risk.
type HighRiskRoute = "annex_iii" | "annex_iii_point_2" | "section_a" | "section_b";

const ROUTE_DATES: Record<HighRiskRoute, string> = {
  annex_iii: DATES.annexIII,
  annex_iii_point_2: DATES.annexIII,
  section_a: DATES.annexI,
  section_b: DATES.annexI,
};

const PROVIDER_REQUIREMENTS: ClassificationReason[] = [
  { article: "Article 9", text: "Establish a risk management system." },
  {
    article: "Article 10",
    text: "Apply data governance to training, validation and testing data.",
  },
  { article: "Article 11", text: "Draw up technical documentation (Annex IV)." },
  { article: "Article 12", text: "Enable automatic event logging." },
  { article: "Article 13", text: "Provide instructions for use to deployers." },
  { article: "Article 14", text: "Design the system for effective human oversight." },
  { article: "Article 15", text: "Achieve appropriate accuracy, robustness and cybersecurity." },
  { article: "Article 17", text: "Put a quality management system in place." },
];

const PROVIDER_POST_MARKET: ClassificationReason[] = [
  { article: "Article 72", text: "Run post-market monitoring." },
  { article: "Article 73", text: "Report serious incidents." },
];

const CONFORMITY_ASSESSMENT: ClassificationReason = {
  article: "Article 43",
  text: "Complete the conformity assessment before placing the system on the market.",
};

const SECTORAL_CONFORMITY_ASSESSMENT: ClassificationReason = {
  article: "Article 43(3)",
  text: "Complete the conformity assessment under the product's sectoral procedure before placing the system on the market.",
};

const EU_DATABASE_REGISTRATION: ClassificationReason = {
  article: "Article 49(1)",
  text: "Register the system in the EU database.",
};

const NATIONAL_REGISTRATION: ClassificationReason = {
  article: "Article 49(5)",
  text: "Register the system at national level.",
};

const SECTORAL_LEGISLATION: ClassificationReason = {
  article: "Article 2(2) and Articles 102-109",
  text: "Meet the AI requirements set through the product's sectoral legislation.",
};

const DEPLOYER_DUTIES: ClassificationReason[] = [
  { article: "Article 26(1)", text: "Use the system according to the provider's instructions." },
  { article: "Article 26(2)", text: "Assign human oversight to competent people." },
  {
    article: "Article 26(4)",
    text: "Make sure input data is relevant and sufficiently representative.",
  },
  {
    article: "Article 26(5)",
    text: "Monitor operation and inform the provider of risks and serious incidents.",
  },
  {
    article: "Article 26(6)",
    text: "Keep the automatically generated logs for at least six months.",
  },
  {
    article: "Article 26(7)",
    text: "Inform workers' representatives and affected workers before use at the workplace.",
  },
];

const DEPLOYER_INFORM_PEOPLE: ClassificationReason = {
  article: "Article 26(11)",
  text: "Inform people that decisions about them are supported by a high-risk AI system.",
};

// Article 27(1) excludes the Annex III point 2 area from the assessment.
const DEPLOYER_FRIA: ClassificationReason = {
  article: "Article 27",
  text: "Carry out a fundamental rights impact assessment where required (public bodies, public services, credit scoring, and life or health insurance).",
};

const PROVIDER_OBLIGATIONS: Record<HighRiskRoute, ClassificationReason[]> = {
  annex_iii: [
    ...PROVIDER_REQUIREMENTS,
    CONFORMITY_ASSESSMENT,
    EU_DATABASE_REGISTRATION,
    ...PROVIDER_POST_MARKET,
  ],
  annex_iii_point_2: [
    ...PROVIDER_REQUIREMENTS,
    CONFORMITY_ASSESSMENT,
    NATIONAL_REGISTRATION,
    ...PROVIDER_POST_MARKET,
  ],
  section_a: [...PROVIDER_REQUIREMENTS, SECTORAL_CONFORMITY_ASSESSMENT, ...PROVIDER_POST_MARKET],
  section_b: [SECTORAL_LEGISLATION],
};

const DEPLOYER_OBLIGATIONS: Record<HighRiskRoute, ClassificationReason[]> = {
  annex_iii: [...DEPLOYER_DUTIES, DEPLOYER_INFORM_PEOPLE, DEPLOYER_FRIA],
  annex_iii_point_2: [...DEPLOYER_DUTIES, DEPLOYER_INFORM_PEOPLE],
  section_a: DEPLOYER_DUTIES,
  section_b: [SECTORAL_LEGISLATION],
};

// Annex III routes come first so a duty shared with an Annex I route keeps the
// earlier date.
const ROUTE_ORDER: HighRiskRoute[] = ["annex_iii", "annex_iii_point_2", "section_a", "section_b"];

const highRiskObligations = (
  routes: Set<HighRiskRoute>,
  role: ClassificationRole | null,
): ClassificationReason[] => {
  const seen = new Set<string>();
  const obligations: ClassificationReason[] = [];
  for (const route of ROUTE_ORDER.filter((r) => routes.has(r))) {
    const list = role === "Provider" ? PROVIDER_OBLIGATIONS[route] : DEPLOYER_OBLIGATIONS[route];
    for (const obligation of list) {
      const key = `${obligation.article}|${obligation.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      obligations.push({ ...obligation, appliesFrom: ROUTE_DATES[route] });
    }
  }
  return obligations;
};

const AI_LITERACY: ClassificationReason = {
  article: "Article 4",
  text: "Ensure sufficient AI literacy of the staff who operate or use the system.",
  appliesFrom: DATES.article4,
};

const asList = (answer: string | string[] | undefined): string[] =>
  answer === undefined ? [] : Array.isArray(answer) ? answer : [answer];

const toRole = (answer: string | string[] | undefined): ClassificationRole | null =>
  answer === "provider" ? "Provider" : answer === "deployer" ? "Deployer" : null;

export const scoreV2 = (answers: Answers, now: Date = new Date()): ClassificationResult => {
  const role = toRole(answers.role);
  const result = (
    level: ClassificationLevel,
    reasons: ClassificationReason[],
    obligations: ClassificationReason[],
  ): ClassificationResult => ({
    questionnaireVersion: 2,
    level,
    role,
    reasons,
    obligations,
  });

  if (answers.scope === "research_only") {
    return result(
      "Out of scope",
      [
        {
          article: "Article 2(6) and 2(8)",
          text: "AI systems developed and put into service only for scientific research and development, and research, testing or development before a system is placed on the market or put into service, are outside the scope of the EU AI Act.",
        },
      ],
      [],
    );
  }

  const prohibited: ClassificationReason[] = asList(answers.art5_practices)
    .filter((p) => p !== "none")
    .map((p) => ({ ...ARTICLE_5[p], appliesFrom: DATES.article5 }));
  if (answers.rbi_law_enforcement === "yes" && answers.rbi_objective === "none") {
    prohibited.push({
      article: "Article 5(1)(h)",
      text: "Real-time remote biometric identification in publicly accessible spaces for law enforcement, outside the authorised objectives, is prohibited.",
      appliesFrom: DATES.article5,
    });
  }
  if (answers.intimate_content === "yes" && answers.intimate_content_safeguards === "no") {
    const inForce = now.getTime() >= Date.parse(`${DATES.omnibusBans}T00:00:00Z`);
    prohibited.push({
      article: "Article 5, as amended by Regulation (EU) 2026/1744",
      text: inForce ? OMNIBUS_BAN.inForce.text : OMNIBUS_BAN.upcoming.text,
      appliesFrom: DATES.omnibusBans,
    });
  }
  if (prohibited.length > 0) {
    const onlyUpcomingBan = prohibited.every((p) => p.text === OMNIBUS_BAN.upcoming.text);
    return result(
      "Prohibited",
      prohibited,
      onlyUpcomingBan
        ? [
            {
              article: "Article 5",
              text: "From 2 December 2026, do not place this system on the market, put it into service or use it in the EU.",
              appliesFrom: DATES.omnibusBans,
            },
          ]
        : [
            {
              article: "Article 5",
              text: "Do not place this system on the market, put it into service or use it in the EU.",
            },
          ],
    );
  }

  const high: ClassificationReason[] = [];
  const routes = new Set<HighRiskRoute>();
  const notes: ClassificationReason[] = [];

  if (answers.rbi_law_enforcement === "yes") {
    routes.add("annex_iii");
    high.push({
      article: "Article 5(2)-(3) and Annex III, point 1(a)",
      text: "Real-time remote biometric identification for an authorised objective needs prior authorisation and is a high-risk system.",
      appliesFrom: DATES.annexIII,
    });
  }
  if (answers.safety_function === "section_a") {
    routes.add("section_a");
    high.push({
      article: "Article 6(1) and Annex I, Section A",
      text: "The system is a product, or performs a safety function in a product, under Annex I Section A legislation that requires a third-party conformity assessment.",
      appliesFrom: DATES.annexI,
    });
  }
  if (answers.safety_function === "section_b") {
    routes.add("section_b");
    high.push({
      article: "Article 6(1), Article 2(2) and Annex I, Section B",
      text: "The system is part of a product under Annex I Section B. Its high-risk requirements apply through that sector's legislation.",
      appliesFrom: DATES.annexI,
    });
  }

  for (const [question, carveOuts] of Object.entries(CARVE_OUTS)) {
    for (const value of asList(answers[question])) {
      const note = carveOuts[value];
      if (note) notes.push(note);
    }
  }

  const annexMatches = Object.entries(ANNEX_III_HIGH_RISK_USES).filter(([question, values]) =>
    asList(answers[question]).some((value) => values.includes(value)),
  );
  const addAnnexIII = (question: string, text: string) => {
    routes.add(question === "critical_infrastructure_use" ? "annex_iii_point_2" : "annex_iii");
    high.push({ article: ANNEX_III_ARTICLE[question], text, appliesFrom: DATES.annexIII });
  };
  // The Article 6(3) derogation only counts when nothing else makes the system
  // high risk.
  let derogation: ClassificationReason | undefined;
  if (annexMatches.length > 0) {
    const derogationAnswer = answers.derogation as string | undefined;
    if (answers.profiling === "yes") {
      for (const [question] of annexMatches) {
        addAnnexIII(
          question,
          "The system is used for a listed high-risk purpose and profiles people, so the Article 6(3) exemption cannot apply.",
        );
      }
    } else if (derogationAnswer && derogationAnswer !== "none") {
      derogation = DEROGATIONS[derogationAnswer];
    } else {
      for (const [question] of annexMatches) {
        addAnnexIII(question, "The system is used for a purpose listed as high risk in Annex III.");
      }
    }
  }
  const appliedDerogation = high.length === 0 ? derogation : undefined;
  if (appliedDerogation) notes.push({ ...appliedDerogation, appliesFrom: DATES.annexIII });
  const derogationObligations: ClassificationReason[] = appliedDerogation
    ? [
        {
          article: "Article 6(4)",
          text: "The provider documents the assessment that the system is not high risk before placing it on the market or putting it into service.",
          appliesFrom: DATES.annexIII,
        },
        {
          article: "Article 49(2)",
          text: "The provider registers the system in the EU database.",
          appliesFrom: DATES.annexIII,
        },
      ]
    : [];

  const transparencyKeys = asList(answers.transparency).filter((t) => t !== "none");
  const transparencyReasons = transparencyKeys.map((t) => TRANSPARENCY[t].reason);
  const transparencyObligations = transparencyKeys
    .filter((t) => role === null || TRANSPARENCY[t].role === role)
    .map((t) => TRANSPARENCY[t].obligation);

  const level: ClassificationLevel =
    high.length > 0 ? "High risk" : transparencyKeys.length > 0 ? "Limited risk" : "Minimal risk";
  const highObligations = level === "High risk" ? highRiskObligations(routes, role) : [];

  return result(
    level,
    [...high, ...notes, ...transparencyReasons],
    [...highObligations, ...derogationObligations, ...transparencyObligations, AI_LITERACY],
  );
};
