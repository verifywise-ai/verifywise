import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  AnswerEU,
  AnswerEUModel,
} from "../domain.layer/frameworks/EU-AI-Act/answerEU.model";
import {
  AssessmentEU,
  AssessmentEUModel,
} from "../domain.layer/frameworks/EU-AI-Act/assessmentEU.model";
import { ControlCategoryStructEUModel } from "../domain.layer/frameworks/EU-AI-Act/controlCategoryStructEU.model";
import {
  ControlEU,
  ControlEUModel,
} from "../domain.layer/frameworks/EU-AI-Act/controlEU.model";
import { ControlStructEUModel } from "../domain.layer/frameworks/EU-AI-Act/controlStructEU.model";
import { QuestionStructEUModel } from "../domain.layer/frameworks/EU-AI-Act/questionStructEU.model";
import {
  SubcontrolEU,
  SubcontrolEUModel,
} from "../domain.layer/frameworks/EU-AI-Act/subControlEU.model";
import { SubtopicStructEUModel } from "../domain.layer/frameworks/EU-AI-Act/subTopicStructEU.model";
import { TopicStructEUModel } from "../domain.layer/frameworks/EU-AI-Act/topicStructEU.model";
import { Topics } from "../structures/EU-AI-Act/assessment-tracker/topics.struct";
import { ControlCategories } from "../structures/EU-AI-Act/compliance-tracker/controlCategories.struct";
import { ProjectFrameworksModel } from "../domain.layer/models/projectFrameworks/projectFrameworks.model";
import { STATUSES_ANSWERS, STATUSES_COMPLIANCE } from "../types/status.type";
import { AnswerEURisksModel } from "../domain.layer/frameworks/EU-AI-Act/answerEURisks.model";
import { validateRiskArray } from "./utility.utils";
import { getEvidenceFilesForEntities } from "./files/evidenceFiles.utils";

const getDemoAnswers = (): string[] => {
  const answers = [];
  for (let topic of Topics) {
    for (let subTopic of topic.subtopics) {
      for (let question of subTopic.questions) {
        answers.push(question.answer);
      }
    }
  }
  return answers;
};

const getDemoControls = (): Object[] => {
  let controls: Object[] = [];
  for (let controlCategory of ControlCategories) {
    controls = controls.concat([...controlCategory.controls]);
  }
  return controls;
};

const findIsDemo = async (
  tableName: string,
  id: number,
  organizationId: number,
  transaction: Transaction
) => {
  const result = (await sequelize.query(
    `SELECT is_demo FROM ${tableName} WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: { organizationId, id },
      transaction,
    }
  )) as [{ is_demo: boolean }[], number];
  return result[0][0].is_demo;
};

export const countAnswersEUByProjectId = async (
  projectFrameworkId: number,
  organizationId: number
): Promise<{
  totalAssessments: string;
  answeredAssessments: string;
}> => {
  const result = await sequelize.query(
    `SELECT COUNT(*) AS "totalAssessments", COUNT(CASE WHEN ans.status = 'Done' THEN 1 END) AS "answeredAssessments" FROM
      assessments a JOIN answers_eu ans ON a.organization_id = ans.organization_id AND a.id = ans.assessment_id WHERE a.organization_id = :organizationId AND a.projects_frameworks_id = :projects_frameworks_id;`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
      type: QueryTypes.SELECT,
    }
  );
  return result[0] as {
    totalAssessments: string;
    answeredAssessments: string;
  };
};

export const countSubControlsEUByProjectId = async (
  projectFrameworkId: number,
  organizationId: number
): Promise<{
  totalSubcontrols: string;
  doneSubcontrols: string;
}> => {
  const result = await sequelize.query(
    `SELECT COUNT(*) AS "totalSubcontrols", COUNT(CASE WHEN sc.status = 'Done' THEN 1 END) AS "doneSubcontrols" FROM
      controls_eu c JOIN subcontrols_eu sc ON c.organization_id = sc.organization_id AND c.id = sc.control_id WHERE c.organization_id = :organizationId AND c.projects_frameworks_id = :projects_frameworks_id;`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
      type: QueryTypes.SELECT,
    }
  );
  return result[0] as {
    totalSubcontrols: string;
    doneSubcontrols: string;
  };
};

export const getTopicByIdForProjectQuery = async (
  topicStructId: number,
  projectFrameworkId: number,
  organizationId: number
): Promise<TopicStructEUModel | null> => {
  const assessmentResult = (await sequelize.query(
    `SELECT id FROM assessments WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
    }
  )) as [{ id: number }[], number];

  // Check if assessment exists for this project framework
  if (!assessmentResult[0] || !assessmentResult[0][0]) {
    return null;
  }
  const assessmentId = assessmentResult[0][0].id;

  const topics = await sequelize.query(
    `SELECT * FROM topics_struct_eu WHERE id = :topic_id;`,
    {
      replacements: { topic_id: topicStructId },
      mapToModel: true,
      model: TopicStructEUModel,
    }
  );

  // Check if topic exists
  const topic = topics[0];
  if (!topic) {
    return null;
  }

  const subtopicStruct = await getAllSubTopicsQuery(topic.id!, organizationId);
  (topic.dataValues as any).subTopics = subtopicStruct;
  for (let subtopic of subtopicStruct) {
    const questionAnswers = await getAllQuestionsQuery(
      subtopic.id!,
      assessmentId,
      organizationId
    );
    (subtopic.dataValues as any).questions = [];
    for (let question of questionAnswers) {
      (subtopic.dataValues as any).questions.push({ ...question });
    }
  }
  return topic;
};

