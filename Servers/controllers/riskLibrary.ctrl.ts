import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { sequelize } from "../database/db";
import {
  searchRiskLibraryQuery,
  getRiskLibraryEntryByIdQuery,
  getRiskLibraryFiltersQuery,
  getRiskLibraryStatsQuery,
  upsertRiskLibraryFeedbackQuery,
  deleteRiskLibraryFeedbackQuery,
  getRiskLibraryFeedbackQuery,
  upsertRiskLibraryCustomizationQuery,
} from "../utils/riskLibrary.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import {
  generateRiskTaxonomy,
  generateRiskMitigations,
  generateRiskAssessment,
  submitGenerationFeedback,
} from "../services/riskLibraryAi.service";

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

// ========================================
// FEEDBACK HANDLERS
// ========================================

/**
 * Submit feedback (upvote/downvote/flag) on a risk library entry.
 * POST /api/risk-library/:id/feedback
 */
export const submitRiskLibraryFeedback = async (req: Request, res: Response) => {
  const functionName = "submitRiskLibraryFeedback";

  logStructured("processing", "submitting risk library feedback", functionName, fileName);

  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);
    if (!Number.isSafeInteger(id)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid entry ID"));
    }

    const { feedback_type, flag_reason, context } = req.body;

    if (!feedback_type || !["upvote", "downvote", "flag"].includes(feedback_type)) {
      return res
        .status(400)
        .json(STATUS_CODE[400]("feedback_type must be one of: upvote, downvote, flag"));
    }

    if (feedback_type === "flag" && !flag_reason) {
      return res
        .status(400)
        .json(STATUS_CODE[400]("flag_reason is required when feedback_type is flag"));
    }

    const result = await upsertRiskLibraryFeedbackQuery(
      req.organizationId!,
      req.userId!,
      id,
      feedback_type,
      flag_reason,
      context ? JSON.stringify(context) : null
    );

    logStructured(
      "successful",
      `submitted feedback for entry ${id}: ${feedback_type}`,
      functionName,
      fileName
    );

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured(
      "error",
      `failed to submit feedback: ${(error as Error).message}`,
      functionName,
      fileName
    );
    logger.error("Error in submitRiskLibraryFeedback:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * Remove feedback for a user on a risk library entry.
 * DELETE /api/risk-library/:id/feedback
 */
export const removeRiskLibraryFeedback = async (req: Request, res: Response) => {
  const functionName = "removeRiskLibraryFeedback";

  logStructured("processing", "removing risk library feedback", functionName, fileName);

  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);
    if (!Number.isSafeInteger(id)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid entry ID"));
    }

    const deleted = await deleteRiskLibraryFeedbackQuery(
      req.organizationId!,
      req.userId!,
      id
    );

    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404]("No feedback found to remove"));
    }

    logStructured(
      "successful",
      `removed feedback for entry ${id}`,
      functionName,
      fileName
    );

    return res
      .status(200)
      .json(STATUS_CODE[200]({ message: "Feedback removed successfully" }));
  } catch (error) {
    logStructured(
      "error",
      `failed to remove feedback: ${(error as Error).message}`,
      functionName,
      fileName
    );
    logger.error("Error in removeRiskLibraryFeedback:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * Get aggregated feedback for a risk library entry.
 * GET /api/risk-library/:id/feedback
 */
export const getRiskLibraryFeedback = async (req: Request, res: Response) => {
  const functionName = "getRiskLibraryFeedback";

  logStructured("processing", "fetching risk library feedback", functionName, fileName);

  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);
    if (!Number.isSafeInteger(id)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid entry ID"));
    }

    const result = await getRiskLibraryFeedbackQuery(
      id,
      req.organizationId!,
      req.userId!
    );

    logStructured(
      "successful",
      `fetched feedback for entry ${id}`,
      functionName,
      fileName
    );

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured(
      "error",
      `failed to fetch feedback: ${(error as Error).message}`,
      functionName,
      fileName
    );
    logger.error("Error in getRiskLibraryFeedback:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

// ========================================
// ORG CUSTOMIZATION HANDLERS
// ========================================

/**
 * Upsert org-specific customization for a risk library entry.
 * PUT /api/risk-library/:id/customize
 */
export const upsertRiskLibraryCustomization = async (req: Request, res: Response) => {
  const functionName = "upsertRiskLibraryCustomization";

  const transaction = await sequelize.transaction();

  logStructured(
    "processing",
    "upserting risk library customization",
    functionName,
    fileName
  );

  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);
    if (!Number.isSafeInteger(id)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid entry ID"));
    }

    const { custom_mitigations, custom_notes, is_hidden } = req.body;

    const result = await upsertRiskLibraryCustomizationQuery(
      req.organizationId!,
      id,
      { custom_mitigations, custom_notes, is_hidden },
      transaction
    );

    await transaction.commit();

    logStructured(
      "successful",
      `upserted customization for entry ${id}`,
      functionName,
      fileName
    );

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    await transaction.rollback();
    logStructured(
      "error",
      `failed to upsert customization: ${(error as Error).message}`,
      functionName,
      fileName
    );
    logger.error("Error in upsertRiskLibraryCustomization:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

// ========================================
// AI GENERATION HANDLERS
// ========================================

/**
 * Generate risk taxonomy for an industry/use case.
 * POST /api/risk-library/generate/taxonomy
 */
export const generateTaxonomy = async (req: Request, res: Response) => {
  const functionName = "generateTaxonomy";

  logStructured("processing", "generating risk taxonomy", functionName, fileName);

  try {
    const { industry, use_case, ai_system_type, lifecycle_phase, project_description, existing_risks, llm_key_id } = req.body;

    if (!industry || !use_case) {
      return res.status(400).json(STATUS_CODE[400]("industry and use_case are required"));
    }
    if (!llm_key_id) {
      return res.status(400).json(STATUS_CODE[400]("llm_key_id is required"));
    }

    const result = await generateRiskTaxonomy(
      { industry, use_case, ai_system_type, lifecycle_phase, project_description, existing_risks },
      llm_key_id,
      req.organizationId!,
      req.userId!
    );

    logStructured(
      "successful",
      `generated ${result.risks.length} risks for taxonomy`,
      functionName,
      fileName
    );

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured(
      "error",
      `failed to generate taxonomy: ${(error as Error).message}`,
      functionName,
      fileName
    );
    logger.error("Error in generateTaxonomy:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * Generate mitigations for a specific risk.
 * POST /api/risk-library/generate/mitigations
 */
export const generateMitigations = async (req: Request, res: Response) => {
  const functionName = "generateMitigations";

  logStructured("processing", "generating risk mitigations", functionName, fileName);

  try {
    const { risk_summary, risk_description, risk_category, severity, industry, existing_mitigations, llm_key_id } = req.body;

    if (!risk_summary || !risk_description) {
      return res.status(400).json(STATUS_CODE[400]("risk_summary and risk_description are required"));
    }
    if (!llm_key_id) {
      return res.status(400).json(STATUS_CODE[400]("llm_key_id is required"));
    }

    const result = await generateRiskMitigations(
      { risk_summary, risk_description, risk_category, severity, industry, existing_mitigations },
      llm_key_id,
      req.organizationId!,
      req.userId!
    );

    logStructured(
      "successful",
      `generated ${result.mitigations.length} mitigations`,
      functionName,
      fileName
    );

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured(
      "error",
      `failed to generate mitigations: ${(error as Error).message}`,
      functionName,
      fileName
    );
    logger.error("Error in generateMitigations:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * Generate a full risk assessment for a use case.
 * POST /api/risk-library/generate/assessment
 */
export const generateAssessment = async (req: Request, res: Response) => {
  const functionName = "generateAssessment";

  logStructured("processing", "generating risk assessment", functionName, fileName);

  try {
    const { use_case, industry, project_description, model_type, lifecycle_phase, llm_key_id } = req.body;

    if (!use_case || !industry) {
      return res.status(400).json(STATUS_CODE[400]("use_case and industry are required"));
    }
    if (!llm_key_id) {
      return res.status(400).json(STATUS_CODE[400]("llm_key_id is required"));
    }

    const result = await generateRiskAssessment(
      { use_case, industry, project_description, model_type, lifecycle_phase },
      llm_key_id,
      req.organizationId!,
      req.userId!
    );

    logStructured(
      "successful",
      `generated risk assessment with ${result.assessment.risks.length} risks`,
      functionName,
      fileName
    );

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured(
      "error",
      `failed to generate assessment: ${(error as Error).message}`,
      functionName,
      fileName
    );
    logger.error("Error in generateAssessment:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * Submit feedback on an AI generation.
 * POST /api/risk-library/generations/:id/feedback
 */
export const submitGenFeedback = async (req: Request, res: Response) => {
  const functionName = "submitGenFeedback";

  logStructured("processing", "submitting generation feedback", functionName, fileName);

  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam, 10);
    if (!Number.isSafeInteger(id)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid generation ID"));
    }

    const { feedback_type } = req.body;
    if (!feedback_type || !["upvote", "downvote", "flag"].includes(feedback_type)) {
      return res
        .status(400)
        .json(STATUS_CODE[400]("feedback_type must be one of: upvote, downvote, flag"));
    }

    await submitGenerationFeedback(id, req.organizationId!, feedback_type);

    logStructured(
      "successful",
      `submitted feedback for generation ${id}: ${feedback_type}`,
      functionName,
      fileName
    );

    return res.status(200).json(STATUS_CODE[200]({ message: "Feedback submitted" }));
  } catch (error) {
    logStructured(
      "error",
      `failed to submit generation feedback: ${(error as Error).message}`,
      functionName,
      fileName
    );
    logger.error("Error in submitGenFeedback:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};
