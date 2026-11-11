import { describe, it, expect, jest } from "@jest/globals";
import fs from "fs";
import path from "path";
import { BUILTIN_ROLE_PERMISSIONS } from "../../config/rolePermissions.config";

// Issue #5314: these routes used authorize(["Admin", ...]) role-name lists, so
// a custom organization role was always refused. They now authorize on a
// permission key whose built-in roles are exactly the old list.

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

import riskLinksRouter from "../riskLinks.route";
import evidenceHubRouter from "../evidenceHub.route";
import useCaseOrgSettingsRouter from "../v1/useCaseOrgSettings.route";

const permissionFor = (router: any, method: string, routePath: string) => {
  const layer = router.stack.find(
    (l: any) => l.route?.path === routePath && l.route.methods[method],
  );
  expect(layer).toBeDefined();
  return layer.route.stack.map((s: any) => s.handle.permissionKey).filter(Boolean);
};

/** Built-in roles holding `key`, sorted, from the static built-in matrix. */
const builtinRolesFor = (key: string) =>
  Object.entries(BUILTIN_ROLE_PERMISSIONS)
    .filter(([, keys]) => (keys as ReadonlySet<string>).has(key))
    .map(([role]) => role)
    .sort();

const SUPER = ["Admin", "SuperAdmin"];
const EDITOR = ["Admin", "Editor"];
const CONTRIBUTOR = ["Admin", "Editor", "Reviewer"];
const ADMIN = ["Admin"];

describe("routes that used role-name lists now authorize on a permission key", () => {
  it.each([
    [riskLinksRouter, "post", "/recompute", "riskLinks.admin", SUPER],
    [riskLinksRouter, "post", "/suggest-hierarchy", "riskLinks.admin", SUPER],
    [riskLinksRouter, "post", "/", "riskLinks.edit", EDITOR],
    [riskLinksRouter, "get", "/", "riskLinks.admin", SUPER],
    [riskLinksRouter, "get", "/dismissals", "riskLinks.admin", SUPER],
    [riskLinksRouter, "get", "/duplicates", "riskLinks.admin", SUPER],
    [riskLinksRouter, "get", "/coverage", "riskLinks.admin", SUPER],
    [riskLinksRouter, "post", "/vendor-risks/recompute", "riskLinks.admin", SUPER],
    [
      riskLinksRouter,
      "post",
      "/vendor-risks/:vendorRiskId/suggest-hierarchy",
      "riskLinks.admin",
      SUPER,
    ],
    [riskLinksRouter, "patch", "/:id", "riskLinks.review", CONTRIBUTOR],
    [riskLinksRouter, "post", "/:id/acknowledge-parent-change", "riskLinks.edit", EDITOR],
    [evidenceHubRouter, "post", "/freshness-sweep", "evidence.admin", ADMIN],
    [useCaseOrgSettingsRouter, "put", "/", "organization.admin", ADMIN],
  ])("%#: %s %s requires %s", (router, method, routePath, key, legacyRoles) => {
    expect(permissionFor(router, method as string, routePath as string)).toEqual([key]);
    // Same built-in roles as the role-name list it replaced: no change for them.
    expect(builtinRolesFor(key as string)).toEqual([...(legacyRoles as string[])].sort());
  });

  it("no route file authorizes by role name any more", () => {
    const roots = [path.join(__dirname, ".."), path.join(__dirname, "../../extensions")];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "__tests__" && entry.name !== "node_modules") walk(full);
        } else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
          if (/authorize\(\s*\[/.test(fs.readFileSync(full, "utf8"))) offenders.push(full);
        }
      }
    };
    roots.forEach(walk);
    expect(offenders).toEqual([]);
  });
});
