/**
 * Legacy API registration — tasks, approvals, automations, and change history.
 *
 * Legacy surface (ADR 0001): these unversioned mounts are frozen; bug fixes
 * only. New endpoints go to routes/v1/. Mounts are listed in the exact order
 * they had in app.ts before the decomposition.
 */
import express from "express";
import modelInventoryChangeHistoryRoutes from "../modelInventoryChangeHistory.route";
import taskRoutes from "../task.route";
import deadlineRoutes from "../deadline.route";
import automation from "../automation.route";
import policyChangeHistoryRoutes from "../policyChangeHistory.route";
import incidentChangeHistoryRoutes from "../incidentChangeHistory.route";
import useCaseChangeHistoryRoutes from "../useCaseChangeHistory.route";
import projectRiskChangeHistoryRoutes from "../projectRiskChangeHistory.route";
import fileChangeHistoryRoutes from "../fileChangeHistory.route";
import taskChangeHistoryRoutes from "../taskChangeHistory.route";
import trainingChangeHistoryRoutes from "../trainingChangeHistory.route";
import modelRiskChangeHistoryRoutes from "../modelRiskChangeHistory.route";
import datasetChangeHistoryRoutes from "../datasetChangeHistory.route";
import approvalWorkflowRoutes from "../approvalWorkflow.route";
import approvalRequestRoutes from "../approvalRequest.route";
import auditLedgerRoutes from "../auditLedger.route";

export function registerWorkflowsRoutes(app: express.Application): void {
  app.use("/api/model-inventory-change-history", modelInventoryChangeHistoryRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use("/api/deadlines", deadlineRoutes);
  app.use("/api/automations", automation);
  app.use("/api/policy-change-history", policyChangeHistoryRoutes);
  app.use("/api/incident-change-history", incidentChangeHistoryRoutes);
  app.use("/api/use-case-change-history", useCaseChangeHistoryRoutes);
  app.use("/api/risk-change-history", projectRiskChangeHistoryRoutes);
  app.use("/api/file-change-history", fileChangeHistoryRoutes);
  app.use("/api/task-change-history", taskChangeHistoryRoutes);
  app.use("/api/training-change-history", trainingChangeHistoryRoutes);
  app.use("/api/model-risk-change-history", modelRiskChangeHistoryRoutes);
  app.use("/api/dataset-change-history", datasetChangeHistoryRoutes);
  app.use("/api/approval-workflows", approvalWorkflowRoutes);
  app.use("/api/approval-requests", approvalRequestRoutes);
  app.use("/api/audit-ledger", auditLedgerRoutes);
}
