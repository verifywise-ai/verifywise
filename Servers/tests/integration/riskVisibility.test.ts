jest.setTimeout(60000);

/**
 * Risk visibility by use case (PR J), against real SQL.
 *
 * Rule: an Admin (or the system viewer) sees every risk in the organization.
 * Anyone else sees a risk that is linked to no use case (framework links do
 * not count), linked to a use case they own, are a member of or reach through
 * a group, or that they own or approve (J1). A hidden risk answers exactly
 * like a missing one on every legacy route (J2).
 *
 * The unit suites check the same rule with sequelize mocked; this one runs
 * every query against Postgres.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser, seedFrameworks } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import {
  createTestProject,
  createTestRisk,
  createTestVendor,
  createTestVendorRisk,
  linkRiskToProject,
  linkVendorToProject,
} from "../factories";
import {
  archiveRiskQuery,
  getAllRisksQuery,
  getRiskByIdQuery,
  getRisksByFrameworkQuery,
  getRisksByProjectQuery,
} from "../../utils/risk.utils";
import {
  isRiskVisibleQuery,
  RiskViewer,
  SYSTEM_RISK_VIEWER,
  UserRiskViewer,
} from "../../utils/riskVisibility.utils";
import { flattenResults, wiseSearch } from "../../utils/search.utils";
import {
  getRiskLinksForRiskQuery,
  getRiskLinksForVendorRiskQuery,
  getSharedProjectCandidatesQuery,
  getVendorRiskChildCandidatesQuery,
} from "../../utils/riskLink.utils";
import { getPortfolioByProject } from "../../utils/quantitativeRisk.utils";
import { getPolicyLinkedObjectByIdQuery } from "../../utils/policyLinkedObject.utils";
import { writeToolExecutors } from "../../advisor/confirmation/createWriteTool";
// Importing the module registers the risk write tools with the executor map.
import "../../advisor/functions/riskFunctions";
import "../../advisor/functions/policyLinkedObjectFunctions";

const ROLE = { Admin: 1, Editor: 3 } as const;
const FRAMEWORK_ID = 1;
const MISSING_ID = 2147483000;

type Api = ReturnType<typeof testRequest>;

interface Seed {
  orgId: number;
  projectA: number;
  projectB: number;
  users: {
    admin: UserRiskViewer;
    memberA: UserRiskViewer;
    groupA: UserRiskViewer;
    noAccess: UserRiskViewer;
  };
  risks: {
    onlyA: number;
    onlyB: number;
    both: number;
    unlinked: number;
    frameworkOnly: number;
    ownedOnB: number;
    approvedOnB: number;
  };
}

let seed: Seed;
let counter = 0;

async function user(orgId: number, role: keyof typeof ROLE): Promise<UserRiskViewer> {
  counter += 1;
  const userId = await createTestUser(
    orgId,
    ROLE[role],
    `risk-visibility-${Date.now()}-${counter}@test.com`,
    "Pw123456!",
  );
  return { userId, role };
}

async function risk(orgId: number, name: string, projects: number[]): Promise<number> {
  const id = await createTestRisk(orgId, {
    risk_name: `Visprobe ${name}`,
    risk_description: "Visibility probe",
  });
  for (const projectId of projects) await linkRiskToProject(orgId, id, projectId);
  return id;
}

async function seedOrganization(): Promise<Seed> {
  const orgId = await createTestOrganization();
  const admin = await user(orgId, "Admin");
  const memberA = await user(orgId, "Editor");
  const groupA = await user(orgId, "Editor");
  const noAccess = await user(orgId, "Editor");

  const projectA = await createTestProject(orgId, admin.userId, { project_title: "Use case A" });
  const projectB = await createTestProject(orgId, admin.userId, { project_title: "Use case B" });

  await sequelize.query(
    `INSERT INTO projects_members (organization_id, project_id, user_id)
     VALUES (:orgId, :projectA, :memberA)`,
    { replacements: { orgId, projectA, memberA: memberA.userId } },
  );
  const [group] = await sequelize.query<{ id: number }>(
    `INSERT INTO groups (organization_id, name) VALUES (:orgId, 'Group A') RETURNING id`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  );
  await sequelize.query(
    `INSERT INTO group_members (group_id, user_id, organization_id)
     VALUES (:groupId, :userId, :orgId)`,
    { replacements: { groupId: group.id, userId: groupA.userId, orgId } },
  );
  await sequelize.query(
    `INSERT INTO project_groups (project_id, group_id, organization_id)
     VALUES (:projectA, :groupId, :orgId)`,
    { replacements: { projectA, groupId: group.id, orgId } },
  );

  const risks = {
    onlyA: await risk(orgId, "only A", [projectA]),
    onlyB: await risk(orgId, "only B", [projectB]),
    both: await risk(orgId, "A and B", [projectA, projectB]),
    unlinked: await risk(orgId, "unlinked", []),
    frameworkOnly: await risk(orgId, "framework only", []),
    ownedOnB: await risk(orgId, "owned on B", [projectB]),
    approvedOnB: await risk(orgId, "approved on B", [projectB]),
  };
  await sequelize.query(
    `INSERT INTO frameworks_risks (organization_id, risk_id, framework_id)
     VALUES (:orgId, :frameworkOnly, :fw), (:orgId, :onlyB, :fw)`,
    {
      replacements: {
        orgId,
        frameworkOnly: risks.frameworkOnly,
        onlyB: risks.onlyB,
        fw: FRAMEWORK_ID,
      },
    },
  );
  await sequelize.query(
    `UPDATE risks SET risk_owner = CASE WHEN id = :owned THEN :userId ELSE risk_owner END,
                      risk_approval = CASE WHEN id = :approved THEN :userId ELSE risk_approval END
      WHERE id IN (:owned, :approved)`,
    {
      replacements: {
        owned: risks.ownedOnB,
        approved: risks.approvedOnB,
        userId: noAccess.userId,
      },
    },
  );

  return { orgId, projectA, projectB, users: { admin, memberA, groupA, noAccess }, risks };
}

async function apiAs(viewer: UserRiskViewer): Promise<Api> {
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId: viewer.userId, organizationId: seed.orgId, role: viewer.role },
  });
  return testRequest(app);
}

const ids = (rows: { id?: number }[] | null) => (rows ?? []).map((r) => Number(r.id)).sort();
const sorted = (values: number[]) => [...values].sort();

async function riskRow(id: number) {
  const [row] = await sequelize.query<Record<string, any>>(
    `SELECT risk_owner, mitigation_status, review_notes, is_deleted, benchmark_id
       FROM risks WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return row;
}

async function projectLinks(riskId: number): Promise<number[]> {
  const rows = await sequelize.query<{ project_id: number }>(
    `SELECT project_id FROM projects_risks WHERE risk_id = :riskId`,
    { replacements: { riskId }, type: QueryTypes.SELECT },
  );
  return sorted(rows.map((r) => Number(r.project_id)));
}

/** What each viewer sees in the organization's risk list. */
function expectedVisible(): Record<string, number[]> {
  const r = seed.risks;
  const all = Object.values(r);
  const onA = [r.onlyA, r.both, r.unlinked, r.frameworkOnly];
  return {
    admin: sorted(all),
    memberA: sorted(onA),
    groupA: sorted(onA),
    noAccess: sorted([r.unlinked, r.frameworkOnly, r.ownedOnB, r.approvedOnB]),
  };
}

