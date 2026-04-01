import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  getPortfolioByOrg,
  getPortfolioByProject,
  getPortfolioTrend,
  computeDerivedFields,
  recordPortfolioSnapshot,
} from "../utils/quantitativeRisk.utils";
import {
  applyBenchmarkToRiskQuery,
  getBenchmarkByIdQuery,
} from "../utils/riskBenchmark.utils";
import { getRiskByIdQuery } from "../utils/risk.utils";
import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import { logStructured } from "../utils/logger/fileLogger";
import { logEvent } from "../utils/logger/dbLogger";

/**
 * GET /api/quantitative-risks/portfolio/org
 * Returns aggregated ALE, residual ALE, mitigation cost, risk count for the org.
 */
export async function getOrgPortfolio(
  req: Request,
  res: Response
): Promise<any> {
  logStructured(
    "processing",
    "fetching org portfolio summary",
    "getOrgPortfolio",
    "quantitativeRisk.ctrl.ts"
  );

  try {
    const summary = await getPortfolioByOrg(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](summary));
  } catch (error) {
    logStructured(
      "error",
      "failed to fetch org portfolio",
      "getOrgPortfolio",
      "quantitativeRisk.ctrl.ts"
    );
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/quantitative-risks/portfolio/project/:projectId
 * Returns aggregated portfolio for a specific project.
 */
export async function getProjectPortfolio(
  req: Request,
  res: Response
): Promise<any> {
  const projectId = parseInt(req.params.projectId as string);

  logStructured(
    "processing",
    `fetching project portfolio for ID: ${projectId}`,
    "getProjectPortfolio",
    "quantitativeRisk.ctrl.ts"
  );

  try {
    const summary = await getPortfolioByProject(
      req.organizationId!,
      projectId
    );
    return res.status(200).json(STATUS_CODE[200](summary));
  } catch (error) {
    logStructured(
      "error",
      `failed to fetch project portfolio for ID: ${projectId}`,
      "getProjectPortfolio",
      "quantitativeRisk.ctrl.ts"
    );
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/quantitative-risks/portfolio/trend?days=30&projectId=123
 * Returns portfolio snapshots over time.
 */
export async function getPortfolioTrendHandler(
  req: Request,
  res: Response
): Promise<any> {
  const days = parseInt(req.query.days as string) || 30;
  const projectId = req.query.projectId
    ? parseInt(req.query.projectId as string)
    : undefined;

  logStructured(
    "processing",
    `fetching portfolio trend (${days} days)`,
    "getPortfolioTrend",
    "quantitativeRisk.ctrl.ts"
  );

  try {
    const snapshots = await getPortfolioTrend(
      req.organizationId!,
      days,
      projectId
    );
    return res.status(200).json(STATUS_CODE[200](snapshots));
  } catch (error) {
    logStructured(
      "error",
      "failed to fetch portfolio trend",
      "getPortfolioTrend",
      "quantitativeRisk.ctrl.ts"
    );
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * POST /api/quantitative-risks/:riskId/apply-benchmark/:benchmarkId
 * Copies benchmark values to a risk and recomputes derived fields.
 */
export async function applyBenchmark(
  req: Request,
  res: Response
): Promise<any> {
  const riskId = parseInt(req.params.riskId as string);
  const benchmarkId = parseInt(req.params.benchmarkId as string);

  logStructured(
    "processing",
    `applying benchmark ${benchmarkId} to risk ${riskId}`,
    "applyBenchmark",
    "quantitativeRisk.ctrl.ts"
  );

  try {
    const benchmark = await getBenchmarkByIdQuery(benchmarkId);
    if (!benchmark) {
      return res.status(404).json(STATUS_CODE[404]("Benchmark not found"));
    }

    // Apply benchmark values to risk
    const applied = await applyBenchmarkToRiskQuery(
      riskId,
      benchmarkId,
      req.organizationId!
    );
    if (!applied) {
      return res.status(404).json(STATUS_CODE[404]("Risk not found"));
    }

    // Recompute derived fields with benchmark values
    const derived = computeDerivedFields(benchmark);

    // Update computed fields on the risk
    await sequelize.query(
      `UPDATE risks SET
        total_loss_likely = :total_loss_likely,
        ale_estimate = :ale_estimate,
        residual_ale = :residual_ale,
        roi_percentage = :roi_percentage
      WHERE id = :riskId AND organization_id = :organizationId`,
      {
        replacements: {
          riskId,
          organizationId: req.organizationId!,
          total_loss_likely: derived.total_loss_likely ?? null,
          ale_estimate: derived.ale_estimate ?? null,
          residual_ale: derived.residual_ale ?? null,
          roi_percentage: derived.roi_percentage ?? null,
        },
      }
    );

    // Record portfolio snapshot (fire-and-forget)
    recordPortfolioSnapshot(req.organizationId!).catch((err) =>
      console.error("Failed to record portfolio snapshot:", err)
    );

    await logEvent(
      "Update",
      `Applied benchmark "${benchmark.category}" to risk ID ${riskId}`,
      req.userId!,
      req.organizationId!
    );

    // Return the updated risk
    const updatedRisk = await getRiskByIdQuery(riskId, req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](updatedRisk));
  } catch (error) {
    logStructured(
      "error",
      `failed to apply benchmark ${benchmarkId} to risk ${riskId}`,
      "applyBenchmark",
      "quantitativeRisk.ctrl.ts"
    );
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * PUT /api/quantitative-risks/assessment-mode
 * Toggle organization's risk assessment mode (Admin only).
 */
export async function updateRiskAssessmentMode(
  req: Request,
  res: Response
): Promise<any> {
  const { mode } = req.body;

  if (mode !== "qualitative" && mode !== "quantitative") {
    return res
      .status(400)
      .json(
        STATUS_CODE[400]("Mode must be 'qualitative' or 'quantitative'")
      );
  }

  logStructured(
    "processing",
    `updating risk assessment mode to: ${mode}`,
    "updateRiskAssessmentMode",
    "quantitativeRisk.ctrl.ts"
  );

  try {
    // Check if user is Admin
    const userResult = await sequelize.query<{ role_id: number }>(
      `SELECT role_id FROM users WHERE id = :userId AND organization_id = :organizationId`,
      {
        replacements: {
          userId: req.userId!,
          organizationId: req.organizationId!,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (!userResult[0] || userResult[0].role_id !== 1) {
      return res
        .status(403)
        .json(STATUS_CODE[403]("Only admins can change risk assessment mode"));
    }

    await sequelize.query(
      `UPDATE organizations SET risk_assessment_mode = :mode WHERE id = :organizationId`,
      {
        replacements: {
          mode,
          organizationId: req.organizationId!,
        },
      }
    );

    await logEvent(
      "Update",
      `Risk assessment mode changed to ${mode}`,
      req.userId!,
      req.organizationId!
    );

    return res.status(200).json(STATUS_CODE[200]({ risk_assessment_mode: mode }));
  } catch (error) {
    logStructured(
      "error",
      "failed to update risk assessment mode",
      "updateRiskAssessmentMode",
      "quantitativeRisk.ctrl.ts"
    );
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/quantitative-risks/assessment-mode
 * Get the current org's risk assessment mode.
 */
export async function getRiskAssessmentMode(
  req: Request,
  res: Response
): Promise<any> {
  try {
    const result = await sequelize.query<{ risk_assessment_mode: string }>(
      `SELECT risk_assessment_mode FROM organizations WHERE id = :organizationId`,
      {
        replacements: { organizationId: req.organizationId! },
        type: QueryTypes.SELECT,
      }
    );

    const mode = result[0]?.risk_assessment_mode || "qualitative";
    return res.status(200).json(STATUS_CODE[200]({ risk_assessment_mode: mode }));
  } catch (error) {
    logStructured(
      "error",
      "failed to get risk assessment mode",
      "getRiskAssessmentMode",
      "quantitativeRisk.ctrl.ts"
    );
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
