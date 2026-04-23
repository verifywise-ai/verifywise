import { describe, it, expect } from "vitest";
import getProjectData from "../getProjectData";
import { Assessments, Controls } from "../../../domain/types/projectStatus.types";

describe("getProjectData", () => {
  const baseAssessments: Assessments = {
    percentageComplete: 50,
    allDoneAssessments: 5,
    allTotalAssessments: 10,
    projects: [
      { projectId: 1, doneAssessments: 3, totalAssessments: 6 },
      { projectId: 2, doneAssessments: 2, totalAssessments: 4 },
    ],
  };

  const baseControls: Controls = {
    percentageComplete: 40,
    allDoneSubControls: 4,
    allTotalSubControls: 10,
    projects: [
      { projectId: 1, doneSubControls: 2, totalSubControls: 5 },
      { projectId: 2, doneSubControls: 2, totalSubControls: 5 },
    ],
  };

  it("returns correct data for an existing project", () => {
    const result = getProjectData({
      projectId: 1,
      assessments: baseAssessments,
      controls: baseControls,
    });

    expect(result.projectAssessments).toEqual({
      projectId: 1,
      doneAssessments: 3,
      totalAssessments: 6,
    });
    expect(result.projectControls).toEqual({
      projectId: 1,
      doneSubControls: 2,
      totalSubControls: 5,
    });
    expect(result.controlsProgress).toBe("2/5");
    expect(result.requirementsProgress).toBe("3/6");
    expect(result.controlsCompleted).toBe(2);
    expect(result.requirementsCompleted).toBe(3);
  });

  it("returns defaults when project is not found", () => {
    const result = getProjectData({
      projectId: 999,
      assessments: baseAssessments,
      controls: baseControls,
    });

    expect(result.controlsProgress).toBe("0/1");
    expect(result.requirementsProgress).toBe("0/1");
    expect(result.controlsCompleted).toBe(0);
    expect(result.requirementsCompleted).toBe(0);
  });

  it("handles undefined projects arrays", () => {
    const result = getProjectData({
      projectId: 1,
      assessments: { ...baseAssessments, projects: undefined },
      controls: { ...baseControls, projects: undefined },
    });

    expect(result.controlsProgress).toBe("0/1");
    expect(result.requirementsProgress).toBe("0/1");
  });
});
