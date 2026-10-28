import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn() },
}));
jest.mock("../../utils/risk.utils", () => ({
  getAllRisksQuery: jest.fn(),
  getRiskByIdQuery: jest.fn(),
  getRisksByProjectQuery: jest.fn(),
  // Real values: the tool builds a zod enum from these at module load.
  PROJECT_RISK_CATEGORIES: ["Operational risk", "Data privacy risk", "Legal risk"],
}));
jest.mock("../../services/risk.service", () => ({
  createRiskService: jest.fn(),
  updateRiskService: jest.fn(),
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueRiskLinkRecompute: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../services/inAppNotification.service", () => ({
  notifyUserAssigned: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/user.utils", () => ({
  getUserByIdQuery: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../scope", () => ({
  requireOrganization: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../frameworks", () => ({
  resolveFrameworkIds: jest.fn(),
}));

import { sequelize } from "../../database/db";
import { getAllRisksQuery, getRiskByIdQuery, getRisksByProjectQuery } from "../../utils/risk.utils";
import { createRiskService, updateRiskService } from "../../services/risk.service";
import { enqueueRiskLinkRecompute } from "../../services/automations/automationProducer";
import { notifyUserAssigned } from "../../services/inAppNotification.service";
import { getUserByIdQuery } from "../../utils/user.utils";
import { requireOrganization } from "../scope";
import { resolveFrameworkIds } from "../frameworks";
import { riskTools } from "../tools/risks";

const CALLER = { userId: 7, organizationId: null };

const tool = (name: string) => {
  const found = riskTools.find((t) => t.name === name);
  if (!found) throw new Error(`no tool named ${name}`);
  return found;
};
const payload = (res: any) => JSON.parse(res.content[0].text);

const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };
const mockCreate = createRiskService as unknown as jest.Mock;
const mockUpdate = updateRiskService as unknown as jest.Mock;
const mockGetById = getRiskByIdQuery as unknown as jest.Mock;
const mockResolve = resolveFrameworkIds as unknown as jest.Mock;
const mockNotify = notifyUserAssigned as unknown as jest.Mock;

const CREATE_ARGS = {
  organizationId: 3,
  name: "Screening bias",
  description: "Model favours one cohort",
  likelihood: "Possible",
  severity: "Major",
  riskOwner: 4,
  categories: ["Operational risk"],
  aiLifecyclePhase: "Deployment & integration",
  impact: "Unfair rejections",
};

beforeEach(() => {
  jest.clearAllMocks();
  (sequelize.transaction as unknown as jest.Mock).mockResolvedValue(mockTransaction as never);
  mockResolve.mockResolvedValue([] as never);
  mockCreate.mockResolvedValue({ id: 21, risk_name: "Screening bias", risk_owner: 4 } as never);
  (getUserByIdQuery as unknown as jest.Mock).mockResolvedValue({
    id: 7,
    name: "Grace",
    surname: "Hopper",
  } as never);
});

describe("list_risks", () => {
  it("lists the organization's risks when no use case is named", async () => {
    (getAllRisksQuery as unknown as jest.Mock).mockResolvedValue([{ id: 1 }] as never);

    const res = await tool("list_risks").handler({ organizationId: 3 }, CALLER);

    expect(getAllRisksQuery).toHaveBeenCalledWith(3, "active");
    expect(payload(res)).toMatchObject({ organizationId: 3, count: 1 });
  });

  it("narrows to one use case when given", async () => {
    (getRisksByProjectQuery as unknown as jest.Mock).mockResolvedValue([{ id: 9 }] as never);

    await tool("list_risks").handler({ organizationId: 3, useCaseId: 5 }, CALLER);

    expect(getRisksByProjectQuery).toHaveBeenCalledWith(5, 3, "active");
    expect(getAllRisksQuery).not.toHaveBeenCalled();
  });

  it("reports an empty list rather than failing when the query returns null", async () => {
    (getRisksByProjectQuery as unknown as jest.Mock).mockResolvedValue(null as never);

    const res = await tool("list_risks").handler({ organizationId: 3, useCaseId: 5 }, CALLER);

    expect(payload(res)).toMatchObject({ count: 0, risks: [] });
  });

  it("checks the organization before reading", async () => {
    (getAllRisksQuery as unknown as jest.Mock).mockResolvedValue([] as never);
    await tool("list_risks").handler({ organizationId: 3 }, CALLER);
    expect(requireOrganization).toHaveBeenCalledWith(3);
  });
});

