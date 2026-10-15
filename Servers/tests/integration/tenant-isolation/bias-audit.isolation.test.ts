jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestProject } from "../../factories";
import {
  attestProfileQuery,
  createProfileVersionQuery,
  createRunQuery,
  createStanceQuery,
  upsertAnswerQuery,
} from "../../../utils/biasAudit.utils";

/**
 * Bias audit module tables: schema-level isolation. The module's routes arrive
 * with the controller task; until then this pins what the schema itself
 * guarantees: every row carries its organization, a query scoped by
 * organization_id never returns the other tenant's rows. The schema has no
 * composite foreign keys, so consistency down the FK chain (a row citing a
 * project, profile or run of the same organization) is enforced in the
 * application queries (Tasks 3 and 4); Task 12 adds route-level cross-tenant
 * tests.
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
  it("never returns the other organization's rows from an organization-scoped query", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ids: Record<string, Record<number, number>> = {
      aedt_profiles: {},
      aedt_profile_answers: {},
      bias_audit_runs: {},
      bias_audit_stances: {},
    };

    for (const ctx of [owner, attacker]) {
      const project = await createTestProject(ctx.orgId, ctx.userId);
      const profile = await insertProfile(ctx.orgId, project, ctx.userId);
      ids.aedt_profiles[ctx.orgId] = profile;
      const [answerRows] = await sequelize.query(
        `INSERT INTO aedt_profile_answers
           (organization_id, profile_id, question_key, question_set_version)
         VALUES (:orgId, :profile, 'scope.uses_aedt', 1) RETURNING id`,
        { replacements: { orgId: ctx.orgId, profile } },
      );
      ids.aedt_profile_answers[ctx.orgId] = (answerRows as any[])[0].id;
      const [runRows] = await sequelize.query(
        `INSERT INTO bias_audit_runs
           (organization_id, project_id, profile_id, profile_version, preset_id,
            question_set_version, metric)
         VALUES (:orgId, :project, :profile, 1, 'nyc_ll144', 1, 'impact_ratio')
         RETURNING id`,
        { replacements: { orgId: ctx.orgId, project, profile } },
      );
      const runId = (runRows as any[])[0].id;
      ids.bias_audit_runs[ctx.orgId] = runId;
      const [stanceRows] = await sequelize.query(
        `INSERT INTO bias_audit_stances
           (organization_id, project_id, run_id, scope_at_generation, profile_version,
            question_set_version)
         VALUES (:orgId, :project, :runId, 'full', 1, 1) RETURNING id`,
        { replacements: { orgId: ctx.orgId, project, runId } },
      );
      ids.bias_audit_stances[ctx.orgId] = (stanceRows as any[])[0].id;
    }

    for (const table of Object.keys(ids)) {
      const [ownerRows] = await sequelize.query(
        `SELECT id FROM ${table} WHERE organization_id = :orgId`,
        { replacements: { orgId: owner.orgId } },
      );
      const returned = (ownerRows as any[]).map((r) => r.id);
      expect(returned).toContain(ids[table][owner.orgId]);
      expect(returned).not.toContain(ids[table][attacker.orgId]);
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
        () => null,
        (err) => err,
      );
    expect(second).not.toBeNull();
    expect(second.original?.code ?? second.parent?.code).toBe("23505");
    expect(second.original?.constraint ?? second.parent?.constraint).toBe(
      "aedt_profiles_one_attested_uq",
    );
  });

  it("lets a project delete cascade through profiles, runs and stances", async () => {
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
    await sequelize.query(`DELETE FROM projects WHERE id = :project`, {
      replacements: { project },
    });
    for (const table of ["aedt_profiles", "bias_audit_runs", "bias_audit_stances"]) {
      const [remaining] = await sequelize.query(
        `SELECT id FROM ${table} WHERE project_id = :project`,
        { replacements: { project } },
      );
      expect(remaining).toEqual([]);
    }
  });

  it("refuses cross-organization references in the query layer and writes nothing", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId);
    const profile = await insertProfile(owner.orgId, project, owner.userId);
    const [runRows] = await sequelize.query(
      `INSERT INTO bias_audit_runs
         (organization_id, project_id, profile_id, profile_version, preset_id,
          question_set_version, metric)
       VALUES (:orgId, :project, :profile, 1, 'nyc_ll144', 1, 'impact_ratio') RETURNING id`,
      { replacements: { orgId: owner.orgId, project, profile } },
    );
    const runId = (runRows as any[])[0].id as number;
    const count = async (table: string) => {
      const [rows] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
      return (rows as any[])[0].n as number;
    };
    const before = {
      aedt_profiles: await count("aedt_profiles"),
      aedt_profile_answers: await count("aedt_profile_answers"),
      bias_audit_runs: await count("bias_audit_runs"),
      bias_audit_stances: await count("bias_audit_stances"),
    };
    const statusBefore = (
      (await sequelize.query(`SELECT status FROM aedt_profiles WHERE id = :profile`, {
        replacements: { profile },
      })) as any
    )[0];

    const asAttacker = (fn: (t: any) => Promise<unknown>) => sequelize.transaction((t) => fn(t));

    await expect(
      asAttacker((t) =>
        createProfileVersionQuery(
          {
            projectId: project,
            frameworkId: 1,
            version: 5,
            questionSetVersion: 1,
            createdBy: attacker.userId,
          },
          attacker.orgId,
          t,
        ),
      ),
    ).rejects.toThrow();
    await expect(
      asAttacker((t) =>
        upsertAnswerQuery(
          {
            profileId: profile,
            questionKey: "scope.uses_aedt",
            questionSetVersion: 1,
            answerValue: "yes",
            answerNotes: null,
            isDontKnow: false,
            isNotApplicable: false,
            answeredByUserId: attacker.userId,
          },
          attacker.orgId,
          t,
        ),
      ),
    ).rejects.toThrow();
    await expect(
      asAttacker((t) =>
        createRunQuery(
          {
            projectId: project,
            profileId: profile,
            presetId: "nyc_ll144",
            metric: "impact_ratio",
            threshold: 0.8,
            thresholdSource: "convention",
            smallSampleExclusion: 0.02,
            expiryDate: null,
            expiryTrigger: null,
            readinessScore: null,
            resultJson: null,
            gateFindingsJson: [],
            datasetSha256: null,
            datasetRetained: false,
            rowCount: null,
            createdBy: attacker.userId,
          },
          attacker.orgId,
          t,
        ),
      ),
    ).rejects.toThrow();
    await expect(
      asAttacker((t) =>
        createStanceQuery(
          {
            runId,
            version: 2,
            pdfSha256: null,
            pdfFileId: null,
            scoreAtGeneration: null,
            scopeAtGeneration: "full",
            generatedBy: attacker.userId,
          },
          attacker.orgId,
          t,
        ),
      ),
    ).rejects.toThrow();
    await expect(
      asAttacker((t) => attestProfileQuery(profile, attacker.userId, attacker.orgId, t)),
    ).rejects.toThrow();

    expect({
      aedt_profiles: await count("aedt_profiles"),
      aedt_profile_answers: await count("aedt_profile_answers"),
      bias_audit_runs: await count("bias_audit_runs"),
      bias_audit_stances: await count("bias_audit_stances"),
    }).toEqual(before);
    const [after] = await sequelize.query(`SELECT status FROM aedt_profiles WHERE id = :profile`, {
      replacements: { profile },
    });
    expect(after).toEqual(statusBefore);
  });

  it("attests a draft once and refuses a second attestation with a conflict", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId);
    const first = await insertProfile(owner.orgId, project, owner.userId);
    const runArgs = {
      projectId: project,
      profileId: first,
      presetId: "nyc_ll144",
      metric: "impact_ratio",
      threshold: 0.8,
      thresholdSource: "convention",
      smallSampleExclusion: 0.02,
      expiryDate: null,
      expiryTrigger: null,
      readinessScore: null,
      resultJson: null,
      gateFindingsJson: [],
      datasetSha256: null,
      datasetRetained: false,
      rowCount: null,
      createdBy: owner.userId,
    };
    // A run cites an attested profile; a draft is refused.
    await expect(
      sequelize.transaction((t) => createRunQuery(runArgs, owner.orgId, t)),
    ).rejects.toThrow();
    await sequelize.transaction((t) => attestProfileQuery(first, owner.userId, owner.orgId, t));
    const run = await sequelize.transaction((t) => createRunQuery(runArgs, owner.orgId, t));
    expect(run).toMatchObject({ profile_version: 1, question_set_version: 1 });
    await expect(
      sequelize.transaction((t) => attestProfileQuery(first, owner.userId, owner.orgId, t)),
    ).rejects.toMatchObject({ statusCode: 409 });
    const [rows] = await sequelize.query(`SELECT status FROM aedt_profiles WHERE id = :first`, {
      replacements: { first },
    });
    expect(rows).toEqual([{ status: "attested" }]);
  });
});
