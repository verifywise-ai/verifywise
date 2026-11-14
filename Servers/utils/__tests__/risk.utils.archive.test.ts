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
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { sequelize } from "../../database/db";
import logger from "../logger/fileLogger";
import { recordSnapshotIfChanged } from "../history/riskHistory.utils";
import { recordProjectRiskDeletion } from "../projectRiskChangeHistory.utils";
import { enqueueAutomationAction } from "../../services/automations/automationProducer";
import {
  archiveRiskQuery,
  createRiskQuery,
  deleteRiskByIdQuery,
  enqueueBulkRiskAutomation,
  getActiveRisksByIdsQuery,
  getProjectTitlesByRiskIdsQuery,
  sameRiskCategories,
  deleteRiskMappingsForProjectFrameworksQuery,
  deleteRiskMappingsForProjectsQuery,
  updateRiskByIdQuery,
} from "../risk.utils";
import { FRAMEWORK_STRUCTURES } from "../../structures";

const mockQuery = sequelize.query as jest.Mock;
const mockSnapshot = recordSnapshotIfChanged as jest.Mock;
const mockRecordDeletion = recordProjectRiskDeletion as jest.Mock;
const mockEnqueue = enqueueAutomationAction as jest.Mock;
const TX = { id: "tx" } as never;

const sqlCalls = () => mockQuery.mock.calls.map(([sql]) => String(sql));
const deletesFrom = (table: string) =>
  mockQuery.mock.calls.filter(([sql]) => new RegExp(`DELETE FROM ${table}\\b`).test(String(sql)));

beforeEach(() => {
  mockQuery.mockReset();
  (logger.error as jest.Mock).mockClear();
  mockSnapshot.mockClear();
  mockRecordDeletion.mockClear();
  mockEnqueue.mockReset();
  mockEnqueue.mockResolvedValue(undefined);
});

describe("archiveRiskQuery", () => {
  /** The soft-delete UPDATE matches `archived`; everything else returns nothing. */
  function arrange(archived: boolean) {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM automation_triggers")) return [];
      if (sql.startsWith("UPDATE risks SET is_deleted = true")) {
        return [archived ? [{ id: 5, risk_owner: 2, risk_approval: 3 }] : [], 0];
      }
      return [[], 0];
    });
  }

  it("soft-deletes, records the deletion, unlinks policies and records snapshots", async () => {
    arrange(true);

    // The archived row comes back for the caller (the bulk archive's summary).
    await expect(archiveRiskQuery(5, 4, 9, TX)).resolves.toEqual({
      id: 5,
      risk_owner: 2,
      risk_approval: 3,
    });

    expect(mockRecordDeletion).toHaveBeenCalledWith(5, 9, 4, TX);
    const unlink = deletesFrom("policy_linked_objects");
    expect(unlink).toHaveLength(1);
    expect(unlink[0][0]).toContain("organization_id = :organizationId");
    expect(unlink[0][0]).toContain("object_type = 'risk'");
    expect(unlink[0][0]).toContain("object_id = :riskId");
    expect(unlink[0][1]).toEqual({
      replacements: { organizationId: 4, riskId: 5 },
      transaction: TX,
    });
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

    await expect(archiveRiskQuery(5, 4, 9, TX)).resolves.toBeNull();

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
      if (sql.includes("FROM automation_triggers")) return [];
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

  it("matches EU control mappings on controls_eu ids, not subcontrol ids", async () => {
    arrangeFrameworks([1]);

    await deleteRiskMappingsForProjectFrameworksQuery(7, [11, 12], 4, TX);

    const [sql] = deletesFrom("controls_eu__risks")[0] as [string];
    expect(sql).toContain(
      "control_id IN (SELECT c.id FROM controls_eu c WHERE c.projects_frameworks_id IN (:pfIds) AND c.organization_id = :organizationId)",
    );
    expect(sql).not.toContain("subcontrols_eu");
  });
});

