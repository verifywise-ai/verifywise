/**
 * Post-Market Monitoring Controller
 *
 * Handles all API endpoints for post-market monitoring configuration,
 * questions, cycles, responses, and reports.
 */

import { Request, Response } from "express";
import { sequelize } from "../database/db";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  getPMMConfigByProjectIdQuery,
  createPMMConfigQuery,
  updatePMMConfigQuery,
  deletePMMConfigQuery,
  getPMMQuestionsQuery,
  addPMMQuestionQuery,
  updatePMMQuestionQuery,
  deletePMMQuestionQuery,
  reorderPMMQuestionsQuery,
  getActiveCycleByProjectIdQuery,
  getCycleByIdQuery,
  savePMMResponsesQuery,
  completeCycleQuery,
  getPMMResponsesQuery,
  getPMMReportsQuery,
  getContextSnapshotQuery,
  createPMMReportQuery,
  getLatestCycleNumberQuery,
  createPMMCycleQuery,
  getAssignedStakeholderQuery,
} from "../utils/postMarketMonitoring.utils";
import {
  IPMMConfigCreateRequest,
  IPMMConfigUpdateRequest,
  IPMMQuestionCreate,
  IPMMQuestionUpdate,
  IPMMCycleSubmitRequest,
  IPMMReportsFilterRequest,
  IPMMResponseWithQuestion,
} from "../domain.layer/interfaces/i.postMarketMonitoring";
import { seedDefaultQuestions } from "../services/postMarketMonitoring/defaultQuestions";
import {
  buildPMMReportData,
  generateAndUploadPMMReport,
} from "../services/postMarketMonitoring/pmmPdfGenerator";
import {
  logFailure,
  logProcessing,
  logSuccess,
} from "../utils/logger/logHelper";

const FILE_NAME = "postMarketMonitoring.ctrl.ts";

// ============================================================================
// Configuration Endpoints
// ============================================================================

