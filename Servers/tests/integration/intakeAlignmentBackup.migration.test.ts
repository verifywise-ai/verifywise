/**
 * 20261024110000 centers left-aligned intake forms, records which ones it
 * moved, and its down() puts them back.
 */
import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";

const center = require("../../database/migrations/20261024110000-intake-form-alignment-center.js");

const queryInterface = { sequelize };

const createForm = async (orgId: number, userId: number, slug: string, design: object | null) => {
  const [{ id }] = await sequelize.query<{ id: number }>(
    `INSERT INTO intake_forms (organization_id, name, description, slug, entity_type, created_by, design_settings)
     VALUES (:orgId, :slug, '', :slug, 'use_case', :userId, CAST(:design AS jsonb))
     RETURNING id`,
    {
      replacements: {
        orgId,
        userId,
        slug,
        design: design === null ? null : JSON.stringify(design),
      },
      type: QueryTypes.SELECT,
    },
  );
  return id;
};

const designOf = async (id: number) =>
  (
    await sequelize.query<{ design_settings: Record<string, unknown> | null }>(
      `SELECT design_settings FROM intake_forms WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    )
  )[0].design_settings;

const setDesign = (id: number, design: object) =>
  sequelize.query(
    `UPDATE intake_forms SET design_settings = CAST(:design AS jsonb) WHERE id = :id`,
    {
      replacements: { id, design: JSON.stringify(design) },
    },
  );

const recorded = () =>
  sequelize.query<{ form_id: number; organization_id: number; previous_alignment: string }>(
    `SELECT form_id, organization_id, previous_alignment
       FROM intake_forms_alignment_backup ORDER BY form_id`,
    { type: QueryTypes.SELECT },
  );

const setup = async () => {
  const suffix = Date.now();
  const orgId = await createTestOrganization(`Org ${suffix}`);
  const userId = await createTestUser(orgId, 1, `admin-${suffix}@test.com`, "Password123!");
  return {
    orgId,
    form: (slug: string, design: object | null) =>
      createForm(orgId, userId, `${slug}-${suffix}`, design),
  };
};

// The record table cascades from intake_forms, so cleanupDatabase empties it.
afterEach(cleanupDatabase);

// down() drops the record table; leave the schema as the migration left it.
afterAll(() => center.up(queryInterface));

describe("migration 20261024110000: center left-aligned intake forms", () => {
  it("centers only left-aligned forms, keeps their other settings, and records them", async () => {
    const { orgId, form } = await setup();
    const left = await form("left", { alignment: "left", primaryColor: "#123456" });
    const centred = await form("center", { alignment: "center" });
    const unset = await form("unset", null);

    await center.up(queryInterface);

    expect(await designOf(left)).toEqual({ alignment: "center", primaryColor: "#123456" });
    expect(await designOf(centred)).toEqual({ alignment: "center" });
    expect(await designOf(unset)).toBeNull();
    expect(await recorded()).toEqual([
      { form_id: left, organization_id: orgId, previous_alignment: "left" },
    ]);
  });

  it("still runs when a left-aligned form has no organization", async () => {
    const { form } = await setup();
    const orphan = await form("orphan", { alignment: "left" });
    await sequelize.query(`UPDATE intake_forms SET organization_id = NULL WHERE id = :id`, {
      replacements: { id: orphan },
    });

    await center.up(queryInterface);

    expect(await designOf(orphan)).toEqual({ alignment: "center" });
    expect(await recorded()).toEqual([
      { form_id: orphan, organization_id: null, previous_alignment: "left" },
    ]);
  });

  it("restores one form's alignment by hand without undoing later design edits", async () => {
    const { form } = await setup();
    const left = await form("left", { alignment: "left", primaryColor: "#123456" });
    await center.up(queryInterface);
    // The owner edits the form after the deploy.
    await setDesign(left, { alignment: "center", primaryColor: "#ff0000", logo: "new.png" });

    // The restore documented in the migration header.
    await sequelize.query(
      `UPDATE intake_forms f
          SET design_settings = jsonb_set(f.design_settings, '{alignment}', to_jsonb(b.previous_alignment))
         FROM intake_forms_alignment_backup b
        WHERE f.id = b.form_id AND f.id = :id`,
      { replacements: { id: left } },
    );

    expect(await designOf(left)).toEqual({
      alignment: "left",
      primaryColor: "#ff0000",
      logo: "new.png",
    });
  });

  it("down() puts left back on recorded forms still centered, keeps owner choices, drops the record", async () => {
    const { form } = await setup();
    const stillCentred = await form("a", { alignment: "left", primaryColor: "#123456" });
    const ownerPicked = await form("b", { alignment: "left" });
    const alwaysCentred = await form("c", { alignment: "center" });
    await center.up(queryInterface);
    await setDesign(ownerPicked, { alignment: "right" });

    await center.down(queryInterface);

    expect(await designOf(stillCentred)).toEqual({ alignment: "left", primaryColor: "#123456" });
    expect(await designOf(ownerPicked)).toEqual({ alignment: "right" });
    expect(await designOf(alwaysCentred)).toEqual({ alignment: "center" });
    const [{ present }] = await sequelize.query<{ present: boolean }>(
      `SELECT to_regclass('verifywise.intake_forms_alignment_backup') IS NOT NULL AS present`,
      { type: QueryTypes.SELECT },
    );
    expect(present).toBe(false);
  });
});
