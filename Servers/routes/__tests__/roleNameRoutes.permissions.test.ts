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
import postMarketMonitoringRouter from "../postMarketMonitoring.route";
import incidentRouter from "../aiIncidentManagement.route";
import aiTrustIndexRouter from "../aiTrustIndex.route";

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
    // Was Admin/SuperAdmin by name in the controller. A pure super admin has
    // no organization, so the settings were never theirs to change.
    [aiTrustIndexRouter, "put", "/settings", "aiTrustIndex.admin", ADMIN],
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

// Writes that needed only a login and now enforce the key the screen gates on
// (#5314 review). The UI only offered them to these built-in roles.
describe("screen keys the server now enforces", () => {
  it.each([
    [postMarketMonitoringRouter, "post", "/config", "postMarketMonitoring.edit", EDITOR],
    [postMarketMonitoringRouter, "put", "/config/:configId", "postMarketMonitoring.edit", EDITOR],
    [
      postMarketMonitoringRouter,
      "delete",
      "/config/:configId",
      "postMarketMonitoring.edit",
      EDITOR,
    ],
    [
      postMarketMonitoringRouter,
      "post",
      "/config/:configId/questions",
      "postMarketMonitoring.edit",
      EDITOR,
    ],
    [
      postMarketMonitoringRouter,
      "put",
      "/questions/:questionId",
      "postMarketMonitoring.edit",
      EDITOR,
    ],
    [
      postMarketMonitoringRouter,
      "delete",
      "/questions/:questionId",
      "postMarketMonitoring.edit",
      EDITOR,
    ],
    [postMarketMonitoringRouter, "post", "/questions/reorder", "postMarketMonitoring.edit", EDITOR],
    [incidentRouter, "post", "/", "incident.create", EDITOR],
  ])("%#: %s %s requires %s", (router, method, routePath, key, roles) => {
    expect(permissionFor(router, method as string, routePath as string)).toEqual([key]);
    expect(builtinRolesFor(key as string)).toEqual([...(roles as string[])].sort());
  });

  // Stakeholder actions stay open to every role: any user can be assigned to
  // answer a cycle. Incidents can be edited by anyone the page lets in.
  it.each([
    [postMarketMonitoringRouter, "post", "/cycles/:cycleId/responses"],
    [postMarketMonitoringRouter, "post", "/cycles/:cycleId/submit"],
    [postMarketMonitoringRouter, "post", "/cycles/:cycleId/flag"],
    [incidentRouter, "patch", "/:id"],
  ])("%#: %s %s has no permission key", (router, method, routePath) => {
    expect(permissionFor(router, method as string, routePath as string)).toEqual([]);
  });
});

/**
 * Role-name authorization outside authorize(): comparisons such as
 * req.role === "Admin", ROLES = ["Admin", ...] lists and hasPermission(req,
 * ..., [roles]). A custom role can never match these. Each file that still has
 * them is listed with the exact count and the reason it stays; a new check, or
 * a removed one, fails this test until the list is updated.
 */
const ROLE_NAME_PATTERN =
  /(req\.role|\brole|roleName|userRole)\s*(===|!==)\s*"(Admin|Editor|Reviewer|Auditor|SuperAdmin)"|ROLES\s*=\s*\[\s*"|hasPermission\(req,\s*"[^"]+",\s*\[/g;

const ROLE_NAME_ALLOWLIST: Record<string, { count: number; reason: string }> = {
  "controllers/advisor.ctrl.ts": {
    count: 2,
    reason: "Clearing another user's advisor memory is Admin by name; no catalog key yet.",
  },
  "controllers/aiGatewaySettings.ctrl.ts": {
    count: 1,
    reason: "Forwards the role to the AI Gateway, whose routes check role names (require_admin).",
  },
  "controllers/featureSettings.ctrl.ts": {
    count: 2,
    reason: "Settings > Features stays on the role name (#5314); the screen matches.",
  },
  "controllers/fileManager.ctrl.ts": {
    count: 2,
    reason: "Inner role list on delete/metadata; the routes also authorize fileManager.contribute.",
  },
  "controllers/intakeForm.ctrl.ts": {
    count: 1,
    reason: "An Admin may act in any intake review lane; no catalog key; the screen matches.",
  },
  "controllers/lifecycle.ctrl.ts": {
    count: 1,
    reason: "Lifecycle rule 'never Auditors' on top of the owner/edit check; mirrored in the UI.",
  },
  "controllers/shadowAi.ctrl.ts": {
    count: 17,
    reason: "Shadow AI write/admin checks by role name; no catalog keys yet.",
  },
  "controllers/shadowAiApiKey.ctrl.ts": {
    count: 8,
    reason: "Shadow AI API key management by role name; no catalog key yet.",
  },
  "controllers/user.ctrl.ts": {
    count: 1,
    reason:
      "updateUserById: editing other users is Admin by name; Settings > Team matches (#5314).",
  },
  "controllers/virtualFolder.ctrl.ts": {
    count: 1,
    reason: "Evidence folder management is Admin/Editor by name; no folder key yet.",
  },
  "routes/mcp.route.ts": {
    count: 1,
    reason:
      "The MCP server admits org Admins and super admins; no catalog key; Settings > MCP matches.",
  },
};

describe("role-name authorization outside authorize()", () => {
  it("only appears in the allowlisted files, with the listed counts", () => {
    const root = path.join(__dirname, "../..");
    const found: Record<string, number> = {};
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "__tests__") walk(full);
        } else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
          const matches = fs.readFileSync(full, "utf8").match(ROLE_NAME_PATTERN);
          if (matches) found[path.relative(root, full).split(path.sep).join("/")] = matches.length;
        }
      }
    };
    ["controllers", "middleware", "routes"].forEach((d) => walk(path.join(root, d)));
    const expected = Object.fromEntries(
      Object.entries(ROLE_NAME_ALLOWLIST).map(([file, { count }]) => [file, count]),
    );
    expect(found).toEqual(expected);
  });
});
