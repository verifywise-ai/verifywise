jest.setTimeout(60000);

// Automations would enqueue to Redis after commit; nothing here needs them.
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));

// The reference check stays real; a test can make it pass once to stand in
// for a check that ran just before another transaction deleted the row.
jest.mock("../../utils/incidentManagement.utils", () => {
  const actual = jest.requireActual("../../utils/incidentManagement.utils");
  return { ...actual, validateIncidentReferences: jest.fn(actual.validateIncidentReferences) };
});

/**
 * A reference deleted after the incident's reference check (between the
 * check and the INSERT / UPDATE) fails the write's foreign key check. Create
 * and update answer that with the same 400 INVALID_REFERENCE body as a failed
 * check, not a 500, and write nothing.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase } from "./helpers";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestIncident, createTestProject } from "../factories";
import { validateIncidentReferences } from "../../utils/incidentManagement.utils";
import { updateIncident } from "../../services/incidentManagement.service";

const actualCheck = jest.requireActual<typeof import("../../utils/incidentManagement.utils")>(
  "../../utils/incidentManagement.utils",
).validateIncidentReferences;

const ROUTE = "/api/ai-incident-managements";
const checkReferences = validateIncidentReferences as jest.MockedFunction<
  typeof validateIncidentReferences
>;

const payload = (refs: Record<string, number | string>) => ({
  ai_project: "Support chatbot",
  type: "Malfunction",
  severity: "Serious",
  status: "Open",
  occurred_date: "2026-06-23",
  date_detected: "2026-06-23",
  reporter: "Ada Lovelace",
  approval_status: "Pending",
  categories_of_harm: ["Safety"],
  description: "The chatbot gave unsafe advice",
  relationship_causality: "Direct cause",
  ...refs,
});

const projectIdError = [
  {
    field: "project_id",
    message: "project_id does not reference an entity in your organization",
    code: "INVALID_REFERENCE",
  },
];

/** A use case of the organization that another transaction has since deleted. */
async function deletedProject(orgId: number, userId: number): Promise<number> {
  const projectId = await createTestProject(orgId, userId);
  await sequelize.query(`DELETE FROM projects WHERE id = :projectId`, {
    replacements: { projectId },
  });
  return projectId;
}

describe("a reference deleted after the incident reference check", () => {
  afterEach(async () => {
    // mockReset also drops a queued mockResolvedValueOnce a test did not use.
    checkReferences.mockReset();
    checkReferences.mockImplementation(actualCheck);
    await cleanupDatabase();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it("answers create with 400 INVALID_REFERENCE, not 500, and saves nothing", async () => {
    const { owner } = await seedTwoTenantContexts();
    const projectId = await deletedProject(owner.orgId, owner.userId);
    checkReferences.mockResolvedValueOnce([]);

    const res = await owner.request.post(ROUTE).send(payload({ project_id: projectId }));

    expect(res.status).toBe(400);
    expect(res.body?.data?.message).toBe("Incident creation validation failed");
    expect(res.body?.data?.errors).toEqual(projectIdError);
    const [{ count }] = (await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM ai_incident_managements`,
      { type: QueryTypes.SELECT },
    )) as { count: number }[];
    expect(count).toBe(0);
  });

  it("answers update with 400 INVALID_REFERENCE, not 500, and changes nothing", async () => {
    const { owner } = await seedTwoTenantContexts();
    const incidentId = await createTestIncident(owner.orgId, owner.userId);
    const projectId = await deletedProject(owner.orgId, owner.userId);
    checkReferences.mockResolvedValueOnce([]);

    const res = await owner.request
      .patch(`${ROUTE}/${incidentId}`)
      .send({ project_id: projectId, status: "Investigating" });

    expect(res.status).toBe(400);
    expect(res.body?.data?.errors).toEqual(projectIdError);
    const [row] = (await sequelize.query(
      `SELECT project_id, status FROM ai_incident_managements WHERE id = :incidentId`,
      { replacements: { incidentId }, type: QueryTypes.SELECT },
    )) as { project_id: number | null; status: string }[];
    expect(row).toEqual({ project_id: null, status: "Open" });
  });

  it("flags the caller's transaction as aborted when the update hits the FK", async () => {
    const { owner } = await seedTwoTenantContexts();
    const incidentId = await createTestIncident(owner.orgId, owner.userId);
    const projectId = await deletedProject(owner.orgId, owner.userId);
    checkReferences.mockResolvedValueOnce([]);

    const transaction = await sequelize.transaction();
    try {
      await expect(
        updateIncident(owner.orgId, incidentId, { project_id: projectId }, owner.userId, {
          transaction,
          access: { canEdit: true, canApprove: true },
        }),
      ).rejects.toMatchObject({
        name: "IncidentUpdateValidationError",
        transactionAborted: true,
        errors: [expect.objectContaining({ field: "project_id", code: "INVALID_REFERENCE" })],
      });
    } finally {
      await transaction.rollback();
    }
  });

  it("still answers a reference the check itself rejects with the same 400", async () => {
    const { owner } = await seedTwoTenantContexts();
    const projectId = await deletedProject(owner.orgId, owner.userId);

    const res = await owner.request.post(ROUTE).send(payload({ project_id: projectId }));

    expect(res.status).toBe(400);
    expect(res.body?.data?.errors).toEqual(projectIdError);
  });

  it("creates an incident with empty references ('') as having none", async () => {
    const { owner } = await seedTwoTenantContexts();

    const res = await owner.request
      .post(ROUTE)
      .send(payload({ project_id: "", model_inventory_id: "", assignee_id: "" }));

    expect(res.status).toBe(201);
    expect(res.body?.data?.project_id).toBeNull();
    expect(res.body?.data?.model_inventory_id).toBeNull();
    expect(res.body?.data?.assignee_id).toBeNull();
  });

  it("clears a reference sent as '' on update", async () => {
    const { owner } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);
    const incidentId = await createTestIncident(owner.orgId, owner.userId, {
      project_id: projectId,
    });

    const res = await owner.request.patch(`${ROUTE}/${incidentId}`).send({ project_id: "" });

    expect(res.status).toBe(200);
    expect(res.body?.data?.project_id).toBeNull();
  });

  it("creates an incident whose references are all valid", async () => {
    const { owner } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);

    const res = await owner.request
      .post(ROUTE)
      .send(payload({ project_id: projectId, assignee_id: owner.userId }));

    expect(res.status).toBe(201);
    expect(res.body?.data?.project_id).toBe(projectId);
    expect(res.body?.data?.assignee_id).toBe(owner.userId);
  });
});
