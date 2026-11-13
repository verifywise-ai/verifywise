jest.setTimeout(60000);

import { sequelize } from "../../../database/db";
import { cleanupDatabase } from "../helpers";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { applyGovernanceDecisionsToScanQuery } from "../../../utils/aiDetectionDecisions.utils";

const BASE = "/api/ai-detection/scans";
const V1_BASE = "/api/v1/ai-detection/scans";

async function createScan(orgId: number, userId: number): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO ai_detection_scans
       (organization_id, repository_url, repository_owner, repository_name, status, triggered_by)
     VALUES (:orgId, 'https://github.com/acme/app', 'acme', 'app', 'completed', :userId)
     RETURNING id`,
    { replacements: { orgId, userId } },
  );
  return (rows as Array<{ id: number }>)[0].id;
}

async function createFinding(orgId: number, scanId: number): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO ai_detection_findings
       (organization_id, scan_id, finding_type, category, name, provider, confidence, risk_level, file_paths, file_count)
     VALUES (:orgId, :scanId, 'library', 'LLM providers', 'OpenAI', 'OpenAI', 'high', 'medium', '[]'::jsonb, 1)
     RETURNING id`,
    { replacements: { orgId, scanId } },
  );
  return (rows as Array<{ id: number }>)[0].id;
}

async function createRisk(orgId: number): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO risks (organization_id, risk_name) VALUES (:orgId, 'Isolation risk') RETURNING id`,
    { replacements: { orgId } },
  );
  return (rows as Array<{ id: number }>)[0].id;
}

async function decisionsFor(orgId: number) {
  const [rows] = await sequelize.query(
    `SELECT organization_id, governance_status FROM ai_detection_governance_decisions
      WHERE organization_id = :orgId`,
    { replacements: { orgId } },
  );
  return rows as Array<{ organization_id: number; governance_status: string }>;
}

async function actionsFor(scanId: number) {
  const [rows] = await sequelize.query(
    `SELECT organization_id, action FROM ai_detection_suggested_risk_actions WHERE scan_id = :scanId`,
    { replacements: { scanId } },
  );
  return rows as Array<{ organization_id: number; action: string }>;
}

describe("AI Detection decisions tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("stores a governance decision in the caller's organization and refuses another organization's finding", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const scanId = await createScan(owner.orgId, owner.userId);
    const findingId = await createFinding(owner.orgId, scanId);

    const ok = await owner.request
      .patch(`${BASE}/${scanId}/findings/${findingId}/governance`)
      .send({ governance_status: "approved" });
    expect(ok.status).toBe(200);
    expect(await decisionsFor(owner.orgId)).toEqual([
      { organization_id: owner.orgId, governance_status: "approved" },
    ]);

    const denied = await attacker.request
      .patch(`${BASE}/${scanId}/findings/${findingId}/governance`)
      .send({ governance_status: "flagged" });
    expect(denied.status).toBe(404);
    expect(await decisionsFor(owner.orgId)).toEqual([
      { organization_id: owner.orgId, governance_status: "approved" },
    ]);
    expect(await decisionsFor(attacker.orgId)).toEqual([]);
  });

  it("never applies one organization's decision to another organization's scan of the same repository", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerScan = await createScan(owner.orgId, owner.userId);
    const ownerFinding = await createFinding(owner.orgId, ownerScan);
    await owner.request
      .patch(`${BASE}/${ownerScan}/findings/${ownerFinding}/governance`)
      .send({ governance_status: "approved" });

    const attackerScan = await createScan(attacker.orgId, attacker.userId);
    const attackerFinding = await createFinding(attacker.orgId, attackerScan);
    const applied = await sequelize.transaction((transaction) =>
      applyGovernanceDecisionsToScanQuery(attackerScan, attacker.orgId, transaction),
    );
    expect(applied).toBe(0);

    const [rows] = await sequelize.query(
      `SELECT governance_status FROM ai_detection_findings WHERE id = :id`,
      { replacements: { id: attackerFinding } },
    );
    expect((rows as Array<{ governance_status: string | null }>)[0].governance_status).toBeNull();
  });

  it("keeps suggested risk actions away from another organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const scanId = await createScan(owner.orgId, owner.userId);

    const ignored = await owner.request
      .put(`${V1_BASE}/${scanId}/suggested-risks/actions`)
      .send({ risk_name: "Prompt injection", action: "ignored", reason: "not_real_risk" });
    expect(ignored.status).toBe(200);
    const actionId = ignored.body.data[0].id as number;

    expect((await owner.request.get(`${V1_BASE}/${scanId}/suggested-risks/actions`)).status).toBe(
      200,
    );
    expect(
      (await attacker.request.get(`${V1_BASE}/${scanId}/suggested-risks/actions`)).status,
    ).toBe(404);
    expect(
      (
        await attacker.request
          .put(`${V1_BASE}/${scanId}/suggested-risks/actions`)
          .send({ risk_name: "Prompt injection", action: "ignored", reason: "already_added" })
      ).status,
    ).toBe(404);
    expect(
      (await attacker.request.delete(`${V1_BASE}/${scanId}/suggested-risks/actions/${actionId}`))
        .status,
    ).toBe(404);
    expect(await actionsFor(scanId)).toEqual([{ organization_id: owner.orgId, action: "ignored" }]);
  });

  it("refuses to link a suggestion to another organization's risk", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const attackerScan = await createScan(attacker.orgId, attacker.userId);
    const ownerRisk = await createRisk(owner.orgId);

    const res = await attacker.request
      .put(`${V1_BASE}/${attackerScan}/suggested-risks/actions`)
      .send({ risk_name: "Data leakage", action: "added", risk_id: ownerRisk });
    expect(res.status).toBe(404);
    expect(await actionsFor(attackerScan)).toEqual([]);
  });
});
