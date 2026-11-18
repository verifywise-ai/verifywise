jest.setTimeout(60000);

import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser, seedFrameworks } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { getStructureById } from "../../structures";

/**
 * A rejected upload answers with a 4xx and a message, not a bare 500. Covers a
 * bundled framework requirement (the evidence upload that used to fail) and a
 * second route that shares the same handler.
 */

const SOC2 = 5;

describe("rejected uploads", () => {
  beforeAll(async () => {
    await seedFrameworks();
  });

  afterEach(async () => {
    await cleanupDatabase();
    await seedFrameworks();
  });

  async function setup() {
    const orgId = await createTestOrganization();
    const adminId = await createTestUser(orgId, 1, `up-${Date.now()}@test.com`, "Pw123456!");
    const app = await createTestApp({
      bypassAuth: true,
      mockUser: { userId: adminId, organizationId: orgId, role: "Admin" },
    });
    return { adminId, api: testRequest(app) };
  }

  it("PATCH a framework requirement with an unsupported file answers 415 and leaves the row alone", async () => {
    const { adminId, api } = await setup();
    const created = await api.post("/api/v1/projects").send({
      project_title: "Claims triage",
      owner: adminId,
      start_date: "2026-06-01",
      geography: 1,
      members: [],
      framework: [SOC2],
      is_organizational: true,
    });
    expect(created.status).toBe(201);

    const soc2 = getStructureById(SOC2)!;
    const [[row]] = (await sequelize.query(
      `SELECT id, status FROM ${soc2.tables.l2_impl} ORDER BY id LIMIT 1`,
    )) as [Array<{ id: number; status: string }>, unknown];

    const res = await api
      .patch(`/api/frameworks/${SOC2}/impl/l2/${row.id}`)
      .field("status", "Implemented")
      .attach("files", Buffer.from("notes"), { filename: "notes.txt", contentType: "text/plain" });

    expect(res.status).toBe(415);
    expect(res.body.data).toMatch(/^Unsupported file type/);

    const [[after]] = (await sequelize.query(
      `SELECT status FROM ${soc2.tables.l2_impl} WHERE id = :id`,
      { replacements: { id: row.id } },
    )) as [Array<{ status: string }>, unknown];
    expect(after.status).toBe(row.status);
  });

  it("POST /api/files with an unsupported file answers 415", async () => {
    const { api } = await setup();

    const res = await api
      .post("/api/files")
      .attach("files", Buffer.from("notes"), { filename: "notes.txt", contentType: "text/plain" });

    expect(res.status).toBe(415);
    expect(res.body.data).toMatch(/^Unsupported file type/);
  });
});
