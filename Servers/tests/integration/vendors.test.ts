jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { createTestApp, testRequest } from "./setup";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import type { TenantContext } from "./tenant-isolation/tenantIsolation.harness";
import { createTestVendor } from "../factories";

const ADMIN_EMAIL = "vendor-admin@test.com";
const ADMIN_PASSWORD = "VendorAdmin1!";

/** A made-up LEI: 18 characters of no real entity and their check digits (ISO 17442). */
const BASE = "TEST00ACMEANALYT01";
const digits = `${BASE}00`.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
const LEI = `${BASE}${String(98 - [...digits].reduce((rest, digit) => (rest * 10 + Number(digit)) % 97, 0)).padStart(2, "0")}`;
/** The LEI with its first check digit changed. */
const WRONG_LEI = `${LEI.slice(0, 18)}${LEI[18] === "9" ? "8" : "9"}${LEI[19]}`;

const IDENTIFIERS = {
  country: "de",
  registration_number: "  HRB   12345 B ",
  lei: LEI.toLowerCase(),
  sec_cik: "320193",
};
const STORED = {
  country: "DE",
  registration_number: "HRB 12345 B",
  lei: LEI,
  sec_cik: "0000320193",
};

/** What the change history calls the other names and the four identifiers. */
const FIVE_LABELS = ["Other names", "Country", "Registration number", "LEI", "SEC CIK"];
/** A vendor that has none of the five. */
const NONE = {
  other_names: null,
  country: null,
  registration_number: null,
  lei: null,
  sec_cik: null,
};

