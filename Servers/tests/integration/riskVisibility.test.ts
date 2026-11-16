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
  createTestProjectFramework,
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
  updateRiskByIdQuery,
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
import { availableRiskTools } from "../../advisor/functions/riskFunctions";
import { availableSearchTools } from "../../advisor/functions/searchFunctions";
import { availablePolicyLinkedObjectTools } from "../../advisor/functions/policyLinkedObjectFunctions";
// Registers agent_delete_use_case with the executor map.
import "../../advisor/functions/useCaseFunctions";
import * as projectUtils from "../../utils/project.utils";
import { deleteProjectWithSideEffects } from "../../utils/projectDeletion.utils";

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3 } as const;
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

  it("a risk's projects name only the use cases a non-Admin can access", async () => {
    const { projectA, projectB } = seed;
    const projectsOf = (rows: any[] | null, id: number) =>
      sorted(((rows ?? []).find((row) => Number(row.id) === id)?.projects ?? []).map(Number));
    const r = seed.risks;

    // The rule still lets the shared risk through for a member of A, but it
    // names only A. An Admin and the system viewer get both.
    for (const viewer of [seed.users.memberA, seed.users.groupA]) {
      expect(projectsOf(await getAllRisksQuery(seed.orgId, "active", viewer), r.both)).toEqual([
        projectA,
      ]);
      expect(
        projectsOf(await getRisksByProjectQuery(projectA, seed.orgId, "active", viewer), r.both),
      ).toEqual([projectA]);
      expect(
        sorted(((await getRiskByIdQuery(r.both, seed.orgId, viewer)) as any).projects),
      ).toEqual([projectA]);
    }
    for (const viewer of [seed.users.admin, SYSTEM_RISK_VIEWER]) {
      expect(projectsOf(await getAllRisksQuery(seed.orgId, "active", viewer), r.both)).toEqual(
        sorted([projectA, projectB]),
      );
      expect(
        sorted(((await getRiskByIdQuery(r.both, seed.orgId, viewer)) as any).projects),
      ).toEqual(sorted([projectA, projectB]));
    }

    // The owner of a risk on a hidden use case sees the risk but not the use case.
    const { noAccess } = seed.users;
    expect(projectsOf(await getAllRisksQuery(seed.orgId, "active", noAccess), r.ownedOnB)).toEqual(
      [],
    );
    expect(
      projectsOf(
        await getRisksByProjectQuery(projectB, seed.orgId, "active", noAccess),
        r.ownedOnB,
      ),
    ).toEqual([]);

    // By framework: link onlyA to the framework too, then read as memberA.
    await sequelize.query(
      `INSERT INTO projects_risks (project_id, risk_id, organization_id) VALUES (:projectB, :id, :orgId)`,
      { replacements: { projectB, id: r.onlyA, orgId: seed.orgId } },
    );
    await sequelize.query(
      `INSERT INTO frameworks_risks (organization_id, risk_id, framework_id) VALUES (:orgId, :id, :fw)`,
      { replacements: { orgId: seed.orgId, id: r.onlyA, fw: FRAMEWORK_ID } },
    );
    expect(
      projectsOf(
        await getRisksByFrameworkQuery(FRAMEWORK_ID, seed.orgId, "active", seed.users.memberA),
        r.onlyA,
      ),
    ).toEqual([projectA]);
    expect(
      projectsOf(
        await getRisksByFrameworkQuery(FRAMEWORK_ID, seed.orgId, "active", seed.users.admin),
        r.onlyA,
      ),
    ).toEqual(sorted([projectA, projectB]));
  });

  it("GET routes return the narrowed projects, and saving them back keeps the hidden link (J3)", async () => {
    const api = await apiAs(seed.users.memberA);
    const r = seed.risks;
    const list = await api.get("/api/projectRisks");
    expect(list.status).toBe(200);
    const fromList = (list.body.data as any[]).find((row) => Number(row.id) === r.both);
    expect(fromList.projects.map(Number)).toEqual([seed.projectA]);

    const one = await api.get(`/api/projectRisks/${r.both}`);
    expect(one.status).toBe(200);
    expect(one.body.data.projects.map(Number)).toEqual([seed.projectA]);

    // The form sends back what it was given: the hidden link to B survives.
    const put = await api
      .put(`/api/projectRisks/${r.both}`)
      .send({ review_notes: "Round trip", projects: one.body.data.projects });
    expect(put.status).toBe(200);
    expect(await projectLinks(r.both)).toEqual(sorted([seed.projectA, seed.projectB]));

    // The same for an owner whose only link is hidden: the narrowed list is empty.
    const owner = await apiAs(seed.users.noAccess);
    const owned = await owner.get(`/api/projectRisks/${r.ownedOnB}`);
    expect(owned.body.data.projects).toEqual([]);
    expect(
      (
        await owner
          .put(`/api/projectRisks/${r.ownedOnB}`)
          .send({ review_notes: "Owner", projects: owned.body.data.projects })
      ).status,
    ).toBe(200);
    expect(await projectLinks(r.ownedOnB)).toEqual([seed.projectB]);
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
      // They own or approve these on B, but the picker lists a risk under its
      // use cases and B is hidden from them, so nothing is listed.
      expect(await candidates(seed.users.noAccess)).toEqual([]);

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

describe("round 2: pickers and the vendor exposure report", () => {
  let vendor: number;
  let vendorRisk: number;

  beforeEach(async () => {
    vendor = await createTestVendor(seed.orgId);
    await linkVendorToProject(seed.orgId, vendor, seed.projectA);
    await linkVendorToProject(seed.orgId, vendor, seed.projectB);
    vendorRisk = await createTestVendorRisk(seed.orgId, { vendor_id: vendor });
  });

  it("shared-project candidates name only the use cases the viewer can access", async () => {
    const titles = async (viewer: RiskViewer) =>
      (await getSharedProjectCandidatesQuery(seed.orgId, seed.risks.both, viewer)).map((c) =>
        [...c.projects].sort(),
      );
    expect(await titles(seed.users.admin)).toEqual([["Use case A", "Use case B"]]);
    expect(await titles(seed.users.memberA)).toEqual([["Use case A"]]);
  });

  it("a vendor reached only through a hidden use case is not a candidate", async () => {
    const onlyOnB = await createTestVendor(seed.orgId);
    await linkVendorToProject(seed.orgId, onlyOnB, seed.projectB);
    const hiddenVendorRisk = await createTestVendorRisk(seed.orgId, { vendor_id: onlyOnB });
    const candidateIds = async (viewer: RiskViewer) =>
      sorted(
        (await getSharedProjectCandidatesQuery(seed.orgId, seed.risks.both, viewer)).map((c) =>
          Number(c.id),
        ),
      );
    expect(await candidateIds(seed.users.admin)).toEqual(sorted([vendorRisk, hiddenVendorRisk]));
    expect(await candidateIds(seed.users.memberA)).toEqual([vendorRisk]);
  });

  it("the vendor risk link picker names only accessible use cases", async () => {
    const titlesOf = async (viewer: RiskViewer, riskId: number) =>
      (await getVendorRiskChildCandidatesQuery(seed.orgId, vendorRisk, viewer))
        .find((c) => Number(c.id) === riskId)
        ?.projects.sort();
    expect(await titlesOf(seed.users.admin, seed.risks.both)).toEqual(["Use case A", "Use case B"]);
    expect(await titlesOf(seed.users.memberA, seed.risks.both)).toEqual(["Use case A"]);
    // An owner sees their risk on B, but not B's title, so the row drops out.
    expect(await titlesOf(seed.users.noAccess, seed.risks.ownedOnB)).toBeUndefined();
    expect(await titlesOf(seed.users.admin, seed.risks.ownedOnB)).toEqual(["Use case B"]);
  });

  it("vendor exposure counts and names only what the viewer can see", async () => {
    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_vendor_risk_id, relation_type, status, source, reasons)
       VALUES (:orgId, :a, :vr, 'inherits_from', 'confirmed', 'user', '[]'::jsonb),
              (:orgId, :b, :vr, 'inherits_from', 'confirmed', 'user', '[]'::jsonb),
              (:orgId, :both, :vr, 'inherits_from', 'confirmed', 'user', '[]'::jsonb),
              (:orgId, :owned, :vr, 'inherits_from', 'suggested', 'derived', '[]'::jsonb)`,
      {
        replacements: {
          orgId: seed.orgId,
          a: seed.risks.onlyA,
          b: seed.risks.onlyB,
          both: seed.risks.both,
          owned: seed.risks.ownedOnB,
          vr: vendorRisk,
        },
      },
    );
    const report = async (viewer: UserRiskViewer) => {
      const res = await (await apiAs(viewer)).get("/api/riskLinks/vendor-exposure");
      expect(res.status).toBe(200);
      const risk = (res.body.data.risks as any[]).find((x) => x.vendor_risk_id === vendorRisk);
      const summary = (res.body.data.vendors as any[]).find((x) => x.vendor_id === vendor);
      return {
        children: risk.children,
        suggested: risk.suggested,
        useCases: risk.use_cases.map((u: { name: string }) => u.name),
        inheriting: summary.inheriting_risks,
        vendorUseCases: summary.use_cases.map((u: { name: string }) => u.name),
      };
    };

    expect(await report(seed.users.admin)).toEqual({
      children: 3,
      suggested: 1,
      useCases: ["Use case A", "Use case B"],
      inheriting: 3,
      vendorUseCases: ["Use case A", "Use case B"],
    });
    expect(await report(seed.users.memberA)).toEqual({
      children: 2,
      suggested: 0,
      useCases: ["Use case A"],
      inheriting: 2,
      vendorUseCases: ["Use case A"],
    });
    // The owner sees their suggested child, but not the use case it sits in.
    expect(await report(seed.users.noAccess)).toEqual({
      children: 0,
      suggested: 1,
      useCases: [],
      inheriting: 0,
      vendorUseCases: [],
    });
  });
});

describe("round 2: deleting a policy link by its row id", () => {
  it("a link to a hidden risk answers like a missing row and is kept", async () => {
    const created = await (await apiAs(seed.users.admin)).post("/api/policies").send({
      title: `Row delete policy ${Date.now()}`,
      content_html: "<p>Body</p>",
      tags: ["Privacy"],
      next_review_date: "2030-01-15",
    });
    expect(created.status).toBe(201);
    const policyId = created.body.data.id as number;
    const rows = await sequelize.query<{ id: number; object_id: number }>(
      `INSERT INTO policy_linked_objects (organization_id, policy_id, object_type, object_id)
       VALUES (:orgId, :policyId, 'risk', :a), (:orgId, :policyId, 'risk', :b)
       RETURNING id, object_id`,
      {
        replacements: { orgId: seed.orgId, policyId, a: seed.risks.onlyA, b: seed.risks.onlyB },
        type: QueryTypes.SELECT,
      },
    );
    const rowFor = (riskId: number) => Number(rows.find((r) => Number(r.object_id) === riskId)!.id);
    const exists = async (rowId: number) =>
      (
        await sequelize.query(`SELECT 1 FROM policy_linked_objects WHERE id = :rowId`, {
          replacements: { rowId },
          type: QueryTypes.SELECT,
        })
      ).length > 0;

    const api = await apiAs(seed.users.memberA);
    const hidden = await api.delete(
      `/api/policy-linked/${rowFor(seed.risks.onlyB)}/linked-objects`,
    );
    const missing = await api.delete(`/api/policy-linked/${MISSING_ID}/linked-objects`);
    expect(hidden.status).toBe(missing.status);
    expect(hidden.body).toEqual(missing.body);
    expect(await exists(rowFor(seed.risks.onlyB))).toBe(true);

    const visible = await api.delete(
      `/api/policy-linked/${rowFor(seed.risks.onlyA)}/linked-objects`,
    );
    expect(visible.status).toBe(200);
    expect(await exists(rowFor(seed.risks.onlyA))).toBe(false);

    const asAdmin = await (
      await apiAs(seed.users.admin)
    ).delete(`/api/policy-linked/${rowFor(seed.risks.onlyB)}/linked-objects`);
    expect(asAdmin.status).toBe(200);
    expect(await exists(rowFor(seed.risks.onlyB))).toBe(false);
  });
});

describe("round 2: updateRiskByIdQuery guards its own write", () => {
  const update = async (riskId: number, viewer: RiskViewer, data: Record<string, unknown>) => {
    const transaction = await sequelize.transaction();
    try {
      const result = await updateRiskByIdQuery(riskId, data as any, seed.orgId, transaction, {
        viewer,
        recordSnapshots: false,
        runAutomations: false,
      });
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };

  it("a hidden risk returns null and nothing is written, links included", async () => {
    const before = await riskRow(seed.risks.onlyB);
    expect(
      await update(seed.risks.onlyB, seed.users.memberA, {
        review_notes: "Should not land",
        projects: [seed.projectA],
      }),
    ).toBeNull();
    expect(await riskRow(seed.risks.onlyB)).toEqual(before);
    expect(await projectLinks(seed.risks.onlyB)).toEqual([seed.projectB]);
    expect(await update(MISSING_ID, seed.users.memberA, { review_notes: "x" })).toBeNull();
  });

  it("a hidden risk with an invalid owner still answers null, not a validation error", async () => {
    expect(
      await update(seed.risks.onlyB, seed.users.memberA, { risk_owner: MISSING_ID }),
    ).toBeNull();
  });

  it("a visible risk, and any risk for an Admin, is written", async () => {
    expect(
      await update(seed.risks.onlyA, seed.users.memberA, { review_notes: "Member" }),
    ).not.toBeNull();
    expect((await riskRow(seed.risks.onlyA)).review_notes).toBe("Member");
    expect(
      await update(seed.risks.onlyB, seed.users.admin, { review_notes: "Admin" }),
    ).not.toBeNull();
    expect((await riskRow(seed.risks.onlyB)).review_notes).toBe("Admin");
  });
});

describe("round 2: advisor reads and tools run as the chatting user", () => {
  const fetchIds = async (params: Record<string, unknown>) =>
    sorted(
      ((await availableRiskTools.fetch_risks(params, seed.orgId)) as { id: number }[]).map((r) =>
        Number(r.id),
      ),
    );

  it("fetch_risks returns what the list returns to that user", async () => {
    const visible = expectedVisible();
    for (const name of VIEWERS) {
      expect([name, await fetchIds({ _userId: seed.users[name].userId })]).toEqual([
        name,
        visible[name],
      ]);
    }
    // With no user it fails closed: only risks linked to no use case.
    expect(await fetchIds({})).toEqual(sorted([seed.risks.unlinked, seed.risks.frameworkOnly]));
    // By use case, J7 applies.
    expect(
      await fetchIds({ projectId: seed.projectB, _userId: seed.users.memberA.userId }),
    ).toEqual([]);
  });

  it("the executive summary never names a hidden risk", async () => {
    await sequelize.query(
      `UPDATE risks SET severity = 'Catastrophic', mitigation_status = 'Not Started'
        WHERE organization_id = :orgId`,
      { replacements: { orgId: seed.orgId } },
    );
    const summary = async (userId: number) =>
      (await availableRiskTools.get_executive_summary({ _userId: userId }, seed.orgId)) as any;
    const member = await summary(seed.users.memberA.userId);
    expect(member.totalActiveRisks).toBe(expectedVisible().memberA.length);
    const named = member.urgentRisks.map((u: { id: number }) => Number(u.id));
    for (const id of named) expect(expectedVisible().memberA).toContain(id);
    expect(named).not.toContain(seed.risks.onlyB);
    expect((await summary(seed.users.admin.userId)).totalActiveRisks).toBe(7);
  });

  it("risk analytics stays organization-wide: counts only (J4)", async () => {
    const analytics = (await availableRiskTools.get_risk_analytics(
      { _userId: seed.users.noAccess.userId },
      seed.orgId,
    )) as any;
    expect(analytics.totalRisks).toBe(7);
  });

  it("the search tools return only the risks the user can see", async () => {
    const found = async (tool: string, userId: number) => {
      const result = (await availableSearchTools[tool](
        { query: "Visprobe", entity_type: "project_risks", _userId: userId },
        seed.orgId,
      )) as any;
      const rows = tool === "global_search" ? result.results.project_risks.results : result.results;
      return sorted(rows.map((r: { id: number }) => Number(r.id)));
    };
    for (const tool of ["global_search", "search_within_entity"]) {
      expect(await found(tool, seed.users.memberA.userId)).toEqual(expectedVisible().memberA);
      expect(await found(tool, seed.users.admin.userId)).toEqual(expectedVisible().admin);
    }
  });

  it("agent_update_risk answers a hidden risk like a missing one and writes nothing", async () => {
    const execute = writeToolExecutors.get("agent_update_risk")!;
    const before = await riskRow(seed.risks.onlyB);
    const hidden = await execute(
      {
        risk_id: seed.risks.onlyB,
        review_notes: "x",
        risk_name: "Hidden",
        _userId: seed.users.memberA.userId,
      },
      seed.orgId,
    ).catch((e: Error) => e);
    const missing = await execute(
      { risk_id: MISSING_ID, risk_name: "Missing", _userId: seed.users.memberA.userId },
      seed.orgId,
    ).catch((e: Error) => e);
    expect((hidden as Error).message).toBe("Risk not found");
    expect((missing as Error).message).toBe("Risk not found");
    expect(await riskRow(seed.risks.onlyB)).toEqual(before);

    await execute(
      { risk_id: seed.risks.onlyA, risk_name: "Renamed", _userId: seed.users.memberA.userId },
      seed.orgId,
    );
    const [row] = await sequelize.query<{ risk_name: string }>(
      `SELECT risk_name FROM risks WHERE id = :id`,
      { replacements: { id: seed.risks.onlyA }, type: QueryTypes.SELECT },
    );
    expect(row.risk_name).toBe("Renamed");
  });

  it("agent_unlink_object_from_policy leaves a hidden risk's link alone", async () => {
    const created = await (await apiAs(seed.users.admin)).post("/api/policies").send({
      title: `Advisor unlink policy ${Date.now()}`,
      content_html: "<p>Body</p>",
      tags: ["Privacy"],
      next_review_date: "2030-01-15",
    });
    const policyId = created.body.data.id as number;
    await sequelize.query(
      `INSERT INTO policy_linked_objects (organization_id, policy_id, object_type, object_id)
       VALUES (:orgId, :policyId, 'risk', :a), (:orgId, :policyId, 'risk', :b)`,
      { replacements: { orgId: seed.orgId, policyId, a: seed.risks.onlyA, b: seed.risks.onlyB } },
    );
    const linked = async () =>
      sorted(
        (
          await sequelize.query<{ object_id: number }>(
            `SELECT object_id FROM policy_linked_objects WHERE policy_id = :policyId`,
            { replacements: { policyId }, type: QueryTypes.SELECT },
          )
        ).map((r) => Number(r.object_id)),
      );
    const execute = writeToolExecutors.get("agent_unlink_object_from_policy")!;
    const unlink = (riskId: number, userId: number) =>
      execute(
        { policy_id: policyId, object_type: "risk", object_id: riskId, _userId: userId },
        seed.orgId,
      );

    const hidden = await unlink(seed.risks.onlyB, seed.users.memberA.userId);
    const missing = await unlink(MISSING_ID, seed.users.memberA.userId);
    expect(hidden).toEqual({ ...(missing as object), object_id: seed.risks.onlyB });
    expect(await linked()).toEqual(sorted([seed.risks.onlyA, seed.risks.onlyB]));

    await unlink(seed.risks.onlyA, seed.users.memberA.userId);
    expect(await linked()).toEqual([seed.risks.onlyB]);
    await unlink(seed.risks.onlyB, seed.users.admin.userId);
    expect(await linked()).toEqual([]);
  });
});

describe("round 3: mappings name their own use case", () => {
  // Struct rows live outside the organization and are not truncated between
  // tests, so this block adds its own and removes them afterwards.
  const struct = { clause: 0, subclause: 0, category: 0, control: 0, topic: 0 };
  const insertId = async (sql: string, replacements: Record<string, unknown> = {}) =>
    Number(
      (
        await sequelize.query<{ id: number }>(`${sql} RETURNING id`, {
          replacements,
          type: QueryTypes.SELECT,
        })
      )[0].id,
    );

  beforeAll(async () => {
    await seedFrameworks();
    struct.clause = await insertId(
      `INSERT INTO clauses_struct_iso (framework_id, clause_id, title, clause_no)
       VALUES (2, 'R3', 'Round 3 clause', 99)`,
    );
    struct.subclause = await insertId(
      `INSERT INTO subclauses_struct_iso (clause_id, subclause_id, title, order_no)
       VALUES (:clause, 'R3.1', 'Round 3 subclause', 1)`,
      { clause: struct.clause },
    );
    struct.category = await insertId(
      `INSERT INTO controlcategories_struct_eu (framework_id, title) VALUES (1, 'Round 3 category')`,
    );
    struct.control = await insertId(
      `INSERT INTO controls_struct_eu (control_category_id, title) VALUES (:category, 'Round 3 control')`,
      { category: struct.category },
    );
    struct.topic = await insertId(
      `INSERT INTO topics_struct_eu (framework_id, title) VALUES (1, 'Round 3 topic')`,
    );
  });

  afterAll(async () => {
    // Cascades to the subclause, control, subtopic and question structs.
    await sequelize.query(`DELETE FROM clauses_struct_iso WHERE id = :id`, {
      replacements: { id: struct.clause },
    });
    await sequelize.query(`DELETE FROM controlcategories_struct_eu WHERE id = :id`, {
      replacements: { id: struct.category },
    });
    await sequelize.query(`DELETE FROM topics_struct_eu WHERE id = :id`, {
      replacements: { id: struct.topic },
    });
  });

  /**
   * Use cases A (visible to memberA) and B (hidden from memberA) both run ISO
   * 42001 and the EU AI Act. The risk shared by A and B is mapped to A's ISO
   * subclause, and to B's subclause, control and assessment answer.
   */
  async function seedMappings() {
    const orgId = seed.orgId;
    const pf = {
      isoA: await createTestProjectFramework(orgId, seed.projectA, 2),
      isoB: await createTestProjectFramework(orgId, seed.projectB, 2),
      euA: await createTestProjectFramework(orgId, seed.projectA, 1),
      euB: await createTestProjectFramework(orgId, seed.projectB, 1),
    };
    const subclause = async (projectFrameworkId: number) =>
      insertId(
        `INSERT INTO subclauses_iso (organization_id, subclause_meta_id, projects_frameworks_id)
         VALUES (:orgId, :meta, :projectFrameworkId)`,
        { orgId, meta: struct.subclause, projectFrameworkId },
      );
    const subclauseA = await subclause(pf.isoA);
    const subclauseB = await subclause(pf.isoB);
    const controlB = await insertId(
      `INSERT INTO controls_eu (organization_id, control_meta_id, projects_frameworks_id)
       VALUES (:orgId, :meta, :projectFrameworkId)`,
      { orgId, meta: struct.control, projectFrameworkId: pf.euB },
    );
    const subtopic = await insertId(
      `INSERT INTO subtopics_struct_eu (topic_id, title) VALUES (:topic, 'Round 3 subtopic')`,
      { topic: struct.topic },
    );
    const question = await insertId(
      `INSERT INTO questions_struct_eu (subtopic_id, question) VALUES (:subtopic, 'Round 3 question')`,
      { subtopic },
    );
    const assessmentB = await insertId(
      `INSERT INTO assessments (organization_id, projects_frameworks_id)
       VALUES (:orgId, :projectFrameworkId)`,
      { orgId, projectFrameworkId: pf.euB },
    );
    const answerB = await insertId(
      `INSERT INTO answers_eu (organization_id, assessment_id, question_id)
       VALUES (:orgId, :assessment, :question)`,
      { orgId, assessment: assessmentB, question },
    );
    const riskId = seed.risks.both;
    await sequelize.query(
      `INSERT INTO subclauses_iso__risks (organization_id, subclause_id, projects_risks_id)
       VALUES (:orgId, :subclauseA, :riskId), (:orgId, :subclauseB, :riskId),
              (:orgId, :subclauseB, :ownedOnB);
       INSERT INTO controls_eu__risks (organization_id, control_id, projects_risks_id)
       VALUES (:orgId, :controlB, :riskId);
       INSERT INTO answers_eu__risks (organization_id, answer_id, projects_risks_id)
       VALUES (:orgId, :answerB, :riskId);`,
      {
        replacements: {
          orgId,
          subclauseA,
          subclauseB,
          controlB,
          answerB,
          riskId,
          ownedOnB: seed.risks.ownedOnB,
        },
      },
    );
    return { subclauseA, subclauseB, controlB, answerB };
  }

  const mappings = (rows: { id: number; project_id: number }[]) =>
    rows.map((r) => `${Number(r.id)}@${Number(r.project_id)}`).sort();

  it("a non-Admin gets none of the hidden use case's mappings", async () => {
    const { subclauseA } = await seedMappings();
    const risk = (await getRiskByIdQuery(seed.risks.both, seed.orgId, seed.users.memberA)) as any;
    // A's subclause once, labelled with A; nothing of B, under either label.
    expect(mappings(risk.subClauses)).toEqual([`${subclauseA}@${seed.projectA}`]);
    expect(risk.controls).toEqual([]);
    expect(risk.assessments).toEqual([]);
    // The owner of a risk on a use case hidden from them sees the risk (J1)
    // but none of that use case's mappings.
    const owned = (await getRiskByIdQuery(
      seed.risks.ownedOnB,
      seed.orgId,
      seed.users.noAccess,
    )) as any;
    expect(owned).not.toBeNull();
    expect(owned.subClauses).toEqual([]);
    const ownedAsAdmin = (await getRiskByIdQuery(
      seed.risks.ownedOnB,
      seed.orgId,
      seed.users.admin,
    )) as any;
    expect(ownedAsAdmin.subClauses.length).toBe(2);
  });

  it("an Admin and the system viewer keep the existing output", async () => {
    const { subclauseA, subclauseB, controlB, answerB } = await seedMappings();
    const A = seed.projectA;
    const B = seed.projectB;
    for (const viewer of [seed.users.admin, SYSTEM_RISK_VIEWER] as RiskViewer[]) {
      const risk = (await getRiskByIdQuery(seed.risks.both, seed.orgId, viewer)) as any;
      // The join on the framework alone repeats each mapping once per use
      // case running that framework, as before.
      expect(mappings(risk.subClauses)).toEqual(
        [
          `${subclauseA}@${A}`,
          `${subclauseA}@${B}`,
          `${subclauseB}@${A}`,
          `${subclauseB}@${B}`,
        ].sort(),
      );
      expect(mappings(risk.controls)).toEqual([`${controlB}@${A}`, `${controlB}@${B}`].sort());
      expect(mappings(risk.assessments)).toEqual([`${answerB}@${A}`, `${answerB}@${B}`].sort());
    }
  });

  it("an owner who can see the use case gets its mappings under it", async () => {
    const { subclauseA, subclauseB, controlB, answerB } = await seedMappings();
    // memberA joins B: every mapping now shows once, under its own use case.
    await sequelize.query(
      `INSERT INTO projects_members (organization_id, project_id, user_id)
       VALUES (:orgId, :projectB, :userId)`,
      {
        replacements: {
          orgId: seed.orgId,
          projectB: seed.projectB,
          userId: seed.users.memberA.userId,
        },
      },
    );
    const risk = (await getRiskByIdQuery(seed.risks.both, seed.orgId, seed.users.memberA)) as any;
    expect(mappings(risk.subClauses)).toEqual(
      [`${subclauseA}@${seed.projectA}`, `${subclauseB}@${seed.projectB}`].sort(),
    );
    expect(mappings(risk.controls)).toEqual([`${controlB}@${seed.projectB}`]);
    expect(mappings(risk.assessments)).toEqual([`${answerB}@${seed.projectB}`]);
  });
});

describe("round 3: advisor analytics and policy links", () => {
  it("risk analytics for one use case follows the by use case rule (J7)", async () => {
    const total = async (params: Record<string, unknown>) =>
      (
        (await availableRiskTools.get_risk_analytics(
          { projectId: seed.projectB, ...params },
          seed.orgId,
        )) as any
      ).totalRisks;
    expect(await total({ _userId: seed.users.admin.userId })).toBe(4);
    expect(await total({ _userId: seed.users.memberA.userId })).toBe(0);
    // Only the two they own or approve there.
    expect(await total({ _userId: seed.users.noAccess.userId })).toBe(2);
    // No user: fails closed.
    expect(await total({})).toBe(0);
  });

  it("get_policy_linked_objects leaves out links to hidden risks, count included", async () => {
    const created = await (await apiAs(seed.users.admin)).post("/api/policies").send({
      title: `Advisor read policy ${Date.now()}`,
      content_html: "<p>Body</p>",
      tags: ["Privacy"],
      next_review_date: "2030-01-15",
    });
    const policyId = created.body.data.id as number;
    await sequelize.query(
      `INSERT INTO policy_linked_objects (organization_id, policy_id, object_type, object_id)
       VALUES (:orgId, :policyId, 'risk', :a), (:orgId, :policyId, 'risk', :b)`,
      { replacements: { orgId: seed.orgId, policyId, a: seed.risks.onlyA, b: seed.risks.onlyB } },
    );
    const read = async (userId?: number) =>
      (await availablePolicyLinkedObjectTools.get_policy_linked_objects(
        { policy_id: policyId, ...(userId ? { _userId: userId } : {}) },
        seed.orgId,
      )) as { total_count: number; linked_objects: Record<string, { object_id: number }[]> };
    const riskIds = (result: Awaited<ReturnType<typeof read>>) =>
      sorted((result.linked_objects.risk ?? []).map((o) => Number(o.object_id)));

    const member = await read(seed.users.memberA.userId);
    expect(riskIds(member)).toEqual([seed.risks.onlyA]);
    expect(member.total_count).toBe(1);
    const admin = await read(seed.users.admin.userId);
    expect(riskIds(admin)).toEqual(sorted([seed.risks.onlyA, seed.risks.onlyB]));
    expect(admin.total_count).toBe(2);
    expect((await read()).total_count).toBe(0);
  });
});

describe("use case delete: risks linked only to the use case", () => {
  const path = (projectId: number) => `/api/v1/projects/${projectId}/risks-linked-only-here`;

  it("lists the active risks linked to this use case and no other", async () => {
    const archived = await risk(seed.orgId, "archived on A", [seed.projectA]);
    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :id`, {
      replacements: { id: archived },
    });

    const res = await (await apiAs(seed.users.memberA)).get(path(seed.projectA));
    expect(res.status).toBe(200);
    // Not "both" (still linked to B), not "unlinked" (never on A), not the archived one.
    expect(res.body.data).toEqual({
      count: 1,
      risks: [{ id: seed.risks.onlyA, risk_name: "Visprobe only A" }],
    });

    const onB = await (await apiAs(seed.users.admin)).get(path(seed.projectB));
    expect(ids(onB.body.data.risks)).toEqual(
      sorted([seed.risks.onlyB, seed.risks.ownedOnB, seed.risks.approvedOnB]),
    );
  });

  it("is refused to a caller who could not delete the use case", async () => {
    const res = await (await apiAs(seed.users.noAccess)).get(path(seed.projectA));
    expect(res.status).toBe(403);
  });

  it("answers 404 for a use case in another organization", async () => {
    const otherOrg = await createTestOrganization();
    const otherOwner = await user(otherOrg, "Admin");
    const otherProject = await createTestProject(otherOrg, otherOwner.userId, {
      project_title: "Other org use case",
    });
    await risk(otherOrg, "other org only", [otherProject]);

    const res = await (await apiAs(seed.users.admin)).get(path(otherProject));
    expect(res.status).toBe(404);
  });

  it("the frozen legacy delete keeps the risks active, so one left unlinked shows to everyone", async () => {
    const member = await apiAs(seed.users.memberA);
    const res = await member.delete(`/api/projects/${seed.projectA}`);
    expect(res.status).toBe(202);
    // The legacy body is unchanged: `true`, no archived ids.
    expect(res.body.data).toBe(true);
    expect((await riskRow(seed.risks.onlyA)).is_deleted).toBe(false);
    expect(ids(await getAllRisksQuery(seed.orgId, "active", seed.users.noAccess))).toContain(
      seed.risks.onlyA,
    );
  });
});

