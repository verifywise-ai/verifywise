/**
 * Legacy API registration — identity, organization, and user services.
 *
 * Legacy surface (ADR 0001): these unversioned mounts are frozen; bug fixes
 * only. New endpoints go to routes/v1/. Mounts are listed in the exact order
 * they had in app.ts before the decomposition.
 */
import express from "express";
import userRoutes from "../user.route";
import roleRoutes from "../role.route";
import invitationRoutes from "../invitation.route";
import organizationRoutes from "../organization.route";
import loggerRoutes from "../logger.route";
import tokenRoutes from "../tokens.route";
import userPreferenceRouter from "../userPreference.route";
import notificationRoutes from "../notification.route";
import versionRoutes from "../version.route";
import telemetryRoutes from "../telemetry.route";
import ssoConfigRoutes from "../ssoConfig.route";

export function registerCoreAuthRoutes(app: express.Application): void {
  app.use("/api/users", userRoutes);
  app.use("/api/roles", roleRoutes);
  app.use("/api/invitations", invitationRoutes);
  app.use("/api/organizations", organizationRoutes);
  app.use("/api/logger", loggerRoutes);
  app.use("/api/tokens", tokenRoutes);
  app.use("/api/user-preferences", userPreferenceRouter);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/version", versionRoutes);
  app.use("/api/telemetry", telemetryRoutes);
  app.use("/api/ssoConfig", ssoConfigRoutes);
}
