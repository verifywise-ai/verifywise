import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));
jest.mock("../../../utils/userPermission.utils", () => ({
  getUserRoleInOrganization: jest.fn(),
}));
jest.mock("../../../utils/rolePermissions.utils", () => ({
  roleInfoHasPermission: jest.fn(),
}));
jest.mock("../../approval/approvalGateway", () => ({
  submitForApproval: jest.fn(),
}));
jest.mock("../../../services/vendor.service", () => ({
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));
jest.mock("../../../services/vendorRisk.service", () => ({
  createVendorRisk: jest.fn(),
  updateVendorRisk: jest.fn(),
  deleteVendorRisk: jest.fn(),
}));
jest.mock("../../../utils/vendor.utils", () => ({
  getAllVendorsQuery: jest.fn(),
  getVendorByIdQuery: jest.fn(),
}));
jest.mock("../../../utils/vendorRisk.utils", () => ({
  getAllVendorRisksAllProjectsQuery: jest.fn(),
  getVendorRiskByIdQuery: jest.fn(),
}));

import { sequelize } from "../../../database/db";
import { getUserRoleInOrganization } from "../../../utils/userPermission.utils";
import { roleInfoHasPermission } from "../../../utils/rolePermissions.utils";
import { submitForApproval } from "../../approval/approvalGateway";
import * as vendors from "../../../services/vendor.service";
import * as vendorRisks from "../../../services/vendorRisk.service";
import { getVendorByIdQuery } from "../../../utils/vendor.utils";
import { getVendorRiskByIdQuery } from "../../../utils/vendorRisk.utils";
import {
  BusinessLogicException,
  ValidationException,
} from "../../../domain.layer/exceptions/custom.exception";
import { availableVendorTools } from "../../functions/vendorFunctions";
import { writeToolExecutors } from "../../confirmation/createWriteTool";
import { toolsDefinition } from "../../tools/vendorTools";

const ORG = 4;
const REQUESTER = 5;
const APPROVER = 9;
const EDITOR = { id: 3, name: "Editor", organizationId: null };
const AUDITOR = { id: 4, name: "Auditor", organizationId: null };

const mockRole = getUserRoleInOrganization as unknown as jest.Mock<any>;
const mockHas = roleInfoHasPermission as unknown as jest.Mock<any>;
const mockSubmit = submitForApproval as unknown as jest.Mock<any>;
const mockVendorById = getVendorByIdQuery as unknown as jest.Mock<any>;
const mockRiskById = getVendorRiskByIdQuery as unknown as jest.Mock<any>;
const mockCreateVendor = vendors.createVendor as unknown as jest.Mock<any>;
const mockUpdateVendor = vendors.updateVendor as unknown as jest.Mock<any>;
const mockDeleteVendor = vendors.deleteVendor as unknown as jest.Mock<any>;
const mockCreateRisk = vendorRisks.createVendorRisk as unknown as jest.Mock<any>;
const mockUpdateRisk = vendorRisks.updateVendorRisk as unknown as jest.Mock<any>;
const mockDeleteRisk = vendorRisks.deleteVendorRisk as unknown as jest.Mock<any>;

/** The executor as the gateway runs it, after approval, for REQUESTER. */
const run = (tool: string, params: Record<string, unknown>) =>
  writeToolExecutors.get(tool)!(
    { ...params, _requesterId: REQUESTER, _userId: APPROVER },
    ORG,
  ) as Promise<any>;

/** The tool as the model calls it: checks, then the approval step. */
const call = (tool: string, params: Record<string, unknown>) =>
  availableVendorTools[tool]({ ...params, _userId: REQUESTER }, ORG) as Promise<any>;

const schemaOf = (name: string) =>
  toolsDefinition.find((tool) => tool.function.name === name)!.function.parameters as any;

const NEW_VENDOR = {
  vendor_name: "Model host",
  description: "Hosted language models",
  website: "https://example.com",
  contact_person: "Ada Lovelace",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRole.mockResolvedValue(EDITOR);
  mockHas.mockImplementation(async (_org: any, role: any) => role.name !== "Auditor");
  mockSubmit.mockResolvedValue({ outcome: "pending", confirmationResult: { pending: true } });
  mockVendorById.mockResolvedValue({ id: 1, vendor_name: "Model host" });
  mockRiskById.mockResolvedValue({ id: 2, vendor_id: 1 });
  mockCreateVendor.mockResolvedValue({ id: 1, vendor_name: "Model host" });
  mockUpdateVendor.mockResolvedValue({
    id: 1,
    vendor_name: "Model host",
    review_status: "In review",
  });
  mockDeleteVendor.mockResolvedValue(true);
  mockCreateRisk.mockResolvedValue({ id: 2, vendor_id: 1 });
  mockUpdateRisk.mockResolvedValue({ id: 2, vendor_id: 1 });
  mockDeleteRisk.mockResolvedValue(true);
});

