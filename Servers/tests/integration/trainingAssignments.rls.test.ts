/**
 * With RLS enforced, a query issued after the response runs on the request's
 * finished transaction and fails. Assigning a training stores a notice for each
 * person and queues an email, so this runs the real notification service through
 * the real authenticateJWT, which is where the RLS middleware runs.
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
const { sequelize } = require("../../database/db");
const { isRlsEnforcementEnabled } = require("../../middleware/rls.middleware");
const { notificationService } = require("../../services/notificationService");
const stubbedService = require("../../services/inAppNotification.service");

const send = notificationService.sendEmailWithTemplate as jest.Mock;

describe("training assignment notices with RLS enforced", () => {
  jest.setTimeout(60_000);

  let app: http.Server;

  beforeAll(async () => {
    expect(isRlsEnforcementEnabled()).toBe(true);
    // setup.ts stubs this service; put the real function back for this file.
    const actual = jest.requireActual("../../services/inAppNotification.service");
    (stubbedService.notifyTrainingAssigned as jest.Mock).mockImplementation(
      actual.notifyTrainingAssigned,
    );
    app = await createTestApp();
  });

  afterEach(async () => {
    await cleanupDatabase();
    send.mockClear();
  });

  it("commits the assignment and its in-app notice, and queues the email", async () => {
    const orgId = await createTestOrganization(`RLS training ${Date.now()}`);
    const email = `rls-training-${Date.now()}@test.com`;
    const adminId = await createTestUser(orgId, 1, email, "Password123!");
    const traineeId = await createTestUser(
      orgId,
      3,
      `rls-trainee-${Date.now()}@test.com`,
      "Password123!",
    );
    const [trainings] = await sequelize.query(
      `INSERT INTO trainingregistar (organization_id, training_name)
       VALUES (:orgId, 'AI literacy') RETURNING id`,
      { replacements: { orgId } },
    );
    const trainingId = (trainings as Array<{ id: number }>)[0].id;
    const login = await testRequest(app)
      .post("/api/users/login")
      .send({ email, password: "Password123!" })
      .expect(202);
    const dueDate = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

    const res = await testRequest(app)
      .post("/api/v1/training/assignments")
      .set({ Authorization: `Bearer ${login.body.data.token}` })
      .send({ training_id: trainingId, user_ids: [traineeId], due_date: dueDate })
      .expect(201);

    expect(res.body.data.created[0]).toMatchObject({ user_id: traineeId, assigned_by: adminId });

    for (let i = 0; i < 40 && send.mock.calls.length < 1; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][3].training_url).toMatch(/\/training\/my-training$/);

    // Allow for the request transaction's commit, which happens on "finish".
    let notices: unknown[] = [];
    for (let i = 0; i < 40 && notices.length < 1; i += 1) {
      [notices] = await sequelize.query(
        `SELECT user_id, action_url FROM notifications
          WHERE organization_id = :orgId AND user_id = :traineeId`,
        { replacements: { orgId, traineeId } },
      );
      if (notices.length < 1) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(notices).toEqual([{ user_id: traineeId, action_url: "/training/my-training" }]);

    const [rows] = await sequelize.query(
      `SELECT user_id FROM training_assignments
        WHERE organization_id = :orgId AND training_id = :trainingId`,
      { replacements: { orgId, trainingId } },
    );
    expect(rows).toEqual([{ user_id: traineeId }]);
  });
});
