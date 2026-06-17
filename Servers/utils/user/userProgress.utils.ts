/**
 * Aggregate "how much work has been done" across all projects accessible to a
 * given user. Walks the project → controlCategory → control → subControl tree
 * for the Controls progress, and the project → assessment → topic → subTopic
 * → question tree for the Assessments progress.
 */

import {
  getAssessmentsForProject,
  getControlCategoriesForProject,
  getControlForControlCategory,
  getQuestionsForSubTopic,
  getSubControlForControl,
  getSubTopicsForTopic,
  getTopicsForAssessment,
  getUserProjects,
} from "../user.utils";

export interface ControlsProgressEntry {
  projectId: number | undefined;
  totalSubControls: number;
  doneSubControls: number;
}

export interface AssessmentsProgressEntry {
  projectId: number | undefined;
  totalAssessments: number;
  doneAssessments: number;
}

export interface UserProgressResult {
  assessmentsMetadata: AssessmentsProgressEntry[];
  controlsMetadata: ControlsProgressEntry[];
  allTotalAssessments: number;
  allDoneAssessments: number;
  allTotalSubControls: number;
  allDoneSubControls: number;
}

export async function calculateUserProgress(
  userId: number,
  organizationId: number,
): Promise<UserProgressResult> {
  const userProjects = await getUserProjects(userId, organizationId);

  const assessmentsMetadata: AssessmentsProgressEntry[] = [];
  const controlsMetadata: ControlsProgressEntry[] = [];
  let allTotalAssessments = 0;
  let allDoneAssessments = 0;
  let allTotalSubControls = 0;
  let allDoneSubControls = 0;

  for (const userProject of userProjects) {
    let totalSubControls = 0;
    let doneSubControls = 0;
    const controlcategories = await getControlCategoriesForProject(userProject.id!);
    for (const controlcategory of controlcategories) {
      const controls = await getControlForControlCategory(controlcategory.id!);
      for (const control of controls) {
        const subControls = await getSubControlForControl(control.id!);
        for (const subControl of subControls) {
          totalSubControls++;
          if (subControl.status === "Done") doneSubControls++;
        }
      }
    }
    allTotalSubControls += totalSubControls;
    allDoneSubControls += doneSubControls;
    controlsMetadata.push({
      projectId: userProject.id,
      totalSubControls,
      doneSubControls,
    });

    let totalAssessments = 0;
    let doneAssessments = 0;
    const assessments = await getAssessmentsForProject(userProject.id!);
    for (const assessment of assessments) {
      const topics = await getTopicsForAssessment(assessment.id!);
      for (const topic of topics) {
        const subTopics = await getSubTopicsForTopic(topic.id!);
        for (const subTopic of subTopics) {
          const questions = await getQuestionsForSubTopic(subTopic.id!);
          for (const question of questions) {
            totalAssessments++;
            if (question.answer) doneAssessments++;
          }
        }
      }
    }
    allTotalAssessments += totalAssessments;
    allDoneAssessments += doneAssessments;
    assessmentsMetadata.push({
      projectId: userProject.id,
      totalAssessments,
      doneAssessments,
    });
  }

  return {
    assessmentsMetadata,
    controlsMetadata,
    allTotalAssessments,
    allDoneAssessments,
    allTotalSubControls,
    allDoneSubControls,
  };
}