const getSubControlsCalculations = async (
  controlId: number,
  organizationId: number,
  owner?: number,
  approver?: number,
  dueDateFilter?: number
) => {
  // Build WHERE conditions dynamically
  const conditions: string[] = ["c.organization_id = :organizationId", "c.id = :control_id"];
  const replacements: any = { organizationId, control_id: controlId };

  // Add owner filter if provided
  if (owner !== undefined) {
    conditions.push("sc.owner = :owner");
    replacements.owner = owner;
  }

  // Add approver filter if provided
  if (approver !== undefined) {
    conditions.push("sc.approver = :approver");
    replacements.approver = approver;
  }

  // Add due date filter if provided (filters for due dates within the specified number of days)
  if (dueDateFilter !== undefined) {
    conditions.push(
      `sc.due_date IS NOT NULL AND sc.due_date >= CURRENT_DATE AND sc.due_date <= CURRENT_DATE + :dueDateFilter * INTERVAL '1 day'`
    );
    replacements.dueDateFilter = dueDateFilter;
  }

  const whereClause = conditions.join(" AND ");

  const query = `SELECT COUNT(*) AS "numberOfSubcontrols", COUNT(CASE WHEN sc.status = 'Done' THEN 1 END) AS "numberOfDoneSubcontrols" FROM
    controls_eu c JOIN subcontrols_eu sc ON c.organization_id = sc.organization_id AND c.id = sc.control_id WHERE ${whereClause};`;

  const result = (await sequelize.query(query, {
    replacements,
  })) as [
    { numberOfSubcontrols: string; numberOfDoneSubcontrols: string }[],
    number,
  ];
  return result[0][0] as {
    numberOfSubcontrols: string;
    numberOfDoneSubcontrols: string;
  };
};

export const getControlByIdForProjectQuery = async (
  controlStructId: number,
  projectFrameworkId: number,
  owner: number | undefined,
  approver: number | undefined,
  dueDateFilter: number | undefined,
  organizationId: number
): Promise<Partial<ControlEU & ControlStructEUModel> | null> => {
  const controlId = (await sequelize.query(
    `SELECT id FROM controls_eu WHERE organization_id = :organizationId AND control_meta_id = :control_meta_id AND projects_frameworks_id = :projects_frameworks_id`,
    {
      replacements: {
        organizationId,
        control_meta_id: controlStructId,
        projects_frameworks_id: projectFrameworkId,
      },
    }
  )) as [{ id: number }[], number];
  const controls = await getControlByIdQuery(controlId[0][0].id, organizationId);
  const control = controls[0];
  const subControls = await getSubControlsByIdQuery(
    control.id!,
    owner,
    approver,
    dueDateFilter,
    organizationId
  );

  (control as any).subControls = [];
  for (let subControl of subControls) {
    (control as any).subControls.push({ ...subControl });
  }
  const subControlsCalculations = await getSubControlsCalculations(
    control.id!,
    organizationId,
    owner,
    approver,
    dueDateFilter
  );
  (control as any).numberOfSubcontrols = parseInt(
    subControlsCalculations.numberOfSubcontrols
  );
  (control as any).numberOfDoneSubcontrols = parseInt(
    subControlsCalculations.numberOfDoneSubcontrols
  );
  return control;
};

export const getAllTopicsQuery = async (
  _organizationId: number,
  transaction: Transaction | null = null
) => {
  const topicStruct = await sequelize.query(
    `SELECT * FROM topics_struct_eu;`,
    {
      mapToModel: true,
      model: TopicStructEUModel,
      ...(transaction && { transaction }),
    }
  );
  return topicStruct;
};

export const getAllSubTopicsQuery = async (
  topicId: number,
  _organizationId: number,
  transaction: Transaction | null = null
) => {
  const subtopicStruct = await sequelize.query(
    `SELECT * FROM subtopics_struct_eu WHERE topic_id = :topic_id;`,
    {
      replacements: { topic_id: topicId },
      mapToModel: true,
      model: SubtopicStructEUModel,
      ...(transaction && { transaction }),
    }
  );
  return subtopicStruct;
};

export const getAllQuestionsQuery = async (
  subtopicId: number,
  assessmentId: number,
  organizationId: number,
  transaction: Transaction | null = null
) => {
  const result = (await sequelize.query(
    `SELECT
      q.id AS question_id,
      q.order_no AS order_no,
      q.question AS question,
      q.hint AS hint,
      q.priority_level AS priority_level,
      q.answer_type AS answer_type,
      q.input_type AS input_type,
      q.evidence_required AS evidence_required,
      q.is_required AS is_required,
      q.subtopic_id AS subtopic_id,
      a.id AS answer_id,
      a.assessment_id AS assessment_id,
      a.answer AS answer,
      a.dropdown_options AS dropdown_options,
      a.status AS status,
      a.created_at AS created_at,
      a.is_demo AS is_demo
    FROM questions_struct_eu q JOIN answers_eu a ON q.id = a.question_id WHERE
      a.organization_id = :organizationId AND q.subtopic_id = :subtopic_id AND a.assessment_id = :assessment_id
      ORDER BY created_at DESC, question_id ASC;`,
    {
      replacements: { organizationId, subtopic_id: subtopicId, assessment_id: assessmentId },
      ...(transaction && { transaction }),
    }
  )) as [
    Partial<QuestionStructEUModel & AnswerEU & { answer_id: number }>[],
    number,
  ];
  const questionAnswers = result[0];

  // Batch fetch evidence files from file_entity_links
  const answerIds = questionAnswers.map((q) => q.answer_id!).filter(Boolean);
  const evidenceFilesMap = await getEvidenceFilesForEntities(
    organizationId,
    "eu_ai_act",
    "assessment",
    answerIds,
    "evidence"
  );

  for (let questionAnswer of questionAnswers) {
    (questionAnswer as any).risks = [];
    // Attach evidence files from file_entity_links
    (questionAnswer as any).evidence_files = evidenceFilesMap.get(questionAnswer.answer_id!) || [];

    const risks = (await sequelize.query(
      `SELECT projects_risks_id FROM answers_eu__risks WHERE organization_id = :organizationId AND answer_id = :id`,
      {
        replacements: { organizationId, id: questionAnswer.answer_id },
        transaction,
      }
    )) as [{ projects_risks_id: number }[], number];
    for (let risk of risks[0]) {
      (questionAnswer as any).risks.push(risk.projects_risks_id);
    }
  }
  return questionAnswers;
};

export const getAssessmentsEUByIdQuery = async (
  assessmentId: number,
  organizationId: number,
  transaction: Transaction | null = null
) => {
  const topicStruct = await getAllTopicsQuery(organizationId, transaction);
  for (let topic of topicStruct) {
    const subtopicStruct = await getAllSubTopicsQuery(
      topic.id!,
      organizationId,
      transaction
    );
    (topic.dataValues as any).subTopics = subtopicStruct;
    for (let subtopic of subtopicStruct) {
      const questionAnswers = await getAllQuestionsQuery(
        subtopic.id!,
        assessmentId,
        organizationId,
        transaction
      );
      (subtopic.dataValues as any).questions = [];
      for (let question of questionAnswers) {
        (subtopic.dataValues as any).questions.push({ ...question });
      }
    }
  }
  return topicStruct;
};

