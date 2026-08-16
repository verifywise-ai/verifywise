import {
  listApprovalRules,
  createApprovalRule,
  updateApprovalRule,
  deleteApprovalRule,
  testApprovalRule,
  type ApprovalRule,
} from "../aiApprovalRules.repository";
import { apiServices } from "../../../infrastructure/api/networkServices";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const rulePartial: Partial<ApprovalRule> = {
  name: "Auto reject risky vendors",
  event_type: "auto-reject",
};

describe("aiApprovalRules.repository", () => {
  describe("listApprovalRules", () => {
    it("makes a get request and returns the nested data array", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [{ id: 1 }] } });

      const result = await listApprovalRules();

      expect(apiServices.get).toHaveBeenCalledWith("/ai-approval-rules");
      expect(result).toEqual([{ id: 1 }]);
    });

    it("falls back to response.data when data.data is absent", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: [{ id: 2 }] });

      const result = await listApprovalRules();

      expect(result).toEqual([{ id: 2 }]);
    });

    it("falls back to an empty array when no data is present", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: undefined });

      const result = await listApprovalRules();

      expect(result).toEqual([]);
    });
  });

  describe("createApprovalRule", () => {
    it("makes a post request with the rule payload", async () => {
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { id: 1, ...rulePartial } } });

      const result = await createApprovalRule(rulePartial);

      expect(apiServices.post).toHaveBeenCalledWith("/ai-approval-rules", rulePartial);
      expect(result).toEqual({ id: 1, ...rulePartial });
    });
  });

  describe("updateApprovalRule", () => {
    it("makes a put request scoped to the rule id", async () => {
      vi.mocked(apiServices.put).mockResolvedValue({ data: { data: { id: 5, ...rulePartial } } });

      const result = await updateApprovalRule(5, rulePartial);

      expect(apiServices.put).toHaveBeenCalledWith("/ai-approval-rules/5", rulePartial);
      expect(result).toEqual({ id: 5, ...rulePartial });
    });
  });

  describe("deleteApprovalRule", () => {
    it("makes a delete request scoped to the rule id", async () => {
      vi.mocked(apiServices.delete).mockResolvedValue({ data: undefined });

      await deleteApprovalRule(7);

      expect(apiServices.delete).toHaveBeenCalledWith("/ai-approval-rules/7");
    });
  });

  describe("testApprovalRule", () => {
    it("makes a post request with rule and facts and returns the evaluation result", async () => {
      const facts = { risk_score: 80 };
      const evaluation = { matched: true, decision: "auto-reject", evaluatedFacts: facts };
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: evaluation } });

      const result = await testApprovalRule(rulePartial, facts);

      expect(apiServices.post).toHaveBeenCalledWith("/ai-approval-rules/test", {
        rule: rulePartial,
        facts,
      });
      expect(result).toEqual(evaluation);
    });
  });
});
