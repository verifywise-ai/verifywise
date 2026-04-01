import { PolicyInput } from "src/domain/interfaces/i.policy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import { APIError } from "../../tools/error";
import {
  createPolicy,
  deletePolicy,
  getAllPolicies,
  getAllTags,
  getPolicyById,
  updatePolicy,
} from "../policy.repository";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockPolicy = {
  id: 1,
  name: "Data Protection Policy",
  description: "Policy for data protection compliance",
  category: "compliance",
  version: "1.0.0",
  status: "active",
  tags: ["gdpr", "data-protection"],
  createdAt: "2026-03-12T00:00:00Z",
  updatedAt: "2026-03-12T00:00:00Z",
};

const mockPolicies = [
  mockPolicy,
  {
    id: 2,
    name: "Information Security Policy",
    description: "Policy for information security",
    category: "security",
    version: "2.1.0",
    status: "active",
    tags: ["security", "iso-27001"],
    createdAt: "2026-03-11T00:00:00Z",
    updatedAt: "2026-03-11T00:00:00Z",
  },
];

const mockTags = [
  "gdpr",
  "ccpa",
  "hipaa",
  "iso-27001",
  "data-protection",
  "security",
];

const mockPolicyInput: PolicyInput = {
  title: "New Policy",
  content_html: "<p>This is a new policy.</p>",
  status: "draft",
  assigned_reviewer_ids: [1, 2],
  tags: ["new", "draft"],
};

