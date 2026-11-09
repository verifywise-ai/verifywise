import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../utils/vendor.utils", () => ({ getAllVendorsQuery: jest.fn() }));
jest.mock("../../utils/policyManager.utils", () => ({ getAllPoliciesQuery: jest.fn() }));
jest.mock("../../utils/modelInventory.utils", () => ({ getAllModelInventoriesQuery: jest.fn() }));
jest.mock("../../utils/trainingRegistar.utils", () => ({
  getAllTrainingRegistarQuery: jest.fn(),
}));
jest.mock("../../utils/dataset.utils", () => ({ getAllDatasetsQuery: jest.fn() }));
jest.mock("../../utils/task.utils", () => ({ getTasksQuery: jest.fn() }));
jest.mock("../scope", () => ({
  requireOrganization: jest.fn<any>().mockResolvedValue(undefined),
}));

import { getAllVendorsQuery } from "../../utils/vendor.utils";
import { getAllPoliciesQuery } from "../../utils/policyManager.utils";
import { getAllModelInventoriesQuery } from "../../utils/modelInventory.utils";
import { getAllTrainingRegistarQuery } from "../../utils/trainingRegistar.utils";
import { getAllDatasetsQuery } from "../../utils/dataset.utils";
import { getTasksQuery } from "../../utils/task.utils";
import { requireOrganization } from "../scope";
import { vendorTools } from "../tools/vendors";
import { policyTools } from "../tools/policies";
import { modelTools } from "../tools/models";
import { trainingTools } from "../tools/trainings";
import { datasetTools } from "../tools/datasets";
import { taskTools } from "../tools/tasks";

const CALLER = { userId: 7, organizationId: 3, role: "Admin", isSuperAdmin: false };
const payload = (res: any) => JSON.parse(res.content[0].text);
const safe = (fields: object) => ({ toSafeJSON: () => fields });

describe("mcp list tools", () => {
  beforeEach(() => jest.clearAllMocks());

  /** Vendors, policies and trainings: the console returns the query's rows as they are. */
  it.each([
    ["list_vendors", vendorTools, getAllVendorsQuery, "vendors"],
    ["list_policies", policyTools, getAllPoliciesQuery, "policies"],
    ["list_trainings", trainingTools, getAllTrainingRegistarQuery, "trainings"],
  ])("%s returns the organization's rows", async (_name, tools, query, key) => {
    (query as jest.Mock<any>).mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const res = await tools[0].handler({ organizationId: 3 }, CALLER);
    expect(requireOrganization).toHaveBeenCalledWith(3);
    expect(query).toHaveBeenCalledWith(3);
    expect(payload(res)).toEqual({ organizationId: 3, count: 2, [key]: [{ id: 1 }, { id: 2 }] });
  });

  /** Models and datasets: the console answers with toSafeJSON, which carries the linked ids. */
  it.each([
    ["list_models", modelTools, getAllModelInventoriesQuery, "models"],
    ["list_datasets", datasetTools, getAllDatasetsQuery, "datasets"],
  ])("%s returns each row through toSafeJSON", async (_name, tools, query, key) => {
    (query as jest.Mock<any>).mockResolvedValue([safe({ id: 1, projects: [5] })]);
    const res = await tools[0].handler({ organizationId: 3 }, CALLER);
    expect(query).toHaveBeenCalledWith(3);
    expect(payload(res)).toEqual({
      organizationId: 3,
      count: 1,
      [key]: [{ id: 1, projects: [5] }],
    });
  });

  /** The role decides visibility in the query; an Admin's sees the whole organization. */
  it("list_tasks queries as the caller and adds assignees and linked entities", async () => {
    (getTasksQuery as jest.Mock<any>).mockResolvedValue([
      {
        toJSON: () => ({ id: 9, title: "Review vendor" }),
        dataValues: { assignees: [4], entity_links: [{ entity_type: "vendor", entity_id: 2 }] },
      },
      { toJSON: () => ({ id: 10, title: "No links" }), dataValues: {} },
    ]);
    const res = await taskTools[0].handler({ organizationId: 3 }, CALLER);
    expect(getTasksQuery).toHaveBeenCalledWith({ userId: 7, role: "Admin" }, 3);
    expect(payload(res).tasks).toEqual([
      {
        id: 9,
        title: "Review vendor",
        assignees: [4],
        entity_links: [{ entity_type: "vendor", entity_id: 2 }],
      },
      { id: 10, title: "No links", assignees: [], entity_links: [] },
    ]);
  });
});