describe("archived risks linked to no use case are private", () => {
  async function archive(id: number) {
    await sequelize.query(`UPDATE risks SET is_deleted = true, deleted_at = NOW() WHERE id = :id`, {
      replacements: { id },
    });
  }
  async function setPeople(id: number, owner: number | null, approver: number | null) {
    await sequelize.query(
      `UPDATE risks SET risk_owner = :owner, risk_approval = :approver WHERE id = :id`,
      { replacements: { id, owner, approver } },
    );
  }
  const listed = async (viewer: RiskViewer, filter: "deleted" | "all") =>
    ids(await getAllRisksQuery(seed.orgId, filter, viewer));

  it("the archived and all lists hide an archived unlinked risk from a member", async () => {
    await archive(seed.risks.unlinked);
    for (const filter of ["deleted", "all"] as const) {
      expect(await listed(seed.users.memberA, filter)).not.toContain(seed.risks.unlinked);
      expect(await listed(seed.users.noAccess, filter)).not.toContain(seed.risks.unlinked);
      expect(await listed(seed.users.admin, filter)).toContain(seed.risks.unlinked);
      expect(await listed(SYSTEM_RISK_VIEWER, filter)).toContain(seed.risks.unlinked);
    }
    // The same through the route.
    const res = await (await apiAs(seed.users.memberA)).get("/api/projectRisks?filter=deleted");
    expect(res.status).toBe(200);
    expect(ids(res.body.data)).not.toContain(seed.risks.unlinked);
    // A framework link alone is still no use case link.
    await archive(seed.risks.frameworkOnly);
    expect(await listed(seed.users.memberA, "deleted")).not.toContain(seed.risks.frameworkOnly);
  });

  it("its owner and its approver still see it", async () => {
    await archive(seed.risks.unlinked);
    await setPeople(seed.risks.unlinked, seed.users.memberA.userId, seed.users.noAccess.userId);
    expect(await listed(seed.users.memberA, "deleted")).toContain(seed.risks.unlinked);
    expect(await listed(seed.users.noAccess, "all")).toContain(seed.risks.unlinked);
    expect(await listed(seed.users.groupA, "deleted")).not.toContain(seed.risks.unlinked);
  });

  it("an archived linked risk follows its links like an active one", async () => {
    await archive(seed.risks.onlyA);
    expect(await listed(seed.users.memberA, "deleted")).toContain(seed.risks.onlyA);
    expect(await listed(seed.users.groupA, "deleted")).toContain(seed.risks.onlyA);
    expect(await listed(seed.users.noAccess, "deleted")).not.toContain(seed.risks.onlyA);
  });

  it("reads like a missing risk to a member, including a by-id read that includes archived risks", async () => {
    await archive(seed.risks.unlinked);
    expect(await isRiskVisibleQuery(seed.risks.unlinked, seed.orgId, seed.users.memberA)).toBe(
      false,
    );
    expect(
      await getRiskByIdQuery(seed.risks.unlinked, seed.orgId, seed.users.memberA, true),
    ).toBeNull();
    expect(
      await getRiskByIdQuery(seed.risks.unlinked, seed.orgId, seed.users.admin, true),
    ).not.toBeNull();
    // Any write a member tries answers like a missing risk, as for every archived one.
    const res = await (
      await apiAs(seed.users.memberA)
    )
      .put(`/api/projectRisks/${seed.risks.unlinked}`)
      .send({ is_deleted: false, risk_name: "Restored" });
    expect(res.status).toBe(404);
    expect((await riskRow(seed.risks.unlinked)).is_deleted).toBe(true);
  });

  it("restoring it (is_deleted back to false) makes it visible to everyone again", async () => {
    await archive(seed.risks.unlinked);
    expect(ids(await getAllRisksQuery(seed.orgId, "all", seed.users.noAccess))).not.toContain(
      seed.risks.unlinked,
    );
    await sequelize.query(`UPDATE risks SET is_deleted = false, deleted_at = NULL WHERE id = :id`, {
      replacements: { id: seed.risks.unlinked },
    });
    expect(ids(await getAllRisksQuery(seed.orgId, "active", seed.users.noAccess))).toContain(
      seed.risks.unlinked,
    );
  });
});

