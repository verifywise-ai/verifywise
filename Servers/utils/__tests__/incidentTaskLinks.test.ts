/**
 * Tasks linked to incidents (task_entity_links, entity_type "incident"):
 *  - "incident" is a valid link type on ai_incident_managements, organization
 *    wide (never a use case's framework requirement);
 *  - taskLinkRefusalQuery says why a link may not be made: an archived
 *    incident, or no access; persistTaskEntityLinks fails the save for an
 *    archived incident and keeps links made before it was archived;
 *  - incident link names come from the incident (incidentLinkName), all of
 *    them in one query per read;
 *  - hard-deleting an incident deletes its task links in the same transaction.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));

import { sequelize } from "../../database/db";
import {
  ArchivedIncidentLinkError,
  getEntityLinksForTasksQuery,
  getTaskEntityLinksQuery,
  incidentLinkName,
  isValidEntityType,
  persistTaskEntityLinks,
  TASK_ENTITY_TABLES,
  taskLinkReachesProjectSql,
  taskLinkRefusalQuery,
} from "../taskEntityLink.utils";
import { deleteIncidentByIdQuery } from "../incidentManagement.utils";

const mockQuery = sequelize.query as unknown as jest.Mock<(...args: any[]) => any>;
const viewer = { userId: 7, role: "Editor" };
const tx = { afterCommit: jest.fn() } as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockReset();
});

describe("incident link type", () => {
  it("is a valid entity type stored on ai_incident_managements", () => {
    expect(isValidEntityType("incident")).toBe(true);
    expect(TASK_ENTITY_TABLES.incident).toBe("ai_incident_managements");
  });

  it("never reaches a use case's framework requirements", () => {
    const sql = taskLinkReachesProjectSql(":projectId");
    expect(sql).not.toContain("'incident'");
    expect(sql).not.toContain("ai_incident_managements");
  });
});

describe("incidentLinkName", () => {
  it("is the visible id and the use case", () => {
    expect(incidentLinkName({ id: 3, incident_id: "INC-12", ai_project: "Credit scoring" })).toBe(
      "INC-12 · Credit scoring",
    );
  });

  it("falls back to INC-<id> without a visible id, and to the id alone without a use case", () => {
    expect(incidentLinkName({ id: 5, incident_id: null, ai_project: "Fraud" })).toBe(
      "INC-5 · Fraud",
    );
    expect(incidentLinkName({ id: 5, incident_id: "", ai_project: "" })).toBe("INC-5");
  });

  it("cuts the use case to 60 characters", () => {
    const name = incidentLinkName({ id: 1, incident_id: "INC-1", ai_project: "x".repeat(80) });
    expect(name).toBe(`INC-1 · ${"x".repeat(60)}`);
  });
});

describe("taskLinkRefusalQuery for incidents", () => {
  it("allows an incident of the organization that is not archived, in one query", async () => {
    mockQuery.mockResolvedValueOnce([{ archived: false }]);

    await expect(taskLinkRefusalQuery(12, "incident", viewer, 3, tx)).resolves.toBeNull();

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain("FROM ai_incident_managements");
    expect(sql).toContain("organization_id = :organizationId");
    expect(opts.replacements).toEqual({ organizationId: 3, entityId: 12 });
    expect(opts.transaction).toBe(tx);
  });

  it("says archived_incident for an archived incident", async () => {
    mockQuery.mockResolvedValueOnce([{ archived: true }]);

    await expect(taskLinkRefusalQuery(12, "incident", viewer, 3)).resolves.toBe(
      "archived_incident",
    );
  });

  it("refuses an incident that is not in the organization", async () => {
    mockQuery.mockResolvedValueOnce([]);

    await expect(taskLinkRefusalQuery(12, "incident", viewer, 3)).resolves.toBe("forbidden");
  });

  it("does not depend on the viewer's role or use case access", async () => {
    mockQuery.mockResolvedValue([{ archived: null }]);

    await expect(
      taskLinkRefusalQuery(12, "incident", { userId: 8, role: "Auditor" }, 3),
    ).resolves.toBeNull();
    expect(String(mockQuery.mock.calls[0][0])).not.toContain("projects");
  });

  it("allows vendors without a query", async () => {
    await expect(taskLinkRefusalQuery(4, "vendor", viewer, 3)).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("persistTaskEntityLinks with incidents", () => {
  const routeLinkQueries = (state: { archived: boolean; alreadyLinked: boolean }) => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT EXISTS(SELECT 1 FROM ai_incident_managements")) {
        return [{ exists: true }];
      }
      if (sql.includes("FROM task_entity_links") && sql.includes("EXISTS")) {
        return [{ exists: state.alreadyLinked }];
      }
      if (sql.includes("SELECT archived FROM ai_incident_managements")) {
        return [{ archived: state.archived }];
      }
      if (sql.includes("INSERT INTO task_entity_links")) return [{ id: 1 }];
      throw new Error(`unexpected query: ${sql}`);
    });
  };

  it("links an incident that is not archived", async () => {
    routeLinkQueries({ archived: false, alreadyLinked: false });

    await expect(
      persistTaskEntityLinks(5, [{ entity_id: 12, entity_type: "incident" }], viewer, 3, tx),
    ).resolves.toBe(1);
  });

  it("fails the save for a new link to an archived incident", async () => {
    routeLinkQueries({ archived: true, alreadyLinked: false });

    await expect(
      persistTaskEntityLinks(5, [{ entity_id: 12, entity_type: "incident" }], viewer, 3, tx),
    ).rejects.toBeInstanceOf(ArchivedIncidentLinkError);
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT"))).toBe(false);
  });

  it("keeps an existing link to an archived incident without checking it again", async () => {
    routeLinkQueries({ archived: true, alreadyLinked: true });

    await expect(
      persistTaskEntityLinks(5, [{ entity_id: 12, entity_type: "incident" }], viewer, 3, tx),
    ).resolves.toBe(0);
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("archived"))).toBe(false);
  });
});

describe("incident link names on reads", () => {
  it("names an incident link from the incident, not the stored text", async () => {
    mockQuery
      .mockResolvedValueOnce([
        { id: 1, task_id: 5, entity_id: 12, entity_type: "incident", entity_name: "INC-12 · Old" },
      ])
      .mockResolvedValueOnce([{ id: 12, incident_id: "INC-12", ai_project: "Credit scoring" }]);

    const links = await getTaskEntityLinksQuery(5, 3);

    expect(links[0].entity_name).toBe("INC-12 · Credit scoring");
    const [sql, opts] = mockQuery.mock.calls[1];
    expect(sql).toContain("FROM ai_incident_managements");
    expect(opts.replacements).toEqual({ organizationId: 3, incidentIds: [12] });
  });

  it("falls back to the stored name when the incident cannot be read", async () => {
    mockQuery
      .mockResolvedValueOnce([
        { id: 1, task_id: 5, entity_id: 12, entity_type: "incident", entity_name: "INC-12 · Old" },
      ])
      .mockResolvedValueOnce([]);

    const links = await getTaskEntityLinksQuery(5, 3);

    expect(links[0].entity_name).toBe("INC-12 · Old");
  });

  it("keeps using the stored name for other link types", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: 2, task_id: 5, entity_id: 4, entity_type: "vendor", entity_name: "Acme" },
    ]);

    const links = await getTaskEntityLinksQuery(5, 3);

    expect(links[0].entity_name).toBe("Acme");
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("reads the links of many tasks and all their incidents in two queries", async () => {
    mockQuery
      .mockResolvedValueOnce([
        { id: 1, task_id: 5, entity_id: 12, entity_type: "incident", entity_name: null },
        { id: 2, task_id: 6, entity_id: 12, entity_type: "incident", entity_name: null },
        { id: 3, task_id: 6, entity_id: 13, entity_type: "incident", entity_name: null },
        { id: 4, task_id: 7, entity_id: 4, entity_type: "vendor", entity_name: "Acme" },
      ])
      .mockResolvedValueOnce([
        { id: 12, incident_id: "INC-12", ai_project: "Credit scoring" },
        { id: 13, incident_id: "INC-13", ai_project: "Chatbot" },
      ]);

    const byTask = await getEntityLinksForTasksQuery([5, 6, 7, 8], 3);

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery.mock.calls[0][1].replacements).toEqual({
      organizationId: 3,
      taskIds: [5, 6, 7, 8],
    });
    expect(mockQuery.mock.calls[1][1].replacements).toEqual({
      organizationId: 3,
      incidentIds: [12, 13],
    });
    expect(byTask.get(5)?.map((l) => l.entity_name)).toEqual(["INC-12 · Credit scoring"]);
    expect(byTask.get(6)?.map((l) => l.entity_name)).toEqual([
      "INC-12 · Credit scoring",
      "INC-13 · Chatbot",
    ]);
    expect(byTask.get(7)?.map((l) => l.entity_name)).toEqual(["Acme"]);
    expect(byTask.get(8)).toBeUndefined();
  });

  it("does not query for no tasks", async () => {
    expect((await getEntityLinksForTasksQuery([], 3)).size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("deleteIncidentByIdQuery and task links", () => {
  const routeDeleteQueries = (deleted: boolean) => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("UPDATE jira_incident_links")) return [[], 0];
      if (sql.includes("DELETE FROM ai_incident_managements")) {
        return deleted ? [[{ id: 12, incident_id: "INC-12" }], 1] : [[], 0];
      }
      if (sql.includes("DELETE FROM task_entity_links")) return [[], 2];
      if (sql.includes("FROM automation_triggers")) return [[], 0];
      throw new Error(`unexpected query: ${sql}`);
    });
  };

  it("deletes the incident's task links in the delete's transaction", async () => {
    routeDeleteQueries(true);

    await expect(deleteIncidentByIdQuery(12, 3, tx)).resolves.toMatchObject({ id: 12 });

    const linkDelete = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("DELETE FROM task_entity_links"),
    ) as any[];
    expect(linkDelete[0]).toContain("entity_type = 'incident'");
    expect(linkDelete[0]).toContain("organization_id = :organizationId");
    expect(linkDelete[1]).toEqual({ replacements: { organizationId: 3, id: 12 }, transaction: tx });
  });

  it("deletes the links only after the incident row was deleted", async () => {
    routeDeleteQueries(true);

    await deleteIncidentByIdQuery(12, 3, tx);

    const order = mockQuery.mock.calls.map(([sql]) => String(sql));
    const incidentAt = order.findIndex((sql) =>
      sql.includes("DELETE FROM ai_incident_managements"),
    );
    const linksAt = order.findIndex((sql) => sql.includes("DELETE FROM task_entity_links"));
    expect(incidentAt).toBeGreaterThanOrEqual(0);
    expect(linksAt).toBeGreaterThan(incidentAt);
  });

  it("touches no task links when the incident is not in the organization", async () => {
    routeDeleteQueries(false);

    await expect(deleteIncidentByIdQuery(12, 3, tx)).resolves.toBeNull();
    expect(
      mockQuery.mock.calls.some(([sql]) => String(sql).includes("DELETE FROM task_entity_links")),
    ).toBe(false);
  });
});
