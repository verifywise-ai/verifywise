import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Mock dependencies
jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn<any>(),
  },
}));

jest.mock("../project.utils", () => ({
  getAllProjectsQuery: jest.fn<any>(),
}));

jest.mock("../../services/plugin/pluginService", () => ({
  PluginService: {
    getDataFromProviders: jest.fn<any>(),
  },
}));

import { getDashboardDataQuery } from "../dashboard.utils";
import { sequelize } from "../../database/db";
import { getAllProjectsQuery } from "../project.utils";
import { PluginService } from "../../services/plugin/pluginService";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;
const mockGetAllProjects = getAllProjectsQuery as jest.MockedFunction<typeof getAllProjectsQuery>;
const mockGetDataFromProviders = PluginService.getDataFromProviders as jest.MockedFunction<
  typeof PluginService.getDataFromProviders
>;

describe("getDashboardDataQuery", () => {
  const organizationId = 1;
  const userId = 1;
  const role = "Admin";

  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress expected console noise from error-handling tests
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    // Default mocks
    mockGetAllProjects.mockResolvedValue([]);
    mockGetDataFromProviders.mockResolvedValue([]);
    // Default: trainings=0, models=0, reports=0, tasks=0/0/0
    mockQuery.mockResolvedValue([[{ count: "0" }], 0] as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should return IDashboard with correct project count", async () => {
    const projects = [
      { id: 1, project_title: "Project A" },
      { id: 2, project_title: "Project B" },
    ];
    mockGetAllProjects.mockResolvedValue(projects as any);

    const result = await getDashboardDataQuery(organizationId, userId, role);

    expect(result).not.toBeNull();
    expect(result!.projects).toBe(2);
    expect(result!.projects_list).toHaveLength(2);
  });

  it("should call getAllProjectsQuery with userId, role, and organizationId", async () => {
    await getDashboardDataQuery(organizationId, userId, role);

    expect(mockGetAllProjects).toHaveBeenCalledWith(
      { userId, role },
      organizationId
    );
  });

  it("should query trainings count from tenant schema", async () => {
    mockQuery.mockImplementation(async (sql: any) => {
      if (typeof sql === "string" && sql.includes("trainingregistar")) {
        return [[{ count: "7" }], 0] as any;
      }
      return [[{ count: "0" }], 0] as any;
    });

    const result = await getDashboardDataQuery(organizationId, userId, role);

    expect(result!.trainings).toBe(7);
    // Verify query uses organization_id filter
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("trainingregistar WHERE organization_id"),
      expect.objectContaining({ replacements: expect.objectContaining({ organizationId }) })
    );
  });

  it("should query model_inventories count from tenant schema", async () => {
    mockQuery.mockImplementation(async (sql: any) => {
      if (typeof sql === "string" && sql.includes("model_inventories")) {
        return [[{ count: "4" }], 0] as any;
      }
      return [[{ count: "0" }], 0] as any;
    });

    const result = await getDashboardDataQuery(organizationId, userId, role);

    expect(result!.models).toBe(4);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("model_inventories WHERE organization_id"),
      expect.objectContaining({ replacements: expect.objectContaining({ organizationId }) })
    );
  });

  it("should query reports count from files with source ILIKE report", async () => {
    mockQuery.mockImplementation(async (sql: any) => {
      if (typeof sql === "string" && sql.includes("ILIKE")) {
        return [[{ count: "3" }], 0] as any;
      }
      return [[{ count: "0" }], 0] as any;
    });

    const result = await getDashboardDataQuery(organizationId, userId, role);

    expect(result!.reports).toBe(3);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("files AS f WHERE"),
      expect.objectContaining({ replacements: expect.objectContaining({ organizationId }) })
    );
  });

  it("should calculate task radar: overdue, due, upcoming", async () => {
    let callIndex = 0;
    mockQuery.mockImplementation(async (sql: any) => {
      if (typeof sql === "string" && sql.includes("tasks")) {
        callIndex++;
        // The three task radar queries
        if (sql.includes("due_date < CURRENT_DATE")) {
          return [[{ count: "2" }], 0] as any; // overdue
        }
        if (sql.includes("due_date >= CURRENT_DATE") && sql.includes("INTERVAL '7 days'") && !sql.includes("> CURRENT_DATE + INTERVAL")) {
          return [[{ count: "5" }], 0] as any; // due soon
        }
        if (sql.includes("> CURRENT_DATE + INTERVAL")) {
          return [[{ count: "8" }], 0] as any; // upcoming
        }
      }
      return [[{ count: "0" }], 0] as any;
    });

    const result = await getDashboardDataQuery(organizationId, userId, role);

    expect(result!.task_radar.overdue).toBe(2);
    expect(result!.task_radar.due).toBe(5);
    expect(result!.task_radar.upcoming).toBe(8);
  });

  it("should merge plugin use-cases into projects_list", async () => {
    const nativeProjects = [{ id: 1, project_title: "Native" }];
    const pluginUseCases = [{ id: 100, project_title: "Jira Use Case", source: "jira-assets" }];

    mockGetAllProjects.mockResolvedValue(nativeProjects as any);
    mockGetDataFromProviders.mockResolvedValue(pluginUseCases as any);

    const result = await getDashboardDataQuery(organizationId, userId, role);

    expect(result!.projects).toBe(2);
    expect(result!.projects_list).toHaveLength(2);
    expect(mockGetDataFromProviders).toHaveBeenCalledWith(
      "use-cases",
      organizationId,
      sequelize
    );
  });

  it("should continue gracefully when plugin fetch fails", async () => {
    const nativeProjects = [{ id: 1, project_title: "Native" }];
    mockGetAllProjects.mockResolvedValue(nativeProjects as any);
    mockGetDataFromProviders.mockRejectedValue(new Error("Plugin error"));

    const result = await getDashboardDataQuery(organizationId, userId, role);

    // Should still return native projects
    expect(result!.projects).toBe(1);
    expect(result!.projects_list).toHaveLength(1);
  });

  it("should continue gracefully when tasks table does not exist (task radar defaults to 0)", async () => {
    mockQuery.mockImplementation(async (sql: any) => {
      if (typeof sql === "string" && sql.includes("tasks")) {
        throw new Error('relation "public".tasks does not exist');
      }
      return [[{ count: "0" }], 0] as any;
    });

    const result = await getDashboardDataQuery(organizationId, userId, role);

    expect(result!.task_radar.overdue).toBe(0);
    expect(result!.task_radar.due).toBe(0);
    expect(result!.task_radar.upcoming).toBe(0);
  });
});
