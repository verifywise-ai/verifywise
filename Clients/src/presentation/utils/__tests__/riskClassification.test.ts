import { describe, it, expect } from "vitest";
import { classifyRisk } from "../riskClassification";
import { IQuestionnaireAnswers } from "../../pages/ProjectView/RiskAnalysisModal/iQuestion";

const emptyAnswers: IQuestionnaireAnswers = {} as IQuestionnaireAnswers;

describe("classifyRisk", () => {
  describe("Prohibited — biometric practices", () => {
    it("emotion recognition in education context → PROHIBITED", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q1b: "emotion_recognition",
        Q2: ["students"],
      });
      expect(result.level).toBe("PROHIBITED");
    });

    it("emotion recognition in workplace context (employees) → PROHIBITED", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q1b: "emotion_recognition",
        Q2: ["employees"],
      });
      expect(result.level).toBe("PROHIBITED");
    });

    it("emotion recognition in workplace context (job_applicants) → PROHIBITED", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q1b: "emotion_recognition",
        Q2: ["job_applicants"],
      });
      expect(result.level).toBe("PROHIBITED");
    });

    it("emotion recognition with education provider context → PROHIBITED", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q1b: "emotion_recognition",
        Q3: "education_provider",
      });
      expect(result.level).toBe("PROHIBITED");
    });

    it("biometric categorisation of sensitive attributes → PROHIBITED", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q1b: "biometric_categorisation_sensitive",
      });
      expect(result.level).toBe("PROHIBITED");
    });

    it("realtime remote biometric (non-law-enforcement) → PROHIBITED", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q1b: "realtime_remote_biometric",
        Q3: "healthcare",
      });
      expect(result.level).toBe("PROHIBITED");
    });

    it("realtime remote biometric (law enforcement) → HIGH_RISK", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q1b: "realtime_remote_biometric",
        Q3: "law_enforcement",
      });
      expect(result.level).toBe("HIGH_RISK");
    });
  });

  describe("High risk — safety component", () => {
    it("safety component (Q1d=yes) → HIGH_RISK", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q1d: "yes",
      });
      expect(result.level).toBe("HIGH_RISK");
    });
  });

  describe("High risk — Annex III", () => {
    it("decisions about people with Q1a set → HIGH_RISK", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q1: "decisions_about_people",
        Q1a: "employment",
      });
      expect(result.level).toBe("HIGH_RISK");
    });

    it("post biometric identification → HIGH_RISK", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q1b: "post_biometric_identification",
      });
      expect(result.level).toBe("HIGH_RISK");
    });
  });

  describe("High risk — critical infrastructure", () => {
    it("Q1=critical_infrastructure → HIGH_RISK", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q1: "critical_infrastructure",
      });
      expect(result.level).toBe("HIGH_RISK");
    });

    it("Q3=critical_infrastructure → HIGH_RISK", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q3: "critical_infrastructure",
      });
      expect(result.level).toBe("HIGH_RISK");
    });
  });

  describe("Prohibited — general (non-biometric)", () => {
    it("social scoring (Q4=yes) → PROHIBITED", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q4: "yes",
      });
      expect(result.level).toBe("PROHIBITED");
    });

    it("untargeted facial image scraping (Q5=yes) → PROHIBITED", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q5: "yes",
      });
      expect(result.level).toBe("PROHIBITED");
    });
  });

  describe("Limited risk — transparency requirements", () => {
    it("conversational assistance → LIMITED_RISK", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q1: "conversational_assistance",
      });
      expect(result.level).toBe("LIMITED_RISK");
    });

    it("generate media → LIMITED_RISK", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q1: "generate_media",
      });
      expect(result.level).toBe("LIMITED_RISK");
    });

    it("synthetic media (Q1c=yes) → LIMITED_RISK", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q1c: "yes",
      });
      expect(result.level).toBe("LIMITED_RISK");
    });

    it("biometric categorisation non-sensitive → LIMITED_RISK", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q1b: "biometric_categorisation_non_sensitive",
      });
      expect(result.level).toBe("LIMITED_RISK");
    });
  });

  describe("Minimal risk — default", () => {
    it("empty answers → MINIMAL_RISK", () => {
      const result = classifyRisk(emptyAnswers);
      expect(result.level).toBe("MINIMAL_RISK");
    });

    it("no matching conditions → MINIMAL_RISK", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q1: "other_purpose",
        Q4: "no",
        Q5: "no",
      });
      expect(result.level).toBe("MINIMAL_RISK");
    });
  });

  describe("Priority ordering", () => {
    it("biometric prohibited takes priority over safety component", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q1b: "biometric_categorisation_sensitive",
        Q1d: "yes", // safety component
      });
      expect(result.level).toBe("PROHIBITED");
    });

    it("safety component takes priority over Annex III", () => {
      const result = classifyRisk({
        ...emptyAnswers,
        Q1d: "yes",
        Q1: "decisions_about_people",
        Q1a: "employment",
      });
      expect(result.level).toBe("HIGH_RISK");
    });
  });
});
