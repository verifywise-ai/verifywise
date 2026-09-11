jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestRisk } from "../factories";
import { runEvidenceFreshnessSweep } from "../../services/automations/actions/evidenceFreshnessSweep";
import { notifyEvidenceStale } from "../../services/inAppNotification.service";

const mockNotify = notifyEvidenceStale as jest.Mock;

afterEach(async () => {
  await cleanupDatabase();
});

beforeEach(() => {
  mockNotify.mockClear();
});

/*
 * Straight INSERTs, bypassing the controller on purpose: they prove the SWEEP
 * reads real rows, not application code. updated_at is set explicitly because
 * it is the "untouched for N days" half of the freshness rule.
 */
const createTestEvidence = async (
  orgId: number,
  options: { expiry: Date | null; updatedAt: Date; riskIds: number[] | null },
): Promise<number> => {
  const [result] = await sequelize.query(
    `INSERT INTO evidence_hub (organization_id, evidence_name, evidence_type,
                               description, expiry_date, mapped_risk_ids,
                               created_at, updated_at)
     VALUES (:orgId, 'Test evidence', 'Documentation', 'freshness test',
             :expiry, :riskIds, NOW(), :updatedAt)
     RETURNING id`,
    {
      replacements: {
        orgId,
        expiry: options.expiry,
        riskIds: options.riskIds ? `{${options.riskIds.join(",")}}` : null,
        updatedAt: options.updatedAt,
      },
    },
  );
  return (result as any[])[0].id;
};

const daysAgo = (n: number): Date => new Date(Date.now() - n * 86400000);
const daysFromNow = (n: number): Date => new Date(Date.now() + n * 86400000);

const setStatus = async (riskId: number, status: string) => {
  await sequelize.query(
    `UPDATE risks SET mitigation_status = CAST(:status AS enum_projectrisks_mitigation_status)
      WHERE id = :riskId`,
    { replacements: { riskId, status } },
  );
};

const readStatus = async (riskId: number) => {
  const rows = (await sequelize.query(
    `SELECT mitigation_status FROM risks WHERE id = :riskId`,
    { replacements: { riskId }, type: QueryTypes.SELECT },
  )) as { mitigation_status: string | null }[];
  return rows[0].mitigation_status;
};

const readFlag = async (riskId: number) => {
  const rows = (await sequelize.query(
    `SELECT evidence_stale_at FROM risks WHERE id = :riskId`,
    { replacements: { riskId }, type: QueryTypes.SELECT },
  )) as { evidence_stale_at: unknown }[];
  return rows[0].evidence_stale_at;
};

