/**
 * AI Detection: review decisions carried across scans of a repository.
 */
jest.setTimeout(60000);

import { sequelize } from "../../database/db";
import { cleanupDatabase } from "./helpers";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import type { TenantContext } from "./tenant-isolation/tenantIsolation.harness";
import { applyGovernanceDecisionsToScanQuery } from "../../utils/aiDetectionDecisions.utils";

const BASE = "/api/ai-detection/scans";
const V1_BASE = "/api/v1/ai-detection/scans";

async function createScan(orgId: number, userId: number, owner = "acme", repo = "app") {
  const [rows] = await sequelize.query(
    `INSERT INTO ai_detection_scans
       (organization_id, repository_url, repository_owner, repository_name, status, triggered_by)
     VALUES (:orgId, :url, :owner, :repo, 'completed', :userId)
     RETURNING id`,
    {
      replacements: { orgId, userId, owner, repo, url: `https://github.com/${owner}/${repo}` },
    },
  );
  return (rows as Array<{ id: number }>)[0].id;
}

async function createFinding(
  orgId: number,
  scanId: number,
  fields: { name?: string; provider?: string; risk_level?: string; status?: string } = {},
) {
  const [rows] = await sequelize.query(
    `INSERT INTO ai_detection_findings
       (organization_id, scan_id, finding_type, category, name, provider, confidence,
        risk_level, governance_status, file_paths, file_count)
     VALUES (:orgId, :scanId, 'library', 'LLM providers', :name, :provider, 'high',
        :risk_level, :status, '[]'::jsonb, 1)
     RETURNING id`,
    {
      replacements: {
        orgId,
        scanId,
        name: fields.name ?? "OpenAI",
        provider: fields.provider ?? "OpenAI",
        risk_level: fields.risk_level ?? "medium",
        status: fields.status ?? null,
      },
    },
  );
  return (rows as Array<{ id: number }>)[0].id;
}

async function statusOf(findingId: number) {
  const [rows] = await sequelize.query(
    `SELECT governance_status, governance_updated_by FROM ai_detection_findings WHERE id = :id`,
    { replacements: { id: findingId } },
  );
  return (
    rows as Array<{ governance_status: string | null; governance_updated_by: number | null }>
  )[0];
}

async function apply(scanId: number, orgId: number) {
  return sequelize.transaction((transaction) =>
    applyGovernanceDecisionsToScanQuery(scanId, orgId, transaction),
  );
}

