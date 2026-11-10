jest.setTimeout(60000);

// Must stay the first import: setup.ts stubs inAppNotification.service, and the
// stub only applies to modules loaded after it.
import { createTestApp, testRequest } from "./setup";
import { sequelize } from "../../database/db";
import {
  notifyTrainingAssigned,
  notifyTrainingReminder,
} from "../../services/inAppNotification.service";
import { runTrainingAssignmentReminderSweep } from "../../services/automations/actions/trainingAssignmentReminderSweep";
import { removeUserFromOrganizationQuery } from "../../utils/user.utils";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";

/**
 * Training assignments (#5260): v1 endpoints over a real database. Validation
 * and the sweep's retry rules are unit-tested next to their code, and the real
 * notification service runs in trainingAssignments.rls.test.ts.
 */

const assignedNotice = notifyTrainingAssigned as jest.Mock;
const reminderNotice = notifyTrainingReminder as jest.Mock;
const BASE = "/api/v1/training/assignments";

let counter = 0;
const nextEmail = () => {
  counter += 1;
  return `training-${Date.now()}-${counter}@test.com`;
};

/** role ids: 1 Admin, 2 Reviewer, 3 Editor, 4 Auditor */
const ROLE_NAMES: Record<number, string> = { 1: "Admin", 2: "Reviewer", 3: "Editor", 4: "Auditor" };

const dateIn = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const user = (orgId: number, roleId = 1) =>
  createTestUser(orgId, roleId, nextEmail(), "Password123!");

async function apiAs(orgId: number, userId: number, roleId = 1) {
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role: ROLE_NAMES[roleId] },
  });
  return testRequest(app);
}

async function createTraining(orgId: number, name = "AI literacy"): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO trainingregistar (organization_id, training_name, duration, provider, description)
     VALUES (:orgId, :name, '2 hours', 'Acme', 'Basics') RETURNING id`,
    { replacements: { orgId, name } },
  );
  return (rows as Array<{ id: number }>)[0].id;
}

async function storedRow(id: number) {
  const [rows] = await sequelize.query(
    `SELECT to_char(due_date, 'YYYY-MM-DD') AS due_date, completed_at, completed_by,
            due_soon_reminded_at, overdue_reminded_at
       FROM training_assignments WHERE id = :id`,
    { replacements: { id } },
  );
  return (rows as Array<Record<string, any>>)[0];
}

async function countRows(trainingId: number): Promise<number> {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM training_assignments WHERE training_id = :trainingId`,
    { replacements: { trainingId } },
  );
  return (rows as Array<{ n: number }>)[0].n;
}

async function setDueDate(id: number, dueDate: string) {
  await sequelize.query(`UPDATE training_assignments SET due_date = :dueDate WHERE id = :id`, {
    replacements: { id, dueDate },
  });
}

/** The account survives only when another membership remains. */
async function leaveOrganization(userId: number, orgId: number) {
  const homeOrg = await createTestOrganization("Home");
  await sequelize.query(
    `INSERT INTO organization_members (organization_id, user_id, role_id)
     VALUES (:homeOrg, :userId, 3)`,
    { replacements: { homeOrg, userId } },
  );
  await sequelize.transaction((transaction) =>
    removeUserFromOrganizationQuery(userId, orgId, transaction),
  );
}

async function setup() {
  const orgId = await createTestOrganization("Training assignments");
  const adminId = await user(orgId);
  const traineeId = await user(orgId, 3);
  const trainingId = await createTraining(orgId);
  const admin = await apiAs(orgId, adminId);
  return { orgId, adminId, traineeId, trainingId, admin };
}

async function assign(
  admin: Awaited<ReturnType<typeof apiAs>>,
  trainingId: number,
  userIds: number[],
  dueDate = dateIn(30),
) {
  const res = await admin
    .post(BASE)
    .send({ training_id: trainingId, user_ids: userIds, due_date: dueDate });
  expect(res.status).toBe(201);
  return res.body.data as { created: any[]; skipped_user_ids: number[] };
}

