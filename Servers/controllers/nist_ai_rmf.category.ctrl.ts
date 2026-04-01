import { Request, Response } from "express";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { getAllNISTAIRMFCategoriesBytitleQuery } from "../utils/nist_ai_rmf.category.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logEvent } from "../utils/logger/dbLogger";

export async function getAllNISTAIRMFCategoriesByfunctionId(
  req: Request,
  res: Response
): Promise<any> {
  logStructured(
    "processing",
    "starting to get all NIST AI RMF categories by function ID",
    "getAllNISTAIRMFCategoriesByfunctionId",
    "nist_ai_rmf.category.ctrl.ts"
  );
  logger.debug("🔍 Fetching all NIST AI RMF categories by function ID");
  try {
    const categories = await getAllNISTAIRMFCategoriesBytitleQuery(
      Array.isArray(req.params.title) ? req.params.title[0] : req.params.title,
      req.organizationId!
    );
    if (categories && categories.length > 0) {
      logStructured(
        "successful",
        `retrieved ${categories.length} NIST AI RMF categories by function ID`,
        "getAllNISTAIRMFCategoriesByfunctionId",
        "nist_ai_rmf.category.ctrl.ts"
      );
      return res.status(200).json(STATUS_CODE[200](categories));
    }
    logStructured(
      "error",
      "no NIST AI RMF categories found by function ID",
      "getAllNISTAIRMFCategoriesByfunctionId",
      "nist_ai_rmf.category.ctrl.ts"
    );
    return res.status(404).json(STATUS_CODE[404](categories));
  } catch (error) {
    await logEvent(
      "Error",
      `Failed to retrieve NIST AI RMF categories by function ID: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    logger.error("❌ Error in getAllNISTAIRMFCategoriesByfunctionId:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
