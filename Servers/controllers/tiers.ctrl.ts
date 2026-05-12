import { Request, Response } from "express";
import { getTiersFeaturesQuery } from "../utils/tiers.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";

async function getTiersFeatures(req: Request, res: Response) {
  const tierId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logStructured("processing", "Fetching tiers features", "getTiersFeatures", "tiers.ctrl.ts");
  logger.debug("🔍 Fetching tiers features");

  try {
    const tiersFeatures = await getTiersFeaturesQuery(tierId);

    if (tiersFeatures) {
      logStructured(
        "successful",
        "Tiers features fetched successfully",
        "getTiersFeatures",
        "tiers.ctrl.ts",
      );
      return res.status(200).json(STATUS_CODE[200](tiersFeatures));
    }

    logStructured("error", "Tiers features not found", "getTiersFeatures", "tiers.ctrl.ts");
    return res.status(404).json(STATUS_CODE[404]({ message: req.t!("Tiers features not found") }));
  } catch (error) {
    logStructured(
      "error",
      `Error fetching tier with id: ${tierId}`,
      "getTiersFeatures",
      "tiers.ctrl.ts",
    );
    logger.error("❌ Error fetching tiers features:", error);
    return res.status(500).json(STATUS_CODE[500]({ message: req.t!("Internal server error") }));
  }
}

export { getTiersFeatures };