describe("evidence freshness sweep", () => {
  it("flags a risk whose evidence is past its expiry date", async () => {
    const { owner } = await seedTwoTenantContexts();
    const risk = await createTestRisk(owner.orgId, { risk_owner: owner.userId });
    await createTestEvidence(owner.orgId, {
      expiry: daysAgo(5),
      updatedAt: new Date(),
      riskIds: [risk],
    });

    const summary = await runEvidenceFreshnessSweep(owner.orgId);

    expect(summary).toEqual({ organization_id: owner.orgId, stale: 1, downgraded: 0, cleared: 0, notified: 1 });
    expect(await readFlag(risk)).not.toBeNull();
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it("flags a risk whose evidence was untouched for 91 days", async () => {
    const { owner } = await seedTwoTenantContexts();
    const risk = await createTestRisk(owner.orgId, { risk_owner: owner.userId });
    await createTestEvidence(owner.orgId, {
      expiry: daysFromNow(200),
      updatedAt: daysAgo(91),
      riskIds: [risk],
    });

    const summary = await runEvidenceFreshnessSweep(owner.orgId);

    expect(summary.stale).toBe(1);
    expect(await readFlag(risk)).not.toBeNull();
  });

  it("leaves a risk with 89-day-old evidence fresh (boundary control)", async () => {
    const { owner } = await seedTwoTenantContexts();
    const risk = await createTestRisk(owner.orgId, { risk_owner: owner.userId });
    await createTestEvidence(owner.orgId, {
      expiry: daysFromNow(200),
      updatedAt: daysAgo(89),
      riskIds: [risk],
    });

    const summary = await runEvidenceFreshnessSweep(owner.orgId);

    expect(summary).toEqual({ organization_id: owner.orgId, stale: 0, downgraded: 0, cleared: 0, notified: 0 });
    expect(await readFlag(risk)).toBeNull();
  });

  it("flags both risks mapped to one stale evidence", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, { risk_owner: owner.userId });
    const b = await createTestRisk(owner.orgId, { risk_owner: owner.userId });
    await createTestEvidence(owner.orgId, {
      expiry: daysFromNow(200),
      updatedAt: daysAgo(120),
      riskIds: [a, b],
    });

    const summary = await runEvidenceFreshnessSweep(owner.orgId);

    expect(summary).toEqual({ organization_id: owner.orgId, stale: 2, downgraded: 0, cleared: 0, notified: 2 });
    expect(await readFlag(a)).not.toBeNull();
    expect(await readFlag(b)).not.toBeNull();
  });

  it("is idempotent: a second run notifies nothing", async () => {
    const { owner } = await seedTwoTenantContexts();
    const risk = await createTestRisk(owner.orgId, { risk_owner: owner.userId });
    await createTestEvidence(owner.orgId, {
      expiry: daysAgo(5),
      updatedAt: new Date(),
      riskIds: [risk],
    });

    await runEvidenceFreshnessSweep(owner.orgId);
    const second = await runEvidenceFreshnessSweep(owner.orgId);

    expect(second).toEqual({ organization_id: owner.orgId, stale: 0, downgraded: 0, cleared: 0, notified: 0 });
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it("clears the flag once the stale evidence is deleted", async () => {
    const { owner } = await seedTwoTenantContexts();
    const risk = await createTestRisk(owner.orgId, { risk_owner: owner.userId });
    const evidence = await createTestEvidence(owner.orgId, {
      expiry: daysAgo(5),
      updatedAt: new Date(),
      riskIds: [risk],
    });

    await runEvidenceFreshnessSweep(owner.orgId);
    expect(await readFlag(risk)).not.toBeNull();

    await sequelize.query(`DELETE FROM evidence_hub WHERE id = :evidence`, {
      replacements: { evidence },
    });
    const summary = await runEvidenceFreshnessSweep(owner.orgId);

    expect(summary).toEqual({ organization_id: owner.orgId, stale: 0, downgraded: 0, cleared: 1, notified: 0 });
    expect(await readFlag(risk)).toBeNull();
  });

  it("POST /api/evidenceHub/freshness-sweep runs the sweep and is safe to repeat", async () => {
    const { owner } = await seedTwoTenantContexts();
    const risk = await createTestRisk(owner.orgId, { risk_owner: owner.userId });
    await createTestEvidence(owner.orgId, {
      expiry: daysAgo(5),
      updatedAt: new Date(),
      riskIds: [risk],
    });

    const first = await owner.request.post("/api/evidenceHub/freshness-sweep");
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({
      organization_id: owner.orgId,
      stale: 1,
      downgraded: 0,
      cleared: 0,
      notified: 1,
    });

    const second = await owner.request.post("/api/evidenceHub/freshness-sweep");
    expect(second.status).toBe(200);
    expect(second.body.data).toEqual({
      organization_id: owner.orgId,
      stale: 0,
      downgraded: 0,
      cleared: 0,
      notified: 0,
    });
  });

  it("downgrades a flagged 'Completed' risk but leaves an 'In Progress' one alone", async () => {
    const { owner } = await seedTwoTenantContexts();
    const completed = await createTestRisk(owner.orgId, { risk_owner: owner.userId });
    const inProgress = await createTestRisk(owner.orgId, { risk_owner: owner.userId });
    await setStatus(completed, "Completed");
    await setStatus(inProgress, "In Progress");
    await createTestEvidence(owner.orgId, {
      expiry: daysAgo(5),
      updatedAt: new Date(),
      riskIds: [completed, inProgress],
    });

    const summary = await runEvidenceFreshnessSweep(owner.orgId);

    expect(summary).toEqual({
      organization_id: owner.orgId,
      stale: 2,
      downgraded: 1,
      cleared: 0,
      notified: 2,
    });
    expect(await readStatus(completed)).toBe("Requires review");
    expect(await readStatus(inProgress)).toBe("In Progress");
  });

  it("clearing the flag does not restore 'Completed'", async () => {
    const { owner } = await seedTwoTenantContexts();
    const risk = await createTestRisk(owner.orgId, { risk_owner: owner.userId });
    await setStatus(risk, "Completed");
    const evidence = await createTestEvidence(owner.orgId, {
      expiry: daysAgo(5),
      updatedAt: new Date(),
      riskIds: [risk],
    });

    const first = await runEvidenceFreshnessSweep(owner.orgId);
    expect(first.downgraded).toBe(1);

    // Refresh the evidence: expiry pushed out, updated_at touched.
    await sequelize.query(
      `UPDATE evidence_hub SET expiry_date = :expiry, updated_at = NOW() WHERE id = :evidence`,
      { replacements: { evidence, expiry: daysFromNow(200) } },
    );
    const second = await runEvidenceFreshnessSweep(owner.orgId);

    expect(second).toEqual({
      organization_id: owner.orgId,
      stale: 0,
      downgraded: 0,
      cleared: 1,
      notified: 0,
    });
    expect(await readFlag(risk)).toBeNull();
    expect(await readStatus(risk)).toBe("Requires review");
  });
});
