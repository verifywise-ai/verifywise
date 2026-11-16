import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../utils/risk.utils");
jest.mock("../../../utils/search.utils", () => ({ wiseSearch: jest.fn() }));
jest.mock("../../../utils/riskVisibility.utils", () => ({
  ...(jest.requireActual("../../../utils/riskVisibility.utils") as object),
  riskViewerForUserQuery: jest.fn(),
}));
jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));

import * as riskUtils from "../../../utils/risk.utils";
import * as visibility from "../../../utils/riskVisibility.utils";
import { wiseSearch } from "../../../utils/search.utils";
import { sequelize } from "../../../database/db";
import { availableRiskTools } from "../../functions/riskFunctions";
import { availableSearchTools } from "../../functions/searchFunctions";
import "../../functions/policyLinkedObjectFunctions";
import { writeToolExecutors } from "../../confirmation/createWriteTool";

const mockViewer = visibility.riskViewerForUserQuery as jest.Mock<any>;
const mockAll = riskUtils.getAllRisksQuery as unknown as jest.Mock<any>;
const mockByProject = riskUtils.getRisksByProjectQuery as unknown as jest.Mock<any>;
const mockSearch = wiseSearch as unknown as jest.Mock<any>;
const mockQuery = sequelize.query as unknown as jest.Mock<any>;
const EDITOR = { userId: 9, role: "Editor" };

beforeEach(() => {
  jest.clearAllMocks();
  mockViewer.mockResolvedValue(EDITOR);
  mockAll.mockResolvedValue([]);
  mockByProject.mockResolvedValue([]);
  mockSearch.mockResolvedValue({});
  mockQuery.mockResolvedValue([]);
});

describe("advisor risk reads run as the chatting user", () => {
  it("fetch_risks reads the risks the user can see", async () => {
    await availableRiskTools.fetch_risks({ _userId: 9 }, 4);
    expect(mockViewer).toHaveBeenCalledWith(9, 4);
    expect(mockAll).toHaveBeenCalledWith(4, "active", EDITOR);
  });

  it("fetch_risks for one use case applies the use case rule for the user", async () => {
    await availableRiskTools.fetch_risks({ projectId: 3, _userId: 9 }, 4);
    expect(mockByProject).toHaveBeenCalledWith(3, 4, "active", EDITOR);
  });

  it("fails closed with no user", async () => {
    await availableRiskTools.fetch_risks({}, 4);
    expect(mockViewer).not.toHaveBeenCalled();
    expect(mockAll).toHaveBeenCalledWith(4, "active", visibility.UNKNOWN_RISK_VIEWER);
  });

  it("get_executive_summary names only the risks the user can see", async () => {
    await availableRiskTools.get_executive_summary({ _userId: 9 }, 4);
    expect(mockAll).toHaveBeenCalledWith(4, "active", EDITOR);
  });

  it("get_risk_analytics stays organization-wide: counts only (ruling J4)", async () => {
    await availableRiskTools.get_risk_analytics({ _userId: 9 }, 4);
    expect(mockAll).toHaveBeenCalledWith(4, "active", visibility.SYSTEM_RISK_VIEWER);
  });

  it.each(["global_search", "search_within_entity"])(
    "%s scopes risk results to the user",
    async (tool) => {
      await availableSearchTools[tool](
        { query: "bias", entity_type: "project_risks", _userId: 9 },
        4,
      );
      expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({ riskViewer: EDITOR }));
    },
  );
});

describe("agent_unlink_object_from_policy", () => {
  const execute = writeToolExecutors.get("agent_unlink_object_from_policy")!;
  const deleteCall = () =>
    mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("DELETE FROM policy_linked_objects"),
    )!;

  it("deletes nothing for a risk the acting user cannot see, like a missing link", async () => {
    const result = await execute(
      { policy_id: 2, object_type: "risk", object_id: 7, _userId: 9 },
      4,
    );
    const [sql, { replacements }] = deleteCall() as [string, any];
    expect(sql).toContain("rvid.id = policy_linked_objects.object_id");
    expect(sql).toContain("prv.risk_id = rvid.id");
    expect(replacements).toMatchObject({ organizationId: 4, visibilityUserId: 9 });
    expect(result).toMatchObject({ message: "Object unlinked from policy successfully" });
  });

  it("does not narrow for an Admin", async () => {
    mockViewer.mockResolvedValue({ userId: 9, role: "Admin" });
    await execute({ policy_id: 2, object_type: "risk", object_id: 7, _userId: 9 }, 4);
    expect(String(deleteCall()[0])).not.toContain("rvid");
  });

  it("does not apply the risk rule to evidence", async () => {
    await execute({ policy_id: 2, object_type: "evidence", object_id: 7, _userId: 9 }, 4);
    expect(mockViewer).not.toHaveBeenCalled();
    expect(String(deleteCall()[0])).not.toContain("rvid");
  });
});

describe("agent_update_risk", () => {
  const execute = writeToolExecutors.get("agent_update_risk")!;
  const mockUpdate = riskUtils.updateRiskByIdQuery as unknown as jest.Mock<any>;
  const tx = { commit: jest.fn(), rollback: jest.fn() };

  beforeEach(() => {
    (sequelize.transaction as unknown as jest.Mock<any>).mockResolvedValue(tx);
  });

  it("answers a missing or hidden risk with Risk not found, as the query wrote nothing", async () => {
    mockUpdate.mockResolvedValue(null);
    await expect(execute({ risk_id: 7, risk_name: "x", _userId: 9 }, 4)).rejects.toThrow(
      "Risk not found",
    );
    expect(mockUpdate).toHaveBeenCalledWith(7, { risk_name: "x" }, 4, tx, { viewer: EDITOR });
    expect(tx.rollback).toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it("commits when the risk was updated", async () => {
    mockUpdate.mockResolvedValue({ id: 7 });
    await expect(execute({ risk_id: 7, risk_name: "x", _userId: 9 }, 4)).resolves.toMatchObject({
      updated: true,
    });
    expect(tx.commit).toHaveBeenCalled();
  });
});
