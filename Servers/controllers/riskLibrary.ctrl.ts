import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  searchRiskLibraryQuery,
  getRiskLibraryEntryByIdQuery,
  getRiskLibraryFiltersQuery,
  getRiskLibraryStatsQuery,
} from "../utils/riskLibrary.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";

const fileName = "riskLibrary.ctrl.ts";

/**
 * Search/list risk library entries with multi-dimensional filters.
 * GET /api/risk-library
 */
export const searchRiskLibrary = async (req: Request, res: Response) => {
  const functionName = "searchRiskLibrary";

  logStructured("processing", "searching risk library", functionName, fileName);

  try {
    const {
      search,
      source,
      risk_type,
      risk_source,
      domain,
      eu_ai_act_tier,
      severity,
      likelihood,
      industry,
      lifecycle_phase,
      model_type,
      page,
      limit,
    } = req.query;

    const result = await searchRiskLibraryQuery({
      search: search as string | undefined,
      source: source as string | undefined,
      risk_type: risk_type as string | undefined,
      risk_source: risk_source as string | undefined,
      domain: domain as string | undefined,
      eu_ai_act_tier: eu_ai_act_tier as string | undefined,
      severity: severity as string | undefined,
      likelihood: likelihood as string | undefined,
      industry: industry as string | undefined,
      lifecycle_phase: lifecycle_phase as string | undefined,
      model_type: model_type as string | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    logStructured(
      "successful",
      `found ${result.pagination.total} risk library entries`,
      functionName,
      fileName
    );

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured(
      "error",
      `failed to search risk library: ${(error as Error).message}`,
      functionName,
      fileName
    );
    logger.error("Error in searchRiskLibrary:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * Get a single risk library entry by ID with mitigations, incidents, org customizations, and feedback.
 * GET /api/risk-library/:id
 */
export const getRiskLibraryEntry = async (req: Request, res: Response) => {
  const functionName = "getRiskLibraryEntry";

  logStructured("processing", "fetching risk library entry", functionName, fileName);

  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);
    if (!Number.isSafeInteger(id)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid entry ID"));
    }

    const result = await getRiskLibraryEntryByIdQuery(
      id,
      req.organizationId!,
      req.userId!
    );

    if (!result) {
      return res.status(404).json(STATUS_CODE[404]("Risk library entry not found"));
    }

    logStructured(
      "successful",
      `fetched risk library entry ${id}`,
      functionName,
      fileName
    );

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured(
      "error",
      `failed to fetch risk library entry: ${(error as Error).message}`,
      functionName,
      fileName
    );
    logger.error("Error in getRiskLibraryEntry:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * Get distinct filter values for all taxonomy dimensions.
 * GET /api/risk-library/filters
 */
export const getRiskLibraryFilters = async (_req: Request, res: Response) => {
  const functionName = "getRiskLibraryFilters";

  logStructured("processing", "fetching risk library filters", functionName, fileName);

  try {
    const filters = await getRiskLibraryFiltersQuery();

    logStructured("successful", "fetched risk library filters", functionName, fileName);

    return res.status(200).json(STATUS_CODE[200](filters));
  } catch (error) {
    logStructured(
      "error",
      `failed to fetch risk library filters: ${(error as Error).message}`,
      functionName,
      fileName
    );
    logger.error("Error in getRiskLibraryFilters:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * Get library statistics (counts by source, risk_type, domain, severity, eu_ai_act_tier).
 * GET /api/risk-library/stats
 */
export const getRiskLibraryStats = async (_req: Request, res: Response) => {
  const functionName = "getRiskLibraryStats";

  logStructured("processing", "fetching risk library stats", functionName, fileName);

  try {
    const stats = await getRiskLibraryStatsQuery();

    logStructured("successful", "fetched risk library stats", functionName, fileName);

    return res.status(200).json(STATUS_CODE[200](stats));
  } catch (error) {
    logStructured(
      "error",
      `failed to fetch risk library stats: ${(error as Error).message}`,
      functionName,
      fileName
    );
    logger.error("Error in getRiskLibraryStats:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};
