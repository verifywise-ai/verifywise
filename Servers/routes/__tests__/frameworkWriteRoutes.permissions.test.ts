import { describe, it, expect, jest } from "@jest/globals";

// Framework writes must check framework.edit / framework.audit, not only
// authentication. Saves check by the fields they change (a detector per
// route); the other writes need framework.edit outright.

jest.mock("../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: jest.fn((_req: any, _res: any, next: any) => next()),
}));
jest.mock("../../middleware/accessControl.middleware", () => ({
  __esModule: true,
  default: jest.fn((permission: string) => {
    const mw: any = (_req: any, _res: any, next: any) => next();
    mw.permissionKey = permission;
    return mw;
  }),
}));
jest.mock("../../middleware/frameworkWriteAccess.middleware", () => ({
  __esModule: true,
  requireFrameworkWriteAccess: jest.fn((detector: unknown) => {
    const mw: any = (_req: any, _res: any, next: any) => next();
    mw.detector = detector;
    return mw;
  }),
}));

import euRouter from "../eu.route";
import iso42001Router from "../iso42001.route";
import iso27001Router from "../iso27001.route";
import nistRouter from "../nist_ai_rmf.route";
import frameworkImplRouter from "../frameworkImpl.route";
import frameworksRouter from "../frameworks.route";
import importedRouter from "../v1/importedFrameworkAssessment.route";
import * as detectors from "../../utils/frameworkWriteAccess.utils";

const handlersFor = (router: any, method: string, path: string) => {
  const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
  expect(layer).toBeDefined();
  return layer.route.stack.map((s: any) => s.handle);
};

const permissionsFor = (router: any, method: string, path: string) =>
  handlersFor(router, method, path)
    .map((h: any) => h.permissionKey)
    .filter(Boolean);

const detectorFor = (router: any, method: string, path: string) =>
  handlersFor(router, method, path).find((h: any) => h.detector)?.detector;

describe("framework saves check the fields they change", () => {
  it.each([
    ["EU AI Act controls", euRouter, "/saveControls/:id", detectors.euControlChanges],
    ["EU AI Act answers", euRouter, "/saveAnswer/:id", detectors.euAnswerChanges],
    ["ISO 42001 clauses", iso42001Router, "/saveClauses/:id", detectors.iso42001SubclauseChanges],
    ["ISO 42001 annexes", iso42001Router, "/saveAnnexes/:id", detectors.iso42001AnnexChanges],
    ["ISO 27001 clauses", iso27001Router, "/saveClauses/:id", detectors.iso27001SubclauseChanges],
    ["ISO 27001 annexes", iso27001Router, "/saveAnnexes/:id", detectors.iso27001AnnexChanges],
    ["NIST AI RMF", nistRouter, "/subcategories/:id", detectors.nistSubcategoryChanges],
    [
      "bundled frameworks",
      frameworkImplRouter,
      "/:frameworkId/impl/:level/:id",
      detectors.frameworkImplChanges,
    ],
    [
      "imported frameworks",
      importedRouter,
      "/links/:linkId/impl/:level/:implId",
      detectors.importedImplChanges,
    ],
  ])("%s: PATCH %s", (_label, router, path, detector) => {
    expect(detector).toBeDefined();
    expect(detectorFor(router, "patch", path as string)).toBe(detector);
  });

  it("the detector runs after the multipart parser", () => {
    const handlers = handlersFor(iso42001Router, "patch", "/saveClauses/:id");
    const detectorIndex = handlers.findIndex((h: any) => h.detector);
    const multerIndex = handlers.findIndex((h: any) => h.name === "multerMiddleware");
    expect(multerIndex).toBeGreaterThanOrEqual(0);
    expect(detectorIndex).toBeGreaterThan(multerIndex);
  });
});

describe("other framework writes need framework.edit", () => {
  it.each([
    ["add a framework", frameworksRouter, "post", "/toProject"],
    ["remove a framework", frameworksRouter, "delete", "/fromProject"],
    ["NIST status", nistRouter, "patch", "/subcategories/:id/status"],
    ["EU assessments", euRouter, "delete", "/assessments/byProjectId/:id"],
    ["EU compliances", euRouter, "delete", "/compliances/byProjectId/:id"],
    ["ISO 42001 clauses", iso42001Router, "delete", "/clauses/byProjectId/:id"],
    ["ISO 42001 annexes", iso42001Router, "delete", "/annexes/byProjectId/:id"],
    ["ISO 27001 clauses", iso27001Router, "delete", "/clauses/byProjectId/:id"],
    ["ISO 27001 annexes", iso27001Router, "delete", "/annexes/byProjectId/:id"],
    ["imported risks", importedRouter, "put", "/links/:linkId/impl/:level/:implId/risks"],
  ])("%s: %s %s", (_label, router, method, path) => {
    expect(permissionsFor(router, method as string, path as string)).toEqual(["framework.edit"]);
  });

  it.each([
    ["post", "/projects/:projectId"],
    ["delete", "/projects/:projectId/:linkId"],
  ])("imported framework attach/detach: %s %s", (method, path) => {
    expect(permissionsFor(importedRouter, method, path)).toEqual([
      "useCase.edit",
      "framework.edit",
    ]);
  });
});