describe("deleteRiskMappingsForProjectsQuery", () => {
  it("clears framework, custom framework and imported framework mappings for the projects", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM automation_triggers")) return [];
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
      if (sql.includes("FROM automation_triggers")) return [];
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

describe("risk automations wait for the commit", () => {
  /** A transaction that keeps its afterCommit callbacks until commit() or rollback(). */
  function makeTransaction() {
    let callbacks: Array<() => unknown> = [];
    return {
      afterCommit: jest.fn((cb: () => unknown) => {
        callbacks.push(cb);
      }),
      commit: () => {
        callbacks.forEach((cb) => cb());
        callbacks = [];
      },
      rollback: () => {
        callbacks = [];
      },
    };
  }

  /** One active automation for `trigger`; the archive/update/insert returns risk 5. */
  function arrange(trigger: string) {
    mockQuery.mockImplementation(async (sql: string, options: any) => {
      if (sql.includes("FROM automation_triggers")) {
        if (options.replacements.triggerKey !== trigger) return [];
        return [
          { action_key: "send_email", automation_id: 1, params: { subject: "s", body: "b" } },
        ];
      }
      if (sql.startsWith("UPDATE risks SET is_deleted = true")) {
        return [[{ id: 5, risk_name: "Archived", risk_owner: 2, risk_approval: 3 }], 1];
      }
      if (sql.startsWith("INSERT INTO risks")) {
        return [{ id: 5, dataValues: { id: 5, risk_owner: 2, risk_approval: 3 } }];
      }
      // getRiskByIdQuery's read of the stored row, then the edit's UPDATE.
      if (sql.startsWith("SELECT * FROM risks")) return [[{ id: 5 }], 1];
      if (sql.startsWith("UPDATE risks SET")) {
        return [
          { id: 5, dataValues: { id: 5, risk_name: "Renamed", risk_owner: 2, risk_approval: 3 } },
        ];
      }
      return [[], 0];
    });
  }

  it("enqueues risk_deleted only after the transaction commits", async () => {
    arrange("risk_deleted");
    const tx = makeTransaction();

    await deleteRiskByIdQuery(5, 4, tx as never);
    expect(tx.afterCommit).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).not.toHaveBeenCalled();

    tx.commit();
    expect(mockEnqueue).toHaveBeenCalledWith(
      "send_email",
      expect.objectContaining({ organizationId: 4, automation_id: 1 }),
    );
  });

  it("enqueues risk_updated only after the transaction commits", async () => {
    arrange("risk_updated");
    const tx = makeTransaction();

    await updateRiskByIdQuery(5, { risk_name: "Renamed" } as never, 4, tx as never);
    expect(mockEnqueue).not.toHaveBeenCalled();

    tx.commit();
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it("enqueues risk_added only after the transaction commits", async () => {
    arrange("risk_added");
    const tx = makeTransaction();

    await createRiskQuery({ risk_name: "New" } as never, 4, tx as never);
    expect(mockEnqueue).not.toHaveBeenCalled();

    tx.commit();
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it("enqueues nothing when a bulk archive rolls back", async () => {
    arrange("risk_deleted");
    const tx = makeTransaction();

    for (const id of [5, 6, 7]) {
      await archiveRiskQuery(id, 4, 9, tx as never, { recordSnapshots: false });
    }
    expect(tx.afterCommit).toHaveBeenCalledTimes(3);

    tx.rollback();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("logs, and does not throw, when the enqueue after commit fails", async () => {
    arrange("risk_deleted");
    mockEnqueue.mockRejectedValueOnce(new Error("redis down"));
    const tx = makeTransaction();

    await deleteRiskByIdQuery(5, 4, tx as never);

    expect(() => tx.commit()).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it("enqueues at once without a transaction", async () => {
    arrange("risk_deleted");

    await deleteRiskByIdQuery(5, 4, undefined as never);

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it("runs no per-risk automation when a bulk action asks it not to", async () => {
    arrange("risk_updated");
    const tx = makeTransaction();

    await archiveRiskQuery(5, 4, 9, tx as never, { runAutomations: false });
    await updateRiskByIdQuery(5, { risk_name: "Renamed" } as never, 4, tx as never, {
      runAutomations: false,
    });

    expect(sqlCalls().some((sql) => sql.includes("FROM automation_triggers"))).toBe(false);
    expect(tx.afterCommit).not.toHaveBeenCalled();
  });

  /** Two active automations with two actions each, in a.id, order order (R-L6). */
  const FOUR_ACTIONS = [
    { automation_id: 1, action_key: "send_email", params: { subject: "1a {{risk.name}}" } },
    { automation_id: 1, action_key: "send_slack", params: { subject: "1b {{risk.name}}" } },
    { automation_id: 2, action_key: "send_email", params: { subject: "2a {{risk.name}}" } },
    { automation_id: 2, action_key: "send_slack", params: { subject: "2b {{risk.name}}" } },
  ];

  function arrangeFourActions(trigger: string) {
    arrange(trigger);
    const base = mockQuery.getMockImplementation()!;
    mockQuery.mockImplementation(async (sql: string, options: any) => {
      if (sql.includes("FROM automation_triggers")) {
        return options.replacements.triggerKey === trigger ? FOUR_ACTIONS : [];
      }
      return base(sql, options);
    });
  }

  it("runs every action of every automation for risk_updated, in order, after commit", async () => {
    arrangeFourActions("risk_updated");
    const tx = makeTransaction();

    await updateRiskByIdQuery(5, { risk_name: "Renamed" } as never, 4, tx as never);
    expect(mockEnqueue).not.toHaveBeenCalled();

    const automationSql = sqlCalls().find((sql) => sql.includes("FROM automation_triggers"))!;
    expect(automationSql).toContain('ORDER BY a.id ASC, aa."order" ASC');
    expect(automationSql).toContain("a.organization_id = :organizationId");
    expect(automationSql).toContain("aa.organization_id = :organizationId");
    // Owner and approver names are read once for the event, not per action.
    expect(sqlCalls().filter((sql) => sql.includes("FROM users"))).toHaveLength(1);

    tx.commit();
    expect(mockEnqueue.mock.calls.map(([key, data]) => [key, data.automation_id])).toEqual([
      ["send_email", 1],
      ["send_slack", 1],
      ["send_email", 2],
      ["send_slack", 2],
    ]);
    expect(mockEnqueue.mock.calls[2][1]).toEqual(
      expect.objectContaining({
        subject: "2a Renamed",
        body: "",
        automation_id: 2,
        organizationId: 4,
      }),
    );
  });

  it("enqueues none of the actions when the edit rolls back", async () => {
    arrangeFourActions("risk_updated");
    const tx = makeTransaction();

    await updateRiskByIdQuery(5, { risk_name: "Renamed" } as never, 4, tx as never);
    tx.rollback();

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("still enqueues the other actions when one enqueue fails", async () => {
    arrangeFourActions("risk_deleted");
    mockEnqueue.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("redis down"));
    const tx = makeTransaction();

    await deleteRiskByIdQuery(5, 4, tx as never);
    expect(() => tx.commit()).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockEnqueue).toHaveBeenCalledTimes(4);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("redis down"));
  });

  it("runs every action for risk_added and, without a transaction, at once", async () => {
    arrangeFourActions("risk_added");
    const tx = makeTransaction();
    await createRiskQuery({ risk_name: "New" } as never, 4, tx as never);
    tx.commit();
    expect(mockEnqueue).toHaveBeenCalledTimes(4);

    mockEnqueue.mockClear();
    arrangeFourActions("risk_deleted");
    mockEnqueue.mockRejectedValueOnce(new Error("redis down"));
    await expect(deleteRiskByIdQuery(5, 4, undefined as never)).resolves.toBeTruthy();
    expect(mockEnqueue).toHaveBeenCalledTimes(4);
  });
});

describe("enqueueBulkRiskAutomation", () => {
  /** A transaction that keeps its afterCommit callbacks until commit() or rollback(). */
  function makeTransaction() {
    let callbacks: Array<() => unknown> = [];
    return {
      afterCommit: jest.fn((cb: () => unknown) => {
        callbacks.push(cb);
      }),
      commit: () => {
        callbacks.forEach((cb) => cb());
        callbacks = [];
      },
      rollback: () => {
        callbacks = [];
      },
    };
  }

  const USERS: Record<number, string> = { 3: "Ann Old", 4: "Cy Other", 7: "Bo New", 8: "Pat Lee" };

  /** One active automation for `trigger` whose email names the risk, owner and changes. */
  function arrange(trigger: string, automation = true) {
    mockQuery.mockImplementation(async (sql: string, options: any) => {
      if (sql.includes("FROM automation_triggers")) {
        if (!automation || options.replacements.triggerKey !== trigger) return [];
        return [
          {
            action_key: "send_email",
            automation_id: 1,
            params: {
              to: ["a@example.com"],
              subject: "{{risk.name}}",
              body: "Owner: {{risk.owner}}\n{{changes_summary}}",
            },
          },
        ];
      }
      if (sql.includes("FROM users")) {
        return (options.replacements.userIds as number[])
          .filter((id) => USERS[id])
          .map((id) => ({ id, full_name: USERS[id] }));
      }
      return [[], 0];
    });
  }

  const row = (id: number, owner: number) => ({
    id,
    risk_name: `Risk ${id}`,
    risk_owner: owner,
    risk_approval: 8,
  });

  it("enqueues one risk_deleted job for a bulk archive of 3, after commit", async () => {
    arrange("risk_deleted");
    const tx = makeTransaction();
    const changes = [row(1, 3), row(2, 4), row(3, 3)].map((r) => ({ before: r, after: r }));

    await enqueueBulkRiskAutomation("risk_deleted", changes, 4, tx as never);

    expect(tx.afterCommit).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).not.toHaveBeenCalled();
    // One name lookup for every owner and approver in the batch.
    const userQueries = mockQuery.mock.calls.filter(([sql]) => String(sql).includes("FROM users"));
    expect(userQueries).toHaveLength(1);
    expect(userQueries[0][1].replacements.userIds.sort()).toEqual([3, 4, 8]);

    tx.commit();
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith(
      "send_email",
      expect.objectContaining({
        to: ["a@example.com"],
        subject: "3 risks: Risk 1, Risk 2, Risk 3",
        // Owners differ, so risk.owner is empty; no change summary on delete.
        body: "Owner: \n{{changes_summary}}",
        automation_id: 1,
        organizationId: 4,
      }),
    );
  });

  it("enqueues one risk_updated job for a bulk set owner of 3, with a line per risk", async () => {
    arrange("risk_updated");
    const tx = makeTransaction();
    const changes = [row(1, 3), row(2, 4), row(3, 3)].map((r) => ({
      before: r,
      after: { ...r, risk_owner: 7 },
    }));

    await enqueueBulkRiskAutomation("risk_updated", changes, 4, tx as never);
    tx.commit();

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const [, payload] = mockEnqueue.mock.calls[0];
    expect(payload.subject).toBe("3 risks: Risk 1, Risk 2, Risk 3");
    expect(payload.body).toBe(
      [
        "Owner: Bo New",
        "• Risk 1: Owner: Ann Old → Bo New",
        "• Risk 2: Owner: Cy Other → Bo New",
        "• Risk 3: Owner: Ann Old → Bo New",
      ].join("\n"),
    );
  });

  it("gives a one-risk batch the single edit's replacements", async () => {
    arrange("risk_updated");
    const tx = makeTransaction();

    await enqueueBulkRiskAutomation(
      "risk_updated",
      [{ before: row(1, 3), after: { ...row(1, 3), risk_owner: 7 } }],
      4,
      tx as never,
    );
    tx.commit();

    const [, payload] = mockEnqueue.mock.calls[0];
    expect(payload.subject).toBe("Risk 1");
    // The single edit's full summary, unchanged fields included.
    expect(payload.body).toBe(
      ["Owner: Bo New", "• Name: Risk 1", "• Owner: Ann Old → Bo New"].join("\n"),
    );
  });

  it("runs each action of every automation once for the whole bulk action", async () => {
    arrange("risk_updated");
    const base = mockQuery.getMockImplementation()!;
    mockQuery.mockImplementation(async (sql: string, options: any) => {
      if (sql.includes("FROM automation_triggers")) {
        return [
          { automation_id: 1, action_key: "send_email", params: { subject: "{{risk.name}}" } },
          { automation_id: 1, action_key: "send_slack", params: { subject: "{{risk.name}}" } },
          { automation_id: 2, action_key: "send_email", params: { subject: "{{risk.name}}" } },
        ];
      }
      return base(sql, options);
    });
    const tx = makeTransaction();
    const changes = [row(1, 3), row(2, 4), row(3, 3)].map((r) => ({
      before: r,
      after: { ...r, risk_owner: 7 },
    }));

    await enqueueBulkRiskAutomation("risk_updated", changes, 4, tx as never);
    tx.commit();

    expect(mockEnqueue.mock.calls.map(([key, data]) => [key, data.automation_id])).toEqual([
      ["send_email", 1],
      ["send_slack", 1],
      ["send_email", 2],
    ]);
    for (const [, payload] of mockEnqueue.mock.calls) {
      expect(payload.subject).toBe("3 risks: Risk 1, Risk 2, Risk 3");
    }
  });

  it("enqueues nothing when the bulk action rolls back", async () => {
    arrange("risk_deleted");
    const tx = makeTransaction();
    const changes = [row(1, 3), row(2, 3)].map((r) => ({ before: r, after: r }));

    await enqueueBulkRiskAutomation("risk_deleted", changes, 4, tx as never);
    tx.rollback();

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("does nothing without an active automation or without changes", async () => {
    arrange("risk_deleted", false);
    const tx = makeTransaction();

    await enqueueBulkRiskAutomation(
      "risk_deleted",
      [{ before: row(1, 3), after: row(1, 3) }],
      4,
      tx as never,
    );
    expect(tx.afterCommit).not.toHaveBeenCalled();

    mockQuery.mockClear();
    await enqueueBulkRiskAutomation("risk_deleted", [], 4, tx as never);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("updateRiskByIdQuery snapshots", () => {
  function arrange() {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM automation_triggers")) return [];
      if (sql.startsWith("SELECT * FROM risks")) return [[{ id: 7, severity: "Minor" }], 1];
      if (sql.startsWith("UPDATE risks SET")) {
        return [{ id: 7, dataValues: { id: 7, severity: "Major" } }];
      }
      return [[], 0];
    });
  }

  it("records the changed parameters' snapshots by default", async () => {
    arrange();

    await updateRiskByIdQuery(7, { severity: "Major" } as never, 4, TX);

    expect(mockSnapshot.mock.calls.map((c) => c[0])).toContain("severity");
  });

  it("skips the snapshots when asked, for a bulk edit", async () => {
    arrange();

    await updateRiskByIdQuery(7, { severity: "Major" } as never, 4, TX, {
      recordSnapshots: false,
    });

    expect(mockSnapshot).not.toHaveBeenCalled();
  });
});

describe("getActiveRisksByIdsQuery", () => {
  it("reads only the organization's active risks, in the transaction", async () => {
    mockQuery.mockResolvedValue([{ id: 1 }]);

    await expect(getActiveRisksByIdsQuery([1, 2], 4, TX)).resolves.toEqual([{ id: 1 }]);

    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("organization_id = :organizationId");
    expect(sql).toContain("id IN (:ids)");
    expect(sql).toContain("is_deleted = false");
    expect(options).toEqual(
      expect.objectContaining({
        replacements: { organizationId: 4, ids: [1, 2] },
        transaction: TX,
      }),
    );
  });

  it("does not query for no ids", async () => {
    await expect(getActiveRisksByIdsQuery([], 4, TX)).resolves.toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("sameRiskCategories", () => {
  it("ignores order and duplicates, and reads a Postgres array literal", () => {
    expect(sameRiskCategories(["B", "A"], ["A", "B"])).toBe(true);
    expect(sameRiskCategories('{"A","B c"}', ["B c", "A", "A"])).toBe(true);
    expect(sameRiskCategories("{}", [])).toBe(true);
    expect(sameRiskCategories(["A"], ["A", "B"])).toBe(false);
    expect(sameRiskCategories(null, ["A"])).toBe(false);
  });
});

describe("getProjectTitlesByRiskIdsQuery", () => {
  it("reads every risk's first project title in one org-scoped query", async () => {
    mockQuery.mockResolvedValue([
      { risk_id: 1, project_title: "Use case A" },
      { risk_id: 2, project_title: "Use case B" },
    ]);

    const titles = await getProjectTitlesByRiskIdsQuery([1, 2, 3], 4);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("DISTINCT ON (prl.risk_id)");
    expect(sql).toContain("prl.risk_id IN (:riskIds)");
    expect(sql).toContain("prl.organization_id = :organizationId");
    expect(sql).toContain("p.organization_id = :organizationId");
    expect(sql).toContain("ORDER BY prl.risk_id, p.id ASC");
    expect(options).toEqual(
      expect.objectContaining({ replacements: { riskIds: [1, 2, 3], organizationId: 4 } }),
    );
    expect(titles.get(1)).toBe("Use case A");
    expect(titles.get(2)).toBe("Use case B");
    expect(titles.has(3)).toBe(false);
  });

  it("does not query for no risks", async () => {
    await expect(getProjectTitlesByRiskIdsQuery([], 4)).resolves.toEqual(new Map());
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
