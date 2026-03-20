import { RiskHistoryModel } from "../../domain.layer/models/riskHistory/riskHistory.model";
import { sequelize } from "../../database/db";
import { Transaction, QueryTypes } from "sequelize";

/**
 * Record a snapshot of parameter counts in history
 */
export async function recordHistorySnapshot(
  parameter: string,
  organizationId: number,
  triggered_by_user_id?: number,
  transaction?: Transaction
): Promise<RiskHistoryModel> {
  try {
    // Get current counts for the parameter
    const snapshot_data = await getCurrentParameterCounts(
      parameter,
      organizationId,
      transaction
    );

    // Create history snapshot
    const recorded_at = new Date();
    const created_at = new Date();

    const result = await sequelize.query(
      `INSERT INTO risk_history (organization_id, parameter, snapshot_data, recorded_at, triggered_by_user_id, created_at)
       VALUES (:organizationId, :parameter, :snapshot_data, :recorded_at, :triggered_by_user_id, :created_at)
       RETURNING *`,
      {
        replacements: {
          organizationId,
          parameter,
          snapshot_data: JSON.stringify(snapshot_data),
          recorded_at,
          triggered_by_user_id: triggered_by_user_id || null,
          created_at,
        },
        mapToModel: true,
        model: RiskHistoryModel,
        transaction,
      }
    );

    return result[0];
  } catch (error) {
    console.error(
      `Error recording history snapshot for parameter ${parameter}:`,
      error
    );
    throw error;
  }
}

/**
 * Get current counts for a specific parameter across all risks
 */
export async function getCurrentParameterCounts(
  parameter: string,
  organizationId: number,
  transaction?: Transaction
): Promise<Record<string, number>> {
  try {
    const counts: Record<string, number> = {};

    if (parameter === "severity") {
      // Get counts for each severity level
      const severityCounts = (await sequelize.query(
        `SELECT severity, COUNT(*) as count
         FROM risks
         WHERE organization_id = :organizationId AND is_deleted = false
         GROUP BY severity`,
        {
          replacements: { organizationId },
          type: QueryTypes.SELECT,
          transaction,
        }
      )) as Array<{ severity: string; count: string }>;

      // Initialize all severity levels to 0
      const severityLevels = [
        "Negligible",
        "Minor",
        "Moderate",
        "Major",
        "Catastrophic",
      ];
      severityLevels.forEach((severity) => {
        counts[severity] = 0;
      });

      // Update with actual counts
      severityCounts.forEach((row) => {
        if (row.severity) {
          counts[row.severity] = parseInt(row.count, 10);
        }
      });
    } else if (parameter === "likelihood") {
      // Get counts for each likelihood level
      const likelihoodCounts = (await sequelize.query(
        `SELECT likelihood, COUNT(*) as count
         FROM risks
         WHERE organization_id = :organizationId AND is_deleted = false
         GROUP BY likelihood`,
        {
          replacements: { organizationId },
          type: QueryTypes.SELECT,
          transaction,
        }
      )) as Array<{ likelihood: string; count: string }>;

      // Initialize all likelihood levels to 0
      const likelihoodLevels = [
        "Rare",
        "Unlikely",
        "Possible",
        "Likely",
        "Almost Certain",
      ];
      likelihoodLevels.forEach((likelihood) => {
        counts[likelihood] = 0;
      });

      // Update with actual counts
      likelihoodCounts.forEach((row) => {
        if (row.likelihood) {
          counts[row.likelihood] = parseInt(row.count, 10);
        }
      });
    } else if (parameter === "mitigation_status") {
      // Get counts for each mitigation status
      const mitigationCounts = (await sequelize.query(
        `SELECT mitigation_status, COUNT(*) as count
         FROM risks
         WHERE organization_id = :organizationId AND is_deleted = false
         GROUP BY mitigation_status`,
        {
          replacements: { organizationId },
          type: QueryTypes.SELECT,
          transaction,
        }
      )) as Array<{ mitigation_status: string; count: string }>;

      // Initialize all mitigation statuses to 0
      const mitigationStatuses = [
        "Not Started",
        "In Progress",
        "Completed",
        "On Hold",
        "Deferred",
        "Canceled",
        "Requires review",
      ];
      mitigationStatuses.forEach((status) => {
        counts[status] = 0;
      });

      // Update with actual counts
      mitigationCounts.forEach((row) => {
        if (row.mitigation_status) {
          counts[row.mitigation_status] = parseInt(row.count, 10);
        }
      });
    } else if (parameter === "risk_level") {
      // Get counts for each risk level (using risk_level_autocalculated)
      const riskLevelCounts = (await sequelize.query(
        `SELECT risk_level_autocalculated, COUNT(*) as count
         FROM risks
         WHERE organization_id = :organizationId AND is_deleted = false
         GROUP BY risk_level_autocalculated`,
        {
          replacements: { organizationId },
          type: QueryTypes.SELECT,
          transaction,
        }
      )) as Array<{ risk_level_autocalculated: string; count: string }>;

      // Initialize all risk levels to 0
      const riskLevels = [
        "No risk",
        "Very low risk",
        "Low risk",
        "Medium risk",
        "High risk",
        "Very high risk",
      ];
      riskLevels.forEach((level) => {
        counts[level] = 0;
      });

      // Update with actual counts
      riskLevelCounts.forEach((row) => {
        if (row.risk_level_autocalculated) {
          counts[row.risk_level_autocalculated] = parseInt(row.count, 10);
        }
      });
    } else {
      // Generic handling for other parameters
      const paramCounts = (await sequelize.query(
        `SELECT ${parameter}, COUNT(*) as count
         FROM risks
         WHERE organization_id = :organizationId AND is_deleted = false
         GROUP BY ${parameter}`,
        {
          replacements: { organizationId },
          type: QueryTypes.SELECT,
          transaction,
        }
      )) as Array<{ [key: string]: any; count: string }>;

      paramCounts.forEach((row) => {
        const key = row[parameter] !== null ? String(row[parameter]) : "null";
        counts[key] = parseInt(row.count, 10);
      });
    }

    return counts;
  } catch (error) {
    console.error(
      `Error getting current parameter counts for ${parameter}:`,
      error
    );
    throw error;
  }
}

