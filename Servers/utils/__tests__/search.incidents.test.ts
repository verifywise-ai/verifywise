import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));

import { wiseSearch } from "../search.utils";
import { sequelize } from "../../database/db";

const mockQuery = sequelize.query as unknown as jest.Mock<(...a: any[]) => any>;

describe("Wise Search: incidents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockImplementation(async (sql: string) =>
      sql.includes("FROM ai_incident_managements")
        ? [
            {
              id: 12,
              incident_id: "INC-12",
              ai_project: "Chatbot",
              description: "Unsafe advice",
            },
          ]
        : [],
    );
  });

  const incidentSql = () =>
    String(
      mockQuery.mock.calls.find(([sql]) =>
        String(sql).includes("FROM ai_incident_managements"),
      )![0],
    );

  it("searches the visible incident id and leaves archived incidents out", async () => {
    const results = await wiseSearch({
      query: "INC-12",
      organizationId: 4,
      userId: 9,
      riskViewer: { userId: 9, isAdmin: true } as any,
    });

    expect(incidentSql()).toContain("incident_id::text ILIKE :searchPattern");
    expect(incidentSql()).toContain("(archived IS NOT TRUE)");
    expect(incidentSql()).toContain("organization_id = :organizationId");
    expect(results.incident_management.results[0]).toEqual(
      expect.objectContaining({
        id: 12,
        title: "Chatbot",
        matchedField: "incident_id",
        matchedValue: "INC-12",
        route: "/ai-incident-managements?incidentId=12",
      }),
    );
  });

  it("does not add the archived condition to other entities", async () => {
    await wiseSearch({
      query: "chatbot",
      organizationId: 4,
      userId: 9,
      riskViewer: { userId: 9, isAdmin: true } as any,
    });

    const others = mockQuery.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => sql.includes("ILIKE") && !sql.includes("FROM ai_incident_managements"));
    expect(others.length).toBeGreaterThan(0);
    for (const sql of others) expect(sql).not.toContain("archived IS NOT TRUE");
  });
});
