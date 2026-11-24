/**
 * Tasks linked to incidents (task_entity_links, entity_type "incident"):
 *  - "incident" is a valid link type on ai_incident_managements, organization
 *    wide (never a use case's framework requirement);
 *  - an incident can be linked only while it is not archived;
 *  - an incident link's name is read from the incident, not the stored text;
 *  - hard-deleting an incident deletes its task links in the same transaction.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));

import { sequelize } from "../../database/db";
import {
  canLinkTaskToEntityQuery,
  getTaskEntityLinksQuery,
  isIncidentLinkableQuery,
  isValidEntityType,
  persistTaskEntityLinks,
  TASK_ENTITY_TABLES,
  taskLinkReachesProjectSql,
} from "../taskEntityLink.utils";
import { deleteIncidentByIdQuery } from "../incidentManagement.utils";

const mockQuery = sequelize.query as unknown as jest.Mock<(...args: any[]) => any>;
const viewer = { userId: 7, role: "Editor" };
const tx = { afterCommit: jest.fn() } as any;

beforeEach(() => {
  jest.clearAllMocks();
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

describe("isIncidentLinkableQuery / canLinkTaskToEntityQuery for incidents", () => {
  it("allows an incident of the organization that is not archived", async () => {
    mockQuery.mockResolvedValueOnce([{ linkable: true }]);

    await expect(canLinkTaskToEntityQuery(12, "incident", viewer, 3, tx)).resolves.toBe(true);

    const [sql, opts] = mockQuery.mock.calls[0] as any[];
    expect(sql).toContain("FROM ai_incident_managements");
    expect(sql).toContain("archived IS NOT TRUE");
    expect(sql).toContain("organization_id = :organizationId");
    expect(opts.replacements).toEqual({ organizationId: 3, incidentId: 12 });
    expect(opts.transaction).toBe(tx);
  });

  it("refuses an archived incident", async () => {
    mockQuery.mockResolvedValueOnce([{ linkable: false }]);

    await expect(canLinkTaskToEntityQuery(12, "incident", viewer, 3)).resolves.toBe(false);
  });

  it("refuses an incident that is not in the organization", async () => {
    mockQuery.mockResolvedValueOnce([]);

    await expect(isIncidentLinkableQuery(12, 3)).resolves.toBe(false);
  });

  it("does not depend on the viewer's role or use case access", async () => {
    mockQuery.mockResolvedValue([{ linkable: true }]);

    await expect(
      canLinkTaskToEntityQuery(12, "incident", { userId: 8, role: "Auditor" }, 3),
    ).resolves.toBe(true);
    expect(String(mockQuery.mock.calls[0][0])).not.toContain("projects");
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
      if (sql.includes("archived IS NOT TRUE")) return [{ linkable: !state.archived }];
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

  it("skips a new link to an archived incident", async () => {
    routeLinkQueries({ archived: true, alreadyLinked: false });

    await expect(
      persistTaskEntityLinks(5, [{ entity_id: 12, entity_type: "incident" }], viewer, 3, tx),
    ).resolves.toBe(0);
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

describe("getTaskEntityLinksQuery for incidents", () => {
  it("names an incident link from the incident: its visible id and use case", async () => {
    mockQuery
      .mockResolvedValueOnce([
        { id: 1, task_id: 5, entity_id: 12, entity_type: "incident", entity_name: "INC-12 · Old" },
      ])
      .mockResolvedValueOnce([{ name: "INC-12 · Credit scoring" }]);

    const links = await getTaskEntityLinksQuery(5, 3);

    expect(links[0].entity_name).toBe("INC-12 · Credit scoring");
    const [sql, opts] = mockQuery.mock.calls[1] as any[];
    expect(sql).toContain("FROM ai_incident_managements i");
    expect(sql).toContain("COALESCE(NULLIF(i.incident_id, ''), 'INC-' || i.id)");
    expect(opts.replacements).toEqual({ organizationId: 3, entityId: 12 });
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
