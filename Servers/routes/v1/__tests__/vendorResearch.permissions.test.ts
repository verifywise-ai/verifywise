import { describe, it, expect, jest } from "@jest/globals";

// The vendor research routes follow the rule of coreWriteRoutes.permissions.test.ts: Reviewer and
// Auditor are read-only, so every write carries a permission check, not only authentication.
// What shows how the agent performs, or chooses the LLM key it uses, goes to those who manage the
// organization's LLM keys. Everything else is read by any signed-in user.
//
// The routes are versioned (ADR 0001: added after the policy, so they live in routes/v1 and are
// served under /api/v1). Vendor CRUD stays on the legacy router, which has no research route.

jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: jest.fn((_req: any, _res: any, next: any) => next()),
}));
jest.mock("../../../middleware/accessControl.middleware", () => ({
  __esModule: true,
  default: jest.fn((permission: string) => {
    const mw: any = (_req: any, _res: any, next: any) => next();
    mw.permissionKey = permission;
    return mw;
  }),
}));

import legacyVendorRouter from "../../vendor.route";
import vendorRouter from "../vendors.route";
import vendorResearchRouter from "../vendorResearch.route";
import vendorRiskFindingsRouter from "../vendorRiskFindings.route";

const permissionFor = (router: any, method: string, path: string) => {
  const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
  expect(layer).toBeDefined();
  return layer.route.stack.map((s: any) => s.handle.permissionKey).filter(Boolean);
};

describe("vendor research write routes require a permission", () => {
  it.each([
    ["start a run", "post", "/:id/research", "risks.edit", vendorRouter],
    ["accept a finding", "post", "/:id/accept", "risks.edit", vendorRiskFindingsRouter],
    ["dismiss a finding", "post", "/:id/dismiss", "risks.edit", vendorRiskFindingsRouter],
    ["save the settings", "put", "/settings", "llmKeys.admin", vendorResearchRouter],
  ])("%s: %s %s requires %s", (_label, method, path, key, router) => {
    expect(permissionFor(router, method, path)).toEqual([key]);
  });
});

describe("vendor research read routes", () => {
  it.each([
    ["the trace of a run", "get", "/:id/research/runs/:runId/trace", vendorRouter],
    ["the decision statistics", "get", "/decision-stats", vendorResearchRouter],
    ["the settings", "get", "/settings", vendorResearchRouter],
  ])("%s: %s %s requires llmKeys.admin", (_label, method, path, router) => {
    expect(permissionFor(router, method, path)).toEqual(["llmKeys.admin"]);
  });

  it.each([
    ["the latest run", "get", "/:id/research/latest", vendorRouter],
    ["the config", "get", "/config", vendorResearchRouter],
    ["the findings", "get", "/", vendorRiskFindingsRouter],
  ])("%s: %s %s has no role permission", (_label, method, path, router) => {
    expect(permissionFor(router, method, path)).toEqual([]);
  });
});

describe("the legacy vendor router", () => {
  it("has no research route: those moved to /api/v1 and nothing is left behind", () => {
    const paths = (legacyVendorRouter as any).stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => layer.route.path as string);

    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((path: string) => path.includes("research"))).toEqual([]);
  });
});
