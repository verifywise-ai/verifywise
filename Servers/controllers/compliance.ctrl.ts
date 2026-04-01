/**
 * @fileoverview Compliance Score Controllers
 *
 * Implements RESTful API endpoints for AI compliance score management.
 * Provides detailed compliance scoring, module breakdowns, and drill-down capabilities.
 */

import { Request, Response } from "express";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { calculateComplianceScore } from "../utils/compliance.utils";

/**
 * GET /compliance/score
 *
 * Retrieves the current AI compliance score for the organization.
 * Includes overall score, module breakdowns, and calculation metadata.
 */
export async function getComplianceScore(req: Request, res: Response) {
  logProcessing({
    description: "starting getComplianceScore",
    functionName: "getComplianceScore",
    fileName: "compliance.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    if (!req.organizationId) {
      return res.status(400).json(STATUS_CODE[400]("Organization ID is required"));
    }

    const complianceScore = await calculateComplianceScore(
      req.organizationId!
    );

    await logSuccess({
      eventType: "Read",
      description: `Retrieved compliance score for organization ${req.organizationId}`,
      functionName: "getComplianceScore",
      fileName: "compliance.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](complianceScore));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve compliance score",
      functionName: "getComplianceScore",
      fileName: "compliance.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /compliance/score/:organizationId
 *
 * Retrieves compliance score for a specific organization (admin use).
 * Allows organization-specific compliance score access for authorized users.
 */
export async function getComplianceScoreByOrganization(req: Request, res: Response) {
  logProcessing({
    description: "starting getComplianceScoreByOrganization",
    functionName: "getComplianceScoreByOrganization",
    fileName: "compliance.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const organizationId = parseInt(Array.isArray(req.params.organizationId) ? req.params.organizationId[0] : req.params.organizationId);

    if (isNaN(organizationId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid organization ID"));
    }

    // Authorization check: ensure user can access this organization's data
    if (req.organizationId && req.organizationId !== organizationId) {
      return res.status(403).json(STATUS_CODE[403]("Access denied: User does not have permission to access this organization's compliance data"));
    }

    const complianceScore = await calculateComplianceScore(
      organizationId
    );

    await logSuccess({
      eventType: "Read",
      description: `Retrieved compliance score for organization ${organizationId}`,
      functionName: "getComplianceScoreByOrganization",
      fileName: "compliance.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](complianceScore));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve compliance score by organization",
      functionName: "getComplianceScoreByOrganization",
      fileName: "compliance.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /compliance/details/:organizationId
 *
 * Retrieves detailed compliance breakdown for drill-down functionality.
 * Provides comprehensive module analysis and component-level scoring.
 */
export async function getComplianceDetails(req: Request, res: Response) {
  logProcessing({
    description: "starting getComplianceDetails",
    functionName: "getComplianceDetails",
    fileName: "compliance.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const organizationId = parseInt(Array.isArray(req.params.organizationId) ? req.params.organizationId[0] : req.params.organizationId);

    if (isNaN(organizationId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid organization ID"));
    }

    // Authorization check: ensure user can access this organization's data
    if (req.organizationId && req.organizationId !== organizationId) {
      return res.status(403).json(STATUS_CODE[403]("Access denied: User does not have permission to access this organization's compliance details"));
    }

    const complianceScore = await calculateComplianceScore(
      organizationId
    );

    // Enhanced response for drill-down with additional insights
    const detailedResponse = {
      ...complianceScore,
      insights: {
        strongestModule: Object.entries(complianceScore.modules)
          .reduce((max, [key, module]) =>
            module.score > max.score ? { name: key, score: module.score } : max,
            { name: '', score: 0 }
          ),
        weakestModule: Object.entries(complianceScore.modules)
          .reduce((min, [key, module]) =>
            module.score < min.score ? { name: key, score: module.score } : min,
            { name: '', score: 100 }
          ),
        improvementPriority: Object.entries(complianceScore.modules)
          .sort(([,a], [,b]) => a.score - b.score)
          .map(([name, module]) => ({
            module: name,
            score: module.score,
            weight: module.weight,
            impact: (100 - module.score) * module.weight
          })),
        overallTrend: 'stable', // TODO: Calculate from historical data
        dataQuality: {
          riskManagement: complianceScore.modules.riskManagement.qualityScore,
          vendorManagement: complianceScore.modules.vendorManagement.qualityScore,
          projectGovernance: complianceScore.modules.projectGovernance.qualityScore,
          modelLifecycle: complianceScore.modules.modelLifecycle.qualityScore,
          policyDocumentation: complianceScore.modules.policyDocumentation.qualityScore
        }
      }
    };

    await logSuccess({
      eventType: "Read",
      description: `Retrieved detailed compliance analysis for organization ${organizationId}`,
      functionName: "getComplianceDetails",
      fileName: "compliance.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](detailedResponse));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve compliance details",
      functionName: "getComplianceDetails",
      fileName: "compliance.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
