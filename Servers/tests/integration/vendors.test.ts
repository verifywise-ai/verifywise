import { QueryTypes } from "sequelize";
import { createTestApp, testRequest } from "./setup";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";

const ADMIN_EMAIL = "vendor-admin@test.com";
const ADMIN_PASSWORD = "VendorAdmin1!";

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

  describe("the other names of a vendor", () => {
    const asAdmin = () =>
      createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

    // The answer to a create or an update does not carry the scorecard columns, nor this one, so
    // what is stored is read back with a GET.
    const storedNames = async (app: Awaited<ReturnType<typeof asAdmin>>, id: number) => {
      const read = await testRequest(app).get(`/api/vendors/${id}`);
      expect(read.status).toBe(200);
      return read.body.data.other_names;
    };

    it("keeps them from creation, as a tidy list", async () => {
      const app = await asAdmin();

      const created = await testRequest(app)
        .post("/api/vendors")
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
        .post("/api/vendors")
        .send({ ...validVendorPayload, assignee: userId });

      expect(created.status).toBe(201);
      expect(await storedNames(app, created.body.data.id)).toBeNull();
    });

    it("changes them on update, keeps them when another field is updated, and clears them with an empty text", async () => {
      const app = await asAdmin();
      const created = await testRequest(app)
        .post("/api/vendors")
        .send({ ...validVendorPayload, assignee: userId, other_names: "Facebook" });
      const id = created.body.data.id;
      const url = `/api/vendors/${id}`;

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
        .post("/api/vendors")
        .send({ ...validVendorPayload, assignee: userId, other_names: "Facebook" });
      const id = created.body.data.id;

      const onCreate = await testRequest(app)
        .post("/api/vendors")
        .send({ ...validVendorPayload, assignee: userId, other_names });
      const onUpdate = await testRequest(app).patch(`/api/vendors/${id}`).send({ other_names });

      expect(onCreate.status).toBe(400);
      expect(onUpdate.status).toBe(400);
      expect(await storedNames(app, id)).toBe("Facebook");
    });
  });

  describe("the identifiers of a vendor", () => {
    const asAdmin = () =>
      createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role: "Admin" },
      });

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

    const stored = async (app: Awaited<ReturnType<typeof asAdmin>>, id: number) => {
      const read = await testRequest(app).get(`/api/vendors/${id}`);
      expect(read.status).toBe(200);
      const { country, registration_number, lei, sec_cik } = read.body.data;
      return { country, registration_number, lei, sec_cik };
    };

    const vendorCount = async () => {
      const [row] = await sequelize.query<{ count: string }>(
        "SELECT COUNT(*) AS count FROM vendors WHERE organization_id = :orgId",
        { replacements: { orgId }, type: QueryTypes.SELECT },
      );
      return Number(row.count);
    };

    it("keeps the four from creation, in the form they are stored", async () => {
      const app = await asAdmin();

      const created = await testRequest(app)
        .post("/api/vendors")
        .send({ ...validVendorPayload, assignee: userId, ...IDENTIFIERS });

      expect(created.status).toBe(201);
      expect(await stored(app, created.body.data.id)).toEqual(STORED);
    });

    it("changes one on update, keeps the others, and clears one with an empty text", async () => {
      const app = await asAdmin();
      const created = await testRequest(app)
        .post("/api/vendors")
        .send({ ...validVendorPayload, assignee: userId, ...IDENTIFIERS });
      const id = created.body.data.id;

      const changed = await testRequest(app).patch(`/api/vendors/${id}`).send({ country: "fr" });
      expect(changed.status).toBe(202);
      expect(await stored(app, id)).toEqual({ ...STORED, country: "FR" });

      const cleared = await testRequest(app).patch(`/api/vendors/${id}`).send({ sec_cik: "" });
      expect(cleared.status).toBe(202);
      expect(await stored(app, id)).toEqual({ ...STORED, country: "FR", sec_cik: null });
    });

    it("an invalid LEI answers 400 and stores nothing", async () => {
      const app = await asAdmin();
      const created = await testRequest(app)
        .post("/api/vendors")
        .send({ ...validVendorPayload, assignee: userId, ...IDENTIFIERS });
      const id = created.body.data.id;
      const before = await vendorCount();

      const onCreate = await testRequest(app)
        .post("/api/vendors")
        .send({ ...validVendorPayload, assignee: userId, lei: WRONG_LEI });
      const onUpdate = await testRequest(app)
        .patch(`/api/vendors/${id}`)
        .send({ lei: WRONG_LEI, country: "fr" });

      expect(onCreate.status).toBe(400);
      expect(onUpdate.status).toBe(400);
      expect(await vendorCount()).toBe(before);
      expect(await stored(app, id)).toEqual(STORED);
    });

    it('the change history names them "Country", "Registration number", "LEI" and "SEC CIK"', async () => {
      const app = await asAdmin();
      const created = await testRequest(app)
        .post("/api/vendors")
        .send({ ...validVendorPayload, assignee: userId, ...IDENTIFIERS });
      const id = created.body.data.id;
      await testRequest(app).patch(`/api/vendors/${id}`).send({ country: "fr" });

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
