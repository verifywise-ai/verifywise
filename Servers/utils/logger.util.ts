import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import * as fs from "fs";
import * as path from "path";

/**
 * Get event logs for an organization
 *
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<any[]>} Array of event logs
 */
export const getEventsQuery = async (organizationId: number) => {
  const events = await sequelize.query(
    `SELECT * FROM event_logs
     WHERE organization_id = :organization_id
     ORDER BY timestamp DESC`,
    {
      replacements: { organization_id: organizationId },
      type: QueryTypes.SELECT,
    }
  );
  return events;
};

/**
 * Get file-based logs for an organization
 *
 * @param {number} organizationId - Organization ID (used for log directory)
 * @returns {Promise<object>} Log file contents or error
 */
export const getLogsQuery = async (organizationId: number) => {
  try {
    // Get current date in YYYY-MM-DD format (UTC to match the logger)
    const currentDate = new Date().toISOString().split("T")[0];
    const logFileName = `app-${currentDate}.log`;
    const logFilePath = path.join(
      __dirname,
      "..",
      "..",
      "logs",
      String(organizationId),
      logFileName
    );

    // Check if the log file exists
    if (!fs.existsSync(logFilePath)) {
      return {
        success: false,
        message: `Log file for today (${currentDate}) not found`,
        data: null,
      };
    }

    // Read the entire file
    const fileContent = fs.readFileSync(logFilePath, "utf8");
    const lines = fileContent.split("\n").filter((line) => line.trim() !== "");

    // Get the last 500 lines (or all lines if less than 500)
    const lastLines = lines.slice(-500);

    return {
      success: true,
      message: `Successfully read last ${lastLines.length} lines`,
      data: lastLines,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error reading log file: ${error instanceof Error ? error.message : "Unknown error"}`,
      data: null,
    };
  }
};