describe("policy.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getAllPolicies", () => {
    it("should fetch all policies successfully", async () => {
      const response = { data: { message: "Success", data: mockPolicies } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllPolicies();

      expect(apiServices.get).toHaveBeenCalledWith("/policies");
      expect(result).toEqual(mockPolicies);
      expect(result).toHaveLength(2);
    });

    it("should return empty array when no policies exist", async () => {
      const response = { data: { message: "Success", data: [] } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllPolicies();

      expect(result).toEqual([]);
    });

    it("should handle API errors", async () => {
      const error = {
        response: { status: 500, data: { message: "Internal Server Error" } },
        message: "Network Error",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getAllPolicies()).rejects.toThrow(expect.any(APIError));
    });

    it("should throw APIError with 404 status", async () => {
      const error = {
        response: { status: 404, data: { message: "Not found" } },
        message: "Not Found",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      try {
        await getAllPolicies();
        expect.fail("Should have thrown APIError");
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        expect((err as APIError).message).toBe("Failed to fetch policies");
      }
    });

    it("should throw APIError with 403 status", async () => {
      const error = {
        response: { status: 403, data: { message: "Forbidden" } },
        message: "Forbidden",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      try {
        await getAllPolicies();
        expect.fail("Should have thrown APIError");
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
      }
    });
  });

  describe("getAllTags", () => {
    it("should fetch all tags successfully", async () => {
      const response = { data: { message: "Success", data: mockTags } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllTags();

      expect(apiServices.get).toHaveBeenCalledWith("/policies/tags");
      expect(result).toEqual(mockTags);
      expect(result).toHaveLength(6);
    });

    it("should return empty array when no tags exist", async () => {
      const response = { data: { message: "Success", data: [] } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getAllTags();

      expect(result).toEqual([]);
    });

    it("should handle API errors when fetching tags", async () => {
      const error = {
        response: { status: 500, data: { message: "Internal Server Error" } },
        message: "Network Error",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      try {
        await getAllTags();
        expect.fail("Should have thrown APIError");
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        expect((err as APIError).message).toBe("Failed to fetch tags");
      }
    });

    it("should throw APIError with 503 status", async () => {
      const error = {
        response: { status: 503, data: { message: "Service Unavailable" } },
        message: "Service Unavailable",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      try {
        await getAllTags();
        expect.fail("Should have thrown APIError");
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
      }
    });
  });

  describe("getPolicyById", () => {
    it("should fetch policy by ID when response is single object", async () => {
      const response = { data: { message: "Success", data: mockPolicy } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getPolicyById("1");

      expect(apiServices.get).toHaveBeenCalledWith("/policies/1");
      expect(result).toEqual(mockPolicy);
    });

    it("should fetch policy by ID when response is array and return first element", async () => {
      const response = { data: { message: "Success", data: [mockPolicy] } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getPolicyById("1");

      expect(apiServices.get).toHaveBeenCalledWith("/policies/1");
      expect(result).toEqual(mockPolicy);
    });

    it("should return first policy from array when multiple records returned", async () => {
      const response = { data: { message: "Success", data: mockPolicies } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getPolicyById("1");

      expect(result).toEqual(mockPolicies[0]);
    });

    it("should handle API errors when fetching policy by ID", async () => {
      const error = {
        response: { status: 500, data: { message: "Internal Server Error" } },
        message: "Server Error",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      try {
        await getPolicyById("1");
        expect.fail("Should have thrown APIError");
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        expect((err as APIError).message).toContain(
          "Failed to fetch policy with ID 1",
        );
      }
    });

    it("should throw APIError with 404 status for missing policy", async () => {
      const error = {
        response: { status: 404, data: { message: "Policy not found" } },
        message: "Not Found",
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      try {
        await getPolicyById("999");
        expect.fail("Should have thrown APIError");
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        expect((err as APIError).message).toContain(
          "Failed to fetch policy with ID 999",
        );
      }
    });

    it("should handle empty array response safely", async () => {
      const response = { data: { message: "Success", data: [] } };
      vi.mocked(apiServices.get).mockResolvedValue(response as any);

      const result = await getPolicyById("1");

      // Array.isArray([]) is true, so data[0] returns undefined
      expect(result).toBeUndefined();
    });
  });

  describe("createPolicy", () => {
    it("should create policy successfully", async () => {
      const response = {
        data: { message: "Policy created", data: mockPolicy },
      };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const result = await createPolicy(mockPolicyInput);

      expect(apiServices.post).toHaveBeenCalledWith(
        "/policies",
        mockPolicyInput,
      );
      expect(result).toEqual(mockPolicy);
    });

    it("should pass policy input to API", async () => {
      const response = { data: { message: "Success", data: mockPolicy } };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const input: PolicyInput = {
        title: "Custom Policy",
        content_html: "A custom policy",
        status: "draft",
        assigned_reviewer_ids: [3],
        tags: ["custom"],
      };
      await createPolicy(input);

      expect(apiServices.post).toHaveBeenCalledWith("/policies", input);
    });

    it("should handle API errors when creating policy", async () => {
      const error = {
        response: { status: 500, data: { message: "Internal Server Error" } },
        message: "Server Error",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      try {
        await createPolicy(mockPolicyInput);
        expect.fail("Should have thrown APIError");
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        expect((err as APIError).message).toBe("Failed to create policy");
      }
    });

    it("should throw APIError with 422 validation error", async () => {
      const error = {
        response: { status: 422, data: { message: "Validation failed" } },
        message: "Unprocessable Entity",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      try {
        await createPolicy(mockPolicyInput);
        expect.fail("Should have thrown APIError");
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
      }
    });

    it("should throw APIError with 409 conflict error", async () => {
      const error = {
        response: { status: 409, data: { message: "Policy already exists" } },
        message: "Conflict",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      try {
        await createPolicy(mockPolicyInput);
        expect.fail("Should have thrown APIError");
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
      }
    });
  });

  describe("updatePolicy", () => {
    it("should update policy successfully", async () => {
      const updatedPolicy = { ...mockPolicy, name: "Updated Policy" };
      const response = {
        data: { message: "Policy updated", data: updatedPolicy },
      };
      vi.mocked(apiServices.put).mockResolvedValue(response as any);

      const result = await updatePolicy(1, mockPolicyInput);

      expect(apiServices.put).toHaveBeenCalledWith(
        "/policies/1",
        mockPolicyInput,
      );
      expect(result).toEqual(updatedPolicy);
    });

    it("should pass correct policy ID and input to API", async () => {
      const response = { data: { message: "Success", data: mockPolicy } };
      vi.mocked(apiServices.put).mockResolvedValue(response as any);

      const input: PolicyInput = {
        title: "Another Policy",
        content_html: "Another policy content",
        status: "active",
        assigned_reviewer_ids: [4],
        tags: ["another"],
      };
      await updatePolicy(5, input);

      expect(apiServices.put).toHaveBeenCalledWith("/policies/5", input);
    });

    it("should handle API errors when updating policy", async () => {
      const error = {
        response: { status: 500, data: { message: "Internal Server Error" } },
        message: "Server Error",
      };
      vi.mocked(apiServices.put).mockRejectedValue(error);

      try {
        await updatePolicy(1, mockPolicyInput);
        expect.fail("Should have thrown APIError");
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        expect((err as APIError).message).toContain(
          "Failed to update policy with ID 1",
        );
      }
    });

    it("should throw APIError with 404 status for missing policy", async () => {
      const error = {
        response: { status: 404, data: { message: "Policy not found" } },
        message: "Not Found",
      };
      vi.mocked(apiServices.put).mockRejectedValue(error);

      try {
        await updatePolicy(999, mockPolicyInput);
        expect.fail("Should have thrown APIError");
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        expect((err as APIError).message).toContain(
          "Failed to update policy with ID 999",
        );
      }
    });

    it("should throw APIError with 403 forbidden error", async () => {
      const error = {
        response: { status: 403, data: { message: "Forbidden" } },
        message: "Forbidden",
      };
      vi.mocked(apiServices.put).mockRejectedValue(error);

      try {
        await updatePolicy(1, mockPolicyInput);
        expect.fail("Should have thrown APIError");
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
      }
    });

    it("should throw APIError with 422 validation error on update", async () => {
      const error = {
        response: { status: 422, data: { message: "Invalid data" } },
        message: "Unprocessable Entity",
      };
      vi.mocked(apiServices.put).mockRejectedValue(error);

      try {
        await updatePolicy(1, mockPolicyInput);
        expect.fail("Should have thrown APIError");
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
      }
    });
  });

  describe("deletePolicy", () => {
    it("should delete policy successfully", async () => {
      vi.mocked(apiServices.delete).mockResolvedValue({ data: {} } as any);

      await deletePolicy(1);

      expect(apiServices.delete).toHaveBeenCalledWith("/policies/1");
    });

    it("should handle deletion with different policy IDs", async () => {
      vi.mocked(apiServices.delete).mockResolvedValue({ data: {} } as any);

      await deletePolicy(5);

      expect(apiServices.delete).toHaveBeenCalledWith("/policies/5");
    });

    it("should handle API errors when deleting policy", async () => {
      const error = {
        response: { status: 500, data: { message: "Internal Server Error" } },
        message: "Server Error",
      };
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      try {
        await deletePolicy(1);
        expect.fail("Should have thrown APIError");
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        expect((err as APIError).message).toContain(
          "Failed to delete policy with ID 1",
        );
      }
    });

    it("should throw APIError with 404 status when policy not found", async () => {
      const error = {
        response: { status: 404, data: { message: "Policy not found" } },
        message: "Not Found",
      };
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      try {
        await deletePolicy(999);
        expect.fail("Should have thrown APIError");
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
        expect((err as APIError).message).toContain(
          "Failed to delete policy with ID 999",
        );
      }
    });

    it("should throw APIError with 403 forbidden error on delete", async () => {
      const error = {
        response: { status: 403, data: { message: "Forbidden" } },
        message: "Forbidden",
      };
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      try {
        await deletePolicy(1);
        expect.fail("Should have thrown APIError");
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
      }
    });

    it("should throw APIError with 409 conflict error", async () => {
      const error = {
        response: { status: 409, data: { message: "Policy in use" } },
        message: "Conflict",
      };
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      try {
        await deletePolicy(1);
        expect.fail("Should have thrown APIError");
      } catch (err) {
        expect(err).toBeInstanceOf(APIError);
      }
    });
  });
});
