/**
 * @fileoverview CCM Controller
 *
 * HTTP request handlers for Continuous Control Monitoring endpoints.
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { sequelize } from "../database/db";
import { CcmConnectorModel } from "../domain.layer/models/ccmConnector/ccmConnector.model";
import { CcmControlTestModel } from "../domain.layer/models/ccmControlTest/ccmControlTest.model";
import { CcmTestResultModel } from "../domain.layer/models/ccmTestResult/ccmTestResult.model";
import { CcmControlHealthModel } from "../domain.layer/models/ccmControlHealth/ccmControlHealth.model";
import { CcmAlertModel } from "../domain.layer/models/ccmAlert/ccmAlert.model";
import { createConnector as createConnectorInstance, getConnectorTypes } from "../services/ccm/connectors";
import { runTest } from "../services/ccm/ccmEngine";
import { QueryTypes } from "sequelize";



// ============================================================================
// Connector Controllers
// ============================================================================

export async function getConnectors(req: Request, res: Response): Promise<Response> {
  try {
    const connectors = await CcmConnectorModel.findAll({
      where: { organization_id: req.organizationId },
      order: [["created_at", "DESC"]],
    });
    return res.status(200).json(STATUS_CODE[200](connectors));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getConnectorTypesController(_req: Request, res: Response): Promise<Response> {
  try {
    const types = getConnectorTypes();
    return res.status(200).json(STATUS_CODE[200](types));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function createConnector(req: Request, res: Response): Promise<Response> {
  try {
    const { name, type, config } = req.body;
    const connector = await CcmConnectorModel.create({
      organization_id: req.organizationId!,
      name,
      type,
      config: config || {},
      created_by: req.userId,
    } as any);
    return res.status(201).json(STATUS_CODE[201](connector));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateConnector(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;
    const connector = await CcmConnectorModel.findOne({
      where: { id, organization_id: req.organizationId },
    });
    if (!connector) {
      return res.status(404).json(STATUS_CODE[404]("Connector not found"));
    }
    await connector.update(req.body);
    return res.status(200).json(STATUS_CODE[200](connector));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteConnector(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;
    const deleted = await CcmConnectorModel.destroy({
      where: { id, organization_id: req.organizationId },
    });
    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404]("Connector not found"));
    }
    return res.status(200).json(STATUS_CODE[200]("Connector deleted"));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function testConnectorConnection(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;
    const connector = await CcmConnectorModel.findOne({
      where: { id, organization_id: req.organizationId },
    });
    if (!connector) {
      return res.status(404).json(STATUS_CODE[404]("Connector not found"));
    }

    const instance = createConnectorInstance(connector.type);
    await instance.initialize(connector.config);
    const result = await instance.testConnection();
    await instance.disconnect();

    await connector.update({
      last_tested_at: new Date(),
      last_test_status: result.success ? "success" : "failed",
      last_error_message: result.success ? undefined : result.message,
      status: result.success ? "active" : "error",
    });

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================================================
// Control Test Controllers
// ============================================================================

export async function getControlTests(req: Request, res: Response): Promise<Response> {
  try {
    const tests = await CcmControlTestModel.findAll({
      where: { organization_id: req.organizationId },
      order: [["created_at", "DESC"]],
    });
    return res.status(200).json(STATUS_CODE[200](tests));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function createControlTest(req: Request, res: Response): Promise<Response> {
  try {
    const { connector_id, control_id, subcontrol_id, framework_type, name, test_type, test_config, schedule_cron, severity } = req.body;
    const test = await CcmControlTestModel.create({
      organization_id: req.organizationId!,
      connector_id,
      control_id,
      subcontrol_id,
      framework_type,
      name,
      test_type,
      test_config: test_config || {},
      schedule_cron: schedule_cron || "0 * * * *",
      severity: severity || "medium",
    } as any);
    return res.status(201).json(STATUS_CODE[201](test));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateControlTest(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;
    const test = await CcmControlTestModel.findOne({
      where: { id, organization_id: req.organizationId },
    });
    if (!test) {
      return res.status(404).json(STATUS_CODE[404]("Test not found"));
    }
    await test.update(req.body);
    return res.status(200).json(STATUS_CODE[200](test));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteControlTest(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;
    const deleted = await CcmControlTestModel.destroy({
      where: { id, organization_id: req.organizationId },
    });
    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404]("Test not found"));
    }
    return res.status(200).json(STATUS_CODE[200]("Test deleted"));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function runControlTestOnDemand(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;
    const test = await CcmControlTestModel.findOne({
      where: { id, organization_id: req.organizationId },
    });
    if (!test) {
      return res.status(404).json(STATUS_CODE[404]("Test not found"));
    }

    await runTest({ testId: test.id!, organizationId: req.organizationId! });

    return res.status(200).json(STATUS_CODE[200]("Test executed"));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================================================
// Test Result Controllers
// ============================================================================

export async function getTestResults(req: Request, res: Response): Promise<Response> {
  try {
    const { test_id, status, limit = "50", offset = "0" } = req.query;
    const where: any = { organization_id: req.organizationId };
    if (test_id) where.test_id = test_id;
    if (status) where.status = status;

    const results = await CcmTestResultModel.findAll({
      where,
      order: [["executed_at", "DESC"]],
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });
    return res.status(200).json(STATUS_CODE[200](results));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================================================
// Control Health Controllers
// ============================================================================

export async function getControlHealth(req: Request, res: Response): Promise<Response> {
  try {
    const { framework_type, status } = req.query;
    const where: any = { organization_id: req.organizationId };
    if (framework_type) where.framework_type = framework_type;
    if (status) where.current_status = status;

    const health = await CcmControlHealthModel.findAll({ where, order: [["score", "ASC"]] });
    return res.status(200).json(STATUS_CODE[200](health));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================================================
// Alert Controllers
// ============================================================================

export async function getAlerts(req: Request, res: Response): Promise<Response> {
  try {
    const { status: alertStatus, severity } = req.query;
    const where: any = { organization_id: req.organizationId };
    if (alertStatus) where.status = alertStatus;
    if (severity) where.severity = severity;

    const alerts = await CcmAlertModel.findAll({
      where,
      order: [["created_at", "DESC"]],
    });
    return res.status(200).json(STATUS_CODE[200](alerts));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateAlert(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;
    const alert = await CcmAlertModel.findOne({
      where: { id, organization_id: req.organizationId },
    });
    if (!alert) {
      return res.status(404).json(STATUS_CODE[404]("Alert not found"));
    }

    const updateData: any = { ...req.body };
    if (updateData.status === "resolved" || updateData.status === "dismissed") {
      updateData.resolved_at = new Date();
    }

    await alert.update(updateData);
    return res.status(200).json(STATUS_CODE[200](alert));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ============================================================================
// Dashboard Controller
// ============================================================================

export async function getCcmDashboard(req: Request, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId!;

    const [testStats] = await sequelize.query(
      `SELECT
        COUNT(*) AS total_tests,
        COUNT(*) FILTER (WHERE is_active = TRUE) AS active_tests,
        COUNT(*) FILTER (WHERE is_active = FALSE) AS inactive_tests
      FROM verifywise.ccm_control_tests
      WHERE organization_id = :orgId`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    ) as any;

    const [healthStats] = await sequelize.query(
      `SELECT
        COUNT(*) FILTER (WHERE current_status = 'pass') AS passing_tests,
        COUNT(*) FILTER (WHERE current_status = 'fail') AS failing_tests
      FROM verifywise.ccm_control_health
      WHERE organization_id = :orgId`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    ) as any;

    const [alertStats] = await sequelize.query(
      `SELECT COUNT(*) AS open_alerts
      FROM verifywise.ccm_alerts
      WHERE organization_id = :orgId AND status = 'open'`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    ) as any;

    const [connectorStats] = await sequelize.query(
      `SELECT
        COUNT(*) AS connector_count,
        COUNT(*) FILTER (WHERE status = 'healthy') AS healthy_connectors
      FROM verifywise.ccm_connectors
      WHERE organization_id = :orgId`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    ) as any;

    const recentResults = await CcmTestResultModel.findAll({
      where: { organization_id: orgId },
      order: [["executed_at", "DESC"]],
      limit: 10,
    });

    const recentAlerts = await CcmAlertModel.findAll({
      where: { organization_id: orgId },
      order: [["created_at", "DESC"]],
      limit: 10,
    });

    return res.status(200).json(STATUS_CODE[200]({
      totalTests: Number(testStats?.total_tests || 0),
      activeTests: Number(testStats?.active_tests || 0),
      passingTests: Number(healthStats?.passing_tests || 0),
      failingTests: Number(healthStats?.failing_tests || 0),
      openAlerts: Number(alertStats?.open_alerts || 0),
      connectorCount: Number(connectorStats?.connector_count || 0),
      healthyConnectors: Number(connectorStats?.healthy_connectors || 0),
      recentResults: recentResults || [],
      recentAlerts: recentAlerts || [],
    }));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