export const getAllControlCategoriesQuery = async (
  _organizationId: number,
  transaction: Transaction | null = null
) => {
  const controlCategoriesStruct = await sequelize.query(
    `SELECT * FROM controlcategories_struct_eu;`,
    {
      mapToModel: true,
      model: ControlCategoryStructEUModel,
      ...(transaction && { transaction }),
    }
  );
  return controlCategoriesStruct;
};

export const getControlStructByControlCategoryIdQuery = async (
  controlCategoryId: number
) => {
  const controlsStruct = await sequelize.query(
    `SELECT * FROM controls_struct_eu WHERE control_category_id = :control_category_id;`,
    {
      replacements: { control_category_id: controlCategoryId },
      mapToModel: true,
      model: ControlStructEUModel,
    }
  );
  return controlsStruct;
};

export const getControlStructByControlCategoryIdForAProjectQuery = async (
  controlCategoryId: number,
  projectFrameworkId: number,
  owner: number | undefined,
  approver: number | undefined,
  dueDateFilter: number | undefined,
  organizationId: number
) => {
  const controlsStruct = (await sequelize.query(
    `SELECT cs.*, c.id AS control_id, c.owner, c.status FROM controls_struct_eu cs JOIN controls_eu c ON cs.id = c.control_meta_id
      WHERE c.organization_id = :organizationId AND cs.control_category_id = :control_category_id AND c.projects_frameworks_id = :projects_frameworks_id;`,
    {
      replacements: {
        organizationId,
        control_category_id: controlCategoryId,
        projects_frameworks_id: projectFrameworkId,
      },
    }
  )) as [
    Partial<ControlStructEUModel & ControlEUModel & { control_id: number }>[],
    number,
  ];
  for (let control of controlsStruct[0]) {
    const subControlsCalculations = await getSubControlsCalculations(
      control.control_id!,
      organizationId,
      owner,
      approver,
      dueDateFilter
    );
    (control as any).numberOfSubcontrols = parseInt(
      subControlsCalculations.numberOfSubcontrols
    );
    (control as any).numberOfDoneSubcontrols = parseInt(
      subControlsCalculations.numberOfDoneSubcontrols
    );
  }
  return controlsStruct[0].filter(
    (control) => (control as any).numberOfSubcontrols > 0
  );
};

export const getControlByIdQuery = async (
  controlId: number,
  organizationId: number,
  transaction: Transaction | null = null
) => {
  const result = (await sequelize.query(
    `SELECT
      cs.title AS title,
      cs.description AS description,
      cs.order_no AS order_no,
      cs.control_category_id AS control_category_id,
      c.id AS id,
      c.status AS status,
      c.approver AS approver,
      c.risk_review AS risk_review,
      c.owner AS owner,
      c.reviewer AS reviewer,
      c.due_date AS due_date,
      c.implementation_details AS implementation_details,
      c.created_at AS created_at
    FROM controls_eu c JOIN controls_struct_eu cs ON c.control_meta_id = cs.id WHERE c.organization_id = :organizationId AND c.id = :control_id
    ORDER BY created_at DESC, id ASC;`,
    {
      replacements: { organizationId, control_id: controlId },
      ...(transaction && { transaction }),
    }
  )) as [Partial<ControlEUModel & ControlStructEUModel>[], number];
  const control = result[0];
  return control;
};

export const getSubControlsByIdQuery = async (
  subControlId: number,
  owner: number | undefined,
  approver: number | undefined,
  dueDateFilter: number | undefined,
  organizationId: number,
  transaction: Transaction | null = null
) => {
  // Build WHERE conditions dynamically
  const conditions: string[] = ["sc.organization_id = :organizationId", "sc.control_id = :control_id"];
  const replacements: any = { organizationId, control_id: subControlId };

  // Add owner filter if provided
  if (owner !== undefined) {
    conditions.push("sc.owner = :owner");
    replacements.owner = owner;
  }

  // Add approver filter if provided
  if (approver !== undefined) {
    conditions.push("sc.approver = :approver");
    replacements.approver = approver;
  }

  // Add due date filter if provided (filters for due dates within the specified number of days)
  if (dueDateFilter !== undefined) {
    conditions.push(
      `sc.due_date IS NOT NULL AND sc.due_date >= CURRENT_DATE AND sc.due_date <= CURRENT_DATE + :dueDateFilter * INTERVAL '1 day'`
    );
    replacements.dueDateFilter = dueDateFilter;
  }

  const whereClause = conditions.join(" AND ");

  const subControls = (await sequelize.query(
    `SELECT
      scs.title AS title,
      scs.description AS description,
      scs.order_no AS order_no,
      sc.id AS id,
      sc.status AS status,
      sc.approver AS approver,
      sc.risk_review AS risk_review,
      sc.owner AS owner,
      sc.reviewer AS reviewer,
      sc.due_date AS due_date,
      sc.implementation_details AS implementation_details,
      sc.control_id AS control_id,
      sc.is_demo AS is_demo,
      sc.evidence_description AS evidence_description,
      sc.feedback_description AS feedback_description,
      sc.created_at AS created_at
    FROM subcontrols_eu sc JOIN subcontrols_struct_eu scs ON sc.subcontrol_meta_id = scs.id WHERE ${whereClause}
    ORDER BY created_at DESC, id ASC;`,
    {
      replacements,
      ...(transaction && { transaction }),
    }
  )) as [Partial<SubcontrolEUModel | ControlStructEUModel>[], number];

  // Batch fetch evidence and feedback files from file_entity_links
  const subcontrolIds = subControls[0].map((sc) => sc.id!).filter(Boolean);
  const evidenceFilesMap = await getEvidenceFilesForEntities(
    organizationId,
    "eu_ai_act",
    "subcontrol",
    subcontrolIds,
    "evidence"
  );
  const feedbackFilesMap = await getEvidenceFilesForEntities(
    organizationId,
    "eu_ai_act",
    "subcontrol",
    subcontrolIds,
    "feedback"
  );

  // Load risks for each subcontrol
  for (let subControl of subControls[0]) {
    (subControl as any).risks = [];
    // Attach evidence and feedback files from file_entity_links
    (subControl as any).evidence_files = evidenceFilesMap.get(subControl.id!) || [];
    (subControl as any).feedback_files = feedbackFilesMap.get(subControl.id!) || [];

    const risks = (await sequelize.query(
      `SELECT projects_risks_id FROM subcontrols_eu__risks WHERE organization_id = :organizationId AND subcontrol_id = :id`,
      {
        replacements: { organizationId, id: subControl.id },
        ...(transaction && { transaction }),
      }
    )) as [{ projects_risks_id: number }[], number];
    for (let risk of risks[0]) {
      (subControl as any).risks.push(risk.projects_risks_id);
    }
  }

  return subControls[0];
};

