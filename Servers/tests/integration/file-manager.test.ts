/**
 * File Manager API — integration tests (Phase 1: lifecycle and response contract)
 *
 * These run against a real database and the real middleware chain. The controller
 * itself is already unit-tested in controllers/__tests__/fileManager.ctrl.test.ts with
 * the repository mocked, so this suite deliberately does not re-assert controller
 * branching. What it covers is everything that mocking hides: real SQL and
 * organization scoping, the BYTEA round-trip, and the HTTP envelope the frontend
 * destructures.
 *
 * Note on rate limiting: every /api/file-manager route mounts fileOperationsLimiter,
 * which — unlike the auth and generalApi limiters — is NOT relaxed in test
 * (100 requests / 15 min, per IP, module-level MemoryStore). Jest gives each test file
 * a fresh module registry, so the budget resets per file but not between tests here.
 * Keep this file under ~80 file-manager requests; a `429 Too many file operation
 * requests` is that limiter, not a test failure.
 */

import { sequelize } from "../../database/db";
import { createTestApp, testRequest } from "./setup";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";

const ADMIN_EMAIL = "file-manager-admin@test.com";
const ADMIN_PASSWORD = "FileManagerAdmin1!";

/** A tiny upload whose extension and MIME type agree, as fileFilter requires. */
const CSV_BODY = "col_a,col_b\n1,2\n";