describe("Training assignments", () => {
  beforeEach(() => {
    assignedNotice.mockClear();
    reminderNotice.mockClear();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("authentication and authorization", () => {
    it("refuses every endpoint without a token", async () => {
      const api = testRequest(await createTestApp());
      const calls = [
        api.get(`${BASE}?training_id=1`),
        api.get(`${BASE}/mine`),
        api.get(`${BASE}/summary`),
        api.post(BASE).send({}),
        api.post(`${BASE}/complete-all`).send({}),
        api.patch(`${BASE}/1`).send({}),
        api.post(`${BASE}/1/complete`).send({}),
        api.post(`${BASE}/1/reopen`).send({}),
        api.delete(`${BASE}/1`),
      ];
      for (const call of calls) {
        expect([400, 401]).toContain((await call).status);
      }
    });

    it("refuses writes from a role without training.edit and changes nothing", async () => {
      const { orgId, traineeId, trainingId, admin } = await setup();
      const auditorId = await user(orgId, 4);
      const auditor = await apiAs(orgId, auditorId, 4);
      const { created } = await assign(admin, trainingId, [traineeId]);
      const id = created[0].id;
      const before = await storedRow(id);

      const responses = [
        await auditor
          .post(BASE)
          .send({ training_id: trainingId, user_ids: [auditorId], due_date: dateIn(5) }),
        await auditor.post(`${BASE}/complete-all`).send({ training_id: trainingId }),
        await auditor.patch(`${BASE}/${id}`).send({ due_date: dateIn(5) }),
        await auditor.delete(`${BASE}/${id}`),
      ];

      responses.forEach((res) => expect(res.status).toBe(403));
      expect(await storedRow(id)).toEqual(before);
      expect(await countRows(trainingId)).toBe(1);
    });

    it("lets a role without training.edit read", async () => {
      const { orgId, traineeId, trainingId, admin } = await setup();
      const auditorId = await user(orgId, 4);
      const auditor = await apiAs(orgId, auditorId, 4);
      await assign(admin, trainingId, [traineeId]);

      const list = await auditor.get(`${BASE}?training_id=${trainingId}`);

      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
    });
  });

  describe("POST /assignments", () => {
    it("creates rows, returns the documented shape and notifies each person", async () => {
      const { orgId, adminId, traineeId, trainingId, admin } = await setup();
      const dueDate = dateIn(30);

      const data = await assign(admin, trainingId, [traineeId, traineeId], dueDate);

      expect(data.skipped_user_ids).toEqual([]);
      expect(data.created).toHaveLength(1);
      expect(data.created[0]).toEqual({
        id: expect.any(Number),
        training_id: trainingId,
        user_id: traineeId,
        user_name: expect.any(String),
        user_surname: expect.any(String),
        due_date: dueDate,
        status: "pending",
        completed_at: null,
        completed_by: null,
        assigned_by: adminId,
        created_at: expect.any(String),
      });
      expect(assignedNotice).toHaveBeenCalledTimes(1);
      expect(assignedNotice).toHaveBeenCalledWith(
        orgId,
        traineeId,
        expect.objectContaining({ id: trainingId, name: "AI literacy", dueDate }),
        expect.stringMatching(/^Test/),
        expect.any(String),
      );
    });

    it("keeps the save when a notice fails", async () => {
      const { traineeId, trainingId, admin } = await setup();
      assignedNotice.mockRejectedValueOnce(new Error("notice failed"));

      const { created } = await assign(admin, trainingId, [traineeId]);

      expect(created).toHaveLength(1);
      expect(await countRows(trainingId)).toBe(1);
    });

    it("skips people already assigned: their date stays and they get no email", async () => {
      const { orgId, traineeId, trainingId, admin } = await setup();
      const otherId = await user(orgId, 3);
      const first = await assign(admin, trainingId, [traineeId], dateIn(30));
      assignedNotice.mockClear();

      const second = await assign(admin, trainingId, [traineeId, otherId], dateIn(60));

      expect(second.skipped_user_ids).toEqual([traineeId]);
      expect(second.created.map((row) => row.user_id)).toEqual([otherId]);
      expect((await storedRow(first.created[0].id)).due_date).toBe(dateIn(30));
      expect(assignedNotice).toHaveBeenCalledTimes(1);
      expect(assignedNotice.mock.calls[0][1]).toBe(otherId);
    });

    it("rejects the whole request when one person is outside the organization", async () => {
      const { traineeId, trainingId, admin } = await setup();
      const otherOrg = await createTestOrganization("Elsewhere");
      const outsiderId = await user(otherOrg);

      const res = await admin
        .post(BASE)
        .send({ training_id: trainingId, user_ids: [traineeId, outsiderId], due_date: dateIn(5) });

      expect(res.status).toBe(400);
      expect(await countRows(trainingId)).toBe(0);
      expect(assignedNotice).not.toHaveBeenCalled();
    });

    it("accepts someone who belongs to several organizations", async () => {
      const { orgId, trainingId, admin } = await setup();
      const otherOrg = await createTestOrganization("Home");
      const sharedUserId = await user(otherOrg);
      await sequelize.query(
        `INSERT INTO organization_members (organization_id, user_id, role_id)
         VALUES (:orgId, :sharedUserId, 3)`,
        { replacements: { orgId, sharedUserId } },
      );

      const { created } = await assign(admin, trainingId, [sharedUserId]);

      expect(created[0].user_id).toBe(sharedUserId);
    });

    it("rejects past and invalid dates, and bad people lists", async () => {
      const { traineeId, trainingId, admin } = await setup();
      const bodies = [
        { training_id: trainingId, user_ids: [traineeId], due_date: dateIn(-1) },
        { training_id: trainingId, user_ids: [traineeId], due_date: "2026-02-30" },
        { training_id: trainingId, user_ids: [], due_date: dateIn(5) },
        { training_id: "x", user_ids: [traineeId], due_date: dateIn(5) },
      ];

      for (const body of bodies) {
        expect((await admin.post(BASE).send(body)).status).toBe(400);
      }
      expect(await countRows(trainingId)).toBe(0);
    });

    it("is 404 for a training in another organization", async () => {
      const { traineeId, admin } = await setup();
      const otherOrg = await createTestOrganization("Elsewhere");
      const foreignTraining = await createTraining(otherOrg);

      const res = await admin
        .post(BASE)
        .send({ training_id: foreignTraining, user_ids: [traineeId], due_date: dateIn(5) });

      expect(res.status).toBe(404);
    });

    it("marks the due-soon reminder as sent only when the date is close", async () => {
      const { orgId, traineeId, trainingId, admin } = await setup();
      const otherId = await user(orgId, 3);
      const near = await assign(admin, trainingId, [traineeId], dateIn(7));
      const far = await assign(admin, trainingId, [otherId], dateIn(8));

      expect((await storedRow(near.created[0].id)).due_soon_reminded_at).not.toBeNull();
      expect((await storedRow(far.created[0].id)).due_soon_reminded_at).toBeNull();
    });
  });

  describe("reads", () => {
    it("lists open first by due date, and 400/404 for a bad or foreign training", async () => {
      const { orgId, traineeId, trainingId, admin } = await setup();
      const secondId = await user(orgId, 3);
      const thirdId = await user(orgId, 3);
      const a = await assign(admin, trainingId, [traineeId], dateIn(20));
      const b = await assign(admin, trainingId, [secondId], dateIn(10));
      const c = await assign(admin, trainingId, [thirdId], dateIn(5));
      await admin.post(`${BASE}/${c.created[0].id}/complete`);

      const res = await admin.get(`${BASE}?training_id=${trainingId}`);

      expect(res.body.data.map((row: any) => row.id)).toEqual([
        b.created[0].id,
        a.created[0].id,
        c.created[0].id,
      ]);
      expect(res.body.data[2].status).toBe("completed");

      expect((await admin.get(`${BASE}?training_id=abc`)).status).toBe(400);
      const otherOrg = await createTestOrganization("Elsewhere");
      const foreignTraining = await createTraining(otherOrg);
      expect((await admin.get(`${BASE}?training_id=${foreignTraining}`)).status).toBe(404);
    });

    it("shows the caller's own assignments with the training details", async () => {
      const { orgId, traineeId, trainingId, admin } = await setup();
      const trainee = await apiAs(orgId, traineeId, 3);
      await assign(admin, trainingId, [traineeId]);

      const res = await trainee.get(`${BASE}/mine`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        training_id: trainingId,
        training_name: "AI literacy",
        training_duration: "2 hours",
        training_provider: "Acme",
        training_description: "Basics",
        status: "pending",
      });
    });

    it("summarizes totals and derives overdue", async () => {
      const { orgId, traineeId, trainingId, admin } = await setup();
      const secondId = await user(orgId, 3);
      const thirdId = await user(orgId, 3);
      await createTraining(orgId, "Nobody assigned");
      const { created } = await assign(admin, trainingId, [traineeId, secondId, thirdId]);
      await admin.post(`${BASE}/${created[0].id}/complete`);
      await setDueDate(created[1].id, dateIn(-2));

      const res = await admin.get(`${BASE}/summary`);

      expect(res.body.data).toEqual([
        { training_id: trainingId, total: 3, completed: 1, overdue: 1 },
      ]);
      const list = await admin.get(`${BASE}?training_id=${trainingId}`);
      expect(list.body.data.find((row: any) => row.id === created[1].id).status).toBe("overdue");
    });

    it("hides people who left, and keeps their row for when they return", async () => {
      const { orgId, traineeId, trainingId, admin } = await setup();
      const { created } = await assign(admin, trainingId, [traineeId]);
      await leaveOrganization(traineeId, orgId);

      const list = await admin.get(`${BASE}?training_id=${trainingId}`);
      const summary = await admin.get(`${BASE}/summary`);
      const action = await admin.post(`${BASE}/${created[0].id}/complete`);
      const all = await admin.post(`${BASE}/complete-all`).send({ training_id: trainingId });

      expect(list.body.data).toEqual([]);
      expect(summary.body.data).toEqual([]);
      expect(action.status).toBe(404);
      expect(all.body.data).toEqual({ completed: 0 });
      expect(await countRows(trainingId)).toBe(1);
    });
  });

  describe("completion", () => {
    it("lets the assignee complete and reopen their own", async () => {
      const { orgId, traineeId, trainingId, admin } = await setup();
      const trainee = await apiAs(orgId, traineeId, 3);
      const { created } = await assign(admin, trainingId, [traineeId]);
      const id = created[0].id;

      const done = await trainee.post(`${BASE}/${id}/complete`);
      expect(done.status).toBe(200);
      expect(done.body.data).toMatchObject({ status: "completed", completed_by: traineeId });

      const reopened = await trainee.post(`${BASE}/${id}/reopen`);
      expect(reopened.status).toBe(200);
      expect(reopened.body.data).toMatchObject({
        status: "pending",
        completed_at: null,
        completed_by: null,
      });
    });

    it("allows a read-only role to complete only their own", async () => {
      const { orgId, traineeId, trainingId, admin } = await setup();
      const auditorId = await user(orgId, 4);
      const auditor = await apiAs(orgId, auditorId, 4);
      const { created } = await assign(admin, trainingId, [auditorId, traineeId]);
      const own = created.find((row) => row.user_id === auditorId)!;
      const others = created.find((row) => row.user_id === traineeId)!;

      expect((await auditor.post(`${BASE}/${own.id}/complete`)).status).toBe(200);
      expect((await auditor.post(`${BASE}/${others.id}/complete`)).status).toBe(403);
      expect((await auditor.post(`${BASE}/${others.id}/reopen`)).status).toBe(403);
      expect((await storedRow(others.id)).completed_at).toBeNull();
    });

    it("keeps the first completion when completed again", async () => {
      const { orgId, adminId, traineeId, trainingId, admin } = await setup();
      const trainee = await apiAs(orgId, traineeId, 3);
      const { created } = await assign(admin, trainingId, [traineeId]);
      const id = created[0].id;

      const first = await trainee.post(`${BASE}/${id}/complete`);
      const second = await admin.post(`${BASE}/${id}/complete`);

      expect(second.status).toBe(200);
      expect(second.body.data.completed_at).toBe(first.body.data.completed_at);
      expect(second.body.data.completed_by).toBe(traineeId);
      expect(second.body.data.completed_by).not.toBe(adminId);
    });

    it("completes every open assignment and leaves finished ones alone", async () => {
      const { orgId, adminId, traineeId, trainingId, admin } = await setup();
      const secondId = await user(orgId, 3);
      const trainee = await apiAs(orgId, traineeId, 3);
      const { created } = await assign(admin, trainingId, [traineeId, secondId]);
      await trainee.post(`${BASE}/${created[0].id}/complete`);

      const res = await admin.post(`${BASE}/complete-all`).send({ training_id: trainingId });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ completed: 1 });
      expect((await storedRow(created[0].id)).completed_by).toBe(traineeId);
      expect((await storedRow(created[1].id)).completed_by).toBe(adminId);
    });

    it("answers 404 for an unknown assignment and 400 for a bad id", async () => {
      const { admin } = await setup();
      expect((await admin.post(`${BASE}/999999/complete`)).status).toBe(404);
      expect((await admin.post(`${BASE}/abc/complete`)).status).toBe(400);
      expect((await admin.patch(`${BASE}/999999`).send({ due_date: dateIn(1) })).status).toBe(404);
      expect((await admin.delete(`${BASE}/999999`)).status).toBe(404);
    });
  });

  describe("PATCH and DELETE", () => {
    it("changes the date and restarts the reminders", async () => {
      const { traineeId, trainingId, admin } = await setup();
      const { created } = await assign(admin, trainingId, [traineeId], dateIn(30));
      const id = created[0].id;
      await sequelize.query(
        `UPDATE training_assignments
            SET due_soon_reminded_at = now(), overdue_reminded_at = now() WHERE id = :id`,
        { replacements: { id } },
      );

      const far = await admin.patch(`${BASE}/${id}`).send({ due_date: dateIn(20) });
      expect(far.status).toBe(200);
      expect(far.body.data.due_date).toBe(dateIn(20));
      let stored = await storedRow(id);
      expect(stored.due_soon_reminded_at).toBeNull();
      expect(stored.overdue_reminded_at).toBeNull();

      await admin.patch(`${BASE}/${id}`).send({ due_date: dateIn(3) });
      stored = await storedRow(id);
      expect(stored.due_soon_reminded_at).not.toBeNull();
      expect(stored.overdue_reminded_at).toBeNull();
    });

    it("leaves the reminders alone when the date does not change", async () => {
      const { traineeId, trainingId, admin } = await setup();
      const dueDate = dateIn(30);
      const { created } = await assign(admin, trainingId, [traineeId], dueDate);
      const id = created[0].id;
      await sequelize.query(
        `UPDATE training_assignments
            SET due_soon_reminded_at = '2026-01-01', overdue_reminded_at = '2026-01-02'
          WHERE id = :id`,
        { replacements: { id } },
      );

      await admin.patch(`${BASE}/${id}`).send({ due_date: dueDate });

      const stored = await storedRow(id);
      expect(stored.due_soon_reminded_at).not.toBeNull();
      expect(stored.overdue_reminded_at).not.toBeNull();
    });

    it("rejects a past date on PATCH", async () => {
      const { traineeId, trainingId, admin } = await setup();
      const dueDate = dateIn(30);
      const { created } = await assign(admin, trainingId, [traineeId], dueDate);

      const res = await admin.patch(`${BASE}/${created[0].id}`).send({ due_date: dateIn(-1) });

      expect(res.status).toBe(400);
      expect((await storedRow(created[0].id)).due_date).toBe(dueDate);
    });

    it("removes an assignment", async () => {
      const { traineeId, trainingId, admin } = await setup();
      const { created } = await assign(admin, trainingId, [traineeId]);

      expect((await admin.delete(`${BASE}/${created[0].id}`)).status).toBe(200);
      expect(await countRows(trainingId)).toBe(0);
    });
  });

  describe("reminder sweep over the real tables", () => {
    it("reminds once per kind, and never someone who left or finished", async () => {
      const { orgId, traineeId, trainingId, admin } = await setup();
      const dueSoonId = await user(orgId, 3);
      const leftId = await user(orgId, 3);
      const finishedId = await user(orgId, 3);
      const farId = await user(orgId, 3);
      const { created } = await assign(admin, trainingId, [
        traineeId,
        dueSoonId,
        leftId,
        finishedId,
        farId,
      ]);
      const idOf = (userId: number) => created.find((row) => row.user_id === userId)!.id;
      await setDueDate(idOf(traineeId), dateIn(-1));
      await setDueDate(idOf(dueSoonId), dateIn(3));
      await setDueDate(idOf(leftId), dateIn(-1));
      await setDueDate(idOf(finishedId), dateIn(-1));
      await admin.post(`${BASE}/${idOf(finishedId)}/complete`);
      await leaveOrganization(leftId, orgId);

      const summary = await runTrainingAssignmentReminderSweep(orgId);

      expect(summary).toEqual({ organization_id: orgId, candidates: 2, notified: 2 });
      expect(reminderNotice.mock.calls.map((call) => [call[1], call[3]])).toEqual([
        [traineeId, "overdue"],
        [dueSoonId, "due_soon"],
      ]);
      expect((await storedRow(idOf(traineeId))).overdue_reminded_at).not.toBeNull();
      expect((await storedRow(idOf(dueSoonId))).due_soon_reminded_at).not.toBeNull();

      reminderNotice.mockClear();
      const again = await runTrainingAssignmentReminderSweep(orgId);
      expect(again).toEqual({ organization_id: orgId, candidates: 0, notified: 0 });
      expect(reminderNotice).not.toHaveBeenCalled();
    });

    it("sends an overdue notice to someone already told it was due soon", async () => {
      const { orgId, traineeId, trainingId, admin } = await setup();
      const { created } = await assign(admin, trainingId, [traineeId], dateIn(3));
      expect((await storedRow(created[0].id)).due_soon_reminded_at).not.toBeNull();
      await setDueDate(created[0].id, dateIn(-1));

      const summary = await runTrainingAssignmentReminderSweep(orgId);

      expect(summary.notified).toBe(1);
      expect((await storedRow(created[0].id)).overdue_reminded_at).not.toBeNull();
    });

    it("retries a failed send on the next run", async () => {
      const { orgId, traineeId, trainingId, admin } = await setup();
      const { created } = await assign(admin, trainingId, [traineeId]);
      await setDueDate(created[0].id, dateIn(-1));
      reminderNotice.mockRejectedValueOnce(new Error("smtp down"));

      const failed = await runTrainingAssignmentReminderSweep(orgId);
      expect(failed.notified).toBe(0);
      expect((await storedRow(created[0].id)).overdue_reminded_at).toBeNull();

      const retried = await runTrainingAssignmentReminderSweep(orgId);
      expect(retried.notified).toBe(1);
      expect((await storedRow(created[0].id)).overdue_reminded_at).not.toBeNull();
    });
  });
});
