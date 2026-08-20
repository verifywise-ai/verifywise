import {
  QUESTIONS,
  getVisibleQuestions,
  getNextQuestion,
  getPreviousQuestion,
  getProgress,
} from "./questions.config";

describe("questions.config", () => {
  describe("getVisibleQuestions", () => {
    it("excludes conditional questions when their condition is not met", () => {
      const visible = getVisibleQuestions({});
      const ids = visible.map((q) => q.id);
      expect(ids).toContain("Q1");
      expect(ids).not.toContain("Q1a");
      expect(ids).not.toContain("Q1b");
      expect(ids).not.toContain("Q1c");
      expect(ids).not.toContain("Q1c_followup");
    });

    it("includes Q1a when Q1 is decisions_about_people", () => {
      const visible = getVisibleQuestions({ Q1: "decisions_about_people" });
      expect(visible.map((q) => q.id)).toContain("Q1a");
    });

    it("includes Q1b when Q1 is biometric_identification", () => {
      const visible = getVisibleQuestions({ Q1: "biometric_identification" });
      expect(visible.map((q) => q.id)).toContain("Q1b");
    });

    it("includes Q1c when Q1 is generate_media, and Q1c_followup when Q1c is yes", () => {
      const visible = getVisibleQuestions({ Q1: "generate_media", Q1c: "yes" });
      const ids = visible.map((q) => q.id);
      expect(ids).toContain("Q1c");
      expect(ids).toContain("Q1c_followup");
    });

    it("excludes Q1c_followup when Q1c is no", () => {
      const visible = getVisibleQuestions({ Q1: "generate_media", Q1c: "no" });
      expect(visible.map((q) => q.id)).not.toContain("Q1c_followup");
    });

    it("always includes unconditional questions Q1d, Q2, Q3, Q4, Q5", () => {
      const ids = getVisibleQuestions({}).map((q) => q.id);
      expect(ids).toEqual(expect.arrayContaining(["Q1d", "Q2", "Q3", "Q4", "Q5"]));
    });
  });

  describe("getNextQuestion", () => {
    it("returns the next visible question", () => {
      const next = getNextQuestion("Q1", {});
      expect(next?.id).toBe("Q1d");
    });

    it("returns the conditional next question when its condition is satisfied", () => {
      const next = getNextQuestion("Q1", { Q1: "decisions_about_people" });
      expect(next?.id).toBe("Q1a");
    });

    it("returns null for the last question", () => {
      const next = getNextQuestion("Q5", {});
      expect(next).toBeNull();
    });

    it("returns null when the current question id is not visible", () => {
      const next = getNextQuestion("Q1a", {});
      expect(next).toBeNull();
    });
  });

  describe("getPreviousQuestion", () => {
    it("returns the previous visible question", () => {
      const prev = getPreviousQuestion("Q1d", {});
      expect(prev?.id).toBe("Q1");
    });

    it("returns null for the first question", () => {
      const prev = getPreviousQuestion("Q1", {});
      expect(prev).toBeNull();
    });

    it("returns null when the current question is not found", () => {
      const prev = getPreviousQuestion("Q1a", {});
      expect(prev).toBeNull();
    });
  });

  describe("getProgress", () => {
    it("computes current step and total for the first question", () => {
      const progress = getProgress("Q1", {});
      expect(progress.current).toBe(1);
      expect(progress.total).toBe(QUESTIONS.filter((q) => !q.showCondition).length);
    });

    it("computes progress accounting for conditional questions shown", () => {
      const progress = getProgress("Q1a", { Q1: "decisions_about_people" });
      expect(progress.current).toBe(2);
    });

    it("defaults current to 1 when the question id is not visible", () => {
      const progress = getProgress("Q1a", {});
      expect(progress.current).toBe(1);
    });
  });
});
