jest.setTimeout(60000);

// Stance generation renders through the server's shared Chromium. Backend CI
// installs no browser, and the PDF bytes are not what these tests are about
// (render.test.ts covers rendering), so the browser is a stub that returns a
// fixed PDF. Everything else, the database included, is real.
jest.mock("../../../utils/pdfBrowser.utils", () => ({
  getSharedBrowser: async () => ({
    newPage: async () => ({
      setContent: async () => undefined,
      pdf: async () => Buffer.from("%PDF-1.4 stubbed scope determination"),
      close: async () => undefined,
    }),
  }),
  closeSharedBrowser: async () => undefined,
}));

import { cleanupDatabase } from "../helpers";
import { NotFoundException } from "../../../domain.layer/exceptions/custom.exception";
import { uploadFile } from "../../../utils/fileUpload.utils";
import { sequelize } from "../../../database/db";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestApp, testRequest } from "../setup";
import { createTestUser } from "../helpers";
import { createTestProject } from "../../factories";
import {
  assertProfileAttestedQuery,
  checkProfileAttestedQuery,
  attestProfileQuery,
  createProfileVersionQuery,
  createProfileStanceQuery,
  getNextProfileStanceVersionQuery,
  createRunQuery,
  createStanceQuery,
  getCurrentProfileQuery,
  getProfileAnswersQuery,
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
    // Attested first, so the createRunQuery refusal below is the organization
    // check and not the attested-only guard.
    await sequelize.transaction((t) => attestProfileQuery(profile, owner.userId, owner.orgId, t));
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
    ).rejects.toBeInstanceOf(NotFoundException);
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