export const getCompliancesEUByIdQuery = async (
  controlIds: number[],
  organizationId: number,
  transaction: Transaction | null = null
) => {
  const controlCategoriesStruct = await getAllControlCategoriesQuery(
    organizationId,
    transaction
  );
  let controlCategoryIdIndexMap = new Map();
  for (let [i, controlCategory] of controlCategoriesStruct.entries()) {
    (controlCategory.dataValues as any).controls = [];
    controlCategoryIdIndexMap.set(controlCategory.id, i);
  }

  for (let controlId of controlIds) {
    const controls = await getControlByIdQuery(controlId, organizationId, transaction);

    for (let control of controls) {
      (controlCategoriesStruct as any)[
        controlCategoryIdIndexMap.get(control.control_category_id)
      ].dataValues.controls.push(control);
      const subControls = await getSubControlsByIdQuery(
        control.id!,
        undefined,
        undefined,
        undefined,
        organizationId,
        transaction
      );
      (control as any).subControls = [];
      for (let subControl of subControls) {
        (control as any).subControls.push({ ...subControl });
      }
    }
  }
  return controlCategoriesStruct;
};

export const getAssessmentsEUByProjectIdQuery = async (
  projectFrameworkId: number,
  organizationId: number
) => {
  const assessmentId = (await sequelize.query(
    `SELECT id FROM assessments WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
    }
  )) as [{ id: number }[], number];
  const assessments = await getAssessmentsEUByIdQuery(
    assessmentId[0][0].id,
    organizationId
  );
  return assessments;
};

export const getComplianceEUByProjectIdQuery = async (
  projectFrameworkId: number,
  organizationId: number
) => {
  const controlIds = (await sequelize.query(
    `SELECT id FROM controls_eu WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
    }
  )) as [{ id: number }[], number];

  const compliances = await getCompliancesEUByIdQuery(
    controlIds[0].map((c) => c.id),
    organizationId
  );
  return compliances;
};

export const createNewAssessmentEUQuery = async (
  assessment: AssessmentEU,
  enable_ai_data_insertion: boolean,
  organizationId: number,
  transaction: Transaction,
  is_mock_data: boolean
): Promise<Object> => {
  const projectFrameworkId = (await sequelize.query(
    `SELECT id FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = 1`,
    {
      replacements: { organizationId, project_id: assessment.project_id },
      transaction,
    }
  )) as [{ id: number }[], number];
  const result = await sequelize.query(
    `INSERT INTO assessments (organization_id, projects_frameworks_id, is_demo) VALUES (:organizationId, :projects_frameworks_id, :is_demo) RETURNING *`,
    {
      replacements: {
        organizationId,
        projects_frameworks_id: projectFrameworkId[0][0].id,
        is_demo: await findIsDemo(
          "projects",
          assessment.project_id,
          organizationId,
          transaction
        ),
      },
      mapToModel: true,
      model: AssessmentEUModel,
      transaction,
    }
  );
  await createNewAnswersEUQuery(
    result[0].id!,
    enable_ai_data_insertion,
    organizationId,
    transaction,
    is_mock_data
  );
  const assessments = await getAssessmentsEUByIdQuery(
    result[0].id!,
    organizationId,
    transaction
  );
  return { ...result[0].dataValues, topics: assessments };
};

export const createNewAnswersEUQuery = async (
  assessmentId: number,
  enable_ai_data_insertion: boolean,
  organizationId: number,
  transaction: Transaction,
  is_mock_data: boolean
) => {
  let demoAnswers: string[] = [];
  if (enable_ai_data_insertion) demoAnswers = getDemoAnswers();
  const questions = await sequelize.query(
    `SELECT * FROM questions_struct_eu ORDER BY id;`,
    {
      mapToModel: true,
      model: QuestionStructEUModel,
      transaction,
    }
  );
  let createdAnswers: (AnswerEUModel | QuestionStructEUModel)[] = [];
  let ansCtr = 0;
  for (let question of questions) {
    const result = await sequelize.query(
      `INSERT INTO answers_eu(organization_id, assessment_id, question_id, answer, status, is_demo) VALUES (
        :organizationId, :assessment_id, :question_id, :answer, :status, :is_demo
      ) RETURNING *;`,
      {
        replacements: {
          organizationId,
          assessment_id: assessmentId,
          question_id: question.id!,
          answer: enable_ai_data_insertion ? demoAnswers[ansCtr++] : null,
          status: is_mock_data
            ? STATUSES_ANSWERS[
                Math.floor(Math.random() * STATUSES_ANSWERS.length)
              ]
            : "Not started",
          is_demo: await findIsDemo(
            "assessments",
            assessmentId,
            organizationId,
            transaction
          ),
        },
        mapToModel: true,
        model: AnswerEUModel,
        transaction,
      }
    );
    createdAnswers = createdAnswers.concat(
      Object.assign({}, result[0], question)
    );
  }
  return createdAnswers;
};

export const createNewControlsQuery = async (
  projectId: number,
  enable_ai_data_insertion: boolean,
  organizationId: number,
  transaction: Transaction,
  is_mock_data: boolean
) => {
  let demoControls: any[] = [];
  if (enable_ai_data_insertion) demoControls = getDemoControls();

  const controlsStruct = await sequelize.query(
    `SELECT * FROM controls_struct_eu;`,
    {
      mapToModel: true,
      model: ControlStructEUModel,
      transaction,
    }
  );
  let controlCtr = 0;
  let controlIds: number[] = [];
  for (let controlStruct of controlsStruct) {
    const projectFrameworkId = (await sequelize.query(
      `SELECT id FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = 1`,
      {
        replacements: { organizationId, project_id: projectId },
        transaction,
      }
    )) as [{ id: number }[], number];
    const result = await sequelize.query(
      `INSERT INTO controls_eu(organization_id, control_meta_id, implementation_details, status, projects_frameworks_id, is_demo) VALUES (
        :organizationId, :control_meta_id, :implementation_details, :status, :projects_frameworks_id, :is_demo
      ) RETURNING id;`,
      {
        replacements: {
          organizationId,
          control_meta_id: controlStruct.id!,
          implementation_details: enable_ai_data_insertion
            ? demoControls[controlCtr].implementation_details
            : null,
          status: enable_ai_data_insertion ? "Waiting" : null,
          projects_frameworks_id: projectFrameworkId[0][0].id,
          is_demo: await findIsDemo("projects", projectId, organizationId, transaction),
        },
        mapToModel: true,
        model: ControlEUModel,
        transaction,
      }
    );
    controlIds.push(result[0].id!);
    await createNewSubControlsQuery(
      controlStruct.id!,
      demoControls[controlCtr++]?.subControls || [],
      result[0].id!,
      enable_ai_data_insertion,
      organizationId,
      transaction,
      is_mock_data
    );
  }
  const compliances = await getCompliancesEUByIdQuery(
    controlIds,
    organizationId,
    transaction
  );
  return compliances;
};

