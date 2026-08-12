/**
 * Phase 6 — Workflow bootstrap tests (issue 3813).
 *
 * registerAllWorkflows() registers every shipped workflow definition into the
 * registry so getWorkflow(key) resolves each of the 6 keys:
 *   model_deployment, policy_renewal, framework_gap_remediation,
 *   vendor_onboarding, incident_response, audit_preparation.
 *
 * The definitions transitively import the DB layer and notification helpers;
 * those are mocked so importing them never opens a DB / Redis connection.
 * No DB / HTTP. Bootstrap registration is pure in-memory.
 */

import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../../inAppNotification.service", () => ({
  sendInAppNotification: jest.fn(),
  sendBulkInAppNotifications: jest.fn(),
}));

import { registerAllWorkflows } from "../index";
import { getWorkflow } from "../registry";

const ALL_KEYS = [
  "model_deployment",
  "policy_renewal",
  "framework_gap_remediation",
  "vendor_onboarding",
  "incident_response",
  "audit_preparation",
];

describe("workflows / bootstrap", () => {
  it("registerAllWorkflows registers each of the 6 workflow keys", () => {
    registerAllWorkflows();

    for (const key of ALL_KEYS) {
      const wf = getWorkflow(key);
      expect(wf).toBeDefined();
      expect(wf?.id).toBe(key);
    }
  });

  it("is idempotent — calling it twice keeps the 6 keys resolvable", () => {
    registerAllWorkflows();
    registerAllWorkflows();

    for (const key of ALL_KEYS) {
      expect(getWorkflow(key)?.id).toBe(key);
    }
  });
});
