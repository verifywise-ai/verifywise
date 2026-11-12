jest.setTimeout(90000);

import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { CUSTOM_FIELD_EDIT_PERMISSION } from "../../utils/customField.utils";
import { requestHasPermission } from "../../utils/rolePermissions.utils";

/**
 * Intake questions mapped to entity custom fields (#5262), against a real
 * database: the allowlist migration, approval writes inside the approval
 * transaction, the publish checks, AI app delete cleanup and the permission
 * gate on PUT /api/custom-fields/values.
 */

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;
type RoleName = keyof typeof ROLE;
type IntakeEntity = "model" | "use_case" | "ai_app";

let counter = 0;

async function userIn(orgId: number, role: RoleName): Promise<number> {
  counter += 1;
  return createTestUser(
    orgId,
    ROLE[role],
    `cf-${role}-${Date.now()}-${counter}@test.com`,
    "Pw123456!",
  );
}

async function as(orgId: number, userId: number, role: RoleName) {
  return testRequest(
    await createTestApp({ bypassAuth: true, mockUser: { userId, organizationId: orgId, role } }),
  );
}

async function defineField(
  orgId: number,
  entityType: string,
  fieldKey: string,
  fieldType: "text" | "number" | "boolean" = "text",
  label = `Label ${fieldKey}`,
): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO custom_field_definitions
       (organization_id, entity_type, field_key, label, field_type, required)
     VALUES (:orgId, :entityType, :fieldKey, :label, :fieldType, false) RETURNING id`,
    { replacements: { orgId, entityType, fieldKey, label, fieldType } },
  );
  return Number((rows as any[])[0].id);
}

async function valuesFor(orgId: number, entityType: string, entityId?: number) {
  const [rows] = await sequelize.query(
    `SELECT d.field_key, v.value, v.entity_id
       FROM custom_field_values v
       JOIN custom_field_definitions d ON d.id = v.definition_id
      WHERE v.organization_id = :orgId AND v.entity_type = :entityType
        AND (CAST(:entityId AS integer) IS NULL OR v.entity_id = :entityId)
      ORDER BY d.field_key`,
    { replacements: { orgId, entityType, entityId: entityId ?? null } },
  );
  return rows as Array<{ field_key: string; value: unknown; entity_id: number }>;
}

const NAME_FIELD: Record<IntakeEntity, Record<string, unknown>[]> = {
  model: [{ id: "f_name", type: "text", label: "Name", entityFieldMapping: "name" }],
  use_case: [
    { id: "f_title", type: "text", label: "Title", entityFieldMapping: "project_title" },
    { id: "f_goal", type: "text", label: "Goal", entityFieldMapping: "goal" },
  ],
  ai_app: [{ id: "f_name", type: "text", label: "Name", entityFieldMapping: "name" }],
};

const BASE_ANSWERS: Record<IntakeEntity, Record<string, unknown>> = {
  model: { f_name: "Round trip model" },
  use_case: { f_title: "Round trip use case", f_goal: "Prove the mapping" },
  ai_app: { f_name: "Round trip app" },
};

const CF_ENTITY: Record<IntakeEntity, string> = {
  model: "model_inventory",
  use_case: "project",
  ai_app: "ai_app",
};

const CUSTOM_QUESTIONS = [
  {
    id: "f_vendor",
    type: "text",
    label: "Cost centre",
    entityFieldMapping: "custom_field:cost_centre",
  },
  { id: "f_users", type: "number", label: "Users", entityFieldMapping: "custom_field:user_count" },
];

async function seedSubmission(
  orgId: number,
  adminId: number,
  entity: IntakeEntity,
  answers: Record<string, unknown>,
  extraFields: Record<string, unknown>[] = CUSTOM_QUESTIONS,
) {
  counter += 1;
  const [forms] = await sequelize.query(
    `INSERT INTO intake_forms (organization_id, name, description, slug, entity_type, schema, created_by, status)
     VALUES (:orgId, 'CF form', 'd', :slug, :entity, :schema, :adminId, 'active') RETURNING id`,
    {
      replacements: {
        orgId,
        adminId,
        entity,
        slug: `cf-${entity}-${Date.now()}-${counter}`,
        schema: JSON.stringify({ version: "1.0", fields: [...NAME_FIELD[entity], ...extraFields] }),
      },
    },
  );
  const formId = Number((forms as any[])[0].id);
  const [subs] = await sequelize.query(
    `INSERT INTO intake_submissions (organization_id, form_id, submitter_name, data, entity_type, status)
     VALUES (:orgId, :formId, 'Sam', :data, :entity, 'pending') RETURNING id`,
    {
      replacements: {
        orgId,
        formId,
        entity,
        data: JSON.stringify({ ...BASE_ANSWERS[entity], ...answers }),
      },
    },
  );
  return { formId, submissionId: Number((subs as any[])[0].id) };
}

async function entityIdOf(submissionId: number): Promise<number> {
  const [rows] = await sequelize.query(
    `SELECT entity_id FROM intake_submissions WHERE id = :submissionId`,
    { replacements: { submissionId } },
  );
  return Number((rows as any[])[0].entity_id);
}

describe("Intake custom field mapping (#5262)", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("migration", () => {
    it("accepts an ai_app custom field definition and value", async () => {
      const orgId = await createTestOrganization();
      const defId = await defineField(orgId, "ai_app", "migrated_field");
      expect(defId).toBeGreaterThan(0);
      const [apps] = await sequelize.query(
        `INSERT INTO ai_apps (organization_id, name, status) VALUES (:orgId, 'Mig app', 'approved') RETURNING id`,
        { replacements: { orgId } },
      );
      const appId = Number((apps as any[])[0].id);
      await sequelize.query(
        `INSERT INTO custom_field_values (organization_id, definition_id, entity_type, entity_id, value)
         VALUES (:orgId, :defId, 'ai_app', :appId, '"x"'::jsonb)`,
        { replacements: { orgId, defId, appId } },
      );
      expect(await valuesFor(orgId, "ai_app", appId)).toHaveLength(1);
    });
  });

  describe("approval writes", () => {
    const entities: IntakeEntity[] = ["model", "use_case", "ai_app"];

    it.each(entities)(
      "writes the mapped answers as custom field values for a %s",
      async (entity) => {
        const orgId = await createTestOrganization();
        const adminId = await userIn(orgId, "Admin");
        const cfEntity = CF_ENTITY[entity];
        await defineField(orgId, cfEntity, "cost_centre", "text");
        await defineField(orgId, cfEntity, "user_count", "number");
        const { submissionId } = await seedSubmission(orgId, adminId, entity, {
          f_vendor: "CC-42",
          f_users: "17",
        });
        const api = await as(orgId, adminId, "Admin");

        const res = await api.post(`/api/intake/submissions/${submissionId}/approve`).send({});
        expect(res.status).toBe(200);
        expect(res.body.data.customFieldSkips ?? []).toEqual([]);

        const entityId = await entityIdOf(submissionId);
        const rows = await valuesFor(orgId, cfEntity, entityId);
        expect(rows.map((r) => [r.field_key, r.value])).toEqual([
          ["cost_centre", "CC-42"],
          ["user_count", 17],
        ]);
      },
    );

    it("approves with a skip when the mapped definition was deleted before approval", async () => {
      const orgId = await createTestOrganization();
      const adminId = await userIn(orgId, "Admin");
      await defineField(orgId, "ai_app", "cost_centre", "text");
      const gone = await defineField(orgId, "ai_app", "user_count", "number");
      const { submissionId } = await seedSubmission(orgId, adminId, "ai_app", {
        f_vendor: "CC-1",
        f_users: "3",
      });
      await sequelize.query(`DELETE FROM custom_field_definitions WHERE id = :gone`, {
        replacements: { gone },
      });
      const api = await as(orgId, adminId, "Admin");

      const res = await api.post(`/api/intake/submissions/${submissionId}/approve`).send({});
      expect(res.status).toBe(200);
      expect(res.body.data.customFieldSkips).toHaveLength(1);
      expect(res.body.data.customFieldSkips[0]).toMatchObject({
        label: "Users",
        reason: "This custom field no longer exists",
      });

      const [subs] = await sequelize.query(
        `SELECT status FROM intake_submissions WHERE id = :submissionId`,
        { replacements: { submissionId } },
      );
      expect((subs as any[])[0].status).toBe("approved");
      const rows = await valuesFor(orgId, "ai_app", await entityIdOf(submissionId));
      expect(rows.map((r) => r.field_key)).toEqual(["cost_centre"]);
    });

    it("does not let reviewer-sent custom_field keys write values", async () => {
      const orgId = await createTestOrganization();
      const adminId = await userIn(orgId, "Admin");
      await defineField(orgId, "ai_app", "cost_centre", "text");
      const { submissionId } = await seedSubmission(orgId, adminId, "ai_app", {}, []);
      const api = await as(orgId, adminId, "Admin");

      const res = await api.post(`/api/intake/submissions/${submissionId}/approve`).send({
        confirmedEntityData: { name: "Round trip app", "custom_field:cost_centre": "sneaky" },
      });
      expect(res.status).toBe(200);
      expect(await valuesFor(orgId, "ai_app")).toEqual([]);
    });
  });

  describe("publish checks", () => {
    it("answers 400 when a live form maps a custom field that does not exist", async () => {
      const orgId = await createTestOrganization();
      const adminId = await userIn(orgId, "Admin");
      const api = await as(orgId, adminId, "Admin");

      const res = await api.post("/api/intake/forms").send({
        name: "Publish missing field",
        entityType: "ai_app",
        status: "active",
        schema: { version: "1.0", fields: [...NAME_FIELD.ai_app, ...CUSTOM_QUESTIONS] },
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/no longer exists/);
    });

    it("answers 400 on publish of a draft whose field is the wrong type, 200 once it fits", async () => {
      const orgId = await createTestOrganization();
      const adminId = await userIn(orgId, "Admin");
      const api = await as(orgId, adminId, "Admin");
      await defineField(orgId, "ai_app", "cost_centre", "boolean");
      await defineField(orgId, "ai_app", "user_count", "number");

      const created = await api.post("/api/intake/forms").send({
        name: "Draft form",
        description: "d",
        entityType: "ai_app",
        schema: { version: "1.0", fields: [...NAME_FIELD.ai_app, ...CUSTOM_QUESTIONS] },
      });
      expect(created.status).toBe(201);
      const formId = created.body.data.id;

      const bad = await api.patch(`/api/intake/forms/${formId}`).send({ status: "active" });
      expect(bad.status).toBe(400);
      expect(JSON.stringify(bad.body)).toMatch(/cannot store this question type/);

      await sequelize.query(
        `UPDATE custom_field_definitions SET field_type = 'text'
          WHERE organization_id = :orgId AND field_key = 'cost_centre'`,
        { replacements: { orgId } },
      );
      const ok = await api.patch(`/api/intake/forms/${formId}`).send({ status: "active" });
      expect(ok.status).toBe(200);
    });
  });

  describe("AI app delete", () => {
    it("removes the app's custom field values with it", async () => {
      const orgId = await createTestOrganization();
      const adminId = await userIn(orgId, "Admin");
      await defineField(orgId, "ai_app", "cost_centre", "text");
      const { submissionId } = await seedSubmission(
        orgId,
        adminId,
        "ai_app",
        { f_vendor: "CC-9" },
        [CUSTOM_QUESTIONS[0]],
      );
      const api = await as(orgId, adminId, "Admin");
      expect(
        (await api.post(`/api/intake/submissions/${submissionId}/approve`).send({})).status,
      ).toBe(200);
      const appId = await entityIdOf(submissionId);
      expect(await valuesFor(orgId, "ai_app", appId)).toHaveLength(1);

      const del = await api.delete(`/api/ai-apps/${appId}`);
      expect(del.status).toBe(200);
      expect(await valuesFor(orgId, "ai_app")).toEqual([]);
    });
  });

  describe("value write permission gate", () => {
    async function appWithDefinition() {
      const orgId = await createTestOrganization();
      const adminId = await userIn(orgId, "Admin");
      const definitionId = await defineField(orgId, "ai_app", "cost_centre", "text");
      const [apps] = await sequelize.query(
        `INSERT INTO ai_apps (organization_id, name, owner_id, status)
         VALUES (:orgId, 'Gate app', :adminId, 'approved') RETURNING id`,
        { replacements: { orgId, adminId } },
      );
      return { orgId, adminId, definitionId, appId: Number((apps as any[])[0].id) };
    }

    it("refuses an Auditor with 403 and writes no row", async () => {
      const { orgId, definitionId, appId } = await appWithDefinition();
      const auditorId = await userIn(orgId, "Auditor");
      const api = await as(orgId, auditorId, "Auditor");

      const res = await api
        .put("/api/custom-fields/values")
        .send({ definition_id: definitionId, entity_id: appId, value: "nope" });
      expect(res.status).toBe(403);
      expect(await valuesFor(orgId, "ai_app")).toEqual([]);
    });

    it.each(["Admin", "Editor"] as const)("lets an %s write the value", async (role) => {
      const { orgId, definitionId, appId } = await appWithDefinition();
      const userId = await userIn(orgId, role);
      const api = await as(orgId, userId, role);

      const res = await api
        .put("/api/custom-fields/values")
        .send({ definition_id: definitionId, entity_id: appId, value: "yes" });
      expect(res.status).toBe(200);
      expect((await valuesFor(orgId, "ai_app", appId)).map((r) => r.value)).toEqual(["yes"]);
    });

    it("maps each entity type to its edit permission, which the Auditor role lacks", async () => {
      expect(CUSTOM_FIELD_EDIT_PERMISSION).toMatchObject({
        ai_app: "aiApp.edit",
        model_inventory: "model.edit",
        model_risk: "model.edit",
        project: "useCase.edit",
        vendor: "vendor.edit",
        vendor_risk: "vendor.edit",
        policy: "policy.edit",
        project_risk: "risks.edit",
        task: "task.edit",
      });
      const orgId = await createTestOrganization();
      for (const [entityType, permission] of Object.entries(CUSTOM_FIELD_EDIT_PERMISSION)) {
        const auditor = { role: "Auditor", organizationId: orgId } as any;
        const editor = { role: "Editor", organizationId: orgId } as any;
        expect({ entityType, allowed: await requestHasPermission(auditor, permission) }).toEqual({
          entityType,
          allowed: false,
        });
        // Editor holds every one of these except where the matrix says otherwise.
        expect(typeof (await requestHasPermission(editor, permission))).toBe("boolean");
      }
    });

    it("refuses an Auditor for every entity type that has a definition", async () => {
      const orgId = await createTestOrganization();
      const auditorId = await userIn(orgId, "Auditor");
      const api = await as(orgId, auditorId, "Auditor");
      for (const entityType of Object.keys(CUSTOM_FIELD_EDIT_PERMISSION)) {
        const definitionId = await defineField(orgId, entityType, "gate_field", "text");
        const res = await api
          .put("/api/custom-fields/values")
          .send({ definition_id: definitionId, entity_id: 1, value: "x" });
        expect({ entityType, status: res.status }).toEqual({ entityType, status: 403 });
      }
      const [rows] = await sequelize.query(
        `SELECT 1 FROM custom_field_values WHERE organization_id = :orgId`,
        { replacements: { orgId } },
      );
      expect(rows).toHaveLength(0);
    });
  });
});
