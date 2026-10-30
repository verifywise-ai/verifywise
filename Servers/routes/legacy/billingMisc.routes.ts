/**
 * Legacy API registration — billing, mail, demo data, and platform settings.
 *
 * Legacy surface (ADR 0001): these unversioned mounts are frozen; bug fixes
 * only. New endpoints go to routes/v1/. Mounts are listed in the exact order
 * they had in app.ts before the decomposition.
 */
import express from "express";
import autoDriverRoutes from "../autoDriver.route";
import mailRoutes from "../vwmailer.route";
import tiersRoutes from "../tiers.route";
import subscriptionRoutes from "../subscription.route";
import featureSettingsRoutes from "../featureSettings.route";
import dataRetentionRoutes from "../dataRetention.route";
import superAdminRoutes from "../superAdmin.route";

export function registerBillingMiscRoutes(app: express.Application): void {
  app.use("/api/autoDrivers", autoDriverRoutes);
  app.use("/api/mail", mailRoutes);
  app.use("/api/tiers", tiersRoutes);
  app.use("/api/subscriptions", subscriptionRoutes);
  app.use("/api/feature-settings", featureSettingsRoutes);
  app.use("/api/data-retention", dataRetentionRoutes);
  app.use("/api/super-admin", superAdminRoutes);
}