beforeEach(async () => {
  await cleanupDatabase();
  await seedFrameworks();
  seed = await seedOrganization();
});

afterAll(async () => {
  await cleanupDatabase();
});

const VIEWERS = ["admin", "memberA", "groupA", "noAccess"] as const;

describe("risk reads", () => {
  it.each(VIEWERS)("the list shows %s exactly the risks they can see", async (name) => {
    const viewer = seed.users[name];
    expect(ids(await getAllRisksQuery(seed.orgId, "active", viewer))).toEqual(
      expectedVisible()[name],
    );
  });

  it("the system viewer sees every risk", async () => {
    expect(ids(await getAllRisksQuery(seed.orgId, "active", SYSTEM_RISK_VIEWER))).toEqual(
      expectedVisible().admin,
    );
  });

  it("isRiskVisibleQuery agrees with the list for every viewer and risk", async () => {
    const visible = expectedVisible();
    for (const name of VIEWERS) {
      for (const id of Object.values(seed.risks)) {
        expect([name, id, await isRiskVisibleQuery(id, seed.orgId, seed.users[name])]).toEqual([
          name,
          id,
          visible[name].includes(id),
        ]);
      }
      expect(await isRiskVisibleQuery(MISSING_ID, seed.orgId, seed.users[name])).toBe(
        name === "admin",
      );
    }
  });

  it("a risk's own projects list is not narrowed by the rule", async () => {
    const rows = await getAllRisksQuery(seed.orgId, "active", seed.users.memberA);
    const both = rows.find((row) => Number(row.id) === seed.risks.both) as any;
    expect(sorted(both.projects.map(Number))).toEqual(sorted([seed.projectA, seed.projectB]));
  });

  describe("by use case (J7)", () => {
    const byProject = async (projectId: number, viewer: RiskViewer) =>
      ids(await getRisksByProjectQuery(projectId, seed.orgId, "active", viewer));

    it("a member of A gets A's risks and nothing of B", async () => {
      const r = seed.risks;
      expect(await byProject(seed.projectA, seed.users.memberA)).toEqual(sorted([r.onlyA, r.both]));
      expect(await byProject(seed.projectA, seed.users.groupA)).toEqual(sorted([r.onlyA, r.both]));
      // The shared risk is visible to them, but B's list is not theirs to read.
      expect(await byProject(seed.projectB, seed.users.memberA)).toEqual([]);
    });

    it("a user with no use cases gets only what they own or approve there", async () => {
      const r = seed.risks;
      expect(await byProject(seed.projectA, seed.users.noAccess)).toEqual([]);
      expect(await byProject(seed.projectB, seed.users.noAccess)).toEqual(
        sorted([r.ownedOnB, r.approvedOnB]),
      );
    });

    it("an Admin and the system viewer get every risk on the use case", async () => {
      const r = seed.risks;
      const onB = sorted([r.onlyB, r.both, r.ownedOnB, r.approvedOnB]);
      expect(await byProject(seed.projectB, seed.users.admin)).toEqual(onB);
      expect(await byProject(seed.projectB, SYSTEM_RISK_VIEWER)).toEqual(onB);
    });

    it("GET /projectRisks/by-projid answers through the same rule", async () => {
      const res = await (
        await apiAs(seed.users.memberA)
      ).get(`/api/projectRisks/by-projid/${seed.projectA}`);
      expect(res.status).toBe(200);
      expect(ids(res.body.data)).toEqual(sorted([seed.risks.onlyA, seed.risks.both]));
    });
  });

  it("by framework keeps only the visible risks", async () => {
    const r = seed.risks;
    const byFramework = async (viewer: RiskViewer) =>
      ids(await getRisksByFrameworkQuery(FRAMEWORK_ID, seed.orgId, "active", viewer));
    expect(await byFramework(seed.users.admin)).toEqual(sorted([r.frameworkOnly, r.onlyB]));
    expect(await byFramework(SYSTEM_RISK_VIEWER)).toEqual(sorted([r.frameworkOnly, r.onlyB]));
    expect(await byFramework(seed.users.memberA)).toEqual([r.frameworkOnly]);
    expect(await byFramework(seed.users.noAccess)).toEqual([r.frameworkOnly]);
  });

  it("GET /projectRisks/:id answers a hidden risk like a missing one", async () => {
    const api = await apiAs(seed.users.memberA);
    const hidden = await api.get(`/api/projectRisks/${seed.risks.onlyB}`);
    const missing = await api.get(`/api/projectRisks/${MISSING_ID}`);
    expect(hidden.status).toBe(missing.status);
    expect(hidden.body).toEqual(missing.body);

    const shown = await api.get(`/api/projectRisks/${seed.risks.onlyA}`);
    expect(shown.status).toBe(200);
    const asAdmin = await (
      await apiAs(seed.users.admin)
    ).get(`/api/projectRisks/${seed.risks.onlyB}`);
    expect(asAdmin.status).toBe(200);
  });
});

