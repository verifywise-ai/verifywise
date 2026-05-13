import express from "express";
const router = express.Router();

import authenticateJWT from "../middleware/auth.middleware";

import {
  getConnectors,
  getConnectorTypesController,
  createConnector,
  updateConnector,
  deleteConnector,
  testConnectorConnection,
  getControlTests,
  createControlTest,
  updateControlTest,
  deleteControlTest,
  runControlTestOnDemand,
  getTestResults,
  getControlHealth,
  getAlerts,
  updateAlert,
  getCcmDashboard,
} from "../controllers/ccm.ctrl";

// Dashboard
router.get("/dashboard", authenticateJWT, getCcmDashboard);

// Connector types (no auth needed — public list)
router.get("/connectors/types", authenticateJWT, getConnectorTypesController);

// Connectors
router.get("/connectors", authenticateJWT, getConnectors);
router.post("/connectors", authenticateJWT, createConnector);
router.patch("/connectors/:id", authenticateJWT, updateConnector);
router.delete("/connectors/:id", authenticateJWT, deleteConnector);
router.post("/connectors/:id/test", authenticateJWT, testConnectorConnection);

// Control Tests
router.get("/tests", authenticateJWT, getControlTests);
router.post("/tests", authenticateJWT, createControlTest);
router.patch("/tests/:id", authenticateJWT, updateControlTest);
router.delete("/tests/:id", authenticateJWT, deleteControlTest);
router.post("/tests/:id/run", authenticateJWT, runControlTestOnDemand);

// Test Results
router.get("/results", authenticateJWT, getTestResults);

// Control Health
router.get("/health", authenticateJWT, getControlHealth);

// Alerts
router.get("/alerts", authenticateJWT, getAlerts);
router.patch("/alerts/:id", authenticateJWT, updateAlert);

export default router;
