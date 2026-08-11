/**
 * @fileoverview Guards the report's assessment and risk-colour mapping.
 *
 * @module utils/__tests__/reportingAssessment.utils
 */

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../eu.utils", () => ({
  getVisibleEuCategoryIdsForProject: jest.fn().mockResolvedValue([1]),
}));

import { getAssessmentReportQuery } from "../reporting.utils";
import { sequelize } from "../../database/db";

const mockQuery = sequelize.query as jest.Mock;

/** projects_frameworks lookup, then assessments lookup, then the flat read. */
function mockReads(rows: any[]) {
  mockQuery
    .mockResolvedValueOnce([[{ id: 7 }], 1])
    .mockResolvedValueOnce([[{ id: 9 }], 1])
    .mockResolvedValueOnce(rows);
}

const row = (over: Record<string, any> = {}) => ({
  topic_id: 1,
  topic_title: "Risk",
  subtopic_id: 2,
  subtopic_title: "General",
  question_id: 3,
  question: "Q?",
  answer: "A",
  status: "Answered",
  answer_id: 5,
  ...over,
});

describe("getAssessmentReportQuery", () => {
  beforeEach(() => jest.clearAllMocks());

  it("keeps a question whose answer row exists but has no status", async () => {
    // answers_eu.status is nullable. The loader this replaced was an INNER
    // JOIN on answers_eu, so an answer row with a NULL status still counted.
    // Deciding membership on `status !== null` instead would drop the question
    // from totalQuestions — the completion denominator the report leads with
    // and the analyzers reason over.
    mockReads([row({ status: null, answer: null })]);

    const topics = (await getAssessmentReportQuery(1, 1, 10)) as any[];

    expect(topics[0].subtopics[0].questions).toHaveLength(1);
  });

  it("drops a question that has no answer row for this assessment", async () => {
    mockReads([row({ answer_id: null, answer: null, status: null })]);

    const topics = (await getAssessmentReportQuery(1, 1, 10)) as any[];

    expect(topics[0].subtopics[0].questions).toHaveLength(0);
  });

  it("keeps a topic and subtopic that hold no questions at all", async () => {
    // The old loader listed every topic and subtopic in the framework whether
    // or not the project had answered anything.
    mockReads([row({ question_id: null, answer_id: null, answer: null, status: null })]);

    const topics = (await getAssessmentReportQuery(1, 1, 10)) as any[];

    expect(topics).toHaveLength(1);
    expect(topics[0].subtopics).toHaveLength(1);
    expect(topics[0].subtopics[0].questions).toEqual([]);
  });

  it("groups questions under their own subtopic and topic", async () => {
    mockReads([
      row(),
      row({ question_id: 4, answer_id: 6, question: "Q2?" }),
      row({ subtopic_id: 8, subtopic_title: "Scope", question_id: 5, answer_id: 7 }),
      row({ topic_id: 2, topic_title: "Data", subtopic_id: 9, question_id: 6, answer_id: 8 }),
    ]);

    const topics = (await getAssessmentReportQuery(1, 1, 10)) as any[];

    expect(topics.map((t) => t.title)).toEqual(["Risk", "Data"]);
    expect(topics[0].subtopics.map((s: any) => s.questions.length)).toEqual([2, 1]);
  });
});