describe("vendor write tools act as the user who asked, with vendor.edit", () => {
  const writes: [string, Record<string, unknown>][] = [
    ["agent_create_vendor", NEW_VENDOR],
    ["agent_update_vendor", { vendor_id: 1, review_status: "In review" }],
    ["agent_delete_vendor", { vendor_id: 1 }],
    ["agent_create_vendor_risk", { vendor_id: 1, risk_name: "Outage" }],
    ["agent_update_vendor_risk", { vendor_risk_id: 2, severity: "Major" }],
    ["agent_delete_vendor_risk", { vendor_risk_id: 2 }],
    ["agent_flag_vendor_for_review", { vendor_id: 1, reason: "Contract lapsed" }],
  ];

  it.each(writes)("%s refuses an Auditor before asking for approval", async (tool, params) => {
    mockRole.mockResolvedValue(AUDITOR);
    const result = await call(tool, params);
    expect(result).toEqual({
      success: false,
      message: expect.stringContaining("your role does not allow editing vendors"),
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it.each(writes)("%s refuses again when it runs, writing nothing", async (tool, params) => {
    mockRole.mockResolvedValue(AUDITOR);
    const result = await run(tool, params);
    expect(result.success).toBe(false);
    for (const write of [
      mockCreateVendor,
      mockUpdateVendor,
      mockDeleteVendor,
      mockCreateRisk,
      mockUpdateRisk,
      mockDeleteRisk,
    ]) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it.each(writes)("%s refuses a user who is not a member", async (tool, params) => {
    mockRole.mockResolvedValue(undefined);
    expect((await run(tool, params)).success).toBe(false);
  });

  it.each(writes)("%s asks for approval when the user may edit vendors", async (tool, params) => {
    await call(tool, params);
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockRole).toHaveBeenCalledWith(ORG, REQUESTER);
  });

  it("checks the requester's role at execution, not the approver's", async () => {
    await run("agent_delete_vendor", { vendor_id: 1 });
    expect(mockRole).toHaveBeenCalledWith(ORG, REQUESTER);
    expect(mockDeleteVendor).toHaveBeenCalledWith(1, {
      userId: REQUESTER,
      role: "Editor",
      organizationId: ORG,
    });
  });

  it("never sends SQL of its own", async () => {
    for (const [tool, params] of writes) await run(tool, params);
    expect(sequelize.query).not.toHaveBeenCalled();
  });
});

describe("agent_create_vendor", () => {
  it("creates through the vendor service with the console's field names", async () => {
    const result = await run("agent_create_vendor", {
      ...NEW_VENDOR,
      criticality_level: "High (critical to core services or products)",
      project_id: 12,
    });
    expect(result).toEqual({
      success: true,
      id: 1,
      vendor_name: "Model host",
      linked_use_case_ids: [],
    });
    expect(mockCreateVendor).toHaveBeenCalledWith(
      {
        vendor_name: "Model host",
        vendor_provides: "Hosted language models",
        website: "https://example.com",
        vendor_contact_person: "Ada Lovelace",
        business_criticality: "High (critical to core services or products)",
        review_status: "Not started",
        assignee: REQUESTER,
        projects: [12],
      },
      { userId: REQUESTER, role: "Editor", organizationId: ORG },
    );
  });

  it("keeps an assignee the request names", async () => {
    await run("agent_create_vendor", { ...NEW_VENDOR, assignee: 7 });
    expect(mockCreateVendor.mock.calls[0][0]).toMatchObject({ assignee: 7 });
  });

  it("names the console's required fields that are missing", async () => {
    const result = await call("agent_create_vendor", { vendor_name: "Model host" });
    expect(result.message).toBe(
      "Vendor was not created: description, website, contact_person required",
    );
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("requires the same fields in its schema", () => {
    expect(schemaOf("agent_create_vendor").required).toEqual([
      "vendor_name",
      "description",
      "website",
      "contact_person",
    ]);
  });

  it("refuses an invalid enum value before asking for approval", async () => {
    const result = await call("agent_create_vendor", { ...NEW_VENDOR, review_status: "Done" });
    expect(result.success).toBe(false);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it.each([
    new ValidationException("The vendor assignee must be a member of this organization"),
    new BusinessLogicException("Demo vendors cannot be modified"),
  ])("answers a rejected write with its reason: %s", async (error) => {
    mockCreateVendor.mockRejectedValue(error);
    const result = await run("agent_create_vendor", { ...NEW_VENDOR, assignee: 99 });
    expect(result).toEqual({
      success: false,
      message: `Vendor was not created: ${error.message}`,
    });
  });

  it("lets an unexpected failure through to the gateway", async () => {
    mockCreateVendor.mockRejectedValue(new Error("connection lost"));
    await expect(run("agent_create_vendor", NEW_VENDOR)).rejects.toThrow("connection lost");
  });
});

describe("agent_update_vendor and agent_flag_vendor_for_review", () => {
  it("updates only the fields sent", async () => {
    await run("agent_update_vendor", { vendor_id: 1, contact_person: "Grace Hopper" });
    expect(mockUpdateVendor).toHaveBeenCalledWith(
      1,
      { vendor_contact_person: "Grace Hopper" },
      { userId: REQUESTER, role: "Editor", organizationId: ORG },
    );
  });

  it("ignores an assignee on update: the schema and the approval card don't offer it", async () => {
    await run("agent_update_vendor", { vendor_id: 1, website: "https://a.b", assignee: 12 });
    expect(mockUpdateVendor.mock.calls[0][1]).toEqual({ website: "https://a.b" });
  });

  it("refuses an update with no fields", async () => {
    const result = await call("agent_update_vendor", { vendor_id: 1 });
    expect(result).toEqual({ success: false, message: "No fields to update" });
  });

  it("refuses a vendor outside the organization", async () => {
    mockVendorById.mockResolvedValue(null);
    const result = await run("agent_update_vendor", { vendor_id: 1, website: "https://a.b" });
    expect(result).toEqual({ success: false, message: "Vendor #1 not found" });
    expect(mockUpdateVendor).not.toHaveBeenCalled();
  });

  it("flags through the same update, with the reason as the review result", async () => {
    const result = await run("agent_flag_vendor_for_review", { vendor_id: 1, reason: "Lapsed" });
    expect(result.success).toBe(true);
    expect(mockUpdateVendor).toHaveBeenCalledWith(
      1,
      { review_status: "Requires follow-up", review_result: "Lapsed" },
      expect.objectContaining({ userId: REQUESTER }),
    );
  });

  it("refuses a reason longer than the console allows", async () => {
    const result = await call("agent_flag_vendor_for_review", {
      vendor_id: 1,
      reason: "x".repeat(256),
    });
    expect(result.success).toBe(false);
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});

describe("vendor risk tools", () => {
  it("creates with the name and details, defaulting severity and likelihood", async () => {
    await run("agent_create_vendor_risk", {
      vendor_id: 1,
      risk_name: "Outage",
      risk_description: "No failover region",
    });
    expect(mockCreateRisk).toHaveBeenCalledWith(
      {
        vendor_id: 1,
        risk_description: "Outage: No failover region",
        impact_description: "No failover region",
        risk_severity: "Moderate",
        likelihood: "Possible",
      },
      { userId: REQUESTER, role: "Editor", organizationId: ORG },
    );
  });

  it("refuses a risk for a vendor outside the organization", async () => {
    mockVendorById.mockResolvedValue(null);
    const result = await call("agent_create_vendor_risk", { vendor_id: 1, risk_name: "Outage" });
    expect(result.message).toBe("Vendor risk was not created: vendor #1 not found");
  });

  it("takes the action owner as a user id", async () => {
    await run("agent_update_vendor_risk", { vendor_risk_id: 2, action_owner: "7" });
    expect(mockUpdateRisk).toHaveBeenCalledWith(
      2,
      { action_owner: 7 },
      expect.objectContaining({ userId: REQUESTER }),
    );
    expect(schemaOf("agent_update_vendor_risk").properties.action_owner.type).toBe("number");
  });

  it("refuses an action owner that is not a user id", async () => {
    const result = await call("agent_update_vendor_risk", {
      vendor_risk_id: 2,
      action_owner: "Ada",
    });
    expect(result.success).toBe(false);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("refuses a deleted or unknown vendor risk", async () => {
    mockRiskById.mockResolvedValue(null);
    const result = await run("agent_delete_vendor_risk", { vendor_risk_id: 2 });
    expect(result).toEqual({ success: false, message: "Vendor risk #2 not found" });
    expect(mockDeleteRisk).not.toHaveBeenCalled();
  });

  it("deletes through the vendor risk service", async () => {
    const result = await run("agent_delete_vendor_risk", { vendor_risk_id: 2 });
    expect(result).toEqual({ success: true, deleted: true, vendor_risk_id: 2 });
    expect(mockDeleteRisk).toHaveBeenCalledWith(2, {
      userId: REQUESTER,
      role: "Editor",
      organizationId: ORG,
    });
  });
});
