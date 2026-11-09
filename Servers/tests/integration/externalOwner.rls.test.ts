/**
 * With RLS enforced, a query issued after the response runs on the request's
 * finished transaction and fails. The external owner notice looks up the
 * organization and a contact, and both swallow errors, so a late lookup would
 * silently send the generic wording. Uses real authenticateJWT, which is where
 * the RLS middleware runs; the bypassAuth app in externalOwner.test.ts skips it.
 */

/* eslint-disable @typescript-eslint/no-var-requires */

// The flag must be set before database/db is first imported, so every runtime
// import below is a require().
process.env.RLS_ENFORCEMENT_ENABLED = "true";

import type http from "node:http";

jest.mock("../../services/notificationService", () => ({
  notificationService: { sendEmailWithTemplate: jest.fn().mockResolvedValue(undefined) },
}));

const { createTestApp, testRequest } = require("./setup");
const { cleanupDatabase, createTestOrganization, createTestUser } = require("./helpers");
const { createTestProject } = require("../factories");
const { isRlsEnforcementEnabled } = require("../../middleware/rls.middleware");
const { notificationService } = require("../../services/notificationService");

const send = notificationService.sendEmailWithTemplate as jest.Mock;

describe("external owner notice with RLS enforced", () => {
  jest.setTimeout(60_000);

  let app: http.Server;

  beforeAll(async () => {
    expect(isRlsEnforcementEnabled()).toBe(true);
    app = await createTestApp();
  });

  afterEach(async () => {
    await cleanupDatabase();
    send.mockClear();
  });

  it("names the organization and the person who assigned them", async () => {
    const organization = `RLS notice ${Date.now()}`;
    const orgId = await createTestOrganization(organization);
    const email = `rls-notice-${Date.now()}@test.com`;
    const userId = await createTestUser(orgId, 1, email, "Password123!");
    const projectId = await createTestProject(orgId, userId);
    const login = await testRequest(app)
      .post("/api/users/login")
      .send({ email, password: "Password123!" })
      .expect(202);

    await testRequest(app)
      .patch(`/api/v1/projects/${projectId}`)
      .set({ Authorization: `Bearer ${login.body.data.token}` })
      .send({ external_owner_name: "Ada", external_owner_email: "ada@example.com" })
      .expect(202);

    for (let i = 0; i < 40 && send.mock.calls.length < 1; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(send).toHaveBeenCalledTimes(1);
    const variables = send.mock.calls[0][3] as Record<string, string>;
    expect(variables.message).toContain(organization);
    expect(variables.contact_message).toContain(email);
  });
});
