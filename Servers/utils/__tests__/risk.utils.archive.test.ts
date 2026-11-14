jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../history/riskHistory.utils", () => ({
  recordSnapshotIfChanged: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../customField.utils", () => ({ fetchCustomFieldsForEntities: jest.fn() }));
jest.mock("../user.utils", () => ({
  findUsersNotInOrganization: jest.fn().mockResolvedValue([]),
  parseReferencedIds: jest.fn().mockReturnValue([]),
}));
jest.mock("../projectRiskChangeHistory.utils", () => ({
  recordProjectRiskDeletion: jest.fn().mockResolvedValue(undefined),
}));

import { sequelize } from "../../database/db";
import { recordSnapshotIfChanged } from "../history/riskHistory.utils";
import { recordProjectRiskDeletion } from "../projectRiskChangeHistory.utils";
import {
  archiveRiskQuery,
  deleteRiskMappingsForProjectFrameworksQuery,
  deleteRiskMappingsForProjectsQuery,
  updateRiskByIdQuery,
} from "../risk.utils";
import { FRAMEWORK_STRUCTURES } from "../../structures";

const mockQuery = sequelize.query as jest.Mock;
const mockSnapshot = recordSnapshotIfChanged as jest.Mock;
const mockRecordDeletion = recordProjectRiskDeletion as jest.Mock;
const TX = { id: "tx" } as never;

const sqlCalls = () => mockQuery.mock.calls.map(([sql]) => String(sql));
const deletesFrom = (table: string) =>
  mockQuery.mock.calls.filter(([sql]) => new RegExp(`DELETE FROM ${table}\\b`).test(String(sql)));

beforeEach(() => {
  mockQuery.mockReset();
  mockSnapshot.mockClear();
  mockRecordDeletion.mockClear();
});

describe("archiveRiskQuery", () => {
  /** The soft-delete UPDATE matches `archived`; everything else returns nothing. */
  function arrange(archived: boolean) {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("UPDATE risks SET is_deleted = true")) {
        return [archived ? [{ id: 5, risk_owner: 2, risk_approval: 3 }] : [], 0];
      }
      return [[], 0];
    });
  }

  it("soft-deletes, records the deletion, unlinks policies and records snapshots", async () => {
    arrange(true);

    await expect(archiveRiskQuery(5, 4, 9, TX)).resolves.toBe(true);

    expect(mockRecordDeletion).toHaveBeenCalledWith(5, 9, 4, TX);
    const unlink = deletesFrom("policy_linked_objects");
    expect(unlink).toHaveLength(1);
    expect(unlink[0][0]).toContain("organization_id = :organizationId");
    expect(unlink[0][0]).toContain("object_type = 'risk'");
    expect(unlink[0][0]).toContain("object_id = :id");
    expect(unlink[0][1]).toEqual({ replacements: { organizationId: 4, id: 5 }, transaction: TX });
    expect(mockSnapshot.mock.calls.map((c) => c[0]).sort()).toEqual([
      "likelihood",
      "mitigation_status",
      "risk_level",
      "severity",
    ]);
  });

  it("skips the snapshots when asked, for a bulk archive", async () => {
    arrange(true);

    await archiveRiskQuery(5, 4, 9, TX, { recordSnapshots: false });

    expect(mockSnapshot).not.toHaveBeenCalled();
    expect(deletesFrom("policy_linked_objects")).toHaveLength(1);
  });

  it("does nothing else when no active risk matched", async () => {
    arrange(false);

    await expect(archiveRiskQuery(5, 4, 9, TX)).resolves.toBe(false);

    expect(mockRecordDeletion).not.toHaveBeenCalled();
    expect(deletesFrom("policy_linked_objects")).toHaveLength(0);
    expect(mockSnapshot).not.toHaveBeenCalled();
  });

  it("records no change history without a user", async () => {
    arrange(true);

    await archiveRiskQuery(5, 4, undefined, TX);

    expect(mockRecordDeletion).not.toHaveBeenCalled();
    expect(deletesFrom("policy_linked_objects")).toHaveLength(1);
  });
});

