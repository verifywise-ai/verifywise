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
import { NotFoundException } from "../../../domain.layer/exceptions/custom.exception";
import "../../functions/modelInventoryFunctions";
import "../../functions/modelRiskFunctions";
import { MODEL_LIFECYCLE_PHASE_REFUSAL } from "../../functions/modelInventoryFunctions";
import { MODEL_WRITE_REFUSED } from "../../functions/modelWriteScope";
import { writeToolExecutors } from "../../confirmation/createWriteTool";

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
  mockUpdate.mockResolvedValue({ id: 7 });
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
    expect(mockUpdate).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        status: "Approved",
        model: "GPT-5",
        provider_model: "OpenAI / GPT-5",
        status_date: expect.any(Date),
      }),
      {
        organizationId: ORG,
        userId: REQUESTER,
        callerIsAdmin: true,
        useCaseViewer: { userId: REQUESTER, role: "Admin" },
      },
    );
    expect(sequelize.query).not.toHaveBeenCalled();
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
    expect(mockUpdate).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ status: "Retired" }),
      editorCtx(CHATTER),
    );
    expect(result).toMatchObject({ status: "Retired" });
  });

  it("reports a model that is not there", async () => {
    mockGetModel.mockResolvedValue(null);
    expect(await run("agent_retire_model", { model_id: 7, _userId: CHATTER })).toEqual({
      success: false,
      message: "Model #7 not found",
    });
  });
});

describe("agent_update_model_lifecycle_phase", () => {
  it("refuses and writes nothing: a model has no lifecycle phase field", async () => {
    const result = await run("agent_update_model_lifecycle_phase", {
      model_id: 7,
      lifecycle_phase: "Approved",
      _userId: CHATTER,
    });
    expect(result).toEqual({ success: false, message: MODEL_LIFECYCLE_PHASE_REFUSAL });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(sequelize.query).not.toHaveBeenCalled();
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
});

describe("agent_link_model_to_project", () => {
  it("links through the service when the user may write to the use case", async () => {
    const result = await run("agent_link_model_to_project", {
      model_id: 7,
      project_id: 3,
      _userId: CHATTER,
    });
    expect(mockAccess).toHaveBeenCalledWith(3, { userId: CHATTER, role: "Editor" }, ORG);
    expect(mockLink).toHaveBeenCalledWith(7, 3, editorCtx(CHATTER));
    expect(result).toMatchObject({ model_id: 7, project_id: 3 });
  });

  it("refuses without write access to the use case", async () => {
    mockAccess.mockResolvedValue("denied");
    const result = await run("agent_link_model_to_project", {
      model_id: 7,
      project_id: 3,
      _userId: CHATTER,
    });
    expect(result).toEqual({ success: false, message: "You do not have access to use case #3" });
    expect(mockLink).not.toHaveBeenCalled();
  });

  it("refuses without useCase.edit", async () => {
    mockHas.mockImplementation(
      async (_o: number, _u: number, key: string) => key !== "useCase.edit",
    );
    const result = await run("agent_link_model_to_project", {
      model_id: 7,
      project_id: 3,
      _userId: CHATTER,
    });
    expect(result).toEqual({
      success: false,
      message: "Your role does not allow changing use cases",
    });
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