describe("risk writes", () => {
  it("PUT and DELETE of a hidden risk answer like a missing one and change nothing", async () => {
    const api = await apiAs(seed.users.memberA);
    const before = await riskRow(seed.risks.onlyB);

    const hiddenPut = await api
      .put(`/api/projectRisks/${seed.risks.onlyB}`)
      .send({ review_notes: "Changed" });
    const missingPut = await api
      .put(`/api/projectRisks/${MISSING_ID}`)
      .send({ review_notes: "Changed" });
    expect(hiddenPut.status).toBe(404);
    expect(hiddenPut.body).toEqual(missingPut.body);

    const hiddenDelete = await api.delete(`/api/projectRisks/${seed.risks.onlyB}`);
    const missingDelete = await api.delete(`/api/projectRisks/${MISSING_ID}`);
    expect(hiddenDelete.status).toBe(404);
    expect(hiddenDelete.body).toEqual(missingDelete.body);

    expect(await riskRow(seed.risks.onlyB)).toEqual(before);
  });

  it("a visible risk can still be edited and deleted", async () => {
    const api = await apiAs(seed.users.memberA);
    const put = await api
      .put(`/api/projectRisks/${seed.risks.onlyA}`)
      .send({ review_notes: "Changed" });
    expect(put.status).toBe(200);
    expect((await riskRow(seed.risks.onlyA)).review_notes).toBe("Changed");

    const del = await api.delete(`/api/projectRisks/${seed.risks.unlinked}`);
    expect(del.status).toBe(200);
    expect((await riskRow(seed.risks.unlinked)).is_deleted).toBe(true);
  });

  it("the owner of a hidden-use-case risk can edit it (J1)", async () => {
    const api = await apiAs(seed.users.noAccess);
    const put = await api
      .put(`/api/projectRisks/${seed.risks.ownedOnB}`)
      .send({ review_notes: "Owner edit" });
    expect(put.status).toBe(200);
  });

  it("a bulk action with a hidden id gets the unknown-id error and changes nothing", async () => {
    const api = await apiAs(seed.users.memberA);
    const hidden = await api
      .patch("/api/projectRisks/bulk")
      .send({ ids: [seed.risks.onlyA, seed.risks.onlyB], action: "archive" });
    const missing = await api
      .patch("/api/projectRisks/bulk")
      .send({ ids: [seed.risks.onlyA, MISSING_ID], action: "archive" });

    expect(hidden.status).toBe(403);
    expect(hidden.body).toEqual(missing.body);
    expect((await riskRow(seed.risks.onlyA)).is_deleted).toBe(false);
    expect((await riskRow(seed.risks.onlyB)).is_deleted).toBe(false);
  });

  it("linking to a use case the user cannot access gets the out-of-organization error", async () => {
    const api = await apiAs(seed.users.memberA);
    const inaccessible = await api
      .put(`/api/projectRisks/${seed.risks.onlyA}`)
      .send({ projects: [seed.projectA, seed.projectB] });

    const otherOrg = await createTestOrganization();
    const otherOwner = await createTestUser(otherOrg, 1, `other-${Date.now()}@test.com`, "Pw1!");
    const foreign = await createTestProject(otherOrg, otherOwner);
    const outside = await api
      .put(`/api/projectRisks/${seed.risks.onlyA}`)
      .send({ projects: [seed.projectA, foreign] });

    expect(inaccessible.status).toBe(400);
    expect(inaccessible.body).toEqual(outside.body);
    expect(await projectLinks(seed.risks.onlyA)).toEqual([seed.projectA]);
  });

  it("a non-Admin's edit keeps the links to use cases they cannot see (J3)", async () => {
    const api = await apiAs(seed.users.memberA);
    const res = await api
      .put(`/api/projectRisks/${seed.risks.both}`)
      .send({ projects: [seed.projectA] });
    expect(res.status).toBe(200);
    expect(await projectLinks(seed.risks.both)).toEqual(sorted([seed.projectA, seed.projectB]));
  });

  it("an Admin's edit replaces the links", async () => {
    const api = await apiAs(seed.users.admin);
    const res = await api
      .put(`/api/projectRisks/${seed.risks.both}`)
      .send({ projects: [seed.projectA] });
    expect(res.status).toBe(200);
    expect(await projectLinks(seed.risks.both)).toEqual([seed.projectA]);
  });
});