describe("get_risk", () => {
  it("says which organization was searched when the risk is not there", async () => {
    mockGetById.mockResolvedValue(null as never);

    await expect(
      tool("get_risk").handler({ organizationId: 3, riskId: 21 }, CALLER),
    ).rejects.toThrow("No risk with id 21 in organization 3.");
  });
});

describe("create_risk", () => {
  /** The level is derived, never taken from the caller. */
  it("calculates the risk level from severity and likelihood", async () => {
    const res = await tool("create_risk").handler(CREATE_ARGS, CALLER);

    expect(mockCreate.mock.calls[0][0].risk_level_autocalculated).toBe("High risk");
    expect(payload(res).riskLevelCalculated).toBe("High risk");
  });

  it("takes no risk level from the caller", () => {
    expect(Object.keys(tool("create_risk").inputSchema)).not.toContain("riskLevel");
    expect(Object.keys(tool("create_risk").inputSchema)).not.toContain("riskLevelAutocalculated");
  });

  it("resolves framework names to the ids the junction stores", async () => {
    mockResolve.mockResolvedValue([1, 3] as never);

    await tool("create_risk").handler(
      { ...CREATE_ARGS, frameworks: ["EU AI Act", "ISO 27001"] },
      CALLER,
    );

    expect(mockResolve).toHaveBeenCalledWith(["EU AI Act", "ISO 27001"]);
    expect(mockCreate.mock.calls[0][0].frameworks).toEqual([1, 3]);
  });

  it("links the use cases it was given", async () => {
    await tool("create_risk").handler({ ...CREATE_ARGS, useCaseIds: [5, 6] }, CALLER);
    expect(mockCreate.mock.calls[0][0].projects).toEqual([5, 6]);
  });

  it("attributes the write to the authenticated caller", async () => {
    await tool("create_risk").handler(CREATE_ARGS, CALLER);
    expect(mockCreate.mock.calls[0][1]).toEqual({ userId: 7, organizationId: 3 });
  });

  it("commits, recomputes the risk links and tells the owner", async () => {
    await tool("create_risk").handler(CREATE_ARGS, CALLER);

    expect(mockTransaction.commit).toHaveBeenCalled();
    expect(enqueueRiskLinkRecompute).toHaveBeenCalledWith(3, 21);
    expect(mockNotify).toHaveBeenCalledWith(
      3,
      4,
      expect.objectContaining({ entityType: "project_risk", roleType: "Risk Owner" }),
      "Grace Hopper",
      expect.any(String),
      expect.any(Object),
    );
  });

  it("rolls back and does nothing after a failed write", async () => {
    mockCreate.mockRejectedValue(new Error("insert failed") as never);

    await expect(tool("create_risk").handler(CREATE_ARGS, CALLER)).rejects.toThrow("insert failed");
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(enqueueRiskLinkRecompute).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe("update_risk", () => {
  const existing = {
    id: 21,
    risk_name: "Screening bias",
    severity: "Major",
    likelihood: "Possible",
    risk_owner: 4,
    projects: [5],
    frameworks: [1],
  };

  beforeEach(() => {
    mockGetById.mockResolvedValue(existing as never);
    mockUpdate.mockResolvedValue({ id: 21, risk_name: "Renamed", risk_owner: 4 } as never);
  });

  it("sends only the fields given", async () => {
    await tool("update_risk").handler({ organizationId: 3, riskId: 21, name: "Renamed" }, CALLER);

    const sent = mockUpdate.mock.calls[0][1];
    expect(sent).toEqual({ risk_name: "Renamed" });
  });

  /** Changing one input must not leave the stored level describing the other. */
  it("recalculates against the stored likelihood when only severity changes", async () => {
    await tool("update_risk").handler({ organizationId: 3, riskId: 21, severity: "Minor" }, CALLER);

    // (likelihood x 1) + (severity x 3): the stored "Possible" is 3, "Minor" is
    // 2, so 3 + 6 = 9 -> Medium risk. Had the stored likelihood been dropped,
    // "Rare" would give 1 + 6 = 7 -> Low risk.
    expect(mockUpdate.mock.calls[0][1].risk_level_autocalculated).toBe("Medium risk");
  });

  it("recalculates against the stored severity when only likelihood changes", async () => {
    await tool("update_risk").handler(
      { organizationId: 3, riskId: 21, likelihood: "Rare" },
      CALLER,
    );

    // The stored "Major" is 4, "Rare" is 1, so 1 + 12 = 13 -> High risk. Had
    // the stored severity been dropped, 1 + 3 = 4 -> Very low risk.
    expect(mockUpdate.mock.calls[0][1].risk_level_autocalculated).toBe("High risk");
  });

  it("leaves the level alone when neither input is sent", async () => {
    await tool("update_risk").handler(
      { organizationId: 3, riskId: 21, mitigationPlan: "Retrain" },
      CALLER,
    );

    expect(mockUpdate.mock.calls[0][1]).not.toHaveProperty("risk_level_autocalculated");
  });

  it("rewrites the links only when a list is sent", async () => {
    await tool("update_risk").handler({ organizationId: 3, riskId: 21, name: "Renamed" }, CALLER);
    expect(mockUpdate.mock.calls[0][1]).not.toHaveProperty("projects");
    expect(mockUpdate.mock.calls[0][1]).not.toHaveProperty("frameworks");

    jest.clearAllMocks();
    mockGetById.mockResolvedValue(existing as never);
    mockUpdate.mockResolvedValue({ id: 21, risk_name: "Renamed" } as never);
    mockResolve.mockResolvedValue([2] as never);

    await tool("update_risk").handler(
      { organizationId: 3, riskId: 21, useCaseIds: [6], frameworks: ["ISO 42001"] },
      CALLER,
    );
    expect(mockUpdate.mock.calls[0][1].projects).toEqual([6]);
    expect(mockUpdate.mock.calls[0][1].frameworks).toEqual([2]);
  });

  it("counts a link-only change as a change", async () => {
    await tool("update_risk").handler({ organizationId: 3, riskId: 21, useCaseIds: [6] }, CALLER);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("refuses a call that would change nothing", async () => {
    await expect(
      tool("update_risk").handler({ organizationId: 3, riskId: 21 }, CALLER),
    ).rejects.toThrow("Provide at least one field to update.");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("tells a new owner, and no one when the owner did not change", async () => {
    await tool("update_risk").handler({ organizationId: 3, riskId: 21, riskOwner: 9 }, CALLER);
    expect(mockNotify).toHaveBeenCalled();

    jest.clearAllMocks();
    mockGetById.mockResolvedValue(existing as never);
    mockUpdate.mockResolvedValue({ id: 21, risk_name: "Renamed", risk_owner: 4 } as never);

    await tool("update_risk").handler({ organizationId: 3, riskId: 21, riskOwner: 4 }, CALLER);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("rolls back and says so when the row disappears mid-update", async () => {
    mockUpdate.mockResolvedValue(null as never);

    await expect(
      tool("update_risk").handler({ organizationId: 3, riskId: 21, name: "Renamed" }, CALLER),
    ).rejects.toThrow("Risk 21 was deleted while it was being updated.");
    expect(mockTransaction.rollback).toHaveBeenCalled();
  });

  it("does not open a transaction for a risk that is not there", async () => {
    mockGetById.mockResolvedValue(null as never);

    await expect(
      tool("update_risk").handler({ organizationId: 3, riskId: 21, name: "Renamed" }, CALLER),
    ).rejects.toThrow("No risk with id 21 in organization 3.");
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });
});