describe("deleteRiskMappingsForProjectFrameworksQuery", () => {
  const soc2 = FRAMEWORK_STRUCTURES.find((fw) => fw.key === "soc2")!;
  const threeLevel = FRAMEWORK_STRUCTURES.find((fw) => fw.tables.l3_risks && fw.tables.l3_impl)!;

  function arrangeFrameworks(frameworkIds: number[]) {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT DISTINCT framework_id FROM projects_frameworks")) {
        return frameworkIds.map((framework_id) => ({ framework_id }));
      }
      return [[], 0];
    });
  }

  /** Every DELETE is scoped to the organization, the risk and the pf ids. */
  function expectScoped(call: unknown[]) {
    const [sql, options] = call as [string, any];
    expect(sql).toContain("organization_id = :organizationId");
    expect(sql).toContain("projects_risks_id = :riskId");
    expect(sql).toContain("IN (:pfIds)");
    expect(options).toEqual({
      replacements: { riskId: 7, pfIds: [11, 12], organizationId: 4 },
      transaction: TX,
    });
  }

  it("does nothing for an empty pf list", async () => {
    await deleteRiskMappingsForProjectFrameworksQuery(7, [], 4, TX);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("deletes the four built-in frameworks' mappings", async () => {
    arrangeFrameworks([1, 2, 3, 4]);

    await deleteRiskMappingsForProjectFrameworksQuery(7, [11, 12], 4, TX);

    const lookup = mockQuery.mock.calls[0];
    expect(lookup[0]).toContain("organization_id = :organizationId");
    expect(lookup[1]).toEqual(
      expect.objectContaining({ replacements: { pfIds: [11, 12], organizationId: 4 } }),
    );

    for (const table of [
      "answers_eu__risks",
      "controls_eu__risks",
      "subcontrols_eu__risks",
      "subclauses_iso__risks",
      "annexcategories_iso__risks",
      "subclauses_iso27001__risks",
      "annexcontrols_iso27001__risks",
      "nist_ai_rmf_subcategories__risks",
    ]) {
      const calls = deletesFrom(table);
      expect(calls).toHaveLength(1);
      expectScoped(calls[0]);
    }
  });

  it("deletes a bundled framework's mappings from the registry tables", async () => {
    arrangeFrameworks([soc2.id, threeLevel.id]);

    await deleteRiskMappingsForProjectFrameworksQuery(7, [11, 12], 4, TX);

    const l2 = deletesFrom(soc2.tables.l2_risks);
    expect(l2).toHaveLength(1);
    expectScoped(l2[0]);
    expect(l2[0][0]).toContain(
      `${soc2.cols.l2_risks_impl} IN (SELECT id FROM ${soc2.tables.l2_impl}`,
    );

    const l3 = deletesFrom(threeLevel.tables.l3_risks!);
    expect(l3).toHaveLength(1);
    expectScoped(l3[0]);
    expect(l3[0][0]).toContain(`SELECT id FROM ${threeLevel.tables.l3_impl}`);
    expect(deletesFrom(threeLevel.tables.l2_risks)).toHaveLength(1);

    // Only the frameworks the pfs belong to are touched.
    expect(deletesFrom("answers_eu__risks")).toHaveLength(0);
  });
});

describe("deleteRiskMappingsForProjectsQuery", () => {
  it("clears framework, custom framework and imported framework mappings for the projects", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT id FROM projects_frameworks")) return [{ id: 11 }];
      if (sql.includes("SELECT DISTINCT framework_id")) return [{ framework_id: 2 }];
      return [[], 0];
    });

    await deleteRiskMappingsForProjectsQuery(7, [30], 4, TX);

    const pfLookup = mockQuery.mock.calls[0];
    expect(pfLookup[0]).toContain("project_id IN (:projectIds)");
    expect(pfLookup[0]).toContain("organization_id = :organizationId");

    expect(deletesFrom("subclauses_iso__risks")[0][1].replacements.pfIds).toEqual([11]);

    for (const table of [
      "custom_framework_level2_risks",
      "custom_framework_level3_risks",
      "imported_framework_topic_impl__risks",
      "imported_framework_subtopic_impl__risks",
    ]) {
      const calls = deletesFrom(table);
      expect(calls).toHaveLength(1);
      const [sql, options] = calls[0];
      expect(sql).toContain("organization_id = :organizationId");
      expect(sql).toMatch(/(risk_id|projects_risks_id) = :riskId/);
      expect(sql).toContain("project_id IN (:projectIds)");
      expect(options).toEqual({
        replacements: { riskId: 7, projectIds: [30], organizationId: 4 },
        transaction: TX,
      });
    }
  });
});

describe("updateRiskByIdQuery link removal", () => {
  /** The risk is linked to project 30 and framework 2; the edit removes both. */
  function arrange() {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM risks")) return [[{ id: 7 }], 1];
      if (sql.startsWith("SELECT project_id FROM projects_risks")) return [[{ project_id: 30 }], 1];
      if (sql.startsWith("SELECT framework_id FROM frameworks_risks"))
        return [[{ framework_id: 3 }], 1];
      if (sql.startsWith("SELECT id FROM projects_frameworks WHERE project_id"))
        return [{ id: 11 }];
      if (sql.startsWith("SELECT id FROM projects_frameworks WHERE framework_id"))
        return [[{ id: 21 }], 1];
      if (sql.includes("SELECT DISTINCT framework_id")) return [{ framework_id: 3 }];
      return [[], 0];
    });
  }

  it("cleans every framework's mappings when a use case or framework is removed", async () => {
    arrange();

    await updateRiskByIdQuery(
      7,
      { deletedLinkedProject: true, deletedLinkedFrameworks: true } as never,
      4,
      TX,
    );

    // ISO 27001 mappings go for the removed use case, not only EU AI Act ones.
    const iso27001 = deletesFrom("subclauses_iso27001__risks");
    expect(iso27001.map(([, o]) => o.replacements.pfIds)).toEqual([[11], [21]]);
    expect(deletesFrom("custom_framework_level2_risks")).toHaveLength(1);
    expect(sqlCalls().some((s) => s.startsWith("DELETE FROM projects_risks"))).toBe(true);
    expect(sqlCalls().some((s) => s.startsWith("DELETE FROM frameworks_risks"))).toBe(true);
  });
});
