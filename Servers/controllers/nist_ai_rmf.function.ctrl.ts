import { Request, Response } from "express";
import logger, { logStructured } from "../utils/logger/fileLogger";
import {
  getAllNISTAIRMFfunctionsQuery,
  getNISTAIRMFfunctionByIdQuery,
} from "../utils/nist_ai_rmf.function.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logEvent } from "../utils/logger/dbLogger";

export async function getAllNISTAIRMFfunctions(
  req: Request,
  res: Response
): Promise<any> {
  logStructured(
    "processing",
    "starting to get all NIST AI RMF functions",
    "getAllNISTAIRMFfunctions",
    "nist_ai_rmf.function.ctrl.ts"
  );
  logger.debug("🔍 Fetching all NIST AI RMF functions");

  try {
    const functions = await getAllNISTAIRMFfunctionsQuery(req.organizationId!);
    if (functions && functions.length > 0) {
      logStructured(
        "successful",
        `retrieved ${functions.length} NIST AI RMF functions`,
        "getAllNISTAIRMFfunctions",
        "nist_ai_rmf.function.ctrl.ts"
      );
      return res.status(200).json(STATUS_CODE[200](functions));
    }
    // Return empty array instead of error for no functions
    return res.status(200).json(STATUS_CODE[200]([]));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve NIST AI RMF functions",
      "getAllNISTAIRMFfunctions",
      "nist_ai_rmf.function.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Failed to retrieve NIST AI RMF functions: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    logger.error("❌ Error in getAllNISTAIRMFfunctions:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getNISTAIRMFfunctionById(req: Request, res: Response) {
  // The :id param can be a function name (GOVERN, MAP, etc.) or a legacy numeric ID
  const functionParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  logStructured(
    "processing",
    `starting to get NIST AI RMF function: ${functionParam}`,
    "getNISTAIRMFfunctionById",
    "nist_ai_rmf.function.ctrl.ts"
  );
  logger.debug(`🔍 Fetching NIST AI RMF function: ${functionParam}`);
  try {
    // Try to get function by name (e.g., "GOVERN", "MAP")
    const functionName = functionParam.toUpperCase();
    const nistAiRmfFunction = await getNISTAIRMFfunctionByIdQuery(
      functionName,
      req.organizationId!
    );
    if (nistAiRmfFunction) {
      logStructured(
        "successful",
        `retrieved NIST AI RMF function: ${functionParam}`,
        "getNISTAIRMFfunctionById",
        "nist_ai_rmf.function.ctrl.ts"
      );
      return res.status(200).json(STATUS_CODE[200](nistAiRmfFunction));
    }
    logStructured(
      "error",
      `no NIST AI RMF function found: ${functionParam}`,
      "getNISTAIRMFfunctionById",
      "nist_ai_rmf.function.ctrl.ts"
    );
    return res.status(404).json(STATUS_CODE[404](nistAiRmfFunction));
  } catch (error) {
    logStructured(
      "error",
      `failed to retrieve NIST AI RMF function: ${functionParam}`,
      "getNISTAIRMFfunctionById",
      "nist_ai_rmf.function.ctrl.ts"
    );
    await logEvent(
      "Error",
      `Failed to retrieve NIST AI RMF function: ${functionParam}`,
      req.userId!,
      req.organizationId!
    );
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
