import { describe, it, expect, jest } from "@jest/globals";

// Reviewer and Auditor are read-only for core governance content: every write
// route below must carry a permission check, not only authentication.

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

import projectRouter from "../project.route";
import vendorRouter from "../vendor.route";
import vendorRiskRouter from "../vendorRisk.route";
import modelInventoryRouter from "../modelInventory.route";
import modelRiskRouter from "../modelRisk.route";
import policyRouter from "../policy.route";
import policyLinkedRouter from "../policyLinkedObjects.route";
import risksRouter from "../risks.route";
import taskRouter from "../task.route";
import trainingRouter from "../trainingRegistar.route";
import quantitativeRiskRouter from "../quantitativeRisk.route";

const permissionFor = (router: any, method: string, path: string) => {
  const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
  expect(layer).toBeDefined();
  const keys = layer.route.stack.map((s: any) => s.handle.permissionKey).filter(Boolean);
  return keys;
};

describe("core write routes require a permission", () => {
  it.each([
    ["use case", projectRouter, "post", "/", "useCase.edit"],
    ["use case", projectRouter, "patch", "/:id", "useCase.edit"],
    ["use case", projectRouter, "patch", "/:id/status", "useCase.edit"],
    ["use case", projectRouter, "delete", "/:id", "useCase.edit"],
    ["vendor", vendorRouter, "post", "/", "vendor.edit"],
    ["vendor", vendorRouter, "patch", "/:id", "vendor.edit"],
    ["vendor", vendorRouter, "delete", "/:id", "vendor.edit"],
    ["vendor risk", vendorRiskRouter, "post", "/", "vendor.edit"],
    ["vendor risk", vendorRiskRouter, "patch", "/:id", "vendor.edit"],
    ["vendor risk", vendorRiskRouter, "delete", "/:id", "vendor.edit"],
    ["model", modelInventoryRouter, "post", "/", "model.edit"],
    ["model", modelInventoryRouter, "patch", "/:id", "model.edit"],
    ["model", modelInventoryRouter, "delete", "/:id", "model.edit"],
    ["model risk", modelRiskRouter, "post", "/", "model.edit"],
    ["model risk", modelRiskRouter, "put", "/:id", "model.edit"],
    ["model risk", modelRiskRouter, "patch", "/:id", "model.edit"],
    ["model risk", modelRiskRouter, "delete", "/:id", "model.edit"],
    ["policy", policyRouter, "post", "/import/docx", "policy.edit"],
    ["policy", policyRouter, "post", "/", "policy.edit"],
    ["policy", policyRouter, "put", "/:id", "policy.edit"],
    ["policy", policyRouter, "delete", "/:id", "policy.edit"],
    ["policy", policyRouter, "post", "/:id/review/request", "policy.edit"],
    ["policy link", policyLinkedRouter, "post", "/:policyId/linked-objects", "policy.edit"],
    ["policy link", policyLinkedRouter, "delete", "/:policyId/linked-objects", "policy.edit"],
    ["policy link", policyLinkedRouter, "delete", "/risk/:riskId/unlink-all", "risks.edit"],
    [
      "policy link",
      policyLinkedRouter,
      "delete",
      "/evidence/:evidenceId/unlink-all",
      "fileManager.contribute",
    ],
    ["risk", risksRouter, "post", "/", "risks.edit"],
    ["risk", risksRouter, "post", "/suggest-ai", "risks.edit"],
    ["risk", risksRouter, "put", "/:id", "risks.edit"],
    ["risk", risksRouter, "delete", "/:id", "risks.edit"],
    ["risk", quantitativeRiskRouter, "post", "/:riskId/apply-benchmark/:benchmarkId", "risks.edit"],
    ["risk", quantitativeRiskRouter, "put", "/assessment-mode", "risks.edit"],
    ["task", taskRouter, "post", "/", "task.edit"],
    ["training", trainingRouter, "post", "/", "training.edit"],
    ["training", trainingRouter, "patch", "/:id", "training.edit"],
    ["training", trainingRouter, "delete", "/:id", "training.admin"],
  ])("%s: %s %s requires %s", (_label, router, method, path, key) => {
    expect(permissionFor(router, method as string, path as string)).toEqual([key]);
  });

  // Assigned reviewers may be any role, so approve/reject is checked in the
  // controller (assigned reviewer or Admin), not by a role permission.
  it.each([
    ["put", "/:id/review/approve"],
    ["put", "/:id/review/reject"],
  ])("policy review %s %s has no role permission", (method, path) => {
    expect(permissionFor(policyRouter, method, path)).toEqual([]);
  });
});
