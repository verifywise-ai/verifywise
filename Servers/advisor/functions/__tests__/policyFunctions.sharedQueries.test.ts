/**
 * The advisor's policy create and update run the same queries as the REST
 * editor (createPolicyQuery, updatePolicyByIdQuery). These tests use the real
 * queries against a mocked database, so they check the SQL that is sent: an
 * empty tag list binds as JSON (ARRAY[] has no type and failed, P-M8) and the
 * policy_added / policy_updated automations are looked up.
 */
const mockTx = { commit: jest.fn(), rollback: jest.fn() };
jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn(async () => mockTx) },
}));
jest.mock("../../../config/changeHistory.config", () => ({
  runInSavepoint: jest.fn(async (work: () => Promise<unknown>) => work()),
}));
jest.mock("../../../utils/changeHistory.base.utils", () => ({
  recordEntityDeletion: jest.fn(),
  recordUpdateChanges: jest.fn(),
}));
jest.mock("../../../utils/policyChangeHistory.utils", () => ({ recordPolicyCreation: jest.fn() }));
jest.mock("../../../utils/customField.utils", () => ({
  deleteAllCustomFieldValuesForEntityQuery: jest.fn(),
  fetchCustomFieldsForEntities: jest.fn(),
}));
jest.mock("../../../utils/policyTemplate.utils", () => ({ getPolicyTemplatesQuery: jest.fn() }));
jest.mock("../../approval/approvalGateway", () => ({ submitForApproval: jest.fn() }));
jest.mock("../../../services/policies/policyApproval.service", () => ({
  approvePolicyDirectly: jest.fn(),
  assertPolicyDirectApprovalPossible: jest.fn(),
  getPolicyApprovalState: jest.fn(),
  rejectPendingPolicyRequestOnDelete: jest.fn(),
  submitPolicyForApproval: jest.fn(),
}));
jest.mock("../../../utils/organizationMember.utils", () => ({
  getUserOrganizationsQuery: jest.fn(),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { sequelize } from "../../../database/db";
import { writeToolExecutors } from "../../confirmation/createWriteTool";
import { recordPolicyCreation } from "../../../utils/policyChangeHistory.utils";
import { recordUpdateChanges } from "../../../utils/changeHistory.base.utils";
import "../policyFunctions";

const q = sequelize.query as jest.Mock;
const exec = (name: string) => writeToolExecutors.get(name)!;
const sqlOf = (call: unknown[]) => String(call[0]);

const STORED = {
  id: 1,
  title: "P",
  status: "Draft",
  content_html: "<p>v1</p>",
  tags: ["Privacy"],
  policy_owner_id: null,
  assigned_reviewer_ids: [],
};

/** Answers each statement by its SQL: the policy read, automations, writes. */
const answerBySql = () =>
  q.mockImplementation(async (sql: string) => {
    if (sql.includes("INSERT INTO policy_manager AS pm")) return [[{ id: 5, title: "P" }], 1];
    if (sql.includes("FROM automation_triggers")) return [[], 0];
    if (sql.includes("FROM policy_manager pm") && sql.includes("ARRAY_AGG")) return [STORED];
    return [[], 0];
  });

beforeEach(() => {
  jest.clearAllMocks();
  q.mockReset();
});

describe("agent_create_policy through createPolicyQuery", () => {
  it.each([
    ["an empty tag list", []],
    ["no tags", undefined],
  ])("creates with %s, stored as an empty jsonb-bound list", async (_label, tags) => {
    answerBySql();
    const result = await exec("agent_create_policy")(
      { policy_name: "P", ...(tags ? { tags } : {}), _userId: 9 },
      42,
    );
    expect(result).toEqual(expect.objectContaining({ id: 5 }));
    const insert = q.mock.calls.find((c) => sqlOf(c).includes("INSERT INTO policy_manager AS pm"))!;
    expect(sqlOf(insert)).toContain("jsonb_array_elements_text(CAST(:tags AS jsonb))");
    expect(sqlOf(insert)).not.toContain("ARRAY[:tags]");
    expect(insert[1].replacements).toEqual(
      expect.objectContaining({ organization_id: 42, tags: "[]", author_id: 9, status: "Draft" }),
    );
    expect(insert[1].transaction).toBe(mockTx);
    // The policy_added automation is looked up, org-scoped, as for the REST create.
    const automation = q.mock.calls.find((c) => sqlOf(c).includes("pat.key = 'policy_added'"))!;
    expect(automation[1].replacements).toEqual({ organizationId: 42 });
    expect(recordPolicyCreation).toHaveBeenCalledWith(
      5,
      9,
      42,
      expect.objectContaining({ title: "P" }),
      mockTx,
    );
    expect(mockTx.commit).toHaveBeenCalled();
  });

  it("binds a tag list as JSON", async () => {
    answerBySql();
    await exec("agent_create_policy")(
      { policy_name: "P", tags: ["Privacy", "Audit"], _userId: 9 },
      42,
    );
    const insert = q.mock.calls.find((c) => sqlOf(c).includes("INSERT INTO policy_manager AS pm"))!;
    expect(insert[1].replacements.tags).toBe(JSON.stringify(["Privacy", "Audit"]));
  });
});

describe("agent_update_policy through updatePolicyByIdQuery", () => {
  it("writes tags in the jsonb form, org-scoped, and records the field history", async () => {
    answerBySql();
    await exec("agent_update_policy")({ policy_id: 1, tags: ["Audit"], _userId: 9 }, 42);
    const update = q.mock.calls.find((c) => sqlOf(c).startsWith("UPDATE policy_manager"))!;
    expect(sqlOf(update)).toContain(
      "tags = ARRAY(SELECT jsonb_array_elements_text(CAST(:tags AS jsonb)))",
    );
    expect(sqlOf(update)).not.toContain("ARRAY[:tags]");
    expect(sqlOf(update)).toContain("WHERE organization_id = :organizationId AND id = :id");
    expect(update[1].replacements).toEqual(
      expect.objectContaining({ organizationId: 42, id: 1, tags: '["Audit"]', last_updated_by: 9 }),
    );
    expect(update[1].transaction).toBe(mockTx);
    expect(q.mock.calls.some((c) => sqlOf(c).includes("pat.key = 'policy_updated'"))).toBe(true);
    expect(recordUpdateChanges).toHaveBeenCalledWith(
      "policy",
      1,
      STORED,
      { tags: ["Audit"], last_updated_by: 9 },
      9,
      42,
      mockTx,
    );
    expect(mockTx.commit).toHaveBeenCalled();
  });

  it("writes an empty tag list", async () => {
    answerBySql();
    await exec("agent_update_policy")({ policy_id: 1, tags: [], _userId: 9 }, 42);
    const update = q.mock.calls.find((c) => sqlOf(c).startsWith("UPDATE policy_manager"))!;
    expect(update[1].replacements.tags).toBe("[]");
    expect(mockTx.commit).toHaveBeenCalled();
  });
});
