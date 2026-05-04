import { IQuestion, IQuestionnaireAnswers, QuestionId } from "./iQuestion";

export const QUESTIONS: IQuestion[] = [
  // Q1: Primary purpose
  {
    id: "Q1",
    text: "What's the primary purpose of your AI system?",
    inputType: "single_select",
    isRequired: true,
    options: [
      {
        value: "decisions_about_people",
        label: "Make or support decisions about people",
      },
      {
        value: "biometric_identification",
        label: "Identify or analyse people using biometrics",
      },
      {
        value: "critical_infrastructure",
        label: "Manage or operate critical infrastructure",
      },
      {
        value: "generate_media",
        label: "Generate or manipulate media that could be mistaken for real",
      },
      {
        value: "conversational_assistance",
        label: "Provide conversational assistance without making decisions about people",
      },
      {
        value: "data_analysis",
        label:
          "Analyse data for internal optimisation that doesn't affect individual rights or access",
      },
      {
        value: "research_prototype",
        label: "Research or prototype, not deployed to end users",
      },
    ],
  },

  // Q1a: Decision domain (conditional on Q1)
  {
    id: "Q1a",
    text: "In which domain are those decisions made?",
    inputType: "single_select",
    isRequired: true,
    showCondition: (answers: IQuestionnaireAnswers) => answers.Q1 === "decisions_about_people",
    options: [
      {
        value: "employment",
        label: "Employment and workers management",
      },
      {
        value: "education",
        label: "Education or vocational training",
      },
      {
        value: "essential_services",
        label: "Access to essential private or public services",
      },
      {
        value: "law_enforcement",
        label: "Law enforcement operations",
      },
      {
        value: "migration",
        label: "Migration, asylum, or border control",
      },
      {
        value: "justice",
        label: "Administration of justice or democratic processes",
      },
      {
        value: "other_decisions",
        label: "Other decisions about individuals",
      },
    ],
  },

  // Q1b: Biometric function (conditional on Q1)
  {
    id: "Q1b",
    text: "Which biometric function best describes your system?",
    inputType: "single_select",
    isRequired: true,
    showCondition: (answers: IQuestionnaireAnswers) => answers.Q1 === "biometric_identification",
    options: [
      {
        value: "realtime_remote_biometric",
        label: "Real time remote biometric identification in publicly accessible spaces",
      },
      {
        value: "post_biometric_identification",
        label: "Post or non real time biometric identification or one to many search",
      },
      {
        value: "biometric_verification",
        label: "Biometric verification, one to one check to confirm a claimed identity",
      },
      {
        value: "emotion_recognition",
        label: "Emotion recognition",
      },
      {
        value: "biometric_categorisation_sensitive",
        label: "Biometric categorisation inferring sensitive or protected attributes",
      },
      {
        value: "biometric_categorisation_non_sensitive",
        label: "Biometric categorisation using non sensitive attributes",
      },
    ],
  },

  // Q1c: Media generation (conditional on Q1)
  {
    id: "Q1c",
    text: "Does your system generate or manipulate media that could be mistaken for real?",
    inputType: "single_select",
    isRequired: true,
    showCondition: (answers: IQuestionnaireAnswers) => answers.Q1 === "generate_media",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },

  // Q1c follow-up: Person simulation
  {
    id: "Q1c_followup",
    text: "Does it simulate a real person's appearance, voice, or likeness?",
    inputType: "single_select",
    isRequired: true,
    showCondition: (answers: IQuestionnaireAnswers) => answers.Q1c === "yes",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },

  // Q1d: Safety component check
  {
    id: "Q1d",
    text: "Is the AI a safety component of a regulated product that requires third party conformity assessment under EU harmonisation law?",
    inputType: "single_select",
    isRequired: true,
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },

  // Q2: Affected parties
  {
    id: "Q2",
    text: "Who will be affected by the system's outcomes?",
    inputType: "multi_select",
    isRequired: true,
    options: [
      { value: "employees", label: "Employees" },
      { value: "job_applicants", label: "Job applicants or candidates" },
      { value: "students", label: "Students or learners" },
      { value: "patients", label: "Patients" },
      { value: "consumers", label: "Consumers or customers" },
      { value: "general_public", label: "General public" },
      { value: "migrants", label: "Migrants or asylum seekers" },
      { value: "suspects", label: "Suspects or offenders" },
      { value: "caseworkers", label: "Judges or administrative caseworkers" },
    ],
  },

  // Q3: Deploying organization
  {
    id: "Q3",
    text: "Who is deploying this system?",
    inputType: "single_select",
    isRequired: true,
    options: [
      { value: "private_sector", label: "Private sector organisation" },
      { value: "public_authority", label: "Public authority" },
      { value: "law_enforcement", label: "Law enforcement authority" },
      { value: "court", label: "Court or tribunal" },
      { value: "education_provider", label: "Education provider" },
      { value: "healthcare_provider", label: "Healthcare provider" },
      { value: "financial_services", label: "Financial services provider" },
      {
        value: "critical_infrastructure",
        label: "Critical infrastructure operator",
      },
    ],
  },

  // Q4: AI output usage
  {
    id: "Q4",
    text: "How will the AI's output be used?",
    inputType: "single_select",
    isRequired: true,
    options: [
      {
        value: "fully_automated",
        label: "Fully automated decision that determines outcomes",
      },
      {
        value: "decision_support",
        label:
          "Decision support reviewed by a human with real authority to accept or change the result",
      },
      {
        value: "assistive_tool",
        label: "Assistive tool, no decisions about people",
      },
      {
        value: "research_only",
        label: "Experimental research only, not deployed to users",
      },
      {
        value: "prototype_sandbox",
        label: "Prototype in a controlled sandbox, not accessible to the public",
      },
    ],
  },

  // Q5: Rights and access impact
  {
    id: "Q5",
    text: "Could the outcome affect a person's rights or access to services?",
    inputType: "single_select",
    isRequired: true,
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "unsure", label: "Unsure" },
    ],
  },
];

