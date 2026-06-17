import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../user.utils", () => ({
  getUserProjects: jest.fn<any>(),
  getControlCategoriesForProject: jest.fn<any>(),
  getControlForControlCategory: jest.fn<any>(),
  getSubControlForControl: jest.fn<any>(),
  getAssessmentsForProject: jest.fn<any>(),
  getTopicsForAssessment: jest.fn<any>(),
  getSubTopicsForTopic: jest.fn<any>(),
  getQuestionsForSubTopic: jest.fn<any>(),
}));

import { calculateUserProgress } from "../userProgress.utils";
import {
  getUserProjects,
  getControlCategoriesForProject,
  getControlForControlCategory,
  getSubControlForControl,
  getAssessmentsForProject,
  getTopicsForAssessment,
  getSubTopicsForTopic,
  getQuestionsForSubTopic,
} from "../../user.utils";

const mockProjects = getUserProjects as jest.MockedFunction<typeof getUserProjects>;
const mockCategories = getControlCategoriesForProject as jest.MockedFunction<
  typeof getControlCategoriesForProject
>;
const mockControls = getControlForControlCategory as jest.MockedFunction<
  typeof getControlForControlCategory
>;
const mockSubControls = getSubControlForControl as jest.MockedFunction<
  typeof getSubControlForControl
>;
const mockAssessments = getAssessmentsForProject as jest.MockedFunction<
  typeof getAssessmentsForProject
>;
const mockTopics = getTopicsForAssessment as jest.MockedFunction<typeof getTopicsForAssessment>;
const mockSubTopics = getSubTopicsForTopic as jest.MockedFunction<typeof getSubTopicsForTopic>;
const mockQuestions = getQuestionsForSubTopic as jest.MockedFunction<typeof getQuestionsForSubTopic>;

describe("calculateUserProgress", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns zero totals when user has no projects", async () => {
    mockProjects.mockResolvedValueOnce([] as any);
    const result = await calculateUserProgress(1, 99);
    expect(result).toEqual({
      assessmentsMetadata: [],
      controlsMetadata: [],
      allTotalAssessments: 0,
      allDoneAssessments: 0,
      allTotalSubControls: 0,
      allDoneSubControls: 0,
    });
  });

  it("aggregates controls and assessments across projects", async () => {
    mockProjects.mockResolvedValueOnce([{ id: 1 }, { id: 2 }] as any);

    // Project 1 controls: 1 category → 1 control → 2 subcontrols (1 Done, 1 not)
    // Project 1 assessments: 1 assessment → 1 topic → 1 subtopic → 2 questions (1 answered)
    mockCategories.mockResolvedValueOnce([{ id: 10 }] as any);
    mockControls.mockResolvedValueOnce([{ id: 100 }] as any);
    mockSubControls.mockResolvedValueOnce([
      { status: "Done" },
      { status: "InProgress" },
    ] as any);
    mockAssessments.mockResolvedValueOnce([{ id: 200 }] as any);
    mockTopics.mockResolvedValueOnce([{ id: 300 }] as any);
    mockSubTopics.mockResolvedValueOnce([{ id: 400 }] as any);
    mockQuestions.mockResolvedValueOnce([
      { answer: "yes" },
      { answer: null },
    ] as any);

    // Project 2 controls: 1 category → 1 control → 1 subcontrol (Done)
    // Project 2 assessments: 0 assessments
    mockCategories.mockResolvedValueOnce([{ id: 11 }] as any);
    mockControls.mockResolvedValueOnce([{ id: 101 }] as any);
    mockSubControls.mockResolvedValueOnce([{ status: "Done" }] as any);
    mockAssessments.mockResolvedValueOnce([] as any);

    const result = await calculateUserProgress(7, 99);
    expect(result.allTotalSubControls).toBe(3);
    expect(result.allDoneSubControls).toBe(2);
    expect(result.allTotalAssessments).toBe(2);
    expect(result.allDoneAssessments).toBe(1);
    expect(result.controlsMetadata).toHaveLength(2);
    expect(result.controlsMetadata[0]).toEqual({
      projectId: 1,
      totalSubControls: 2,
      doneSubControls: 1,
    });
    expect(result.assessmentsMetadata[1]).toEqual({
      projectId: 2,
      totalAssessments: 0,
      doneAssessments: 0,
    });
  });
});