describe("secondary reads", () => {
  it("search returns only visible risks", async () => {
    const search = async (viewer: UserRiskViewer) =>
      sorted(
        flattenResults(
          await wiseSearch({
            query: "Visprobe",
            organizationId: seed.orgId,
            userId: viewer.userId,
            riskViewer: viewer,
          }),
        )
          .filter((result) => result.entityType === "project_risks")
          .map((result) => Number(result.id)),
      );
    const visible = expectedVisible();
    for (const name of VIEWERS) {
      expect([name, await search(seed.users[name])]).toEqual([name, visible[name]]);
    }
  });

  it("change history of a hidden risk reads like a missing one", async () => {
    const admin = await apiAs(seed.users.admin);
    expect(
      (await admin.put(`/api/projectRisks/${seed.risks.onlyB}`).send({ review_notes: "Logged" }))
        .status,
    ).toBe(200);

    const adminHistory = await admin.get(`/api/risk-change-history/${seed.risks.onlyB}`);
    expect(adminHistory.status).toBe(200);
    expect(adminHistory.body.data.data.length).toBeGreaterThan(0);

    const member = await apiAs(seed.users.memberA);
    const hidden = await member.get(`/api/risk-change-history/${seed.risks.onlyB}`);
    const missing = await member.get(`/api/risk-change-history/${MISSING_ID}`);
    expect(hidden.status).toBe(200);
    expect(hidden.body).toEqual(missing.body);
    expect(hidden.body.data).toEqual({ data: [], hasMore: false, total: 0 });
  });

  describe("risk links", () => {
    beforeEach(async () => {
      // onlyA inherits from onlyB: a visible subject with a hidden parent.
      await sequelize.query(
        `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id, relation_type, status, source, reasons)
         VALUES (:orgId, :child, :parent, 'inherits_from', 'confirmed', 'user', '[]'::jsonb)`,
        {
          replacements: {
            orgId: seed.orgId,
            child: seed.risks.onlyA,
            parent: seed.risks.onlyB,
          },
        },
      );
    });

    const links = (riskId: number, viewer: RiskViewer) =>
      getRiskLinksForRiskQuery(seed.orgId, riskId, ["confirmed"], viewer);

    it("drops a hidden related risk and returns nothing for a hidden subject", async () => {
      expect(await links(seed.risks.onlyA, seed.users.memberA)).toEqual([]);
      expect(await links(seed.risks.onlyB, seed.users.memberA)).toEqual([]);
    });

    it("an Admin and the system viewer see the link from both ends", async () => {
      for (const viewer of [seed.users.admin, SYSTEM_RISK_VIEWER]) {
        expect((await links(seed.risks.onlyA, viewer)).map((l) => Number(l.related_id))).toEqual([
          seed.risks.onlyB,
        ]);
        expect((await links(seed.risks.onlyB, viewer)).map((l) => Number(l.related_id))).toEqual([
          seed.risks.onlyA,
        ]);
      }
    });

    it("the subject's own links survive when both ends are visible", async () => {
      const r = seed.risks;
      await sequelize.query(
        `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id, relation_type, status, source, reasons)
         VALUES (:orgId, :child, :parent, 'inherits_from', 'confirmed', 'user', '[]'::jsonb)`,
        { replacements: { orgId: seed.orgId, child: r.both, parent: r.unlinked } },
      );
      expect((await links(r.both, seed.users.memberA)).map((l) => Number(l.related_id))).toEqual([
        r.unlinked,
      ]);
    });
  });

  describe("vendor risks and shared projects", () => {
    let vendorRisk: number;

    beforeEach(async () => {
      const vendor = await createTestVendor(seed.orgId);
      await linkVendorToProject(seed.orgId, vendor, seed.projectA);
      await linkVendorToProject(seed.orgId, vendor, seed.projectB);
      vendorRisk = await createTestVendorRisk(seed.orgId, { vendor_id: vendor });
    });

    it("shared projects return nothing for a hidden subject", async () => {
      const r = seed.risks;
      expect(
        await getSharedProjectCandidatesQuery(seed.orgId, r.onlyB, seed.users.memberA),
      ).toEqual([]);
      expect(
        (await getSharedProjectCandidatesQuery(seed.orgId, r.onlyB, seed.users.admin)).map(
          (c) => c.id,
        ),
      ).toEqual([vendorRisk]);
      expect(
        (await getSharedProjectCandidatesQuery(seed.orgId, r.onlyA, seed.users.memberA)).map(
          (c) => c.id,
        ),
      ).toEqual([vendorRisk]);
    });

    it("the vendor panel's picker leaves out hidden project risks", async () => {
      const r = seed.risks;
      const candidates = async (viewer: RiskViewer) =>
        sorted(
          (await getVendorRiskChildCandidatesQuery(seed.orgId, vendorRisk, viewer)).map((c) =>
            Number(c.id),
          ),
        );
      const onAOrB = sorted([r.onlyA, r.onlyB, r.both, r.ownedOnB, r.approvedOnB]);
      expect(await candidates(seed.users.admin)).toEqual(onAOrB);
      expect(await candidates(SYSTEM_RISK_VIEWER)).toEqual(onAOrB);
      expect(await candidates(seed.users.memberA)).toEqual(sorted([r.onlyA, r.both]));
      expect(await candidates(seed.users.noAccess)).toEqual(sorted([r.ownedOnB, r.approvedOnB]));

      const res = await (
        await apiAs(seed.users.memberA)
      ).get(`/api/riskLinks/vendor-risks/${vendorRisk}/shared-projects`);
      expect(res.status).toBe(200);
      expect(ids(res.body.data)).toEqual(sorted([r.onlyA, r.both]));
    });

    it("a vendor risk's links drop hidden child risks", async () => {
      await sequelize.query(
        `INSERT INTO risk_links (organization_id, source_risk_id, target_vendor_risk_id, relation_type, status, source, reasons)
         VALUES (:orgId, :a, :vr, 'inherits_from', 'confirmed', 'user', '[]'::jsonb),
                (:orgId, :b, :vr, 'inherits_from', 'confirmed', 'user', '[]'::jsonb)`,
        {
          replacements: {
            orgId: seed.orgId,
            a: seed.risks.onlyA,
            b: seed.risks.onlyB,
            vr: vendorRisk,
          },
        },
      );
      const children = async (viewer: RiskViewer) =>
        sorted(
          (await getRiskLinksForVendorRiskQuery(seed.orgId, vendorRisk, ["confirmed"], viewer)).map(
            (l) => Number(l.related_id),
          ),
        );
      expect(await children(seed.users.admin)).toEqual(
        sorted([seed.risks.onlyA, seed.risks.onlyB]),
      );
      expect(await children(seed.users.memberA)).toEqual([seed.risks.onlyA]);
    });
  });

  describe("quantitative portfolio", () => {
    beforeEach(async () => {
      await sequelize.query(
        `UPDATE risks SET ale_estimate = 100, residual_ale = 50 WHERE organization_id = :orgId`,
        { replacements: { orgId: seed.orgId } },
      );
    });

    const count = async (projectId: number, viewer: RiskViewer) =>
      Number((await getPortfolioByProject(seed.orgId, projectId, viewer)).risk_count);

    it("the per-use-case portfolio sums only what the viewer may see there (J7)", async () => {
      expect(await count(seed.projectA, seed.users.admin)).toBe(2);
      expect(await count(seed.projectB, seed.users.admin)).toBe(4);
      expect(await count(seed.projectB, SYSTEM_RISK_VIEWER)).toBe(4);
      expect(await count(seed.projectA, seed.users.memberA)).toBe(2);
      expect(await count(seed.projectB, seed.users.memberA)).toBe(0);
      expect(await count(seed.projectB, seed.users.noAccess)).toBe(2);
    });

    it("the per-use-case trend is empty for a viewer without access to the use case", async () => {
      await sequelize.query(
        `INSERT INTO risk_portfolio_snapshots
           (organization_id, project_id, total_ale, total_residual_ale, total_mitigation_cost,
            risk_count, snapshot_date, created_at)
         VALUES (:orgId, :a, 200, 100, 0, 2, CURRENT_DATE, NOW()),
                (:orgId, :b, 400, 200, 0, 4, CURRENT_DATE, NOW()),
                (:orgId, NULL, 700, 350, 0, 7, CURRENT_DATE, NOW())`,
        { replacements: { orgId: seed.orgId, a: seed.projectA, b: seed.projectB } },
      );
      const trend = async (viewer: UserRiskViewer, projectId?: number) => {
        const res = await (
          await apiAs(viewer)
        ).get(
          `/api/quantitative-risks/portfolio/trend${projectId ? `?projectId=${projectId}` : ""}`,
        );
        expect(res.status).toBe(200);
        return (res.body.data as { risk_count: number }[]).map((s) => Number(s.risk_count));
      };

      expect(await trend(seed.users.memberA, seed.projectA)).toEqual([2]);
      expect(await trend(seed.users.groupA, seed.projectA)).toEqual([2]);
      expect(await trend(seed.users.noAccess, seed.projectB)).toEqual([]);
      expect(await trend(seed.users.memberA, seed.projectB)).toEqual([]);
      expect(await trend(seed.users.admin, seed.projectA)).toEqual([2]);
      expect(await trend(seed.users.admin, seed.projectB)).toEqual([4]);
      // The organization trend stays organization-wide (J4).
      expect(await trend(seed.users.noAccess)).toEqual([7]);
    });
  });

  it("policy linked objects leave out links to hidden risks", async () => {
    const admin = await apiAs(seed.users.admin);
    const created = await admin.post("/api/policies").send({
      title: `Visibility policy ${Date.now()}`,
      content_html: "<p>Body</p>",
      tags: ["Privacy"],
      next_review_date: "2030-01-15",
    });
    expect(created.status).toBe(201);
    const policyId = created.body.data.id as number;
    await sequelize.query(
      `INSERT INTO policy_linked_objects (organization_id, policy_id, object_type, object_id)
       VALUES (:orgId, :policyId, 'risk', :a), (:orgId, :policyId, 'risk', :b)`,
      { replacements: { orgId: seed.orgId, policyId, a: seed.risks.onlyA, b: seed.risks.onlyB } },
    );

    const linked = async (viewer: RiskViewer) =>
      sorted(
        ((await getPolicyLinkedObjectByIdQuery(policyId, seed.orgId, viewer)) as any[]).map((row) =>
          Number(row.object_id),
        ),
      );
    expect(await linked(seed.users.admin)).toEqual(sorted([seed.risks.onlyA, seed.risks.onlyB]));
    expect(await linked(SYSTEM_RISK_VIEWER)).toEqual(sorted([seed.risks.onlyA, seed.risks.onlyB]));
    expect(await linked(seed.users.memberA)).toEqual([seed.risks.onlyA]);
  });
});