export const createNewSubControlsQuery = async (
  controlStructId: number,
  demoSubControls: any[],
  controlId: number,
  enable_ai_data_insertion: boolean,
  organizationId: number,
  transaction: Transaction,
  is_mock_data: boolean
) => {
  const subControlMetaIds = await sequelize.query(
    `SELECT id FROM subcontrols_struct_eu WHERE control_id = :control_id`,
    {
      replacements: { control_id: controlStructId },
      transaction,
    }
  );
  let ctr = 0;
  let createdSubControls: SubcontrolEUModel[] = [];
  for (let subControl of subControlMetaIds[0] as { id: number }[]) {
    const result = await sequelize.query(
      `INSERT INTO subcontrols_eu(organization_id, control_id, subcontrol_meta_id, implementation_details, evidence_description, feedback_description, status, is_demo) VALUES (
        :organizationId, :control_id, :subcontrol_meta_id, :implementation_details, :evidence_description, :feedback_description, :status, :is_demo
      ) RETURNING *`,
      {
        replacements: {
          organizationId,
          control_id: controlId,
          subcontrol_meta_id: subControl.id,
          implementation_details: enable_ai_data_insertion
            ? demoSubControls[ctr].implementation_details
            : null,
          evidence_description:
            enable_ai_data_insertion &&
            demoSubControls[ctr].evidence_description
              ? demoSubControls[ctr].evidence_description
              : null,
          feedback_description:
            enable_ai_data_insertion &&
            demoSubControls[ctr].feedback_description
              ? demoSubControls[ctr].feedback_description
              : null,
          status: is_mock_data
            ? STATUSES_COMPLIANCE[
                Math.floor(Math.random() * STATUSES_COMPLIANCE.length)
              ]
            : "Waiting",
          is_demo: await findIsDemo(
            "controls_eu",
            controlId,
            organizationId,
            transaction
          ),
        },
        mapToModel: true,
        model: SubcontrolEUModel,
        transaction,
      }
    );
    createdSubControls = createdSubControls.concat(result);
    ctr++;
  }
  return createdSubControls;
};

export const createEUFrameworkQuery = async (
  projectId: number,
  enable_ai_data_insertion: boolean,
  organizationId: number,
  transaction: Transaction,
  is_mock_data: boolean = false
) => {
  const assessments: Object = await createNewAssessmentEUQuery(
    { project_id: projectId },
    enable_ai_data_insertion,
    organizationId,
    transaction,
    is_mock_data
  );
  const controls = await createNewControlsQuery(
    projectId,
    enable_ai_data_insertion,
    organizationId,
    transaction,
    is_mock_data
  );
  return {
    assessment_tracker: assessments,
    compliance_tracker: controls,
  };
};

