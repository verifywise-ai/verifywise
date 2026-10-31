/**
 * Legacy API registration — vendors and vendor risks.
 *
 * Legacy surface (ADR 0001): these unversioned mounts are frozen; bug fixes
 * only. New endpoints go to routes/v1/. Mounts are listed in the exact order
 * they had in app.ts before the decomposition.
 */
import express from "express";
import vendorRiskRoutes from "../vendorRisk.route";
import vendorRoutes from "../vendor.route";
import vendorChangeHistoryRoutes from "../vendorChangeHistory.route";
import vendorRiskChangeHistoryRoutes from "../vendorRiskChangeHistory.route";

export function registerVendorRoutes(app: express.Application): void {
  app.use("/api/vendorRisks", vendorRiskRoutes);
  app.use("/api/vendors", vendorRoutes);
  app.use("/api/vendor-change-history", vendorChangeHistoryRoutes);
  app.use("/api/vendor-risk-change-history", vendorRiskChangeHistoryRoutes);
}
