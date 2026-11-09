/**
 * Legacy API registration — reporting and dashboard.
 *
 * Legacy surface (ADR 0001): these unversioned mounts are frozen; bug fixes
 * only. New endpoints go to routes/v1/. Mounts are listed in the exact order
 * they had in app.ts before the decomposition.
 */
import express from "express";
import reportTemplateRoutes from "../reportTemplate.route";
import scheduledReportRoutes from "../scheduledReport.route";
import reportRunRoutes from "../reportRun.route";
import reportRoutes from "../reporting.route";
import dashboardRoutes from "../dashboard.route";

export function registerReportingRoutes(app: express.Application): void {
  // The specific /api/reporting/* mounts must precede the generic
  // /api/reporting mount.
  app.use("/api/reporting/templates", reportTemplateRoutes);
  app.use("/api/reporting/scheduled-reports", scheduledReportRoutes);
  app.use("/api/reporting/runs", reportRunRoutes);
  app.use("/api/reporting", reportRoutes);
  app.use("/api/dashboard", dashboardRoutes);
}