describe("DELETE /api/v1/projects/:id", () => {
  const path = (projectId: number, archive: boolean) =>
    `/api/v1/projects/${projectId}?archive_risks_linked_only_here=${archive}`;

  async function projectExists(id: number): Promise<boolean> {
    const rows = await sequelize.query(`SELECT id FROM projects WHERE id = :id`, {
      replacements: { id },
      type: QueryTypes.SELECT,
    });
    return rows.length > 0;
  }
  async function deletionHistory(riskId: number): Promise<number> {
    const rows = await sequelize.query(
      `SELECT id FROM project_risk_change_history
        WHERE project_risk_id = :riskId AND action = 'deleted'`,
      { replacements: { riskId }, type: QueryTypes.SELECT },
    );
    return rows.length;
  }

  it("archives exactly the risks linked only here, then hides them once unlinked", async () => {
    const archivedBefore = await risk(seed.orgId, "already archived on A", [seed.projectA]);
    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :id`, {
      replacements: { id: archivedBefore },
    });

    const res = await (await apiAs(seed.users.memberA)).delete(path(seed.projectA, true));

    expect(res.status).toBe(202);
    // Not "both" (also on B), not the one already archived.
    expect(res.body.data).toEqual({ deleted: true, archived_risk_ids: [seed.risks.onlyA] });
    expect(await projectExists(seed.projectA)).toBe(false);
    expect((await riskRow(seed.risks.onlyA)).is_deleted).toBe(true);
    expect(await deletionHistory(seed.risks.onlyA)).toBe(1);
    expect((await riskRow(seed.risks.both)).is_deleted).toBe(false);
    expect(await projectLinks(seed.risks.both)).toEqual([seed.projectB]);
    expect(await projectLinks(seed.risks.onlyA)).toEqual([]);

    // Archived and linked to nothing: private to Admins, owner and approver.
    for (const name of ["memberA", "groupA", "noAccess"] as const) {
      for (const filter of ["active", "deleted", "all"] as const) {
        expect(ids(await getAllRisksQuery(seed.orgId, filter, seed.users[name]))).not.toContain(
          seed.risks.onlyA,
        );
      }
    }
    expect(ids(await getAllRisksQuery(seed.orgId, "deleted", seed.users.admin))).toContain(
      seed.risks.onlyA,
    );
  });

  it("keep leaves them active, unlinked and visible to everyone", async () => {
    const res = await (await apiAs(seed.users.memberA)).delete(path(seed.projectA, false));

    expect(res.status).toBe(202);
    expect(res.body.data).toEqual({ deleted: true, archived_risk_ids: [] });
    expect((await riskRow(seed.risks.onlyA)).is_deleted).toBe(false);
    expect(ids(await getAllRisksQuery(seed.orgId, "active", seed.users.noAccess))).toContain(
      seed.risks.onlyA,
    );
  });

  it("a failure rolls back the archive and the delete together", async () => {
    const spy = jest
      .spyOn(projectUtils, "deleteProjectByIdQuery")
      .mockRejectedValue(new Error("forced failure"));
    try {
      const res = await (await apiAs(seed.users.memberA)).delete(path(seed.projectA, true));
      expect(res.status).toBe(500);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }

    expect(await projectExists(seed.projectA)).toBe(true);
    expect((await riskRow(seed.risks.onlyA)).is_deleted).toBe(false);
    expect(await deletionHistory(seed.risks.onlyA)).toBe(0);
    expect(await projectLinks(seed.risks.onlyA)).toEqual([seed.projectA]);
  });

  it("is refused to a caller without write access to the use case", async () => {
    const res = await (await apiAs(seed.users.noAccess)).delete(path(seed.projectA, true));
    expect(res.status).toBe(403);
    expect(await projectExists(seed.projectA)).toBe(true);
  });

  it("requires the archive choice", async () => {
    const res = await (await apiAs(seed.users.admin)).delete(`/api/v1/projects/${seed.projectA}`);
    expect(res.status).toBe(400);
    expect(await projectExists(seed.projectA)).toBe(true);
  });
});

describe("advisor agent_delete_use_case", () => {
  it("archives the risks linked only to the use case by default", async () => {
    const execute = writeToolExecutors.get("agent_delete_use_case")!;
    const result = (await execute(
      { use_case_id: seed.projectA, _userId: seed.users.admin.userId },
      seed.orgId,
    )) as any;

    expect(result.success).toBe(true);
    expect(result.archived_risk_ids).toEqual([seed.risks.onlyA]);
    expect(result.message).toContain("archived");
    expect((await riskRow(seed.risks.onlyA)).is_deleted).toBe(true);
    expect((await riskRow(seed.risks.both)).is_deleted).toBe(false);
    expect(ids(await getAllRisksQuery(seed.orgId, "all", seed.users.noAccess))).not.toContain(
      seed.risks.onlyA,
    );
  });

  it("refuses the delete and changes nothing for a requester who cannot archive risks", async () => {
    // Reviewers do not hold risks.edit.
    const reviewer = await user(seed.orgId, "Reviewer");
    const execute = writeToolExecutors.get("agent_delete_use_case")!;
    const result = (await execute(
      {
        use_case_id: seed.projectA,
        _userId: seed.users.admin.userId,
        _requesterId: reviewer.userId,
      },
      seed.orgId,
    )) as any;

    expect(result.success).toBe(false);
    expect(result.message).toContain("does not allow archiving risks");
    const [project] = await sequelize.query(`SELECT id FROM projects WHERE id = :id`, {
      replacements: { id: seed.projectA },
      type: QueryTypes.SELECT,
    });
    expect(project).toBeDefined();
    expect((await riskRow(seed.risks.onlyA)).is_deleted).toBe(false);
    expect(await projectLinks(seed.risks.onlyA)).toEqual([seed.projectA]);
  });

  it("records the deletion in the use case history, as the shared delete does", async () => {
    const execute = writeToolExecutors.get("agent_delete_use_case")!;
    await execute({ use_case_id: seed.projectA, _userId: seed.users.admin.userId }, seed.orgId);

    const rows = await sequelize.query(
      `SELECT id FROM use_case_change_history
        WHERE use_case_id = :id AND action = 'deleted' AND changed_by_user_id = :userId`,
      {
        replacements: { id: seed.projectA, userId: seed.users.admin.userId },
        type: QueryTypes.SELECT,
      },
    );
    expect(rows).toHaveLength(1);
  });
});

describe("use case delete against a concurrent unlink", () => {
  /** Waits until some session in this database is waiting for a lock. */
  async function untilALockWaits(timeoutMs = 5000): Promise<boolean> {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const [row] = await sequelize.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`,
        { type: QueryTypes.SELECT },
      );
      if (row.n > 0) return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  }

  it("waits for an uncommitted unlink, then archives the risk it left linked only here", async () => {
    // "both" is linked to A and B. Another transaction removes its B link and
    // has not committed when the delete of A reads the risks linked only here.
    const unlink = await sequelize.transaction();
    await sequelize.query(
      `DELETE FROM projects_risks WHERE risk_id = :riskId AND project_id = :projectId`,
      {
        replacements: { riskId: seed.risks.both, projectId: seed.projectB },
        transaction: unlink,
      },
    );

    const deleteTx = await sequelize.transaction();
    const deleting = deleteProjectWithSideEffects(seed.projectA, seed.orgId, deleteTx, {
      userId: seed.users.admin.userId,
      archiveRisksLinkedOnlyHere: true,
    });
    let waited = false;
    try {
      // The delete must block on the B link's row lock rather than read past it.
      waited = await untilALockWaits();
    } finally {
      await unlink.commit();
    }
    let result: Awaited<typeof deleting>;
    try {
      result = await deleting;
      await deleteTx.commit();
    } catch (error) {
      await deleteTx.rollback();
      throw error;
    }

    expect(waited).toBe(true);
    expect(sorted(result.archivedRiskIds)).toEqual(sorted([seed.risks.onlyA, seed.risks.both]));
    expect((await riskRow(seed.risks.both)).is_deleted).toBe(true);
    expect(await projectLinks(seed.risks.both)).toEqual([]);
    // Archived and unlinked: hidden from a member.
    expect(ids(await getAllRisksQuery(seed.orgId, "all", seed.users.noAccess))).not.toContain(
      seed.risks.both,
    );
  });
});
