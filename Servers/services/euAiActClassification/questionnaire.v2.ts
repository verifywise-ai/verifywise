import { Condition, Question, Questionnaire } from "./types";

const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];
const OTHER = { value: "other", label: "Another use in this area" };
const NONE = { value: "none", label: "None of these", exclusive: true };

// Article 5 is cleared when no listed practice applies, real-time biometric
// identification is absent or authorised, and banned content is absent or
// safeguarded. Every combination is one group.
const NO_ART5_PRACTICE: Condition = { questionId: "art5_practices", anyOf: ["none"] };
const RBI_CLEARED: Condition[] = [
  { questionId: "rbi_law_enforcement", anyOf: ["no"] },
  { questionId: "rbi_objective", noneOf: ["none"] },
];
const CONTENT_CLEARED: Condition[] = [
  { questionId: "intimate_content", anyOf: ["no"] },
  { questionId: "intimate_content_safeguards", anyOf: ["yes"] },
];
const NOT_PROHIBITED: Condition[][] = RBI_CLEARED.flatMap((rbi) =>
  CONTENT_CLEARED.map((content) => [NO_ART5_PRACTICE, rbi, content]),
);
const withAll = (groups: Condition[][], extra: Condition[]) =>
  groups.map((group) => [...group, ...extra]);

/** Annex III follow-up question id → the answers that make the system high risk. */
export const ANNEX_III_HIGH_RISK_USES: Record<string, string[]> = {
  biometrics_use: ["remote_identification", "biometric_categorisation", "emotion_recognition"],
  critical_infrastructure_use: ["safety_component"],
  education_use: ["admission", "learning_outcomes", "education_level", "test_monitoring"],
  employment_use: ["recruitment", "work_relationship_decisions", "task_allocation_monitoring"],
  essential_services_use: [
    "public_assistance",
    "creditworthiness",
    "life_health_insurance",
    "emergency_triage",
  ],
  law_enforcement_use: [
    "victim_risk",
    "polygraph",
    "evidence_reliability",
    "offending_risk",
    "profiling",
  ],
  migration_use: ["polygraph", "risk_assessment", "application_examination", "identification"],
  justice_democracy_use: ["judicial_assistance", "election_influence"],
};

// Each property is named (not positional) so the translation-coverage test
// in Clients can find every user-facing string by its key.
const followUp = (def: {
  id: string;
  area: string;
  articleRef: string;
  text: string;
  options: Question["options"];
}): Question => ({
  id: def.id,
  text: def.text,
  articleRef: def.articleRef,
  inputType: "multi_select",
  options: [...def.options, OTHER],
  showWhen: [[{ questionId: "annex_iii_areas", anyOf: [def.area] }]],
});