export const updateControlEUByIdQuery = async (
  id: number,
  control: Partial<ControlEU>,
  organizationId: number,
  transaction: Transaction
): Promise<ControlEU> => {
  const updateControl: Partial<Record<keyof ControlEU, any>> & { organizationId?: number } = {};
  const setClause = [
    "status",
    "approver",
    "risk_review",
    "owner",
    "reviewer",
    "due_date",
    "implementation_details",
  ]
    .filter((f) => {
      if (
        control[f as keyof ControlEU] !== undefined &&
        control[f as keyof ControlEU]
      ) {
        updateControl[f as keyof ControlEU] = control[f as keyof ControlEU];
        return true;
      }
      return false;
    })
    .map((f) => `${f} = :${f}`)
    .join(", ");
  if (!setClause) {
    return control as ControlEU;
  }

  const query = `UPDATE controls_eu SET ${setClause} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;

  updateControl.organizationId = organizationId;
  updateControl.id = id;

  const result = await sequelize.query(query, {
    replacements: updateControl,
    mapToModel: true,
    model: ControlEUModel,
    // type: QueryTypes.UPDATE,
    transaction,
  });
  const controlResult = result[0];

  return controlResult;
};

export const updateSubcontrolEUByIdQuery = async (
  id: number,
  subcontrol: Partial<
    SubcontrolEU & { risksDelete?: string; risksMitigated?: string }
  >,
  evidenceUploadedFiles: {
    id: string;
    fileName: string;
    project_id?: number;
    uploaded_by: number;
    uploaded_time: Date;
  }[] = [],
  feedbackUploadedFiles: {
    id: string;
    fileName: string;
    project_id?: number;
    uploaded_by: number;
    uploaded_time: Date;
  }[] = [],
  deletedFiles: number[] = [],
  organizationId: number,
  transaction: Transaction
): Promise<SubcontrolEU> => {
  // Build update for non-file fields only (files are managed via file_entity_links)
  const updateSubControl: Partial<Record<keyof SubcontrolEU, any>> & { organizationId?: number } = {};
  const setClause = [
    "status",
    "approver",
    "risk_review",
    "owner",
    "reviewer",
    "due_date",
    "implementation_details",
    "evidence_description",
    "feedback_description",
  ]
    .filter((f) => {
      if (
        subcontrol[f as keyof SubcontrolEU] !== undefined &&
        subcontrol[f as keyof SubcontrolEU]
      ) {
        updateSubControl[f as keyof SubcontrolEU] =
          subcontrol[f as keyof SubcontrolEU];
        return true;
      }
      return false;
    })
    .map((f) => {
      return `${f} = :${f}`;
    })
    .join(", ");

  let subcontrolResult: any;

  if (setClause.length === 0) {
    // No fields to update, but we still need to handle file operations
    // Fetch the current subcontrol
    const existing = await sequelize.query(
      `SELECT * FROM subcontrols_eu WHERE organization_id = :organizationId AND id = :id`,
      {
        replacements: { organizationId, id },
        mapToModel: true,
        model: SubcontrolEUModel,
        transaction,
      }
    );
    subcontrolResult = existing[0];
  } else {
    const query = `UPDATE subcontrols_eu SET ${setClause} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;

    updateSubControl.organizationId = organizationId;
    updateSubControl.id = id;

    const result = await sequelize.query(query, {
      replacements: updateSubControl,
      mapToModel: true,
      model: SubcontrolEUModel,
      transaction,
    });

    subcontrolResult = result[0] as any;
  }

  (subcontrolResult as any).risks = [];

  // Create file entity links for new evidence files
  for (const file of evidenceUploadedFiles) {
    await sequelize.query(
      `INSERT INTO file_entity_links
        (organization_id, file_id, framework_type, entity_type, entity_id, link_type, created_at)
       VALUES (:organizationId, :fileId, 'eu_ai_act', 'subcontrol', :entityId, 'evidence', NOW())
       ON CONFLICT (file_id, framework_type, entity_type, entity_id) DO NOTHING`,
      {
        replacements: { organizationId, fileId: parseInt(file.id), entityId: id },
        transaction,
      }
    );
  }

  // Create file entity links for new feedback files
  for (const file of feedbackUploadedFiles) {
    await sequelize.query(
      `INSERT INTO file_entity_links
        (organization_id, file_id, framework_type, entity_type, entity_id, link_type, created_at)
       VALUES (:organizationId, :fileId, 'eu_ai_act', 'subcontrol', :entityId, 'feedback', NOW())
       ON CONFLICT (file_id, framework_type, entity_type, entity_id) DO NOTHING`,
      {
        replacements: { organizationId, fileId: parseInt(file.id), entityId: id },
        transaction,
      }
    );
  }

  // Remove file entity links for deleted files
  for (const fileId of deletedFiles) {
    await sequelize.query(
      `DELETE FROM file_entity_links
       WHERE organization_id = :organizationId
         AND file_id = :fileId
         AND framework_type = 'eu_ai_act'
         AND entity_type = 'subcontrol'
         AND entity_id = :entityId`,
      {
        replacements: { organizationId, fileId, entityId: id },
        transaction,
      }
    );
  }

  // Handle risks if provided
  if (
    subcontrol.risksDelete !== undefined ||
    subcontrol.risksMitigated !== undefined
  ) {
    const risksDeletedRaw = JSON.parse(subcontrol.risksDelete || "[]");
    const risksMitigatedRaw = JSON.parse(subcontrol.risksMitigated || "[]");

    // Validate that both arrays contain only valid integers
    const risksDeleted = validateRiskArray(risksDeletedRaw, "risksDelete");
    const risksMitigated = validateRiskArray(
      risksMitigatedRaw,
      "risksMitigated"
    );

    const risks = (await sequelize.query(
      `SELECT projects_risks_id FROM subcontrols_eu__risks WHERE organization_id = :organizationId AND subcontrol_id = :id`,
      {
        replacements: { organizationId, id },
        transaction,
      }
    )) as [{ projects_risks_id: number }[], number];

    let currentRisks = risks[0].map((r) => r.projects_risks_id!);
    currentRisks = currentRisks.filter((r) => !risksDeleted.includes(r));
    currentRisks = currentRisks.concat(risksMitigated);

    await sequelize.query(
      `DELETE FROM subcontrols_eu__risks WHERE organization_id = :organizationId AND subcontrol_id = :id;`,
      {
        replacements: { organizationId, id },
        transaction,
      }
    );

    if (currentRisks.length > 0) {
      // Create parameterized placeholders for safe insertion
      const placeholders = currentRisks
        .map((_, i) => `(:organizationId, :subcontrol_id${i}, :projects_risks_id${i})`)
        .join(", ");
      const replacements: { [key: string]: any } = { organizationId };

      // Build replacement parameters safely
      currentRisks.forEach((risk, i) => {
        replacements[`subcontrol_id${i}`] = id;
        replacements[`projects_risks_id${i}`] = risk;
      });

      const subcontrolRisksInsertResult = (await sequelize.query(
        `INSERT INTO subcontrols_eu__risks (organization_id, subcontrol_id, projects_risks_id) VALUES ${placeholders} RETURNING projects_risks_id;`,
        {
          replacements,
          transaction,
        }
      )) as [{ projects_risks_id: number }[], number];

      for (let risk of subcontrolRisksInsertResult[0]) {
        (subcontrolResult as any).risks.push(risk.projects_risks_id);
      }
    }
  } else {
    // If no risk updates provided, load existing risks
    const risks = (await sequelize.query(
      `SELECT projects_risks_id FROM subcontrols_eu__risks WHERE organization_id = :organizationId AND subcontrol_id = :id`,
      {
        replacements: { organizationId, id },
        transaction,
      }
    )) as [{ projects_risks_id: number }[], number];
    for (let risk of risks[0]) {
      (subcontrolResult as any).risks.push(risk.projects_risks_id);
    }
  }

  return subcontrolResult;
};