/**
 * Get timeseries data for a specific parameter within a date range
 */
export async function getTimeseriesData(
  parameter: string,
  _startDate: Date,
  endDate: Date,
  organizationId: number,
  transaction?: Transaction
): Promise<RiskHistoryModel[]> {
  try {
    // For proper interpolation, we need to include snapshots from before the start date
    // This allows us to use historical data for time points that don't have exact snapshots
    const snapshots = (await sequelize.query(
      `SELECT DISTINCT ON (recorded_at::date) *, recorded_at::date AS recorded_at_date
        FROM risk_history
        WHERE organization_id = :organizationId
          AND parameter = :parameter
          AND recorded_at <= :endDate
        ORDER BY recorded_at::date, recorded_at DESC;`,
      {
        replacements: {
          organizationId,
          parameter,
          endDate,
        },
        transaction,
      }
    )) as [RiskHistoryModel[], number];

    return snapshots[0];
  } catch (error) {
    console.error(`Error getting timeseries data:`, error);
    throw error;
  }
}

async function getTimeseriesDataAtATime(
  parameter: string,
  date: Date,
  organizationId: number,
  transaction?: Transaction
): Promise<RiskHistoryModel> {
  try {
    const snapshots = (await sequelize.query(
      `SELECT * FROM risk_history
        WHERE organization_id = :organizationId
        AND parameter = :parameter
        AND recorded_at::date < :date::date
        ORDER BY recorded_at DESC LIMIT 1`,
      {
        replacements: {
          organizationId,
          parameter,
          date,
        },
        transaction,
      }
    )) as [RiskHistoryModel[], number];

    return snapshots[0][0];
  } catch (error) {
    console.error(`Error getting timeseries data:`, error);
    throw error;
  }
}

