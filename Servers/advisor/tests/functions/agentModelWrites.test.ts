import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));
jest.mock("../../../utils/modelInventory.utils");
jest.mock("../../../utils/project.utils");
jest.mock("../../../utils/userPermission.utils");
jest.mock("../../../utils/organizationAdmin.utils");
jest.mock("../../../services/modelInventory.service");
jest.mock("../../../services/modelRisk.service");

import { sequelize } from "../../../database/db";
import * as modelUtils from "../../../utils/modelInventory.utils";
import * as projectUtils from "../../../utils/project.utils";
import * as permissions from "../../../utils/userPermission.utils";
import * as admin from "../../../utils/organizationAdmin.utils";
import * as modelService from "../../../services/modelInventory.service";
import * as riskService from "../../../services/modelRisk.service";
import { ModelApprovalForbiddenError } from "../../../utils/modelApproval.utils";
import {
  ForbiddenException,
  NotFoundException,
} from "../../../domain.layer/exceptions/custom.exception";
import "../../functions/modelInventoryFunctions";
import { availableModelRiskTools } from "../../functions/modelRiskFunctions";
import { MODEL_WRITE_REFUSED } from "../../functions/modelWriteScope";
import { writeToolExecutors } from "../../confirmation/createWriteTool";
import { availableModelInventoryTools } from "../../functions/modelInventoryFunctions";
import { toolsDefinition as modelInventoryTools } from "../../tools/modelInventoryTools";

const ORG = 4;
const CHATTER = 9;
const REQUESTER = 5;

const run = (tool: string, params: Record<string, unknown>) =>
  writeToolExecutors.get(tool)!(params, ORG) as Promise<any>;

const mockRole = permissions.getUserRoleInOrganization as unknown as jest.Mock<any>;
const mockHas = permissions.userHasPermission as unknown as jest.Mock<any>;
const mockAdmin = admin.roleIsOrganizationAdmin as unknown as jest.Mock<any>;
const mockGetModel = modelUtils.getModelInventoryByIdQuery as unknown as jest.Mock<any>;
const mockUpdate = modelService.updateModelInventoryService as unknown as jest.Mock<any>;
const mockDelete = modelService.deleteModelInventoryService as unknown as jest.Mock<any>;
const mockLink = modelService.linkModelToUseCaseService as unknown as jest.Mock<any>;
const mockAccess = projectUtils.getProjectAccessQuery as unknown as jest.Mock<any>;
const mockRiskCreate = riskService.createModelRiskService as unknown as jest.Mock<any>;
const mockRiskUpdate = riskService.updateModelRiskService as unknown as jest.Mock<any>;
const mockRiskDelete = riskService.deleteModelRiskService as unknown as jest.Mock<any>;

const editorCtx = (userId: number) => ({
  organizationId: ORG,
  userId,
  callerIsAdmin: false,
  useCaseViewer: { userId, role: "Editor" },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRole.mockResolvedValue({ id: 3, name: "Editor" });
  mockHas.mockResolvedValue(true);
  mockAdmin.mockResolvedValue(false);
  mockGetModel.mockResolvedValue({ id: 7, provider: "OpenAI", model: "GPT" });
  // The service hands its builder the row it locked.
  mockUpdate.mockImplementation(async (_id: number, input: any) => {
    if (typeof input === "function") input({ id: 7, provider: "OpenAI", model: "GPT" });
    return { id: 7 };
  });
  mockLink.mockResolvedValue(true);
  mockAccess.mockResolvedValue("write");
  mockRiskCreate.mockResolvedValue({ id: 11 });
  mockRiskUpdate.mockResolvedValue({ id: 11 });
  mockRiskDelete.mockResolvedValue(true);
});

