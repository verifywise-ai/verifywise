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
  fields: {
    name?: string;
    provider?: string;
    risk_level?: string;
    status?: string;
    type?: string;
    paths?: string[];
  } = {},
) {
  const filePaths = (fields.paths ?? []).map((path, i) => ({
    path,
    line_number: i + 1,
    matched_text: "x",
  }));
  const [rows] = await sequelize.query(
    `INSERT INTO ai_detection_findings
       (organization_id, scan_id, finding_type, category, name, provider, confidence,
        risk_level, governance_status, file_paths, file_count)
     VALUES (:orgId, :scanId, :type, 'LLM providers', :name, :provider, 'high',
        :risk_level, :status, CAST(:filePaths AS jsonb), 1)
     RETURNING id`,
    {
      replacements: {
        orgId,
        scanId,
        type: fields.type ?? "library",
        name: fields.name ?? "OpenAI",
        provider: fields.provider ?? "OpenAI",
        risk_level: fields.risk_level ?? "medium",
        status: fields.status ?? null,
        filePaths: JSON.stringify(filePaths),
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
  return applyGovernanceDecisionsToScanQuery(scanId, orgId);
}

async function decisionCount(orgId: number) {
  const [rows] = await sequelize.query(
    `SELECT governance_status FROM ai_detection_governance_decisions WHERE organization_id = :orgId`,
    { replacements: { orgId } },
  );
  return (rows as Array<{ governance_status: string }>).map((r) => r.governance_status);
}

async function decide(
  ctx: TenantContext,
  scanId: number,
  findingId: number,
  status: string | null,
) {
  const res = await ctx.request
    .patch(`${V1_BASE}/${scanId}/findings/${findingId}/governance`)
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
    expect(res.body.data.decision_scope).toBe("repository");

    const second = await createScan(owner.orgId, owner.userId, "ACME", "App");
    const later = await createFinding(owner.orgId, second, { name: "openai", provider: "openai" });
    expect(await apply(second, owner.orgId)).toBe(1);
    expect(await statusOf(later)).toEqual({
      governance_status: "approved",
      governance_updated_by: owner.userId,
    });

    const list = await owner.request.get(`${V1_BASE}/${second}/findings`);
    expect(list.status).toBe(200);
    expect(list.body.data.is_latest_scan).toBe(true);
    const row = list.body.data.findings.find((f: { id: number }) => f.id === later);
    expect(row.governance_status).toBe("approved");
    expect(row.governance_updated_by_name).toBe(res.body.data.governance_updated_by_name);

    // The frozen legacy routes keep their response shapes
    const legacyList = await owner.request.get(`${BASE}/${second}/findings`);
    expect(legacyList.status).toBe(200);
    expect(legacyList.body.data).not.toHaveProperty("is_latest_scan");
    const legacyRow = legacyList.body.data.findings.find((f: { id: number }) => f.id === later);
    expect(legacyRow).not.toHaveProperty("governance_updated_by_name");
    const legacyPatch = await owner.request
      .patch(`${BASE}/${second}/findings/${later}/governance`)
      .send({ governance_status: null });
    expect(legacyPatch.status).toBe(200);
    expect(Object.keys(legacyPatch.body.data).sort()).toEqual([
      "governance_status",
      "governance_updated_at",
      "governance_updated_by",
      "id",
    ]);
    expect(legacyPatch.body.data.governance_updated_by).toBe(owner.userId);
  });

  it("changes the stored decision only from the repository's latest completed scan", async () => {
    const { owner } = await seedTwoTenantContexts();
    const first = await createScan(owner.orgId, owner.userId);
    const old = await createFinding(owner.orgId, first);
    const second = await createScan(owner.orgId, owner.userId);
    const latest = await createFinding(owner.orgId, second);
    await decide(owner, second, latest, "approved");

    // Clearing or changing the status on the older scan changes only that scan
    const cleared = await decide(owner, first, old, "flagged");
    expect(cleared.body.data.decision_scope).toBe("scan");
    expect((await statusOf(old)).governance_status).toBe("flagged");
    expect(await decisionCount(owner.orgId)).toEqual(["approved"]);
    const clearedOld = await decide(owner, first, old, null);
    expect(clearedOld.body.data.decision_scope).toBe("scan");
    expect(await decisionCount(owner.orgId)).toEqual(["approved"]);

    const olderList = await owner.request.get(`${V1_BASE}/${first}/findings`);
    expect(olderList.body.data.is_latest_scan).toBe(false);

    const third = await createScan(owner.orgId, owner.userId);
    const next = await createFinding(owner.orgId, third);
    await apply(third, owner.orgId);
    expect((await statusOf(next)).governance_status).toBe("approved");
  });

  it("carries a decision on a located finding only while it stays in the decided files", async () => {
    const { owner } = await seedTwoTenantContexts();
    const first = await createScan(owner.orgId, owner.userId);
    const vuln = await createFinding(owner.orgId, first, {
      type: "prompt_injection",
      name: "Prompt injection",
      provider: "",
      paths: ["src/chat.ts", "src/chat.ts"],
    });
    const flaggedSecret = await createFinding(owner.orgId, first, {
      type: "secret",
      name: "OpenAI key",
      provider: "",
      paths: ["src/config.ts"],
    });
    const library = await createFinding(owner.orgId, first, { paths: ["src/a.ts"] });
    await decide(owner, first, vuln, "suppressed");
    await decide(owner, first, flaggedSecret, "flagged");
    await decide(owner, first, library, "approved");

    // Same files (other line numbers): the decision carries
    const second = await createScan(owner.orgId, owner.userId);
    const sameFiles = await createFinding(owner.orgId, second, {
      type: "prompt_injection",
      name: "Prompt injection",
      provider: "",
      paths: ["src/chat.ts"],
    });
    await apply(second, owner.orgId);
    expect((await statusOf(sameFiles)).governance_status).toBe("suppressed");

    // A new file: the vulnerability arrives unreviewed, a flag still carries,
    // and a library used in a new file keeps its approval
    const third = await createScan(owner.orgId, owner.userId);
    const spread = await createFinding(owner.orgId, third, {
      type: "prompt_injection",
      name: "Prompt injection",
      provider: "",
      paths: ["src/chat.ts", "src/agent.ts"],
    });
    const movedSecret = await createFinding(owner.orgId, third, {
      type: "secret",
      name: "OpenAI key",
      provider: "",
      paths: ["src/other.ts"],
    });
    const usedElsewhere = await createFinding(owner.orgId, third, {
      paths: ["src/a.ts", "src/b.ts"],
    });
    await apply(third, owner.orgId);
    expect((await statusOf(spread)).governance_status).toBeNull();
    expect((await statusOf(movedSecret)).governance_status).toBe("flagged");
    expect((await statusOf(usedElsewhere)).governance_status).toBe("approved");
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

  it("adds a suggestion to the risk register once, even when two adds race", async () => {
    const { owner } = await seedTwoTenantContexts();
    const scanId = await createScan(owner.orgId, owner.userId);
    const url = `${V1_BASE}/${scanId}/suggested-risks/actions`;
    const risksUrl = `${V1_BASE}/${scanId}/suggested-risks/risks`;
    const body = {
      suggestion_name: "Prompt injection",
      risk_name: "Prompt injection in the chat endpoint",
      risk_owner: owner.userId,
    };

    const [a, b] = await Promise.all([
      owner.request.post(risksUrl).send(body),
      owner.request.post(risksUrl).send({ ...body, suggestion_name: "prompt injection " }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const created = a.status === 201 ? a : b;
    const refused = a.status === 201 ? b : a;
    const riskId = created.body.data.id as number;
    expect(refused.body.risk_id).toBe(riskId);

    const [riskRows] = await sequelize.query(
      `SELECT id FROM risks WHERE organization_id = :orgId AND risk_name = :name`,
      { replacements: { orgId: owner.orgId, name: body.risk_name } },
    );
    expect(riskRows).toHaveLength(1);

    const listed = await owner.request.get(url);
    expect(listed.body.data).toEqual([
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
      (r: { risk_name: string }) => r.risk_name === "Data leakage",
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

    // A suggestion whose risk was deleted can be added again
    const readded = await owner.request.post(risksUrl).send(body);
    expect(readded.status).toBe(201);
  });
});
