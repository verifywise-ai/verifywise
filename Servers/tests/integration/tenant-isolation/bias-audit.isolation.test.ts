jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestProject } from "../../factories";

/**
 * Bias audit module tables: schema-level isolation. The module's routes arrive
 * with the controller task; until then this pins what the schema itself
 * guarantees: every row carries its organization, a query scoped by
 * organization_id never returns the other tenant's rows, and a row cannot be
 * attached to a different organization's project through the cascade chain.
 */

afterEach(async () => {
  await cleanupDatabase();
});

const insertProfile = async (orgId: number, projectId: number, userId: number) => {
  const [rows] = await sequelize.query(
    `INSERT INTO aedt_profiles
       (organization_id, project_id, framework_id, question_set_version, created_by)
     VALUES (:orgId, :projectId, 1, 1, :userId) RETURNING id`,
    { replacements: { orgId, projectId, userId } },
  );
  return (rows as any[])[0].id as number;
};

describe("bias audit tables tenant isolation", () => {
  it("scopes profiles, answers, runs and stances to the owning organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerProject = await createTestProject(owner.orgId, owner.userId);
    const attackerProject = await createTestProject(attacker.orgId, attacker.userId);
    const ownerProfile = await insertProfile(owner.orgId, ownerProject, owner.userId);
    await insertProfile(attacker.orgId, attackerProject, attacker.userId);

    await sequelize.query(
      `INSERT INTO aedt_profile_answers
         (organization_id, profile_id, question_key, question_set_version)
       VALUES (:orgId, :profileId, 'scope.uses_aedt', 1)`,
      { replacements: { orgId: owner.orgId, profileId: ownerProfile } },
    );
    const [runRows] = await sequelize.query(
      `INSERT INTO bias_audit_runs
         (organization_id, project_id, profile_id, profile_version, preset_id,
          question_set_version, metric)
       VALUES (:orgId, :projectId, :profileId, 1, 'nyc_ll144', 1, 'impact_ratio')
       RETURNING id`,
      { replacements: { orgId: owner.orgId, projectId: ownerProject, profileId: ownerProfile } },
    );
    await sequelize.query(
      `INSERT INTO bias_audit_stances
         (organization_id, project_id, run_id, scope_at_generation, profile_version,
          question_set_version)
       VALUES (:orgId, :projectId, :runId, 'full', 1, 1)`,
      {
        replacements: {
          orgId: owner.orgId,
          projectId: ownerProject,
          runId: (runRows as any[])[0].id,
        },
      },
    );

    for (const table of [
      "aedt_profiles",
      "aedt_profile_answers",
      "bias_audit_runs",
      "bias_audit_stances",
    ]) {
      const [ownerRows] = await sequelize.query(
        `SELECT organization_id FROM ${table} WHERE organization_id = :orgId`,
        { replacements: { orgId: owner.orgId } },
      );
      const [attackerRows] = await sequelize.query(
        `SELECT organization_id FROM ${table} WHERE organization_id = :orgId`,
        { replacements: { orgId: attacker.orgId } },
      );
      expect(ownerRows.length).toBeGreaterThan(0);
      expect((ownerRows as any[]).every((r) => r.organization_id === owner.orgId)).toBe(true);
      expect((attackerRows as any[]).every((r) => r.organization_id === attacker.orgId)).toBe(true);
    }
  });

  it("allows only one attested profile per project and framework", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId);
    const first = await insertProfile(owner.orgId, project, owner.userId);
    await sequelize.query(`UPDATE aedt_profiles SET status = 'attested' WHERE id = :first`, {
      replacements: { first },
    });
    const second = await sequelize
      .query(
        `INSERT INTO aedt_profiles
         (organization_id, project_id, framework_id, version, status, question_set_version)
       VALUES (:orgId, :project, 1, 2, 'attested', 1)`,
        { replacements: { orgId: owner.orgId, project } },
      )
      .then(
        () => "inserted",
        () => "rejected",
      );
    expect(second).toBe("rejected");
  });

  it("lets a project delete cascade through profiles and runs, and keeps stances", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId);
    const profile = await insertProfile(owner.orgId, project, owner.userId);
    const [runRows] = await sequelize.query(
      `INSERT INTO bias_audit_runs
         (organization_id, project_id, profile_id, profile_version, preset_id,
          question_set_version, metric)
       VALUES (:orgId, :project, :profile, 1, 'nyc_ll144', 1, 'impact_ratio') RETURNING id`,
      { replacements: { orgId: owner.orgId, project, profile } },
    );
    const runId = (runRows as any[])[0].id;
    await sequelize.query(
      `INSERT INTO bias_audit_stances
         (organization_id, project_id, run_id, scope_at_generation, profile_version,
          question_set_version)
       VALUES (:orgId, :project, :runId, 'full', 1, 1)`,
      { replacements: { orgId: owner.orgId, project, runId } },
    );

    // Deleting the run alone leaves the stance readable, run_id nulled.
    await sequelize.query(`DELETE FROM bias_audit_runs WHERE id = :runId`, {
      replacements: { runId },
    });
    const [stances] = await sequelize.query(
      `SELECT run_id FROM bias_audit_stances WHERE project_id = :project`,
      { replacements: { project } },
    );
    expect(stances).toEqual([{ run_id: null }]);

    // Deleting the project succeeds despite runs citing the profile.
    await sequelize.query(
      `INSERT INTO bias_audit_runs
         (organization_id, project_id, profile_id, profile_version, preset_id,
          question_set_version, metric)
       VALUES (:orgId, :project, :profile, 1, 'nyc_ll144', 1, 'impact_ratio')`,
      { replacements: { orgId: owner.orgId, project, profile } },
    );
    await expect(
      sequelize.query(`DELETE FROM projects WHERE id = :project`, { replacements: { project } }),
    ).resolves.toBeDefined();
  });
});
