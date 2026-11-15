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
    await expect(assertDatasetReferencesInOrganization(1, [], [])).resolves.toEqual({
      models: [],
      projects: [],
    });
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

  it("passes the organization's own models and use cases and returns them without duplicates", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 3 }] as any).mockResolvedValueOnce([{ id: 4 }] as any);

    await expect(assertDatasetReferencesInOrganization(1, [3, 3], [4])).resolves.toEqual({
      models: [3],
      projects: [4],
    });
  });

  it("drops 0 and null entries as no link", async () => {
    await expect(assertDatasetReferencesInOrganization(1, [0], [null])).resolves.toEqual({
      models: [],
      projects: [],
    });
    expect(mockQuery).not.toHaveBeenCalled();
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

describe("dataset writes link the normalized ids", () => {
  const linkInserts = (table: string) =>
    mockQuery.mock.calls.filter((call) => String(call[0]).includes(`INSERT INTO ${table}`));

  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockImplementation((async (sql: string) => {
      if (/^\s*SELECT id FROM model_inventories/.test(sql)) return [{ id: 5 }];
      if (/^\s*SELECT id FROM projects/.test(sql)) return [{ id: 6 }];
      return [{ id: 11, dataValues: {} }];
    }) as any);
  });

  it.each([
    ["0", [0]],
    ["null", [null]],
  ])(
    "creates a dataset with a %s model and use case without linking either",
    async (_label, ids) => {
      const created = await createNewDatasetQuery(
        dataset,
        1,
        ids as unknown as number[],
        ids as unknown as number[],
        transaction,
      );

      expect(linkInserts("dataset_model_inventories")).toHaveLength(0);
      expect(linkInserts("dataset_projects")).toHaveLength(0);
      expect((created.dataValues as any).models).toEqual([]);
      expect((created.dataValues as any).projects).toEqual([]);
    },
  );

  it("links a repeated model and use case once on create", async () => {
    const created = await createNewDatasetQuery(dataset, 1, [5, 5], [6, 6], transaction);

    expect(linkInserts("dataset_model_inventories")).toHaveLength(1);
    expect(linkInserts("dataset_projects")).toHaveLength(1);
    expect((created.dataValues as any).models).toEqual([5]);
    expect((created.dataValues as any).projects).toEqual([6]);
  });

  it("links a repeated model once on update", async () => {
    const updated = await updateDatasetByIdQuery(
      11,
      dataset,
      [5, 5],
      [],
      false,
      false,
      1,
      transaction,
    );

    expect(linkInserts("dataset_model_inventories")).toHaveLength(1);
    expect((updated.dataValues as any).models).toEqual([5]);
  });

  it("clears the links without inserting when an update sends only 0 or null", async () => {
    const updated = await updateDatasetByIdQuery(
      11,
      dataset,
      [0] as number[],
      [null] as unknown as number[],
      false,
      false,
      1,
      transaction,
    );

    expect(linkInserts("dataset_model_inventories")).toHaveLength(0);
    expect(linkInserts("dataset_projects")).toHaveLength(0);
    expect((updated.dataValues as any).models).toEqual([]);
  });
});