export const addFileToAnswerEU = async (
  questionId: number,
  projectId: number,
  uploadedFiles: {
    id: string;
    fileName: string;
    project_id?: number;
    uploaded_by: number;
    uploaded_time: Date;
  }[],
  deletedFiles: number[],
  organizationId: number,
  transaction: Transaction
): Promise<QuestionStructEUModel & AnswerEUModel & { evidence_files: any[] }> => {
  const projectFrameworkId = (await sequelize.query(
    `SELECT id FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = 1`,
    {
      replacements: { organizationId, project_id: projectId },
      transaction,
    }
  )) as [{ id: number }[], number];
  const assessmentId = (await sequelize.query(
    `SELECT id FROM assessments WHERE organization_id = :organizationId AND projects_frameworks_id = :project_framework_id;`,
    {
      replacements: { organizationId, project_framework_id: projectFrameworkId[0][0].id },
      transaction,
    }
  )) as [{ id: number }[], number];

  // Get the answer record
  const answer = (await sequelize.query(
    `SELECT * FROM answers_eu WHERE organization_id = :organizationId AND question_id = :id AND assessment_id = :assessment_id`,
    {
      replacements: { organizationId, id: questionId, assessment_id: assessmentId[0][0].id },
      transaction,
    }
  )) as [AnswerEUModel[], number];

  const answerId = answer[0][0].id;

  // Create file entity links for new evidence files
  for (const file of uploadedFiles) {
    await sequelize.query(
      `INSERT INTO file_entity_links
        (organization_id, file_id, framework_type, entity_type, entity_id, link_type, created_at)
       VALUES (:organizationId, :fileId, 'eu_ai_act', 'assessment', :entityId, 'evidence', NOW())
       ON CONFLICT (file_id, framework_type, entity_type, entity_id) DO NOTHING`,
      {
        replacements: { organizationId, fileId: parseInt(file.id), entityId: answerId },
        transaction,
      }
    );
  }

  // Remove file entity links for deleted files
  for (const fileId of deletedFiles) {
    await sequelize.query(
      `DELETE FROM file_entity_links
       WHERE organization_id = :organizationId
         AND file_id = :fileId
         AND framework_type = 'eu_ai_act'
         AND entity_type = 'assessment'
         AND entity_id = :entityId`,
      {
        replacements: { organizationId, fileId, entityId: answerId },
        transaction,
      }
    );
  }

  const question = (await sequelize.query(
    `SELECT * FROM questions_struct_eu WHERE id = :id`,
    { replacements: { id: answer[0][0].question_id }, transaction }
  )) as [QuestionStructEUModel[], number];

  // Fetch evidence files from file_entity_links
  const evidenceFilesMap = await getEvidenceFilesForEntities(
    organizationId,
    "eu_ai_act",
    "assessment",
    [answerId!],
    "evidence"
  );

  const result = {
    ...answer[0][0],
    evidence_files: evidenceFilesMap.get(answerId!) || [],
    question: question[0][0].question,
    order_no: question[0][0].order_no,
    hint: question[0][0].hint,
    priority_level: question[0][0].priority_level,
    answer_type: question[0][0].answer_type,
    input_type: question[0][0].input_type,
    evidence_required: question[0][0].evidence_required,
    is_required: question[0][0].is_required,
    subtopic_id: question[0][0].subtopic_id,
  };

  return result as unknown as QuestionStructEUModel & AnswerEUModel & { evidence_files: any[] };
};