describe("apply benchmark", () => {
  let benchmarkId: number;

  beforeEach(async () => {
    const [row] = await sequelize.query<{ id: number }>(
      `SELECT id FROM risk_benchmarks ORDER BY id LIMIT 1`,
      { type: QueryTypes.SELECT },
    );
    benchmarkId = row.id;
  });

  const apply = async (viewer: UserRiskViewer, riskId: number) =>
    (await apiAs(viewer)).post(`/api/quantitative-risks/${riskId}/apply-benchmark/${benchmarkId}`);

  it("answers a hidden risk like a missing one and writes nothing", async () => {
    const hidden = await apply(seed.users.memberA, seed.risks.onlyB);
    const missing = await apply(seed.users.memberA, MISSING_ID);
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual(missing.body);
    expect((await riskRow(seed.risks.onlyB)).benchmark_id).toBeNull();
  });

  it("applies to a visible risk and to any risk for an Admin", async () => {
    const visible = await apply(seed.users.memberA, seed.risks.onlyA);
    expect(visible.status).toBe(200);
    expect(Number((await riskRow(seed.risks.onlyA)).benchmark_id)).toBe(benchmarkId);

    const admin = await apply(seed.users.admin, seed.risks.onlyB);
    expect(admin.status).toBe(200);
    expect(Number(admin.body.data.id)).toBe(seed.risks.onlyB);
    expect(Number((await riskRow(seed.risks.onlyB)).benchmark_id)).toBe(benchmarkId);

    const adminMissing = await apply(seed.users.admin, MISSING_ID);
    expect(adminMissing.status).toBe(404);
    expect(adminMissing.body).toEqual((await apply(seed.users.memberA, MISSING_ID)).body);
  });
});