async function decide(
  ctx: TenantContext,
  scanId: number,
  findingId: number,
  status: string | null,
) {
  const res = await ctx.request
    .patch(`${BASE}/${scanId}/findings/${findingId}/governance`)
    .send({ governance_status: status });
  if (res.status !== 200) {
    throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res;
}

describe("AI Detection decisions across scans", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("carries a decision to the same finding in a later scan, ignoring name and repository case", async () => {
    const { owner } = await seedTwoTenantContexts();
    const first = await createScan(owner.orgId, owner.userId);
    const finding = await createFinding(owner.orgId, first);
    const res = await decide(owner, first, finding, "approved");
    expect(res.body.data.governance_updated_by).toBe(owner.userId);
    expect(res.body.data.governance_updated_by_name).toEqual(expect.any(String));

    const second = await createScan(owner.orgId, owner.userId, "ACME", "App");
    const later = await createFinding(owner.orgId, second, { name: "openai", provider: "openai" });
    expect(await apply(second, owner.orgId)).toBe(1);
    expect(await statusOf(later)).toEqual({
      governance_status: "approved",
      governance_updated_by: owner.userId,
    });

    const list = await owner.request.get(`${BASE}/${second}/findings`);
    expect(list.status).toBe(200);
    const row = list.body.data.findings.find((f: { id: number }) => f.id === later);
    expect(row.governance_status).toBe("approved");
    expect(row.governance_updated_by_name).toBe(res.body.data.governance_updated_by_name);
  });

  it("uses the latest decision and drops it when the status is cleared", async () => {
    const { owner } = await seedTwoTenantContexts();
    const first = await createScan(owner.orgId, owner.userId);
    const finding = await createFinding(owner.orgId, first);
    await decide(owner, first, finding, "reviewed");
    await decide(owner, first, finding, "accepted_risk");

    const second = await createScan(owner.orgId, owner.userId);
    const later = await createFinding(owner.orgId, second);
    await apply(second, owner.orgId);
    expect((await statusOf(later)).governance_status).toBe("accepted_risk");

    await decide(owner, second, later, null);
    const third = await createScan(owner.orgId, owner.userId);
    const latest = await createFinding(owner.orgId, third);
    expect(await apply(third, owner.orgId)).toBe(0);
    expect((await statusOf(latest)).governance_status).toBeNull();
  });

  it("resets the decision when the finding's risk has risen, except a flag", async () => {
    const { owner } = await seedTwoTenantContexts();
    const first = await createScan(owner.orgId, owner.userId);
    const approved = await createFinding(owner.orgId, first, { name: "OpenAI" });
    const flagged = await createFinding(owner.orgId, first, {
      name: "LangChain",
      provider: "LangChain",
    });
    await decide(owner, first, approved, "approved");
    await decide(owner, first, flagged, "flagged");

    const second = await createScan(owner.orgId, owner.userId);
    const riskier = await createFinding(owner.orgId, second, {
      name: "OpenAI",
      risk_level: "high",
    });
    const riskierFlag = await createFinding(owner.orgId, second, {
      name: "LangChain",
      provider: "LangChain",
      risk_level: "high",
    });
    const calmer = await createFinding(owner.orgId, second, {
      name: "OpenAI",
      provider: "Other",
      risk_level: "low",
    });
    await apply(second, owner.orgId);

    expect((await statusOf(riskier)).governance_status).toBeNull();
    expect((await statusOf(riskierFlag)).governance_status).toBe("flagged");
    // Different provider = different finding identity
    expect((await statusOf(calmer)).governance_status).toBeNull();
  });

  it("does not touch other repositories or findings that already have a status", async () => {
    const { owner } = await seedTwoTenantContexts();
    const first = await createScan(owner.orgId, owner.userId);
    const finding = await createFinding(owner.orgId, first);
    await decide(owner, first, finding, "approved");

    const otherRepo = await createScan(owner.orgId, owner.userId, "acme", "other");
    const otherFinding = await createFinding(owner.orgId, otherRepo);
    expect(await apply(otherRepo, owner.orgId)).toBe(0);
    expect((await statusOf(otherFinding)).governance_status).toBeNull();

    const second = await createScan(owner.orgId, owner.userId);
    const alreadySet = await createFinding(owner.orgId, second, { status: "flagged" });
    expect(await apply(second, owner.orgId)).toBe(0);
    expect((await statusOf(alreadySet)).governance_status).toBe("flagged");
  });

  it("records suggested risk actions and prevents adding the same suggestion twice", async () => {
    const { owner } = await seedTwoTenantContexts();
    const scanId = await createScan(owner.orgId, owner.userId);
    const [riskRows] = await sequelize.query(
      `INSERT INTO risks (organization_id, risk_name) VALUES (:orgId, 'Prompt injection') RETURNING id`,
      { replacements: { orgId: owner.orgId } },
    );
    const riskId = (riskRows as Array<{ id: number }>)[0].id;
    const url = `${V1_BASE}/${scanId}/suggested-risks/actions`;

    const added = await owner.request
      .put(url)
      .send({ risk_name: "Prompt injection", action: "added", risk_id: riskId });
    expect(added.status).toBe(200);
    expect(added.body.data).toEqual([
      expect.objectContaining({ action: "added", risk_id: riskId, risk_deleted: false }),
    ]);

    const again = await owner.request
      .put(url)
      .send({ risk_name: "prompt injection ", action: "ignored", reason: "already_added" });
    expect(again.status).toBe(409);

    const ignored = await owner.request
      .put(url)
      .send({ risk_name: "Data leakage", action: "ignored", reason: "not_real_risk" });
    expect(ignored.status).toBe(200);
    const ignoredRow = ignored.body.data.find(
      (a: { risk_name: string }) => a.risk_name === "Data leakage",
    );
    expect(ignoredRow.ignore_reason).toBe("not_real_risk");

    const restored = await owner.request.delete(`${url}/${ignoredRow.id}`);
    expect(restored.status).toBe(200);
    expect(restored.body.data).toHaveLength(1);

    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :riskId`, {
      replacements: { riskId },
    });
    const afterDelete = await owner.request.get(url);
    expect(afterDelete.body.data[0].risk_deleted).toBe(true);
  });
});
