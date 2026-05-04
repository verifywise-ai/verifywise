import {
  ClassificationResult,
  IQuestionnaireAnswers,
} from "../pages/ProjectView/RiskAnalysisModal/iQuestion";

/**
 * Main classification function
 * Evaluates answers and returns risk classification with rationale
 */
export const classifyRisk = (answers: IQuestionnaireAnswers): ClassificationResult => {
  // 1) Immediate prohibited checks - biometric
  const biometricProhibited = checkBiometricProhibited(answers);
  if (biometricProhibited) return biometricProhibited;

  // 2) Safety component route to high-risk (Article 6(1))
  const safetyComponent = checkSafetyComponent(answers);
  if (safetyComponent) return safetyComponent;

  // 3) Annex III high-risk routing by domain
  const annexIIIHighRisk = checkAnnexIIIHighRisk(answers);
  if (annexIIIHighRisk) return annexIIIHighRisk;

  // 4) Critical infrastructure lane
  const criticalInfrastructure = checkCriticalInfrastructure(answers);
  if (criticalInfrastructure) return criticalInfrastructure;

  // 5) General prohibited checks (non-biometric)
  const generalProhibited = checkGeneralProhibited(answers);
  if (generalProhibited) return generalProhibited;

  // 6) Limited-risk transparency checks
  const limitedRisk = checkLimitedRisk(answers);
  if (limitedRisk) return limitedRisk;

  // 7) Default to minimal risk
  return {
    level: "MINIMAL_RISK",
  };
};

/**
 * 1. Check for prohibited biometric practices
 */
const checkBiometricProhibited = (answers: IQuestionnaireAnswers): ClassificationResult | null => {
  const { Q1b, Q2, Q3 } = answers;

  if (!Q1b) return null;

  // Emotion recognition in education or workplace context (Article 5)
  if (Q1b === "emotion_recognition") {
    const isEducationContext = Array.isArray(Q2) && Q2.includes("students");
    const isWorkplaceContext =
      Array.isArray(Q2) && (Q2.includes("employees") || Q2.includes("job_applicants"));
    const isEducationProvider = Q3 === "education_provider";

    if (isEducationContext || isWorkplaceContext || isEducationProvider) {
      return {
        level: "PROHIBITED",
      };
    }
  }

  // Biometric categorisation inferring sensitive/protected attributes (Article 5)
  if (Q1b === "biometric_categorisation_sensitive") {
    return {
      level: "PROHIBITED",
    };
  }

  // Real-time remote biometric identification in public spaces (Article 5)
  if (Q1b === "realtime_remote_biometric") {
    if (Q3 !== "law_enforcement") {
      return {
        level: "PROHIBITED",
      };
    } else {
      // For law enforcement, this requires special derogation/authorization
      // Note: In a full implementation, you'd ask for derogation details

      return {
        level: "HIGH_RISK",
      };
    }
  }

  return null;
};

/**
 * 2. Check if AI is a safety component
 */
const checkSafetyComponent = (answers: IQuestionnaireAnswers): ClassificationResult | null => {
  if (answers.Q1d === "yes") {
    return {
      level: "HIGH_RISK",
    };
  }

  return null;
};

/**
 * 3. Check Annex III high-risk classifications by domain
 */
const checkAnnexIIIHighRisk = (answers: IQuestionnaireAnswers): ClassificationResult | null => {
  const { Q1, Q1a, Q1b } = answers;

  // Check for decisions about people (routes to Q1a)
  if (Q1 === "decisions_about_people" && Q1a) {
    return {
      level: "HIGH_RISK",
    };
  }

  // Special biometric cases from Annex III
  if (Q1b === "post_biometric_identification") {
    return {
      level: "HIGH_RISK",
    };
  }

  // Biometric verification (one-to-one) is NOT automatically high-risk per Annex III carve-out
  // It continues to other checks

  return null;
};

/**
 * 4. Check critical infrastructure
 */
const checkCriticalInfrastructure = (
  answers: IQuestionnaireAnswers,
): ClassificationResult | null => {
  const { Q1, Q3 } = answers;

  if (Q1 === "critical_infrastructure" || Q3 === "critical_infrastructure") {
    return {
      level: "HIGH_RISK",
    };
  }

  return null;
};

/**
 * 5. General prohibited checks (non-biometric)
 */
const checkGeneralProhibited = (answers: IQuestionnaireAnswers): ClassificationResult | null => {
  // Social scoring
  if (answers.Q4 === "yes") {
    return {
      level: "PROHIBITED",
    };
  }

  // Untargeted facial image scraping
  if (answers.Q5 === "yes") {
    return {
      level: "PROHIBITED",
    };
  }

  return null;
};

/**
 * 6. Check limited-risk transparency requirements
 */
const checkLimitedRisk = (answers: IQuestionnaireAnswers): ClassificationResult | null => {
  const { Q1, Q1c, Q1b } = answers;

  // Conversational assistance (chatbots, virtual assistants)
  if (Q1 === "conversational_assistance") {
    return {
      level: "LIMITED_RISK",
    };
  }

  // Synthetic media / deepfakes
  if (Q1 === "generate_media" || Q1c === "yes") {
    return {
      level: "LIMITED_RISK",
    };
  }

  // Biometric categorisation using non-sensitive attributes
  if (Q1b === "biometric_categorisation_non_sensitive") {
    return {
      level: "LIMITED_RISK",
    };
  }

  return null;
};
