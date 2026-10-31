import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));

import { sequelize } from "../../database/db";
import { enqueueAutomationAction } from "../../services/automations/automationProducer";
import {
  diffIncidentColumns,
  enqueueIncidentUpdatedAutomations,
  updateIncidentByIdQuery,
  validateIncidentReferences,
} from "../incidentManagement.utils";

const mockQuery = sequelize.query as jest.MockedFunction<any>;
const mockEnqueue = enqueueAutomationAction as jest.MockedFunction<any>;

describe("diffIncidentColumns", () => {
  const stored = {
    status: "Closed",
    description: "Unchanged",
    // As pg returns a TIMESTAMP WITHOUT TIME ZONE value (server-local wall clock).
    approval_date: new Date(2026, 9, 1),
    occurred_date: new Date(2026, 8, 20),
    project_id: 3,
    approved_by: "Jane Doe",
    archived: false,
    approval_notes: null,
    categories_of_harm: ["Economic Loss"],
  };

  it("keeps only changed updatable columns, normalised for writing", () => {
    expect(
      diffIncidentColumns(stored, {
        status: "Investigating",
        description: "Unchanged",
        project_id: "",
        approved_by: null,
        organization_id: 999, // not an updatable column
        incident_id: "INC-1", // not an updatable column
      }),
    ).toEqual({ status: "Investigating", project_id: null, approved_by: null });
  });

  it("compares dates as calendar dates, so the drawer's YYYY-MM-DD is unchanged", () => {
    expect(
      diffIncidentColumns(stored, {
        approval_date: "2026-10-01",
        occurred_date: "2026-09-20",
      }),
    ).toEqual({});
    expect(diffIncidentColumns(stored, { approval_date: "2026-10-02" })).toEqual({
      approval_date: "2026-10-02",
    });
  });

  it("treats '' and null as the same empty value and the same harm list as unchanged", () => {
    expect(
      diffIncidentColumns(stored, {
        approval_notes: "",
        categories_of_harm: ["Economic Loss"],
      }),
    ).toEqual({});
  });

  it("does not write a reordered harm category list", () => {
    expect(
      diffIncidentColumns(
        { categories_of_harm: ["Economic Loss", "Other"] },
        { categories_of_harm: ["Other", "Economic Loss"] },
      ),
    ).toEqual({});
  });

  it("never writes NULL to archived", () => {
    expect(diffIncidentColumns({ archived: true }, { archived: null })).toEqual({
      archived: false,
    });
    expect(diffIncidentColumns({ archived: false }, { archived: null })).toEqual({});
    expect(diffIncidentColumns({ archived: null }, { archived: undefined })).toEqual({});
  });
});

describe("validateIncidentReferences", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("treats '', null and undefined as no reference and runs no lookup", async () => {
    const invalid = await validateIncidentReferences(
      { project_id: "", model_inventory_id: null, assignee_id: undefined },
      1,
    );
    expect(invalid).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects anything that is not a positive integer id without running SQL", async () => {
    const invalid = await validateIncidentReferences(
      { project_id: "abc", model_inventory_id: 1.5, assignee_id: -3 },
      1,
    );
    expect(invalid.sort()).toEqual(["assignee_id", "model_inventory_id", "project_id"]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("accepts a numeric string id and looks it up as a number", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 7 }], 1]);
    await expect(validateIncidentReferences({ assignee_id: "7" }, 1)).resolves.toEqual([]);
    expect(mockQuery.mock.calls[0][1]).toMatchObject({
      replacements: { id: 7, organizationId: 1 },
    });
  });

  it("checks a real id inside the organization, on the given transaction", async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);
    const tx = {} as any;
    const invalid = await validateIncidentReferences({ project_id: 9 }, 1, tx);
    expect(invalid).toEqual(["project_id"]);
    expect(mockQuery.mock.calls[0][0]).toContain("organization_id = :organizationId");
    expect(mockQuery.mock.calls[0][1]).toEqual({
      replacements: { id: 9, organizationId: 1 },
      transaction: tx,
    });
  });
});

describe("updateIncidentByIdQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([{ id: 42 }]);
  });

  it("writes exactly the changed columns plus updated_at and does not run automations", async () => {
    const tx = {} as any;
    const result = await updateIncidentByIdQuery(
      42,
      { status: "Investigating", categories_of_harm: ["Other"], approval_date: null },
      1,
      tx,
    );

    expect(result).toEqual({ id: 42 });
    expect(mockQuery).toHaveBeenCalledTimes(2); // UPDATE + re-read, no automation lookup
    const [sql, { replacements, transaction }] = mockQuery.mock.calls[0];
    expect(sql).toMatch(
      /SET updated_at = :updated_at, status = :status, categories_of_harm = :categories_of_harm, approval_date = :approval_date\s+WHERE/,
    );
    expect(replacements).toMatchObject({
      status: "Investigating",
      categories_of_harm: JSON.stringify(["Other"]),
      approval_date: null,
      organizationId: 1,
      id: 42,
    });
    expect(transaction).toBe(tx);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

describe("enqueueIncidentUpdatedAutomations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("enqueues the first active incident_updated automation with old/new replacements", async () => {
    mockQuery.mockResolvedValueOnce([
      [
        {
          trigger_key: "incident_updated",
          action_key: "send_email",
          automation_id: 9,
          params: { subject: "Incident updated", body: "Changed" },
        },
      ],
      1,
    ]);
    const oldIncident = { status: "Closed" } as any;
    const newIncident = { dataValues: { status: "Investigating" } } as any;

    await enqueueIncidentUpdatedAutomations(1, oldIncident, newIncident);

    // Runs after commit, outside the update transaction.
    expect(mockQuery.mock.calls[0][1]).toEqual({ replacements: { organizationId: 1 } });
    expect(mockEnqueue).toHaveBeenCalledWith(
      "send_email",
      expect.objectContaining({ automation_id: 9, organizationId: 1 }),
    );
  });

  it("does nothing when the organization has no incident_updated automation", async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);
    await enqueueIncidentUpdatedAutomations(1, {} as any, { dataValues: {} } as any);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
