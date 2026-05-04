import { IAssessment } from "../../interfaces/i.assessment";

export const Assessments = (projectId1: number, projectId2: number): IAssessment[] => {
  return [
    { id: 1, project_id: projectId1 },
    { id: 2, project_id: projectId2 },
  ];
};