describe("File Manager API", () => {
  let orgId: number;
  let userId: number;

  beforeEach(async () => {
    orgId = await createTestOrganization();
    userId = await createTestUser(orgId, 1, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  function adminApp(role = "Admin") {
    return createTestApp({
      bypassAuth: true,
      mockUser: { userId, organizationId: orgId, role },
    });
  }

  /** Upload one file and return the created row's id. */
  async function uploadFile(
    app: ReturnType<typeof adminApp>,
    filename = "policy.csv",
    body = CSV_BODY,
  ): Promise<number> {
    const res = await testRequest(app)
      .post("/api/file-manager")
      .attach("file", Buffer.from(body), { filename, contentType: "text/csv" });

    expect(res.status).toBe(201);
    return res.body.data.id;
  }

  describe("POST /api/file-manager", () => {
    it("uploads a file and returns its metadata (201)", async () => {
      const app = adminApp();

      const res = await testRequest(app)
        .post("/api/file-manager")
        .attach("file", Buffer.from(CSV_BODY), {
          filename: "policy.csv",
          contentType: "text/csv",
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe("Created");
      expect(res.body.data).toMatchObject({
        filename: "policy.csv",
        mimetype: "text/csv",
        uploaded_by: userId,
        review_status: "draft",
      });
      expect(res.body.data.id).toEqual(expect.any(Number));
      expect(Number(res.body.data.size)).toBe(Buffer.byteLength(CSV_BODY));
    });

    it("persists the row as an org-level file scoped to the caller's organization", async () => {
      const app = adminApp();
      const fileId = await uploadFile(app);

      const [row] = (await sequelize.query(
        `SELECT organization_id, project_id, uploaded_by, filename, source, content
           FROM files WHERE id = :fileId`,
        { replacements: { fileId }, type: "SELECT" as any },
      )) as any[];

      expect(Number(row.organization_id)).toBe(orgId);
      // project_id IS NULL is what makes this an org-level file rather than a
      // project file — both live in the same `files` table.
      expect(row.project_id).toBeNull();
      expect(Number(row.uploaded_by)).toBe(userId);
      expect(row.source).toBe("File Manager");
      expect(Buffer.from(row.content).toString()).toBe(CSV_BODY);
    });
  });

  describe("GET /api/file-manager", () => {
    it("returns the documented { data: { files, pagination } } envelope", async () => {
      const app = adminApp();
      await uploadFile(app);

      const res = await testRequest(app).get("/api/file-manager");

      expect(res.status).toBe(200);
      // The frontend reads response.data.data.files (see Clients'
      // getUserFilesMetaData), so this envelope is a real contract — and it is
      // exactly what a repository-mocked unit test cannot protect.
      expect(res.body).toHaveProperty("data.files");
      expect(res.body).toHaveProperty("data.pagination");
      expect(Array.isArray(res.body.data.files)).toBe(true);

      const [file] = res.body.data.files;
      expect(file).toMatchObject({
        filename: "policy.csv",
        mimetype: "text/csv",
        uploaded_by: userId,
      });
      // uploader_name/surname come from the JOIN on users, not the files row.
      expect(file.uploader_name).toEqual(expect.any(String));
      expect(file.formattedSize).toEqual(expect.any(String));
    });

    it("paginates and reports the true total across pages", async () => {
      const app = adminApp();
      await uploadFile(app, "first.csv");
      await uploadFile(app, "second.csv");
      await uploadFile(app, "third.csv");

      const res = await testRequest(app).get("/api/file-manager?page=1&pageSize=2");

      expect(res.status).toBe(200);
      expect(res.body.data.files).toHaveLength(2);
      expect(res.body.data.pagination).toMatchObject({
        total: 3,
        page: 1,
        pageSize: 2,
        totalPages: 2,
      });
    });

    it("returns an empty list rather than erroring when the org has no files", async () => {
      const res = await testRequest(adminApp()).get("/api/file-manager");

      expect(res.status).toBe(200);
      expect(res.body.data.files).toEqual([]);
      expect(res.body.data.pagination.total).toBe(0);
    });
  });

  describe("GET /api/file-manager/:id", () => {
    it("round-trips the stored bytes with download headers", async () => {
      const app = adminApp();
      const fileId = await uploadFile(app);

      // supertest parses the body by content type, which turns the download into
      // an object; collect the raw bytes instead so the comparison is real.
      const res = await testRequest(app)
        .get(`/api/file-manager/${fileId}`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          response.on("end", () => callback(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toContain("policy.csv");
      // Proves the BYTEA round-trip, not just that a 200 came back.
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect(res.body.toString()).toBe(CSV_BODY);
    });
  });

  describe("GET /api/file-manager/:id/metadata", () => {
    it("returns the metadata columns for the file", async () => {
      const app = adminApp();
      const fileId = await uploadFile(app);

      const res = await testRequest(app).get(`/api/file-manager/${fileId}/metadata`);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: fileId,
        filename: "policy.csv",
        review_status: "draft",
      });
      expect(res.body.data.tags).toEqual([]);
    });
  });

  describe("PATCH /api/file-manager/:id/metadata", () => {
    it("persists tags, review status, version and description", async () => {
      const app = adminApp();
      const fileId = await uploadFile(app);

      const updates = {
        tags: ["security", "gdpr"],
        review_status: "approved",
        version: "2.0",
        description: "Reviewed retention policy",
      };

      const patchRes = await testRequest(app)
        .patch(`/api/file-manager/${fileId}/metadata`)
        .send(updates);

      expect(patchRes.status).toBe(200);

      // Read back through the API rather than trusting the PATCH response alone.
      const getRes = await testRequest(app).get(`/api/file-manager/${fileId}/metadata`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data).toMatchObject({
        review_status: "approved",
        version: "2.0",
        description: "Reviewed retention policy",
      });
      expect(getRes.body.data.tags).toEqual(["security", "gdpr"]);
    });
  });

  describe("DELETE /api/file-manager/:id", () => {
    it("removes the row from the database", async () => {
      const app = adminApp();
      const fileId = await uploadFile(app);

      const res = await testRequest(app).delete(`/api/file-manager/${fileId}`);
      expect(res.status).toBe(200);

      const rows = (await sequelize.query(`SELECT id FROM files WHERE id = :fileId`, {
        replacements: { fileId },
        type: "SELECT" as any,
      })) as any[];

      expect(rows).toHaveLength(0);
    });
  });

  describe("GET /api/file-manager/with-metadata", () => {
    it("flags a file expiring inside the threshold and leaves a distant one unflagged", async () => {
      const app = adminApp();
      const expiringId = await uploadFile(app, "expiring.csv");
      const distantId = await uploadFile(app, "distant.csv");

      // Default daysUntilExpiry threshold is 30, so 10 days out is due and 200 is not.
      await sequelize.query(
        `UPDATE files SET expiry_date = CURRENT_DATE + INTERVAL '10 days' WHERE id = :id`,
        { replacements: { id: expiringId } },
      );
      await sequelize.query(
        `UPDATE files SET expiry_date = CURRENT_DATE + INTERVAL '200 days' WHERE id = :id`,
        { replacements: { id: distantId } },
      );

      const res = await testRequest(app).get("/api/file-manager/with-metadata");

      expect(res.status).toBe(200);
      const byId = Object.fromEntries(
        res.body.data.files.map((f: any) => [Number(f.id), f]),
      ) as Record<number, any>;

      // Asserting both directions keeps the flag discriminating rather than
      // incidentally true for every row.
      expect(byId[expiringId].is_due_for_update).toBe(true);
      expect(byId[distantId].is_due_for_update).toBe(false);
    });
  });
});
