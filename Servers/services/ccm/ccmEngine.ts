import { sequelize } from "../../database/db";
import { CcmConnectorModel } from "../../domain.layer/models/ccmConnector/ccmConnector.model";
import { CcmControlTestModel } from "../../domain.layer/models/ccmControlTest/ccmControlTest.model";
import { CcmTestResultModel } from "../../domain.layer/models/ccmTestResult/ccmTestResult.model";
import { CcmControlHealthModel } from "../../domain.layer/models/ccmControlHealth/ccmControlHealth.model";
import { CcmAlertModel } from "../../domain.layer/models/ccmAlert/ccmAlert.model";
import { createConnector } from "./connectors";
import { uploadFile } from "../../utils/fileUpload.utils";
import logger from "../../utils/logger/fileLogger";
import { QueryTypes } from "sequelize";

/**
 * CCM Engine — Continuous Control Monitoring core service
 *
 * Responsibilities:
 * - Run individual control tests via connectors
 * - Store test results and automated evidence
 * - Calculate control health aggregates
 * - Generate alerts for failed tests
 */

interface RunTestOptions {
  testId: number;
  organizationId: number;
}

/**
 * Execute a single control test
 */
export async function runTest(options: RunTestOptions): Promise<void> {
  const { testId, organizationId } = options;
  const startTime = Date.now();

  const test = await CcmControlTestModel.findOne({
    where: { id: testId, organization_id: organizationId },
  });

  if (!test) {
    logger.error(`CCM test ${testId} not found for org ${organizationId}`);
    return;
  }

  const connector = await CcmConnectorModel.findOne({
    where: { id: test.connector_id, organization_id: organizationId },
  });

  if (!connector) {
    logger.error(`CCM connector ${test.connector_id} not found for org ${organizationId}`);
    return;
  }

  if (connector.status !== "active") {
    logger.warn(`Skipping test ${testId}: connector ${connector.id} is ${connector.status}`);
    return;
  }

  const connectorInstance = createConnector(connector.type);
  await connectorInstance.initialize(connector.config);

  let result;
  let evidenceFileId: number | undefined;

  try {
    result = await connectorInstance.executeTest(test.test_config);
  } catch (error) {
    result = {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Test execution crashed",
      details: { stack: error instanceof Error ? error.stack : undefined },
    };
  } finally {
    await connectorInstance.disconnect();
  }

  const durationMs = Date.now() - startTime;

  // Store evidence file if provided
  if (result.evidence) {
    try {
      const uploaded = await uploadFile(
        {
          originalname: result.evidence.filename,
          buffer: result.evidence.content,
          mimetype: result.evidence.mimeType,
          fieldname: "evidence",
        } as any,
        connector.created_by || 0,
        null, // project_id — CCM evidence is org-level
        "CCM automated evidence",
        organizationId,
      );
      evidenceFileId = (uploaded as any).id;

      // Link to subcontrol if mapped
      if (test.subcontrol_id) {
        await sequelize.query(
          `INSERT INTO file_entity_links
            (organization_id, file_id, framework_type, entity_type, entity_id, link_type, created_by, created_at)
           VALUES (:organizationId, :fileId, :frameworkType, 'subcontrol', :subcontrolId, 'evidence', :createdBy, NOW())
           ON CONFLICT (file_id, framework_type, entity_type, entity_id) DO NOTHING`,
          {
            replacements: {
              organizationId,
              fileId: evidenceFileId,
              frameworkType: test.framework_type,
              subcontrolId: test.subcontrol_id,
              createdBy: connector.created_by || 0,
            },
          },
        );
      }
    } catch (err) {
      logger.error(`Failed to store CCM evidence for test ${testId}:`, err);
    }
  }

  // Store test result
  const testResult = await CcmTestResultModel.create({
    organization_id: organizationId,
    test_id: testId,
    connector_id: connector.id!,
    status: result.status,
    details_json: {
      message: result.message,
      details: result.details,
    },
    evidence_file_id: evidenceFileId,
    executed_at: new Date(),
    duration_ms: durationMs,
  } as any);

  // Update test last_run_at and next_run_at
  const nextRunAt = computeNextRunAt(test.schedule_cron);
  await test.update({ last_run_at: new Date(), next_run_at: nextRunAt });

  // Update control health
  await updateControlHealth(test, result.status);

  // Create alert if failed
  if (result.status === "fail" || result.status === "error") {
    await createAlert(test, testResult, result.message);
  }

  logger.info(`CCM test ${testId} completed: ${result.status} (${durationMs}ms)`);
}

/**
 * Run all tests that are due (next_run_at <= now)
 */
