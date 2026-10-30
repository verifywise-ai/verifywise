/**
 * Legacy API registration — files, datasets, and content stores.
 *
 * Legacy surface (ADR 0001): these unversioned mounts are frozen; bug fixes
 * only. New endpoints go to routes/v1/. Mounts are listed in the exact order
 * they had in app.ts before the decomposition.
 */
import express from "express";
import fileRoutes from "../file.route";
import datasetRoutes from "../dataset.route";
import shareLinkRoutes from "../shareLink.route";
import fileManagerRoutes from "../fileManager.route";
import evidenceHubRouter from "../evidenceHub.route";
import searchRoutes from "../search.route";
import notesRoutes from "../notes.route";
import entityGraphRoutes from "../entityGraph.route";
import virtualFolderRoutes, { filesFolderRouter } from "../virtualFolder.route";
import intakeFormRoutes from "../intakeForm.route";

export function registerFilesDataRoutes(app: express.Application): void {
  app.use("/api/files", fileRoutes);
  app.use("/api/datasets", datasetRoutes);
  app.use("/api/shares", shareLinkRoutes);
  app.use("/api/file-manager", fileManagerRoutes);
  app.use("/api/evidenceHub", evidenceHubRouter);
  app.use("/api/search", searchRoutes);
  app.use("/api/notes", notesRoutes);
  app.use("/api/entity-graph", entityGraphRoutes);
  app.use("/api/virtual-folders", virtualFolderRoutes);
  // Second /api/files mount: folder-scoped file operations from
  // virtualFolder.route.ts. Mounted after fileRoutes on the same prefix;
  // first match wins for overlapping paths, so this order is load-bearing.
  app.use("/api/files", filesFolderRouter);
  app.use("/api/intake", intakeFormRoutes);
}
