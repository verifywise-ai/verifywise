/**
 * useCaseRefusalForTool: the one use case check every advisor tool call goes
 * through (decision 7). Read tools get the read rule, write tools the write
 * rule; a child row id maps to its use case and must belong to the use case
 * the call names; a monitoring cycle's stakeholder passes on the cycle tools.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../utils/project.utils", () => ({
  getProjectAccessQuery: jest.fn(),
  getProjectReadAccessQuery: jest.fn(),
}));
jest.mock("../../utils/userPermission.utils", () => ({
  getUserRoleInOrganization: jest.fn(),
}));
jest.mock("../../utils/useCaseOfChild.utils", () => ({
  useCaseOfEuControl: jest.fn(),
  useCaseOfEuAnswer: jest.fn(),
  useCaseOfIso42001Subclause: jest.fn(),
  useCaseOfIso42001AnnexCategory: jest.fn(),
  useCaseOfIso27001Subclause: jest.fn(),
  useCaseOfIso27001AnnexControl: jest.fn(),
  useCaseOfNistSubcategory: jest.fn(),
}));
jest.mock("../../utils/pmmUseCaseAccess.utils", () => ({
  useCaseOfPmmCycle: jest.fn(),
  useCaseOfPmmConfig: jest.fn(),
  isStakeholderOfPmmCycle: jest.fn(),
  isStakeholderOfPmmConfig: jest.fn(),
}));

import { useCaseRefusalForTool } from "../functions/useCaseScope";
import * as projectUtils from "../../utils/project.utils";
import * as userPermission from "../../utils/userPermission.utils";
import * as child from "../../utils/useCaseOfChild.utils";
import * as pmm from "../../utils/pmmUseCaseAccess.utils";

type AsyncMock = jest.Mock<(...args: any[]) => Promise<any>>;
const writeAccess = projectUtils.getProjectAccessQuery as unknown as AsyncMock;
const readAccess = projectUtils.getProjectReadAccessQuery as unknown as AsyncMock;
const roleOf = userPermission.getUserRoleInOrganization as unknown as AsyncMock;
const euControl = child.useCaseOfEuControl as unknown as AsyncMock;
const cycle = pmm.useCaseOfPmmCycle as unknown as AsyncMock;
const stakeholder = pmm.isStakeholderOfPmmCycle as unknown as AsyncMock;

const ORG = 4;
const VIEWER = { userId: 9, role: "Editor" };

beforeEach(() => {
  jest.clearAllMocks();
  roleOf.mockResolvedValue({ id: 3, name: "Editor" });
  readAccess.mockResolvedValue("allowed");
  writeAccess.mockResolvedValue("allowed");
  stakeholder.mockResolvedValue(false);
});

describe("useCaseRefusalForTool", () => {
  it("applies the read rule to a read tool", async () => {
    expect(
      await useCaseRefusalForTool("get_x", { project_id: 12, _userId: 9 }, ORG, false),
    ).toBeNull();
    expect(readAccess).toHaveBeenCalledWith(12, VIEWER, ORG);
    expect(writeAccess).not.toHaveBeenCalled();
  });

  it("applies the write rule to a write tool", async () => {
    writeAccess.mockResolvedValue("denied");

    const refusal = await useCaseRefusalForTool(
      "agent_x",
      { project_id: 12, _userId: 9 },
      ORG,
      true,
    );

    expect(writeAccess).toHaveBeenCalledWith(12, VIEWER, ORG);
    expect(refusal).toBe("You do not have access to use case 12");
  });

  it("answers not found outside the organization", async () => {
    readAccess.mockResolvedValue("not_found");
    expect(await useCaseRefusalForTool("get_x", { projectId: 12, _userId: 9 }, ORG, false)).toBe(
      "Use case 12 not found",
    );
  });

  it("refuses without a user", async () => {
    expect(await useCaseRefusalForTool("get_x", { use_case_id: 12 }, ORG, false)).toBe(
      "You do not have access to use case 12",
    );
  });

  it("checks the use case of a child row the tool names", async () => {
    euControl.mockResolvedValue(30);
    writeAccess.mockResolvedValue("denied");

    const refusal = await useCaseRefusalForTool(
      "agent_save_eu_ai_act_control",
      { control_id: 5, _userId: 9 },
      ORG,
      true,
    );

    expect(euControl).toHaveBeenCalledWith(5, ORG, expect.anything());
    expect(writeAccess).toHaveBeenCalledWith(30, VIEWER, ORG);
    expect(refusal).toBe("You do not have access to use case 30");
  });

  it("refuses a child row of another use case than the one named", async () => {
    euControl.mockResolvedValue(30);

    const refusal = await useCaseRefusalForTool(
      "agent_save_eu_ai_act_control",
      { project_id: 12, control_id: 5, _userId: 9 },
      ORG,
      true,
    );

    expect(refusal).toBe("You do not have access to use case 12");
  });

  it("answers not found for a child row outside the organization", async () => {
    euControl.mockResolvedValue(null);

    expect(
      await useCaseRefusalForTool(
        "agent_save_eu_ai_act_control",
        { control_id: 5, _userId: 9 },
        ORG,
        true,
      ),
    ).toBe("control_id 5 not found");
  });

  it("lets a cycle's stakeholder submit without use case access", async () => {
    cycle.mockResolvedValue(30);
    writeAccess.mockResolvedValue("denied");
    stakeholder.mockResolvedValue(true);

    expect(
      await useCaseRefusalForTool(
        "agent_submit_pmm_responses",
        { cycle_id: 7, _userId: 9 },
        ORG,
        true,
      ),
    ).toBeNull();
    expect(stakeholder).toHaveBeenCalledWith(7, ORG, expect.objectContaining({ userId: 9 }));
  });

  it("does not let a stakeholder change the config", async () => {
    (pmm.useCaseOfPmmConfig as unknown as AsyncMock).mockResolvedValue(30);
    writeAccess.mockResolvedValue("denied");
    (pmm.isStakeholderOfPmmConfig as unknown as AsyncMock).mockResolvedValue(true);

    expect(
      await useCaseRefusalForTool(
        "agent_update_pmm_config",
        { config_id: 3, _userId: 9 },
        ORG,
        true,
      ),
    ).toBe("You do not have access to use case 30");
  });

  it("ignores ids a tool does not map, and tools that name no use case", async () => {
    expect(
      await useCaseRefusalForTool("get_x", { control_id: 5, limit: 3 }, ORG, false),
    ).toBeNull();
    expect(readAccess).not.toHaveBeenCalled();
  });
});