export async function runAllDueTests(): Promise<void> {
  const dueTests = await sequelize.query<
    { id: number; organization_id: number }[]
  >(
    `SELECT id, organization_id FROM ccm_control_tests
     WHERE is_active = TRUE
       AND (next_run_at IS NULL OR next_run_at <= NOW())`,
    { type: QueryTypes.SELECT },
  );

  logger.info(`CCM: Running ${dueTests.length} due tests`);

  for (const test of dueTests as any) {
    try {
      await runTest({ testId: test.id, organizationId: test.organization_id });
    } catch (error) {
      logger.error(`CCM test ${test.id} failed:`, error);
    }
  }
}

/**
 * Test all active connectors and update their health status
 */
export async function runConnectorHealthChecks(): Promise<void> {
  const connectors = await CcmConnectorModel.findAll({
    where: { status: "active" },
  });

  for (const connector of connectors) {
    try {
      const instance = createConnector(connector.type);
      await instance.initialize(connector.config);
      const result = await instance.testConnection();
      await instance.disconnect();

      await connector.update({
        last_tested_at: new Date(),
        last_test_status: result.success ? "success" : "failed",
        last_error_message: result.success ? undefined : result.message,
        status: result.success ? "active" : "error",
      });
    } catch (error) {
      await connector.update({
        last_tested_at: new Date(),
        last_test_status: "failed",
        last_error_message: error instanceof Error ? error.message : "Health check crashed",
        status: "error",
      });
    }
  }
}

/**
 * Update control health aggregate for a given test
 */
async function updateControlHealth(
  test: CcmControlTestModel,
  resultStatus: "pass" | "fail" | "error" | "not_tested",
): Promise<void> {
  const [health] = await CcmControlHealthModel.findOrCreate({
    where: {
      organization_id: test.organization_id,
      control_id: test.control_id,
      subcontrol_id: test.subcontrol_id || undefined,
      framework_type: test.framework_type,
    } as any,
    defaults: {
      organization_id: test.organization_id,
      control_id: test.control_id!,
      subcontrol_id: test.subcontrol_id || undefined,
      framework_type: test.framework_type,
      current_status: "not_tested",
      consecutive_passes: 0,
      consecutive_failures: 0,
      score: 0,
    } as any,
  });

  const isPass = resultStatus === "pass";
  const isFail = resultStatus === "fail" || resultStatus === "error";

  const consecutivePasses = isPass ? (health.consecutive_passes || 0) + 1 : 0;
  const consecutiveFailures = isFail ? (health.consecutive_failures || 0) + 1 : 0;

  let currentStatus: "pass" | "fail" | "warning" | "not_tested" = "not_tested";
  if (isPass) currentStatus = "pass";
  else if (isFail) currentStatus = consecutiveFailures >= 3 ? "fail" : "warning";

  // Score: 100 for pass, 50 for warning, 0 for fail/not_tested
  let score = 0;
  if (currentStatus === "pass") score = 100;
  else if (currentStatus === "warning") score = 50;

  await health.update({
    current_status: currentStatus,
    last_tested_at: new Date(),
    consecutive_passes: consecutivePasses,
    consecutive_failures: consecutiveFailures,
    score,
  });
}

/**
 * Create an alert for a failed test
 */
async function createAlert(
  test: CcmControlTestModel,
  testResult: CcmTestResultModel,
  message: string,
): Promise<void> {
  await CcmAlertModel.create({
    organization_id: test.organization_id,
    test_result_id: testResult.id!,
    control_id: test.control_id,
    subcontrol_id: test.subcontrol_id,
    severity: test.severity || "medium",
    status: "open",
    message: `[${test.name}] ${message}`,
  } as any);
}

/**
 * Compute next run time from a cron expression
 * Supports simple patterns: "0 star star star star" (hourly), "0 0 star star star" (daily), "star/15 star star star star" (every 15 min)
 */
function computeNextRunAt(cron: string): Date {
  const now = new Date();
  const parts = cron.split(" ");

  if (parts.length !== 5) {
    // Default to 1 hour if invalid
    return new Date(now.getTime() + 60 * 60 * 1000);
  }

  const [minute, hour, day] = parts;

  // Every N minutes: "*/15 * * * *"
  if (minute.startsWith("*/")) {
    const interval = parseInt(minute.replace("*/", ""), 10);
    const next = new Date(now);
    next.setMinutes(now.getMinutes() + interval, 0, 0);
    return next;
  }

  // Hourly: "0 * * * *"
  if (minute === "0" && hour === "*") {
    const next = new Date(now);
    next.setHours(now.getHours() + 1, 0, 0, 0);
    return next;
  }

  // Daily: "0 0 * * *"
  if (minute === "0" && hour === "0" && day === "*") {
    const next = new Date(now);
    next.setDate(now.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  // Default: 1 hour
  return new Date(now.getTime() + 60 * 60 * 1000);
}
