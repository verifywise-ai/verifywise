/**
 * Retrieves project data including assessments and controls progress.
 *
 * @param {GetProjectDataTypes} params - The parameters for getting project data.
 * @param {number} params.projectId - The ID of the project.
 * @param {Assessments} params.assessments - The assessments data.
 * @param {Controls} params.controls - The controls data.
 *
 * @returns {Object} An object containing project assessments, project controls,
 * controls progress, requirements progress, controls completed, and requirements completed.
 * @returns {AssessmentsProject} return.projectAssessments - The assessments data for the project.
 * @returns {ControlsProject} return.projectControls - The controls data for the project.
 * @returns {string} return.controlsProgress - The progress of controls in the format "done/total".
 * @returns {string} return.requirementsProgress - The progress of assessments in the format "done/total".
 * @returns {number} return.controlsCompleted - The number of completed controls.
 * @returns {number} return.requirementsCompleted - The number of completed assessments.
 */
import {
  Assessments,
  AssessmentsProject,
  Controls,
  ControlsProject,
} from "../../domain/types/projectStatus.types";

const DEFAULT_DONE_COUNT = 0;
const DEFAULT_TOTAL_COUNT = 1;

interface GetProjectDataTypes {
  assessments: Assessments;
  controls: Controls;
  projectId: number;
}

const getProjectData = ({ projectId, assessments, controls }: GetProjectDataTypes) => {
  const projectAssessments = assessments.projects?.find(
    (project: AssessmentsProject) => project.projectId === projectId,
  ) ?? {
    doneAssessments: DEFAULT_DONE_COUNT,
    projectId,
    totalAssessments: DEFAULT_TOTAL_COUNT,
  };

  const projectControls = controls.projects?.find(
    (project: ControlsProject) => project.projectId === projectId,
  ) ?? {
    doneSubControls: DEFAULT_DONE_COUNT,
    projectId,
    totalSubControls: DEFAULT_TOTAL_COUNT,
  };

  const controlsProgress = `${projectControls?.doneSubControls ?? 0}/${projectControls?.totalSubControls ?? 1}`;
  const requirementsProgress = `${projectAssessments?.doneAssessments ?? 0}/${projectAssessments?.totalAssessments ?? 1}`;

  const controlsCompleted = projectControls?.doneSubControls ?? 0;
  const requirementsCompleted = projectAssessments?.doneAssessments ?? 0;

  return {
    projectAssessments,
    projectControls,
    controlsProgress,
    requirementsProgress,
    controlsCompleted,
    requirementsCompleted,
  };
};

export default getProjectData;