describe("advisor raw-SQL writes leave a hidden risk unchanged", () => {
  const run = (toolName: string, params: Record<string, unknown>) => {
    const execute = writeToolExecutors.get(toolName);
    if (!execute) throw new Error(`${toolName} is not registered`);
    return execute(params, seed.orgId);
  };

  it("agent_assign_risk_owner", async () => {
    const { memberA, admin } = seed.users;
    const before = await riskRow(seed.risks.onlyB);
    // A hidden risk reports the same not-found error as a missing one.
    await expect(
      run("agent_assign_risk_owner", {
        risk_id: seed.risks.onlyB,
        owner_user_id: memberA.userId,
        _userId: memberA.userId,
      }),
    ).rejects.toThrow("Risk not found");
    await expect(
      run("agent_assign_risk_owner", {
        risk_id: MISSING_ID,
        owner_user_id: memberA.userId,
        _userId: memberA.userId,
      }),
    ).rejects.toThrow("Risk not found");
    expect(await riskRow(seed.risks.onlyB)).toEqual(before);

    await run("agent_assign_risk_owner", {
      risk_id: seed.risks.onlyA,
      owner_user_id: memberA.userId,
      _userId: memberA.userId,
    });
    expect((await riskRow(seed.risks.onlyA)).risk_owner).toBe(memberA.userId);

    await run("agent_assign_risk_owner", {
      risk_id: seed.risks.onlyB,
      owner_user_id: memberA.userId,
      _userId: admin.userId,
    });
    expect((await riskRow(seed.risks.onlyB)).risk_owner).toBe(memberA.userId);
  });

  it("agent_change_risk_status", async () => {
    const { memberA, admin } = seed.users;
    const before = await riskRow(seed.risks.onlyB);
    await expect(
      run("agent_change_risk_status", {
        risk_id: seed.risks.onlyB,
        status: "Completed",
        _userId: memberA.userId,
      }),
    ).rejects.toThrow("Risk not found");
    expect(await riskRow(seed.risks.onlyB)).toEqual(before);

    await run("agent_change_risk_status", {
      risk_id: seed.risks.onlyB,
      status: "Completed",
      _userId: admin.userId,
    });
    expect((await riskRow(seed.risks.onlyB)).mitigation_status).toBe("Completed");
  });

  it("agent_bulk_update_risk_status reports only what it updated", async () => {
    const { memberA } = seed.users;
    const before = await riskRow(seed.risks.onlyB);
    const result = await run("agent_bulk_update_risk_status", {
      risk_ids: [seed.risks.onlyA, seed.risks.onlyB, MISSING_ID],
      status: "Completed",
      _userId: memberA.userId,
    });
    expect(result).toMatchObject({
      updated_ids: [seed.risks.onlyA],
      not_found_ids: [seed.risks.onlyB, MISSING_ID],
    });
    expect((await riskRow(seed.risks.onlyA)).mitigation_status).toBe("Completed");
    expect(await riskRow(seed.risks.onlyB)).toEqual(before);
  });

  it("agent_delete_risk reports a hidden risk as not found and archives nothing", async () => {
    const { memberA } = seed.users;
    await expect(
      run("agent_delete_risk", { risk_id: seed.risks.onlyB, _userId: memberA.userId }),
    ).rejects.toThrow("Risk not found");
    await expect(
      run("agent_delete_risk", { risk_id: MISSING_ID, _userId: memberA.userId }),
    ).rejects.toThrow("Risk not found");
    expect((await riskRow(seed.risks.onlyB)).is_deleted).toBe(false);

    await run("agent_delete_risk", { risk_id: seed.risks.onlyA, _userId: memberA.userId });
    expect((await riskRow(seed.risks.onlyA)).is_deleted).toBe(true);
  });

  it("after an approval, checks visibility as the requester, not the approver", async () => {
    const { memberA, admin } = seed.users;
    const before = await riskRow(seed.risks.onlyB);
    await expect(
      run("agent_change_risk_status", {
        risk_id: seed.risks.onlyB,
        status: "Completed",
        _userId: admin.userId,
        _requesterId: memberA.userId,
      }),
    ).rejects.toThrow("Risk not found");
    expect(await riskRow(seed.risks.onlyB)).toEqual(before);
  });

  it("with no user at all, touches only risks linked to no use case", async () => {
    await expect(
      run("agent_change_risk_status", { risk_id: seed.risks.onlyA, status: "Completed" }),
    ).rejects.toThrow("Risk not found");
    expect((await riskRow(seed.risks.onlyA)).mitigation_status).not.toBe("Completed");

    await run("agent_change_risk_status", { risk_id: seed.risks.unlinked, status: "Completed" });
    expect((await riskRow(seed.risks.unlinked)).mitigation_status).toBe("Completed");
  });
});

