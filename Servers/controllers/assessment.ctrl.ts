import { Request, Response } from "express";

import { STATUS_CODE } from "../utils/statusCode.utils";

import {
  deleteAssessmentByIdQuery,
  getAllAssessmentsQuery,
  getAssessmentByIdQuery,
  getAssessmentByProjectIdQuery,
} from "../utils/assessment.utils";
import { getTopicByAssessmentIdQuery } from "../utils/topic.utils";
import { getSubTopicByTopicIdQuery } from "../utils/subtopic.utils";
import { getQuestionBySubTopicIdQuery } from "../utils/question.utils";
import { AssessmentModel } from "../domain.layer/models/assessment/assessment.model";
import { TopicModel } from "../domain.layer/models/topic/topic.model";
import { SubtopicModel } from "../domain.layer/models/subtopic/subtopic.model";
import { sequelize } from "../database/db";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";
import {
  logFailure,
  logProcessing,
  logSuccess,
} from "../utils/logger/logHelper";

export async function getAllAssessments(
  req: Request,
  res: Response
): Promise<any> {
  logProcessing({
    description: "starting getAllAssessments",
    functionName: "getAllAssessments",
    fileName: "assessment.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!
  });

  try {
    const assessments = await getAllAssessmentsQuery(req.organizationId!);

    await logSuccess({
      eventType: "Read",
      description: "Retrieved all assessments",
      functionName: "getAllAssessments",
      fileName: "assessment.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!
    });

    return res
      .status(assessments ? 200 : 204)
      .json(STATUS_CODE[assessments ? 200 : 204](assessments));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve assessments",
      functionName: "getAllAssessments",
      fileName: "assessment.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAssessmentById(
  req: Request,
  res: Response
): Promise<any> {
  const assessmentId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getAssessmentById for ID ${assessmentId}`,
    functionName: "getAssessmentById",
    fileName: "assessment.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!
  });

  try {
    const assessment = await getAssessmentByIdQuery(
      assessmentId,
      req.organizationId!
    );

    await logSuccess({
      eventType: "Read",
      description: `Retrieved assessment ID ${assessmentId}`,
      functionName: "getAssessmentById",
      fileName: "assessment.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!
    });

    return res
      .status(assessment ? 200 : 404)
      .json(STATUS_CODE[assessment ? 200 : 404](assessment));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve assessment by ID",
      functionName: "getAssessmentById",
      fileName: "assessment.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function createAssessment(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  logProcessing({
    description: "starting createAssessment",
    functionName: "createAssessment",
    fileName: "assessment.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!
  });

  try {
    const assessmentData = req.body;

    // Validate required fields
    if (!assessmentData.project_id) {
      return res.status(400).json(
        STATUS_CODE[400]({
          message: "project_id is required",
          field: "project_id",
        })
      );
    }

    const createdAssessment =
      await AssessmentModel.CreateNewAssessment(assessmentData);

    if (createdAssessment) {
      await transaction.commit();

      await logSuccess({
        eventType: "Create",
        description: "Created new assessment",
        functionName: "createAssessment",
        fileName: "assessment.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!
      });

      return res.status(201).json(
        STATUS_CODE[201]({
          message: "Assessment created successfully",
          assessment: createdAssessment.toSafeJSON(),
        })
      );
    }

    await transaction.rollback();

    await logSuccess({
      eventType: "Create",
      description: "Assessment creation returned null",
      functionName: "createAssessment",
      fileName: "assessment.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!
    });

    return res.status(503).json(
      STATUS_CODE[503]({
        message: "Failed to create assessment",
      })
    );
  } catch (error) {
    await transaction.rollback();

    await logFailure({
      eventType: "Create",
      description: "Error creating assessment",
      functionName: "createAssessment",
      fileName: "assessment.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!
    });

    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error));
    }

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateAssessmentById(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const assessmentId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  logProcessing({
    description: `starting updateAssessmentById for ID ${assessmentId}`,
    functionName: "updateAssessmentById",
    fileName: "assessment.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!
  });

  try {
    const assessmentData = req.body;

    if (!assessmentData.project_id) {
      return res.status(400).json(
        STATUS_CODE[400]({
          message: "project_id is required",
          field: "project_id",
        })
      );
    }

    const [updatedCount, updatedAssessments] =
      await AssessmentModel.UpdateAssessment(assessmentId, assessmentData);

    if (updatedCount > 0 && updatedAssessments.length > 0) {
      await transaction.commit();

      await logSuccess({
        eventType: "Update",
        description: `Updated assessment ID ${assessmentId}`,
        functionName: "updateAssessmentById",
        fileName: "assessment.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!
      });

      return res.status(202).json(
        STATUS_CODE[202]({
          message: "Assessment updated successfully",
          assessment: updatedAssessments[0].toSafeJSON(),
        })
      );
    }

    await transaction.rollback();

    await logSuccess({
      eventType: "Update",
      description: "Assessment not found or no changes made",
      functionName: "updateAssessmentById",
      fileName: "assessment.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!
    });

    return res.status(404).json(
      STATUS_CODE[404]({
        message: "Assessment not found or no changes made",
        assessmentId: assessmentId,
      })
    );
  } catch (error) {
    await transaction.rollback();

    await logFailure({
      eventType: "Update",
      description: "Error updating assessment",
      functionName: "updateAssessmentById",
      fileName: "assessment.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!
    });

    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error));
    }

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteAssessmentById(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const assessmentId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  logProcessing({
    description: `starting deleteAssessmentById for ID ${assessmentId}`,
    functionName: "deleteAssessmentById",
    fileName: "assessment.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!
  });

  try {
    const deletedAssessment = await deleteAssessmentByIdQuery(
      assessmentId,
      req.organizationId!,
      transaction
    );

    if (deletedAssessment) {
      await transaction.commit();

      await logSuccess({
        eventType: "Delete",
        description: `Deleted assessment ID ${assessmentId}`,
        functionName: "deleteAssessmentById",
        fileName: "assessment.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!
      });

      return res.status(202).json(STATUS_CODE[202](deletedAssessment));
    }

    await logSuccess({
      eventType: "Delete",
      description: `Assessment not found for deletion: ID ${assessmentId}`,
      functionName: "deleteAssessmentById",
      fileName: "assessment.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!
    });

    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await transaction.rollback();

    await logFailure({
      eventType: "Delete",
      description: "Failed to delete assessment",
      functionName: "deleteAssessmentById",
      fileName: "assessment.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAnswers(req: Request, res: Response): Promise<any> {
  const assessmentId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getAnswers for assessment ID ${assessmentId}`,
    functionName: "getAnswers",
    fileName: "assessment.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!
  });

  try {
    const assessment = (await getAssessmentByIdQuery(
      assessmentId,
      req.organizationId!
    )) as AssessmentModel;
    const topics = (await getTopicByAssessmentIdQuery(
      assessment.id!,
      req.organizationId!
    )) as TopicModel[];

    for (let topic of topics) {
      const subTopics = (await getSubTopicByTopicIdQuery(
        topic.id!,
        req.organizationId!
      )) as SubtopicModel[];

      for (let subTopic of subTopics) {
        const questions = await getQuestionBySubTopicIdQuery(
          subTopic.id!,
          req.organizationId!
        );
        (subTopic.dataValues as any)["questions"] = questions;
      }
      (topic.dataValues as any)["subTopics"] = subTopics;
    }
    (assessment.dataValues as any)["topics"] = topics;

    await logSuccess({
      eventType: "Read",
      description: `Retrieved answers for assessment ID ${assessmentId}`,
      functionName: "getAnswers",
      fileName: "assessment.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!
    });

    return res.status(200).json(STATUS_CODE[200]({ message: assessment }));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve answers",
      functionName: "getAnswers",
      fileName: "assessment.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAssessmentByProjectId(
  req: Request,
  res: Response
): Promise<any> {
  const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getAssessmentByProjectId for project ID ${projectId}`,
    functionName: "getAssessmentByProjectId",
    fileName: "assessment.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!
  });

  try {
    const assessments = await getAssessmentByProjectIdQuery(
      projectId,
      req.organizationId!
    );

    await logSuccess({
      eventType: "Read",
      description: `Retrieved assessments for project ID ${projectId}`,
      functionName: "getAssessmentByProjectId",
      fileName: "assessment.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!
    });

    return res
      .status(assessments && assessments.length !== 0 ? 200 : 204)
      .json(
        STATUS_CODE[assessments && assessments.length !== 0 ? 200 : 204](
          assessments || {}
        )
      );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve assessments by project ID",
      functionName: "getAssessmentByProjectId",
      fileName: "assessment.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