export async function getConfigByProjectId(
  req: Request,
  res: Response
): Promise<any> {
  const projectId = parseInt(Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId, 10);

  logProcessing({
    description: `Getting PMM config for project ${projectId}`,
    functionName: "getConfigByProjectId",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  if (isNaN(projectId)) {
    return res.status(400).json(STATUS_CODE[400]({ message: "Invalid project ID" }));
  }

  try {
    const config = await getPMMConfigByProjectIdQuery(projectId, req.organizationId!);

    if (!config) {
      await logSuccess({
        eventType: "Read",
        description: `PMM config not found for project ${projectId}`,
        functionName: "getConfigByProjectId",
        fileName: FILE_NAME,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]({ message: "Config not found" }));
    }

    await logSuccess({
      eventType: "Read",
      description: `Retrieved PMM config for project ${projectId}`,
      functionName: "getConfigByProjectId",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](config));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve PMM config",
      functionName: "getConfigByProjectId",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function createConfig(req: Request, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();

  logProcessing({
    description: "Creating PMM config",
    functionName: "createConfig",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const configData = req.body as IPMMConfigCreateRequest;
    const userId = req.userId!;

    if (!configData.project_id) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]({ message: "Project ID is required" }));
    }

    // Check if config already exists
    const existingConfig = await getPMMConfigByProjectIdQuery(
      configData.project_id,
      req.organizationId!
    );
    if (existingConfig) {
      await transaction.rollback();
      return res.status(409).json(STATUS_CODE[409]({
        message: "Configuration already exists for this project",
      }));
    }

    // Create config
    const config = await createPMMConfigQuery(
      configData,
      userId,
      req.organizationId!,
      transaction
    );

    // Seed default questions
    await seedDefaultQuestions(
      config.id!,
      req.organizationId!,
      (question, organizationId) => addPMMQuestionQuery(question, organizationId, transaction)
    );

    await transaction.commit();

    // Fetch complete config with questions count
    const completeConfig = await getPMMConfigByProjectIdQuery(
      configData.project_id,
      req.organizationId!
    );

    await logSuccess({
      eventType: "Create",
      description: `Created PMM config for project ${configData.project_id}`,
      functionName: "createConfig",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(201).json(STATUS_CODE[201](completeConfig));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Create",
      description: "Failed to create PMM config",
      functionName: "createConfig",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateConfig(req: Request, res: Response): Promise<any> {
  const configId = parseInt(Array.isArray(req.params.configId) ? req.params.configId[0] : req.params.configId, 10);

  logProcessing({
    description: `Updating PMM config ${configId}`,
    functionName: "updateConfig",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  if (isNaN(configId)) {
    return res.status(400).json(STATUS_CODE[400]({ message: "Invalid config ID" }));
  }

  try {
    const updateData = req.body as IPMMConfigUpdateRequest;
    const config = await updatePMMConfigQuery(configId, updateData, req.organizationId!);

    if (!config) {
      await logSuccess({
        eventType: "Update",
        description: `PMM config ${configId} not found`,
        functionName: "updateConfig",
        fileName: FILE_NAME,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]({ message: "Config not found" }));
    }

    await logSuccess({
      eventType: "Update",
      description: `Updated PMM config ${configId}`,
      functionName: "updateConfig",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](config));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "Failed to update PMM config",
      functionName: "updateConfig",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteConfig(req: Request, res: Response): Promise<any> {
  const configId = parseInt(Array.isArray(req.params.configId) ? req.params.configId[0] : req.params.configId, 10);

  logProcessing({
    description: `Deleting PMM config ${configId}`,
    functionName: "deleteConfig",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  if (isNaN(configId)) {
    return res.status(400).json(STATUS_CODE[400]({ message: "Invalid config ID" }));
  }

  try {
    const deleted = await deletePMMConfigQuery(configId, req.organizationId!);

    if (!deleted) {
      await logSuccess({
        eventType: "Delete",
        description: `PMM config ${configId} not found`,
        functionName: "deleteConfig",
        fileName: FILE_NAME,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]({ message: "Config not found" }));
    }

    await logSuccess({
      eventType: "Delete",
      description: `Deleted PMM config ${configId}`,
      functionName: "deleteConfig",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({ message: "Config deleted" }));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: "Failed to delete PMM config",
      functionName: "deleteConfig",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================================================
// Question Endpoints
// ============================================================================

export async function getQuestions(req: Request, res: Response): Promise<any> {
  const configId = req.params.configId ? parseInt(Array.isArray(req.params.configId) ? req.params.configId[0] : req.params.configId, 10) : null;

  logProcessing({
    description: `Getting PMM questions for config ${configId}`,
    functionName: "getQuestions",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const questions = await getPMMQuestionsQuery(configId, req.organizationId!);

    await logSuccess({
      eventType: "Read",
      description: `Retrieved ${questions.length} PMM questions`,
      functionName: "getQuestions",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](questions));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve PMM questions",
      functionName: "getQuestions",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function addQuestion(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "Adding PMM question",
    functionName: "addQuestion",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const questionData = req.body as IPMMQuestionCreate;

    if (!questionData.question_text || !questionData.question_type) {
      return res.status(400).json(STATUS_CODE[400]({
        message: "Question text and type are required",
      }));
    }

    // Validate question type
    const validTypes = ["yes_no", "multi_select", "multi_line_text"];
    if (!validTypes.includes(questionData.question_type)) {
      return res.status(400).json(STATUS_CODE[400]({
        message: "Invalid question type",
      }));
    }

    const question = await addPMMQuestionQuery(questionData, req.organizationId!);

    await logSuccess({
      eventType: "Create",
      description: `Added PMM question ${question.id}`,
      functionName: "addQuestion",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(201).json(STATUS_CODE[201](question));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "Failed to add PMM question",
      functionName: "addQuestion",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateQuestion(req: Request, res: Response): Promise<any> {
  const questionId = parseInt(Array.isArray(req.params.questionId) ? req.params.questionId[0] : req.params.questionId, 10);

  logProcessing({
    description: `Updating PMM question ${questionId}`,
    functionName: "updateQuestion",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  if (isNaN(questionId)) {
    return res.status(400).json(STATUS_CODE[400]({ message: "Invalid question ID" }));
  }

  try {
    const updateData = req.body as IPMMQuestionUpdate;

    // Validate question type if provided
    if (updateData.question_type) {
      const validTypes = ["yes_no", "multi_select", "multi_line_text"];
      if (!validTypes.includes(updateData.question_type)) {
        return res.status(400).json(STATUS_CODE[400]({
          message: "Invalid question type",
        }));
      }
    }

    const question = await updatePMMQuestionQuery(questionId, updateData, req.organizationId!);

    if (!question) {
      return res.status(404).json(STATUS_CODE[404]({ message: "Question not found" }));
    }

    await logSuccess({
      eventType: "Update",
      description: `Updated PMM question ${questionId}`,
      functionName: "updateQuestion",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](question));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "Failed to update PMM question",
      functionName: "updateQuestion",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteQuestion(req: Request, res: Response): Promise<any> {
  const questionId = parseInt(Array.isArray(req.params.questionId) ? req.params.questionId[0] : req.params.questionId, 10);

  logProcessing({
    description: `Deleting PMM question ${questionId}`,
    functionName: "deleteQuestion",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  if (isNaN(questionId)) {
    return res.status(400).json(STATUS_CODE[400]({ message: "Invalid question ID" }));
  }

  try {
    const deleted = await deletePMMQuestionQuery(questionId, req.organizationId!);

    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404]({
        message: "Question not found or is a system default",
      }));
    }

    await logSuccess({
      eventType: "Delete",
      description: `Deleted PMM question ${questionId}`,
      functionName: "deleteQuestion",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({ message: "Question deleted" }));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: "Failed to delete PMM question",
      functionName: "deleteQuestion",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function reorderQuestions(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "Reordering PMM questions",
    functionName: "reorderQuestions",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const { orders } = req.body as { orders: Array<{ id: number; display_order: number }> };

    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json(STATUS_CODE[400]({
        message: "Orders array is required",
      }));
    }

    // Validate order items
    for (const order of orders) {
      if (typeof order.id !== "number" || typeof order.display_order !== "number") {
        return res.status(400).json(STATUS_CODE[400]({
          message: "Each order item must have numeric id and display_order",
        }));
      }
    }

    await reorderPMMQuestionsQuery(orders, req.organizationId!);

    await logSuccess({
      eventType: "Update",
      description: `Reordered ${orders.length} PMM questions`,
      functionName: "reorderQuestions",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({ message: "Questions reordered" }));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "Failed to reorder PMM questions",
      functionName: "reorderQuestions",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================================================
// Cycle and Form Endpoints
// ============================================================================

export async function getActiveCycle(req: Request, res: Response): Promise<any> {
  const projectId = parseInt(Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId, 10);

  logProcessing({
    description: `Getting active PMM cycle for project ${projectId}`,
    functionName: "getActiveCycle",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  if (isNaN(projectId)) {
    return res.status(400).json(STATUS_CODE[400]({ message: "Invalid project ID" }));
  }

  try {
    const cycle = await getActiveCycleByProjectIdQuery(projectId, req.organizationId!);

    if (!cycle) {
      await logSuccess({
        eventType: "Read",
        description: `No active PMM cycle for project ${projectId}`,
        functionName: "getActiveCycle",
        fileName: FILE_NAME,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]({
        message: "No active monitoring cycle",
      }));
    }

    await logSuccess({
      eventType: "Read",
      description: `Retrieved active PMM cycle ${cycle.id} for project ${projectId}`,
      functionName: "getActiveCycle",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](cycle));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve active PMM cycle",
      functionName: "getActiveCycle",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getCycleById(req: Request, res: Response): Promise<any> {
  const cycleId = parseInt(Array.isArray(req.params.cycleId) ? req.params.cycleId[0] : req.params.cycleId, 10);

  logProcessing({
    description: `Getting PMM cycle ${cycleId}`,
    functionName: "getCycleById",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  if (isNaN(cycleId)) {
    return res.status(400).json(STATUS_CODE[400]({ message: "Invalid cycle ID" }));
  }

  try {
    const cycle = await getCycleByIdQuery(cycleId, req.organizationId!);

    if (!cycle) {
      return res.status(404).json(STATUS_CODE[404]({ message: "Cycle not found" }));
    }

    await logSuccess({
      eventType: "Read",
      description: `Retrieved PMM cycle ${cycleId}`,
      functionName: "getCycleById",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](cycle));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve PMM cycle",
      functionName: "getCycleById",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getResponses(req: Request, res: Response): Promise<any> {
  const cycleId = parseInt(Array.isArray(req.params.cycleId) ? req.params.cycleId[0] : req.params.cycleId, 10);

  logProcessing({
    description: `Getting PMM responses for cycle ${cycleId}`,
    functionName: "getResponses",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  if (isNaN(cycleId)) {
    return res.status(400).json(STATUS_CODE[400]({ message: "Invalid cycle ID" }));
  }

  try {
    // Verify cycle exists
    const cycle = await getCycleByIdQuery(cycleId, req.organizationId!);
    if (!cycle) {
      return res.status(404).json(STATUS_CODE[404]({ message: "Cycle not found" }));
    }

    const responses = await getPMMResponsesQuery(cycleId, req.organizationId!);

    await logSuccess({
      eventType: "Read",
      description: `Retrieved ${responses.length} PMM responses for cycle ${cycleId}`,
      functionName: "getResponses",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](responses));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve PMM responses",
      functionName: "getResponses",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function saveResponses(req: Request, res: Response): Promise<any> {
  const cycleId = parseInt(Array.isArray(req.params.cycleId) ? req.params.cycleId[0] : req.params.cycleId, 10);

  logProcessing({
    description: `Saving PMM responses for cycle ${cycleId}`,
    functionName: "saveResponses",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  if (isNaN(cycleId)) {
    return res.status(400).json(STATUS_CODE[400]({ message: "Invalid cycle ID" }));
  }

  try {
    const { responses } = req.body as IPMMCycleSubmitRequest;

    if (!Array.isArray(responses) || responses.length === 0) {
      return res.status(400).json(STATUS_CODE[400]({
        message: "Responses array is required",
      }));
    }

    // Check cycle exists and is not completed
    const cycle = await getCycleByIdQuery(cycleId, req.organizationId!);
    if (!cycle) {
      return res.status(404).json(STATUS_CODE[404]({ message: "Cycle not found" }));
    }
    if (cycle.status === "completed") {
      return res.status(409).json(STATUS_CODE[409]({
        message: "Cycle is already completed",
      }));
    }

    const savedResponses = await savePMMResponsesQuery(
      cycleId,
      responses,
      req.organizationId!
    );

    await logSuccess({
      eventType: "Update",
      description: `Saved ${responses.length} PMM responses for cycle ${cycleId}`,
      functionName: "saveResponses",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](savedResponses));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "Failed to save PMM responses",
      functionName: "saveResponses",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function submitCycle(req: Request, res: Response): Promise<any> {
  const cycleId = parseInt(Array.isArray(req.params.cycleId) ? req.params.cycleId[0] : req.params.cycleId, 10);

  logProcessing({
    description: `Submitting PMM cycle ${cycleId}`,
    functionName: "submitCycle",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  if (isNaN(cycleId)) {
    return res.status(400).json(STATUS_CODE[400]({ message: "Invalid cycle ID" }));
  }

  const transaction = await sequelize.transaction();

  try {
    const { responses } = req.body as IPMMCycleSubmitRequest;
    const userId = req.userId!;

    // Check cycle exists and is not completed
    const cycle = await getCycleByIdQuery(cycleId, req.organizationId!);
    if (!cycle) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]({ message: "Cycle not found" }));
    }
    if (cycle.status === "completed") {
      await transaction.rollback();
      return res.status(409).json(STATUS_CODE[409]({
        message: "Cycle is already completed",
      }));
    }

    // Save responses if provided
    if (responses && responses.length > 0) {
      await savePMMResponsesQuery(cycleId, responses, req.organizationId!, transaction);
    }

    // Mark cycle as completed
    await completeCycleQuery(cycleId, userId, req.organizationId!, transaction);

    // Get context snapshot
    const contextSnapshot = await getContextSnapshotQuery(
      cycle.project_id!,
      req.organizationId!
    );

    // Get all responses for report (includes question details from JOIN)
    const allResponses = await getPMMResponsesQuery(cycleId, req.organizationId!) as IPMMResponseWithQuestion[];

    // Get user info for report
    const userResult = await sequelize.query(
      `SELECT name, surname FROM users WHERE id = :userId`,
      { replacements: { userId } }
    ) as [Array<{ name: string; surname: string }>, number];
    const userName = userResult[0][0]
      ? `${userResult[0][0].name} ${userResult[0][0].surname}`
      : "Unknown";

    // Get organization info
    const orgResult = await sequelize.query(
      `SELECT name FROM organizations WHERE id = :orgId`,
      { replacements: { orgId: req.organizationId } }
    ) as [Array<{ name: string }>, number];
    const orgName = orgResult[0][0]?.name || "Organization";

    // Build report data
    const reportData = buildPMMReportData(
      orgName,
      undefined,
      cycle.project_title || "",
      cycle.project_id?.toString() || "",
      cycle.cycle_number,
      new Date(),
      userName,
      contextSnapshot,
      allResponses
    );

    // Generate and upload PDF report
    const uploadResult = await generateAndUploadPMMReport(
      reportData,
      userId,
      cycle.project_id!,
      req.organizationId!
    );

    // Create report record
    await createPMMReportQuery(
      cycleId,
      contextSnapshot,
      uploadResult.success ? uploadResult.fileId! : null,
      userId,
      req.organizationId!,
      transaction
    );

    await transaction.commit();

    await logSuccess({
      eventType: "Update",
      description: `Submitted PMM cycle ${cycleId}`,
      functionName: "submitCycle",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200]({
      message: "Cycle submitted successfully",
      report_generated: uploadResult.success,
      report_filename: uploadResult.filename,
    }));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: "Failed to submit PMM cycle",
      functionName: "submitCycle",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function flagConcern(req: Request, res: Response): Promise<any> {
  const cycleId = parseInt(Array.isArray(req.params.cycleId) ? req.params.cycleId[0] : req.params.cycleId, 10);

  logProcessing({
    description: `Flagging concern for PMM cycle ${cycleId}`,
    functionName: "flagConcern",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  if (isNaN(cycleId)) {
    return res.status(400).json(STATUS_CODE[400]({ message: "Invalid cycle ID" }));
  }

  try {
    const { question_id, response_value } = req.body;

    if (!question_id) {
      return res.status(400).json(STATUS_CODE[400]({
        message: "Question ID is required",
      }));
    }

    // Check cycle exists
    const cycle = await getCycleByIdQuery(cycleId, req.organizationId!);
    if (!cycle) {
      return res.status(404).json(STATUS_CODE[404]({ message: "Cycle not found" }));
    }

    // Save flagged response
    await savePMMResponsesQuery(
      cycleId,
      [{ question_id, response_value, is_flagged: true }],
      req.organizationId!
    );

    await logSuccess({
      eventType: "Update",
      description: `Flagged concern for PMM cycle ${cycleId}`,
      functionName: "flagConcern",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({
      message: "Concern flagged successfully",
    }));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "Failed to flag concern",
      functionName: "flagConcern",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================================================
// Report Endpoints
// ============================================================================

export async function getReports(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "Getting PMM reports",
    functionName: "getReports",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const filters: IPMMReportsFilterRequest = {
      project_id: req.query.project_id ? parseInt(Array.isArray(req.query.project_id) ? String(req.query.project_id[0]) : String(req.query.project_id), 10) : undefined,
      start_date: Array.isArray(req.query.start_date) ? String(req.query.start_date[0]) : (req.query.start_date ? String(req.query.start_date) : undefined),
      end_date: Array.isArray(req.query.end_date) ? String(req.query.end_date[0]) : (req.query.end_date ? String(req.query.end_date) : undefined),
      completed_by: req.query.completed_by ? parseInt(Array.isArray(req.query.completed_by) ? String(req.query.completed_by[0]) : String(req.query.completed_by), 10) : undefined,
      flagged_only: Array.isArray(req.query.flagged_only) ? String(req.query.flagged_only[0]) === "true" : String(req.query.flagged_only) === "true",
      page: req.query.page ? parseInt(Array.isArray(req.query.page) ? String(req.query.page[0]) : String(req.query.page), 10) : 1,
      limit: req.query.limit ? parseInt(Array.isArray(req.query.limit) ? String(req.query.limit[0]) : String(req.query.limit), 10) : 10,
    };

    // Validate pagination
    if (filters.page && filters.page < 1) filters.page = 1;
    if (filters.limit && (filters.limit < 1 || filters.limit > 100)) filters.limit = 10;

    const result = await getPMMReportsQuery(
      {
        projectId: filters.project_id,
        startDate: filters.start_date,
        endDate: filters.end_date,
        completedBy: filters.completed_by,
        flaggedOnly: filters.flagged_only,
        page: filters.page,
        limit: filters.limit,
      },
      req.organizationId!
    );

    await logSuccess({
      eventType: "Read",
      description: `Retrieved ${result.reports.length} PMM reports`,
      functionName: "getReports",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({
      reports: result.reports,
      total: result.total,
      page: filters.page,
      limit: filters.limit,
    }));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve PMM reports",
      functionName: "getReports",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function downloadReport(req: Request, res: Response): Promise<any> {
  const reportId = parseInt(Array.isArray(req.params.reportId) ? req.params.reportId[0] : req.params.reportId, 10);

  logProcessing({
    description: `Downloading PMM report ${reportId}`,
    functionName: "downloadReport",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  if (isNaN(reportId)) {
    return res.status(400).json(STATUS_CODE[400]({ message: "Invalid report ID" }));
  }

  try {
    // Get report with file info using parameterized query
    const reportResult = await sequelize.query(
      `SELECT r.*, f.filename, f.file_path, f.type as mime_type
       FROM post_market_monitoring_reports r
       LEFT JOIN files f ON r.file_id = f.id AND f.organization_id = :organizationId
       WHERE r.organization_id = :organizationId AND r.id = :reportId`,
      { replacements: { reportId, organizationId: req.organizationId } }
    ) as [Array<{
      id: number;
      file_id: number | null;
      filename: string;
      file_path: string;
      mime_type: string;
    }>, number];

    if (reportResult[0].length === 0) {
      return res.status(404).json(STATUS_CODE[404]({ message: "Report not found" }));
    }

    const report = reportResult[0][0];

    if (!report.file_id) {
      return res.status(404).json(STATUS_CODE[404]({ message: "Report file not found" }));
    }

    await logSuccess({
      eventType: "Read",
      description: `Downloaded PMM report ${reportId}`,
      functionName: "downloadReport",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    // Redirect to file download endpoint
    return res.redirect(`/api/files/${report.file_id}/download`);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to download PMM report",
      functionName: "downloadReport",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================================================
// Admin Endpoints
// ============================================================================

export async function reassignStakeholder(req: Request, res: Response): Promise<any> {
  const cycleId = parseInt(Array.isArray(req.params.cycleId) ? req.params.cycleId[0] : req.params.cycleId, 10);

  logProcessing({
    description: `Reassigning stakeholder for PMM cycle ${cycleId}`,
    functionName: "reassignStakeholder",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  if (isNaN(cycleId)) {
    return res.status(400).json(STATUS_CODE[400]({ message: "Invalid cycle ID" }));
  }

  try {
    const { stakeholder_id } = req.body;

    if (!stakeholder_id || typeof stakeholder_id !== "number") {
      return res.status(400).json(STATUS_CODE[400]({
        message: "Valid stakeholder ID is required",
      }));
    }

    // Check cycle exists
    const cycle = await getCycleByIdQuery(cycleId, req.organizationId!);
    if (!cycle) {
      return res.status(404).json(STATUS_CODE[404]({ message: "Cycle not found" }));
    }

    await sequelize.query(
      `UPDATE post_market_monitoring_cycles
       SET assigned_stakeholder_id = :stakeholderId
       WHERE organization_id = :organizationId AND id = :cycleId`,
      { replacements: { cycleId, stakeholderId: stakeholder_id, organizationId: req.organizationId } }
    );

    await logSuccess({
      eventType: "Update",
      description: `Reassigned stakeholder for PMM cycle ${cycleId}`,
      functionName: "reassignStakeholder",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({
      message: "Stakeholder reassigned successfully",
    }));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "Failed to reassign stakeholder",
      functionName: "reassignStakeholder",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function startNewCycle(req: Request, res: Response): Promise<any> {
  const projectId = parseInt(Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId, 10);

  logProcessing({
    description: `Starting new PMM cycle for project ${projectId}`,
    functionName: "startNewCycle",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  if (isNaN(projectId)) {
    return res.status(400).json(STATUS_CODE[400]({ message: "Invalid project ID" }));
  }

  const transaction = await sequelize.transaction();

  try {
    // Get config
    const config = await getPMMConfigByProjectIdQuery(projectId, req.organizationId!);
    if (!config) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]({ message: "Config not found" }));
    }

    // Check for existing active cycle
    const activeCycle = await getActiveCycleByProjectIdQuery(projectId, req.organizationId!);
    if (activeCycle) {
      await transaction.rollback();
      return res.status(409).json(STATUS_CODE[409]({
        message: "An active cycle already exists",
      }));
    }

    // Calculate due date
    const dueDate = new Date();
    switch (config.frequency_unit) {
      case "days":
        dueDate.setDate(dueDate.getDate() + config.frequency_value);
        break;
      case "weeks":
        dueDate.setDate(dueDate.getDate() + config.frequency_value * 7);
        break;
      case "months":
        dueDate.setMonth(dueDate.getMonth() + config.frequency_value);
        break;
    }

    // Get next cycle number
    const latestCycleNumber = await getLatestCycleNumberQuery(config.id!, req.organizationId!);

    // Get stakeholder
    const stakeholder = await getAssignedStakeholderQuery(projectId, req.organizationId!);

    // Create cycle
    const cycle = await createPMMCycleQuery(
      config.id!,
      latestCycleNumber + 1,
      dueDate,
      stakeholder?.id || null,
      req.organizationId!,
      transaction
    );

    await transaction.commit();

    await logSuccess({
      eventType: "Create",
      description: `Started new PMM cycle ${cycle.id} for project ${projectId}`,
      functionName: "startNewCycle",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(201).json(STATUS_CODE[201](cycle));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Create",
      description: "Failed to start new PMM cycle",
      functionName: "startNewCycle",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