describe("risk link writes treat a hidden risk as a missing one", () => {
  async function insertLink(
    source: number,
    target: number,
    relation: "related_to" | "inherits_from",
    status: "suggested" | "confirmed",
    staleParent = false,
  ): Promise<number> {
    const [row] = await sequelize.query<{ id: number }>(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id, relation_type, status, source, reasons, parent_level_changed_at)
       VALUES (:orgId, :source, :target, :relation, :status, 'derived', '[]'::jsonb, ${
         staleParent ? "NOW()" : "NULL"
       })
       RETURNING id`,
      {
        replacements: { orgId: seed.orgId, source, target, relation, status },
        type: QueryTypes.SELECT,
      },
    );
    return Number(row.id);
  }

  const linkCount = async () => {
    const [row] = await sequelize.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM risk_links WHERE organization_id = :orgId`,
      { replacements: { orgId: seed.orgId }, type: QueryTypes.SELECT },
    );
    return Number(row.count);
  };

  it("creating a link with a hidden source or target answers like a missing risk", async () => {
    const api = await apiAs(seed.users.memberA);
    const r = seed.risks;
    const post = (sourceRiskId: number, targetRiskId: number) =>
      api.post("/api/riskLinks").send({ sourceRiskId, targetRiskId, relationType: "related_to" });

    const hiddenTarget = await post(r.onlyA, r.onlyB);
    const missingTarget = await post(r.onlyA, MISSING_ID);
    expect(hiddenTarget.status).toBe(404);
    expect(hiddenTarget.body).toEqual(missingTarget.body);

    const hiddenSource = await post(r.onlyB, r.onlyA);
    const missingSource = await post(MISSING_ID, r.onlyA);
    expect(hiddenSource.status).toBe(404);
    expect(hiddenSource.body).toEqual(missingSource.body);
    expect(await linkCount()).toBe(0);

    const visible = await post(r.onlyA, r.unlinked);
    expect(visible.status).toBe(201);
    const asAdmin = await (
      await apiAs(seed.users.admin)
    )
      .post("/api/riskLinks")
      .send({ sourceRiskId: r.onlyA, targetRiskId: r.onlyB, relationType: "related_to" });
    expect(asAdmin.status).toBe(201);
  });

  it("changing the status of a link with a hidden end answers like a missing link", async () => {
    const linkId = await insertLink(seed.risks.onlyA, seed.risks.onlyB, "related_to", "suggested");
    const api = await apiAs(seed.users.memberA);
    const hidden = await api.patch(`/api/riskLinks/${linkId}`).send({ status: "confirmed" });
    const missing = await api.patch(`/api/riskLinks/${MISSING_ID}`).send({ status: "confirmed" });
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual(missing.body);

    const [row] = await sequelize.query<{ status: string }>(
      `SELECT status FROM risk_links WHERE id = :linkId`,
      { replacements: { linkId }, type: QueryTypes.SELECT },
    );
    expect(row.status).toBe("suggested");

    const asAdmin = await (
      await apiAs(seed.users.admin)
    )
      .patch(`/api/riskLinks/${linkId}`)
      .send({ status: "confirmed" });
    expect(asAdmin.status).toBe(200);
  });

  it("acknowledging a parent level change on a link with a hidden end answers like a missing link", async () => {
    const linkId = await insertLink(
      seed.risks.onlyA,
      seed.risks.onlyB,
      "inherits_from",
      "confirmed",
      true,
    );
    const api = await apiAs(seed.users.memberA);
    const hidden = await api.post(`/api/riskLinks/${linkId}/acknowledge-parent-change`);
    const missing = await api.post(`/api/riskLinks/${MISSING_ID}/acknowledge-parent-change`);
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual(missing.body);

    const flag = async () =>
      (
        await sequelize.query<{ changed: string | null }>(
          `SELECT parent_level_changed_at AS changed FROM risk_links WHERE id = :linkId`,
          { replacements: { linkId }, type: QueryTypes.SELECT },
        )
      )[0].changed;
    expect(await flag()).not.toBeNull();

    const asAdmin = await (
      await apiAs(seed.users.admin)
    ).post(`/api/riskLinks/${linkId}/acknowledge-parent-change`);
    expect(asAdmin.status).toBe(200);
    expect(await flag()).toBeNull();
  });
});