describe("bias audit query layer against the database", () => {
  const answer = (profileId: number, userId: number, answeredAt?: Date | null) => ({
    profileId,
    questionKey: "role.party",
    questionSetVersion: 1,
    answerValue: "vendor",
    answerNotes: "We supply it.",
    isDontKnow: false,
    isNotApplicable: false,
    answeredByUserId: userId,
    answeredAt,
  });

  it("keeps a carried-forward answer's original timestamp, and stamps now when omitted", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId);
    const profile = await insertProfile(owner.orgId, project, owner.userId);
    const original = new Date("2026-01-02T03:04:05Z");

    await sequelize.transaction((t) =>
      upsertAnswerQuery(answer(profile, owner.userId, original), owner.orgId, t),
    );
    let [row] = await getProfileAnswersQuery(profile, owner.orgId);
    expect(new Date(row.answered_at as any).toISOString()).toBe(original.toISOString());

    const before = Date.now();
    await sequelize.transaction((t) =>
      upsertAnswerQuery(answer(profile, owner.userId, null), owner.orgId, t),
    );
    [row] = await getProfileAnswersQuery(profile, owner.orgId);
    expect(new Date(row.answered_at as any).getTime()).toBeGreaterThanOrEqual(before - 5000);
  });

  it("reads answers inside the caller's transaction when one is passed", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId);
    const profile = await insertProfile(owner.orgId, project, owner.userId);

    await sequelize.transaction(async (t) => {
      await upsertAnswerQuery(answer(profile, owner.userId), owner.orgId, t);
      // Uncommitted: visible on the transaction, not on another connection.
      expect(await getProfileAnswersQuery(profile, owner.orgId, t)).toHaveLength(1);
      expect(await getProfileAnswersQuery(profile, owner.orgId)).toHaveLength(0);
    });
    expect(await getProfileAnswersQuery(profile, owner.orgId)).toHaveLength(1);
  });

  it("refuses to write an answer into an attested profile with a conflict, writing nothing", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId);
    const profile = await insertProfile(owner.orgId, project, owner.userId);
    await sequelize.transaction((t) => attestProfileQuery(profile, owner.userId, owner.orgId, t));

    await expect(
      sequelize.transaction((t) =>
        upsertAnswerQuery(answer(profile, owner.userId), owner.orgId, t),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await getProfileAnswersQuery(profile, owner.orgId)).toHaveLength(0);
  });

  it("makes an attestation wait for a save holding the current profile's lock", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId);
    const profile = await insertProfile(owner.orgId, project, owner.userId);

    const save = await sequelize.transaction();
    try {
      const locked = await getCurrentProfileQuery(project, 1, owner.orgId, { transaction: save });
      expect(locked).toMatchObject({ id: profile, status: "draft" });

      let settled = false;
      const attest = sequelize
        .transaction((t) => attestProfileQuery(profile, owner.userId, owner.orgId, t))
        .finally(() => {
          settled = true;
        });
      await new Promise((r) => setTimeout(r, 300));
      expect(settled).toBe(false);

      // The save writes while it holds the lock; the attestation then sees it.
      await upsertAnswerQuery(answer(profile, owner.userId), owner.orgId, save);
      await save.commit();
      await attest;
    } catch (error) {
      if (!(save as unknown as { finished?: string }).finished) await save.rollback();
      throw error;
    }
    expect(await getProfileAnswersQuery(profile, owner.orgId)).toHaveLength(1);
    const [rows] = await sequelize.query(`SELECT status FROM aedt_profiles WHERE id = :profile`, {
      replacements: { profile },
    });
    expect(rows).toEqual([{ status: "attested" }]);
  });

  const profileStance = (profileId: number, projectId: number, userId: number, version = 1) => ({
    profileId,
    projectId,
    version,
    pdfSha256: null,
    pdfFileId: null,
    scopeAtGeneration: "out_of_scope",
    generatedBy: userId,
  });

  it("creates a profile stance only from an attested profile, taking its project and versions", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId);
    const profile = await insertProfile(owner.orgId, project, owner.userId);
    await sequelize.query(
      `UPDATE aedt_profiles SET version = 3, question_set_version = 2 WHERE id = :profile`,
      { replacements: { profile } },
    );

    // A draft is refused, and nothing is written.
    await expect(
      sequelize.transaction((t) =>
        createProfileStanceQuery(profileStance(profile, project, owner.userId), owner.orgId, t),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    await sequelize.transaction((t) => attestProfileQuery(profile, owner.userId, owner.orgId, t));
    const row = await sequelize.transaction((t) =>
      createProfileStanceQuery(profileStance(profile, project, owner.userId), owner.orgId, t),
    );
    expect(row).toMatchObject({
      organization_id: owner.orgId,
      project_id: project,
      profile_id: profile,
      run_id: null,
      version: 1,
      profile_version: 3,
      question_set_version: 2,
      score_at_generation: null,
      scope_at_generation: "out_of_scope",
    });

    const [stances] = await sequelize.query(
      `SELECT COUNT(*)::int AS n FROM bias_audit_stances WHERE project_id = :project`,
      { replacements: { project } },
    );
    expect((stances as any[])[0].n).toBe(1);
  });

  it("refuses another organization's profile stance and enforces the profile-stance constraints", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId);
    const profile = await insertProfile(owner.orgId, project, owner.userId);
    await sequelize.transaction((t) => attestProfileQuery(profile, owner.userId, owner.orgId, t));

    await expect(
      sequelize.transaction((t) =>
        createProfileStanceQuery(
          profileStance(profile, project, attacker.userId),
          attacker.orgId,
          t,
        ),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    await sequelize.transaction((t) =>
      createProfileStanceQuery(profileStance(profile, project, owner.userId), owner.orgId, t),
    );
    // A second version 1 for the same profile loses to the partial unique index.
    const duplicate = await sequelize
      .transaction((t) =>
        createProfileStanceQuery(profileStance(profile, project, owner.userId), owner.orgId, t),
      )
      .then(
        () => null,
        (err) => err,
      );
    expect(duplicate?.original?.code ?? duplicate?.parent?.code).toBe("23505");
    expect(duplicate?.original?.constraint ?? duplicate?.parent?.constraint).toBe(
      "bias_audit_stances_profile_version_uq",
    );

    // A stance cites a run or a profile, never both.
    const [runRows] = await sequelize.query(
      `INSERT INTO bias_audit_runs
         (organization_id, project_id, profile_id, profile_version, preset_id,
          question_set_version, metric)
       VALUES (:orgId, :project, :profile, 1, 'nyc_ll144', 1, 'selection_rate') RETURNING id`,
      { replacements: { orgId: owner.orgId, project, profile } },
    );
    const both = await sequelize
      .query(
        `INSERT INTO bias_audit_stances
           (organization_id, project_id, run_id, profile_id, version, scope_at_generation,
            profile_version, question_set_version)
         VALUES (:orgId, :project, :runId, :profile, 9, 'out_of_scope', 1, 1)`,
        {
          replacements: { orgId: owner.orgId, project, profile, runId: (runRows as any[])[0].id },
        },
      )
      .then(
        () => null,
        (err) => err,
      );
    expect(both?.original?.code ?? both?.parent?.code).toBe("23514");

    const [counts] = await sequelize.query(
      `SELECT COUNT(*)::int AS n FROM bias_audit_stances WHERE project_id = :project`,
      { replacements: { project } },
    );
    expect((counts as any[])[0].n).toBe(1);
  });
  it("holds a re-attestation until the scope determination being written commits", async () => {
    // Two connections: the persist transaction locks profile A FOR SHARE;
    // a concurrent attestation of B must wait to supersede A until it commits.
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId);
    const a = await insertProfile(owner.orgId, project, owner.userId);
    await sequelize.transaction((t) => attestProfileQuery(a, owner.userId, owner.orgId, t));
    const [bRows] = await sequelize.query(
      `INSERT INTO aedt_profiles
         (organization_id, project_id, framework_id, version, question_set_version, created_by)
       VALUES (:orgId, :project, 1, 2, 1, :userId) RETURNING id`,
      { replacements: { orgId: owner.orgId, project, userId: owner.userId } },
    );
    const b = (bRows as any[])[0].id as number;

    const backendPid = async (t: any): Promise<number> => {
      const [r] = await sequelize.query(`SELECT pg_backend_pid() AS pid`, { transaction: t });
      return (r as any[])[0].pid as number;
    };
    let attestCommitted = false;
    // Set when the attestation settles either way; its error, if it rejected.
    let attestSettled = false;
    let attestError: unknown;
    let attestPid: number | undefined;
    let attest: Promise<void> | undefined;
    const written = await sequelize.transaction(async (t) => {
      const stancePid = await backendPid(t);
      await assertProfileAttestedQuery(a, project, owner.orgId, t);
      attest = sequelize
        .transaction(async (t2) => {
          attestPid = await backendPid(t2);
          await attestProfileQuery(b, owner.userId, owner.orgId, t2);
        })
        .then(
          () => {
            attestCommitted = true;
          },
          (err: unknown) => {
            attestError = err;
          },
        )
        .finally(() => {
          attestSettled = true;
        });
      // Poll, on a third connection, until the attestation's backend is
      // waiting on a lock held by this transaction (or it settled: through,
      // which means the lock is missing, or rejected). Bounded, so a
      // regression fails, not hangs.
      let blocked = false;
      const deadline = Date.now() + 10_000;
      while (!attestSettled && Date.now() < deadline) {
        if (attestPid !== undefined) {
          const [w] = await sequelize.query(
            `SELECT a.wait_event_type = 'Lock' AS waiting,
                    :stance_pid = ANY (pg_blocking_pids(a.pid)) AS by_stance
               FROM pg_stat_activity a
              WHERE a.pid = :pid`,
            { replacements: { pid: attestPid, stance_pid: stancePid } },
          );
          const row = (w as any[])[0];
          if (row?.waiting && row?.by_stance) {
            blocked = true;
            break;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const version = await getNextProfileStanceVersionQuery(a, owner.orgId, t);
      const row = await createProfileStanceQuery(
        profileStance(a, project, owner.userId, version),
        owner.orgId,
        t,
      );
      return { blocked, row };
    });
    await attest;

    // A rejected attestation fails here, with its error, not as a missing lock.
    expect(attestError).toBeUndefined();
    expect(written.blocked).toBe(true);
    expect(written.row).toMatchObject({ profile_id: a, version: 1 });
    expect(attestCommitted).toBe(true);
    // The next generate cites B and continues the numbering; A is now refused.
    const next = await sequelize.transaction(async (t) => {
      await assertProfileAttestedQuery(b, project, owner.orgId, t);
      return getNextProfileStanceVersionQuery(b, owner.orgId, t);
    });
    expect(next).toBe(2);
    await expect(checkProfileAttestedQuery(a, project, owner.orgId)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("answers 409 for a profile superseded before the insert, and 404 for another project", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId);
    const other = await createTestProject(owner.orgId, owner.userId);
    const profile = await insertProfile(owner.orgId, project, owner.userId);
    await sequelize.transaction((t) => attestProfileQuery(profile, owner.userId, owner.orgId, t));

    // The profile is the organization's, but not the project's the PDF is filed under.
    await expect(
      sequelize.transaction((t) =>
        createProfileStanceQuery(profileStance(profile, other, owner.userId), owner.orgId, t),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    // A re-attestation superseded it while the document was being generated.
    await sequelize.query(`UPDATE aedt_profiles SET status = 'superseded' WHERE id = :profile`, {
      replacements: { profile },
    });
    await expect(
      sequelize.transaction((t) =>
        createProfileStanceQuery(profileStance(profile, project, owner.userId), owner.orgId, t),
      ),
    ).rejects.toMatchObject({
      name: "ConflictException",
      statusCode: 409,
      message: expect.stringMatching(/re-attested while the document was being generated/),
    });

    const [counts] = await sequelize.query(
      `SELECT COUNT(*)::int AS n FROM bias_audit_stances WHERE project_id IN (:project, :other)`,
      { replacements: { project, other } },
    );
    expect((counts as any[])[0].n).toBe(0);
  });
});

describe("bias audit routes tenant isolation", () => {
  const LL144 = 12;
  const IN_SCOPE_ANSWERS = [
    { questionKey: "role.party", value: "vendor", notes: "We supply the tool.", dontKnow: false },
    {
      questionKey: "scope.weighting",
      value: "biggest",
      notes: "It ranks applicants.",
      dontKnow: false,
    },
    {
      questionKey: "independence.auditor",
      value: "self",
      notes: "Our team runs it.",
      dontKnow: false,
    },
    { questionKey: "data.held", value: "none", notes: "We hold none.", dontKnow: false },
    { questionKey: "data.basis", value: "test_attribute", notes: "Test data.", dontKnow: false },
    { questionKey: "cutoff.applied_by", value: "platform", notes: null, dontKnow: false },
  ];
  const CSV = (() => {
    const rows = ["gender,race,outcome"];
    for (let i = 0; i < 200; i++) {
      rows.push(`${i % 2 ? "Male" : "Female"},${i % 3 ? "White" : "Asian"},${i % 5 < 2 ? 1 : 0}`);
    }
    return Buffer.from(rows.join("\n") + "\n");
  })();
  const MAPPING = JSON.stringify({ sex: "gender", race_ethnicity: "race", selected: "outcome" });

  /** Owner drafts, attests and records one run through the API. */
  async function ownerWithRun() {
    const { owner, attacker } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId);
    const put = await owner.request
      .put(`/api/bias-audit/profiles/${project}/${LL144}`)
      .send({ answers: IN_SCOPE_ANSWERS });
    expect(put.status).toBe(200);
    const attest = await owner.request.post(`/api/bias-audit/profiles/${project}/${LL144}/attest`);
    expect(attest.status).toBe(200);
    const run = await owner.request
      .post("/api/bias-audit/runs")
      .field("projectId", String(project))
      .field("frameworkId", String(LL144))
      .field("mapping", MAPPING)
      // The body carries the attacker's organization; the server must ignore it.
      .field("organizationId", String(attacker.orgId))
      .attach("file", CSV, { filename: "d.csv", contentType: "text/csv" });
    expect(run.status).toBe(201);
    return { owner, attacker, project, runId: run.body.data.runId as number };
  }

  const snapshot = async (project: number) => {
    const [rows] = await sequelize.query(
      `SELECT (SELECT COUNT(*) FROM aedt_profiles WHERE project_id = :project)::int AS profiles,
              (SELECT COUNT(*) FROM aedt_profile_answers a JOIN aedt_profiles p ON p.id = a.profile_id
                WHERE p.project_id = :project)::int AS answers,
              (SELECT COUNT(*) FROM bias_audit_runs WHERE project_id = :project)::int AS runs,
              (SELECT COUNT(*) FROM bias_audit_stances WHERE project_id = :project)::int AS stances,
              (SELECT string_agg(status::text || ':' || version, ',' ORDER BY id)
                 FROM aedt_profiles WHERE project_id = :project) AS statuses,
              (SELECT string_agg(COALESCE(data_basis_json::text, ''), ',' ORDER BY id)
                 FROM bias_audit_runs WHERE project_id = :project) AS bases`,
      { replacements: { project } },
    );
    return (rows as any[])[0];
  };

  it("stamps the run with the caller's organization, never the body's", async () => {
    const { owner, runId } = await ownerWithRun();
    const [rows] = await sequelize.query(
      `SELECT organization_id FROM bias_audit_runs WHERE id = :runId`,
      { replacements: { runId } },
    );
    expect((rows as any[])[0].organization_id).toBe(owner.orgId);
  });

  it("denies every read of another organization's project, run and list", async () => {
    const { owner, attacker, project, runId } = await ownerWithRun();
    const reads = [
      `/api/bias-audit/questions/${LL144}?projectId=${project}`,
      `/api/bias-audit/profiles/${project}/${LL144}`,
      `/api/bias-audit/runs?projectId=${project}&frameworkId=${LL144}`,
      `/api/bias-audit/runs/trend?projectId=${project}&frameworkId=${LL144}`,
      `/api/bias-audit/runs/${runId}`,
    ];
    for (const route of reads) {
      // Owner positive control first: a missing route would also answer 404.
      expect((await owner.request.get(route)).status).toBe(200);
      const res = await attacker.request.get(route);
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain("It ranks applicants");
    }
    const list = await owner.request.get(
      `/api/bias-audit/runs?projectId=${project}&frameworkId=${LL144}`,
    );
    expect(list.body.data.runs.map((r: any) => r.id)).toEqual([runId]);
  });

  it("denies every write to another organization's profile and run, changing nothing", async () => {
    const { attacker, project, runId } = await ownerWithRun();
    const before = await snapshot(project);
    const writes = [
      attacker.request
        .put(`/api/bias-audit/profiles/${project}/${LL144}`)
        .send({ answers: IN_SCOPE_ANSWERS }),
      attacker.request.post(`/api/bias-audit/profiles/${project}/${LL144}/attest`),
      attacker.request
        .post("/api/bias-audit/runs")
        .field("projectId", String(project))
        .field("frameworkId", String(LL144))
        .field("mapping", MAPPING)
        .attach("file", CSV, { filename: "d.csv", contentType: "text/csv" }),
      attacker.request.post(`/api/bias-audit/runs/${runId}/derived-basis/confirm`),
      attacker.request.post(`/api/bias-audit/runs/${runId}/stance`),
    ];
    for (const w of writes) {
      expect((await w).status).toBe(404);
    }
    expect(await snapshot(project)).toEqual(before);
  });

  /** A user in the owner's organization with the given role, not on the project. */
  /** A failed corpus on the owner's attested profile, inserted directly. */
  async function seedCorpus(project: number): Promise<number> {
    const [rows] = await sequelize.query(
      `INSERT INTO bias_audit_corpora
         (organization_id, project_id, profile_id, profile_version, job_description_key,
          job_description_sha256, artifact_kind, knockout, requested_count, planned_count,
          seed, model_pinned, name_method, criteria_comparison_json, status, failure_code)
       SELECT organization_id, project_id, id, version, 'commercial-ae',
              repeat('a', 64), 'resume', 'no', 700, 700,
              1, 'test/model', 'test names', '{"verdict":"not_supplied"}'::jsonb,
              'failed', 'generation_error'
         FROM aedt_profiles
        WHERE project_id = :project AND status = 'attested'
       RETURNING id`,
      { replacements: { project } },
    );
    return (rows as any[])[0].id as number;
  }

  it("answers 404 to another organization for a corpus view, download, list and resume", async () => {
    const { owner, attacker, project } = await ownerWithRun();
    const corpusId = await seedCorpus(project);
    const view = `/api/bias-audit/corpora/${corpusId}`;
    const list = `/api/bias-audit/corpora?projectId=${project}&frameworkId=${LL144}`;
    // Owner positive controls: the routes exist and serve the owner.
    expect((await owner.request.get(view)).status).toBe(200);
    expect((await owner.request.get(list)).status).toBe(200);
    // A failed corpus is not downloadable, so the owner gets 409, not 404.
    expect((await owner.request.get(`${view}/download`)).status).toBe(409);

    for (const res of [
      await attacker.request.get(view),
      await attacker.request.get(`${view}/download`),
      await attacker.request.get(list),
      await attacker.request.post(`${view}/resume`),
    ]) {
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain("test/model");
    }
    const [rows] = await sequelize.query(
      `SELECT status, failure_code FROM bias_audit_corpora WHERE id = :corpusId`,
      { replacements: { corpusId } },
    );
    expect((rows as any[])[0]).toEqual({ status: "failed", failure_code: "generation_error" });
  });

  async function sameOrgUser(orgId: number, roleId: number, role: string) {
    const userId = await createTestUser(
      orgId,
      roleId,
      `ba-${role.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.com`,
      "Password123!",
    );
    const request = testRequest(
      await createTestApp({
        bypassAuth: true,
        mockUser: { userId, organizationId: orgId, role },
      }),
    );
    return { userId, request };
  }

  it("limits every project endpoint to Admin, owner and members, answering 404 to others in the organization", async () => {
    const { owner, project, runId } = await ownerWithRun();
    const editor = await sameOrgUser(owner.orgId, 3, "Editor");
    const auditor = await sameOrgUser(owner.orgId, 4, "Auditor");
    const before = await snapshot(project);

    const reads = [
      `/api/bias-audit/profiles/${project}/${LL144}`,
      `/api/bias-audit/runs?projectId=${project}&frameworkId=${LL144}`,
      `/api/bias-audit/runs/trend?projectId=${project}&frameworkId=${LL144}`,
      `/api/bias-audit/runs/${runId}`,
    ];
    const writes = (u: { request: ReturnType<typeof testRequest> }) => [
      u.request
        .put(`/api/bias-audit/profiles/${project}/${LL144}`)
        .send({ answers: IN_SCOPE_ANSWERS }),
      u.request.post(`/api/bias-audit/profiles/${project}/${LL144}/attest`),
      u.request
        .post("/api/bias-audit/runs")
        .field("projectId", String(project))
        .field("frameworkId", String(LL144))
        .field("mapping", MAPPING)
        .attach("file", CSV, { filename: "d.csv", contentType: "text/csv" }),
      u.request.post(`/api/bias-audit/runs/${runId}/derived-basis/confirm`),
      u.request.post(`/api/bias-audit/runs/${runId}/stance`),
    ];

    const leaked: unknown[] = [];
    for (const who of [editor, auditor]) {
      for (const route of reads) {
        const res = await who.request.get(route);
        if (res.status !== 404)
          leaked.push([who === editor ? "editor" : "auditor", route, res.status]);
        expect(JSON.stringify(res.body)).not.toContain("It ranks applicants");
      }
      // An Auditor holds no bias-audit write permission, and attesting and
      // confirming a derived basis are Admin-only (the unit tests cover the
      // member rule for those), so the role gate answers 403 on them before
      // the project is looked at; every other write is refused by the project-member rule
      // with the 404.
      const results = await Promise.all(writes(who).map(async (w) => (await w).status));
      expect(results).toEqual(
        who === auditor ? [403, 403, 403, 403, 403] : [404, 403, 404, 403, 404],
      );
      // The question set is filtered by the project's saved answers, so it is
      // the project's data too.
      expect(
        (await who.request.get(`/api/bias-audit/questions/${LL144}?projectId=${project}`)).status,
      ).toBe(404);
    }
    expect(leaked).toEqual([]);
    expect(await snapshot(project)).toEqual(before);

    await sequelize.query(
      `INSERT INTO projects_members (organization_id, user_id, project_id)
       VALUES (:org, :user, :project)`,
      { replacements: { org: owner.orgId, user: editor.userId, project } },
    );
    for (const route of reads) expect((await editor.request.get(route)).status).toBe(200);
    // A member's write reaches the service: the profile saves a new version.
    const put = await editor.request
      .put(`/api/bias-audit/profiles/${project}/${LL144}`)
      .send({ answers: IN_SCOPE_ANSWERS });
    expect(put.status).toBe(200);
    expect((await snapshot(project)).profiles).toBeGreaterThan(before.profiles);
  });

  it("answers 404 to a non-member in the organization for a corpus, as for a missing one", async () => {
    const { owner, project } = await ownerWithRun();
    const corpusId = await seedCorpus(project);
    const editor = await sameOrgUser(owner.orgId, 3, "Editor");
    const missing = corpusId + 100000;
    for (const id of [corpusId, missing]) {
      const view = `/api/bias-audit/corpora/${id}`;
      for (const res of [
        await editor.request.get(view),
        await editor.request.get(`${view}/download`),
        await editor.request.post(`${view}/resume`),
      ]) {
        expect(res.status).toBe(404);
      }
    }
    const a = await editor.request.get(`/api/bias-audit/corpora/${corpusId}`);
    const b = await editor.request.get(`/api/bias-audit/corpora/${missing}`);
    expect(JSON.stringify(a.body).split(String(corpusId)).join("ID")).toBe(
      JSON.stringify(b.body).split(String(missing)).join("ID"),
    );
  });

  it("lets a non-Admin project owner in without a member row", async () => {
    const { owner } = await seedTwoTenantContexts();
    const editor = await sameOrgUser(owner.orgId, 3, "Editor");
    const project = await createTestProject(owner.orgId, editor.userId);
    const routes = [
      `/api/bias-audit/profiles/${project}/${LL144}`,
      `/api/bias-audit/questions/${LL144}?projectId=${project}`,
      `/api/bias-audit/runs?projectId=${project}&frameworkId=${LL144}`,
      `/api/bias-audit/runs/trend?projectId=${project}&frameworkId=${LL144}`,
    ];
    const statuses = await Promise.all(
      routes.map(async (route) => [route, (await editor.request.get(route)).status]),
    );
    expect(statuses).toEqual(routes.map((route) => [route, 200]));
  });

  it("answers a non-member the same for a run they cannot see as for a run that does not exist", async () => {
    const { owner, runId } = await ownerWithRun();
    const editor = await sameOrgUser(owner.orgId, 3, "Editor");
    const [[{ max }]] = (await sequelize.query(
      `SELECT MAX(id)::int AS max FROM bias_audit_runs`,
    )) as [Array<{ max: number }>, unknown];
    const missing = max + 1000;
    const answer = async (id: number) => {
      const res = await editor.request.get(`/api/bias-audit/runs/${id}`);
      const stance = await editor.request.post(`/api/bias-audit/runs/${id}/stance`);
      return [res.status, JSON.stringify(res.body), stance.status, JSON.stringify(stance.body)].map(
        (v) => String(v).replace(String(id), "<id>"),
      );
    };
    expect(await answer(runId)).toEqual(await answer(missing));
  });

  it("does not let membership of one project open another in the same organization", async () => {
    const { owner, project, runId } = await ownerWithRun();
    const editor = await sameOrgUser(owner.orgId, 3, "Editor");
    // The editor owns one project and is a member of another, neither of them this one.
    await createTestProject(owner.orgId, editor.userId);
    const other = await createTestProject(owner.orgId, owner.userId);
    await sequelize.query(
      `INSERT INTO projects_members (organization_id, user_id, project_id)
       VALUES (:org, :user, :project)`,
      { replacements: { org: owner.orgId, user: editor.userId, project: other } },
    );

    const routes = [
      `/api/bias-audit/profiles/${project}/${LL144}`,
      `/api/bias-audit/questions/${LL144}?projectId=${project}`,
      `/api/bias-audit/runs?projectId=${project}&frameworkId=${LL144}`,
      `/api/bias-audit/runs/trend?projectId=${project}&frameworkId=${LL144}`,
      `/api/bias-audit/runs/${runId}`,
    ];
    const statuses = await Promise.all(
      routes.map(async (route) => [route, (await editor.request.get(route)).status]),
    );
    expect(statuses).toEqual(routes.map((route) => [route, 404]));
  });

  /** A stored stance with its PDF, generated by the owner. */
  async function seedStance(
    owner: { userId: number; orgId: number },
    project: number,
    runId: number,
  ) {
    const pdf = Buffer.from("%PDF-1.4 seeded stance");
    const sha = require("node:crypto").createHash("sha256").update(pdf).digest("hex");
    const filename = `stance-${Date.now()}-${Math.floor(Math.random() * 1e6)}.pdf`;
    let fileId = 0;
    const stanceId = await sequelize.transaction(async (t) => {
      const file = await uploadFile(
        {
          fieldname: "file",
          originalname: filename,
          mimetype: "application/pdf",
          buffer: pdf,
          size: pdf.length,
        } as any,
        owner.userId,
        project,
        "Bias audit stance report",
        owner.orgId,
        t,
      );
      fileId = file.id!;
      const row = await createStanceQuery(
        {
          runId,
          version: 1,
          pdfSha256: sha,
          pdfFileId: file.id!,
          scoreAtGeneration: null,
          scopeAtGeneration: "in_scope",
          generatedBy: owner.userId,
        },
        owner.orgId,
        t,
      );
      return row.id!;
    });
    return { pdf, sha, stanceId, fileId, filename };
  }

  it("keeps stance PDFs out of the generic file lists and file-id endpoints, for every role", async () => {
    const { owner, project, runId } = await ownerWithRun();
    const { fileId, filename, stanceId } = await seedStance(owner, project, runId);
    const editor = await sameOrgUser(owner.orgId, 3, "Editor");
    const superAdmin = testRequest(
      await createTestApp({
        bypassAuth: true,
        mockUser: { userId: owner.userId, organizationId: owner.orgId, role: "SuperAdmin" },
      }),
    );
    const viewers = { admin: owner.request, editor: editor.request, superAdmin };

    const lists = [
      "/api/file-manager",
      "/api/file-manager/with-metadata",
      `/api/file-manager/search?q=stance`,
      "/api/files",
      `/api/files/by-projid/${project}`,
    ];
    const byId = [
      `/api/files/${fileId}`,
      `/api/file-manager/${fileId}`,
      `/api/file-manager/${fileId}/metadata`,
      `/api/file-manager/${fileId}/versions`,
      `/api/file-manager/${fileId}/preview`,
    ];

    const leaked: unknown[] = [];
    for (const [who, request] of Object.entries(viewers)) {
      for (const route of lists) {
        const res = await request.get(route);
        if (JSON.stringify(res.body).includes(filename)) leaked.push([who, route]);
      }
      for (const route of byId) {
        const res = await request.get(route);
        // 403 only where the role may not use the endpoint at all.
        if (res.status !== 404 && res.status !== 403) leaked.push([who, route, res.status]);
      }
      const patch = await request
        .patch(`/api/file-manager/${fileId}/metadata`)
        .send({ description: "changed" });
      if (patch.status !== 404 && patch.status !== 403)
        leaked.push([who, "PATCH metadata", patch.status]);
    }
    expect(leaked).toEqual([]);

    // Admin, who may use every endpoint, gets the not-found a missing file gets.
    for (const route of byId) {
      expect([route, (await owner.request.get(route)).status]).toEqual([route, 404]);
    }
    // Every route that takes a file id from the client answers a stance PDF
    // exactly as it answers an id that names no file.
    const missingId = 2147483000;
    const sameAsMissing = async (
      label: string,
      send: (id: number) => Promise<{ status: number; body: unknown }>,
    ) => {
      const [stance, missing] = [await send(fileId), await send(missingId)];
      const body = (b: unknown) => JSON.stringify(b).split(String(missingId)).join(String(fileId));
      expect([label, stance.status, body(stance.body)]).toEqual([
        label,
        missing.status,
        body(missing.body),
      ]);
      return stance;
    };

    // Virtual folders.
    const folder = await owner.request
      .post("/api/virtual-folders")
      .send({ name: `stance-guard-${Date.now()}` });
    expect(folder.status).toBe(201);
    const folderId = folder.body.data.id as number;
    const uncategorized = await owner.request.get("/api/virtual-folders/uncategorized");
    expect(uncategorized.status).toBe(200);
    expect(JSON.stringify(uncategorized.body)).not.toContain(filename);
    const assign = await sameAsMissing("assign to folder", (id) =>
      owner.request.post(`/api/virtual-folders/${folderId}/files`).send({ file_ids: [id] }),
    );
    expect(assign.status).toBe(404);
    const setFolders = await sameAsMissing("set file folders", (id) =>
      owner.request.patch(`/api/files/${id}/folders`).send({ folder_ids: [folderId] }),
    );
    expect(setFolders.status).toBe(404);
    // A mapping or link written before these checks existed stays hidden.
    await sequelize.query(
      `INSERT INTO file_folder_mappings (organization_id, file_id, folder_id, assigned_by)
       VALUES (:org, :fileId, :folderId, :user)`,
      { replacements: { org: owner.orgId, fileId, folderId, user: owner.userId } },
    );
    const inFolder = await owner.request.get(`/api/virtual-folders/${folderId}/files`);
    expect(inFolder.status).toBe(200);
    expect(JSON.stringify(inFolder.body)).not.toContain(filename);
    await sameAsMissing("file folders", (id) => owner.request.get(`/api/files/${id}/folders`));

    // Entity links.
    const entity = { framework_type: "eu_ai_act", entity_type: "assessment", entity_id: 991 };
    const attach = await sameAsMissing("attach", (id) =>
      owner.request.post("/api/files/attach").send({ ...entity, file_id: id }),
    );
    expect(attach.status).toBe(404);
    await sameAsMissing("attach bulk", (id) =>
      owner.request.post("/api/files/attach-bulk").send({ ...entity, file_ids: [id] }),
    );
    await sequelize.query(
      `INSERT INTO file_entity_links
         (organization_id, file_id, framework_type, entity_type, entity_id, link_type, created_at)
       VALUES (:org, :fileId, 'eu_ai_act', 'assessment', 991, 'evidence', NOW())`,
      { replacements: { org: owner.orgId, fileId } },
    );
    const linked = await owner.request.get("/api/files/entity/eu_ai_act/assessment/991");
    expect(linked.status).toBe(200);
    expect(JSON.stringify(linked.body)).not.toContain(filename);
    expect(linked.body.pagination.total).toBe(0);

    // Bulk tags, and deletion.
    await sameAsMissing("bulk tags", (id) =>
      owner.request.patch("/api/files/bulk-tags").send({ ids: [id], mode: "set", tags: ["leak"] }),
    );
    const del = await sameAsMissing("delete", (id) =>
      owner.request.delete(`/api/file-manager/${id}`),
    );
    expect(del.status).toBe(404);

    // Nothing above changed the stance PDF, and the stance endpoint still serves it.
    const [after] = await sequelize.query(`SELECT tags FROM files WHERE id = :fileId`, {
      replacements: { fileId },
    });
    expect((after as any[])[0].tags ?? []).not.toContain("leak");
    expect((await owner.request.get(`/api/bias-audit/stances/${stanceId}/download`)).status).toBe(
      200,
    );
  });

  it("serves a stance PDF only to its project's people, not to others in the organization", async () => {
    const { owner, project, runId } = await ownerWithRun();
    const { stanceId } = await seedStance(owner, project, runId);
    const route = `/api/bias-audit/stances/${stanceId}/download`;

    // An Editor in the same organization who is not on the project.
    const editorId = await createTestUser(
      owner.orgId,
      3,
      `ba-editor-${Date.now()}@test.com`,
      "Password123!",
    );
    const editor = testRequest(
      await createTestApp({
        bypassAuth: true,
        mockUser: { userId: editorId, organizationId: owner.orgId, role: "Editor" },
      }),
    );
    expect((await editor.get(route)).status).toBe(404);

    await sequelize.query(
      `INSERT INTO projects_members (organization_id, user_id, project_id)
       VALUES (:org, :user, :project)`,
      { replacements: { org: owner.orgId, user: editorId, project } },
    );
    expect((await editor.get(route)).status).toBe(200);
  });

  it("serves a stance PDF only to its organization, 410 once the file is gone, and hides it from deletion", async () => {
    const { owner, attacker, project, runId } = await ownerWithRun();
    const { pdf, sha, stanceId } = await seedStance(owner, project, runId);
    const route = `/api/bias-audit/stances/${stanceId}/download`;

    const ok = await owner.request
      .get(route)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toMatch(/application\/pdf/);
    expect(ok.headers["x-content-sha256"]).toBe(sha);
    expect((ok.body as Buffer).equals(pdf)).toBe(true);

    expect((await attacker.request.get(route)).status).toBe(404);

    const [files] = await sequelize.query(
      `SELECT pdf_file_id FROM bias_audit_stances WHERE id = :stanceId`,
      { replacements: { stanceId } },
    );
    const fileId = (files as any[])[0].pdf_file_id;
    // The file manager answers a stance PDF as a missing file, so it is not deleted.
    const del = await owner.request.delete(`/api/file-manager/${fileId}`);
    expect(del.status).toBe(404);

    // A files row removed by any other path leaves the stance readable but its PDF gone.
    await sequelize.query(`DELETE FROM files WHERE id = :fileId`, { replacements: { fileId } });
    expect((await owner.request.get(route)).status).toBe(410);
    expect(
      (await owner.request.get(`/api/bias-audit/runs/${runId}`)).body.data.stances,
    ).toHaveLength(1);
  });
  const OUT_OF_SCOPE_ANSWERS = [
    { questionKey: "role.party", value: "employer", notes: "We hire with it.", dontKnow: false },
    {
      questionKey: "scope.weighting",
      value: "one_of_several",
      notes: "Recruiters read it beside interviews.",
      dontKnow: false,
    },
    { questionKey: "independence.auditor", value: "self", notes: "Our HR team.", dontKnow: false },
    { questionKey: "data.held", value: "none", notes: "We hold none.", dontKnow: false },
  ];

  /** Owner drafts and attests an out-of-scope profile through the API; no run. */
  async function ownerWithOutOfScopeProfile() {
    const { owner, attacker } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId);
    const put = await owner.request
      .put(`/api/bias-audit/profiles/${project}/${LL144}`)
      .send({ answers: OUT_OF_SCOPE_ANSWERS });
    expect(put.status).toBe(200);
    const attest = await owner.request.post(`/api/bias-audit/profiles/${project}/${LL144}/attest`);
    expect(attest.status).toBe(200);
    return {
      owner,
      attacker,
      project,
      stanceRoute: `/api/bias-audit/profiles/${project}/${LL144}/stance`,
    };
  }

  it("generates a scope determination for an out-of-scope project, with no run", async () => {
    const { owner, project, stanceRoute } = await ownerWithOutOfScopeProfile();

    const first = await owner.request.post(stanceRoute);
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ stanceId: expect.any(Number), version: 1 });
    expect(first.body.data.sha256).toMatch(/^[0-9a-f]{64}$/);
    const second = await owner.request.post(stanceRoute);
    expect(second.status).toBe(201);
    expect(second.body.data.version).toBe(2);

    const [rows] = await sequelize.query(
      `SELECT s.run_id, s.profile_id, s.version, s.score_at_generation, s.scope_at_generation,
              s.pdf_sha256, f.source, f.filename, f.project_id AS file_project
         FROM bias_audit_stances s JOIN files f ON f.id = s.pdf_file_id
        WHERE s.project_id = :project ORDER BY s.version`,
      { replacements: { project } },
    );
    const [profileRow] = (await sequelize.query(
      `SELECT id FROM aedt_profiles WHERE project_id = :project AND status = 'attested'`,
      { replacements: { project } },
    )) as [Array<{ id: number }>, unknown];
    expect(rows).toEqual(
      [1, 2].map((version) => ({
        run_id: null,
        profile_id: profileRow[0].id,
        version,
        score_at_generation: null,
        scope_at_generation: "out_of_scope",
        pdf_sha256: version === 1 ? first.body.data.sha256 : second.body.data.sha256,
        source: "Bias audit stance report",
        filename: expect.stringMatching(
          new RegExp(`^bias-audit-scope-determination-profile-${profileRow[0].id}-v${version}`),
        ),
        file_project: project,
      })),
    );
    const [runs] = await sequelize.query(
      `SELECT COUNT(*)::int AS n FROM bias_audit_runs WHERE project_id = :project`,
      { replacements: { project } },
    );
    expect((runs as any[])[0].n).toBe(0);

    // Listed on the profile view, downloadable like any stance.
    const view = await owner.request.get(`/api/bias-audit/profiles/${project}/${LL144}`);
    expect(view.body.data.scopeDeterminations.map((s: any) => s.version)).toEqual([2, 1]);
    const dl = await owner.request.get(
      `/api/bias-audit/stances/${first.body.data.stanceId}/download`,
    );
    expect(dl.status).toBe(200);
    expect(dl.headers["x-content-sha256"]).toBe(first.body.data.sha256);
  });

  it("numbers scope determinations across re-attestations of the project", async () => {
    const { owner, project, stanceRoute } = await ownerWithOutOfScopeProfile();
    const first = await owner.request.post(stanceRoute);
    expect(first.status).toBe(201);
    expect(first.body.data.version).toBe(1);

    // Re-attest: the edit opens a new draft version, attesting it supersedes the first.
    const put = await owner.request.put(`/api/bias-audit/profiles/${project}/${LL144}`).send({
      answers: OUT_OF_SCOPE_ANSWERS.map((a) =>
        a.questionKey === "data.held" ? { ...a, notes: "We still hold none." } : a,
      ),
    });
    expect(put.status).toBe(200);
    expect(
      (await owner.request.post(`/api/bias-audit/profiles/${project}/${LL144}/attest`)).status,
    ).toBe(200);

    const second = await owner.request.post(stanceRoute);
    expect(second.status).toBe(201);
    expect(second.body.data.version).toBe(2);

    const [rows] = (await sequelize.query(
      `SELECT s.version, s.profile_id, ap.status
         FROM bias_audit_stances s JOIN aedt_profiles ap ON ap.id = s.profile_id
        WHERE s.project_id = :project ORDER BY s.version`,
      { replacements: { project } },
    )) as [Array<{ version: number; profile_id: number; status: string }>, unknown];
    expect(rows.map((r) => [r.version, r.status])).toEqual([
      [1, "superseded"],
      [2, "attested"],
    ]);
    expect(rows[0].profile_id).not.toBe(rows[1].profile_id);

    // The profile view marks only the determination of the attested profile current.
    const view = await owner.request.get(`/api/bias-audit/profiles/${project}/${LL144}`);
    expect(view.body.data.scopeDeterminations.map((s: any) => [s.version, s.isCurrent])).toEqual([
      [2, true],
      [1, false],
    ]);
  });

  it("refuses a scope determination for an in-scope profile with 422, pointing at a run", async () => {
    const { owner, project } = await ownerWithRun();
    const before = await snapshot(project);
    const res = await owner.request.post(`/api/bias-audit/profiles/${project}/${LL144}/stance`);
    expect(res.status).toBe(422);
    expect(res.body.data).toMatch(/comes from a run/);
    expect(await snapshot(project)).toEqual(before);
  });

  it("answers 404 when there is no attested profile", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId);
    const res = await owner.request.post(`/api/bias-audit/profiles/${project}/${LL144}/stance`);
    expect(res.status).toBe(404);
  });

  it("limits scope determinations to the organization, the project's people and the edit roles", async () => {
    const { owner, attacker, project, stanceRoute } = await ownerWithOutOfScopeProfile();
    const before = await snapshot(project);

    // Another organization: 404, nothing written.
    expect((await attacker.request.post(stanceRoute)).status).toBe(404);
    // Same organization, not on the project: an Editor gets the member rule's
    // 404; Reviewer and Auditor hold no bias-audit edit permission, so the
    // role gate answers 403 before the project is looked at.
    const editor = await sameOrgUser(owner.orgId, 3, "Editor");
    const reviewer = await sameOrgUser(owner.orgId, 2, "Reviewer");
    const auditor = await sameOrgUser(owner.orgId, 4, "Auditor");
    expect((await editor.request.post(stanceRoute)).status).toBe(404);
    expect((await reviewer.request.post(stanceRoute)).status).toBe(403);
    expect((await auditor.request.post(stanceRoute)).status).toBe(403);
    expect(await snapshot(project)).toEqual(before);

    // On the project: the Editor may generate; Reviewer and Auditor still may not.
    for (const u of [editor, reviewer, auditor]) {
      await sequelize.query(
        `INSERT INTO projects_members (organization_id, user_id, project_id)
         VALUES (:org, :user, :project)`,
        { replacements: { org: owner.orgId, user: u.userId, project } },
      );
    }
    expect((await reviewer.request.post(stanceRoute)).status).toBe(403);
    expect((await auditor.request.post(stanceRoute)).status).toBe(403);
    const made = await editor.request.post(stanceRoute);
    expect(made.status).toBe(201);
    const stanceId = made.body.data.stanceId as number;

    // The download follows the stance-download rule: project people, not others.
    const download = `/api/bias-audit/stances/${stanceId}/download`;
    expect((await attacker.request.get(download)).status).toBe(404);
    const outsider = await sameOrgUser(owner.orgId, 3, "Editor");
    expect((await outsider.request.get(download)).status).toBe(404);
    expect((await reviewer.request.get(download)).status).toBe(200);
    expect((await owner.request.get(download)).status).toBe(200);
  });

  it("protects a scope determination's PDF like any stance PDF", async () => {
    const { owner, stanceRoute } = await ownerWithOutOfScopeProfile();
    const made = await owner.request.post(stanceRoute);
    expect(made.status).toBe(201);
    const [files] = await sequelize.query(
      `SELECT pdf_file_id FROM bias_audit_stances WHERE id = :id`,
      { replacements: { id: made.body.data.stanceId } },
    );
    const fileId = (files as any[])[0].pdf_file_id as number;

    // The generic file paths answer it as missing, so it is neither served nor deleted.
    expect((await owner.request.get(`/api/files/${fileId}`)).status).toBe(404);
    expect((await owner.request.delete(`/api/file-manager/${fileId}`)).status).toBe(404);
    const [still] = await sequelize.query(`SELECT id FROM files WHERE id = :fileId`, {
      replacements: { fileId },
    });
    expect(still).toHaveLength(1);
    expect(
      (await owner.request.get(`/api/bias-audit/stances/${made.body.data.stanceId}/download`))
        .status,
    ).toBe(200);
  });
});