const QUESTIONS: Question[] = [
  {
    id: "scope",
    text: "Is the system developed and used only for scientific research and development, and not placed on the market or put into service?",
    articleRef: "Article 2(6) and 2(8)",
    inputType: "single_select",
    options: [
      { value: "research_only", label: "Yes, research and development only" },
      { value: "in_scope", label: "No, it is or will be placed on the market or used" },
    ],
  },
  {
    id: "role",
    text: "Are you the provider or the deployer of this AI system?",
    articleRef: "Article 3(3) and 3(4)",
    inputType: "single_select",
    options: [
      {
        value: "provider",
        label: "Provider",
        description:
          "We develop the system, or have it developed, and place it on the market or put it into service under our name.",
      },
      {
        value: "deployer",
        label: "Deployer",
        description: "We use the system under our authority in a professional activity.",
      },
    ],
    showWhen: [[{ questionId: "scope", anyOf: ["in_scope"] }]],
  },
  {
    id: "art5_practices",
    text: "Does the system do any of the following?",
    articleRef: "Article 5(1)(a)-(g)",
    inputType: "multi_select",
    options: [
      {
        value: "manipulation",
        label:
          "Uses subliminal, manipulative or deceptive techniques that materially distort people's behaviour and are likely to cause significant harm",
      },
      {
        value: "exploit_vulnerabilities",
        label:
          "Exploits vulnerabilities due to age, disability or a social or economic situation to materially distort behaviour in a way likely to cause significant harm",
      },
      {
        value: "social_scoring",
        label:
          "Evaluates or classifies people based on social behaviour or personal characteristics, leading to unjustified or unrelated detrimental treatment (social scoring)",
      },
      {
        value: "crime_prediction",
        label:
          "Assesses or predicts the risk of a person committing a criminal offence based solely on profiling or personality traits",
      },
      {
        value: "facial_scraping",
        label:
          "Creates or expands facial recognition databases through untargeted scraping of facial images from the internet or CCTV footage",
      },
      {
        value: "emotion_workplace_education",
        label:
          "Infers the emotions of people at work or in education institutions, other than for medical or safety reasons",
      },
      {
        value: "biometric_categorisation",
        label:
          "Categorises people using biometric data to deduce race, political opinions, trade union membership, religious or philosophical beliefs, sex life or sexual orientation",
      },
      NONE,
    ],
    showWhen: [[{ questionId: "role", anyOf: ["provider", "deployer"] }]],
  },
  {
    id: "rbi_law_enforcement",
    text: "Is the system used for real-time remote biometric identification of people in publicly accessible spaces for law enforcement?",
    articleRef: "Article 5(1)(h)",
    inputType: "single_select",
    options: YES_NO,
    showWhen: [[NO_ART5_PRACTICE]],
  },
  {
    id: "rbi_objective",
    text: "Is that use strictly necessary for one of these objectives, with the prior authorisation Article 5(3) requires?",
    articleRef: "Article 5(1)(h), 5(2) and 5(3)",
    inputType: "single_select",
    options: [
      {
        value: "victims_missing",
        label:
          "Targeted search for specific victims of abduction, trafficking in human beings or sexual exploitation, or for missing persons",
      },
      {
        value: "imminent_threat",
        label:
          "Preventing a specific, substantial and imminent threat to life or physical safety, or a genuine and present or foreseeable terrorist attack",
      },
      {
        value: "serious_crime_suspects",
        label:
          "Locating or identifying a person suspected of a serious criminal offence listed in Annex II, punishable by at least four years' custody",
      },
      { value: "none", label: "None of these, or no prior authorisation" },
    ],
    showWhen: [[{ questionId: "rbi_law_enforcement", anyOf: ["yes"] }]],
  },
  {
    id: "intimate_content",
    text: "Can the system generate or manipulate images, video or audio showing real people in intimate situations without their consent, or child sexual abuse material?",
    articleRef: "Article 5, as amended by Regulation (EU) 2026/1744",
    inputType: "single_select",
    options: YES_NO,
    showWhen: RBI_CLEARED.map((rbi) => [NO_ART5_PRACTICE, rbi]),
  },
  {
    id: "intimate_content_safeguards",
    text: "Does the provider apply safeguards that prevent the system from generating such content?",
    help: "Systems with adequate safeguards against generating this content are not covered by the ban.",
    articleRef: "Article 5, as amended by Regulation (EU) 2026/1744",
    inputType: "single_select",
    options: YES_NO,
    showWhen: [[{ questionId: "intimate_content", anyOf: ["yes"] }]],
  },
  {
    id: "safety_function",
    text: "Is the system itself a product, or does it perform a safety function in a product, covered by the EU product legislation listed in Annex I?",
    articleRef: "Article 6(1) and Annex I",
    inputType: "single_select",
    options: [
      {
        value: "section_a",
        label:
          "Yes: a product under Annex I Section A that needs a third-party conformity assessment",
        description:
          "For example medical devices, in vitro diagnostic devices, toys, lifts, radio equipment, pressure equipment or personal protective equipment.",
      },
      {
        value: "section_b",
        label: "Yes: a product under Annex I Section B",
        description:
          "Vehicles, aviation, marine equipment, rail systems, agricultural and forestry vehicles, or machinery.",
      },
      { value: "no", label: "No" },
    ],
    showWhen: NOT_PROHIBITED,
  },
  {
    id: "annex_iii_areas",
    text: "Is the system intended to be used in any of these areas?",
    articleRef: "Article 6(2) and Annex III",
    inputType: "multi_select",
    options: [
      { value: "biometrics", label: "Biometrics" },
      {
        value: "critical_infrastructure",
        label:
          "Critical infrastructure (digital infrastructure, road traffic, water, gas, heating or electricity supply)",
      },
      { value: "education", label: "Education and vocational training" },
      {
        value: "employment",
        label: "Employment, workers' management and access to self-employment",
      },
      {
        value: "essential_services",
        label:
          "Access to essential private and public services and benefits (public assistance, credit, insurance, emergency services)",
      },
      { value: "law_enforcement", label: "Law enforcement" },
      { value: "migration", label: "Migration, asylum and border control" },
      {
        value: "justice_democracy",
        label: "Administration of justice and democratic processes",
      },
      NONE,
    ],
    showWhen: withAll(NOT_PROHIBITED, [{ questionId: "safety_function", anyOf: ["no"] }]),
  },
  followUp({
    id: "biometrics_use",
    area: "biometrics",
    articleRef: "Annex III, point 1",
    text: "How is the system used in biometrics?",
    options: [
      { value: "remote_identification", label: "Remote biometric identification" },
      {
        value: "verification_only",
        label: "Verification only: confirming that a person is who they claim to be",
      },
      {
        value: "biometric_categorisation",
        label:
          "Categorising people by sensitive or protected attributes inferred from biometric data",
      },
      { value: "emotion_recognition", label: "Emotion recognition" },
    ],
  }),
  followUp({
    id: "critical_infrastructure_use",
    area: "critical_infrastructure",
    articleRef: "Annex III, point 2",
    text: "How is the system used in critical infrastructure?",
    options: [
      {
        value: "safety_component",
        label:
          "As a safety component in managing or operating critical digital infrastructure, road traffic, or the supply of water, gas, heating or electricity",
      },
    ],
  }),
  followUp({
    id: "education_use",
    area: "education",
    articleRef: "Annex III, point 3",
    text: "How is the system used in education?",
    options: [
      {
        value: "admission",
        label: "Deciding access or admission, or assigning people to institutions",
      },
      { value: "learning_outcomes", label: "Evaluating learning outcomes" },
      {
        value: "education_level",
        label: "Assessing the level of education a person will receive or access",
      },
      {
        value: "test_monitoring",
        label: "Monitoring and detecting prohibited behaviour during tests",
      },
    ],
  }),
  followUp({
    id: "employment_use",
    area: "employment",
    articleRef: "Annex III, point 4",
    text: "How is the system used in employment?",
    options: [
      {
        value: "recruitment",
        label:
          "Recruiting or selecting people, including targeted job ads and filtering or evaluating applications",
      },
      {
        value: "work_relationship_decisions",
        label: "Making decisions on terms of work, promotion or termination",
      },
      {
        value: "task_allocation_monitoring",
        label:
          "Allocating tasks based on behaviour or personal traits, or monitoring and evaluating performance",
      },
    ],
  }),
  followUp({
    id: "essential_services_use",
    area: "essential_services",
    articleRef: "Annex III, point 5",
    text: "How is the system used for essential services?",
    options: [
      {
        value: "public_assistance",
        label: "Evaluating eligibility for public assistance benefits and services",
      },
      {
        value: "creditworthiness",
        label: "Evaluating creditworthiness or establishing a credit score",
      },
      { value: "fraud_detection", label: "Detecting financial fraud" },
      {
        value: "life_health_insurance",
        label: "Risk assessment and pricing for life or health insurance",
      },
      {
        value: "emergency_triage",
        label:
          "Evaluating and classifying emergency calls, dispatching emergency services or emergency patient triage",
      },
    ],
  }),
  followUp({
    id: "law_enforcement_use",
    area: "law_enforcement",
    articleRef: "Annex III, point 6",
    text: "How is the system used in law enforcement?",
    options: [
      { value: "victim_risk", label: "Assessing the risk of a person becoming a victim of crime" },
      { value: "polygraph", label: "As a polygraph or similar tool" },
      { value: "evidence_reliability", label: "Evaluating the reliability of evidence" },
      {
        value: "offending_risk",
        label: "Assessing the risk of offending or re-offending, not solely based on profiling",
      },
      {
        value: "profiling",
        label:
          "Profiling people in the detection, investigation or prosecution of criminal offences",
      },
    ],
  }),
  followUp({
    id: "migration_use",
    area: "migration",
    articleRef: "Annex III, point 7",
    text: "How is the system used in migration, asylum or border control?",
    options: [
      { value: "polygraph", label: "As a polygraph or similar tool" },
      {
        value: "risk_assessment",
        label: "Assessing security, irregular migration or health risks posed by a person",
      },
      {
        value: "application_examination",
        label: "Examining applications for asylum, visas or residence permits",
      },
      { value: "identification", label: "Detecting, recognising or identifying people" },
      { value: "travel_document_verification", label: "Verifying travel documents" },
    ],
  }),
  followUp({
    id: "justice_democracy_use",
    area: "justice_democracy",
    articleRef: "Annex III, point 8",
    text: "How is the system used in justice or democratic processes?",
    options: [
      {
        value: "judicial_assistance",
        label:
          "Assisting a judicial authority, or alternative dispute resolution, in researching and interpreting facts and law",
      },
      {
        value: "election_influence",
        label: "Influencing the outcome of an election or referendum, or people's voting behaviour",
      },
      {
        value: "campaign_logistics",
        label:
          "Organising, optimising or structuring political campaigns administratively or logistically",
      },
    ],
  }),
  {
    id: "profiling",
    text: "Does the system profile people, meaning automated processing of personal data to evaluate aspects such as work performance, economic situation, health, preferences, interests, reliability, behaviour, location or movements?",
    articleRef: "Article 6(3), last subparagraph",
    inputType: "single_select",
    options: YES_NO,
    showWhen: Object.entries(ANNEX_III_HIGH_RISK_USES).map(([questionId, values]) => [
      { questionId, anyOf: values },
    ]),
  },
  {
    id: "derogation",
    text: "Does one of these describe the system, so that it does not materially influence the outcome of decisions?",
    articleRef: "Article 6(3)",
    inputType: "single_select",
    options: [
      { value: "narrow_procedural", label: "It performs a narrow procedural task" },
      {
        value: "improve_human_activity",
        label: "It improves the result of a previously completed human activity",
      },
      {
        value: "detect_patterns",
        label:
          "It detects decision-making patterns or deviations from prior patterns, without replacing or influencing the human assessment without proper human review",
      },
      {
        value: "preparatory_task",
        label: "It performs a preparatory task to an assessment relevant to the Annex III uses",
      },
      { value: "none", label: "None of these" },
    ],
    showWhen: [[{ questionId: "profiling", anyOf: ["no"] }]],
  },
  {
    id: "transparency",
    text: "Does the system do any of the following?",
    articleRef: "Article 50",
    inputType: "multi_select",
    options: [
      {
        value: "interacts",
        label: "Interacts directly with people, for example a chatbot or voice assistant",
      },
      { value: "generates", label: "Generates synthetic audio, images, video or text" },
      {
        value: "emotion_biometric",
        label: "Recognises emotions or categorises people using biometric data",
      },
      {
        value: "deepfake",
        label:
          "Produces deepfakes, or generates or edits text published to inform the public on matters of public interest",
      },
      NONE,
    ],
    showWhen: NOT_PROHIBITED,
  },
];

export const QUESTIONNAIRE_V2: Questionnaire = { version: 2, questions: QUESTIONS };
