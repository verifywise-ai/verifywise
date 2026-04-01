import { Request, Response } from "express";

import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  addFrameworkToProjectQuery,
  deleteFrameworkFromProjectQuery,
  getAllFrameworkByIdQuery,
  getAllFrameworksQuery,
} from "../utils/framework.utils";
import { sequelize } from "../database/db";
import { FrameworkModel } from "../domain.layer/models/frameworks/frameworks.model";
import {
  ValidationException,
  NotFoundException,
} from "../domain.layer/exceptions/custom.exception";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { logEvent } from "../utils/logger/dbLogger";
import { hasPendingApprovalQuery } from "../utils/approvalRequest.utils";

export async function getAllFrameworks(
  req: Request,
  res: Response
): Promise<any> {
  logStructured(
    "processing",
    "starting getAllFrameworks",
    "getAllFrameworks",
    "framework.ctrl.ts"
  );
  logger.debug("🔍 Fetching all frameworks");

  try {
    const frameworks = await getAllFrameworksQuery(req.organizationId!);

    if (frameworks && frameworks.length > 0) {
      logStructured(
        "successful",
        `retrieved ${frameworks.length} frameworks`,
        "getAllFrameworks",
        "framework.ctrl.ts"
      );
      return res.status(200).json(STATUS_CODE[200](frameworks));
    }

    logStructured(
      "successful",
      "no frameworks found",
      "getAllFrameworks",
      "framework.ctrl.ts"
    );
    return res.status(204).json(STATUS_CODE[204](frameworks));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve frameworks",
      "getAllFrameworks",
      "framework.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Failed to retrieve frameworks: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    logger.error("❌ Error in getAllFrameworks:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getFrameworkById(
  req: Request,
  res: Response
): Promise<any> {
  const frameworkId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logStructured(
    "processing",
    `fetching framework by ID: ${frameworkId}`,
    "getFrameworkById",
    "framework.ctrl.ts"
  );
  logger.debug(`🔍 Looking up framework with ID: ${frameworkId}`);

  try {
    const framework = await getAllFrameworkByIdQuery(
      frameworkId,
      req.organizationId!
    );

    if (framework) {
      logStructured(
        "successful",
        `framework found: ID ${frameworkId}`,
        "getFrameworkById",
        "framework.ctrl.ts"
      );
      return res.status(200).json(STATUS_CODE[200](framework));
    }

    logStructured(
      "successful",
      `no framework found: ID ${frameworkId}`,
      "getFrameworkById",
      "framework.ctrl.ts"
    );
    return res.status(404).json(STATUS_CODE[404](framework));
  } catch (error) {
    logStructured(
      "error",
      `failed to fetch framework: ID ${frameworkId}`,
      "getFrameworkById",
      "framework.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Failed to retrieve framework by ID: ${frameworkId}`,
      req.userId!,
      req.organizationId!
    );
    logger.error("❌ Error in getFrameworkById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function addFrameworkToProject(
  req: Request,
  res: Response
): Promise<any> {
  const frameworkId = parseInt(req.query.frameworkId as string);
  const projectId = parseInt(req.query.projectId as string);
  const transaction = await sequelize.transaction();
  try {
    logStructured(
      "processing",
      `adding framework ${frameworkId} to project ${projectId}`,
      "addFrameworkToProject",
      "framework.ctrl.ts"
    );
    logger.debug(`🔗 Adding framework ${frameworkId} to project ${projectId}`);

    // Check if project has a pending approval request
    const hasPendingApproval = await hasPendingApprovalQuery(
      projectId,
      "use_case",
      req.organizationId!
    );

    if (hasPendingApproval) {
      logStructured(
        "error",
        `project ${projectId} has pending approval request`,
        "addFrameworkToProject",
        "framework.ctrl.ts"
      );
      await transaction.rollback();
      return res.status(403).json(
        STATUS_CODE[403](
          "This use case has a pending approval request and cannot be modified until the approval process is complete."
        )
      );
    }

    // Validate framework exists
    const framework = await FrameworkModel.findByIdWithValidation(frameworkId);
    if (!framework) {
      logStructured(
        "error",
        `framework not found: ID ${frameworkId}`,
        "addFrameworkToProject",
        "framework.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Framework not found during project addition: ID ${frameworkId}`,
        req.userId!,
        req.organizationId!
      );
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]("Framework not found"));
    }

    const result = await addFrameworkToProjectQuery(
      frameworkId,
      projectId,
      req.organizationId!,
      transaction
    );

    if (result) {
      await transaction.commit();
      logStructured(
        "successful",
        `framework ${frameworkId} added to project ${projectId}`,
        "addFrameworkToProject",
        "framework.ctrl.ts"
      );
      await logEvent(
        "Create",
        `Framework ${frameworkId} added to project ${projectId}`,
        req.userId!,
        req.organizationId!
      );
      return res.status(200).json(STATUS_CODE[200](result));
    }

    await transaction.rollback();
    logStructured(
      "error",
      `failed to add framework ${frameworkId} to project ${projectId}`,
      "addFrameworkToProject",
      "framework.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Failed to add framework ${frameworkId} to project ${projectId}`,
      req.userId!,
      req.organizationId!
    );
    return res
      .status(404)
      .json(
        STATUS_CODE[404](
          "Framework not found or could not be added to the project."
        )
      );
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      `unexpected error adding framework to project`,
      "addFrameworkToProject",
      "framework.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Unexpected error adding framework to project: ${
        (error as Error).message
      }`,
      req.userId!,
      req.organizationId!
    );

    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    if (error instanceof NotFoundException) {
      return res.status(404).json(STATUS_CODE[404](error.message));
    }

    logger.error("❌ Error in addFrameworkToProject:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteFrameworkFromProject(
  req: Request,
  res: Response
): Promise<any> {
  const frameworkId = parseInt(req.query.frameworkId as string);
  const projectId = parseInt(req.query.projectId as string);
  const transaction = await sequelize.transaction();
  try {
    logStructured(
      "processing",
      `removing framework ${frameworkId} from project ${projectId}`,
      "deleteFrameworkFromProject",
      "framework.ctrl.ts"
    );
    logger.debug(
      `🔗 Removing framework ${frameworkId} from project ${projectId}`
    );

    // Check if project has a pending approval request
    console.log("=== deleteFrameworkFromProject - Checking pending approval ===");
    console.log("projectId:", projectId);
    console.log("organizationId:", req.organizationId);

    const hasPendingApproval = await hasPendingApprovalQuery(
      projectId,
      "use_case",
      req.organizationId!
    );

    if (hasPendingApproval) {
      logStructured(
        "error",
        `project ${projectId} has pending approval request`,
        "deleteFrameworkFromProject",
        "framework.ctrl.ts"
      );
      await transaction.rollback();
      return res.status(403).json(
        STATUS_CODE[403](
          "This use case has a pending approval request and cannot be modified until the approval process is complete."
        )
      );
    }

    // Validate framework exists
    const framework = await FrameworkModel.findByIdWithValidation(frameworkId);
    if (!framework) {
      logStructured(
        "error",
        `framework not found: ID ${frameworkId}`,
        "deleteFrameworkFromProject",
        "framework.ctrl.ts"
      );
      await logEvent(
        "Error",
        `Framework not found during project removal: ID ${frameworkId}`,
        req.userId!,
        req.organizationId!
      );
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]("Framework not found"));
    }

    const result = await deleteFrameworkFromProjectQuery(
      frameworkId,
      projectId,
      req.organizationId!,
      transaction
    );

    if (result) {
      await transaction.commit();
      logStructured(
        "successful",
        `framework ${frameworkId} removed from project ${projectId}`,
        "deleteFrameworkFromProject",
        "framework.ctrl.ts"
      );
      await logEvent(
        "Delete",
        `Framework ${frameworkId} removed from project ${projectId}`,
        req.userId!,
        req.organizationId!
      );
      return res.status(200).json(STATUS_CODE[200](result));
    }

    await transaction.rollback();
    logStructured(
      "error",
      `failed to remove framework ${frameworkId} from project ${projectId}`,
      "deleteFrameworkFromProject",
      "framework.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Failed to remove framework ${frameworkId} from project ${projectId}`,
      req.userId!,
      req.organizationId!
    );
    return res
      .status(404)
      .json(
        STATUS_CODE[404](
          "Framework not found or could not be removed from the project."
        )
      );
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      `unexpected error removing framework from project`,
      "deleteFrameworkFromProject",
      "framework.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Unexpected error removing framework from project: ${
        (error as Error).message
      }`,
      req.userId!,
      req.organizationId!
    );

    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    if (error instanceof NotFoundException) {
      return res.status(404).json(STATUS_CODE[404](error.message));
    }

    logger.error("❌ Error in deleteFrameworkFromProject:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