/**
 * Helper function to get visible questions based on current answers
 */
export const getVisibleQuestions = (answers: IQuestionnaireAnswers): IQuestion[] => {
  return QUESTIONS.filter((question) => {
    // If no show condition, always show
    if (!question.showCondition) return true;
    // Otherwise check the condition
    return question.showCondition(answers);
  });
};

/**
 * Helper function to get the next question based on current answers
 */
export const getNextQuestion = (
  currentQuestionId: QuestionId,
  answers: IQuestionnaireAnswers,
): IQuestion | null => {
  const visibleQuestions = getVisibleQuestions(answers);
  const currentIndex = visibleQuestions.findIndex((q) => q.id === currentQuestionId);

  if (currentIndex === -1 || currentIndex === visibleQuestions.length - 1) {
    return null;
  }

  return visibleQuestions[currentIndex + 1];
};

/**
 * Helper function to get the previous question
 */
export const getPreviousQuestion = (
  currentQuestionId: QuestionId,
  answers: IQuestionnaireAnswers,
): IQuestion | null => {
  const visibleQuestions = getVisibleQuestions(answers);
  const currentIndex = visibleQuestions.findIndex((q) => q.id === currentQuestionId);

  if (currentIndex <= 0) {
    return null;
  }

  return visibleQuestions[currentIndex - 1];
};

/**
 * Get progress information for the current questionnaire state
 */
export const getProgress = (
  currentQuestionId: QuestionId,
  answers: IQuestionnaireAnswers,
): { current: number; total: number } => {
  const visibleQuestions = getVisibleQuestions(answers);
  const currentIndex = visibleQuestions.findIndex((q) => q.id === currentQuestionId);

  return {
    current: currentIndex >= 0 ? currentIndex + 1 : 1,
    total: visibleQuestions.length,
  };
};