describe("agent_update_model", () => {
  it("writes through the model service as the requester, with their Admin status", async () => {
    mockAdmin.mockResolvedValue(true);
    mockRole.mockResolvedValue({ id: 1, name: "Admin" });
    const result = await run("agent_update_model", {
      model_id: 7,
      status: "Approved",
      name: "GPT-5",
      _userId: CHATTER,
      _requesterId: REQUESTER,
    });
    expect(result).toMatchObject({ updated: true });
    expect(mockAdmin).toHaveBeenCalledWith(ORG, "Admin");
    expect(mockUpdate).toHaveBeenCalledWith(7, expect.any(Function), {
      organizationId: ORG,
      userId: REQUESTER,
      callerIsAdmin: true,
      useCaseViewer: { userId: REQUESTER, role: "Admin" },
    });
    expect(mockUpdate.mock.calls[0][1]({ provider: "OpenAI", model: "GPT" })).toMatchObject({
      status: "Approved",
      model: "GPT-5",
      provider_model: "OpenAI / GPT-5",
      status_date: expect.any(Date),
    });
    expect(sequelize.query).not.toHaveBeenCalled();
  });

  // Item 4: no unlocked read before the save; provider_model comes from the
  // row the service locked, so a rename in between is kept.
  it("builds provider_model from the service's locked row, with no read of its own", async () => {
    await run("agent_update_model", { model_id: 7, name: "GPT-5", _userId: CHATTER });
    expect(mockGetModel).not.toHaveBeenCalled();
    const build = mockUpdate.mock.calls[0][1];
    expect(build({ provider: "Renamed", model: "GPT" })).toMatchObject({
      provider_model: "Renamed / GPT-5",
    });
  });

  it("reports a refused approval as the tool's failure, not a throw", async () => {
    mockUpdate.mockRejectedValue(new ModelApprovalForbiddenError());
    const result = await run("agent_update_model", {
      model_id: 7,
      status: "Approved",
      _userId: CHATTER,
    });
    expect(result).toEqual({
      success: false,
      message: "Only the model's approver or an Admin can change its approval.",
    });
  });

  it("refuses a user without model.edit and writes nothing", async () => {
    mockHas.mockResolvedValue(false);
    const result = await run("agent_update_model", { model_id: 7, version: "2", _userId: CHATTER });
    expect(result).toEqual({ success: false, message: MODEL_WRITE_REFUSED });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("fails closed with no acting user", async () => {
    const result = await run("agent_update_model", { model_id: 7, version: "2" });
    expect(result).toEqual({ success: false, message: MODEL_WRITE_REFUSED });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("agent_retire_model", () => {
  it("sets the real Retired status through the service", async () => {
    const result = await run("agent_retire_model", { model_id: 7, _userId: CHATTER });
    expect(mockUpdate).toHaveBeenCalledWith(7, expect.any(Function), editorCtx(CHATTER));
    expect(mockUpdate.mock.calls[0][1]({})).toMatchObject({ status: "Retired" });
    expect(result).toMatchObject({ status: "Retired" });
  });

  it("reports a model that is not there", async () => {
    mockUpdate.mockResolvedValue(null);
    expect(await run("agent_retire_model", { model_id: 7, _userId: CHATTER })).toEqual({
      success: false,
      message: "Model #7 not found",
    });
  });
});

// Item 5: the tool only ever refused, after a human had confirmed it.
describe("agent_update_model_lifecycle_phase", () => {
  it("is gone: no definition, no tool function, no executor", () => {
    const names = (modelInventoryTools as Array<{ function: { name: string } }>).map(
      (t) => t.function.name,
    );
    expect(names).not.toContain("agent_update_model_lifecycle_phase");
    expect(availableModelInventoryTools).not.toHaveProperty("agent_update_model_lifecycle_phase");
    expect(writeToolExecutors.has("agent_update_model_lifecycle_phase")).toBe(false);
  });
});

describe("agent_delete_model", () => {
  it("deletes through the service, archiving the risks, and reports a refusal", async () => {
    await run("agent_delete_model", { model_id: 7, _userId: CHATTER });
    expect(mockDelete).toHaveBeenCalledWith(7, { deleteRisks: true }, editorCtx(CHATTER));
    mockDelete.mockRejectedValue(new NotFoundException("Model inventory not found"));
    expect(await run("agent_delete_model", { model_id: 7, _userId: CHATTER })).toEqual({
      success: false,
      message: "Model inventory not found",
    });
  });

  it("reports the service's approval refusal (a model with another approver)", async () => {
    mockDelete.mockRejectedValue(new ModelApprovalForbiddenError());
    expect(await run("agent_delete_model", { model_id: 7, _userId: CHATTER })).toEqual({
      success: false,
      message: "Only the model's approver or an Admin can change its approval.",
    });
  });
});

describe("agent_link_model_to_project", () => {
  // Item 3: one check, the console's: model.edit here, use case write access
  // in the service (with the use case viewer in the context).
  it("links through the service, which checks use case write access", async () => {
    const result = await run("agent_link_model_to_project", {
      model_id: 7,
      project_id: 3,
      _userId: CHATTER,
    });
    expect(mockLink).toHaveBeenCalledWith(7, 3, editorCtx(CHATTER));
    expect(mockAccess).not.toHaveBeenCalled();
    expect(result).toMatchObject({ model_id: 7, project_id: 3 });
  });

  it("does not ask for useCase.edit, which the console does not ask for", async () => {
    mockHas.mockImplementation(
      async (_o: number, _u: number, key: string) => key !== "useCase.edit",
    );
    const result = await run("agent_link_model_to_project", {
      model_id: 7,
      project_id: 3,
      _userId: CHATTER,
    });
    expect(mockHas).not.toHaveBeenCalledWith(ORG, CHATTER, "useCase.edit");
    expect(mockLink).toHaveBeenCalled();
    expect(result).toMatchObject({ model_id: 7, project_id: 3 });
  });

  it("reports the service's refusal for a use case the user cannot write to", async () => {
    mockLink.mockRejectedValue(new ForbiddenException("Access denied", "project", "link"));
    const result = await run("agent_link_model_to_project", {
      model_id: 7,
      project_id: 3,
      _userId: CHATTER,
    });
    expect(result).toEqual({ success: false, message: "Access denied" });
  });

  it("refuses without model.edit", async () => {
    mockHas.mockResolvedValue(false);
    const result = await run("agent_link_model_to_project", {
      model_id: 7,
      project_id: 3,
      _userId: CHATTER,
    });
    expect(result).toEqual({ success: false, message: MODEL_WRITE_REFUSED });
    expect(mockLink).not.toHaveBeenCalled();
  });
});

describe("model risk writes", () => {
  it("suggests a risk through the service as the requester (approved card)", async () => {
    await run("agent_suggest_model_risk", {
      risk_name: "Drift",
      risk_category: "Performance",
      risk_level: "High",
      owner: 12,
      _userId: CHATTER,
      _requesterId: REQUESTER,
    });
    expect(mockRiskCreate).toHaveBeenCalledWith(
      expect.objectContaining({ risk_name: "Drift", owner: 12 }),
      editorCtx(REQUESTER),
    );
  });

  // Decision 10: approvals filed before the likelihood list still execute.
  it("runs a suggestion filed with a free-text likelihood, keeping the text", async () => {
    await run("agent_suggest_model_risk", {
      risk_name: "Drift",
      description: "Seen in March",
      risk_level: "High",
      likelihood: "High",
      _userId: CHATTER,
    });
    expect(mockRiskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        likelihood: null,
        risk_level: "High",
        description: "Seen in March\n\nPrevious likelihood: High",
      }),
      editorCtx(CHATTER),
    );
  });

  it("runs an update filed with a free-text likelihood, appending it to the stored description", async () => {
    (sequelize.query as unknown as jest.Mock<any>).mockResolvedValueOnce([
      { description: "Stored text" },
    ]);
    await run("agent_update_model_risk", {
      model_risk_id: 11,
      likelihood: "High",
      _userId: CHATTER,
    });
    expect(mockRiskUpdate).toHaveBeenLastCalledWith(
      11,
      { description: "Stored text\n\nPrevious likelihood: High" },
      editorCtx(CHATTER),
    );
    await run("agent_update_model_risk", {
      model_risk_id: 11,
      likelihood: "likely",
      _userId: CHATTER,
    });
    expect(mockRiskUpdate).toHaveBeenLastCalledWith(
      11,
      { likelihood: "Likely" },
      editorCtx(CHATTER),
    );
  });

  it("refuses a stored suggestion with neither likelihood and severity nor a level", async () => {
    await expect(
      run("agent_suggest_model_risk", {
        risk_name: "Drift",
        likelihood: "Likely",
        _userId: CHATTER,
      }),
    ).rejects.toThrow(/no likelihood and severity and no risk level/);
    expect(mockRiskCreate).not.toHaveBeenCalled();
  });

  it("asks a new suggestion for both likelihood and severity", async () => {
    await expect(
      availableModelRiskTools.agent_suggest_model_risk(
        { risk_name: "Drift", risk_level: "High", _userId: CHATTER },
        ORG,
      ),
    ).rejects.toThrow(/likelihood and severity are both required/);
  });

  it("updates, changes status, attaches and detaches through the service", async () => {
    await run("agent_update_model_risk", { model_risk_id: 11, owner: 12, _userId: CHATTER });
    expect(mockRiskUpdate).toHaveBeenLastCalledWith(11, { owner: 12 }, editorCtx(CHATTER));
    await run("agent_change_model_risk_status", {
      model_risk_id: 11,
      status: "Resolved",
      _userId: CHATTER,
    });
    expect(mockRiskUpdate).toHaveBeenLastCalledWith(11, { status: "Resolved" }, editorCtx(CHATTER));
    (sequelize.query as unknown as jest.Mock<any>).mockResolvedValueOnce([[{ id: 7 }], 1]);
    await run("agent_attach_model_risk_to_model", {
      model_risk_id: 11,
      model_id: 7,
      _userId: CHATTER,
    });
    expect(mockRiskUpdate).toHaveBeenLastCalledWith(11, { model_id: 7 }, editorCtx(CHATTER));
    await run("agent_detach_model_risk_from_model", { model_risk_id: 11, _userId: CHATTER });
    expect(mockRiskUpdate).toHaveBeenLastCalledWith(11, { model_id: null }, editorCtx(CHATTER));
  });

  it("deletes through the service", async () => {
    await run("agent_delete_model_risk", { model_risk_id: 11, _userId: CHATTER });
    expect(mockRiskDelete).toHaveBeenCalledWith(11, editorCtx(CHATTER));
  });

  it("refuses a user without model.edit", async () => {
    mockHas.mockResolvedValue(false);
    expect(
      await run("agent_change_model_risk_status", {
        model_risk_id: 11,
        status: "Resolved",
        _userId: CHATTER,
      }),
    ).toEqual({ success: false, message: MODEL_WRITE_REFUSED });
    expect(mockRiskUpdate).not.toHaveBeenCalled();
  });
});