describe("policy link writes treat a hidden risk as an unknown id", () => {
  let policyId: number;

  beforeEach(async () => {
    const created = await (await apiAs(seed.users.admin)).post("/api/policies").send({
      title: `Visibility link policy ${Date.now()}`,
      content_html: "<p>Body</p>",
      tags: ["Privacy"],
      next_review_date: "2030-01-15",
    });
    expect(created.status).toBe(201);
    policyId = created.body.data.id as number;
  });

  const linkedRisks = async () =>
    sorted(
      (
        await sequelize.query<{ object_id: number }>(
          `SELECT object_id FROM policy_linked_objects
            WHERE policy_id = :policyId AND object_type = 'risk'`,
          { replacements: { policyId }, type: QueryTypes.SELECT },
        )
      ).map((row) => Number(row.object_id)),
    );

  it("linking a hidden risk gets the unknown-id response and links nothing", async () => {
    const api = await apiAs(seed.users.memberA);
    const link = (ids: number[]) =>
      api
        .post(`/api/policy-linked/${policyId}/linked-objects`)
        .send({ object_type: "risk", object_ids: ids });

    const hidden = await link([seed.risks.onlyA, seed.risks.onlyB]);
    const missing = await link([seed.risks.onlyA, MISSING_ID]);
    expect(hidden.status).toBe(403);
    expect(hidden.body).toEqual(missing.body);
    expect(await linkedRisks()).toEqual([]);

    expect((await link([seed.risks.onlyA])).status).toBe(201);
    const asAdmin = await (
      await apiAs(seed.users.admin)
    )
      .post(`/api/policy-linked/${policyId}/linked-objects`)
      .send({ object_type: "risk", object_ids: [seed.risks.onlyB] });
    expect(asAdmin.status).toBe(201);
    expect(await linkedRisks()).toEqual(sorted([seed.risks.onlyA, seed.risks.onlyB]));
  });

  it("the advisor link tool answers a hidden risk like an unknown one", async () => {
    const execute = writeToolExecutors.get("agent_link_object_to_policy");
    if (!execute) throw new Error("agent_link_object_to_policy is not registered");
    const params = (objectId: number) => ({
      policy_id: policyId,
      object_type: "risk",
      object_id: objectId,
      _userId: seed.users.memberA.userId,
    });
    const hidden = await execute(params(seed.risks.onlyB), seed.orgId).catch((e: Error) => e);
    const missing = await execute(params(MISSING_ID), seed.orgId).catch((e: Error) => e);
    expect(hidden).toBeInstanceOf(Error);
    expect((hidden as Error).message).toBe((missing as Error).message);
    expect(await linkedRisks()).toEqual([]);
  });

  it("unlink-all of a hidden risk answers like an unknown id and keeps its links", async () => {
    await sequelize.query(
      `INSERT INTO policy_linked_objects (organization_id, policy_id, object_type, object_id)
       VALUES (:orgId, :policyId, 'risk', :b)`,
      { replacements: { orgId: seed.orgId, policyId, b: seed.risks.onlyB } },
    );
    const api = await apiAs(seed.users.memberA);
    const hidden = await api.delete(`/api/policy-linked/risk/${seed.risks.onlyB}/unlink-all`);
    const missing = await api.delete(`/api/policy-linked/risk/${MISSING_ID}/unlink-all`);
    expect(hidden.status).toBe(missing.status);
    expect(hidden.body).toEqual(missing.body);
    expect(await linkedRisks()).toEqual([seed.risks.onlyB]);

    const asAdmin = await (
      await apiAs(seed.users.admin)
    ).delete(`/api/policy-linked/risk/${seed.risks.onlyB}/unlink-all`);
    expect(asAdmin.status).toBe(200);
    expect(await linkedRisks()).toEqual([]);
  });
});

describe("a projects_risks row with NULL organization_id", () => {
  it("still counts as a link, so the risk stays hidden", async () => {
    const id = await risk(seed.orgId, "null org link", []);
    await sequelize.query(
      `INSERT INTO projects_risks (project_id, risk_id, organization_id)
       VALUES (:projectB, :id, NULL)`,
      { replacements: { projectB: seed.projectB, id } },
    );
    for (const viewer of [seed.users.memberA, seed.users.noAccess]) {
      expect(await isRiskVisibleQuery(id, seed.orgId, viewer)).toBe(false);
      expect(ids(await getAllRisksQuery(seed.orgId, "active", viewer))).not.toContain(id);
    }
    expect(await isRiskVisibleQuery(id, seed.orgId, seed.users.admin)).toBe(true);
  });
});

describe("getRiskByIdQuery and archiveRiskQuery with a viewer", () => {
  it("a hidden risk reads like a missing one", async () => {
    const { memberA, admin } = seed.users;
    expect(await getRiskByIdQuery(seed.risks.onlyB, seed.orgId, memberA)).toBeNull();
    expect(await getRiskByIdQuery(MISSING_ID, seed.orgId, memberA)).toBeNull();
    expect(Number((await getRiskByIdQuery(seed.risks.onlyA, seed.orgId, memberA))?.id)).toBe(
      seed.risks.onlyA,
    );
    expect(Number((await getRiskByIdQuery(seed.risks.onlyB, seed.orgId, admin))?.id)).toBe(
      seed.risks.onlyB,
    );
  });

  it("archiving a hidden risk matches nothing and changes nothing", async () => {
    const { memberA } = seed.users;
    const transaction = await sequelize.transaction();
    try {
      expect(
        await archiveRiskQuery(seed.risks.onlyB, seed.orgId, memberA.userId, transaction, {
          viewer: memberA,
        }),
      ).toBeNull();
      expect(
        await archiveRiskQuery(seed.risks.onlyA, seed.orgId, memberA.userId, transaction, {
          viewer: memberA,
        }),
      ).not.toBeNull();
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    expect((await riskRow(seed.risks.onlyB)).is_deleted).toBe(false);
    expect((await riskRow(seed.risks.onlyA)).is_deleted).toBe(true);
  });
});