describe("Vendors API", () => {
  let orgId: number;
  let userId: number;

  beforeEach(async () => {
    orgId = await createTestOrganization();
    userId = await createTestUser(orgId, 1, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  const validVendorPayload = {
    vendor_name: "Test Vendor Inc",
    vendor_provides: "AI Model Evaluation Services",
    website: "https://testvendor.example.com",
    vendor_contact_person: "John Doe",
  };

  const asAdmin = () =>
    createTestApp({
      bypassAuth: true,
      mockUser: { userId, organizationId: orgId, role: "Admin" },
    });

  type AdminApp = Awaited<ReturnType<typeof asAdmin>>;

  /** The identifiers of a vendor as the legacy read returns them (a read whose code did not change). */
  const stored = async (app: AdminApp, id: number) => {
    const read = await testRequest(app).get(`/api/vendors/${id}`);
    expect(read.status).toBe(200);
    const { country, registration_number, lei, sec_cik } = read.body.data;
    return { country, registration_number, lei, sec_cik };
  };

  /** The other names and the identifiers of a vendor as the legacy read returns them. */
  const storedFive = async (app: AdminApp, id: number) => ({
    other_names: (await testRequest(app).get(`/api/vendors/${id}`)).body.data.other_names,
    ...(await stored(app, id)),
  });

  const vendorCount = async (organizationId: number = orgId) => {
    const [row] = await sequelize.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM vendors WHERE organization_id = :organizationId",
      { replacements: { organizationId }, type: QueryTypes.SELECT },
    );
    return Number(row.count);
  };

  /** The names of the fields the change history of a vendor records, oldest first. */
  const fieldsRecorded = async (id: number, action?: "created" | "updated") => {
    const history = await sequelize.query<{ field_name: string }>(
      `SELECT field_name FROM vendor_change_history
        WHERE organization_id = :orgId AND vendor_id = :id
          AND (CAST(:action AS TEXT) IS NULL OR action = CAST(:action AS TEXT))
        ORDER BY id`,
      { replacements: { orgId, id, action: action ?? null }, type: QueryTypes.SELECT },
    );
    return history.map((entry) => entry.field_name);
  };

  describe("POST /api/vendors", () => {
    it("creates a vendor with bypassAuth (201)", async () => {
      const app = await createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      const res = await testRequest(app)
        .post("/api/vendors")
        .send({ ...validVendorPayload, assignee: userId });

      expect(res.status).toBe(201);
      expect(res.body.data.vendor_name).toBe("Test Vendor Inc");
      expect(res.body.data.assignee).toBe(userId);
    });

    it("creates a vendor with real JWT from login (201)", async () => {
      const app = await createTestApp();

      const loginRes = await testRequest(app)
        .post("/api/users/login")
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
      expect(loginRes.status).toBe(202);
      const token = loginRes.body.data.token;

      const res = await testRequest(app)
        .post("/api/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...validVendorPayload, assignee: userId });

      expect(res.status).toBe(201);
      expect(res.body.data.vendor_name).toBe("Test Vendor Inc");
    });

    it("returns 400 for missing required assignee", async () => {
      const app = await createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      const res = await testRequest(app)
        .post("/api/vendors")
        .send({ vendor_name: "Incomplete Vendor" });

      expect(res.status).toBe(400);
    });
  });

  describe("the other names of a vendor, through /api/v1/vendors", () => {
    // The answer to a create or an update does not carry the scorecard columns, nor this one, so
    // what is stored is read back with a GET (a read whose code did not change: it stays on /api/vendors).
    const storedNames = async (app: AdminApp, id: number) => {
      const read = await testRequest(app).get(`/api/vendors/${id}`);
      expect(read.status).toBe(200);
      return read.body.data.other_names;
    };

    it("keeps them from creation, as a tidy list", async () => {
      const app = await asAdmin();

      const created = await testRequest(app)
        .post("/api/v1/vendors")
        .send({
          ...validVendorPayload,
          assignee: userId,
          other_names: "  Facebook ,Instagram;  facebook\nWhatsApp ",
        });

      expect(created.status).toBe(201);
      expect(await storedNames(app, created.body.data.id)).toBe("Facebook, Instagram, WhatsApp");
    });

    it("leaves a vendor created without them with none", async () => {
      const app = await asAdmin();

      const created = await testRequest(app)
        .post("/api/v1/vendors")
        .send({ ...validVendorPayload, assignee: userId });

      expect(created.status).toBe(201);
      expect(await storedNames(app, created.body.data.id)).toBeNull();
    });

    it("changes them on update, keeps them when another field is updated, and clears them with an empty text", async () => {
      const app = await asAdmin();
      const created = await testRequest(app)
        .post("/api/v1/vendors")
        .send({ ...validVendorPayload, assignee: userId, other_names: "Facebook" });
      const id = created.body.data.id;
      const url = `/api/v1/vendors/${id}`;

      const changed = await testRequest(app).patch(url).send({ other_names: "Instagram, Threads" });
      expect(changed.status).toBe(202);
      expect(await storedNames(app, id)).toBe("Instagram, Threads");

      const untouched = await testRequest(app).patch(url).send({ vendor_provides: "Social media" });
      expect(untouched.status).toBe(202);
      expect(await storedNames(app, id)).toBe("Instagram, Threads");

      const cleared = await testRequest(app).patch(url).send({ other_names: "" });
      expect(cleared.status).toBe(202);
      expect(await storedNames(app, id)).toBeNull();
    });

    it.each([
      ["more than 8 names", Array.from({ length: 9 }, (_, n) => `Name ${n}`).join(", ")],
      ["a name of one character", "Facebook, A"],
      ["a name of more than 80 characters", `Facebook, ${"x".repeat(81)}`],
      ["more than 500 characters", `${"x".repeat(60)}, `.repeat(9)],
    ])("refuses %s on creation and on update", async (_label, other_names) => {
      const app = await asAdmin();
      const created = await testRequest(app)
        .post("/api/v1/vendors")
        .send({ ...validVendorPayload, assignee: userId, other_names: "Facebook" });
      const id = created.body.data.id;

      const onCreate = await testRequest(app)
        .post("/api/v1/vendors")
        .send({ ...validVendorPayload, assignee: userId, other_names });
      const onUpdate = await testRequest(app).patch(`/api/v1/vendors/${id}`).send({ other_names });

      expect(onCreate.status).toBe(400);
      expect(onUpdate.status).toBe(400);
      expect(await storedNames(app, id)).toBe("Facebook");
    });
  });

  describe("the identifiers of a vendor, through /api/v1/vendors", () => {
    it("keeps the four from creation, in the form they are stored", async () => {
      const app = await asAdmin();

      const created = await testRequest(app)
        .post("/api/v1/vendors")
        .send({ ...validVendorPayload, assignee: userId, ...IDENTIFIERS });

      expect(created.status).toBe(201);
      expect(await stored(app, created.body.data.id)).toEqual(STORED);
    });

    it("changes one on update, keeps the others, and clears one with an empty text", async () => {
      const app = await asAdmin();
      const created = await testRequest(app)
        .post("/api/v1/vendors")
        .send({ ...validVendorPayload, assignee: userId, ...IDENTIFIERS });
      const id = created.body.data.id;

      const changed = await testRequest(app).patch(`/api/v1/vendors/${id}`).send({ country: "fr" });
      expect(changed.status).toBe(202);
      expect(await stored(app, id)).toEqual({ ...STORED, country: "FR" });

      const cleared = await testRequest(app).patch(`/api/v1/vendors/${id}`).send({ sec_cik: "" });
      expect(cleared.status).toBe(202);
      expect(await stored(app, id)).toEqual({ ...STORED, country: "FR", sec_cik: null });
    });

    it("an invalid LEI answers 400 and stores nothing", async () => {
      const app = await asAdmin();
      const created = await testRequest(app)
        .post("/api/v1/vendors")
        .send({ ...validVendorPayload, assignee: userId, ...IDENTIFIERS });
      const id = created.body.data.id;
      const before = await vendorCount();

      const onCreate = await testRequest(app)
        .post("/api/v1/vendors")
        .send({ ...validVendorPayload, assignee: userId, lei: WRONG_LEI });
      const onUpdate = await testRequest(app)
        .patch(`/api/v1/vendors/${id}`)
        .send({ lei: WRONG_LEI, country: "fr" });

      expect(onCreate.status).toBe(400);
      expect(onUpdate.status).toBe(400);
      expect(await vendorCount()).toBe(before);
      expect(await stored(app, id)).toEqual(STORED);
    });

    it('the change history names them "Country", "Registration number", "LEI" and "SEC CIK"', async () => {
      const app = await asAdmin();
      const created = await testRequest(app)
        .post("/api/v1/vendors")
        .send({ ...validVendorPayload, assignee: userId, ...IDENTIFIERS });
      const id = created.body.data.id;
      await testRequest(app).patch(`/api/v1/vendors/${id}`).send({ country: "fr" });

      const history = await sequelize.query<{
        field_name: string;
        action: string;
        old_value: string;
        new_value: string;
      }>(
        `SELECT field_name, action, old_value, new_value FROM vendor_change_history
          WHERE organization_id = :orgId AND vendor_id = :id ORDER BY id`,
        { replacements: { orgId, id }, type: QueryTypes.SELECT },
      );

      const LABELS = ["Country", "Registration number", "LEI", "SEC CIK"];
      expect(
        history
          .filter((entry) => LABELS.includes(entry.field_name))
          .map(({ field_name, action, new_value }) => [field_name, action, new_value]),
      ).toEqual([
        ["Country", "created", "DE"],
        ["Registration number", "created", "HRB 12345 B"],
        ["LEI", "created", LEI],
        ["SEC CIK", "created", "0000320193"],
        ["Country", "updated", "FR"],
      ]);
      expect(history.find((entry) => entry.action === "updated")).toMatchObject({
        field_name: "Country",
        old_value: "DE",
      });
    });
  });

  // ADR 0001 section 11: a legacy endpoint that gets a versioned counterpart needs a parity test. The
  // other names and the identifiers are request fields that the frozen legacy create and update
  // never had, and only /api/v1 takes them. On the legacy paths nothing reads them, as before they
  // existed: the answers are the same as without them, nothing of them is stored or changed, and the
  // change history says nothing about them.
  describe("the legacy POST and PATCH /api/vendors keep the frozen contract for the other names and the identifiers", () => {
    it("a create with valid values of all five answers 201 and stores none of them", async () => {
      const app = await asAdmin();

      const created = await testRequest(app)
        .post("/api/vendors")
        .send({
          ...validVendorPayload,
          assignee: userId,
          other_names: "Facebook, Instagram",
          ...IDENTIFIERS,
        });

      expect(created.status).toBe(201);
      const id = created.body.data.id;
      expect(await storedFive(app, id)).toEqual(NONE);
      const recorded = await fieldsRecorded(id);
      // Positive control: the history of the create is there, and says nothing about the five.
      expect(recorded).toContain("Vendor name");
      for (const label of FIVE_LABELS) expect(recorded).not.toContain(label);
    });

    it("a create with invalid values answers 201 too, and stores nothing for them", async () => {
      const app = await asAdmin();

      const created = await testRequest(app)
        .post("/api/vendors")
        .send({
          ...validVendorPayload,
          assignee: userId,
          other_names: "A",
          country: "XX",
          registration_number: "x".repeat(65),
          lei: WRONG_LEI,
          sec_cik: "abc",
        });

      expect(created.status).toBe(201);
      expect(await storedFive(app, created.body.data.id)).toEqual(NONE);
    });

    it("an update leaves what /api/v1 stored, whatever it sends for the five, and records nothing about them", async () => {
      const app = await asAdmin();
      const created = await testRequest(app)
        .post("/api/v1/vendors")
        .send({ ...validVendorPayload, assignee: userId, other_names: "Facebook", ...IDENTIFIERS });
      expect(created.status).toBe(201);
      const id = created.body.data.id;
      // Positive control: /api/v1 stored them, so there is something for the update to change.
      const before = await storedFive(app, id);
      expect(before).toEqual({ other_names: "Facebook", ...STORED });

      // An empty text would clear a stored value, and an invalid one would be a 400, if they were read.
      const updated = await testRequest(app).patch(`/api/vendors/${id}`).send({
        vendor_provides: "Changed",
        other_names: "",
        country: "fr",
        lei: WRONG_LEI,
        sec_cik: "",
      });

      expect(updated.status).toBe(202);
      const read = await testRequest(app).get(`/api/vendors/${id}`);
      expect(read.body.data.vendor_provides).toBe("Changed");
      expect(await storedFive(app, id)).toEqual(before);
      // The one field the update changed is the only one the history records.
      expect(await fieldsRecorded(id, "updated")).toEqual(["Vendor provides"]);
    });

    it("an update that names only an invalid LEI answers 202 and changes nothing", async () => {
      const app = await asAdmin();
      const created = await testRequest(app)
        .post("/api/v1/vendors")
        .send({ ...validVendorPayload, assignee: userId, other_names: "Facebook", ...IDENTIFIERS });
      const id = created.body.data.id;
      const before = (await testRequest(app).get(`/api/vendors/${id}`)).body.data;
      expect(before.lei).toBe(LEI);

      const updated = await testRequest(app).patch(`/api/vendors/${id}`).send({ lei: WRONG_LEI });

      expect(updated.status).toBe(202);
      expect((await testRequest(app).get(`/api/vendors/${id}`)).body.data).toEqual(before);
      expect(await fieldsRecorded(id, "updated")).toEqual([]);
    });
  });

  // ADR 0001 section 11 for the versioned create and update: 401 without a token, 403 for a role that
  // may not write, tenant isolation (tenant-isolation/vendors.isolation.test.ts) and the happy path
  // (the two blocks above that go through /api/v1).
  describe("the vendor writes under /api/v1 (ADR 0001 section 11)", () => {
    describe("authentication", () => {
      // The ids need not exist: the token is checked before anything looks at them.
      const WRITES: Array<[method: "post" | "patch", path: string]> = [
        ["post", "/api/v1/vendors"],
        ["patch", "/api/v1/vendors/1"],
      ];
      // The real authenticateJWT: no bypass, so the token decides.
      let anonymous: ReturnType<typeof testRequest>;

      beforeAll(async () => {
        anonymous = testRequest(await createTestApp());
      });

      it.each(WRITES)("%s %s: no token is a 400, Token not found", async (method, path) => {
        const res = await anonymous[method](path);

        expect(res.status).toBe(400);
        expect(res.body.data.message).toBe("Token not found");
      });

      it.each(WRITES)("%s %s: a token that is not valid is a 401", async (method, path) => {
        const res = await anonymous[method](path).set("Authorization", "Bearer invalid");

        expect(res.status).toBe(401);
      });
    });

    /** A request agent for another role of the same organization and user. */
    async function requestAs(role: string, ctx: TenantContext) {
      const app = await createTestApp({
        bypassAuth: true,
        mockUser: { userId: ctx.userId, organizationId: ctx.orgId, role },
      });
      return testRequest(app);
    }

    it.each([
      [2, "Reviewer"],
      [4, "Auditor"],
    ])("refuses the role %i (%s) with 403 and writes nothing", async (roleId) => {
      const { owner } = await seedTwoTenantContexts(roleId);
      const vendorId = await createTestVendor(owner.orgId, { vendor_name: "Acme Corp" });
      // The factory stores no assignee, which an update of the vendor would refuse with a 400.
      await sequelize.query(
        "UPDATE vendors SET assignee = :assignee WHERE id = :vendorId AND organization_id = :organizationId",
        { replacements: { assignee: owner.userId, vendorId, organizationId: owner.orgId } },
      );
      const body = { ...validVendorPayload, assignee: owner.userId, country: "de" };
      // Positive control: an Editor of the same organization creates and updates through /api/v1, so
      // the 403s below are the permission and not a missing route or an invalid body.
      const editor = await requestAs("Editor", owner);
      const created = await editor.post("/api/v1/vendors").send(body);
      expect(created.status).toBe(201);
      const updated = await editor.patch(`/api/v1/vendors/${vendorId}`).send({ country: "de" });
      expect(updated.status).toBe(202);
      const countBefore = await vendorCount(owner.orgId);
      const readCountry = async () => {
        const [row] = await sequelize.query<{ country: string | null }>(
          "SELECT country FROM vendors WHERE id = :vendorId AND organization_id = :organizationId",
          { replacements: { vendorId, organizationId: owner.orgId }, type: QueryTypes.SELECT },
        );
        return row.country;
      };
      expect(await readCountry()).toBe("DE");

      const onCreate = await owner.request.post("/api/v1/vendors").send(body);
      const onUpdate = await owner.request
        .patch(`/api/v1/vendors/${vendorId}`)
        .send({ country: "fr" });

      expect(onCreate.status).toBe(403);
      expect(onUpdate.status).toBe(403);
      expect(await vendorCount(owner.orgId)).toBe(countBefore);
      expect(await readCountry()).toBe("DE");
    });

    it("serves no copy of the unchanged vendor routes", async () => {
      const app = await asAdmin();
      const vendorId = await createTestVendor(orgId, { vendor_name: "Acme Corp" });
      // Positive control: the vendor exists and the legacy read finds it, so a 404 below can only mean
      // that there is no route.
      expect((await testRequest(app).get(`/api/vendors/${vendorId}`)).status).toBe(200);

      const answers = [
        await testRequest(app).get("/api/v1/vendors"),
        await testRequest(app).get(`/api/v1/vendors/${vendorId}`),
        await testRequest(app).get(`/api/v1/vendors/project-id/${vendorId}`),
        await testRequest(app).get(`/api/v1/vendors/${vendorId}/riskSuggestions`),
        await testRequest(app).delete(`/api/v1/vendors/${vendorId}`),
      ];

      expect(answers.map((res) => res.status)).toEqual([404, 404, 404, 404, 404]);
      expect(await vendorCount()).toBe(1);
      expect((await testRequest(app).get(`/api/vendors/${vendorId}`)).status).toBe(200);
    });
  });

  describe("GET /api/vendors", () => {
    it("returns empty list when no vendors exist", async () => {
      const app = await createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      const res = await testRequest(app).get("/api/vendors");

      expect([200, 204]).toContain(res.status);
    });

    it("returns created vendor in list", async () => {
      const app = await createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

      await testRequest(app)
        .post("/api/vendors")
        .send({ ...validVendorPayload, assignee: userId });

      const res = await testRequest(app).get("/api/vendors");

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.map((v: any) => v.vendor_name)).toContain("Test Vendor Inc");
    });
  });
});
