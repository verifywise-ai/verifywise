import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// The executors run the real vendor queries, so the member check they share
// with the console is what is tested here; only the database is replaced.
const mockQuery = jest.fn(async (..._args: any[]): Promise<any> => []);
const transaction = { commit: jest.fn(), rollback: jest.fn() };
jest.mock("../../../database/db", () => ({
  sequelize: {
    query: (...args: any[]) => mockQuery(...args),
    transaction: jest.fn(async () => transaction),
  },
}));
jest.mock("../../../utils/fileUpload.utils", () => ({ deleteFileById: jest.fn() }));
jest.mock("../../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../../../utils/project.utils", () => ({
  getUserProjects: jest.fn(),
  updateProjectUpdatedByIdQuery: jest.fn(),
}));

import { ValidationException } from "../../../domain.layer/exceptions/custom.exception";
import { availableVendorTools } from "../../functions/vendorFunctions";
import { writeToolExecutors } from "../../confirmation/createWriteTool";

const ORG_ID = 4;
const MEMBER = 5;
const OUTSIDER = 9;
const STORED_RISK_OWNER = 11;

const sqlOf = (call: any[]) => String(call[0]).replace(/\s+/g, " ");
const writes = () =>
  mockQuery.mock.calls.filter((c) => /^\s*(INSERT INTO vendors|UPDATE vendor)/i.test(sqlOf(c)));

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockImplementation(async (sql: any, options: any) => {
    const text = String(sql);
    if (text.includes("FROM organization_members")) {
      return (options?.replacements?.userIds ?? [])
        .filter((id: number) => id === MEMBER)
        .map((id: number) => ({ id }));
    }
    if (text.includes("SELECT action_owner, likelihood, risk_severity FROM vendorrisks")) {
      return [
        { action_owner: STORED_RISK_OWNER, likelihood: "Possible", risk_severity: "Moderate" },
      ];
    }
    if (/INSERT INTO vendors /.test(text)) return [{ id: 1, vendor_name: "Model host" }];
    if (/UPDATE vendorrisks SET/.test(text)) return [{ id: 2, vendor_id: 1 }];
    if (/UPDATE vendors SET/.test(text)) return [{ id: 1, vendor_name: "Model host" }];
    if (text.includes("FROM automation_triggers")) return [[], 0];
    return [];
  });
});

// Importing vendorFunctions registers the executors; the reference keeps the
// import from being elided.
void availableVendorTools;

describe("agent_create_vendor executor", () => {
  const execute = writeToolExecutors.get("agent_create_vendor")!;
  const params = (assignee: number) => ({
    vendor_name: "Model host",
    description: "Hosted language models",
    assignee,
  });

  it("creates a vendor assigned to a member", async () => {
    await expect(execute(params(MEMBER), ORG_ID)).resolves.toMatchObject({ id: 1 });
    expect(writes()).toHaveLength(1);
    expect(transaction.commit).toHaveBeenCalled();
  });

  it("refuses another organization's user as assignee and writes nothing", async () => {
    const error = await execute(params(OUTSIDER), ORG_ID).catch((e) => e);

    expect(error).toBeInstanceOf(ValidationException);
    expect(error.message).toBe("The vendor assignee must be a member of this organization");
    expect(writes()).toHaveLength(0);
    expect(transaction.rollback).toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
  });
});

describe("agent_update_vendor executor", () => {
  it("does not touch assignee or reviewer, so no member check runs", async () => {
    await writeToolExecutors.get("agent_update_vendor")!(
      { vendor_id: 1, review_status: "In review" },
      ORG_ID,
    );

    const memberChecks = mockQuery.mock.calls.filter((c) =>
      sqlOf(c).includes("FROM organization_members"),
    );
    expect(memberChecks).toHaveLength(0);
    expect(transaction.commit).toHaveBeenCalled();
  });
});

describe("agent_update_vendor_risk executor", () => {
  const execute = writeToolExecutors.get("agent_update_vendor_risk")!;

  it("refuses another organization's user as action owner, inside the transaction", async () => {
    const error = await execute({ vendor_risk_id: 2, action_owner: OUTSIDER }, ORG_ID).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ValidationException);
    expect(error.message).toBe("The action owner must be a member of this organization");
    const memberCheck = mockQuery.mock.calls.find((c) =>
      sqlOf(c).includes("FROM organization_members"),
    ) as any[];
    expect(memberCheck[1]).toMatchObject({ transaction });
    expect(writes()).toHaveLength(0);
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it("accepts a member as the new action owner", async () => {
    await expect(execute({ vendor_risk_id: 2, action_owner: MEMBER }, ORG_ID)).resolves.toEqual({
      id: 2,
      vendor_id: 1,
    });
    expect(writes()).toHaveLength(1);
  });

  it("keeps a stored action owner who has since left the organization", async () => {
    await expect(
      execute({ vendor_risk_id: 2, action_owner: STORED_RISK_OWNER, action_plan: "Q1" }, ORG_ID),
    ).resolves.toEqual({ id: 2, vendor_id: 1 });
    expect(writes()).toHaveLength(1);
  });
});