/**
 * Get timeseries data with interpolation for missing time points
 */
export async function getTimeseriesWithInterpolation(
  parameter: string,
  startDate: Date,
  endDate: Date,
  organizationId: number,
  intervalHours: number = 24,
  transaction?: Transaction
): Promise<Array<{ timestamp: Date; data: Record<string, number> }>> {
  try {
    // Get actual snapshots from database
    // include endDate inclusive by adding one day without mutating original endDate
    const endDateInclusive = new Date(endDate);
    endDateInclusive.setDate(endDateInclusive.getDate() + 1);

    const snapshots = await getTimeseriesData(
      parameter,
      startDate,
      endDateInclusive,
      organizationId,
      transaction
    );

    if (snapshots.length === 0) {
      return [];
    }

    // Generate time points based on interval (date only, no time)
    const timePoints: Date[] = [];
    const currentTime = new Date(startDate);
    currentTime.setHours(0, 0, 0, 0); // Set to midnight

    const endDateMidnight = new Date(endDate);
    endDateMidnight.setHours(0, 0, 0, 0);

    while (currentTime <= endDateMidnight) {
      const datePoint = new Date(currentTime);
      datePoint.setHours(0, 0, 0, 0); // Ensure time is set to 00:00:00
      timePoints.push(datePoint);
      currentTime.setHours(currentTime.getHours() + intervalHours);
    }

    // Ensure the end date is always included as the last time point
    // This is important for weekly/monthly intervals where the end date might not align
    if (timePoints.length > 0) {
      const lastPoint = timePoints[timePoints.length - 1];
      if (lastPoint.getTime() !== endDateMidnight.getTime()) {
        timePoints.push(new Date(endDateMidnight));
      }
    }

    // Interpolate data for each time point
    const result: Array<{ timestamp: Date; data: Record<string, number> }> = [];
    let snapShotPointer = 0;

    for (const timePoint of timePoints) {
      // Find the most recent snapshot at or before this time point
      let mostRecentSnapshot = null;
      let mostRecentIndex = -1;

      for (let i = snapShotPointer; i < snapshots.length; i++) {
        const snapshotDate = new Date(snapshots[i].recorded_at);
        snapshotDate.setHours(0, 0, 0, 0); // Normalize to midnight

        if (snapshotDate.getTime() <= timePoint.getTime()) {
          // This snapshot is at or before the current time point
          mostRecentSnapshot = snapshots[i];
          mostRecentIndex = i;
        } else {
          // Snapshots are ordered chronologically, so we can stop here
          break;
        }
      }

      if (mostRecentSnapshot) {
        // Found a snapshot at or before this time point
        result.push({
          timestamp: timePoint,
          data: mostRecentSnapshot.snapshot_data,
        });
        // Move pointer past this snapshot for next iteration
        snapShotPointer = mostRecentIndex + 1;
      } else {
        // No snapshot found in the range
        if (result.length === 0) {
          // No previous data, fetch the latest snapshot before this time point
          const snapshotBefore = await getTimeseriesDataAtATime(
            parameter,
            timePoint,
            organizationId,
            transaction
          );
          if (snapshotBefore) {
            result.push({
              timestamp: timePoint,
              data: snapshotBefore.snapshot_data,
            });
          } else {
            // No data available at all before this time point
            result.push({
              timestamp: timePoint,
              data: {},
            });
          }
        } else {
          // Use last known data from previous time point
          const lastData = result[result.length - 1].data;
          result.push({
            timestamp: timePoint,
            data: lastData,
          });
        }
      }
    }

    return result;
  } catch (error) {
    console.error(`Error getting timeseries with interpolation:`, error);
    throw error;
  }
}

/**
 * Get timeseries data for a specific timeframe (helper function)
 */
