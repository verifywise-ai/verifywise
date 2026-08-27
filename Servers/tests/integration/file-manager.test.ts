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
import {
  createTestOrganization,
  createTestUser,
  cleanupDatabase,
  seedTwoOrgsAndUsers,
} from "./helpers";

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
  // Phase 2: authorization, tenant isolation, validation, transactions

  describe("role authorization", () => {
    it("rejects upload, delete and metadata update for Auditor (403)", async () => {
      const admin = adminApp();
      const fileId = await uploadFile(admin);
      const auditor = adminApp("Auditor");

      const uploadRes = await testRequest(auditor)
        .post("/api/file-manager")
        .attach("file", Buffer.from(CSV_BODY), {
          filename: "policy.csv",
          contentType: "text/csv",
        });
      expect(uploadRes.status).toBe(403);

      const patchRes = await testRequest(auditor)
        .patch(`/api/file-manager/${fileId}/metadata`)
        .send({ review_status: "approved" });
      expect(patchRes.status).toBe(403);

      const deleteRes = await testRequest(auditor).delete(`/api/file-manager/${fileId}`);
      expect(deleteRes.status).toBe(403);
    });

    it("allows Auditor to read the file list (200)", async () => {
      await uploadFile(adminApp());

      const res = await testRequest(adminApp("Auditor")).get("/api/file-manager");

      expect(res.status).toBe(200);
      expect(res.body.data.files).toHaveLength(1);
    });

    it("allows Editor to upload, update metadata and delete", async () => {
      const editor = adminApp("Editor");

      const uploadRes = await testRequest(editor)
        .post("/api/file-manager")
        .attach("file", Buffer.from(CSV_BODY), {
          filename: "editor.csv",
          contentType: "text/csv",
        });
      expect(uploadRes.status).toBe(201);
      const fileId = uploadRes.body.data.id;

      const patchRes = await testRequest(editor)
        .patch(`/api/file-manager/${fileId}/metadata`)
        .send({ review_status: "approved" });
      expect(patchRes.status).toBe(200);

      const deleteRes = await testRequest(editor).delete(`/api/file-manager/${fileId}`);
      expect(deleteRes.status).toBe(200);
    });

    it("allows Reviewer to upload (201)", async () => {
      const res = await testRequest(adminApp("Reviewer"))
        .post("/api/file-manager")
        .attach("file", Buffer.from(CSV_BODY), {
          filename: "reviewer.csv",
          contentType: "text/csv",
        });

      expect(res.status).toBe(201);
    });
  });

  describe("tenant isolation", () => {
    it("keeps one organization's files invisible and undeletable from another", async () => {
      const { orgA, orgB, userA, userB } = await seedTwoOrgsAndUsers(1);

      const appA = createTestApp({
        bypassAuth: true,
        mockUser: { userId: userA, organizationId: orgA, role: "Admin" },
      });
      const appB = createTestApp({
        bypassAuth: true,
        mockUser: { userId: userB, organizationId: orgB, role: "Admin" },
      });

      const uploadRes = await testRequest(appA)
        .post("/api/file-manager")
        .attach("file", Buffer.from(CSV_BODY), {
          filename: "org-a-secret.csv",
          contentType: "text/csv",
        });
      expect(uploadRes.status).toBe(201);
      const fileId = uploadRes.body.data.id;

      // Org B cannot see it in the list.
      const listB = await testRequest(appB).get("/api/file-manager");
      expect(listB.status).toBe(200);
      expect(listB.body.data.files).toEqual([]);

      // Org B cannot download it. getFileById is scoped by organization_id, so a
      // cross-org id is indistinguishable from a missing one: 404, not 403.
      const downloadB = await testRequest(appB).get(`/api/file-manager/${fileId}`);
      expect(downloadB.status).toBe(404);

      const metadataB = await testRequest(appB).get(`/api/file-manager/${fileId}/metadata`);
      expect(metadataB.status).toBe(404);

      // Org B cannot delete it...
      const deleteB = await testRequest(appB).delete(`/api/file-manager/${fileId}`);
      expect(deleteB.status).toBe(404);

      // ...and the row is still there. This is the assertion that matters most:
      // only a real database proves the organization_id predicate actually
      // reaches the emitted SQL.
      const rows = (await sequelize.query(`SELECT id FROM files WHERE id = :fileId`, {
        replacements: { fileId },
        type: "SELECT" as any,
      })) as any[];
      expect(rows).toHaveLength(1);

      // And org A still sees it.
      const listA = await testRequest(appA).get("/api/file-manager");
      expect(listA.body.data.files).toHaveLength(1);
    });
  });

  describe("validation and upload errors", () => {
    it("rejects a file whose extension and MIME type disagree (415)", async () => {
      const res = await testRequest(adminApp())
        .post("/api/file-manager")
        .attach("file", Buffer.from("PK"), {
          filename: "payload.csv",
          contentType: "application/zip",
        });

      expect(res.status).toBe(415);
      expect(res.body.data).toContain("Unsupported file type");
    });

    it("rejects a multipart upload with no file part (400)", async () => {
      const res = await testRequest(adminApp())
        .post("/api/file-manager")
        .field("source", "File Manager");

      expect(res.status).toBe(400);
    });

    it("returns 500 for a request with no body at all", async () => {
      // Documented, not endorsed: uploadFile reads req.body.model_id before its
      // `if (!file)` guard, so a request with no multipart body throws on the
      // undefined body and lands in the 500 handler instead of returning 400.
      // Locked in so a future fix to 400 is a deliberate, visible change.
      const res = await testRequest(adminApp()).post("/api/file-manager");

      expect(res.status).toBe(500);
    });

    it("rejects an invalid review_status (400)", async () => {
      const app = adminApp();
      const fileId = await uploadFile(app);

      const res = await testRequest(app)
        .patch(`/api/file-manager/${fileId}/metadata`)
        .send({ review_status: "not-a-status" });

      expect(res.status).toBe(400);
    });

    it("rejects a non-numeric file id (400)", async () => {
      const res = await testRequest(adminApp()).get("/api/file-manager/abc");

      expect(res.status).toBe(400);
    });

    it("returns 404 for a well-formed id that does not exist", async () => {
      const res = await testRequest(adminApp()).get("/api/file-manager/999999");

      expect(res.status).toBe(404);
    });
  });

  describe("transactional delete", () => {
    it("clears folder mappings and entity links together with the file", async () => {
      const app = adminApp();
      const fileId = await uploadFile(app);

      const [folder] = (await sequelize.query(
        `INSERT INTO virtual_folders (organization_id, name, created_by)
         VALUES (:orgId, 'Evidence', :userId) RETURNING id`,
        { replacements: { orgId, userId }, type: "SELECT" as any },
      )) as any[];

      await sequelize.query(
        `INSERT INTO file_folder_mappings (organization_id, file_id, folder_id, assigned_by)
         VALUES (:orgId, :fileId, :folderId, :userId)`,
        { replacements: { orgId, fileId, folderId: folder.id, userId } },
      );

      await sequelize.query(
        `INSERT INTO file_entity_links
           (organization_id, file_id, framework_type, entity_type, entity_id, created_by)
         VALUES (:orgId, :fileId, 'eu_ai_act', 'control', 1, :userId)`,
        { replacements: { orgId, fileId, userId } },
      );

      /** Row count in a side table linked to this file. */
      const countLinks = async (table: string) => {
        const rows = (await sequelize.query(
          `SELECT COUNT(*)::int AS count FROM ${table} WHERE file_id = :fileId`,
          { replacements: { fileId }, type: "SELECT" as any },
        )) as any[];
        return rows[0].count as number;
      };

      /** The files row itself keys on id, not file_id. */
      const countFile = async () => {
        const rows = (await sequelize.query(
          `SELECT COUNT(*)::int AS count FROM files WHERE id = :fileId`,
          { replacements: { fileId }, type: "SELECT" as any },
        )) as any[];
        return rows[0].count as number;
      };

      expect(await countLinks("file_folder_mappings")).toBe(1);
      expect(await countLinks("file_entity_links")).toBe(1);
      expect(await countFile()).toBe(1);

      const res = await testRequest(app).delete(`/api/file-manager/${fileId}`);
      expect(res.status).toBe(200);

      // deleteFileById wraps all three statements in one transaction; assert they
      // committed together rather than trusting the 200.
      expect(await countLinks("file_folder_mappings")).toBe(0);
      expect(await countLinks("file_entity_links")).toBe(0);
      expect(await countFile()).toBe(0);
    });
  });
});
