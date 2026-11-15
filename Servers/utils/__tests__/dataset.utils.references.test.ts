import { describe, it, expect, beforeEach, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

import { sequelize } from "../../database/db";
import {
  assertDatasetReferencesInOrganization,
  createNewDatasetQuery,
  updateDatasetByIdQuery,
} from "../dataset.utils";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";
import { DatasetModel } from "../../domain.layer/models/dataset/dataset.model";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;
const transaction = {} as any;
const dataset = { name: "Claims", documentation_data: [] } as unknown as DatasetModel;

const writes = () =>
  mockQuery.mock.calls.filter((call) => /^\s*(INSERT|UPDATE|DELETE)/.test(String(call[0])));

describe("assertDatasetReferencesInOrganization", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("checks nothing when no model or use case is linked", async () => {
    await expect(assertDatasetReferencesInOrganization(1, [], [])).resolves.toBeUndefined();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects a model outside the organization", async () => {
    mockQuery.mockResolvedValueOnce([] as any);

    const attempt = assertDatasetReferencesInOrganization(1, [9], [], transaction);

    await expect(attempt).rejects.toBeInstanceOf(ValidationException);
    await expect(attempt).rejects.toThrow("Linked models must belong to this organization");
    const [sql, options] = mockQuery.mock.calls[0] as [string, any];
    expect(sql).toMatch(/FROM model_inventories WHERE organization_id = :organizationId/);
    expect(options.replacements).toEqual({ organizationId: 1, ids: [9] });
    expect(options.transaction).toBe(transaction);
  });

  it("rejects a use case outside the organization", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 3 }] as any).mockResolvedValueOnce([] as any);

    await expect(assertDatasetReferencesInOrganization(1, [3], [8])).rejects.toThrow(
      "Linked use cases must belong to this organization",
    );
    const [sql] = mockQuery.mock.calls[1] as [string, any];
    expect(sql).toMatch(/FROM projects WHERE organization_id = :organizationId/);
  });

  it.each([
    ["model", [2, 2.5], []],
    ["use case", [], ["7x"]],
    ["model given as an object", [{}], []],
  ])("rejects a malformed %s id without querying", async (_label, models, projects) => {
    await expect(
      assertDatasetReferencesInOrganization(1, models as unknown[], projects as unknown[]),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("passes the organization's own models and use cases, duplicates included", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 3 }] as any).mockResolvedValueOnce([{ id: 4 }] as any);

    await expect(assertDatasetReferencesInOrganization(1, [3, 3], [4])).resolves.toBeUndefined();
  });
});

describe("dataset writes check linked ids first", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("creates no dataset when a linked model is in another organization", async () => {
    mockQuery.mockResolvedValueOnce([] as any);

    await expect(createNewDatasetQuery(dataset, 1, [9], [], transaction)).rejects.toThrow(
      "Linked models must belong to this organization",
    );
    expect(writes()).toHaveLength(0);
  });

  it("updates nothing when a linked use case is in another organization", async () => {
    mockQuery.mockResolvedValueOnce([] as any);

    await expect(
      updateDatasetByIdQuery(5, dataset, [], [8], false, false, 1, transaction),
    ).rejects.toThrow("Linked use cases must belong to this organization");
    expect(writes()).toHaveLength(0);
  });
});
