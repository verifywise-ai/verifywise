import { Request, Response } from "express";
import {
  getTimeseriesForTimeframe,
  getTimeseriesWithInterpolation,
  getCurrentParameterCounts,
  recordHistorySnapshot,
} from "../utils/history/riskHistory.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";

/**
 * Get timeseries data for a specific parameter
 * Query params:
 * - parameter: string (required) - The parameter to track (e.g., 'severity', 'likelihood', 'mitigation_status', 'risk_level')
 * - timeframe: string (optional) - One of: '7days', '15days', '1month', '3months', '6months', '1year'
 * - startDate: string (optional) - Custom start date (ISO format)
 * - endDate: string (optional) - Custom end date (ISO format)
 * - intervalHours: number (optional) - Interval in hours for data points (default: 24)
 */
export async function getTimeseries(req: Request, res: Response) {
  logStructured(
    "processing",
    "starting getTimeseries",
    "getTimeseries",
    "riskHistory.ctrl.ts"
  );
  logger.debug("🔍 Fetching timeseries data for risks");

  try {
    const parameter = req.query.parameter as string;

    if (!parameter) {
      logStructured(
        "error",
        "parameter is required",
        "getTimeseries",
        "riskHistory.ctrl.ts"
      );
      return res.status(400).json(STATUS_CODE[400]("Parameter is required"));
    }

    // Validate parameter is one of the allowed values
    const validParameters = ['severity', 'likelihood', 'mitigation_status', 'risk_level'];
    if (!validParameters.includes(parameter)) {
      logStructured(
        "error",
        "invalid parameter",
        "getTimeseries",
        "riskHistory.ctrl.ts"
      );
      return res.status(400).json(
        STATUS_CODE[400](`Invalid parameter. Must be one of: ${validParameters.join(', ')}`)
      );
    }

    let timeseriesData;

    // Check if using timeframe or custom date range
    if (req.query.timeframe) {
      const timeframe = req.query.timeframe as string;
      const validTimeframes = ['7days', '15days', '1month', '3months', '6months', '1year'];

      if (!validTimeframes.includes(timeframe)) {
        logStructured(
          "error",
          "invalid timeframe",
          "getTimeseries",
          "riskHistory.ctrl.ts"
        );
        return res.status(400).json(
          STATUS_CODE[400](`Invalid timeframe. Must be one of: ${validTimeframes.join(', ')}`)
        );
      }

      timeseriesData = await getTimeseriesForTimeframe(
        parameter,
        timeframe as '7days' | '15days' | '1month' | '3months' | '6months' | '1year',
        req.organizationId!
      );
    } else if (req.query.startDate && req.query.endDate) {
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);
      const intervalHours = req.query.intervalHours
        ? parseInt(req.query.intervalHours as string, 10)
        : 24;

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        logStructured(
          "error",
          "invalid date format",
          "getTimeseries",
          "riskHistory.ctrl.ts"
        );
        return res.status(400).json(
          STATUS_CODE[400]("Invalid date format. Use ISO date format.")
        );
      }

      if (startDate >= endDate) {
        logStructured(
          "error",
          "start date must be before end date",
          "getTimeseries",
          "riskHistory.ctrl.ts"
        );
        return res.status(400).json(
          STATUS_CODE[400]("Start date must be before end date")
        );
      }

      timeseriesData = await getTimeseriesWithInterpolation(
        parameter,
        startDate,
        endDate,
        req.organizationId!,
        intervalHours
      );
    } else {
      // Default to 7 days
      timeseriesData = await getTimeseriesForTimeframe(parameter, '7days', req.organizationId!);
    }

    logStructured(
      "successful",
      `timeseries data fetched for parameter ${parameter}`,
      "getTimeseries",
      "riskHistory.ctrl.ts"
    );

    return res.status(200).json(
      STATUS_CODE[200]({
        parameter,
        data: timeseriesData,
        count: timeseriesData.length,
      })
    );
  } catch (error) {
    logStructured(
      "error",
      "error fetching timeseries data",
      "getTimeseries",
      "riskHistory.ctrl.ts",
    );
    logger.error("❌ Error fetching timeseries data:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get current parameter counts
 * Query params:
 * - parameter: string (required) - The parameter to get counts for
 */
export async function getCurrentCounts(req: Request, res: Response) {
  logStructured(
    "processing",
    "starting getCurrentCounts",
    "getCurrentCounts",
    "riskHistory.ctrl.ts"
  );
  logger.debug("🔍 Fetching current parameter counts");

  try {
    const parameter = req.query.parameter as string;

    if (!parameter) {
      logStructured(
        "error",
        "parameter is required",
        "getCurrentCounts",
        "riskHistory.ctrl.ts"
      );
      return res.status(400).json(STATUS_CODE[400]("Parameter is required"));
    }

    // Validate parameter is one of the allowed values
    const validParameters = ['severity', 'likelihood', 'mitigation_status', 'risk_level'];
    if (!validParameters.includes(parameter)) {
      logStructured(
        "error",
        "invalid parameter",
        "getCurrentCounts",
        "riskHistory.ctrl.ts"
      );
      return res.status(400).json(
        STATUS_CODE[400](`Invalid parameter. Must be one of: ${validParameters.join(', ')}`)
      );
    }

    const counts = await getCurrentParameterCounts(parameter, req.organizationId!);

    logStructured(
      "successful",
      `current counts fetched for parameter ${parameter}`,
      "getCurrentCounts",
      "riskHistory.ctrl.ts"
    );

    return res.status(200).json(
      STATUS_CODE[200]({
        parameter,
        counts,
      })
    );
  } catch (error) {
    logStructured(
      "error",
      "error fetching current counts",
      "getCurrentCounts",
      "riskHistory.ctrl.ts",
    );
    logger.error("❌ Error fetching current counts:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Manually trigger a history snapshot
 * Body params:
 * - parameter: string (required) - The parameter to snapshot
 * Note: The snapshot counts will be automatically stored in snapshot_data as JSONB
 */
export async function createSnapshot(req: Request, res: Response) {
  logStructured(
    "processing",
    "starting createSnapshot",
    "createSnapshot",
    "riskHistory.ctrl.ts"
  );
  logger.debug("📸 Creating manual history snapshot");

  try {
    const { parameter } = req.body;

    if (!parameter) {
      logStructured(
        "error",
        "parameter is required",
        "createSnapshot",
        "riskHistory.ctrl.ts"
      );
      return res.status(400).json(STATUS_CODE[400]("Parameter is required"));
    }

    // Validate parameter is one of the allowed values
    const validParameters = ['severity', 'likelihood', 'mitigation_status', 'risk_level'];
    if (!validParameters.includes(parameter)) {
      logStructured(
        "error",
        "invalid parameter",
        "createSnapshot",
        "riskHistory.ctrl.ts"
      );
      return res.status(400).json(
        STATUS_CODE[400](`Invalid parameter. Must be one of: ${validParameters.join(', ')}`)
      );
    }

    const userId = req.userId!;
    const snapshot = await recordHistorySnapshot(parameter, req.organizationId!, userId);

    logStructured(
      "successful",
      `snapshot created for parameter ${parameter}`,
      "createSnapshot",
      "riskHistory.ctrl.ts"
    );

    return res.status(201).json(
      STATUS_CODE[201](snapshot.toJSON())
    );
  } catch (error) {
    logStructured(
      "error",
      "error creating snapshot",
      "createSnapshot",
      "riskHistory.ctrl.ts",
    );
    logger.error("❌ Error creating snapshot:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