export const updateQuestionEUByIdQuery = async (
  id: number,
  question: Partial<
    AnswerEU & {
      risksDelete: number[];
      risksMitigated: number[];
      delete?: number[];
      evidence_files?: { id: string | number }[];
    }
  >,
  organizationId: number,
  transaction: Transaction
): Promise<AnswerEU | null> => {
  const updateQuestion: Partial<Record<keyof AnswerEU, any>> & { organizationId?: number } = {};
  const setClause: string[] = [];

  // Handle answer and status (no longer handling evidence_files JSONB)
  ["answer", "status"].forEach((f) => {
    if (question[f as keyof AnswerEU] !== undefined) {
      updateQuestion[f as keyof AnswerEU] = question[f as keyof AnswerEU];
      if (f === "answer" && !question[f]) {
        updateQuestion[f as keyof AnswerEU] = "";
      }
      setClause.push(`${f} = :${f}`);
    }
  });

  let answer: any;

  if (setClause.length === 0) {
    // No fields to update, just fetch the existing answer
    const result = await sequelize.query(
      `SELECT * FROM answers_eu WHERE organization_id = :organizationId AND id = :id`,
      {
        replacements: { organizationId, id },
        mapToModel: true,
        model: AnswerEUModel,
        transaction,
      }
    );
    answer =
      Array.isArray(result[0]) && result[0].length > 0
        ? result[0][0]
        : (result[0] as any);
    if (!answer) return null;
  } else {
    const query = `UPDATE answers_eu SET ${setClause.join(", ")} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;

    updateQuestion.organizationId = organizationId;
    updateQuestion.id = id;

    const result = await sequelize.query(query, {
      replacements: updateQuestion,
      mapToModel: true,
      model: AnswerEUModel,
      transaction,
    });
    answer =
      Array.isArray(result[0]) && result[0].length > 0
        ? result[0][0]
        : (result[0] as any);
  }

  (answer as any).dataValues.risks = [];

  // Handle file operations via file_entity_links only
  // Create file entity links for new evidence files
  if (question.evidence_files && Array.isArray(question.evidence_files)) {
    for (const file of question.evidence_files) {
      const fileData = file as { id: string };
      await sequelize.query(
        `INSERT INTO file_entity_links
          (organization_id, file_id, framework_type, entity_type, entity_id, link_type, created_at)
         VALUES (:organizationId, :fileId, 'eu_ai_act', 'assessment', :entityId, 'evidence', NOW())
         ON CONFLICT (file_id, framework_type, entity_type, entity_id) DO NOTHING`,
        {
          replacements: { organizationId, fileId: parseInt(fileData.id), entityId: id },
          transaction,
        }
      );
    }
  }

  // Remove file entity links for deleted files
  if (question.delete && Array.isArray(question.delete)) {
    for (const fileId of question.delete) {
      await sequelize.query(
        `DELETE FROM file_entity_links
         WHERE organization_id = :organizationId
           AND file_id = :fileId
           AND framework_type = 'eu_ai_act'
           AND entity_type = 'assessment'
           AND entity_id = :entityId`,
        {
          replacements: { organizationId, fileId, entityId: id },
          transaction,
        }
      );
    }
  }

  // Fetch current evidence files from file_entity_links
  const evidenceFilesMap = await getEvidenceFilesForEntities(
    organizationId,
    "eu_ai_act",
    "assessment",
    [id],
    "evidence"
  );
  (answer as any).dataValues.evidence_files = evidenceFilesMap.get(id) || [];

  const risks = (await sequelize.query(
    `SELECT projects_risks_id FROM answers_eu__risks WHERE organization_id = :organizationId AND answer_id = :id`,
    {
      replacements: { organizationId, id },
      transaction,
    }
  )) as [AnswerEURisksModel[], number];
  let currentRisks = risks[0].map((r) => r.projects_risks_id!);
  currentRisks = currentRisks.filter(
    (r) =>
      !validateRiskArray(question.risksDelete || [], "risksDelete").includes(r)
  );
  currentRisks = currentRisks.concat(
    validateRiskArray(question.risksMitigated || [], "risksMitigated")
  );

  await sequelize.query(
    `DELETE FROM answers_eu__risks WHERE organization_id = :organizationId AND answer_id = :id;`,
    {
      replacements: { organizationId, id },
      transaction,
    }
  );
  if (currentRisks.length > 0) {
    // Create parameterized placeholders for safe insertion
    const placeholders = currentRisks
      .map((_, i) => `(:organizationId, :answer_id${i}, :projects_risks_id${i})`)
      .join(", ");
    const replacements: { [key: string]: any } = { organizationId };

    // Build replacement parameters safely
    currentRisks.forEach((risk, i) => {
      replacements[`answer_id${i}`] = id;
      replacements[`projects_risks_id${i}`] = risk;
    });

    const subClauseRisksInsertResult = (await sequelize.query(
      `INSERT INTO answers_eu__risks (organization_id, answer_id, projects_risks_id) VALUES ${placeholders} RETURNING projects_risks_id;`,
      {
        replacements,
        transaction,
      }
    )) as [{ projects_risks_id: number }[], number];
    for (let risk of subClauseRisksInsertResult[0]) {
      (answer as any).dataValues.risks.push(risk.projects_risks_id);
    }
  }

  return answer;
};

export const deleteAssessmentEUByProjectIdQuery = async (
  projectFrameworkId: number,
  organizationId: number,
  transaction: Transaction
) => {
  const assessmentId = (await sequelize.query(
    `SELECT id FROM assessments WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
      transaction,
    }
  )) as [{ id: number }[], number];
  if (assessmentId[0].length === 0) {
    return false;
  }

  // Get all answer IDs to clean up file_entity_links
  const answerIds = (await sequelize.query(
    `SELECT id FROM answers_eu WHERE organization_id = :organizationId AND assessment_id = :assessment_id`,
    {
      replacements: { organizationId, assessment_id: assessmentId[0][0].id },
      transaction,
    }
  )) as [{ id: number }[], number];

  // Clean up file_entity_links for answers (evidence files)
  if (answerIds[0].length > 0) {
    await sequelize.query(
      `DELETE FROM file_entity_links
       WHERE organization_id = :organizationId
         AND framework_type = 'eu_ai_act'
         AND entity_type = 'assessment'
         AND entity_id IN (:entityIds)`,
      {
        replacements: { organizationId, entityIds: answerIds[0].map(a => a.id) },
        transaction,
      }
    );
  }

  // Delete answers_eu__risks first (FK: answer_id -> answers_eu.id)
  await sequelize.query(
    `DELETE FROM answers_eu__risks WHERE organization_id = :organizationId AND answer_id IN (SELECT id FROM answers_eu WHERE organization_id = :organizationId AND assessment_id = :assessment_id)`,
    {
      replacements: { organizationId, assessment_id: assessmentId[0][0].id },
      transaction,
    }
  );
  await sequelize.query(
    `DELETE FROM answers_eu WHERE organization_id = :organizationId AND assessment_id = :assessment_id`,
    {
      replacements: { organizationId, assessment_id: assessmentId[0][0].id },
      transaction,
    }
  );
  const result = await sequelize.query(
    `DELETE FROM assessments WHERE organization_id = :organizationId AND id = :assessment_id RETURNING *`,
    {
      replacements: { organizationId, assessment_id: assessmentId[0][0].id },
      mapToModel: true,
      model: AssessmentEUModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  return result.length > 0;
};

export const deleteComplianeEUByProjectIdQuery = async (
  projectFrameworkId: number,
  organizationId: number,
  transaction: Transaction
) => {
  const controlIds = (await sequelize.query(
    `SELECT id FROM controls_eu WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
      transaction,
    }
  )) as [{ id: number }[], number];
  if (controlIds[0].length === 0) {
    return false;
  }

  // Get all subcontrol IDs to clean up file_entity_links
  const subcontrolIds = (await sequelize.query(
    `SELECT id FROM subcontrols_eu WHERE organization_id = :organizationId AND control_id IN (:controlIds)`,
    {
      replacements: { organizationId, controlIds: controlIds[0].map(c => c.id) },
      transaction,
    }
  )) as [{ id: number }[], number];

  // Clean up file_entity_links for subcontrols (evidence and feedback files)
  if (subcontrolIds[0].length > 0) {
    await sequelize.query(
      `DELETE FROM file_entity_links
       WHERE organization_id = :organizationId
         AND framework_type = 'eu_ai_act'
         AND entity_type = 'subcontrol'
         AND entity_id IN (:entityIds)`,
      {
        replacements: { organizationId, entityIds: subcontrolIds[0].map(s => s.id) },
        transaction,
      }
    );
  }

  for (let control of controlIds[0]) {
    // Delete controls_eu__risks first (FK: control_id -> controls_eu.id)
    await sequelize.query(
      `DELETE FROM controls_eu__risks WHERE organization_id = :organizationId AND control_id = :control_id`,
      { replacements: { organizationId, control_id: control.id }, transaction }
    );
    await sequelize.query(
      `DELETE FROM subcontrols_eu WHERE organization_id = :organizationId AND control_id = :control_id`,
      { replacements: { organizationId, control_id: control.id }, transaction }
    );
  }
  const result = await sequelize.query(
    `DELETE FROM controls_eu WHERE organization_id = :organizationId AND projects_frameworks_id = :projects_frameworks_id RETURNING *`,
    {
      replacements: { organizationId, projects_frameworks_id: projectFrameworkId },
      mapToModel: true,
      model: ControlEUModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  return result.length > 0;
};

export const deleteProjectFrameworkEUQuery = async (
  projectId: number,
  organizationId: number,
  transaction: Transaction
) => {
  const projectFrameworkId = (await sequelize.query(
    `SELECT id FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = 1`,
    {
      replacements: { organizationId, project_id: projectId },
      transaction,
    }
  )) as [{ id: number }[], number];
  const assessmentDeleted = await deleteAssessmentEUByProjectIdQuery(
    projectFrameworkId[0][0].id,
    organizationId,
    transaction
  );
  const complianceDeleted = await deleteComplianeEUByProjectIdQuery(
    projectFrameworkId[0][0].id,
    organizationId,
    transaction
  );
  const result = await sequelize.query(
    `DELETE FROM projects_frameworks WHERE organization_id = :organizationId AND project_id = :project_id AND framework_id = 1 RETURNING *`,
    {
      replacements: { organizationId, project_id: projectId },
      mapToModel: true,
      model: ProjectFrameworksModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  return result.length > 0 && assessmentDeleted && complianceDeleted;
};
