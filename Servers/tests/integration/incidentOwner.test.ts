jest.setTimeout(60000);

// Automations would enqueue to Redis after commit; nothing here needs them.
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));

import { cleanupDatabase } from "./helpers";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestIncident } from "../factories";
import { validateIncidentReferences } from "../../utils/incidentManagement.utils";

const ROUTE = "/api/ai-incident-managements";

const createPayload = (assigneeId: number) => ({
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
  assignee_id: assigneeId,
});

// Owners are checked against organization_members: users has no
// organization_id since the multi-organization migration, and reading it made
// every save of an incident with an owner fail with a 500.
describe("incident owner (assignee_id) against the database", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("accepts a member of the organization and refuses a user of another one", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    await expect(
      validateIncidentReferences({ assignee_id: owner.userId }, owner.orgId),
    ).resolves.toEqual([]);
    await expect(
      validateIncidentReferences({ assignee_id: attacker.userId }, owner.orgId),
    ).resolves.toEqual(["assignee_id"]);
  });

  it("creates an incident with an owner", async () => {
    const { owner } = await seedTwoTenantContexts();

    const res = await owner.request.post(ROUTE).send(createPayload(owner.userId));

    expect(res.status).toBe(201);
  });

  it("edits an incident that has an owner, including a field other than the owner", async () => {
    const { owner } = await seedTwoTenantContexts();
    const incidentId = await createTestIncident(owner.orgId, owner.userId, {
      assignee_id: owner.userId,
    });

    const res = await owner.request
      .patch(`${ROUTE}/${incidentId}`)
      .send({ status: "Investigating" });

    expect(res.status).toBe(200);
    expect(res.body?.data?.status).toBe("Investigating");
    expect(res.body?.data?.assignee_id).toBe(owner.userId);
  });

  it("refuses an owner from another organization with a 400 naming the field", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const incidentId = await createTestIncident(owner.orgId, owner.userId);

    const res = await owner.request
      .patch(`${ROUTE}/${incidentId}`)
      .send({ assignee_id: attacker.userId });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("assignee_id");
  });

  it("still edits an incident whose stored owner is no longer a member", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    // Stands in for an owner removed from the organization after assignment.
    const incidentId = await createTestIncident(owner.orgId, owner.userId, {
      assignee_id: attacker.userId,
    });

    const statusOnly = await owner.request
      .patch(`${ROUTE}/${incidentId}`)
      .send({ status: "Investigating" });
    expect(statusOnly.status).toBe(200);

    // The edit form sends the unchanged owner back with the other fields.
    const sameOwner = await owner.request
      .patch(`${ROUTE}/${incidentId}`)
      .send({ status: "Mitigated", assignee_id: attacker.userId });
    expect(sameOwner.status).toBe(200);
    expect(sameOwner.body?.data?.status).toBe("Mitigated");
  });
});
