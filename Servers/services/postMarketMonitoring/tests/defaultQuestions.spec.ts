/**
 * @fileoverview Default PMM Questions Tests
 *
 * Tests for DEFAULT_PMM_QUESTIONS and helper functions.
 *
 * @module tests/defaultQuestions
 */

import {
  DEFAULT_PMM_QUESTIONS,
  getDefaultQuestionsForConfig,
  getDefaultQuestionsAsTemplate,
  seedDefaultQuestions,
  getReferencedArticles,
} from "../defaultQuestions";

describe("defaultQuestions", () => {
  describe("DEFAULT_PMM_QUESTIONS", () => {
    it("should contain at least one question", () => {
      expect(DEFAULT_PMM_QUESTIONS.length).toBeGreaterThan(0);
    });

    it("should have valid question structure", () => {
      for (const q of DEFAULT_PMM_QUESTIONS) {
        expect(typeof q.question_text).toBe("string");
        expect(q.question_text.length).toBeGreaterThan(0);
        expect(typeof q.question_type).toBe("string");
        expect(typeof q.is_required).toBe("boolean");
        expect(typeof q.allows_flag_for_concern).toBe("boolean");
      }
    });

    it("should reference EU AI Act articles", () => {
      const articles = getReferencedArticles();
      expect(articles.length).toBeGreaterThan(0);
    });
  });

  describe("getDefaultQuestionsForConfig", () => {
    it("should return questions with config_id set", () => {
      const questions = getDefaultQuestionsForConfig(42);
      expect(questions.length).toBe(DEFAULT_PMM_QUESTIONS.length);
      for (const q of questions) {
        expect(q.config_id).toBe(42);
      }
    });

    it("should assign sequential display_order starting at 1", () => {
      const questions = getDefaultQuestionsForConfig(1);
      for (let i = 0; i < questions.length; i++) {
        expect(questions[i].display_order).toBe(i + 1);
      }
    });

    it("should preserve question text and type", () => {
      const questions = getDefaultQuestionsForConfig(1);
      for (let i = 0; i < questions.length; i++) {
        expect(questions[i].question_text).toBe(DEFAULT_PMM_QUESTIONS[i].question_text);
        expect(questions[i].question_type).toBe(DEFAULT_PMM_QUESTIONS[i].question_type);
      }
    });

    it("should preserve optional fields", () => {
      const questions = getDefaultQuestionsForConfig(1);
      for (let i = 0; i < questions.length; i++) {
        expect(questions[i].options).toBe(DEFAULT_PMM_QUESTIONS[i].options);
        expect(questions[i].suggestion_text).toBe(DEFAULT_PMM_QUESTIONS[i].suggestion_text);
        expect(questions[i].is_required).toBe(DEFAULT_PMM_QUESTIONS[i].is_required);
        expect(questions[i].allows_flag_for_concern).toBe(
          DEFAULT_PMM_QUESTIONS[i].allows_flag_for_concern,
        );
        expect(questions[i].eu_ai_act_article).toBe(DEFAULT_PMM_QUESTIONS[i].eu_ai_act_article);
      }
    });
  });

  describe("getDefaultQuestionsAsTemplate", () => {
    it("should return questions with null config_id", () => {
      const questions = getDefaultQuestionsAsTemplate();
      expect(questions.length).toBe(DEFAULT_PMM_QUESTIONS.length);
      for (const q of questions) {
        expect(q.config_id).toBeNull();
      }
    });

    it("should have same content as getDefaultQuestionsForConfig except config_id", () => {
      const template = getDefaultQuestionsAsTemplate();
      const config = getDefaultQuestionsForConfig(99);
      for (let i = 0; i < template.length; i++) {
        expect(template[i].question_text).toBe(config[i].question_text);
        expect(template[i].question_type).toBe(config[i].question_type);
        expect(template[i].display_order).toBe(config[i].display_order);
      }
    });
  });

  describe("seedDefaultQuestions", () => {
    it("should call addQuestionFn for each default question", async () => {
      const mockAdd = jest.fn().mockResolvedValue({ id: 1 });
      await seedDefaultQuestions(42, 1, mockAdd);
      expect(mockAdd).toHaveBeenCalledTimes(DEFAULT_PMM_QUESTIONS.length);
    });

    it("should pass correct question data to addQuestionFn", async () => {
      const mockAdd = jest.fn().mockResolvedValue({ id: 1 });
      await seedDefaultQuestions(42, 1, mockAdd);
      const firstCall = mockAdd.mock.calls[0];
      expect(firstCall[0].config_id).toBe(42);
      expect(firstCall[1]).toBe(1);
    });

    it("should propagate errors from addQuestionFn", async () => {
      const mockAdd = jest.fn().mockRejectedValue(new Error("DB error"));
      await expect(seedDefaultQuestions(42, 1, mockAdd)).rejects.toThrow("DB error");
    });
  });

  describe("getReferencedArticles", () => {
    it("should return unique articles only", () => {
      const articles = getReferencedArticles();
      const unique = new Set(articles);
      expect(articles.length).toBe(unique.size);
    });

    it("should return strings", () => {
      const articles = getReferencedArticles();
      for (const a of articles) {
        expect(typeof a).toBe("string");
      }
    });
  });
});