export async function getTimeseriesForTimeframe(
  parameter: string,
  timeframe: "7days" | "15days" | "1month" | "3months" | "6months" | "1year",
  organizationId: number,
  transaction?: Transaction
): Promise<Array<{ timestamp: Date; data: Record<string, number> }>> {
  const endDate = new Date();
  const startDate = new Date();

  // Calculate start date based on timeframe
  switch (timeframe) {
    case "7days":
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "15days":
      startDate.setDate(startDate.getDate() - 15);
      break;
    case "1month":
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case "3months":
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case "6months":
      startDate.setMonth(startDate.getMonth() - 6);
      break;
    case "1year":
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
  }

  // Determine appropriate interval based on timeframe
  let intervalHours = 24; // default: daily
  if (timeframe === "3months" || timeframe === "6months") {
    intervalHours = 24 * 7; // weekly
  } else if (timeframe === "1year") {
    intervalHours = 24 * 30; // monthly
  }

  return await getTimeseriesWithInterpolation(
    parameter,
    startDate,
    endDate,
    organizationId,
    intervalHours,
    transaction
  );
}

/**
 * Get the latest snapshot for a specific parameter
 */
export async function getLatestSnapshot(
  parameter: string,
  organizationId: number,
  transaction?: Transaction
): Promise<RiskHistoryModel | null> {
  try {
    const snapshots = await sequelize.query(
      `SELECT * FROM risk_history
       WHERE organization_id = :organizationId AND parameter = :parameter
       ORDER BY recorded_at DESC
       LIMIT 1`,
      {
        replacements: { organizationId, parameter },
        mapToModel: true,
        model: RiskHistoryModel,
        transaction,
      }
    );

    return snapshots.length > 0 ? snapshots[0] : null;
  } catch (error) {
    console.error(`Error getting latest snapshot:`, error);
    throw error;
  }
}

/**
 * Get snapshot at a specific point in time (or closest before)
 */
export async function getSnapshotAtTime(
  parameter: string,
  timestamp: Date,
  organizationId: number,
  transaction?: Transaction
): Promise<RiskHistoryModel | null> {
  try {
    const snapshots = await sequelize.query(
      `SELECT * FROM risk_history
       WHERE organization_id = :organizationId AND parameter = :parameter
       AND recorded_at <= :timestamp
       ORDER BY recorded_at DESC
       LIMIT 1`,
      {
        replacements: {
          organizationId,
          parameter,
          timestamp,
        },
        mapToModel: true,
        model: RiskHistoryModel,
        transaction,
      }
    );

    return snapshots.length > 0 ? snapshots[0] : null;
  } catch (error) {
    console.error(`Error getting snapshot at time:`, error);
    throw error;
  }
}

/**
 * Check if a snapshot should be recorded (based on whether data has changed)
 */
export async function shouldRecordSnapshot(
  parameter: string,
  organizationId: number,
  transaction?: Transaction
): Promise<boolean> {
  try {
    const latestSnapshot = await getLatestSnapshot(
      parameter,
      organizationId,
      transaction
    );

    if (!latestSnapshot) {
      // No previous snapshot, should record
      return true;
    }

    const currentCounts = await getCurrentParameterCounts(
      parameter,
      organizationId,
      transaction
    );
    const previousCounts = latestSnapshot.snapshot_data;

    // Compare current and previous counts
    const currentKeys = Object.keys(currentCounts);
    const previousKeys = Object.keys(previousCounts);

    // Check if keys are different
    if (currentKeys.length !== previousKeys.length) {
      return true;
    }

    // Check if any values are different
    for (const key of currentKeys) {
      if (currentCounts[key] !== previousCounts[key]) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error(`Error checking if snapshot should be recorded:`, error);
    // In case of error, record to be safe
    return true;
  }
}

/**
 * Record snapshot only if data has changed
 */
export async function recordSnapshotIfChanged(
  parameter: string,
  organizationId: number,
  triggered_by_user_id?: number,
  transaction?: Transaction
): Promise<RiskHistoryModel | null> {
  const shouldRecord = await shouldRecordSnapshot(
    parameter,
    organizationId,
    transaction
  );

  if (shouldRecord) {
    return await recordHistorySnapshot(
      parameter,
      organizationId,
      triggered_by_user_id,
      transaction
    );
  }

  return null;
}
